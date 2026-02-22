# Phase 15: Client Polling Optimization - Research

**Researched:** 2026-02-21
**Domain:** Client-side polling strategy, exponential backoff, HTTP 202 progress signaling
**Confidence:** HIGH

---

## Summary

Phase 15 replaces fixed-interval polling in two client-side services (`backgroundMusic.ts` and `sceneVideo.ts`) with exponential backoff plus initial delays. The change is entirely within the existing codebase — no new libraries are required. The pattern (exponential backoff with a cap) is a standard polling strategy for long-running async work, and TypeScript implementation is straightforward with no third-party dependency needed.

The server side requires a minimal addition: both `MoodCacheEntry` (in `musicService.ts`) and `SceneCacheEntry` (in `videoGenerator.ts`) must gain a `generationStartedAt: number | null` field. The 202 response bodies in `routes/music.ts` and `routes/sceneVideo.ts` must include `startedAt` so clients can reason about expected wait time without changing any polling state machine logic.

All existing safety rails (`MAX_POLLS` in the client, `MAX_RETRIES` in the server, `RETRY_INTERVAL_MS` for error retries) are preserved — backoff only replaces the success-poll timer, not the error-retry timer.

**Primary recommendation:** Implement exponential backoff purely in the client `fetchMoodAudio` and `fetchSceneVideo` functions; add `generationStartedAt` to server cache entries and surface it on 202 responses.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| No new libraries | — | Backoff implemented inline | Zero-dependency solution is appropriate here; the pattern is a handful of lines |

### Supporting — No additions needed

This phase touches four existing files only:

| File | Change Type |
|------|-------------|
| `client/src/services/backgroundMusic.ts` | Add backoff state + initial delay |
| `client/src/services/sceneVideo.ts` | Add backoff state + initial delay |
| `server/src/routes/music.ts` | Add `startedAt` to 202 response |
| `server/src/routes/sceneVideo.ts` | Add `startedAt` to 202 response |
| `server/src/services/musicService.ts` | Add `generationStartedAt` field to `MoodCacheEntry` |
| `server/src/services/videoGenerator.ts` | Add `generationStartedAt` field to `SceneCacheEntry` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled backoff | `p-retry`, `async-retry` | Libraries add value for retry-on-error patterns, but this is polling-for-readiness — the control flow already exists; a library would obscure it |
| Polling | WebSocket / SSE push | Push would eliminate polling entirely but requires server infrastructure changes — out of scope for an optimization phase |
| Polling | Long-poll (hold 202 open) | Ties up server connections; not appropriate for generation times of 55–180s at 1000 concurrent users |

**Installation:** None required.

---

## Architecture Patterns

### Current Polling Flow (both services — identical structure)

```
fetchMoodAudio(mood):
  if res.status === 202:
    polls++
    if polls > MAX_POLLS: give up
    setTimeout(fetchMoodAudio, POLL_INTERVAL_MS)  ← fixed 4000ms
```

### Target Pattern: Exponential Backoff with Initial Delay

```
Initial delay:  music=10s, video=15s   (skip polls before generation can finish)
Backoff series: 2s → 4s → 8s → 16s → 30s (cap)
Formula:        delay = min(BASE * 2^(pollCount), CAP)
               BASE=2000, CAP=30000
Safety:         MAX_POLLS preserved as upper bound
```

### Recommended Constants

```typescript
// backgroundMusic.ts
const INITIAL_POLL_DELAY_MS = 10_000;  // music generation typical minimum
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 30_000;
// POLL_INTERVAL_MS removed (replaced by computed backoff)

// sceneVideo.ts
const INITIAL_POLL_DELAY_MS = 15_000;  // video generation typical minimum
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 30_000;
// POLL_INTERVAL_MS removed (replaced by computed backoff)
```

### Poll Count → Delay Mapping

| Poll # (0-based) | Formula `min(2000 * 2^n, 30000)` | Cumulative time (after initial delay) |
|-----------------|----------------------------------|---------------------------------------|
| 0 (first)       | 2s wait after initial delay      | initial + 0s elapsed |
| 1               | 4s                               | initial + 2s |
| 2               | 8s                               | initial + 6s |
| 3               | 16s                              | initial + 14s |
| 4               | 30s (capped)                     | initial + 30s |
| 5               | 30s                              | initial + 60s |

**Music math verification:**
- Initial delay: 10s. Music ready at ~55s.
- Remaining after initial delay: 45s.
- Polls at t=10s(+2s wait), t=12s(+4s), t=16s(+8s), t=24s(+16s), t=40s(+30s cap), t=70s.
- Poll 5 (t=70s) exceeds 55s generation time, so poll 4 or 5 gets a 200. Total: ~5-6 polls.
- Previous: 14 polls at fixed 4s. Reduction: ~60%.

**Video math verification:**
- Initial delay: 15s. Video ready at ~120-180s typical.
- Fixed 5s: 180/5 = 36 polls. With backoff, polls saturate at 30s cap after poll 4.
- After initial 15s: polls at 15s, 17s, 21s, 29s, 45s, 75s, 105s, 135s, 165s → ~9 polls for 180s scenario.
- Reduction: 36 → ~9 polls (~75%).

### Pattern 1: Initial Delay Wrapper

**What:** Wrap the first call in a `setTimeout` to skip the guaranteed-not-ready window.
**When to use:** Whenever minimum generation time is known and consistently longer than polling frequency.

```typescript
// In startBackgroundMusic / changeScene trigger site:
// Instead of immediately calling fetchMoodAudio(mood),
// wait for INITIAL_POLL_DELAY_MS first.

// Option A: delay at call site
setTimeout(() => {
  void fetchMoodAudio(mood).then((url) => {
    if (url && !currentTrack) crossfadeTo(url, mood);
  });
}, INITIAL_POLL_DELAY_MS);

// Option B: delay inside fetchMoodAudio on poll count === 0
// This is cleaner because the delay logic stays inside the service.
if (polls === 0) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      fetchingMoods.delete(mood);
      resolve(await fetchMoodAudio(mood));
    }, INITIAL_POLL_DELAY_MS);
  });
}
```

Option B (inside the function) is cleaner because:
- The fetch function fully owns its retry/poll logic
- Call sites don't need to know about delays
- Consistent with how POLL_INTERVAL_MS was already managed internally

### Pattern 2: Backoff Delay Computation

**What:** Compute next wait from poll count rather than a fixed constant.

```typescript
// Source: well-known exponential backoff formula, no library needed
function getBackoffDelay(pollCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, pollCount), BACKOFF_CAP_MS);
}
```

Place this as a module-level function in each service file.

### Pattern 3: Server `startedAt` Signal

**What:** Server records `Date.now()` when generation starts and returns it on 202 responses so the client can compute elapsed time.

**Server side — `musicService.ts`:**

```typescript
// Add to MoodCacheEntry interface:
interface MoodCacheEntry {
  audio: Buffer | null;
  generating: boolean;
  error: string | null;
  lastFailedAt: number | null;
  retryCount: number;
  generationStartedAt: number | null;  // NEW
}

// In startGeneration():
entry.generating = true;
entry.generationStartedAt = Date.now();  // NEW

// In getOrCreateEntry():
entry = { audio: null, generating: false, error: null, lastFailedAt: null, retryCount: 0, generationStartedAt: null };
```

**Server side — `routes/music.ts`:**

```typescript
// In the 202 response branch:
case "generating":
case "retrying":
  res.status(202).json({
    status: "generating",
    mood,
    startedAt: entry.generationStartedAt ?? Date.now(),  // NEW
  });
  break;
```

Note: `getMusicForMood` returns `{ status: "generating"; mood: SceneMood }` — the route needs access to the raw entry to read `generationStartedAt`, or the return type must be extended to include it.

**Cleanest approach:** Extend `MusicResult` type to include `startedAt?: number` on the `generating` and `retrying` variants, and populate it in `getMusicForMood` before returning.

**Server side — `videoGenerator.ts` / `routes/sceneVideo.ts`:**
Same pattern: add `generationStartedAt` to `SceneCacheEntry`, set it in `startGeneration()`, surface it via `getOrCreateEntry()` in the route, and include it in 202 response body.

### Anti-Patterns to Avoid

- **Resetting `pollCounts` on scene/mood change:** The poll count is already scoped per-mood/scene via `Map<SceneMood, number>` — do not reset it between polls for the same resource. Only reset on success (already done) or explicit abandonment.
- **Applying backoff to error retries:** `RETRY_INTERVAL_MS = 10000` handles error retries separately and should remain fixed. Backoff only replaces the 202-polling interval.
- **Applying initial delay when a result is already cached:** Both `fetchMoodAudio` and `fetchSceneVideo` check `moodBlobUrls.has(mood)` / `sceneBlobUrls.has(scene)` before entering the polling path — this guard must remain first.
- **Applying initial delay on re-poll (not just first poll):** The `polls === 0` check must be used for the initial delay gate. On subsequent polls (polls > 0), only exponential backoff applies.
- **Breaking the `fetchingMoods` guard:** The `fetchingMoods.has(mood)` early-return prevents duplicate parallel fetches for the same mood. The refactored code must preserve this guard and correctly delete from `fetchingMoods` before recursive call (already done in current code).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sophisticated retry library | Custom retry orchestrator | None needed — use inline backoff | The existing recursive setTimeout pattern is sufficient; the problem domain is simple enough |
| Server-sent events | Custom push infrastructure | Keep polling with better intervals | SSE would solve the root cause but is out of scope; optimized polling is the specified approach |
| Jitter on backoff | Full jitter formula | Optional, see pitfalls | Pure exponential without jitter is acceptable for a single-user scenario (one generation per mood, not N concurrent clients hammering the same endpoint) |

**Key insight:** This is a correctness-and-efficiency fix, not an infrastructure change. The existing recursive-setTimeout polling pattern is entirely appropriate — it just needs better interval values.

---

## Common Pitfalls

### Pitfall 1: `fetchingMoods` guard broken by refactoring

**What goes wrong:** The initial-delay branch calls `setTimeout` then `fetchingMoods.delete(mood)` before the recursive call. If the delete happens at the wrong point, two parallel fetches for the same mood can run simultaneously.

**Why it happens:** Refactoring the early-return guard to add a new code path at `polls === 0` can accidentally bypass the guard.

**How to avoid:** Keep `fetchingMoods.add(mood)` at the TOP of `fetchMoodAudio`, before any branching. Delete `fetchingMoods` immediately before the recursive call (already the pattern in the current code).

**Warning signs:** Console logs showing multiple simultaneous fetches for the same mood; multiple blob URLs created for the same mood.

### Pitfall 2: Initial delay fires even when music is already ready

**What goes wrong:** If the server has cached audio (200 response on first call), the initial delay wasted 10 seconds before discovering it.

**Why it happens:** Initial delay added unconditionally before the first fetch.

**How to avoid:** The initial delay should be in the 202-handling branch, not before the initial fetch. The first HTTP request goes out immediately; only when 202 is received does the delay logic kick in. The `polls === 0` check in the 202 branch accomplishes this correctly.

### Pitfall 3: `pollCounts` not reset on `stopBackgroundMusic` / `resetScenes`

**What goes wrong:** If a user stops and restarts music, the poll count map still has old values. The next poll for the same mood starts with a large backoff interval instead of the initial delay.

**Why it happens:** `pollCounts.clear()` is already called in `stopBackgroundMusic()` (line 313) and `resetScenes()` (line 125) — so this is already handled. Verify it remains in place after refactoring.

**Warning signs:** Music takes unexpectedly long to start on second play after stop.

### Pitfall 4: TypeScript type mismatch on `MusicResult`

**What goes wrong:** `MusicResult` type currently does not include `startedAt`. Routes read it, but the type system doesn't enforce the field is populated.

**How to avoid:** Update the `MusicResult` union type in `musicService.ts`:

```typescript
export type MusicResult =
  | { status: "ready"; audio: Buffer }
  | { status: "generating"; mood: SceneMood; startedAt: number }  // add startedAt
  | { status: "retrying"; mood: SceneMood; startedAt: number }    // add startedAt
  | { status: "error"; error: string; terminal: boolean };
```

Then `getMusicForMood()` is responsible for populating it — which means `MoodCacheEntry.generationStartedAt` must be read there.

### Pitfall 5: `videoGenerator.ts` exports `getOrCreateEntry` to route — `startedAt` accessibility

**What goes wrong:** `routes/sceneVideo.ts` calls `getOrCreateEntry(scene)` directly and reads from the entry. `startedAt` is already accessible this way without changing the return type of any exported function. However, if `startedAt` is only set in `startGeneration()`, a race where the route reads the entry _before_ `startGeneration()` sets it will return `null`.

**How to avoid:** In `routes/sceneVideo.ts`, use `entry.generationStartedAt ?? Date.now()` as a safe fallback. Set `generationStartedAt` in the `getOrCreateEntry` factory only after `startGeneration` has been called, or set it inside `startGeneration` before the async `runGeneration` call.

---

## Code Examples

### Exponential Backoff in `fetchMoodAudio`

```typescript
// Source: derived from current backgroundMusic.ts pattern
const INITIAL_POLL_DELAY_MS = 10_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 30_000;
// POLL_INTERVAL_MS constant removed

function getPollDelay(pollCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, pollCount), BACKOFF_CAP_MS);
}

async function fetchMoodAudio(mood: SceneMood): Promise<string | null> {
  if (moodBlobUrls.has(mood)) return moodBlobUrls.get(mood)!;
  if (fetchingMoods.has(mood)) return null;

  fetchingMoods.add(mood);
  const polls = pollCounts.get(mood) ?? 0;
  const retries = retryCounts.get(mood) ?? 0;

  try {
    const res = await fetch(`/api/music?mood=${mood}`);

    if (res.status === 202) {
      pollCounts.set(mood, polls + 1);
      if (polls + 1 > MAX_POLLS) {
        console.warn(`[music] max polls for ${mood} — giving up`);
        fetchingMoods.delete(mood);
        return null;
      }

      // Initial delay on first 202 (skip the guaranteed-not-ready window)
      const delay = polls === 0 ? INITIAL_POLL_DELAY_MS : getPollDelay(polls);

      return new Promise((resolve) => {
        setTimeout(async () => {
          fetchingMoods.delete(mood);
          resolve(await fetchMoodAudio(mood));
        }, delay);
      });
    }

    // Error retry path — unchanged (RETRY_INTERVAL_MS stays fixed)
    if (!res.ok) {
      retryCounts.set(mood, retries + 1);
      if (retries + 1 <= MAX_RETRIES) {
        console.warn(`[music] ${mood} error: ${res.status}, retry ${retries + 1}/${MAX_RETRIES}`);
        return new Promise((resolve) => {
          setTimeout(async () => {
            fetchingMoods.delete(mood);
            resolve(await fetchMoodAudio(mood));
          }, RETRY_INTERVAL_MS);
        });
      }
      console.warn(`[music] ${mood} max retries reached`);
      fetchingMoods.delete(mood);
      return null;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    moodBlobUrls.set(mood, url);
    pollCounts.delete(mood);
    retryCounts.delete(mood);
    fetchingMoods.delete(mood);
    return url;
  } catch (err) {
    console.warn(`[music] fetch ${mood} failed:`, err);
    fetchingMoods.delete(mood);
    return null;
  }
}
```

### Exponential Backoff in `fetchSceneVideo` (same pattern, different constants)

```typescript
// Source: derived from current sceneVideo.ts pattern
const INITIAL_POLL_DELAY_MS = 15_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 30_000;

function getPollDelay(pollCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, pollCount), BACKOFF_CAP_MS);
}

// In the 202 branch of fetchSceneVideo:
if (res.status === 202) {
  pollCounts.set(scene, polls + 1);
  if (polls + 1 > MAX_POLLS) {
    console.warn(`[scene-video] max polls for ${scene} — giving up`);
    fetchingScenes.delete(scene);
    return null;
  }

  const delay = polls === 0 ? INITIAL_POLL_DELAY_MS : getPollDelay(polls);

  return new Promise((resolve) => {
    setTimeout(async () => {
      fetchingScenes.delete(scene);
      resolve(await fetchSceneVideo(scene));
    }, delay);
  });
}
```

### Server: `MoodCacheEntry` with `generationStartedAt`

```typescript
// Source: musicService.ts — current MoodCacheEntry extended
interface MoodCacheEntry {
  audio: Buffer | null;
  generating: boolean;
  error: string | null;
  lastFailedAt: number | null;
  retryCount: number;
  generationStartedAt: number | null;  // NEW: epoch ms when generation started
}

// In getOrCreateEntry():
entry = {
  audio: null,
  generating: false,
  error: null,
  lastFailedAt: null,
  retryCount: 0,
  generationStartedAt: null,  // NEW
};

// In startGeneration(), before void runGeneration(mood):
entry.generating = true;
entry.generationStartedAt = Date.now();  // NEW
```

### Server: `MusicResult` type extended

```typescript
// Source: musicService.ts — MusicResult union type
export type MusicResult =
  | { status: "ready"; audio: Buffer }
  | { status: "generating"; mood: SceneMood; startedAt: number }
  | { status: "retrying"; mood: SceneMood; startedAt: number }
  | { status: "error"; error: string; terminal: boolean };
```

### Server: 202 response with `startedAt` (music route)

```typescript
// Source: routes/music.ts — generating/retrying branch
case "generating":
case "retrying":
  res.status(202).json({
    status: "generating",
    mood,
    startedAt: result.startedAt,  // NEW: epoch ms
  });
  break;
```

### Server: `SceneCacheEntry` with `generationStartedAt` (video)

```typescript
// Source: videoGenerator.ts — SceneCacheEntry extended
interface SceneCacheEntry {
  video: Buffer | null;
  generating: boolean;
  error: string | null;
  lastFailedAt: number | null;
  retryCount: number;
  generationStartedAt: number | null;  // NEW
}

// In startGeneration():
entry.generating = true;
entry.generationStartedAt = Date.now();  // NEW

// In routes/sceneVideo.ts — 202 response (startGeneration call site):
res.status(202).json({
  status: "generating",
  scene,
  startedAt: entry.generationStartedAt ?? Date.now(),  // NEW
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed-interval polling | Exponential backoff + initial delay | This phase | ~60-75% fewer 202 responses; lower server load; less console noise |
| No progress info on 202 | `startedAt` timestamp on 202 | This phase | Client can display "generating..." with elapsed time indicator in the future |

**Deprecated/outdated:**

- `POLL_INTERVAL_MS = 4000` in `backgroundMusic.ts`: Remove; replaced by `BACKOFF_BASE_MS` + `INITIAL_POLL_DELAY_MS`.
- `POLL_INTERVAL_MS = 5000` in `sceneVideo.ts`: Remove; replaced by `BACKOFF_BASE_MS` + `INITIAL_POLL_DELAY_MS`.

---

## Open Questions

1. **Should `startedAt` be surfaced to the user?**
   - What we know: The phase spec says "clients can estimate wait time" — this implies server surfaces it but doesn't mandate client UI changes.
   - What's unclear: Whether the client should display a progress indicator using `startedAt`.
   - Recommendation: Implement `startedAt` on the server and include it in the 202 JSON; leave client UI usage out of scope for this phase unless the planner includes it.

2. **Should `RETRY_INTERVAL_MS` for error retries also get backoff?**
   - What we know: The phase spec explicitly says to preserve `MAX_RETRIES` as upper bounds. The error retry path uses a fixed `RETRY_INTERVAL_MS = 10000`.
   - What's unclear: Whether error retries should also back off.
   - Recommendation: Leave error retry interval unchanged. Phase scope is polling optimization, not error retry optimization. Changing both conflates two separate concerns.

3. **Jitter — is it needed?**
   - What we know: Pure exponential backoff without jitter is fine for the single-generation-per-resource pattern (one fetch chain per mood/scene). Jitter is essential when N clients poll the same endpoint simultaneously to avoid thundering herd.
   - What's unclear: At 1000 users, could multiple users trigger the same mood simultaneously, creating synchronized poll spikes?
   - Recommendation: For this codebase, the server caches audio in memory per mood globally (not per user). Once one user's poll succeeds, subsequent users get 200 from cache immediately. The thundering-herd risk is low because there are only 5 moods and 30 scenes — not per-user resources. Jitter is not required for correctness here, but could be added as a small improvement (e.g., `delay * (0.8 + Math.random() * 0.4)`).

---

## Sources

### Primary (HIGH confidence)

- Direct reading of `/client/src/services/backgroundMusic.ts` — current polling constants and structure
- Direct reading of `/client/src/services/sceneVideo.ts` — current polling constants and structure
- Direct reading of `/server/src/routes/music.ts` — 202 response format
- Direct reading of `/server/src/routes/sceneVideo.ts` — 202 response format
- Direct reading of `/server/src/services/musicService.ts` — `MoodCacheEntry` structure, `MusicResult` type
- Direct reading of `/server/src/services/videoGenerator.ts` — `SceneCacheEntry` structure, timing constants

### Secondary (MEDIUM confidence)

- Exponential backoff formula `min(base * 2^n, cap)` — standard algorithm documented in AWS architecture guides, Google SRE Book, and RFC 7230-adjacent retry discussions. No single URL needed; this is a fundamental CS pattern.

### Tertiary (LOW confidence)

- Generation time estimates (55s music, 120–180s video) come from the phase description ("Music generation takes ~55s"), not from direct measurement in this codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing code is the source of truth
- Architecture patterns: HIGH — directly derived from reading the four production files
- Pitfalls: HIGH — identified from code structure analysis, not speculation
- Server `startedAt` type changes: HIGH — TypeScript types read directly from source

**Research date:** 2026-02-21
**Valid until:** Stable; these are internal implementation patterns, not external APIs. Valid indefinitely unless the files listed above are restructured.
