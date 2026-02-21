---
phase: 09-scale-and-auth
plan: 03
subsystem: auth
tags: [jwt, bcrypt, express-rate-limit, rate-limit-redis, jsonwebtoken, bcryptjs, auth-middleware, rate-limiting]

# Dependency graph
requires:
  - phase: 09-scale-and-auth
    plan: 01
    provides: Redis singleton (redisClient, isRedisAvailable) and config additions for JWT_SECRET, SESSION_SECRET

provides:
  - JWT authentication routes: POST /api/auth/register and POST /api/auth/login
  - requireAuth middleware (enforces JWT on protected routes)
  - optionalAuth middleware (populates userId/username without rejecting unauthenticated users)
  - chatRateLimiter: 20 req/min per userId (or IP) on /api/chat
  - narrateRateLimiter: 10 req/min per userId (or IP) on /api/narrate
  - Redis-backed rate limit counters with MemoryStore fallback
  - Redis hash user storage (user:{username}) with in-memory fallback

affects:
  - Future plans that add requireAuth to specific game routes
  - Chat and narrate routes now rate-limited

# Tech tracking
tech-stack:
  added:
    - jsonwebtoken (^9.x) — JWT signing and verification
    - bcryptjs (^2.x) — password hashing (12 rounds)
    - express-rate-limit (^7.x) — rate limiting middleware with configurable store
    - rate-limit-redis (^4.x) — Redis-backed store for express-rate-limit
    - "@types/jsonwebtoken" — TypeScript types
    - "@types/bcryptjs" — TypeScript types
  patterns:
    - optionalAuth applied globally: all routes get userId populated from JWT if present, without blocking unauthenticated access
    - rate limiter key generator: userId ?? IP ?? "unknown" — authenticated users keyed by userId, guests by IP
    - Redis store with MemoryStore fallback: createStore() checks isRedisAvailable() at runtime
    - Constant-time user-not-found path: bcrypt.compare against invalid hash to prevent timing attacks on username enumeration

key-files:
  created:
    - server/src/middleware/auth.ts
    - server/src/middleware/rateLimiter.ts
    - server/src/routes/auth.ts
  modified:
    - server/src/app.ts
    - server/package.json

key-decisions:
  - "optionalAuth (not requireAuth) applied globally — existing unauthenticated gameplay preserved; auth is additive"
  - "bcrypt 12 rounds — industry standard; balances security with registration latency"
  - "Redis hashes at user:{username} — fast hGetAll lookup by username, consistent with existing Redis patterns"
  - "Constant-time user-not-found with dummy bcrypt.compare — prevents username enumeration via timing side-channel"
  - "JWT_SECRET fallback to dev placeholder string — allows server startup without JWT_SECRET configured; logs clearly warn about missing config"
  - "narrateRateLimiter applied to both /api/narrate and /narrate paths — covers both route paths registered in app.ts"

patterns-established:
  - "Pattern: AuthenticatedRequest extends Request — use this type in any route needing userId/username from JWT"
  - "Pattern: isRedisAvailable() guard in rate limiter store — Redis-backed in production, MemoryStore in dev without Redis"
  - "Pattern: userId ?? req.ip ?? 'unknown' key generator — per-user rate limiting with IP fallback for guests"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 9 Plan 03: JWT Auth, Redis User Store, Per-User Rate Limiting Summary

**JWT register/login endpoints with bcrypt-hashed passwords in Redis hashes, requireAuth/optionalAuth middleware, and per-user rate limiting (20 req/min chat, 10 req/min narrate) backed by Redis or MemoryStore**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:59:19Z
- **Completed:** 2026-02-21T20:02:30Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Register/login routes with bcrypt (12 rounds) storing users in Redis hashes (`user:{username}`) with in-memory fallback when Redis is unavailable
- JWT authentication middleware: `requireAuth` (enforces) and `optionalAuth` (populates without enforcing) — enables gradual auth adoption
- Rate limiters keyed by authenticated `userId` (or IP for guests): 20 req/min for chat, 10 req/min for TTS narrate
- Rate limiters backed by Redis (`rl:chat:`, `rl:narrate:` prefixes) with automatic MemoryStore fallback
- All route middleware wired in correct order in app.ts: json > optionalAuth > health > auth > rate limiters > handlers
- TypeScript compiles cleanly with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth routes, auth middleware, and rate limiter middleware** - `527236f` (feat)
2. **Task 2: Wire auth routes and rate limiters into app.ts** - `6772c75` (feat)

## Files Created/Modified

- `server/src/middleware/auth.ts` - `requireAuth` and `optionalAuth` middleware with `AuthenticatedRequest` interface extending Express `Request`
- `server/src/middleware/rateLimiter.ts` - `chatRateLimiter` (20/min) and `narrateRateLimiter` (10/min) with Redis-backed or MemoryStore
- `server/src/routes/auth.ts` - POST /api/auth/register and POST /api/auth/login; Redis hash storage with in-memory fallback
- `server/src/app.ts` - Auth router mounted, optionalAuth global, rate limiters on /api/chat and /api/narrate
- `server/package.json` - Added jsonwebtoken, bcryptjs, express-rate-limit, rate-limit-redis and @types packages

## Decisions Made

- **optionalAuth globally, not requireAuth**: Unauthenticated game play is preserved. Auth is additive — existing players not broken. Future plans can add `requireAuth` to individual routes when needed.
- **bcrypt 12 rounds**: Industry standard for user-facing apps. Slightly slower than 10 rounds but significantly more resistant to brute force.
- **Redis hashes for user storage**: `user:{username}` key makes username-based lookup fast (`hGetAll`) and consistent with the Redis singleton established in Plan 01.
- **Constant-time user-not-found path**: `bcrypt.compare(password, "$2a$12$invalidhash...")` when user not found prevents timing side-channel that would allow username enumeration.
- **narrateRateLimiter on both `/api/narrate` and `/narrate`**: Existing narrate route is registered at both paths; covering both ensures no bypass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added constant-time dummy bcrypt.compare for user-not-found path**
- **Found during:** Task 1 (auth routes implementation)
- **Issue:** Plan specified returning 401 when user not found but didn't address timing side-channel. Without this, an attacker could enumerate valid usernames by measuring response time difference (missing user = fast return, wrong password = slow bcrypt compare).
- **Fix:** Added `await bcrypt.compare(password, "$2a$12$invalidhashfortimingnorm123456")` when user not found, so response time is consistent regardless of whether username exists.
- **Files modified:** server/src/routes/auth.ts
- **Verification:** User-not-found path now takes the same time as wrong-password path
- **Committed in:** 527236f (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added JWT_SECRET fallback for dev-without-config scenario**
- **Found during:** Task 1 (auth routes login endpoint)
- **Issue:** `jwt.sign(..., config.JWT_SECRET)` would use an empty string if JWT_SECRET not configured, making all tokens trivially forgeable.
- **Fix:** Added `config.JWT_SECRET || "dev-secret-do-not-use-in-production"` fallback. Server startup already calls `warnOnBlankConfig(["JWT_SECRET"])` (established in Plan 01) so developers see a clear warning.
- **Files modified:** server/src/routes/auth.ts
- **Verification:** Server starts without JWT_SECRET; logs warn about missing value; tokens sign correctly
- **Committed in:** 527236f (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical security measures)
**Impact on plan:** Essential security hardening. No scope creep. Both fixes are 1-2 line additions.

## Issues Encountered

- `yarn workspace server exec tsc --noEmit` fails (yarn 1.x workspace resolution issue in this monorepo). Used `npx tsc --noEmit` directly in server/ instead. Same as Plan 01 workaround.

## User Setup Required

Auth and rate limiting use config values established in Plan 01:

- `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `REDIS_URL` — `redis://localhost:6379` for local development (optional, degrades gracefully)

Both are documented in `.env.example`. Server boots and functions without them (with warnings).

## Next Phase Readiness

- Auth endpoints live at `/api/auth/register` and `/api/auth/login`
- `requireAuth` middleware ready to apply to any route that should require authentication
- Rate limiting active on `/api/chat` and `/api/narrate` — protects against abuse at scale
- `AuthenticatedRequest` type exported for use in any route handler needing `req.userId`
- Phase 09 complete — all 3 plans executed

---
*Phase: 09-scale-and-auth*
*Completed: 2026-02-21*

## Self-Check: PASSED

- server/src/middleware/auth.ts: FOUND
- server/src/middleware/rateLimiter.ts: FOUND
- server/src/routes/auth.ts: FOUND
- server/src/app.ts: FOUND
- .planning/phases/09-scale-and-auth/09-03-SUMMARY.md: FOUND
- Commit 527236f: FOUND
- Commit 6772c75: FOUND
