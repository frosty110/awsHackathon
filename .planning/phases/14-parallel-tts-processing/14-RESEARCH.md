# Phase 14: Parallel TTS Processing - Research

**Researched:** 2026-02-21
**Domain:** TypeScript async concurrency — `Promise.allSettled` fan-out with per-item fallback logic
**Confidence:** HIGH

## Summary

Phase 14 is a surgical refactor of a single function: `generateMultiVoiceTTS` in `server/src/services/tts.ts`. The current implementation runs a sequential `for`/`await` loop over voice segments, meaning 7 segments each taking 1-3s accumulate to ~15s total. The segments are fully independent (no ordering constraints on API calls, only on the final concatenated buffer) and can be parallelised with `Promise.allSettled`.

The core semantic challenge is preserving the existing per-segment fallback logic: if a non-narrator voice fails, that segment retries with narrator voice; if the narrator itself fails, the error is rethrown (terminal). This fallback must happen *inside* the per-segment promise before `Promise.allSettled` sees the result — i.e., each element of the settled array must be either a resolved buffer or a propagated narrator failure. The final buffer ordering is determined by the original segment index order, not by completion order.

No new libraries are needed. No config changes. No interface changes. The only file touched is `server/src/services/tts.ts`, and the public API (`generateMultiVoiceTTS` signature and return type) is unchanged. The L1/L2 cache behaviour inside `generateTTS` is fully preserved because parallelism happens at the `generateMultiVoiceTTS` layer — each call to `generateTTS` is unchanged.

**Primary recommendation:** Replace the `for`/`await` loop in `generateMultiVoiceTTS` with a `Promise.allSettled` fan-out where each element is a self-contained async closure that handles its own fallback, then collect results in index order and rethrow any settled rejection.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `Promise.allSettled` | ES2020 / Node 12+ | Fan-out N promises, collect all results regardless of failure | Available on Node 23 (this project), no install required |
| TypeScript | ^5.0.0 (project-pinned) | Type safety for settled result discrimination | Already in use |
| Vitest | ^2.0.0 (project-pinned) | Unit tests for the refactored function | Already in use |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Promise.all` | ES6 | Fan-out when *any* failure should abort all | NOT appropriate here — we need per-segment fallback before escalation |
| `p-queue` | ^9.1.0 (project-pinned) | Concurrency-limited fan-out | Not needed — MiniMax has no documented concurrency cap that would require queuing at the segment level; `p-queue` is already used for Bedrock, not TTS |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Promise.allSettled` | `Promise.all` | `Promise.all` fails fast on first rejection — cannot do per-segment fallback before the outer promise rejects |
| `Promise.allSettled` | Manual `Promise.race` + tracking | More complex, no benefit |
| Inline fallback closure | Separate helper function | Helper is cleaner but both work; inline closure avoids extra export surface |

**Installation:** No new packages required.

---

## Architecture Patterns

### Pattern 1: Fan-out with Per-Item Fallback Using `Promise.allSettled`

**What:** Each segment is wrapped in an async closure that handles its own failure. `Promise.allSettled` launches all N closures concurrently and waits for the slowest one. Results are collected in the original index order.

**When to use:** When items are independent, failures are recoverable per-item (not globally), and final output requires original ordering.

**Example:**

```typescript
// Source: MDN Promise.allSettled + direct codebase analysis
export async function generateMultiVoiceTTS(
  text: string,
  options: Omit<TTSOptions, "voice"> = {}
): Promise<TTSResult> {
  const [mood, cleanText] = extractMood(text);
  const segments = splitVoiceSegments(cleanText);
  const effectiveMood = options.mood ?? mood ?? undefined;

  // Fan-out: each segment runs concurrently; fallback is self-contained per segment.
  const settled = await Promise.allSettled(
    segments.map(async (segment) => {
      try {
        return await generateTTS(segment.text, {
          ...options,
          mood: effectiveMood,
          voice: segment.voice,
        });
      } catch (err) {
        if (segment.voice !== "narrator") {
          // Non-narrator failure: retry as narrator (fallback preserved)
          logEvent("warn", "tts.voice_fallback", {
            failedVoice: segment.voice,
            voiceId: VOICE_MAP[segment.voice],
            error: String(err),
          });
          return await generateTTS(segment.text, {
            ...options,
            mood: effectiveMood,
            voice: "narrator",
          });
        }
        // Narrator failure is terminal — rethrow so allSettled marks as rejected
        throw err;
      }
    })
  );

  // Collect results in order; rethrow first narrator failure.
  const buffers: Buffer[] = [];
  let totalDuration = 0;

  for (const result of settled) {
    if (result.status === "rejected") {
      // Only narrator failures reach here (non-narrator failures became narrator retries above).
      throw result.reason;
    }
    buffers.push(result.value.audioBuffer);
    totalDuration += result.value.durationMs;
  }

  return {
    audioBuffer: Buffer.concat(buffers),
    audioFormat: "mp3",
    durationMs: totalDuration,
  };
}
```

### Pattern 2: Settled Result Discrimination

**What:** TypeScript's `Promise.allSettled` returns `PromiseSettledResult<T>[]`. Each item is either `{ status: "fulfilled"; value: T }` or `{ status: "rejected"; reason: unknown }`. The `status` field narrows the type.

**When to use:** Any time you need to process both outcomes of a fan-out.

```typescript
// TypeScript narrows result.value / result.reason based on result.status
for (const result of settled) {
  if (result.status === "rejected") {
    throw result.reason; // result.reason is `unknown` — rethrow as-is
  }
  // result.status === "fulfilled" here — result.value is TTSResult
  buffers.push(result.value.audioBuffer);
}
```

### Anti-Patterns to Avoid

- **`Promise.all` at the outer level:** If the narrator voice fails on segment 3, `Promise.all` rejects immediately, leaving segments 1, 2, 4-7 still running in the background (dangling promises). More importantly, it prevents collecting the per-item fallback result before declaring failure.
- **Awaiting the narrator fallback outside the closure:** Moving the fallback retry to the post-`allSettled` collection loop means the retry happens *sequentially after all segments finish*, eliminating most of the latency benefit.
- **Changing the public function signature:** The route handlers in `narrate.ts` and all callers use `generateMultiVoiceTTS(text, options)` — the signature must remain identical.
- **Mutating shared state during fan-out:** The `buffers` array and `totalDuration` must only be populated *after* `Promise.allSettled` resolves, not inside the concurrent closures, to preserve ordering.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency fan-out | Custom Promise tracking loop | `Promise.allSettled` | Built-in, well-tested, correct semantics |
| Result ordering | Sort by completion timestamp | Collect settled array by index | `Promise.allSettled` preserves input order in output array — index N of settled corresponds to index N of the input array |

**Key insight:** `Promise.allSettled` preserves input ordering in its output array. You do NOT need timestamps, completion counters, or result maps — iterating `settled` in order gives you buffers in the correct concatenation order.

---

## Common Pitfalls

### Pitfall 1: Ordering Confusion

**What goes wrong:** Developer assumes the first settled promise corresponds to the first segment, but worries about race conditions.
**Why it happens:** `Promise.race` and streaming patterns do not preserve order; developers apply that mental model here.
**How to avoid:** `Promise.allSettled` (and `Promise.all`) ALWAYS return results in the same order as the input array, regardless of which promise resolves first. The settled array at index `i` is always the result of `segments[i]`. No sorting needed.
**Warning signs:** Code that sorts by timestamp, uses a results Map indexed by segment, or pushes to a shared array inside the concurrent closure.

### Pitfall 2: Fallback Retry Creating Serial Latency

**What goes wrong:** The narrator fallback retry is triggered *outside* the per-segment closure (e.g., in the collection loop after `allSettled`). This means narrator retries run sequentially and add latency.
**Why it happens:** Conceptually separating "run all segments" from "handle failures" — putting fallback in the wrong phase.
**How to avoid:** The try/catch and fallback retry MUST be inside the `.map()` closure, before the promise settles. That way the fallback runs concurrently with other segments' primary calls.
**Warning signs:** A try/catch in the `for (const result of settled)` loop that calls `generateTTS` with narrator voice.

### Pitfall 3: Narrator Failure Swallowed

**What goes wrong:** A non-narrator segment voice fails, the fallback also fails (narrator is down), but the outer code catches the second error and treats it as non-fatal.
**Why it happens:** Over-broad try/catch around the entire closure.
**How to avoid:** The inner try/catch must only catch the *first* attempt. The narrator fallback call (`generateTTS(..., voice: "narrator")`) must propagate its own errors without a wrapping catch. If the narrator fallback throws, `Promise.allSettled` marks that slot as `"rejected"`, and the collection loop rethrows it.
**Warning signs:** Double try/catch nesting where the inner catch catches both the original error and the retry error.

### Pitfall 4: Datadog Spans and Shared State in Concurrent Closures

**What goes wrong:** Developers assume tracer spans have process-global state that will conflict with concurrent calls.
**Why it happens:** Misunderstanding dd-trace's async context propagation.
**How to avoid:** dd-trace uses Node.js AsyncLocalStorage to scope spans per async call chain. Each call to `generateTTS` creates its own `tracer.llmobs.trace(...)` span. Concurrent calls create independent sibling spans — this is the expected and correct behaviour for parallel tool calls. No changes needed.
**Warning signs:** None — this is a non-issue, but worth knowing so the planner doesn't add an unnecessary "ensure spans don't conflict" task.

### Pitfall 5: L1 Cache Race Condition (Non-Issue)

**What goes wrong:** Developer worries that concurrent reads/writes to the in-memory `ttsCache` Map will corrupt state.
**Why it happens:** Node.js single-threaded event loop is sometimes misunderstood.
**How to avoid:** Node.js is single-threaded. The Map reads and writes inside `generateTTS` execute synchronously in the event loop — no two synchronous sections can interleave. The `await` points (S3 GetObject, MiniMax fetch) yield the loop but the Map mutation (after the await) is still atomic from the event loop's perspective. No locking needed.
**Warning signs:** Adding a mutex or lock around ttsCache operations.

---

## Code Examples

### Current Sequential Implementation (exact code to replace)

```typescript
// Current: server/src/services/tts.ts lines 282-309
for (const segment of segments) {
  try {
    const result = await generateTTS(segment.text, {
      ...options,
      mood: effectiveMood,
      voice: segment.voice,
    });
    buffers.push(result.audioBuffer);
    totalDuration += result.durationMs;
  } catch (err) {
    if (segment.voice !== "narrator") {
      logEvent("warn", "tts.voice_fallback", {
        failedVoice: segment.voice,
        voiceId: VOICE_MAP[segment.voice],
        error: String(err),
      });
      const fallback = await generateTTS(segment.text, {
        ...options,
        mood: effectiveMood,
        voice: "narrator",
      });
      buffers.push(fallback.audioBuffer);
      totalDuration += fallback.durationMs;
    } else {
      throw err; // narrator voice failing is unrecoverable
    }
  }
}
```

### Target Parallel Implementation

```typescript
// Source: MDN Promise.allSettled, verified against TypeScript 5.x PromiseSettledResult<T> types
const settled = await Promise.allSettled(
  segments.map(async (segment) => {
    try {
      return await generateTTS(segment.text, {
        ...options,
        mood: effectiveMood,
        voice: segment.voice,
      });
    } catch (err) {
      if (segment.voice !== "narrator") {
        logEvent("warn", "tts.voice_fallback", {
          failedVoice: segment.voice,
          voiceId: VOICE_MAP[segment.voice],
          error: String(err),
        });
        // Fallback also runs concurrently (within its own segment's timeline)
        return await generateTTS(segment.text, {
          ...options,
          mood: effectiveMood,
          voice: "narrator",
        });
      }
      throw err; // narrator failure propagates to allSettled as rejected
    }
  })
);

const buffers: Buffer[] = [];
let totalDuration = 0;

for (const result of settled) {
  if (result.status === "rejected") {
    throw result.reason;
  }
  buffers.push(result.value.audioBuffer);
  totalDuration += result.value.durationMs;
}
```

### Vitest Test Pattern for Concurrent TTS (matches existing test style)

```typescript
// Source: Existing test patterns in server/src/__tests__/services/
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The key test assertions for parallel behaviour:
// 1. All segment results appear in order regardless of which resolves first
// 2. Non-narrator failure triggers fallback, not rejection
// 3. Narrator failure propagates as thrown error
// 4. Cached segments (L1/L2) are not re-called (mock generateTTS to verify call count)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential `for`/`await` loop | `Promise.allSettled` fan-out | This phase | ~5x latency reduction (15s → 3s for 7 segments) |

**Note:** `Promise.allSettled` was introduced in ES2020 and is available in Node.js 12.9+. This project runs Node 23. No polyfills or compatibility concerns.

---

## Open Questions

1. **MiniMax API Rate Limits**
   - What we know: The existing code has no rate-limit handling for MiniMax calls. The phase description says 7 segments concurrently.
   - What's unclear: Whether MiniMax imposes a per-key concurrency limit or rate limit that would cause the parallel calls to fail in production.
   - Recommendation: Implement the parallelism as specified. If MiniMax rate-limits, the per-segment fallback will NOT help (the narrator retry will also be rate-limited). If this becomes an issue post-implementation, add `p-queue` with a low concurrency limit (e.g., 3) in front of the MiniMax call. Do not pre-emptively add queuing — the phase goal is to validate the latency improvement first.

2. **Timing Metrics / Observability**
   - What we know: The phase success criterion mentions a timing target (7 segments: 3-4s). There are no existing latency metrics emitted from `generateMultiVoiceTTS` itself.
   - What's unclear: Whether the planner should add a timing log statement to `generateMultiVoiceTTS` to verify the improvement.
   - Recommendation: Add a `Date.now()` start/end log around the `Promise.allSettled` call, emitting `tts.multi_voice_completed` with `segmentCount`, `durationMs`, and `parallelism: true`. This makes the success criterion observable without a full test environment.

---

## Sources

### Primary (HIGH confidence)

- MDN Web Docs — [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled): Confirms input-order preservation in output array, `PromiseSettledResult` shape, availability in ES2020/Node 12+.
- Direct codebase read — `server/src/services/tts.ts` (full file, 317 lines): Exact sequential loop at lines 282-309, fallback logic, VOICE_MAP, cache structure, dd-trace integration.
- Direct codebase read — `server/src/routes/narrate.ts`: Confirms `generateMultiVoiceTTS` call sites and that signature must remain unchanged.
- Direct codebase read — `packages/shared-types/src/text-utils.ts`: Confirms `splitVoiceSegments` returns `Array<{ voice: CharacterVoice; text: string }>` — the segment structure the parallel closure iterates.
- TypeScript 5.x type definitions: `Promise.allSettled` returns `Promise<PromiseSettledResult<T>[]>`; `PromiseSettledResult<T>` is `PromiseFulfilledResult<T> | PromiseRejectedResult`; `status` field narrows the union — standard TypeScript discriminated union discrimination applies.

### Secondary (MEDIUM confidence)

- Node.js 23 release notes and compatibility table: `Promise.allSettled` is a built-in with no version concerns on Node 23. Verified via MDN browser/Node compatibility table.

### Tertiary (LOW confidence)

- MiniMax TTS API rate limits: Not documented in the codebase and not publicly verified. Flagged in Open Questions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure built-in JavaScript, no new dependencies, verified against codebase and MDN
- Architecture: HIGH — the refactor pattern is well-understood; exact before/after code derived directly from reading the file
- Pitfalls: HIGH — ordering guarantee, fallback placement, and Node.js single-threaded Map safety are all verified facts, not speculation

**Research date:** 2026-02-21
**Valid until:** 2026-09-01 (stable ES2020 built-ins; no external dependency drift risk)
