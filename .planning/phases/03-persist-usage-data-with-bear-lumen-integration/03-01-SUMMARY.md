---
phase: 03-persist-usage-data-with-bear-lumen-integration
plan: 01
subsystem: api
tags: [bear-lumen, usage-tracking, cost-intelligence, rest, fire-and-forget]

# Dependency graph
requires:
  - phase: 02-add-userid-to-usage-tracking-pipeline
    provides: userId field in all UsageEntry records enabling per-user attribution in Bear Lumen
provides:
  - bearLumen.ts fire-and-forget REST forwarder to Bear Lumen batch endpoint
  - BEAR_LUMEN_API_KEY in env schema with blank-default graceful-disable pattern
  - pushToBearLumen wired into all 4 record* functions in usageTracker.ts
affects:
  - future phases that add new record* functions (must also wire pushToBearLumen)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bear Lumen events forwarded as fire-and-forget alongside existing in-memory tracker — no latency impact"
    - "BEAR_LUMEN_ENABLED module-level const gate: evaluated once at startup from config, not per-call"
    - "void fetch(...).catch(()=>{}) pattern for truly silent fire-and-forget network calls"
    - "Outer try/catch in pushToBearLumen silences synchronous errors (JSON.stringify, etc.)"
    - "entries[entries.length - 1] reference pattern avoids variable duplication after push"

key-files:
  created:
    - server/src/services/bearLumen.ts
  modified:
    - server/src/services/usageTracker.ts
    - server/src/services/config.ts
    - server/src/index.ts
    - .env.example

key-decisions:
  - "Endpoint is /usage/events/batch (not /v1/usage-events) — verified from Bear Lumen SDK dist/index.js in research"
  - "BEAR_LUMEN_ENABLED constant evaluated at module load time (not per-call) — avoids string.length check on every usage event"
  - "user_id: entry.userId ?? undefined — JSON.stringify drops undefined keys entirely, so null userId is excluded from payload"
  - "No cost field sent to Bear Lumen — Bear Lumen derives cost server-side from model + tokens"
  - "resolveProvider() maps model name prefix to provider string (bedrock/minimax/unknown)"
  - "warnOnBlankConfig for BEAR_LUMEN_API_KEY is NOT gated behind production check — informational in all environments"

patterns-established:
  - "Bear Lumen call after entries.push, before return — ensures entry is in array before forwarding"

requirements-completed: [BEAR-01, BEAR-02]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 03 Plan 01: Bear Lumen REST Forwarder Summary

**Fire-and-forget usage event forwarding to Bear Lumen's batch REST API, wired into all 4 record* functions with graceful disable via blank BEAR_LUMEN_API_KEY**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T06:54:34Z
- **Completed:** 2026-02-25T06:57:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `bearLumen.ts` with `pushToBearLumen()`: fire-and-forget POST to Bear Lumen's `/usage/events/batch` endpoint, silently disabled when `BEAR_LUMEN_API_KEY` is blank
- Wired `pushToBearLumen` into all 4 record functions: `recordBedrockUsage`, `recordTtsUsage`, `recordMusicUsage`, `recordVideoUsage`
- Added `BEAR_LUMEN_API_KEY` to config env schema with blank default and startup warning
- All 58 existing tests pass unchanged — Bear Lumen is a no-op in test environment

## Task Commits

Each task was committed atomically:

1. **Task 1: Add BEAR_LUMEN_API_KEY to config schema and environment documentation** - `b0159be` (feat)
2. **Task 2: Create bearLumen.ts REST forwarder and wire into usageTracker record functions** - `30570bb` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `server/src/services/bearLumen.ts` - New: fire-and-forget REST forwarder to Bear Lumen batch API endpoint
- `server/src/services/usageTracker.ts` - Added import and 4x pushToBearLumen calls in record* functions
- `server/src/services/config.ts` - Added BEAR_LUMEN_API_KEY to envDefaults and envSchema
- `server/src/index.ts` - Added warnOnBlankConfig for BEAR_LUMEN_API_KEY (non-fatal, all envs)
- `.env.example` - Added Bear Lumen section with inline docs

## Decisions Made
- Endpoint is `/usage/events/batch` (not `/v1/usage-events`) — confirmed from Bear Lumen SDK source in research phase
- `user_id: entry.userId ?? undefined` — JSON.stringify drops `undefined` keys, so null userId is cleanly excluded
- No `cost` field in payload — Bear Lumen computes cost server-side from model + tokens
- `BEAR_LUMEN_ENABLED` evaluated once at module load time (not per invocation) — minimal overhead

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

To enable Bear Lumen forwarding, add to `.env`:
```
BEAR_LUMEN_API_KEY=<key from Bear Lumen dashboard>
```
Leave blank (or absent) to keep the feature disabled — server will warn at startup but continue normally.

## Next Phase Readiness
- Bear Lumen REST forwarding is live for all 4 usage event types
- Phase 03-02 can proceed (Bear Lumen SDK integration or additional analytics planes)
- Any new `record*` function added to `usageTracker.ts` must also call `pushToBearLumen` to maintain coverage

---
*Phase: 03-persist-usage-data-with-bear-lumen-integration*
*Completed: 2026-02-25*
