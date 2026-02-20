---
phase: 01-scaffold
plan: 03
subsystem: infra
tags: [config, zod, neo4j, env, typescript]

# Dependency graph
requires:
  - phase: 01-scaffold
    provides: Initial server scaffold with config.ts using .min(1) hard-fail validators and index.ts with unconditional neo4j.driver() creation
provides:
  - envDefaults mapper as single source of blank defaults for all integration keys
  - warnOnBlankConfig helper: emits startup warnings for blank config keys without crashing
  - requireConfigValues helper: throws at integration usage points before driver creation
  - Nullable driver pattern in app.ts (Driver | null) for graceful Neo4j degradation
  - Server boot with only PORT + NODE_ENV set when SKIP_NEO4J_CONNECTIVITY_CHECK=1
affects: [02-chat-ui, 03-lore-seed, 04-bedrock, 06-datadog, 07-tts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - envDefaults-first config: blank-default all integration keys, validate at usage point not import time
    - Warn-then-require: warnOnBlankConfig for startup warnings, requireConfigValues for hard gates before driver creation
    - Nullable driver pattern: declare driver as Type | null = null, only create when keys validated

key-files:
  created: []
  modified:
    - server/src/services/config.ts
    - server/src/index.ts
    - server/src/app.ts

key-decisions:
  - "Soft-default integration keys to empty string via envDefaults — not optional() or .default() in Zod schema — so unset env vars pass parse and fail loudly only at usage"
  - "requireConfigValues called before neo4j.driver() in the else branch — never with blank NEO4J_URI to avoid synchronous Illegal host error"
  - "AppDeps.driver typed as Driver | null — downstream route handlers must guard against null per CLAUDE.md graceful degradation requirements"

patterns-established:
  - "envDefaults pattern: define all known env keys with blank defaults, merge { ...envDefaults, ...process.env } before Zod parse"
  - "Deferred validation pattern: warnOnBlankConfig on startup, requireConfigValues immediately before integration usage"
  - "Nullable driver: declare as Type | null = null, assign inside validated else branch"

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 1 Plan 03: Config Gap Closure Summary

**envDefaults blank-default pattern with warnOnBlankConfig/requireConfigValues helpers, gating neo4j.driver() behind deferred validation so server boots on any machine with only PORT and NODE_ENV set**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T00:00:00Z
- **Completed:** 2026-02-20T00:02:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced 9 `.min(1)` Zod validators with blank-default envDefaults pattern — server no longer crashes at import time when integration keys are missing
- Added `warnOnBlankConfig` and `requireConfigValues` exports to config.ts for contextual validation at usage sites
- Restructured index.ts so `neo4j.driver()` is never called with a blank `NEO4J_URI` — the "Illegal host" synchronous crash is eliminated
- Updated `AppDeps.driver` in app.ts from `Driver` to `Driver | null` to reflect nullable driver when skip is active

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite config.ts with envDefaults mapper, soft validation, warn/require helpers** - `e826da9` (feat)
2. **Task 2: Update index.ts and app.ts with startup warnings, nullable driver, and conditional Neo4j driver creation** - `dff1750` (feat)

## Files Created/Modified

- `server/src/services/config.ts` - envDefaults mapper, removed all .min(1) on integration keys, added warnOnBlankConfig and requireConfigValues exports, parse merges envDefaults with process.env
- `server/src/index.ts` - Startup warnings for AWS/Datadog/MiniMax key groups, allowNeo4jSkip computed before any driver creation, conditional driver block with requireConfigValues in else branch
- `server/src/app.ts` - AppDeps.driver changed from Driver to Driver | null

## Decisions Made

- envDefaults provides blank defaults for integration keys rather than Zod `.optional()` or `.default("")` — this keeps the type system non-optional (all keys are `string`, not `string | undefined`) while still allowing blank values at boot
- `requireConfigValues` is called immediately before `neo4j.driver()` inside the else branch, never at module load time — this ensures the error message is precise and contextual
- `AppDeps.driver` typed as `Driver | null` because when `SKIP_NEO4J_CONNECTIVITY_CHECK=1` the driver is legitimately absent; downstream handlers must guard null per CLAUDE.md graceful degradation requirements

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 scaffold is now functionally complete: server boots on any machine with only `PORT` and `NODE_ENV` set when `SKIP_NEO4J_CONNECTIVITY_CHECK=1`
- Pending todos from STATE.md still apply: run `npm install` and `npx tsc --noEmit -p server` when network access is available (TypeScript check already passes in this execution)
- Phase 2 (Chat UI) and Phase 3 (Lore Seed) can proceed in parallel — both only require the scaffold to be stable

## Self-Check: PASSED

- server/src/services/config.ts: FOUND
- server/src/index.ts: FOUND
- server/src/app.ts: FOUND
- .planning/phases/01-scaffold/01-03-SUMMARY.md: FOUND
- commit e826da9: FOUND
- commit dff1750: FOUND

---
*Phase: 01-scaffold*
*Completed: 2026-02-20*
