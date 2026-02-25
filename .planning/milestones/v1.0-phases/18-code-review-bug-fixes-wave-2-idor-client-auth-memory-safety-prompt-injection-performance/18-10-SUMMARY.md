---
phase: 18-code-review-bug-fixes-wave-2
plan: 10
subsystem: api
tags: [security, logging, csp, hsts, socket.io, rate-limiting, cleanup]

# Dependency graph
requires:
  - phase: 18-code-review-bug-fixes-wave-2
    provides: All prior plans providing the socket layer and security middleware
provides:
  - HSTS explicit configuration in helmet (1-year maxAge, includeSubDomains)
  - CSP updated to allow ws:/wss: WebSocket and blob: media/worker URLs
  - O(1) fixed-window socket rate limiter replacing O(n) sliding window
  - Consistent structured logEvent in all socket handlers
  - Removed unused _deps parameter and AppDeps interface from createApp
  - Removed tsyringe and reflect-metadata dead dependencies
  - _testInternals gated behind NODE_ENV=test check
  - tsbuildinfo excluded from git
affects: [future-security, future-socket, future-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "O(1) fixed-window counter for socket rate limiting (not sliding window)"
    - "_testInternals = NODE_ENV === 'test' ? { ... } : undefined pattern"
    - "logEvent replaces console.log/error/warn in all socket handlers"
    - "getOrCreate(conversationId?, userId?, characterClass?, pronouns?) — 4-param API"

key-files:
  created: []
  modified:
    - server/src/middleware/security.ts
    - server/src/sockets/index.ts
    - server/src/sockets/turnHandlers.ts
    - server/src/sockets/roomHandlers.ts
    - server/src/app.ts
    - server/src/index.ts
    - server/src/services/usageTracker.ts
    - server/src/routes/narrate.ts
    - server/src/__tests__/services/conversationStore.test.ts
    - server/src/__tests__/services/usageTracker.test.ts
    - server/package.json
    - yarn.lock
    - .gitignore

key-decisions:
  - "O(1) fixed-window rate limiter chosen over sliding window for socket events — acceptable trade-off (slightly less precise but constant time per check)"
  - "_testInternals gated via process.env.NODE_ENV === 'test' ternary — tests use non-null assertion since vitest sets NODE_ENV=test by default"
  - "narrate.ts getOrCreate bug: was passing characterClass as userId — fixed to pass req.userId correctly"
  - "conversationStore.test.ts updated to use 4-param API: getOrCreate(id?, userId?, characterClass?, pronouns?)"

patterns-established:
  - "All socket-layer errors use logEvent instead of console.log/error/warn"
  - "Test-only exports use NODE_ENV=test guard and consumers use non-null assertion"

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 18 Plan 10: P3 Cleanup Summary

**HSTS + CSP hardening, O(1) socket rate limiter, structured logging in all socket handlers, dead code removal (tsyringe, _deps), and _testInternals env gate**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-22T21:09:20Z
- **Completed:** 2026-02-22T21:15:47Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Hardened HTTP security headers: HSTS 1-year max-age + includeSubDomains, CSP now allows ws:/wss: for WebSocket and blob: for audio/video/workers
- Socket rate limiter now O(1) per check (fixed-window counter) instead of O(n) sliding window with splice
- All console.log/error/warn in sockets/ replaced with structured logEvent calls (turnHandlers, roomHandlers, index)
- Removed dead `_deps: AppDeps` parameter from createApp, removed tsyringe + reflect-metadata packages, tsbuildinfo in .gitignore
- Gated `_testInternals` behind `NODE_ENV === "test"` check — undefined in production

## Task Commits

Each task was committed atomically:

1. **Task 1: Security headers + socket rate limiter + .gitignore** - `223e0b9` (feat)
2. **Task 2: logEvent everywhere + dead code removal + _testInternals gate** - `3fb121b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `server/src/middleware/security.ts` - Added HSTS config, updated CSP with ws:/blob:
- `server/src/sockets/index.ts` - O(1) rate limiter, logEvent for Redis adapter + rate limit exceeded
- `server/src/sockets/turnHandlers.ts` - logEvent replacing all console.error calls
- `server/src/sockets/roomHandlers.ts` - logEvent replacing all console.log/error calls
- `server/src/app.ts` - Removed _deps parameter and AppDeps interface, removed Driver import
- `server/src/index.ts` - Updated createApp() call (no args)
- `server/src/services/usageTracker.ts` - _testInternals gated behind NODE_ENV=test
- `server/src/routes/narrate.ts` - Fixed getOrCreate to pass req.userId as second arg
- `server/src/__tests__/services/conversationStore.test.ts` - Updated to 4-param API + IDOR tests
- `server/src/__tests__/services/usageTracker.test.ts` - Use internals alias with non-null assertion
- `server/package.json` - Removed tsyringe and reflect-metadata
- `yarn.lock` - Updated after package removal
- `.gitignore` - Added *.tsbuildinfo

## Decisions Made

- O(1) fixed-window counter chosen over sliding window for socket rate limiting: simpler, no array allocation, consistent performance
- `_testInternals` gated via ternary (`NODE_ENV === "test" ? { ... } : undefined`); tests use `const internals = _testInternals!` non-null assertion since vitest guarantees `NODE_ENV=test`
- `narrate.ts` bug found: two `getOrCreate` calls were passing `characterClass` as `userId` — fixed to pass `req.userId` correctly, enabling proper IDOR ownership tracking on narrate route

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getOrCreate userId parameter alignment in narrate.ts**
- **Found during:** Task 1 (while running tests — 5 conversationStore tests failing)
- **Issue:** The `getOrCreate` function signature has 4 params: `(conversationId?, userId?, characterClass?, pronouns?)`. The `narrate.ts` route was calling `getOrCreate(undefined, characterClass, pronouns)` — passing `characterClass` as `userId`. This silently broke IDOR ownership checks on the narrate route (any characterClass string would become the userId) and left pronouns unset.
- **Fix:** Updated both calls in `narrate.ts` to `getOrCreate(undefined, req.userId, characterClass, pronouns)`
- **Files modified:** `server/src/routes/narrate.ts`
- **Verification:** All 53 tests pass; TypeScript compiles clean
- **Committed in:** `223e0b9` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed conversationStore tests to use correct 4-param API**
- **Found during:** Task 1 (pre-existing test failures discovered)
- **Issue:** Tests were written with old 3-param `getOrCreate(id, characterClass, pronouns)` signature but implementation uses `(id, userId, characterClass, pronouns)`. This caused `characterClass` to be treated as `userId`, and the IDOR ownership check would fire incorrectly on subsequent calls.
- **Fix:** Updated all test calls to use explicit `undefined` for userId: `getOrCreate('id', undefined, 'Warrior')`
- **Files modified:** `server/src/__tests__/services/conversationStore.test.ts`
- **Verification:** 53 tests pass (5 additional IDOR coverage tests added by linter)
- **Committed in:** `223e0b9` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed usageTracker test to use non-null assertion for _testInternals**
- **Found during:** Task 2 (_testInternals gate introduced TypeScript errors in test file)
- **Issue:** After gating `_testInternals` as `T | undefined`, TypeScript reported 19 errors in the test file
- **Fix:** Extracted `const internals = _testInternals!` alias with non-null assertion at top of test file
- **Files modified:** `server/src/__tests__/services/usageTracker.test.ts`
- **Verification:** TypeScript compiles clean (excluding pre-existing bedrockQueue.ts error), 53 tests pass
- **Committed in:** `3fb121b` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 - Bugs)
**Impact on plan:** All auto-fixes corrected pre-existing bugs uncovered during plan execution. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `bedrockQueue.ts` (`throwOnTimeout` not in PQueue Options type) — unrelated to this plan, present before execution, not introduced by our changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All P3 cleanup items complete: HSTS, CSP, rate limiter O(1), socket logging, dead code removed
- Phase 18 code review fix plans all complete
- 53 tests pass, TypeScript compiles clean

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-22*
