---
phase: 18-code-review-bug-fixes-wave-2
plan: 07
subsystem: api
tags: [express, sse, graceful-shutdown, timeout, rate-limiting, trust-proxy]

requires:
  - phase: 18-code-review-bug-fixes-wave-2
    provides: "IDOR fix, LRU caches, security headers, route standardization, trust proxy (18-01, 18-03, 18-10)"

provides:
  - "60-second overall timeout on /api/narrate with 504 on expiry"
  - "Active SSE stream tracking via activeSSEStreams Set"
  - "Graceful shutdown drains SSE clients with [DONE] notification"
  - "Trust proxy, route standardization, Bedrock queue 15s timeout (verified in prior commits)"

affects:
  - "index.ts shutdown handler"
  - "chat.ts SSE stream lifecycle"
  - "narrate.ts request timeout"

tech-stack:
  added: []
  patterns:
    - "AbortController with setTimeout for per-request timeout budget"
    - "Set<Response> for tracking active SSE connections"
    - "Drain pattern: notify then clear SSE set on shutdown"

key-files:
  created:
    - server/src/services/activeStreams.ts
  modified:
    - server/src/routes/narrate.ts
    - server/src/routes/chat.ts
    - server/src/index.ts

key-decisions:
  - "AbortController timeout wraps individual code paths (not entire handler) — matches existing try/catch structure"
  - "activeSSEStreams lives in separate module (not in chat.ts) — enables shutdown drain without circular import"
  - "clearTimeout called in finally block and at each early return — prevents timer leak on all paths"
  - "Trust proxy / route standardization / bedrockQueue timeout were already committed in 18-01, 18-03, 18-10 — verified but not re-implemented"

patterns-established:
  - "AbortController pattern: create at handler start, clearTimeout in finally/returns"
  - "SSE lifecycle: add to activeSSEStreams after headers, delete on close and res.end()"

duration: 10min
completed: 2026-02-23
---

# Phase 18 Plan 07: Server Hardening P2 Summary

**Express trust proxy + /api/-only routes (prior commits) + 60s narrate timeout + SSE stream drain on shutdown via activeSSEStreams Set**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-23T05:09:11Z
- **Completed:** 2026-02-23T05:19:11Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 created)

## Accomplishments

- Added 60-second overall timeout to `/api/narrate` using AbortController; returns 504 on expiry across all code paths (TTS-only, opening phrase, Bedrock fallback)
- Created `activeStreams.ts` service module with `activeSSEStreams = new Set<Response>()` for tracking live SSE connections
- Updated `chat.ts` to add SSE response to `activeSSEStreams` after headers written, remove on client close and both `res.end()` call sites
- Updated `index.ts` graceful shutdown to drain all active SSE streams with shutdown notification and `[DONE]` before closing Socket.IO and HTTP server
- Verified Task 1 requirements (trust proxy, route standardization, Bedrock queue 15s timeout) already committed in plans 18-01, 18-03, 18-10

## Task Commits

1. **Task 2: Narrate timeout and graceful shutdown SSE drain** - `166d083` (feat)

Note: Task 1 requirements (trust proxy, route standardization, Bedrock queue timeout) were already committed by previous phase 18 plans (18-01, 18-03, 18-10). No separate Task 1 commit needed.

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `server/src/services/activeStreams.ts` - Exported `activeSSEStreams = new Set<Response>()` for shutdown drain
- `server/src/routes/narrate.ts` - AbortController 60s timeout wrapping all code paths; 504 on AbortError
- `server/src/routes/chat.ts` - Import activeSSEStreams; track SSE response lifecycle
- `server/src/index.ts` - Import activeSSEStreams; drain all streams before io.close() in shutdown handler

## Decisions Made

- AbortController wraps individual code paths (not entire handler) — existing structure has multiple try/catch blocks, cleanest to clear timeout in each exit path
- `activeSSEStreams` lives in `server/src/services/activeStreams.ts` — separate module avoids circular dependency between `chat.ts` and `index.ts`
- Trust proxy / route standardization / bedrockQueue timeout already committed in prior plans — verified requirements satisfied, no re-implementation needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed incomplete LRU migration in sceneVideo.ts**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Another phase-18 plan partially migrated `videoGenerator.ts` from `entry.video` to `videoBufferCache` (LRU) but didn't update all references in `sceneVideo.ts` or export the `getVideoBuffer`/`hasVideoBuffer` helpers
- **Fix:** Updated `sceneVideo.ts` to use `hasVideoBuffer(scene)` and `getVideoBuffer(scene)` instead of `entry.video`; `videoGenerator.ts` already had the helpers exported (by the prior plan) but `sceneVideo.ts` still used the old API
- **Files modified:** `server/src/routes/sceneVideo.ts` (route also consolidated to `/api/scene-video` only)
- **Verification:** `npx tsc --noEmit` compiles clean; 53 tests pass
- **Committed in:** Already in HEAD (other plan's commit) — sceneVideo.ts fix was in the working tree from prior plan

**2. [Rule 3 - Blocking] Fixed incomplete LRU migration in musicService.ts**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Another phase-18 plan removed `audio` from `MoodCacheEntry` and added `musicBufferCache` LRU, but left `entry.audio` references in `getMusicForMood` function (L1/L2/fallback cache hit paths)
- **Fix:** Replaced all `entry.audio` references in `getMusicForMood` with `musicBufferCache.get(key)` / `musicBufferCache.set(key, s3Buf)` / `musicBufferCache.get(fallbackKey)`
- **Files modified:** `server/src/services/musicService.ts`
- **Verification:** `npx tsc --noEmit` compiles clean; 53 tests pass
- **Committed in:** Already in HEAD (other plan's commit) — fix was from working tree state

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking compile errors from incomplete migrations in other plans)
**Impact on plan:** Both fixes essential for TypeScript compilation. Fixed incomplete work from other phase-18 plans. No scope creep.

## Issues Encountered

- `throwOnTimeout` option not supported in p-queue v9.1.0 (it was removed; v9 throws `TimeoutError` by default when timeout fires). Used `timeout: 15_000` only, removed `throwOnTimeout`.
- Previous phase-18 plan commits (18-01, 18-03, 18-10) had already implemented most Task 1 requirements. Verified all requirements met in HEAD before proceeding.

## Next Phase Readiness

- Server is hardened for production proxy deployment (trust proxy set, real IP for rate limiting)
- All routes use `/api/` prefix only — no dual-path confusion
- Bedrock queue rejects tasks after 15s execution (TimeoutError)
- Narrate requests timeout at 60s (504 returned)
- Graceful shutdown notifies all connected SSE clients before closing

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-23*
