---
phase: 12-production-hardening
plan: 01
subsystem: auth
tags: [jwt, rate-limiting, express-rate-limit, redis, security]

# Dependency graph
requires:
  - phase: 09-scale-and-auth
    provides: rateLimiter.ts with chatRateLimiter/narrateRateLimiter, auth.ts with requireAuth/optionalAuth, routes/auth.ts with jwt.sign fallback
  - phase: 11-architecture-audit
    provides: rateLimiter.ts cleaned up, test infrastructure in place
provides:
  - registerLimiter export (3/min per IP, Redis-backed with rl:register: prefix)
  - loginLimiter export (10/min per IP, Redis-backed with rl:login: prefix)
  - Auth limiters mounted in app.ts before authRouter
  - DEV_SECRET fallback in auth.ts jwt.verify (consistent with jwt.sign in routes/auth.ts)
affects: [phase-12-02, any future auth hardening, any route ordering changes in app.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IP-keyed rate limiting for pre-auth endpoints (no userId available before authentication)"
    - "DEV_SECRET constant: single module-level string shared by all jwt.verify calls, matching sign fallback"
    - "Auth limiter mount order: IP limiters at step 5 before authRouter at step 6 ensures limiting fires before route handler"

key-files:
  created: []
  modified:
    - server/src/middleware/rateLimiter.ts
    - server/src/app.ts
    - server/src/middleware/auth.ts

key-decisions:
  - "registerLimiter and loginLimiter use req.ip (not userId) — auth endpoints are unauthenticated by definition, userId not yet available"
  - "Distinct Redis prefixes: rl:register: and rl:login: — separate counters prevent login limit exhaustion from blocking register and vice versa"
  - "DEV_SECRET constant in auth.ts mirrors the inline string in routes/auth.ts jwt.sign — single source of truth per module, consistent dev-mode behavior"
  - "Auth limiters mounted before authRouter at step 5 — Express middleware ordering guarantees limiter fires before route handler on every request"

patterns-established:
  - "IP-keyed limiters for unauthenticated endpoints: keyGenerator: (req) => req.ip ?? 'unknown'"
  - "Redis-backed rate limiting with per-endpoint prefix for independent counters"

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 12 Plan 01: Auth Rate Limiting and JWT Fix Summary

**IP-based rate limiting on /api/auth/register (3/min) and /api/auth/login (10/min) with Redis-backed stores, plus DEV_SECRET fallback in jwt.verify to match jwt.sign for consistent dev-mode auth**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-22T04:40:43Z
- **Completed:** 2026-02-22T04:44:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `registerLimiter` (3 req/min/IP) and `loginLimiter` (10 req/min/IP) to rateLimiter.ts with Redis-backed stores and distinct key prefixes
- Wired both auth limiters in app.ts at step 5, before authRouter mounts at step 6 — mount order guarantees limiting fires on every request
- Added `DEV_SECRET` constant to auth.ts and applied `config.JWT_SECRET || DEV_SECRET` in both `requireAuth` and `optionalAuth` jwt.verify calls, fixing dev-mode auth breakage where verify got an empty string while sign already had the fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add auth rate limiters to rateLimiter.ts** - `f122d8d` (feat)
2. **Task 2: Wire auth limiters in app.ts and fix JWT verify fallback** - `9a90d12` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `server/src/middleware/rateLimiter.ts` - Added registerLimiter and loginLimiter exports following existing chatRateLimiter/narrateRateLimiter pattern; IP-keyed with distinct Redis prefixes
- `server/src/app.ts` - Updated import to include registerLimiter + loginLimiter; added step 5 auth limiter mounts before authRouter; renumbered steps 6-9
- `server/src/middleware/auth.ts` - Added DEV_SECRET constant; updated both jwt.verify calls to use config.JWT_SECRET || DEV_SECRET

## Decisions Made

- registerLimiter and loginLimiter use `req.ip ?? "unknown"` (not userId) because auth endpoints are unauthenticated by definition — userId is not yet available
- Distinct Redis prefixes (`rl:register:` and `rl:login:`) keep counters independent — prevents exhausting the login limit by hammering register
- `DEV_SECRET` defined as a module-level constant in auth.ts rather than inlined twice in jwt.verify calls — matches the pattern in routes/auth.ts (where it was already inlined in jwt.sign)
- Auth limiters mounted at step 5, authRouter at step 6 — correct Express middleware ordering ensures rate limiting fires before route handler

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all TypeScript compiled clean on first attempt, all 41 existing tests passed without changes.

## User Setup Required

None - no external service configuration required. registerLimiter and loginLimiter automatically fall back to MemoryStore when Redis is unavailable (same behavior as chatRateLimiter/narrateRateLimiter).

## Next Phase Readiness

- Auth endpoints now protected against registration spam (3/min) and credential stuffing (10/min)
- Dev-mode auth works without setting JWT_SECRET (sign and verify now use identical fallback)
- Ready for Phase 12 Plan 02

---
*Phase: 12-production-hardening*
*Completed: 2026-02-22*

## Self-Check: PASSED

- FOUND: server/src/middleware/rateLimiter.ts
- FOUND: server/src/app.ts
- FOUND: server/src/middleware/auth.ts
- FOUND: .planning/phases/12-production-hardening/12-01-SUMMARY.md
- FOUND commit f122d8d: feat(12-01): add registerLimiter and loginLimiter to rateLimiter.ts
- FOUND commit 9a90d12: feat(12-01): wire auth limiters in app.ts and fix JWT verify fallback
