---
phase: 11-architecture-audit
plan: 01
subsystem: infra
tags: [helmet, cors, express-rate-limit, security, rate-limiting, middleware]

# Dependency graph
requires:
  - phase: 09-scale-and-auth
    provides: rateLimiter.ts with chatRateLimiter/narrateRateLimiter, auth middleware, app.ts structure
provides:
  - HTTP security headers via helmet on all Express responses
  - CORS origin allowlist (ALLOWED_ORIGINS env var) shared by Express and Socket.IO
  - musicLimiter (20/min) protecting /api/music and /music routes
  - security.ts module exporting helmetMiddleware, corsMiddleware, ALLOWED_ORIGINS
  - rateLimits.ts module exporting chatLimiter, narrateLimiter, musicLimiter with conversationId-based keys
affects: [12, future-phases, production-deployment]

# Tech tracking
tech-stack:
  added: [helmet@8.1.0, cors@2.8.6, @types/cors@2.8.19]
  patterns:
    - Security middleware registered first (before body parser) in Express middleware chain
    - Single ALLOWED_ORIGINS source-of-truth shared between Express CORS and Socket.IO CORS
    - conversationId-based rate limiting key falls back to req.ip then "unknown"
    - logEvent("rate_limit.exceeded") on every 429 for Datadog observability

key-files:
  created:
    - server/src/middleware/security.ts
    - server/src/middleware/rateLimits.ts
  modified:
    - server/src/app.ts
    - server/src/sockets/index.ts
    - server/package.json

key-decisions:
  - "helmet CSP connect-src: self preserves SSE EventSource connections on /api/chat"
  - "ALLOWED_ORIGINS exported from security.ts and imported by sockets/index.ts — single source of truth for allowed origins"
  - "musicLimiter (20/min) added to /api/music and /music paths — previously unprotected route"
  - "rateLimits.ts uses conversationId key (not userId) matching plan spec; existing rateLimiter.ts uses userId — both coexist"
  - "helmetMiddleware and corsMiddleware placed before express.json() body parser — security headers sent even on 400/parse errors"

patterns-established:
  - "Security middleware first: helmet then cors then body parser then auth then routes"
  - "Rate limiter middleware applied as app.use('/path', limiter) before app.use(router)"

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 11 Plan 01: Security Middleware (Helmet, CORS, Music Rate Limit) Summary

**Helmet CSP headers + CORS allowlist (shared with Socket.IO) + musicLimiter protecting the previously unguarded /api/music route**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T21:49:41Z
- **Completed:** 2026-02-21T21:51:57Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Installed helmet, cors, @types/cors in server workspace
- Created `security.ts` with helmetMiddleware (CSP preserving SSE), corsMiddleware (ALLOWED_ORIGINS from env), and ALLOWED_ORIGINS export
- Created `rateLimits.ts` with chatLimiter (60/min), narrateLimiter (10/min), musicLimiter (20/min) using conversationId key with logEvent on rate_limit.exceeded
- Wired helmet + CORS as first middleware in app.ts (before body parser)
- Added musicLimiter on /api/music and /music in app.ts
- Socket.IO CORS updated to use ALLOWED_ORIGINS instead of hardcoded localhost string

## Task Commits

Each task was committed atomically:

1. **Task 1: Install security deps and create middleware modules** - `7658dcc` (feat)
2. **Task 2: Wire security and rate limiting into app.ts and Socket.IO** - `a937743` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `server/src/middleware/security.ts` - Helmet + CORS middleware with ALLOWED_ORIGINS export
- `server/src/middleware/rateLimits.ts` - chatLimiter, narrateLimiter, musicLimiter with conversationId-based keys and logEvent
- `server/src/app.ts` - Added helmetMiddleware, corsMiddleware as first middleware; added musicLimiter on /api/music and /music
- `server/src/sockets/index.ts` - Replaced hardcoded "http://localhost:5173" with ALLOWED_ORIGINS import
- `server/package.json` - Added helmet, cors as dependencies; @types/cors as devDependency

## Decisions Made
- helmet CSP `connect-src: 'self'` preserves SSE EventSource connections — without this, browser blocks /api/chat streaming
- `ALLOWED_ORIGINS` exported from security.ts and consumed by both Express CORS and Socket.IO — single source of truth, no drift
- musicLimiter added to both `/api/music` and `/music` paths matching the dual-path pattern already in use for narrateRateLimiter
- rateLimits.ts uses conversationId as primary key (per-session, pre-auth) while existing rateLimiter.ts uses userId (post-auth) — both coexist and complement each other

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
- Set `ALLOWED_ORIGINS` env var for production deployment: comma-separated list of allowed origins (e.g., `https://yourdomain.com`)
- Without this, only `http://localhost:5173` is allowed

## Next Phase Readiness
- Security middleware complete. All Express responses now carry helmet headers.
- CORS is restricted to ALLOWED_ORIGINS (configurable via env).
- Music route is now rate-limited at 20 req/min per conversation.
- Ready for Phase 11 Plan 02.

## Self-Check: PASSED

All files present. All commits verified (7658dcc, a937743).

---
*Phase: 11-architecture-audit*
*Completed: 2026-02-21*
