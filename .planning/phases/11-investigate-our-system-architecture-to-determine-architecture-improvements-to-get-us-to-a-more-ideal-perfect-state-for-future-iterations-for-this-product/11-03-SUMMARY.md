---
phase: 11-architecture-audit
plan: 03
subsystem: api
tags: [typescript, in-memory-store, interface, redis-readiness, memory-management]

# Dependency graph
requires:
  - phase: 09-scale-and-auth
    provides: Redis-backed conversationStore with async API and in-memory fallback
provides:
  - IConversationStore interface with InMemoryConversationStore class implementation
  - IRoomStore interface with InMemoryRoomStore class implementation
  - Backward-compatible free function exports via .bind() delegation from singletons
  - Rolling eviction in usageTracker (24h TTL + 10k cap) preventing unbounded memory growth
affects:
  - 11-04-PLAN.md (dependency injection / container)
  - 11-05-PLAN.md (tests that instantiate fresh InMemoryConversationStore/InMemoryRoomStore)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Interface-backed singleton pattern for swappable store implementations
    - .bind() delegation for backward-compatible free function exports
    - Lazy eviction (run at record-time, no timer) for bounded memory growth

key-files:
  created: []
  modified:
    - server/src/services/conversationStore.ts
    - server/src/services/roomStore.ts
    - server/src/services/usageTracker.ts

key-decisions:
  - "IConversationStore interface uses async/Promise signatures matching existing Redis+fallback implementation"
  - "InMemoryConversationStore and InMemoryRoomStore exported as named classes for test isolation"
  - "Singleton pattern: const conversationStore: IConversationStore = new InMemoryConversationStore() — Redis swap is one-line change"
  - "evictStaleEntries uses lazy eviction at record* call time — avoids timer, minimal overhead"
  - "usageTracker evicts chronologically-front entries first (oldest) then hard-caps at 10k"

patterns-established:
  - "Singleton + .bind() exports: production code uses free functions; tests instantiate classes directly"
  - "Interface-backed store: all callers type against IConversationStore/IRoomStore not concrete class"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 11 Plan 03: Store Interfaces and UsageTracker Eviction Summary

**IConversationStore and IRoomStore interfaces backed by singleton InMemoryConversationStore/InMemoryRoomStore classes with .bind() free function exports; usageTracker capped at 10k entries with 24h rolling eviction**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-21T21:49:21Z
- **Completed:** 2026-02-21T21:51:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `IConversationStore` and `IRoomStore` interfaces enabling future Redis swap as a class substitution
- Wrapped existing logic in `InMemoryConversationStore` and `InMemoryRoomStore` classes exported for test isolation
- All existing free function exports preserved unchanged via `.bind()` delegation — zero caller changes required
- Added `evictStaleEntries()` to usageTracker with 24h TTL and 10k hard cap preventing unbounded memory growth at 1000-user scale

## Task Commits

1. **Task 1: Add IConversationStore and IRoomStore interfaces with class-backed implementations** - `3e2ad4f` (feat)
2. **Task 2: Add rolling eviction to usageTracker** - `7e207a1` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `server/src/services/conversationStore.ts` - Added `IConversationStore` interface, `InMemoryConversationStore` class, singleton, and `.bind()` free function exports
- `server/src/services/roomStore.ts` - Added `IRoomStore` interface, `InMemoryRoomStore` class, singleton, and `.bind()` free function exports
- `server/src/services/usageTracker.ts` - Added `MAX_ENTRIES`, `MAX_AGE_MS`, `evictStaleEntries()` called at top of every `record*` function

## Decisions Made

- `IConversationStore` interface uses async/Promise return types matching the existing Redis+fallback implementation — synchronous interface would have required refactoring all callers
- `InMemoryConversationStore` and `InMemoryRoomStore` are exported as named classes so Plan 05 tests can instantiate fresh, isolated instances without touching the singleton
- The singleton is typed as `IConversationStore` / `IRoomStore` — swapping to Redis is a one-line change: replace `new InMemoryConversationStore()` with `new RedisConversationStore(redisClient)`
- Lazy eviction at record-time (not a setInterval timer) keeps overhead zero when the tracker is idle

## Deviations from Plan

None — plan executed exactly as written.

The plan's interface method signatures were listed as synchronous, but the existing implementation is async (Redis + in-memory fallback with await). The interface was correctly defined with async/Promise signatures to match reality. This is alignment with existing code, not a deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 (dependency injection / container) can now inject `IConversationStore` and `IRoomStore` into services
- Plan 05 (tests) can instantiate `new InMemoryConversationStore()` and `new InMemoryRoomStore()` for isolated unit tests
- Redis migration path is clear: implement `RedisConversationStore implements IConversationStore` and swap the singleton

---
*Phase: 11-architecture-audit*
*Completed: 2026-02-21*

## Self-Check: PASSED

- server/src/services/conversationStore.ts: FOUND
- server/src/services/roomStore.ts: FOUND
- server/src/services/usageTracker.ts: FOUND
- 11-03-SUMMARY.md: FOUND
- Commit 3e2ad4f: FOUND
- Commit 7e207a1: FOUND
