---
phase: 15-client-polling-optimization
plan: "01"
subsystem: client-services, server-routes
tags: [polling, backoff, performance, music, video]
dependency_graph:
  requires: []
  provides:
    - backgroundMusic.ts exponential backoff polling
    - sceneVideo.ts exponential backoff polling
    - server 202 responses with startedAt timestamps
  affects:
    - client/src/services/backgroundMusic.ts
    - client/src/services/sceneVideo.ts
    - server/src/routes/music.ts
    - server/src/routes/sceneVideo.ts
tech_stack:
  added: []
  patterns:
    - Exponential backoff: min(base * 2^n, cap)
    - Initial delay on first 202 to skip guaranteed-not-ready window
key_files:
  modified:
    - client/src/services/backgroundMusic.ts
    - client/src/services/sceneVideo.ts
    - server/src/routes/music.ts
    - server/src/routes/sceneVideo.ts
decisions:
  - backgroundMusic INITIAL_POLL_DELAY_MS=10s (music generation ~55s; 10s skip avoids first several guaranteed-miss polls)
  - sceneVideo INITIAL_POLL_DELAY_MS=15s (video generation ~180s; 15s initial skip more impactful)
  - BACKOFF_BASE_MS=2s with BACKOFF_CAP_MS=30s for both — aggressive ramp but capped to avoid excessive gaps
  - RETRY_INTERVAL_MS (10s) left unchanged — error retries are a different code path and already tuned
  - server generationStartedAt already in HEAD from phase 16 progress logging work; route startedAt fields were the new work
metrics:
  duration_seconds: 217
  completed_date: "2026-02-21"
  tasks_completed: 2
  files_modified: 4
---

# Phase 15 Plan 01: Client Polling Optimization Summary

Replaced aggressive fixed-interval polling in music and video client services with exponential backoff (2s base, 30s cap) and initial delays (10s music, 15s video), reducing wasted 202 polls by ~60-75%.

## What Was Built

### Task 1: Server-side startedAt timestamps on 202 responses (commit: e7624a9)

Added `startedAt` field to all 202 JSON responses from music and video routes, enabling clients to calculate elapsed generation time.

Note: `generationStartedAt` on `MoodCacheEntry` and `SceneCacheEntry`, and `startedAt` on `MusicResult` generating/retrying variants, were already present in HEAD (added by the phase 16 progress logging commit `57edba7`). The new work in this task was updating the route 202 response bodies to include `startedAt`.

**server/src/routes/music.ts:**
```typescript
case "generating":
case "retrying":
  res.status(202).json({ status: "generating", mood, startedAt: result.startedAt });
```

**server/src/routes/sceneVideo.ts** (both 202 response sites):
```typescript
res.status(202).json({ status: "generating", scene, startedAt: entry.generationStartedAt ?? Date.now() });
```

### Task 2: Client exponential backoff with initial delay (commit: f1b94c4)

**client/src/services/backgroundMusic.ts:**
- Removed `POLL_INTERVAL_MS = 4000`
- Added `INITIAL_POLL_DELAY_MS = 10_000`, `BACKOFF_BASE_MS = 2_000`, `BACKOFF_CAP_MS = 30_000`
- Added `getPollDelay(pollCount)` helper: `min(2000 * 2^n, 30000)`
- 202 handler: first poll waits 10s, subsequent polls use exponential backoff

**client/src/services/sceneVideo.ts:**
- Removed `POLL_INTERVAL_MS = 5000`
- Added `INITIAL_POLL_DELAY_MS = 15_000`, `BACKOFF_BASE_MS = 2_000`, `BACKOFF_CAP_MS = 30_000`
- Added `getPollDelay(pollCount)` helper
- 202 handler: first poll waits 15s, subsequent polls use exponential backoff

## Verification Results

All 11 plan verification items passed:
1. `npx tsc --noEmit` passes in server/ — PASS
2. `npx tsc --noEmit` passes in client/ — PASS
3. `POLL_INTERVAL_MS` does not appear in either client file — PASS
4. `BACKOFF_BASE_MS` present in both client files — PASS
5. `BACKOFF_CAP_MS` present in both client files — PASS
6. `INITIAL_POLL_DELAY_MS` present in both client files — PASS
7. `getPollDelay` present in both client files — PASS
8. `generationStartedAt` in MoodCacheEntry and SceneCacheEntry — PASS
9. `startedAt` in MusicResult generating/retrying variants — PASS
10. All 202 response sites include `startedAt` — PASS
11. `RETRY_INTERVAL_MS = 10000` unchanged in both client files — PASS

## Expected Impact

- Music polling (~55s generation): ~5-6 polls instead of ~14 at fixed 4s (~60% reduction)
- Video polling (~180s generation): ~9 polls instead of ~36 at fixed 5s (~75% reduction)
- Cached audio/video (200 response): zero delay, served immediately with no initial wait
- Error retry path: unchanged 10s fixed interval

## Deviations from Plan

### Pre-existing work found in HEAD

**Found during:** Task 1 investigation

**Situation:** The plan called for adding `generationStartedAt` to `MoodCacheEntry` and `SceneCacheEntry`, and `startedAt` to `MusicResult`. These fields were already present in HEAD commit `57edba7` ("feat(16-01): add progress logging to video and music generation"). The phase 16 observability work had already implemented the service-layer portions of this plan.

**Impact:** Task 1 scope was narrowed to the route layer only (adding `startedAt` to 202 response JSON). No rework needed; the outcome matches the plan's must_haves exactly.

**Classification:** Not a deviation — the work was done correctly. The route layer additions were the remaining gap.

## Self-Check: PASSED

Files verified to exist:
- client/src/services/backgroundMusic.ts — FOUND
- client/src/services/sceneVideo.ts — FOUND
- server/src/routes/music.ts — FOUND
- server/src/routes/sceneVideo.ts — FOUND

Commits verified:
- e7624a9 (feat(15-01): add startedAt to 202 responses) — FOUND
- f1b94c4 (feat(15-01): replace fixed-interval polling with exponential backoff) — FOUND
