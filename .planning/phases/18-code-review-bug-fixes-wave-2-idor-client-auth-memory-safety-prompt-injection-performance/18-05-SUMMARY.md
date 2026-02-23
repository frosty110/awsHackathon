---
phase: 18-code-review-bug-fixes-wave-2
plan: 05
subsystem: auth
tags: [jwt, refresh-token, bearer-token, socket-io, react, localStorage]

# Dependency graph
requires:
  - phase: 18-01
    provides: IDOR fix, conversation ownership, /api/usage auth enforcement
  - phase: 17-01
    provides: requireAuth middleware on all game routes, getJwtSecret helper
  - phase: 09-03
    provides: login/register endpoints, bcrypt user storage, Redis user hashes

provides:
  - Server: 15-minute JWT access tokens (was 7 days)
  - Server: POST /api/auth/refresh with token rotation (Redis + in-memory fallback)
  - Server: Register auto-login (returns token + refreshToken immediately)
  - Client: client/src/services/auth.ts — setAuthTokens, getAuthToken, clearAuth, authHeaders, refreshAccessToken, restoreAuth
  - Client: client/src/components/LoginForm.tsx — login/register UI with dark fantasy theme
  - Client: Bearer token on all /api/chat and /api/narrate fetch calls
  - Client: 401 retry with refreshAccessToken() on /api/chat
  - Client: Socket.IO auth callback passing JWT in handshake
  - Client: Login-gate on app start, Logout button, username display in header

affects: [all future auth-dependent features, multiplayer socket auth, single-player chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token rotation: each refresh invalidates old refresh token, issues new one"
    - "localStorage persistence for auth across page refreshes with in-memory primary"
    - "401 retry pattern: attempt token refresh then retry request once on auth failure"
    - "Socket.IO auth callback form (not static options.auth): reads token at connection time, avoids stale closure"

key-files:
  created:
    - client/src/services/auth.ts
    - client/src/components/LoginForm.tsx
  modified:
    - server/src/routes/auth.ts
    - client/src/hooks/useSSEChat.ts
    - client/src/components/AudioPlayer.tsx
    - client/src/services/socket.ts
    - client/src/App.tsx
    - client/src/types/chat.ts

key-decisions:
  - "inMemoryRefreshTokens Map as fallback when Redis unavailable — 7-day TTL via expiresAt timestamp, cleaned at lookup time"
  - "issueRefreshToken() helper centralizes Redis/in-memory dispatch, avoids duplication across login/register/refresh"
  - "Register returns token + refreshToken for immediate play — no separate login step needed after sign-up"
  - "restoreAuth() on App mount: if localStorage has valid tokens, skip login form entirely"
  - "Socket.IO auth uses callback form (cb => cb({ token })) not static auth object — reads token at connection time"
  - "handleLogout disconnects socket, clears auth, resets all game state, navigates to login"

patterns-established:
  - "Auth headers pattern: authHeaders() spreads into fetch headers object — empty object when unauthenticated"
  - "401 retry: on /api/chat 401, call refreshAccessToken() and retry once — prevents stale token from breaking game mid-session"

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 18 Plan 05: Client Auth Integration + JWT Refresh Rotation Summary

**15-minute JWT access tokens with refresh rotation, login/register UI gating gameplay, and Bearer headers on all API and Socket.IO connections**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-23T05:23:30Z
- **Completed:** 2026-02-23T05:26:51Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Server: access tokens shortened to 15m (from 7d), refresh token endpoint with rotation, register auto-issues tokens for immediate play
- Client: auth utility with localStorage persistence, login/register dark fantasy form, Bearer headers on /api/chat and /api/narrate, 401 retry with refresh, Socket.IO auth handshake
- App flow gated behind login — restoreAuth() skips form if localStorage has valid session

## Task Commits

1. **Task 1: Server refresh token flow + 15m access tokens** - `5b9d616` (feat)
2. **Task 2: Client auth utility, login form, and Bearer headers** - `c0b063e` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `server/src/routes/auth.ts` — Added `inMemoryRefreshTokens` Map, `issueRefreshToken()` helper, 15m expiry on login/register, POST /api/auth/refresh endpoint with rotation
- `client/src/services/auth.ts` — New: token storage, `authHeaders()`, `refreshAccessToken()`, `restoreAuth()` with localStorage persistence
- `client/src/components/LoginForm.tsx` — New: login/register form, dark fantasy Tailwind theme, server error display, mode toggle
- `client/src/types/chat.ts` — Added `'login'` to AppState union type
- `client/src/hooks/useSSEChat.ts` — authHeaders on /api/chat (with 401 retry) and /api/narrate
- `client/src/components/AudioPlayer.tsx` — authHeaders on /api/narrate fetch
- `client/src/services/socket.ts` — Auth callback passing `getAuthToken()` in Socket.IO handshake
- `client/src/App.tsx` — LoginForm render, restoreAuth on mount, handleLogout, username display, Logout button

## Decisions Made

- `inMemoryRefreshTokens` uses `expiresAt` timestamp for TTL — Map entries cleaned at lookup time, no background timer needed
- `issueRefreshToken()` helper centralizes Redis vs in-memory dispatch, avoiding duplication across login/register/refresh
- Register returns `token + refreshToken` immediately — player can start playing right after sign-up without a separate login step
- Socket.IO auth uses callback form `(cb) => cb({ token: getAuthToken() })` rather than static `auth` object — ensures token is read at socket connection time, not at module import time (avoids stale closure)
- `handleLogout` fully resets all state: disconnects socket, clears auth tokens, resets game state, navigates to login
- `restoreAuth()` called in useEffect on mount — if localStorage has tokens, skip login form and go straight to modeSelect

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Client auth integration complete. All API calls now include Bearer tokens.
- Server enforces 15m access token expiry with refresh rotation.
- Auth gate is in place — gameplay only accessible after successful login/registration.
- Ready for any remaining Phase 18 plans (06, 08, 09 pending).

## Self-Check: PASSED

- client/src/services/auth.ts: FOUND
- client/src/components/LoginForm.tsx: FOUND
- 18-05-SUMMARY.md: FOUND
- commit 5b9d616 (Task 1): FOUND
- commit c0b063e (Task 2): FOUND

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-23*
