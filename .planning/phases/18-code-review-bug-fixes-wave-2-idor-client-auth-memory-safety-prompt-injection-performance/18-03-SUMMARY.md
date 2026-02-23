---
phase: 18-code-review-bug-fixes-wave-2
plan: 03
subsystem: infra
tags: [lru-cache, memory-safety, caching, tts, video, music, buffer-management]

# Dependency graph
requires:
  - phase: 10-s3-audio-cache
    provides: "Two-tier L1/L2 cache pattern (in-memory + S3) for TTS"
  - phase: 11-architecture-audit
    provides: "musicService, videoGenerator, usageTracker patterns"
  - phase: 14-parallel-tts-processing
    provides: "TTS cache structure and stats API"
provides:
  - "TTS in-memory cache capped at 100MB with LRU eviction and 30-min TTL"
  - "Video buffer cache capped at 500MB with LRU eviction and 1-hour TTL"
  - "Music audio cache capped at 200MB with LRU eviction and 1-hour TTL"
  - "Byte-usage stats (calculatedSize) exposed in all three cache stat APIs"
affects: [observability, usage-endpoint, health-checks]

# Tech tracking
tech-stack:
  added: ["lru-cache@11.2.6"]
  patterns:
    - "Dual-structure cache: LRUCache for Buffers (byte-budget) + plain Map for generation state metadata"
    - "maxSize + sizeCalculation for byte-budget eviction (not count-based)"
    - "allowStale: false ensures stale entries never served after TTL"

key-files:
  created: []
  modified:
    - "server/package.json"
    - "server/src/services/tts.ts"
    - "server/src/services/videoGenerator.ts"
    - "server/src/services/musicService.ts"
    - "server/src/routes/sceneVideo.ts"

key-decisions:
  - "lru-cache@11 (not 10): v11 has updated LRUCache API with maxSize + sizeCalculation for byte budgets"
  - "Video/music: separate Buffer LRUCache from generation state Map — avoids fighting LRU API with mixed metadata/data; Buffer goes in LRU, generation state (generating/error/retryCount) stays in plain Map"
  - "TTS: simplify to single LRUCache<string, TTSCacheEntry> — full entry stored since TTSCacheEntry is small except for audioBuffer; sizeCalculation returns audioBuffer.byteLength"
  - "calculatedSize exposed in all cache stat APIs — enables Datadog metrics on actual memory consumption"
  - "videoGenerator exports getVideoBuffer() and hasVideoBuffer() — clean API for route consumption post-refactor"

patterns-established:
  - "Byte-budget LRU pattern: LRUCache<K, V>({ maxSize: N*1024*1024, sizeCalculation: (v) => v.byteLength, ttl: Ms, allowStale: false })"
  - "Dual-cache separation: metadata Map + Buffer LRUCache for services with generation state tracking"

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 18 Plan 03: LRU Cache Byte-Budget Summary

**Replaced three unbounded Map-based caches with LRUCache byte-budget caches: TTS at 100MB (30-min TTL), video at 500MB (1-hr TTL), music at 200MB (1-hr TTL) — prevents server OOM at 1000 concurrent users**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-22T21:09:06Z
- **Completed:** 2026-02-22T21:14:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Installed lru-cache@11.2.6 in server workspace
- Converted TTS cache from count-limited Map (200 entries) to LRUCache with 100MB byte budget and 30-min TTL — eliminates OOM risk from large audio buffers
- Converted video and music caches to dual-structure pattern: LRUCache for Buffer storage (500MB and 200MB respectively), plain Map retained for generation state metadata
- Removed manual eviction code (evictStaleTTSEntries, count-based checks) — LRU handles it automatically
- Updated all three cache stat APIs to include byteSize (calculatedSize) for real memory monitoring

## Task Commits

Each task was committed atomically:

1. **Task 1: Install lru-cache and convert TTS cache** - `3f3f55c` (feat)
2. **Task 2: Convert video and music caches to byte-budget LRU** - `8c8e523` (feat, included in 18-01 IDOR commit from prior run)

## Files Created/Modified

- `server/package.json` - Added lru-cache@11.2.6 dependency
- `server/src/services/tts.ts` - Replaced Map+evictStaleTTSEntries with LRUCache (100MB, 30-min TTL); added byteSize to stats
- `server/src/services/videoGenerator.ts` - Added videoBufferCache (500MB, 1-hr TTL); SceneCacheEntry no longer holds Buffer; exports getVideoBuffer/hasVideoBuffer
- `server/src/services/musicService.ts` - Added musicBufferCache (200MB, 1-hr TTL); MoodCacheEntry no longer holds Buffer; getMusicForMood uses musicBufferCache
- `server/src/routes/sceneVideo.ts` - Updated to use getVideoBuffer/hasVideoBuffer instead of entry.video

## Decisions Made

- lru-cache v11 used (not v10) — v11 has the maxSize+sizeCalculation byte-budget API
- Video/music use dual-structure: LRUCache for Buffers + plain Map for generation metadata — keeps generation state accessible without fighting LRU eviction of partially-generated entries
- TTS uses single LRUCache<string, TTSCacheEntry> — simpler since TTSCacheEntry only contains result+createdAt; sizeCalculation targets audioBuffer.byteLength
- calculatedSize exposed in all stat APIs for Datadog memory observability

## Deviations from Plan

None - plan executed exactly as written. The video/music changes were committed in `8c8e523` (18-01 commit) from a prior agent execution of this plan, but all code matches plan specification.

## Issues Encountered

- videoGenerator.ts and musicService.ts were already committed in prior run (commit `8c8e523` labeled as 18-01 IDOR fix). Both files contained complete LRU implementation. No action needed — code was already in HEAD.
- sceneVideo.ts route also already updated in same prior commit with getVideoBuffer/hasVideoBuffer API.

## Next Phase Readiness

- Server memory is now bounded: worst case ~800MB for all three caches combined at 1000 users
- Cache byte-usage metrics available via calculatedSize for Datadog dashboards
- Ready for remaining Phase 18 plans (prompt injection hardening, Redis optimization, etc.)

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-22*
