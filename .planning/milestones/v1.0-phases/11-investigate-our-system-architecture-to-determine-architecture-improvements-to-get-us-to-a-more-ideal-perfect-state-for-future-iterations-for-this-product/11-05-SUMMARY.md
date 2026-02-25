---
phase: 11-architecture-audit
plan: 05
subsystem: testing
tags: [vitest, unit-tests, promptBuilder, conversationStore, usageTracker, coverage]

# Dependency graph
requires:
  - phase: 11-architecture-audit
    provides: promptBuilder.ts extracted (Plan 02), InMemoryConversationStore exported class (Plan 03), evictStaleEntries exported (Plan 03)

provides:
  - vitest 2.x test infrastructure for server workspace
  - 41 unit tests across 3 test files covering pure service modules
  - _testInternals export on usageTracker for isolated test resets
  - vi.mock pattern for redis dependency in conversationStore tests

affects:
  - future-plans: any plan adding service logic should add tests to __tests__/services/

# Tech tracking
tech-stack:
  added:
    - vitest 2.1.9 (test runner, Node 23 compatible via --ignore-engines)
    - "@vitest/coverage-v8 2.x" (V8 coverage provider)
  patterns:
    - Fresh class instance per test via beforeEach for InMemoryConversationStore
    - vi.mock for external module stubs (redis.js) without network access
    - _testInternals object with entries reference + reset() for module-level state isolation

key-files:
  created:
    - server/vitest.config.ts
    - server/src/__tests__/services/promptBuilder.test.ts
    - server/src/__tests__/services/conversationStore.test.ts
    - server/src/__tests__/services/usageTracker.test.ts
  modified:
    - server/package.json (added test, test:watch, test:coverage scripts)
    - server/src/services/usageTracker.ts (added _testInternals export)

key-decisions:
  - "vitest 2.x (not 4.x): yarn's engine check rejected vitest 4.x despite Node 23 >= 20; pinned to ^2.0.0 with --ignore-engines to bypass yarn semver parser quirk"
  - "vi.mock('../../services/redis.js') in conversationStore tests: stubs out Redis client creation entirely, forcing in-memory path without any network dependency"
  - "_testInternals added to usageTracker.ts: exports module-level entries array reference + reset() to enable isolated test state; never called from production code"
  - "Fresh InMemoryConversationStore instance per test via beforeEach: avoids shared state across tests, enables reliable isolation without module reset"

patterns-established:
  - "Unit test isolation pattern: mock external dependencies (redis, config) at vi.mock level; don't require running services"
  - "_testInternals pattern: module-level state exposed for testing via explicit export, clearly marked as test-only"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 11 Plan 05: Unit Testing Infrastructure Summary

**Vitest 2.x test infrastructure with 41 passing unit tests across promptBuilder, InMemoryConversationStore (mocked redis), and usageTracker (eviction + _testInternals)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-21T21:56:07Z
- **Completed:** 2026-02-21T21:58:53Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Installed vitest 2.x and configured server workspace test runner (node environment, `src/__tests__/**/*.test.ts` pattern)
- 11 tests for `promptBuilder.ts`: DM_SYSTEM_PROMPT content assertions (adventure name, dice ranges, mood/voice tags) and `buildMultiplayerSystemPrompt` (roster, pronouns, multiplayer copy)
- 16 tests for `InMemoryConversationStore`: getOrCreate (UUID creation, idempotency, class/pronouns), appendMessage (CRUD, error on missing ID), getWindowedHistory (empty, windowing), getCharacterClass, getPronouns — all using fresh instances with redis fully mocked
- 14 tests for `usageTracker`: recordBedrockUsage/TTS/Music, getGlobalUsage (feature/model breakdown), getConversationUsage (filter), evictStaleEntries (24h removal, auto-eviction on record), using `_testInternals.reset()` for isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest and create test configuration** - `72b0e19` (chore)
2. **Task 2: Write unit tests for promptBuilder, conversationStore, usageTracker** - `c7cf18e` (test)

## Files Created/Modified

- `server/vitest.config.ts` - Vitest config: node environment, __tests__ include pattern, V8 coverage provider
- `server/package.json` - Added test, test:watch, test:coverage scripts
- `server/src/__tests__/services/promptBuilder.test.ts` - 11 tests for DM prompt content and multiplayer builder
- `server/src/__tests__/services/conversationStore.test.ts` - 16 tests for CRUD, windowing, class/pronouns; mocks redis.js
- `server/src/__tests__/services/usageTracker.test.ts` - 14 tests for recording, eviction, filtering
- `server/src/services/usageTracker.ts` - Added `_testInternals` export for test isolation

## Decisions Made

- **vitest 2.x not 4.x**: Yarn's engine semver check rejected vitest 4.x claiming Node 23.11.0 incompatible with `^20.0.0 || ^22.0.0 || >=24.0.0`. Used `--ignore-engines` and pinned to `^2.0.0` which works correctly on Node 23.
- **vi.mock for redis**: conversationStore.ts imports redis.js at module load. Mocking it prevents Redis `createClient` from being called in tests, ensuring pure in-memory path without network dependency.
- **_testInternals pattern**: Added to usageTracker.ts so tests can call `reset()` in `beforeEach`, providing proper test isolation. Clearly named and documented as test-only.
- **Fresh InMemoryConversationStore per test**: Instantiating a new class in `beforeEach` is simpler than module resetting and gives clean isolation for all conversation store tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added _testInternals to usageTracker.ts**
- **Found during:** Task 2 (usageTracker tests)
- **Issue:** Plan recommended adding `_testInternals` but didn't mark it as done in the source file. Without it, eviction tests would share cumulative module-level state and produce flaky results.
- **Fix:** Added `export const _testInternals = { entries, reset() { entries.splice(0, entries.length); } }` to usageTracker.ts
- **Files modified:** server/src/services/usageTracker.ts
- **Verification:** All 14 usageTracker tests pass with proper isolation
- **Committed in:** c7cf18e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking for correct test isolation)
**Impact on plan:** Required for test correctness. No scope creep.

## Issues Encountered

- Yarn engine check blocked vitest 4.x despite Node 23 being >= 20. Resolved by using vitest 2.x with `--ignore-engines`. Tests run correctly on Node 23.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full test infrastructure in place; any future service code can add tests to `server/src/__tests__/services/`
- Phase 11 (Architecture Audit) now complete: Plans 01-05 all done
- Run tests anytime with: `yarn workspace server run test`

---
*Phase: 11-architecture-audit*
*Completed: 2026-02-21*
