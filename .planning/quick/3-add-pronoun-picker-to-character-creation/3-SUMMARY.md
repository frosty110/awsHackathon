---
phase: quick-3
plan: 01
subsystem: ui, api
tags: [react, pronouns, bedrock, socket.io, character-creation, inclusivity]

# Dependency graph
requires:
  - phase: 08-multiplayer
    provides: Socket.IO multiplayer infrastructure, room handlers, turn handlers
  - phase: 02-chat-ui
    provides: ClassSelect component, useSSEChat hook, App.tsx routing
provides:
  - Pronoun picker UI in single-player ClassSelect
  - Pronoun picker UI in multiplayer lobby create/join form
  - Pronouns threaded through client-server data flow (POST body + socket payloads)
  - Pronoun injection into DM system prompt for both single-player and multiplayer
affects: [bedrock-prompts, character-creation, multiplayer-lobby]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pronoun resolution: Custom input falls back to They/Them if empty"
    - "Pronoun clause appended to system prompt, not embedded in user message"
    - "Multiplayer roster includes pronouns per player with explicit instruction block"

key-files:
  created: []
  modified:
    - client/src/components/ClassSelect.tsx
    - client/src/components/MultiplayerLobby.tsx
    - client/src/components/AudioPlayer.tsx
    - client/src/types/multiplayer.ts
    - client/src/App.tsx
    - client/src/hooks/useSSEChat.ts
    - server/src/routes/chat.ts
    - server/src/routes/narrate.ts
    - server/src/services/bedrock.ts
    - server/src/services/conversationStore.ts
    - server/src/services/roomStore.ts
    - server/src/sockets/types.ts
    - server/src/sockets/roomHandlers.ts

key-decisions:
  - "Pronouns coexist alongside pre-existing gender field -- gender is for TTS voice selection, pronouns are for DM narration"
  - "Default pronoun is They/Them everywhere (ClassSelect, MultiplayerLobby, server handlers, Bedrock prompts)"
  - "Custom pronoun input maxLength 20, falls back to They/Them if left empty"
  - "Pronoun clause uses ALWAYS + Never phrasing for strong instruction to the model"

patterns-established:
  - "Pronoun resolution pattern: pronouns === 'Custom' ? customPronouns.trim() || 'They/Them' : pronouns"

# Metrics
duration: 8min
completed: 2026-02-21
---

# Quick Task 3: Add Pronoun Picker to Character Creation Summary

**Pronoun picker with He/Him, She/Her, They/Them presets + Custom text input, threaded from UI through server into Bedrock DM system prompt for both single-player and multiplayer**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-21T06:59:34Z
- **Completed:** 2026-02-21T07:08:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Pronoun picker UI in both ClassSelect (single-player) and MultiplayerLobby (multiplayer) with consistent styling
- Full pronoun data flow: client UI -> POST body / socket payload -> server conversation store -> Bedrock system prompt
- Single-player DM narration includes explicit pronoun instruction clause
- Multiplayer party roster includes pronouns per player with dedicated pronoun instruction block
- Default They/Them applied everywhere when no selection made

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pronoun picker UI to ClassSelect and MultiplayerLobby** - `053a991` (feat)
2. **Task 2: Thread pronouns through client-server data flow** - `2f113e0` (feat)
3. **Task 3: Inject pronouns into Bedrock DM system prompt** - `5638a89` (feat)

## Files Created/Modified
- `client/src/components/ClassSelect.tsx` - Added pronoun picker with 3 presets + Custom, updated onSelect callback signature
- `client/src/components/MultiplayerLobby.tsx` - Added pronoun picker to create/join form, show pronouns in lobby player list
- `client/src/types/multiplayer.ts` - Added pronouns field to MultiplayerPlayer interface
- `client/src/App.tsx` - selectedPronouns ref, threaded to startAdventure and AudioPlayer, shown in "Playing as" display
- `client/src/hooks/useSSEChat.ts` - pronounsRef, sent in /api/chat POST body, accepted in startAdventure
- `client/src/components/AudioPlayer.tsx` - Accepts and sends pronouns in /api/narrate POST body
- `server/src/routes/chat.ts` - Parses pronouns from body, passes to getOrCreate and streamBedrockResponse
- `server/src/routes/narrate.ts` - Parses pronouns, includes in opening prompt and Bedrock options
- `server/src/services/conversationStore.ts` - Added pronouns field to Conversation, getPronouns accessor
- `server/src/services/bedrock.ts` - Pronoun clause in single-player prompt, pronouns in multiplayer roster + instruction block
- `server/src/services/roomStore.ts` - Added pronouns to Player type and getRoomStatePayload
- `server/src/sockets/types.ts` - Added pronouns to PlayerPayload, ClientToServerEvents, SocketData
- `server/src/sockets/roomHandlers.ts` - Destructure pronouns in room:create and room:join, default They/Them

## Decisions Made
- Pronouns coexist alongside the pre-existing `gender` field in the codebase -- `gender` is used for TTS voice selection (male/female voice timbre), while `pronouns` controls DM narration language (He/Him, She/Her, They/Them, custom)
- Default pronoun is They/Them everywhere, applied at multiple fallback points (UI default, socket handler default, Bedrock prompt default)
- Custom pronoun text input limited to 20 characters to prevent injection into system prompts
- Pronoun instruction uses strong language ("ALWAYS use these pronouns... Never use other pronouns") to maximize model compliance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Coexisted with pre-existing gender field**
- **Found during:** Task 2
- **Issue:** The working tree had uncommitted changes adding a `gender` field (for TTS voice selection) to socket types, roomStore Player, and roomHandlers. Plan assumed clean state without `gender`.
- **Fix:** Added `pronouns` alongside `gender` rather than replacing it, since they serve different purposes (gender=voice timbre, pronouns=narration language).
- **Files modified:** server/src/sockets/types.ts, server/src/services/roomStore.ts, server/src/sockets/roomHandlers.ts
- **Verification:** TypeScript compiles cleanly in both client and server
- **Committed in:** 2f113e0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary adaptation to work alongside concurrent uncommitted changes. No scope creep.

## Issues Encountered
None beyond the gender field coexistence documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pronoun system is complete end-to-end
- No changes needed to TTS/voices.ts (TTS voice selection is NPC-only, unrelated to player pronouns)

## Self-Check: PASSED

All 14 files verified present. All 3 task commit hashes verified in git log.

---
*Phase: quick-3*
*Completed: 2026-02-21*
