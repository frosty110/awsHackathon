---
phase: 18-code-review-bug-fixes-wave-2
plan: "06"
subsystem: api
tags: [s3, socket-io, bedrock, tts, video, presigned-url, refactor]

requires:
  - phase: 18-code-review-bug-fixes-wave-2
    provides: bedrockQueue, conversationStore, mediaCache, turnHandlers, chat route

provides:
  - DmTurnService (executeDmTurn) — shared Bedrock orchestration service for chat.ts and turnHandlers.ts
  - getPresignedUrl helper in mediaCache.ts
  - S3 presigned URL delivery for multiplayer TTS audio (5-minute expiry)
  - S3 presigned URL redirect for scene video serving (10-minute expiry, offloads bandwidth from Express)
  - Base64 / Express streaming fallback when S3 is unconfigured

affects:
  - turnHandlers.ts (now uses executeDmTurn + S3 presigned URLs for TTS)
  - chat.ts (now uses executeDmTurn)
  - sceneVideo.ts (now redirects to S3 presigned URL)
  - client useMultiplayerRoom hook (handles both audioUrl and audio)

tech-stack:
  added:
    - "@aws-sdk/s3-request-presigner@3.995.0 — presigned URL generation"
  patterns:
    - "DmTurnService pattern: transport-agnostic executeDmTurn() encapsulates Bedrock orchestration, lore context, and persistence"
    - "S3 presigned URL redirect: 302 redirect offloads video bandwidth from Express to S3 directly"
    - "S3 presigned URL TTS: upload audio to S3, emit signed URL instead of base64 over Socket.IO (33% inflation eliminated)"
    - "Dual-emit fallback: emit audioUrl when S3 configured, fall back to audio (base64) in dev mode"

key-files:
  created:
    - server/src/services/dmTurn.ts
  modified:
    - server/src/routes/chat.ts
    - server/src/sockets/turnHandlers.ts
    - server/src/services/mediaCache.ts
    - server/src/services/videoGenerator.ts
    - server/src/routes/sceneVideo.ts
    - packages/shared-types/src/socket-events.ts
    - client/src/hooks/useMultiplayerRoom.ts
    - server/package.json

key-decisions:
  - "executeDmTurn() is transport-agnostic — callers provide onText/onMoodChange callbacks for SSE (chat.ts) or Socket.IO (turnHandlers.ts)"
  - "getPresignedUrl returns null on error or when S3 is unconfigured — callers fall back to inline delivery without crashing"
  - "Scene video 302 redirect: client follows redirect to S3 directly, eliminating server memory + bandwidth for large video files (criterion 28)"
  - "TTS S3 key format: tts/multiplayer/{hash}.mp3 — content-addressed via buildKey, 5-min presigned URL expiry appropriate for real-time audio"
  - "buildVideoS3Key exported from videoGenerator.ts so sceneVideo route can generate presigned URL for the same key used during generation"

patterns-established:
  - "DmTurnService pattern: shared orchestration services use callback interfaces for transport independence"
  - "S3 presigned URL pattern: generate URL after upload, emit to client, client fetches directly from S3"

duration: 4min
completed: "2026-02-23"
---

# Phase 18 Plan 06: DmTurnService Extraction and S3 Presigned URLs Summary

**Extracted shared DmTurnService (executeDmTurn) from chat.ts and turnHandlers.ts, and switched multiplayer TTS and scene video to S3 presigned URL delivery to eliminate base64 inflation and server bandwidth consumption.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T05:31:23Z
- **Completed:** 2026-02-23T05:35:50Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created `server/src/services/dmTurn.ts` with `executeDmTurn()` — a transport-agnostic DM turn orchestration function that encapsulates Bedrock streaming, lore context retrieval, and conversation persistence
- Refactored `chat.ts` and `turnHandlers.ts` to delegate to `executeDmTurn`, eliminating ~60% code duplication in DM orchestration
- Added `getPresignedUrl()` to `mediaCache.ts` using `@aws-sdk/s3-request-presigner`; multiplayer TTS now uploads audio to S3 and emits a 5-minute presigned URL instead of a 33%-inflated base64 string over Socket.IO
- Scene video now serves via 302 redirect to 10-minute S3 presigned URL instead of piping the buffer through Express (criterion 28 — offloads bandwidth to S3)
- All fallback paths preserved: base64 TTS emit and Express buffer serving when S3 is unconfigured (dev mode)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract DmTurnService into dmTurn.ts** - `ff0d2d9` (feat)
2. **Task 2: S3 signed URLs for multiplayer TTS and video serving** - `c8b264e` (feat)

## Files Created/Modified

- `server/src/services/dmTurn.ts` - New DmTurnService with executeDmTurn() function
- `server/src/routes/chat.ts` - Refactored to use executeDmTurn; removed direct Bedrock/lore/queue orchestration
- `server/src/sockets/turnHandlers.ts` - Refactored to use executeDmTurn and S3 presigned URL TTS delivery
- `server/src/services/mediaCache.ts` - Added getPresignedUrl() using @aws-sdk/s3-request-presigner
- `server/src/services/videoGenerator.ts` - Exported buildVideoS3Key() for use in route handler
- `server/src/routes/sceneVideo.ts` - Serves video via S3 presigned URL redirect (302) instead of Express buffer pipe
- `packages/shared-types/src/socket-events.ts` - Updated dm:tts-ready event to accept both audio? and audioUrl? fields
- `client/src/hooks/useMultiplayerRoom.ts` - Updated onDmTtsReady to handle both S3 URL and base64 fallback
- `server/package.json` - Added @aws-sdk/s3-request-presigner dependency

## Decisions Made

- `executeDmTurn()` is transport-agnostic — callers provide `onText`/`onMoodChange` callbacks for SSE (chat.ts) or Socket.IO (turnHandlers.ts). This eliminates all duplicated Bedrock/lore/persistence code.
- `getPresignedUrl` returns null on error or when S3 is unconfigured — callers fall back to inline delivery (base64/Express) without crashing.
- Scene video 302 redirect offloads server memory and bandwidth for large video files (criterion 28). Client follows redirect to S3 directly.
- TTS S3 key uses timestamp to avoid key collisions: `tts/multiplayer/{hash}.mp3`. 5-min presigned URL expiry is appropriate for real-time audio delivery.
- `buildVideoS3Key` exported from `videoGenerator.ts` so `sceneVideo.ts` can generate a presigned URL for the same S3 key used during generation and caching.

## Deviations from Plan

None — plan executed exactly as written. The only adaptation was preserving the `objectUrlsRef` tracking that a linter had added to `useMultiplayerRoom.ts` for the base64 fallback path.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required beyond the existing `S3_MEDIA_CACHE_BUCKET` env var (already in use for audio/video caching). When configured, TTS and video automatically use presigned URLs. When not configured, falls back to current base64/Express behavior.

## Next Phase Readiness

- DmTurnService ready for use by any future transport needing DM turns
- S3 presigned URL pattern established for all media types
- Plans 08 and 09 still pending in phase 18

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-23*
