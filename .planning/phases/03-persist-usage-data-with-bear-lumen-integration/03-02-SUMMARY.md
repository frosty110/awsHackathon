---
phase: 03-persist-usage-data-with-bear-lumen-integration
plan: 02
subsystem: api
tags: [bear-lumen, usage-tracking, cost-intelligence, sdk, batching, shutdown-hook]

# Dependency graph
requires:
  - phase: 03-persist-usage-data-with-bear-lumen-integration
    plan: 01
    provides: pushToBearLumen REST forwarder and BEAR_LUMEN_API_KEY config — now replaced by SDK path
provides:
  - bearLumenSdk.ts SDK singleton with conditional initialization, trackBearLumen, shutdownBearLumen
  - SDK-based batched event tracking replacing per-event REST POSTs
  - Graceful shutdown hook flushing Bear Lumen queue before process exit
affects:
  - future phases that add new record* functions (must also call trackBearLumen)
  - server shutdown sequence (shutdownBearLumen is step 0.5)

# Tech tracking
tech-stack:
  added:
    - "@bearlumen/node-sdk@0.2.0 (SDK with automatic 20-event batching, 10s flush interval)"
  patterns:
    - "Bear Lumen SDK singleton initialized at module load — null when BEAR_LUMEN_API_KEY empty, avoiding constructor throw"
    - "bear.track(null, {...}) for manual tracking — avoids stream-wrapping conflicts with Datadog tracer"
    - "resolveProvider() maps model prefix to Provider.BEDROCK / Provider.MINIMAX typed ProviderId"
    - "buildUnits() omits zero-value fields — SDK receives only non-zero token/character counts"
    - "Shutdown hook as step 0.5 — after SSE drain, before Socket.IO close — HTTP still up for flush POST"

key-files:
  created:
    - server/src/services/bearLumenSdk.ts
  modified:
    - server/src/services/usageTracker.ts
    - server/src/index.ts
    - server/package.json
    - yarn.lock
  deleted:
    - server/src/services/bearLumen.ts

key-decisions:
  - "resolveProvider returns ProviderId (not string) — required to match TrackOptions.provider type in SDK overloads"
  - "import type { ProviderId } from '@bearlumen/node-sdk' added — ProviderId not re-exported from index, requires direct import"
  - "bearLumen.ts (REST forwarder) deleted immediately after wiring SDK — prevents double-counting"
  - "SDK null-check in trackBearLumen before bear.track() — SDK is null when BEAR_LUMEN_API_KEY empty"
  - "onError callback only logs in non-production — production stays silent on flush failures"

patterns-established:
  - "SDK singleton pattern: ternary guard on config key prevents constructor throw, exports wrapper functions"
  - "trackBearLumen replaces pushToBearLumen as standard call at end of each record* function"

requirements-completed: [BEAR-03, BEAR-04, BEAR-05]

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 03 Plan 02: Bear Lumen SDK Integration Summary

**@bearlumen/node-sdk integrated with batched event tracking via bear.track(null, {...}), replacing per-event REST POSTs, with graceful shutdown hook flushing queue before process exit**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T07:01:04Z
- **Completed:** 2026-02-25T07:05:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 2 modified, 1 deleted, 1 package metadata)

## Accomplishments
- Installed `@bearlumen/node-sdk@0.2.0` in server workspace
- Created `bearLumenSdk.ts`: conditional BearLumen singleton (null when `BEAR_LUMEN_API_KEY` blank), `trackBearLumen()` wrapper using `bear.track(null, {...})`, `shutdownBearLumen()` for graceful flush
- Replaced all 4 `pushToBearLumen` calls in `usageTracker.ts` with `trackBearLumen` — no double-counting possible
- Wired `shutdownBearLumen()` into `index.ts` shutdown handler at step 0.5 (after SSE drain, before Socket.IO close)
- Deleted `bearLumen.ts` REST forwarder — SDK path is now the sole integration
- All 58 existing tests pass unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Install SDK, create bearLumenSdk.ts singleton, add shutdown hook** - `bb9b2ad` (feat)
2. **Task 2: Replace REST pushToBearLumen with SDK trackBearLumen, delete bearLumen.ts** - `9ad966a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `server/src/services/bearLumenSdk.ts` - New: BearLumen SDK singleton with conditional init, trackBearLumen wrapper, shutdownBearLumen export
- `server/src/services/usageTracker.ts` - Changed import to bearLumenSdk.js; 4x trackBearLumen calls replacing pushToBearLumen
- `server/src/index.ts` - Added shutdownBearLumen import and call in shutdown handler (step 0.5)
- `server/package.json` - Added @bearlumen/node-sdk@^0.2.0 dependency
- `server/src/services/bearLumen.ts` - Deleted (REST forwarder no longer needed)

## Decisions Made
- `resolveProvider()` returns `ProviderId` type (not `string`) — required by SDK's `TrackOptions.provider` type; discovered during compilation
- `ProviderId` imported directly from `@bearlumen/node-sdk` — not re-exported via main index, required separate type import
- `bearLumen.ts` deleted in same commit as `usageTracker.ts` update — atomic change prevents any window of double-counting

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ProviderId type in resolveProvider()**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `resolveProvider()` returned `string` but SDK's `TrackOptions.provider` expects `ProviderId | undefined` — TypeScript overload resolution failed
- **Fix:** Changed return type to `ProviderId` and added `import type { ProviderId } from '@bearlumen/node-sdk'`
- **Files modified:** `server/src/services/bearLumenSdk.ts`
- **Verification:** `npx tsc --noEmit` returned zero errors after fix
- **Committed in:** `bb9b2ad` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript type mismatch)
**Impact on plan:** Auto-fix required for compilation correctness. No scope creep. SDK API worked exactly as documented.

## Issues Encountered
- SDK was confirmed to exist on npm (v0.2.0) despite "fictional service" warning in plan context — installed cleanly with `yarn workspace server add @bearlumen/node-sdk`

## User Setup Required
None — no new environment variables required. `BEAR_LUMEN_API_KEY` was already added in Plan 01. SDK is null (no-op) when key is blank.

## Next Phase Readiness
- Bear Lumen SDK integration is complete for all 4 usage event types
- Bear Lumen REST path (bearLumen.ts) is deleted — SDK is now the sole forwarding path
- Any new `record*` function added to `usageTracker.ts` must call `trackBearLumen` to maintain coverage
- Phase 03 is now complete (both plans executed)

---
*Phase: 03-persist-usage-data-with-bear-lumen-integration*
*Completed: 2026-02-25*
