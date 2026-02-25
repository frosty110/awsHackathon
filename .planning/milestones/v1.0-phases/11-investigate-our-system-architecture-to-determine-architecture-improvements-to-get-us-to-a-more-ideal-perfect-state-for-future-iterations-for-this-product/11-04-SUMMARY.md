---
phase: 11-architecture-audit
plan: "04"
subsystem: music-service
tags:
  - refactoring
  - service-extraction
  - routes
  - music
  - architecture
dependency_graph:
  requires:
    - server/src/services/mediaCache.ts
    - server/src/services/config.ts
    - server/src/services/logger.ts
    - server/src/services/usageTracker.ts
    - packages/shared-types
  provides:
    - server/src/services/musicService.ts
  affects:
    - server/src/routes/music.ts
    - server/src/routes/usage.ts
tech_stack:
  added: []
  patterns:
    - service-extraction
    - thin-route-handler
    - typed-result-union
key_files:
  created:
    - server/src/services/musicService.ts
  modified:
    - server/src/routes/music.ts
decisions:
  - "MusicResult typed union (ready/generating/retrying/error) exported from musicService — route switch-matches on status, no logic duplication"
  - "Re-export getMusicCacheStats from routes/music.ts to preserve usage.ts import contract without breaking callers"
  - "getMusicForMood absorbs S3 cold-start check and all cache/retry branching — route handler is pure HTTP translation"
metrics:
  duration: "1 min"
  completed: "2026-02-21"
  tasks_completed: 1
  files_created: 1
  files_modified: 1
---

# Phase 11 Plan 04: Music Service Extraction Summary

Music generation state machine extracted from `routes/music.ts` into `services/musicService.ts` via typed MusicResult union; route reduced from 293 lines to 45 lines with all behavior preserved.

## What Was Built

Extracted all music generation business logic from the route layer into a dedicated service:

**`server/src/services/musicService.ts`** (new, ~265 lines)
- All state: `moodCache` Map, `MOOD_PROMPTS` record, `RETRY_COOLDOWN_MS`, `MAX_SERVER_RETRIES`, `musicCacheHits`/`musicCacheMisses` counters
- All logic: `buildMusicS3Key()`, `getOrCreateEntry()`, `startGeneration()`, `runGeneration()` (MiniMax API + CDN download + S3 put + Datadog LLMObs tracing)
- Public API: `getMusicForMood(mood): Promise<MusicResult>` — typed union result
- Exports: `VALID_MOODS`, `getMusicCacheStats`, `getMusicForMood`, `MusicResult`

**`server/src/routes/music.ts`** (rewritten, 45 lines)
- Validates MINIMAX key configured (503 if not)
- Validates/defaults mood query param
- Calls `getMusicForMood(mood)` and switch-matches on `result.status`
- Re-exports `getMusicCacheStats` to maintain existing import contract with `routes/usage.ts`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create musicService.ts and slim down music route | 5fc4757 | server/src/services/musicService.ts (created), server/src/routes/music.ts (modified) |

## Decisions Made

1. **MusicResult typed union**: Introduced `export type MusicResult = { status: "ready" | "generating" | "retrying" | "error"; ... }` — enables exhaustive switch in route, makes service contract explicit
2. **Re-export pattern**: `routes/music.ts` re-exports `getMusicCacheStats` so `routes/usage.ts` import chain is preserved without modification
3. **S3 cold-start check in service**: The L2 S3 lookup (previously in route handler) moved into `getMusicForMood()` — service owns all caching logic, route owns only HTTP translation

## Verification

- `npx tsc --noEmit -p server/tsconfig.json` — PASS, zero type errors
- `musicService.ts` contains: `moodCache`, `MOOD_PROMPTS`, `runGeneration`, `getMusicForMood` — PASS
- `routes/music.ts` is 45 lines (limit: 60) — PASS
- `routes/music.ts` imports from `musicService.js` — PASS
- HTTP response contracts preserved: same status codes (200/202/500/503), same headers, same JSON shapes — PASS

## Deviations from Plan

None — plan executed exactly as written.

The only implementation detail worth noting: the plan's pseudocode for `getMusicForMood` used `...` placeholders in the cache-hit log; the actual implementation uses the exact same log fields as the original route handler to ensure behavioral parity.

## Self-Check: PASSED

- [x] `server/src/services/musicService.ts` — exists
- [x] `server/src/routes/music.ts` — exists (modified)
- [x] Commit `5fc4757` — exists
- [x] TypeScript compile — zero errors
