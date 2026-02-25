---
phase: 02-add-userid-to-usage-tracking-pipeline
plan: 02
subsystem: api
tags: [usage-tracking, cost-attribution, typescript, routes, security]

# Dependency graph
requires:
  - 02-01 (UsageEntry type + record functions with userId param)
provides:
  - userId threaded to all Bedrock and TTS record call sites in chat.ts and narrate.ts
  - /api/usage endpoint returns per-user UsageSummary for the authenticated caller
affects:
  - 03-persist-usage-data-with-bear-lumen-integration (per-user cost data now flows end-to-end)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Security pattern: derive userId from req.userId (JWT) not query param to prevent cross-user data leakage"
    - "req.userId ?? null at call sites — ensures null (not undefined) when unauthenticated"

key-files:
  created: []
  modified:
    - server/src/routes/chat.ts
    - server/src/routes/narrate.ts
    - server/src/routes/usage.ts

key-decisions:
  - "userId sourced exclusively from JWT (req.userId) in /api/usage — never from query parameters — to prevent users querying other users' costs"
  - "req.userId ?? null used at call sites (not req.userId directly) to guarantee null type matches string | null signature"

patterns-established:
  - "Pattern: ?? null at all record* call sites — converts undefined to null to match type signature without modifying callers"

requirements-completed:
  - USAGE-04
  - USAGE-05

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 02 Plan 02: Thread userId through route call sites and expose per-user usage Summary

**userId wired into all Bedrock and TTS record call sites in chat.ts and narrate.ts; /api/usage endpoint returns per-user UsageSummary from JWT identity**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T04:51:09Z
- **Completed:** 2026-02-25T04:53:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `req.userId ?? null` as 5th argument to `recordBedrockUsage` call in chat.ts (line 197)
- Added `req.userId ?? null` to all 4 `record*` call sites in narrate.ts: `serveOpeningPhrase` (recordTtsUsage), `generateBedrockOpening` (recordBedrockUsage + recordTtsUsage), main route handler (recordTtsUsage)
- Imported `getUserUsage` from usageTracker and `AuthenticatedRequest` from auth middleware into usage.ts
- Updated `/api/usage` handler to derive user usage from `req.userId` (JWT), never from query params
- Added `user` field to `/api/usage` response JSON: `{ global, conversation, user, caches }`
- All 19 existing tests pass; TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread userId through chat and narrate route call sites** - `cd2727d` (feat)
2. **Task 2: Add per-user usage to /api/usage endpoint** - `5b11bc5` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `server/src/routes/chat.ts` - recordBedrockUsage call now passes req.userId ?? null as 5th argument
- `server/src/routes/narrate.ts` - All 4 record* calls now pass req.userId ?? null as final argument
- `server/src/routes/usage.ts` - getUserUsage imported, AuthenticatedRequest type used, user field added to response

## Decisions Made

- userId sourced exclusively from `req.userId` (JWT) in `/api/usage`, never from query parameters — prevents users from querying other users' cost data (security decision per RESEARCH.md Pitfall 4)
- `req.userId ?? null` at each call site (not `req.userId` directly) ensures the value is typed `string | null`, matching the `userId?: string | null` parameter signature on the record functions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full userId pipeline is complete end-to-end: type -> service -> routes -> API response
- Phase 03 Bear Lumen integration can now consume per-user cost data from `/api/usage`
- musicService.ts and videoGenerator.ts intentionally left unchanged — those services have no user auth context

---
*Phase: 02-add-userid-to-usage-tracking-pipeline*
*Completed: 2026-02-25*

## Self-Check: PASSED

- FOUND: server/src/routes/chat.ts
- FOUND: server/src/routes/narrate.ts
- FOUND: server/src/routes/usage.ts
- FOUND: 02-02-SUMMARY.md
- FOUND commit: cd2727d (feat(02-02): thread userId through chat and narrate record call sites)
- FOUND commit: 5b11bc5 (feat(02-02): add per-user usage to /api/usage endpoint)
