---
phase: 09-scale-and-auth
plan: 01
subsystem: infra
tags: [redis, node-redis, p-queue, socket.io, redis-adapter, bedrock-queue]

# Dependency graph
requires:
  - phase: 08-multiplayer-mode
    provides: Socket.IO server and initSocketIO function that is now made async
  - phase: 01-scaffold
    provides: config.ts blank-default pattern used for REDIS_URL, JWT_SECRET, SESSION_SECRET

provides:
  - Redis singleton client (server/src/services/redis.ts) with connectRedis and isRedisAvailable helpers
  - Bedrock concurrency queue (server/src/services/bedrockQueue.ts) limiting to 20 concurrent calls
  - Config validation for REDIS_URL, JWT_SECRET, SESSION_SECRET
  - Server startup connects Redis before routes/sockets (server/src/index.ts)
  - Socket.IO Redis Pub/Sub adapter wired conditionally (server/src/sockets/index.ts)

affects:
  - 09-02-PLAN (Redis-backed conversation store depends on redisClient and isRedisAvailable)
  - 09-03-PLAN (rate limiting and auth middleware depend on isRedisAvailable and config values)

# Tech tracking
tech-stack:
  added:
    - redis (node-redis ^4.x) — official Redis client, replaces deprecated ioredis
    - "@socket.io/redis-adapter" — Pub/Sub adapter for cross-instance Socket.IO
    - p-queue (^8.x, native ESM) — concurrency queue for Bedrock call throttling
  patterns:
    - Redis singleton: one createClient() instance shared across all modules, connected once at startup
    - Graceful degradation: REDIS_URL blank = skip connection, all Redis-dependent features degrade
    - Explicit .connect() required: node-redis does not auto-connect (unlike ioredis)
    - PQueue with InstanceType<typeof PQueue> annotation to work around ESM type portability issue (TS2742)

key-files:
  created:
    - server/src/services/redis.ts
    - server/src/services/bedrockQueue.ts
  modified:
    - server/src/services/config.ts
    - server/src/index.ts
    - server/src/sockets/index.ts
    - .env.example

key-decisions:
  - "node-redis (not ioredis) — ioredis is officially deprecated by Redis Inc. as of 2025"
  - "bedrockQueue concurrency: 20 (conservative starting point) — tune upward based on Datadog throttle monitoring"
  - "Redis adapter wired conditionally (only when isRedisAvailable()) — server boots cleanly without Redis"
  - "initSocketIO made async — required for await subClient.connect() in Redis adapter setup"
  - "connectionStateRecovery documented as single-instance only — standard Pub/Sub adapter does not support cross-instance recovery"
  - "InstanceType<typeof PQueue> explicit annotation — avoids TS2742 portability error with ESM p-queue package"

patterns-established:
  - "Pattern: isRedisAvailable() guard — all Redis-dependent code checks this before using redisClient"
  - "Pattern: connectRedis() called in main() before createApp() — guarantees Redis ready before any route executes"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 9 Plan 01: Redis Foundation, Bedrock Queue, Config Summary

**node-redis singleton with graceful degradation, p-queue Bedrock concurrency limiter (20), and Socket.IO Redis adapter wired conditionally in async initSocketIO**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:53:14Z
- **Completed:** 2026-02-21T19:56:30Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Redis singleton client with explicit connect/availability helpers — safe for all downstream modules
- Bedrock concurrency queue limits simultaneous Bedrock calls to 20 with overload detection at 100 pending
- Config now validates REDIS_URL, JWT_SECRET, SESSION_SECRET using blank-default pattern (empty = graceful degradation)
- Server startup connects Redis before any routes or sockets initialize
- Socket.IO Redis Pub/Sub adapter attached when Redis is available (future multi-instance support)
- Server boots cleanly without Redis — warnOnBlankConfig warns but does not block

## Task Commits

Each task was committed atomically:

1. **Task 1: Redis client singleton, Bedrock queue, and config updates** - `6793ac9` (feat)
2. **Task 2: Wire Redis into server startup and Socket.IO adapter** - `99efb16` (feat)

## Files Created/Modified

- `server/src/services/redis.ts` - Singleton redisClient, connectRedis(), isRedisAvailable(); skips connect when REDIS_URL blank
- `server/src/services/bedrockQueue.ts` - PQueue concurrency:20, queueBedrockCall<T>(), isBedrockQueueOverloaded()
- `server/src/services/config.ts` - Added REDIS_URL, JWT_SECRET, SESSION_SECRET to envDefaults and envSchema
- `server/src/index.ts` - Import connectRedis, await connectRedis() before createApp, warnOnBlankConfig for REDIS_URL/JWT_SECRET, await initSocketIO
- `server/src/sockets/index.ts` - Made initSocketIO async, added Redis adapter with subClient.duplicate() when isRedisAvailable()
- `.env.example` - Added Redis and Auth sections with generation hints for secrets

## Decisions Made

- **node-redis over ioredis**: ioredis deprecated by Redis Inc. in 2025; node-redis is the official recommendation per redis.io docs
- **Concurrency 20**: Conservative starting value for Bedrock queue; plan notes to tune upward based on Datadog monitoring
- **Conditional adapter wiring**: `if (isRedisAvailable())` guard means Socket.IO works correctly without Redis — no startup failure
- **initSocketIO made async**: Required to `await subClient.connect()` for Redis adapter; call site in index.ts updated to `await initSocketIO(server)`
- **InstanceType<typeof PQueue> annotation**: Fixes TS2742 — "inferred type cannot be named without reference to priority-queue.js" — a known ESM portability issue with p-queue's type exports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added explicit InstanceType<typeof PQueue> type annotation on bedrockQueue**

- **Found during:** Task 1 (bedrockQueue.ts creation)
- **Issue:** TypeScript TS2742 error — "The inferred type of 'bedrockQueue' cannot be named without a reference to priority-queue.js. A type annotation is necessary." p-queue's default export type isn't portable across module boundaries without annotation.
- **Fix:** Added `export const bedrockQueue: InstanceType<typeof PQueue> = new PQueue(...)` explicit type annotation
- **Files modified:** server/src/services/bedrockQueue.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 6793ac9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 TypeScript type annotation fix)
**Impact on plan:** Necessary for TypeScript strict compilation; no logic change, no scope creep.

## Issues Encountered

- `yarn workspace server` command failed — root package.json uses npm workspaces syntax while yarn 1.x was installed. Resolved by running `npm install` directly in server/ directory.

## User Setup Required

None — no external service configuration required for this plan. Redis is optional (graceful degradation). REDIS_URL, JWT_SECRET, SESSION_SECRET documented in .env.example for Phase 9 Plans 02 and 03.

## Next Phase Readiness

- 09-02: Can now import `redisClient` and `isRedisAvailable` from `redis.ts` to migrate conversationStore to Redis
- 09-03: Can now import `isRedisAvailable` for Redis-backed rate limiting; JWT_SECRET config ready for auth middleware
- Bedrock queue ready for use in chat.ts and turnHandlers.ts (Plans 02/03 scope)

---
*Phase: 09-scale-and-auth*
*Completed: 2026-02-21*

## Self-Check: PASSED

- server/src/services/redis.ts: FOUND
- server/src/services/bedrockQueue.ts: FOUND
- .planning/phases/09-scale-and-auth/09-01-SUMMARY.md: FOUND
- Commit 6793ac9: FOUND
- Commit 99efb16: FOUND
