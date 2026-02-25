---
phase: 07-voice-demo-polish
plan: 01
subsystem: api
tags: [minimax, tts, audio, express, mp3, voice]

# Dependency graph
requires:
  - phase: 01-scaffold
    provides: Express app factory (createApp), config service with MINIMAX_API_KEY and MINIMAX_GROUP_ID
provides:
  - MiniMax T2A v2 TTS service (generateTTS) decoding hex to mp3 Buffer
  - POST /narrate and /api/narrate route accepting optional text, defaulting to OPENING_MONOLOGUE
  - OPENING_MONOLOGUE constant exported from narrate route for reuse
  - scripts/generate-opening-audio.ts pre-bakes client/public/opening.mp3 as static asset
affects: [07-02-audio-player, any route that needs TTS narration]

# Tech tracking
tech-stack:
  added: [MiniMax T2A v2 API (speech-2.8-hd model), AbortSignal.timeout for 30s fetch timeout]
  patterns: [hex-to-Buffer audio decode, optional-body-with-constant-fallback route pattern, pre-generation script writes to client/public/]

key-files:
  created:
    - server/src/services/tts.ts
    - server/src/routes/narrate.ts
    - scripts/generate-opening-audio.ts
  modified:
    - server/src/app.ts
    - package.json

key-decisions:
  - "English_CaptivatingStoryteller voice at neutral settings (speed 1, pitch 0) — tune after hearing pre-generated audio"
  - "OPENING_MONOLOGUE exported from narrate.ts (not a separate constants file) so scripts/generate-opening-audio.ts imports from a single source"
  - "Pre-generation script resolves output path via import.meta.url to be location-independent"
  - "No rate limiting or Datadog spans on /narrate — Phase 6 handles observability, hackathon simplicity rules"

patterns-established:
  - "TTS response pattern: POST MiniMax API → check response.ok → check base_resp.status_code === 0 → Buffer.from(data.audio, 'hex')"
  - "Route fallback pattern: req.body?.text trim, falsy → named constant exported from route module"

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 7 Plan 01: Voice Demo Polish (TTS Service + /narrate Route) Summary

**MiniMax T2A v2 TTS service with English_CaptivatingStoryteller voice, POST /narrate route with opening monologue fallback, and pre-generation script that bakes opening.mp3 into client/public/**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-20T23:42:00Z
- **Completed:** 2026-02-20T23:47:04Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- MiniMax T2A v2 TTS service decodes hex audio response to mp3 Buffer with 30s timeout and proper error handling for both HTTP and application-level errors
- POST /narrate and /api/narrate accept optional text body, fall back to the exported OPENING_MONOLOGUE constant
- Pre-generation script writes opening.mp3 to client/public/ so the demo never depends on a live MiniMax call during the opening monologue

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MiniMax TTS service** - `16e0317` (feat)
2. **Task 2: Create /narrate route accepting optional text** - `1429199` (feat)
3. **Task 3: Create pre-generation script for opening.mp3** - `341d498` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `server/src/services/tts.ts` - MiniMax T2A v2 integration: generateTTS() with hex decode, TTSResult interface, 30s timeout
- `server/src/routes/narrate.ts` - POST /narrate route, exports OPENING_MONOLOGUE constant, optional text fallback
- `server/src/app.ts` - Added narrateRouter import and mount after healthRouter
- `scripts/generate-opening-audio.ts` - One-time script to write opening.mp3 to client/public/
- `package.json` - Added `generate-audio` script: `tsx scripts/generate-opening-audio.ts`

## Decisions Made

- English_CaptivatingStoryteller voice at neutral settings (speed 1, pitch 0) — it's already a dramatic narrator voice; tune after hearing the pre-generated audio
- OPENING_MONOLOGUE exported from narrate.ts rather than a separate constants file, so the pre-gen script has a single import source of truth
- Pre-generation script uses import.meta.url to resolve the output path, making it location-independent
- No rate limiting or Datadog spans on /narrate per plan — hackathon simplicity; Phase 6 handles observability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Before running `npm run generate-audio`, set:
- `MINIMAX_API_KEY` — from MiniMax console
- `MINIMAX_GROUP_ID` — from MiniMax console (locate before demo day; noted as pre-hackathon blocker)

Run once to pre-bake static audio: `npm run generate-audio`

## Next Phase Readiness

- TTS service is ready for 07-02 AudioPlayer which should prefer client/public/opening.mp3 and fall back to /narrate
- /narrate endpoint live for Q&A fallback and ad-hoc narration
- TypeScript compiles with zero errors (`npx tsc --noEmit -p server/tsconfig.json` passes)

---
*Phase: 07-voice-demo-polish*
*Completed: 2026-02-20*
