---
phase: 19-code-review-bug-fixes-wave-3
plan: "01"
subsystem: auth
tags: [security, atomic-registration, rate-limiting, lockout, logout]
dependency_graph:
  requires: []
  provides:
    - HSETNX atomic Redis registration
    - In-memory duplicate registration rejection via Map.has()
    - O(1) Map-based user store
    - Lockout expiry via firstAttemptAt tracking
    - POST /api/auth/logout endpoint
    - /api/auth/refresh rate limiter
  affects:
    - server/src/routes/auth.ts
    - server/src/middleware/rateLimiter.ts
    - server/src/app.ts
tech_stack:
  added: []
  patterns:
    - HSETNX atomic check-and-set for Redis registration (replaces check-then-set race)
    - LockoutRecord {count, firstAttemptAt} for in-memory TTL expiry
    - Map<string, UserRecord> for O(1) user lookup (replaces Array.find)
key_files:
  created: []
  modified:
    - server/src/routes/auth.ts
    - server/src/middleware/rateLimiter.ts
    - server/src/app.ts
decisions:
  - "HSETNX sets userId sentinel atomically — subsequent hSet writes remaining fields after winning the race"
  - "LockoutRecord stores firstAttemptAt to enable TTL expiry without Redis in in-memory fallback"
  - "refreshLimiter uses same IP-keyed Redis-backed pattern as loginLimiter — 5 req/min is tighter than login's 10/min due to token refresh abuse risk"
  - "Map<string, UserRecord> keyed by username matches Redis user:{username} hash key pattern"
metrics:
  duration: "3 minutes"
  completed: "2026-02-23"
  tasks_completed: 2
  files_modified: 3
---

# Phase 19 Plan 01: Auth Hardening — HSETNX Registration, Map User Store, Lockout Expiry, Logout Endpoint Summary

Auth security hardening: atomic Redis registration via HSETNX, O(1) Map-based user store, in-memory lockout TTL expiry, logout endpoint, and refresh token rate limiting.

## What Was Built

Five auth security/reliability fixes across three files:

**1. Atomic Redis registration (HSETNX) — server/src/routes/auth.ts**
The old two-phase check-then-write pattern had a TOCTOU race: two concurrent registrations could both pass the `hGetAll` check and both succeed. The new code uses `hSetNX` to atomically set the `userId` field only if it doesn't exist — the second registration gets `false` back and receives a 409 immediately.

**2. Map-based in-memory user store — server/src/routes/auth.ts**
`inMemoryUsers` was an `Array<{...}>` requiring `Array.find()` for O(n) lookup. Converted to `Map<string, UserRecord>` keyed by username. All references updated: `find()` → `has()`/`get()`, `push()` → `set()`. Registration's in-memory fallback now uses `Map.has()` to reject duplicates (previously `find()` would silently overwrite).

**3. In-memory lockout expiry (LockoutRecord) — server/src/routes/auth.ts**
The old `Map<string, number>` stored only a raw attempt count, so users locked out in the in-memory fallback were locked out permanently until server restart. The new `LockoutRecord` type stores `{count, firstAttemptAt}`. On each lockout check, `elapsed` is computed and if `>= LOCKOUT_DURATION_S`, the record is deleted and the user starts fresh.

**4. Logout endpoint — server/src/routes/auth.ts**
Added `POST /api/auth/logout` that accepts a `refreshToken` in the request body and deletes it from Redis (`del refresh:{token}`) or the in-memory fallback. Idempotent — deleting a non-existent token is a no-op. No authentication required (client may have an expired access token when logging out).

**5. Refresh rate limiter — server/src/middleware/rateLimiter.ts + server/src/app.ts**
Added `refreshLimiter` export using the same `express-rate-limit` + Redis store pattern as `loginLimiter`. Set at 5 requests/minute per IP (tighter than login's 10/min). Imported in `app.ts` and mounted with `app.use("/api/auth/refresh", refreshLimiter)` in step 5 (before auth router), consistent with register/login limiter ordering.

## Verification Results

- TypeScript compiles clean: `npx tsc --noEmit` — no errors
- All 53 tests pass: `npx vitest run` — 4 test files, 53 tests
- `hSetNX` found in register handler
- `inMemoryUsers.has(username)` found in register handler (in-memory duplicate check)
- `inMemoryUsers` typed as `Map<string, UserRecord>` (no Array)
- `LockoutRecord` interface with `firstAttemptAt` field exists
- `POST /api/auth/logout` route exists with refresh token deletion logic
- `refreshLimiter` exported from rateLimiter.ts and wired in app.ts

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | dfe35d5 | feat(19-01): auth hardening — HSETNX registration, Map user store, lockout expiry, logout endpoint |
| Task 2 | 0e251d2 | feat(19-01): add refreshLimiter rate limit and wire on /api/auth/refresh |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

| Check | Result |
|-------|--------|
| server/src/routes/auth.ts | FOUND |
| server/src/middleware/rateLimiter.ts | FOUND |
| server/src/app.ts | FOUND |
| Commit dfe35d5 (Task 1) | FOUND |
| Commit 0e251d2 (Task 2) | FOUND |
