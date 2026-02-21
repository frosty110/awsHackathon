---
phase: quick-tts-optimize
plan: 01
subsystem: tts, api, ui
tags: [minimax, tts, emotion-tags, multi-voice, turbo, streaming, bedrock]

# Dependency graph
requires:
  - phase: 07-voice-demo-polish
    provides: "Base TTS service, /narrate route, AudioPlayer component"
  - phase: 04-bedrock-chat-core
    provides: "DM system prompt, /api/chat SSE route, useSSEChat hook"
provides:
  - "Emotion tag instructions in DM system prompt for expressive TTS"
  - "Mood-based prosody (speed/pitch) varying by scene type"
  - "Multi-character voice mapping (narrator, barkeep, goblin)"
  - "speech-2.8-turbo for in-game turns, speech-2.8-hd for opening"
  - "TTS tag stripping pipeline (server + client) for clean UI display"
  - "ttsText SSE event for tagged Bedrock output"
  - "playFromResponse audio helper"
affects: [voice-demo-polish, bedrock-chat-core, chat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TTS tag protocol: mood/voice/emotion tags in Bedrock output, stripped before display"
    - "Dual-model TTS: HD for opening monologue, turbo for in-game turns"
    - "Multi-voice segments: {{voice:ID}}...{{/voice}} parsed into separate TTS calls"

key-files:
  created: []
  modified:
    - server/src/services/bedrock.ts
    - server/src/services/tts.ts
    - server/src/routes/narrate.ts
    - server/src/routes/chat.ts
    - client/src/hooks/useSSEChat.ts
    - client/src/components/MessageBubble.tsx
    - client/src/services/audioController.ts

key-decisions:
  - "Voice IDs: narrator=English_CaptivatingStoryteller, barkeep=English_ManSportsCommentator, goblin=English_FloridaMan"
  - "Mood prosody: combat (1.15x speed, +2 pitch), tavern (0.9x, -1), mystery (0.85x, -2), dramatic (0.95x, +1), danger (1.05x, +3)"
  - "stripTTSTags duplicated on client (no shared package) for simplicity"
  - "ttsText SSE event sends full tagged Bedrock output to client for TTS consumption"
  - "playFromResponse consolidates Blob-from-response audio logic"

patterns-established:
  - "TTS metadata flow: Bedrock output -> tagged text via ttsText event -> client passes to /narrate -> server parses mood/voice/emotion -> per-segment TTS generation"
  - "Defensive tag stripping: server strips before storing history, client strips before rendering (belt-and-suspenders)"

# Metrics
duration: 4min
completed: 2026-02-21
---

# Quick Task 1: Optimize MiniMax TTS -- Emotion Tags, Turbo Model, Multi-Voice Summary

**Emotion-tagged multi-voice TTS with mood-based prosody, turbo model for turns, HD for opening, and full tag stripping pipeline**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T05:05:24Z
- **Completed:** 2026-02-21T05:09:20Z
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments

- DM system prompt instructs Bedrock to emit emotion tags, mood hints, and character voice tags in every response
- TTS service handles multi-voice segments, mood-based speed/pitch, and dual model selection (turbo vs HD)
- Full tag stripping pipeline ensures no TTS metadata appears in chat UI or conversation history
- Server emits ttsText SSE event with tagged Bedrock output so client can pass it to /narrate for expressive TTS

## Task Commits

Each task was committed atomically:

1. **Task 1: Bedrock system prompt -- emotion tags, mood hints, character voice tags** - `4c6e9c6` (feat)
2. **Task 2: TTS service -- multi-voice, mood-based prosody, turbo model** - `5352004` (feat)
3. **Task 3: Narrate route -- turbo for turns, HD for opening, tag stripping** - `5dd3ccd` (feat)
4. **Task 4: Chat route -- ttsText event, tag stripping for history** - `f956892` (feat)
5. **Task 5: Client -- strip tags, pass tagged text to TTS, playFromResponse** - `0b6a2ec` (feat)

## Files Created/Modified

- `server/src/services/bedrock.ts` - DM_SYSTEM_PROMPT with emotion tag, mood hint, and character voice tag instructions
- `server/src/services/tts.ts` - Multi-voice TTS with mood prosody, voice mapping, text parsing utilities, generateMultiVoiceTTS
- `server/src/routes/narrate.ts` - Turbo model for turn narration, HD for opening, stripTTSTags on stored/returned text
- `server/src/routes/chat.ts` - ttsText SSE event emission, stripTTSTags on conversation history
- `client/src/hooks/useSSEChat.ts` - Capture ttsText, strip tags for display, pass tagged text to /narrate
- `client/src/components/MessageBubble.tsx` - Defensive stripTTSTags before Markdown rendering
- `client/src/services/audioController.ts` - playFromResponse helper consolidating Blob logic

## Decisions Made

- Voice IDs chosen for character personality: CaptivatingStoryteller (narrator), ManSportsCommentator (barkeep/gruff), FloridaMan (goblin/nasal)
- Mood prosody tuning: combat faster/higher, tavern slower/lower, mystery slowest, danger high-pitched tension
- stripTTSTags duplicated on client rather than creating shared package (hackathon simplicity)
- Streaming audio playback deferred (partial Blob approach unreliable cross-browser); latency win comes from turbo model
- ttsText sent as separate SSE event rather than stripping mid-stream (tags may span chunk boundaries)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TTS pipeline fully enhanced with all five features
- Voice IDs are real MiniMax English voice library values; trivially swappable if they don't match desired tone at runtime
- Ready for end-to-end testing with live Bedrock + MiniMax

## Self-Check: PASSED

All 7 modified files verified on disk. All 5 task commits verified in git log.

---
*Quick Task: 1-optimize-minimax-tts-emotion-tags-turbo*
*Completed: 2026-02-21*
