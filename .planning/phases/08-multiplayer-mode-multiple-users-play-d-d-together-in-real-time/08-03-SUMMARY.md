---
phase: 08-multiplayer
plan: 03
subsystem: api
tags: [socket.io, websocket, multiplayer, turn-timer, bedrock, room-handlers, chat-handlers, d&d]

# Dependency graph
requires:
  - phase: 08-01
    provides: Socket.IO server init, typed event interfaces, in-memory room store
  - phase: 04-bedrock-chat-core
    provides: streamBedrockResponse, conversationStore pattern

provides:
  - Socket.IO room lifecycle handlers (create, join, ready, disconnect, reconnect)
  - 60-second turn timer with auto-fill for non-submitting players
  - DM opening monologue trigger after all players ready
  - Batch player action collection and combined DM narrative streaming
  - Player-to-player private chat (invisible to DM AI)
  - Dice roll broadcasting to all room members
  - buildMultiplayerSystemPrompt helper with party roster
  - initSocketIO wired into server/src/index.ts

affects:
  - 08-04-client-game-ui
  - 08-05-integration-testing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dynamic import used in roomHandlers to break circular dependency with turnHandlers
    - triggerDMResponse/triggerDMOpening are top-level async exports (not socket-event handlers)
    - multiplayerPrompt option takes priority over characterClass in streamBedrockResponse
    - Player chat relayed via socket.to() (excludes sender); dice rolled via io.to() (includes sender)
    - Auto-fill passive default action on timer expiry or player disconnect during collecting-actions

key-files:
  created:
    - server/src/sockets/roomHandlers.ts
    - server/src/sockets/turnHandlers.ts
    - server/src/sockets/chatHandlers.ts
  modified:
    - server/src/services/bedrock.ts
    - server/src/sockets/index.ts
    - server/src/index.ts

key-decisions:
  - "Dynamic import('./turnHandlers.js') in roomHandlers breaks circular dependency (roomHandlers imports turnHandlers imports roomHandlers via disconnect auto-fill)"
  - "triggerDMResponse exported (not private) so disconnect handler in roomHandlers can call it after auto-fill"
  - "3-second pause (setTimeout 3000ms) after each DM response before next turn timer — gives players reading time"
  - "initSocketIO(server) wired in server/src/index.ts before server.listen (Rule 3 auto-fix — blocking)"
  - "chat:send uses socket.to() to exclude sender; dice:roll uses io.to() to include sender — different visibility models"

patterns-established:
  - "Turn cycle: collecting-actions (timer running) -> dm-responding (Bedrock streaming) -> playing (3s pause) -> collecting-actions"
  - "Error resilience: DM error in any phase logs error, emits dm:error, resets state, starts next timer anyway"
  - "Action privacy: submittedAction never broadcast to peers; turn:player-submitted only confirms boolean flag"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 08 Plan 03: Server-Side Socket Handlers Summary

**Socket.IO room handlers, 60s turn timer with DM batch-streaming, player chat isolation, and multiplayer Bedrock system prompt with party roster**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-21T05:54:52Z
- **Completed:** 2026-02-21T05:57:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Full room lifecycle: create (unique code + conversation), join (4-player cap, mid-game catch-up), ready (2+ players all-ready triggers DM opening), disconnect (auto-fill + abandoned room cleanup), reconnect (state restore)
- Turn cycle: 60-second timer auto-fills passive defaults on expiry, early all-submit clears timer and triggers DM immediately, combined player action message fed to Bedrock, DM streams token-by-token to all room members via `io.to()`, 3-second pause before next timer
- Player chat relay via `socket.to()` (excludes sender) without ever touching conversationStore — DM AI is completely unaware of player side-chats
- `buildMultiplayerSystemPrompt` builds party roster with full authorial control instructions; `streamBedrockResponse` accepts `multiplayerPrompt` option that takes priority over `characterClass`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create room handlers and player chat handlers** - `3f417c7` (feat)
2. **Task 2: Create turn handlers with timer, DM trigger, and multiplayer system prompt** - `e8fa6cd` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `server/src/sockets/roomHandlers.ts` - registerRoomHandlers (room:create/join/ready/disconnect) and handleReconnection
- `server/src/sockets/turnHandlers.ts` - registerTurnHandlers, startTurnTimer, triggerDMOpening, triggerDMResponse
- `server/src/sockets/chatHandlers.ts` - registerChatHandlers (chat:send/react, dice:roll) — DM-invisible
- `server/src/services/bedrock.ts` - Added buildMultiplayerSystemPrompt; streamBedrockResponse accepts multiplayerPrompt option
- `server/src/sockets/index.ts` - Wired io.on("connection") to register all 3 handler groups + reconnection
- `server/src/index.ts` - Added initSocketIO(server) call before server.listen (auto-fix Rule 3)

## Decisions Made

- Dynamic import for `turnHandlers` inside `roomHandlers` break the circular dependency chain — TypeScript resolves the types at build time but the runtime circular reference was resolved via dynamic import
- `triggerDMResponse` exported from `turnHandlers` so `roomHandlers` disconnect handler can call it after auto-filling a disconnected player's action
- 3-second pause implemented as `setTimeout(() => startTurnTimer(io, roomCode), 3_000)` — applies consistently after both `triggerDMOpening` and `triggerDMResponse`, including error paths so the game never stalls
- `chat:send` uses `socket.to(roomCode)` (excludes sender) while `dice:roll` uses `io.to(roomCode)` (includes sender) — different visibility contract per player expectations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added initSocketIO(server) call to server/src/index.ts**
- **Found during:** Task 2 (wiring verification)
- **Issue:** server/src/index.ts had no initSocketIO call — Socket.IO would never start without it; the pending todo in STATE.md confirmed this was intentionally deferred to this phase
- **Fix:** Added `import { initSocketIO }` and `initSocketIO(server)` call in server/src/index.ts main()
- **Files modified:** server/src/index.ts
- **Verification:** `npx tsc --noEmit` passes cleanly with all files included
- **Committed in:** e8fa6cd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for Socket.IO to function at all. Noted as pending todo in STATE.md. No scope creep.

## Issues Encountered

- TypeScript reported `Cannot find module './turnHandlers.js'` during Task 1 verification because `turnHandlers.ts` didn't exist yet. This is expected when Task 2 files are the dependency — resolved naturally by creating Task 2 first before re-running the combined verification.

## User Setup Required

None - no external service configuration required. All changes are pure server-side code.

## Next Phase Readiness

- All server-side socket event handlers are registered and ready
- Full turn cycle is implemented: lobby -> DM opening -> timer -> submit -> DM narrates -> timer
- Client (Phase 08-04) needs to wire `turn:timer-start`, `dm:chunk`, `dm:stream-end`, `turn:player-submitted` events to update the MultiplayerGame UI
- The `handleReconnection` + `markPlayerReconnected` flow is ready — client needs to emit `room:join` on reconnect if session recovery fails (socket.recovered === false)

---
*Phase: 08-multiplayer*
*Completed: 2026-02-21*

## Self-Check: PASSED

All created/modified files confirmed present:
- FOUND: server/src/sockets/roomHandlers.ts
- FOUND: server/src/sockets/turnHandlers.ts
- FOUND: server/src/sockets/chatHandlers.ts
- FOUND: server/src/services/bedrock.ts
- FOUND: server/src/sockets/index.ts
- FOUND: server/src/index.ts

Commits confirmed:
- FOUND: 3f417c7 (Task 1)
- FOUND: e8fa6cd (Task 2)
