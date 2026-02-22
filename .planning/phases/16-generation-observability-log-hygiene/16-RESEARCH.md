# Phase 16: Generation Observability & Log Hygiene - Research

**Researched:** 2026-02-21
**Domain:** Node.js structured logging patterns, poll-loop progress observability, startup log noise suppression
**Confidence:** HIGH — all findings are based on direct codebase inspection (no third-party libraries required)

---

## Summary

This phase is entirely internal to the existing codebase. No new dependencies are needed. The work divides cleanly into two orthogonal concerns: (1) adding progress logs inside long-running generation loops, and (2) suppressing repetitive startup warnings for optional services.

The video generator (`server/src/services/videoGenerator.ts`) runs a `while` loop that polls MiniMax up to 18 times (every 10s, max 180s) with zero log output between `video.task_submitted` and `video.generation_complete` or `video.generation_failed`. Inserting a `logEvent("info", "video.poll_progress", {...})` call at the top of each loop iteration — with attempt number, elapsed time, and current status — directly satisfies success criteria 1. The music generator (`server/src/services/musicService.ts`) has a single blocking `fetch` call (~55s) with no intermediate logging; a periodic timer using `setInterval` that emits at the 30s mark satisfies success criteria 2.

For log noise, `server/src/index.ts` calls `warnOnBlankConfig(["REDIS_URL"], ...)` and `warnOnBlankConfig(["JWT_SECRET"], ...)` at every startup. In dev mode these are always blank (by design). The existing `SKIP_NEO4J_CONNECTIVITY_CHECK=1` env var pattern is the established model: add `SKIP_OPTIONAL_SERVICE_WARNINGS=1` (or check `NODE_ENV === "development"`) to gate these two calls to `debug`-level output or skip them. Additionally, `redis.ts` emits its own `console.warn` when `REDIS_URL` is not set. Both sites must be updated together.

**Primary recommendation:** Add poll-attempt logging inline inside the `while` loop in `videoGenerator.ts`, add a 30s progress timer in `musicService.ts`, and gate the Redis/JWT startup warnings to `debug` level (or skip entirely) when `NODE_ENV === "development"` — no new libraries, no architectural changes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — existing only) | — | All changes use `logEvent` from `server/src/services/logger.ts` | Already the project's structured log emitter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | `setInterval` / `clearInterval` (Node.js built-in) for 30s music progress timer | No library needed for a single timed log |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `logEvent` inside poll loop | External polling progress library | Overkill — one line per iteration is sufficient |
| `NODE_ENV === "development"` check | New `SKIP_OPTIONAL_SERVICE_WARNINGS=1` env var | Env var is more explicit but adds surface area; NODE_ENV check is simpler and already used throughout the codebase |
| `setInterval` for music progress | Streaming API / WebSocket progress | Music generation is fire-and-forget background process; streaming progress is not needed |

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure
No structural changes. All edits are within existing files:
```
server/src/
├── services/
│   ├── videoGenerator.ts    # Add poll-progress log inside while loop
│   ├── musicService.ts      # Add 30s progress timer around fetch call
│   ├── redis.ts             # Gate startup warn to dev-only or debug level
│   └── logger.ts            # Optional: add "debug" level if needed
└── index.ts                 # Gate REDIS_URL + JWT_SECRET warnOnBlankConfig calls
```

### Pattern 1: Poll-attempt progress logging (video)
**What:** Emit a structured log at the top of each poll iteration with attempt count, elapsed time, and API status.
**When to use:** Any while-loop that blocks for many seconds with external status checks.
**Example:**
```typescript
// In server/src/services/videoGenerator.ts — inside runGeneration()
let pollAttempt = 0;
const maxAttempts = Math.floor(GENERATION_TIMEOUT_MS / POLL_INTERVAL_MS); // 18
const pollStart = Date.now();

while (Date.now() - pollStart < GENERATION_TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  pollAttempt++;

  const pollRes = await fetch(...);
  const pollJson = await pollRes.json();

  // Log progress every attempt — shows attempt N/18, elapsed, and MiniMax status
  logEvent("info", "video.poll_progress", {
    scene,
    taskId,
    pollAttempt,
    maxAttempts,
    elapsedMs: Date.now() - pollStart,
    status: pollJson.status ?? "unknown",
  });

  if (pollJson.status === "Fail") { ... }
  if (pollJson.status === "Success" && pollJson.file_id) { fileId = pollJson.file_id; break; }
}
```

### Pattern 2: Periodic progress timer (music)
**What:** Start a `setInterval` before the blocking `fetch` call; clear it in `finally`. Emit at the 30s mark.
**When to use:** Single blocking async call with no intermediate callbacks.
**Example:**
```typescript
// In server/src/services/musicService.ts — inside runGeneration()
const apiStart = Date.now();
let progressLogged30s = false;

const progressTimer = setInterval(() => {
  const elapsedMs = Date.now() - apiStart;
  if (!progressLogged30s && elapsedMs >= 30_000) {
    progressLogged30s = true;
    logEvent("info", "music.generation_progress", {
      mood,
      elapsedMs,
      stage: "api_call_in_flight",
    });
  }
}, 5_000); // check every 5s, fire once at 30s threshold

try {
  logEvent("info", "music.api_call_started", { mood, model: "music-2.5" });
  const res = await fetch("https://api.minimax.io/v1/music_generation", { ... });
  // ...
} finally {
  clearInterval(progressTimer);
}
```

### Pattern 3: Startup warning gating by NODE_ENV
**What:** Wrap `warnOnBlankConfig` calls for optional services (Redis, JWT) so they only fire in production — or emit at debug level so they don't appear in normal dev runs.
**When to use:** Any optional service whose absence is expected in dev mode.
**Example:**
```typescript
// In server/src/index.ts
// BEFORE (always warns):
warnOnBlankConfig(["REDIS_URL"], "Redis (needed for Phase 9 persistence)");
warnOnBlankConfig(["JWT_SECRET"], "JWT Auth (needed for Phase 9 authentication)");

// AFTER (only warns in production):
if (config.NODE_ENV === "production") {
  warnOnBlankConfig(["REDIS_URL"], "Redis (needed for Phase 9 persistence)");
  warnOnBlankConfig(["JWT_SECRET"], "JWT Auth (needed for Phase 9 authentication)");
}
```

And in `server/src/services/redis.ts`:
```typescript
// BEFORE:
console.warn("[redis] REDIS_URL not configured — running without Redis (in-memory fallback)");

// AFTER: only warn in production; dev silence is intentional
if (config.NODE_ENV === "production") {
  console.warn("[redis] REDIS_URL not configured — running without Redis (in-memory fallback)");
} else {
  // dev: silent degradation — Redis absence is expected
}
```

### Anti-Patterns to Avoid
- **Logging inside `setTimeout` callback only:** The POLL_INTERVAL_MS `await` already delays 10s before each poll; add the log after the poll response is received (so status is known), not before.
- **Forgetting `clearInterval` in `finally`:** If `finally` doesn't clear the interval, the timer fires after the function exits, leaking into subsequent calls.
- **Adding a `"debug"` log level to logger.ts:** The existing logger has `"info" | "warn" | "error"`. Adding `"debug"` is scope creep. The simpler solution is conditional gating by `NODE_ENV`, not a new log level.
- **Changing the structured log schema:** All new log entries must use the same `{ timestamp, level, event, ...context }` shape that `logEvent` already produces. Do not add top-level fields outside the `context` spread.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Periodic progress during fetch | Custom observable/stream wrapper | `setInterval` + `clearInterval` in `finally` | Single blocking call; no middleware needed |
| Structured log format | Custom formatter | Existing `logEvent()` in `logger.ts` | Already used everywhere; maintain consistency |
| Conditional log suppression | Log filtering middleware | `if (config.NODE_ENV === "production")` guard | Simplest correct solution; no runtime dependency |

**Key insight:** This phase is pure configuration of existing infrastructure — no new abstractions are warranted. All tools already exist.

---

## Common Pitfalls

### Pitfall 1: Poll log placed before the `await` delay
**What goes wrong:** If `logEvent` fires before `setTimeout(r, POLL_INTERVAL_MS)`, the log timestamp reflects pre-sleep time, making elapsed values misleading.
**Why it happens:** Instinct to "log first, then act."
**How to avoid:** Structure loop as: sleep → fetch → log (with status) → check break conditions.
**Warning signs:** Elapsed values in logs don't match actual wall-clock seconds between events.

### Pitfall 2: `setInterval` leaking across music generations
**What goes wrong:** If `clearInterval` is in `try` block instead of `finally`, a thrown error before clear leaves the interval running.
**Why it happens:** Forgetting `finally` semantics.
**How to avoid:** Always `clearInterval(progressTimer)` inside `finally`, not inside `try`.
**Warning signs:** Music progress logs appear after generation completes or fails.

### Pitfall 3: Gating REDIS_URL warning but not the redis.ts warn
**What goes wrong:** `index.ts` is silenced, but `redis.ts:connectRedis()` still emits `console.warn` unconditionally, so the noise persists.
**Why it happens:** There are two separate warn sites for Redis absence — `index.ts:30-33` (via `warnOnBlankConfig`) and `redis.ts:24-27` (direct `console.warn`). Both must be updated.
**How to avoid:** Search for all Redis-related warn emissions before committing.
**Warning signs:** One Redis warn disappears from dev startup but another remains.

### Pitfall 4: Breaking the 50% log noise reduction metric
**What goes wrong:** Adding poll-progress logs (up to 18 per video generation) increases total log volume significantly if not balanced against suppressed startup noise.
**Why it happens:** Success criterion 4 requires reducing cold-start+first-request noise by 50%, but the new progress logs fire during generation, not during cold-start.
**How to avoid:** Success criterion 4 is about cold-start + first request — the new generation logs only fire after a request triggers generation. The cold-start noise reduction (Redis/JWT warnings) is what drives criterion 4. Keep them separate in evaluation.
**Warning signs:** Conflating generation-time logs with startup logs in a count.

### Pitfall 5: `warnOnBlankConfig` for AWS_REGION still fires in dev
**What goes wrong:** Only gating Redis and JWT but leaving AWS_REGION, DD_API_KEY, and MINIMAX_API_KEY warnings unchanged may not achieve 50% noise reduction if those are also always blank.
**Why it happens:** The phase description specifically calls out Redis and JWT, but the 50% criterion is about all startup noise.
**How to avoid:** Audit all six `warnOnBlankConfig` calls in `index.ts` to identify which ones fire in dev. Redis and JWT are the most reliably blank in dev mode. Count lines before and after.
**Warning signs:** 50% threshold not met even after Redis/JWT fixes.

---

## Code Examples

Verified patterns from codebase inspection:

### Exact current state of video poll loop (no progress logging)
```typescript
// Source: server/src/services/videoGenerator.ts lines 162-196
// Current: zero logging between task_submitted and generation_complete
while (Date.now() - pollStart < GENERATION_TIMEOUT_MS) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

  const pollRes = await fetch(`...?task_id=${taskId}`, { ... });
  const pollJson = await pollRes.json();

  if (pollJson.status === "Fail") {
    throw new Error("MiniMax video generation failed");
  }
  if (pollJson.status === "Success" && pollJson.file_id) {
    fileId = pollJson.file_id;
    break;
  }
  // NOTHING LOGGED — up to 18 iterations in silence
}
```

### Exact current state of music generation (no intermediate logging)
```typescript
// Source: server/src/services/musicService.ts lines 100-120
// Current: one blocking ~55s fetch call with no intermediate logging
const apiStart = Date.now();
const res = await fetch("https://api.minimax.io/v1/music_generation", {
  // ...
  signal: AbortSignal.timeout(90_000),
});
apiCallDurationMs = Date.now() - apiStart;
// Nothing logged during the 55s call — only music.generation_started fires before
```

### Exact current state of startup warnings (always fires)
```typescript
// Source: server/src/index.ts lines 30-37
warnOnBlankConfig(
  ["REDIS_URL"],
  "Redis (needed for Phase 9 persistence)"
);
warnOnBlankConfig(
  ["JWT_SECRET"],
  "JWT Auth (needed for Phase 9 authentication)"
);
// + redis.ts line 24-27: console.warn always fires if REDIS_URL is blank
```

### `logEvent` signature (what new logs must conform to)
```typescript
// Source: server/src/services/logger.ts
export function logEvent(
  level: LogLevel,           // "info" | "warn" | "error"
  event: string,             // dot-notation event name, e.g. "video.poll_progress"
  context: LogContext = {},  // Record<string, unknown> — spread into JSON payload
  error?: unknown
): void
// Output: { timestamp, level, event, ...context }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No poll logging | Add `video.poll_progress` per iteration | Phase 16 | Operators can see stuck polls in real time |
| No music in-flight logging | Add `music.api_call_started` + `music.generation_progress` at 30s | Phase 16 | Distinguishes "generating" from "hung" |
| Redis/JWT warn always | Gate to production only | Phase 16 | Dev startup is clean |

**Nothing deprecated** — all patterns extend existing conventions, nothing replaced.

---

## Open Questions

1. **Should the 30s music progress log use `setInterval` or a race with `Promise.race`?**
   - What we know: The MiniMax fetch call uses `AbortSignal.timeout(90_000)` so it will self-terminate.
   - What's unclear: Whether a `setInterval` approach (fire once at 30s) is cleaner than a `Promise.race` with a 30s timeout that logs and then re-awaits.
   - Recommendation: `setInterval` with `clearInterval` in `finally` is simpler and does not require restructuring the await chain. Use it.

2. **Should all six `warnOnBlankConfig` calls in `index.ts` be gated, or only Redis and JWT?**
   - What we know: AWS_REGION, DD_API_KEY/DD_LLMOBS_ML_APP, and MINIMAX keys are also blank in dev. Those warnings also fire.
   - What's unclear: Whether gating only Redis+JWT achieves the 50% threshold.
   - Recommendation: Audit actual dev startup log output. If AWS/DD/MiniMax warnings are also present, gate them too. The pattern is the same. Success criterion 4 drives this decision empirically.

3. **Should `redis.ts` remain a plain `console.warn` or be migrated to `logEvent`?**
   - What we know: `redis.ts` uses direct `console.warn`, not `logEvent`, for its "not configured" message. This bypasses structured JSON format.
   - What's unclear: Whether consistency with `logEvent` format is required for this phase.
   - Recommendation: Since success criterion 5 says "all new log entries follow structured JSON format" and success criterion 3 is about gating the warn — not replacing it — the simplest path is gating the existing `console.warn` rather than refactoring it. Do not migrate to `logEvent` unless explicitly required.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `server/src/services/videoGenerator.ts` — poll loop structure, constants, log sites
- Direct codebase inspection: `server/src/services/musicService.ts` — blocking fetch structure, timing variables
- Direct codebase inspection: `server/src/services/config.ts` and `server/src/index.ts` — `warnOnBlankConfig` call sites
- Direct codebase inspection: `server/src/services/redis.ts` — `connectRedis()` console.warn site
- Direct codebase inspection: `server/src/services/logger.ts` — `logEvent` signature and output format

### Secondary (MEDIUM confidence)
- Existing codebase pattern: `SKIP_NEO4J_CONNECTIVITY_CHECK=1` in `server/src/index.ts` as established model for optional-service skip logic

### Tertiary (LOW confidence)
- None — all findings are from direct code inspection, no web research required for this internal-only phase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all tooling already present
- Architecture: HIGH — changes are additive edits inside existing functions; no structural refactoring
- Pitfalls: HIGH — identified from direct codebase analysis; the two-site Redis warn issue is a concrete gotcha confirmed by code reading

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable codebase; no external dependencies)

---

## Implementation Scope Summary

For the planner, here is the complete file-by-file change inventory:

| File | Change | Success Criterion |
|------|--------|-------------------|
| `server/src/services/videoGenerator.ts` | Add `pollAttempt` counter + `logEvent("info", "video.poll_progress", ...)` inside while loop | SC-1 |
| `server/src/services/musicService.ts` | Add `logEvent("info", "music.api_call_started", ...)` before fetch + `setInterval` for 30s progress + `clearInterval` in `finally` | SC-2 |
| `server/src/index.ts` | Gate `warnOnBlankConfig(["REDIS_URL"], ...)` and `warnOnBlankConfig(["JWT_SECRET"], ...)` to `NODE_ENV === "production"` only | SC-3, SC-4 |
| `server/src/services/redis.ts` | Gate `console.warn` in `connectRedis()` to `NODE_ENV === "production"` only | SC-3, SC-4 |

All new `logEvent` calls must produce `{ timestamp, level, event, ...context }` — same shape as all existing calls (SC-5).
