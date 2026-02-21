---
phase: 09-scale-and-auth
plan: 02
subsystem: database
tags: [redis, node-redis, conversation-store, p-queue, bedrock-queue, async, typescript]

# Dependency graph
requires:
  - phase: 09-scale-and-auth/01
    provides: redisClient singleton and isRedisAvailable() helper, bedrockQueue with queueBedrockCall and isBedrockQueueOverloaded

provides:
  - Redis-backed conversationStore with 7-day TTL, in-memory Map fallback, and async API surface
  - All chat/narrate/multiplayer routes and sockets using async conversationStore
  - Bedrock calls in chat.ts, narrate.ts, and turnHandlers.ts wrapped in concurrency queue
  - 503 backpressure response in chat route when Bedrock queue is overloaded

affects:
  - 09-03-PLAN (auth middleware and rate limiting; same routes/sockets already updated)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redis persistence with in-memory fallback: isRedisAvailable() guard in every store function"
    - "conv:{id} key namespace for Redis conversation storage"
    - "TTL refresh on read: redisClient.expire() called after every getFromRedis()"
    - "queueBedrockCall wrapping all streamBedrockResponse calls: concurrency throttle applied uniformly"
    - "503 backpressure: isBedrockQueueOverloaded() checked at route entry before any work"

key-files:
  created: []
  modified:
    - server/src/services/conversationStore.ts
    - server/src/routes/chat.ts
    - server/src/routes/narrate.ts
    - server/src/sockets/turnHandlers.ts
    - server/src/sockets/roomHandlers.ts

key-decisions:
  - "All conversationStore functions are async; callers must await — TypeScript enforces this at compile time"
  - "CONVERSATION_TTL_SECONDS = 7 days — balances storage cost vs. session longevity for community product"
  - "TTL refreshed on every read (redisClient.expire) — active users never expire, idle sessions clean up naturally"
  - "Bedrock queue wraps all 3 call sites (chat, narrate, turnHandlers) — consistent throttling across single-player and multiplayer"
  - "room:create handler made async — required to await getOrCreate(); Socket.IO supports async event handlers"
  - "503 backpressure at route entry (before SSE headers) — allows clean JSON error response; after SSE headers it would be too late"

patterns-established:
  - "Pattern: getFromRedis/saveToRedis helpers centralize JSON serialization/deserialization"
  - "Pattern: async conversationStore — all modules must await store operations; TypeScript compilation enforces correctness"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 9 Plan 02: Async Redis-backed conversationStore with Bedrock queue wiring Summary

**Redis-backed conversationStore with 7-day TTL and in-memory fallback; all 4 caller modules converted to async; Bedrock queue wired into all 3 Bedrock call sites with 503 backpressure in chat route**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:59:20Z
- **Completed:** 2026-02-21T20:02:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Conversations now persist in Redis with `conv:{id}` keys and 7-day TTL — survive server restarts and multi-instance deployments
- Graceful fallback to in-memory Map when Redis is unavailable — server works identically without Redis configured
- All 4 caller files (chat.ts, narrate.ts, turnHandlers.ts, roomHandlers.ts) properly await every conversationStore function
- Bedrock calls in chat, narrate, and multiplayer turn handlers wrapped in `queueBedrockCall` — concurrency throttled at 20
- Chat route returns 503 immediately when Bedrock queue has 100+ pending calls (backpressure protection)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite conversationStore to Redis-backed with in-memory fallback** - `6bcfc56` (feat)
2. **Task 2: Update all callers to await conversationStore + wire Bedrock queue** - `89bc6f0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `server/src/services/conversationStore.ts` - All 5 functions rewritten as async; Redis path with conv:{id} key and 7-day TTL; isRedisAvailable() guard with in-memory Map fallback; TTL refreshed on every read
- `server/src/routes/chat.ts` - All store calls awaited; queueBedrockCall wrapping streamBedrockResponse; 503 backpressure check at route entry via isBedrockQueueOverloaded()
- `server/src/routes/narrate.ts` - getOrCreate and appendMessage awaited; queueBedrockCall wrapping Bedrock opening monologue call
- `server/src/sockets/turnHandlers.ts` - getOrCreate, appendMessage, getWindowedHistory awaited in both triggerDMOpening and triggerDMResponse; queueBedrockCall on both Bedrock calls
- `server/src/sockets/roomHandlers.ts` - room:create handler made async; getOrCreate awaited

## Decisions Made

- **Async API surface**: All 5 conversationStore functions are now async. TypeScript enforces await at all call sites — missing await is a compile error.
- **7-day TTL**: Balances Redis storage cost against session longevity. Active users refresh TTL on every access, idle sessions expire naturally.
- **TTL refresh on read**: `redisClient.expire()` called after every `getFromRedis()` call — ensures any conversation still being used never expires.
- **503 before SSE headers**: Backpressure check placed before `res.setHeader("Content-Type", "text/event-stream")` so the error can be returned as clean JSON. After SSE headers, error responses can't be HTTP status codes.
- **room:create async handler**: Socket.IO supports async event handlers natively — making room:create async is safe and idiomatic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — TypeScript confirmed all caller errors exactly as expected after Task 1. All 22 errors resolved cleanly in Task 2.

## User Setup Required

None - no external service configuration required for this plan. Redis is optional (graceful degradation).

## Next Phase Readiness

- 09-03: Auth middleware and rate limiting can now be added to chat.ts and narrate.ts — routes already being modified by this plan, so merge conflicts are resolved
- Bedrock queue is fully wired — concurrency throttling active across single-player and multiplayer paths
- Redis conversation store ready — conversations survive server restarts when REDIS_URL is configured

---
*Phase: 09-scale-and-auth*
*Completed: 2026-02-21*

## Self-Check: PASSED

- server/src/services/conversationStore.ts: FOUND
- server/src/routes/chat.ts: FOUND
- server/src/routes/narrate.ts: FOUND
- server/src/sockets/turnHandlers.ts: FOUND
- server/src/sockets/roomHandlers.ts: FOUND
- .planning/phases/09-scale-and-auth/09-02-SUMMARY.md: FOUND
- Commit 6bcfc56: FOUND
- Commit 89bc6f0: FOUND
