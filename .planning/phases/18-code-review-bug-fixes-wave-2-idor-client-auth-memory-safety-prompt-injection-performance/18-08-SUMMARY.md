---
phase: 18-code-review-bug-fixes-wave-2
plan: 08
subsystem: auth
tags: [zod, bcrypt, redis, validation, security, account-lockout]

# Dependency graph
requires:
  - phase: 18-01
    provides: IDOR ownership tracking and ConversationOwnershipError
  - phase: 18-04
    provides: GETEX fallback, withLock in-memory, checkedWrite SSE backpressure

provides:
  - Password complexity enforcement on register (uppercase + lowercase + digit regex)
  - Per-username account lockout after 5 failed logins with 15-minute cooldown
  - Lockout counter in Redis with in-memory fallback Map
  - Zod schema validation on /api/chat request body (conversationId UUID, message 1-2000 chars)
  - Zod schema validation on /api/narrate request body (conversationId UUID, text max 5000)
  - Zod validation on Redis conversation data after JSON.parse (corrupt data treated as cache miss)

affects: [auth, chat, narrate, conversationStore, security, brute-force-protection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod safeParse on route request bodies — structured errors via .flatten().fieldErrors"
    - "Per-username lockout key pattern: login-attempts:{username} in Redis with EXPIRE TTL"
    - "Redis data validation with Zod after JSON.parse — corrupt data returns null (cache miss)"
    - "Lockout counter incremented for unknown usernames too (prevents enumeration via lockout timing)"

key-files:
  created: []
  modified:
    - server/src/routes/auth.ts
    - server/src/routes/chat.ts
    - server/src/routes/narrate.ts
    - server/src/services/conversationStore.ts

key-decisions:
  - "PASSWORD_COMPLEXITY regex enforced only on register (not login) — fail fast with generic 'Invalid credentials' on login to avoid leaking requirements"
  - "Lockout counter incremented for unknown usernames too — prevents username enumeration via differential lockout timing"
  - "Corrupt Redis conversation data returns null (cache miss) rather than throwing — graceful degradation over crash"
  - "conversationSchema Zod validation placed in _getFromRedis private helper — single enforcement point for all Redis reads"

patterns-established:
  - "Zod schema defined at module level (not inside handler) for zero per-request allocation"
  - "safeParse with .flatten().fieldErrors for structured 400 error responses"

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 18 Plan 08: Validation Hardening Summary

**Password complexity (uppercase+lowercase+digit), per-username account lockout (Redis/in-memory), Zod schemas on /api/chat and /api/narrate bodies, and Zod validation of Redis conversation data**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-23T05:31:09Z
- **Completed:** 2026-02-23T05:36:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Register endpoint enforces PASSWORD_COMPLEXITY regex: must contain uppercase, lowercase, and at least one digit
- Login endpoint implements per-username account lockout: 5 failed attempts triggers 429, 15-minute cooldown stored in Redis (in-memory fallback)
- /api/chat body validated with Zod: conversationId must be UUID if provided, message required with 1-2000 char limit
- /api/narrate body validated with Zod: conversationId as UUID, text max 5000 chars
- Redis conversation data validated with conversationSchema.safeParse after JSON.parse — corrupt or tampered data treated as cache miss with warn log

## Task Commits

Each task was committed atomically:

1. **Task 1: Password complexity + per-username lockout** - `4c365b1` (feat)
2. **Task 2: Zod validation on routes + Redis data** - `76b3b13` (feat)

## Files Created/Modified
- `server/src/routes/auth.ts` - Added PASSWORD_COMPLEXITY regex, MAX_LOGIN_ATTEMPTS/LOCKOUT_DURATION_S constants, inMemoryLoginAttempts fallback Map, lockout check/increment/clear logic in login endpoint
- `server/src/routes/chat.ts` - Added chatBodySchema (Zod), replaced manual type cast and UUID regex with safeParse
- `server/src/routes/narrate.ts` - Added narrateBodySchema (Zod), replaced manual body field extraction with safeParse
- `server/src/services/conversationStore.ts` - Added conversationSchema (Zod), validate _getFromRedis output before returning

## Decisions Made
- PASSWORD_COMPLEXITY enforced on register only; login returns generic "Invalid credentials" — avoids revealing password requirements to attackers
- Lockout counter incremented for unknown usernames (prevents enumeration via differential lockout timing between known/unknown usernames)
- Corrupt Redis data returns null (cache miss) rather than throwing — graceful degradation preserving user session
- Zod schemas defined at module level (not inside handler) — zero per-request allocation overhead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TypeScript type error in dmTurn.ts**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** `history` parameter typed as `Array<{ role: string; content: string }>` but `streamBedrockResponse` requires `ChatMessage[]` with `role: "user" | "assistant"` (literal union)
- **Fix:** Added `import type { ChatMessage } from "@ai-dm/shared-types"` and changed parameter type to `ChatMessage[]`
- **Files modified:** server/src/services/dmTurn.ts (already committed in 18-06 commit as part of Task 1 commit)
- **Verification:** `./node_modules/.bin/tsc --noEmit` passed
- **Committed in:** 4c365b1 (Task 1 commit)

**2. [Rule 3 - Blocking] Restored missing imports in turnHandlers.ts**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** turnHandlers.ts `triggerDMResponse` used `buildLoreContext`, `createMoodStreamDetector`, `queueBedrockCall`, `streamBedrockResponse`, `extractMood` but those imports had been removed in an incomplete refactor, causing 14 TypeScript errors
- **Fix:** Added missing imports back to turnHandlers.ts import block
- **Files modified:** server/src/sockets/turnHandlers.ts
- **Verification:** `./node_modules/.bin/tsc --noEmit` passed with zero errors
- **Committed in:** 4c365b1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking import fix)
**Impact on plan:** Both fixes essential for TypeScript compilation. No scope creep.

## Issues Encountered
- `npx tsc` on macOS picked up the system tsc binary (printed help text instead of errors). Used `./node_modules/.bin/tsc` for reliable local compilation checks.

## Self-Check: PASSED

All key files verified:
- FOUND: server/src/routes/auth.ts
- FOUND: server/src/routes/chat.ts
- FOUND: server/src/routes/narrate.ts
- FOUND: server/src/services/conversationStore.ts
- FOUND: 18-08-SUMMARY.md

Task commits verified:
- FOUND: 4c365b1 (Task 1: password complexity + lockout)
- FOUND: 76b3b13 (Task 2: Zod validation on routes + Redis data)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 validation criteria met: password complexity (27), per-username lockout (14), Zod on routes (19), Zod on Redis data (26)
- TypeScript clean, 53 tests pass
- Ready for remaining Phase 18 plans

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-23*
