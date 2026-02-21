# Phase 8: Multiplayer Mode - Research

**Researched:** 2026-02-20
**Domain:** Real-time multiplayer with Socket.IO, room management, batch turn submission, LLM streaming to multiple clients
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Session Joining
- Room codes: host creates a game, gets a short code, others enter it to join
- 2-4 players per session
- Host has no special powers — all players are equal once joined
- Players can join mid-game (standard D&D — DM narrates their arrival, e.g., "a stranger enters the tavern")
- Disconnected player's character stays in the story; DM treats them as silent; they can reconnect and resume
- Lobby screen before game starts: players see who's joined, names, and character classes

#### Turn Structure
- Batch submission model: all players submit actions, then the DM creates one narrative from all actions
- DM has full creative authority — actions may succeed, fail, cancel each other out, or be ignored for story purposes
- 60-second timer per round for action submission
- If a player doesn't submit before timer expires, the DM auto-generates a reasonable default action (e.g., "follows the group")
- When dice rolls are called for, all involved players roll simultaneously; DM narrates all outcomes together
- DM response streams token-by-token to all players simultaneously

#### Shared Visibility
- Side panel for private player-to-player chat alongside the main DM chat — the DM AI does not see this chat
- All dice rolls visible to all players in real-time
- Player chat supports text messages plus quick emoji reactions (thumbs up, skull, fire, etc.) for fast coordination
- Player status bar shows each player's name, connection status, and whether they've submitted their action this round

#### Player Identity
- Players enter a display name and choose a character class when joining
- 6 character classes: Warrior, Mage, Rogue, Cleric, Ranger, Bard
- Class is narration flavor only — no mechanical dice bonuses; the DM weaves class into the story naturally
- Class-based colors for chat messages (e.g., Warrior=red, Mage=blue) — reinforces identity and makes messages scannable
- Duplicate classes allowed — multiple players can pick the same class

### Claude's Discretion
- Game start trigger (lobby to adventure transition timing)
- Room code display placement in the dark fantasy UI
- Whether player actions are hidden or visible before DM responds (surprise element vs transparency)
- Brief pause duration after DM narration before next round timer starts
- Specific emoji reactions available in player chat
- Auto-action phrasing style for timed-out players

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase adds Socket.IO v4 as the real-time transport layer alongside the existing Express server. Socket.IO is the correct choice for this architecture: it provides bidirectional events (needed for turn timers, action submissions, player chat, and dice broadcasts), automatic reconnection with connection state recovery, and built-in room management. The existing server already uses `createServer` from `node:http` (see `server/src/index.ts` line 61), which is exactly what Socket.IO requires — no server restructuring is needed, just pass the `server` instance to `new Server(server)`.

The core architectural challenge is coordinating the batch turn cycle: a 60-second countdown, collecting up to 4 player actions, auto-filling missing actions, then running a single Bedrock stream that broadcasts tokens to all room members simultaneously. This is a server-orchestrated state machine (lobby → playing → waiting-for-actions → dm-responding → waiting-for-actions ...) stored in memory per room. The existing in-memory `conversationStore` pattern extends naturally: each multiplayer room gets one conversation ID and one shared history.

Single-player mode is completely unchanged. Multiplayer uses Socket.IO events exclusively for its coordination layer; the Bedrock streaming pattern shifts from SSE-per-client to server-side accumulation with `io.to(roomCode).emit('dm:chunk', { text })` broadcast per token.

**Primary recommendation:** Add `socket.io` (server) and `socket.io-client` (client) at version 4.8.3. Pass the existing `http.Server` instance from `index.ts` to Socket.IO. All multiplayer coordination lives in a new `server/src/services/roomStore.ts` and a new `server/src/sockets/` handler directory.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `socket.io` | 4.8.3 | Server-side WebSocket + event bus | First-class TypeScript, rooms, auto-reconnect, works with existing `http.Server` |
| `socket.io-client` | 4.8.3 | Client-side connection to Socket.IO server | Must match server major version; provides React-compatible event API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 5.1.6 | Short, URL-safe room code generation | Generating human-typeable 6-char room codes; already ESM-native |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Socket.IO | Raw WebSocket (`ws` package) | WS is lower-level — no rooms, no reconnect logic, more hand-rolling; not worth it for this scope |
| Socket.IO | SSE broadcast (extending current pattern) | SSE is server-to-client only; cannot receive player actions or chat messages; would require a second channel |
| nanoid | `crypto.randomBytes` | Works, but nanoid's `customAlphabet` gives cleaner uppercase-only codes in one call |

**Installation:**
```bash
# Server
npm install socket.io nanoid

# Client
npm install socket.io-client
```

---

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── sockets/
│   ├── index.ts           # Socket.IO server init — receives http.Server, exports io
│   ├── roomHandlers.ts    # join-room, create-room, player-ready events
│   ├── turnHandlers.ts    # action submission, timer management, DM trigger
│   └── chatHandlers.ts    # player-to-player private chat, emoji reactions
├── services/
│   ├── roomStore.ts       # In-memory Map of rooms (new, parallel to conversationStore)
│   └── conversationStore.ts  # Unchanged — single-player still uses this
└── index.ts               # Pass http.Server to initSocketIO(server)

client/src/
├── hooks/
│   ├── useSSEChat.ts      # Unchanged — single-player
│   └── useMultiplayerRoom.ts  # Socket.IO client hook for multiplayer
├── components/
│   ├── MultiplayerLobby.tsx   # Room create/join UI
│   ├── PlayerStatusBar.tsx    # Per-player name, class, connection, submitted status
│   ├── PlayerChat.tsx         # Private side-panel chat with emoji reactions
│   └── MultiplayerChatWindow.tsx  # DM narrative window adapted for multiplayer
└── services/
    └── socket.ts          # Single socket instance (autoConnect: false)
```

### Pattern 1: Socket.IO Init with Existing Express HTTP Server

The existing `index.ts` already calls `createServer(app)`. Pass that `server` to Socket.IO:

```typescript
// server/src/sockets/index.ts
// Source: https://socket.io/docs/v4/server-initialization/
import { Server } from "socket.io";
import type { Server as HTTPServer } from "node:http";

let io: Server;

export function initSocketIO(httpServer: HTTPServer, corsOrigin: string): Server {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
    },
    connectionStateRecovery: {
      // Reconnecting players within 2 min get their room/data restored
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });
  return io;
}

export { io };
```

```typescript
// server/src/index.ts — add after createApp()
const server = createServer(app);
initSocketIO(server, config.CLIENT_ORIGIN);   // add to existing createServer line
```

### Pattern 2: Room State Machine (Server-Side)

Each room progresses through states. Store in memory alongside `conversationStore`:

```typescript
// server/src/services/roomStore.ts
export type RoomPhase = "lobby" | "playing" | "collecting-actions" | "dm-responding";

export type Player = {
  socketId: string;
  displayName: string;
  characterClass: string;
  connected: boolean;
  submittedAction: string | null;  // null = not yet submitted
};

export type Room = {
  code: string;               // e.g. "TAVERN"
  conversationId: string;     // shared with conversationStore
  phase: RoomPhase;
  players: Map<string, Player>;  // keyed by socketId
  timerStartedAt: number | null;
  timerHandle: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();

export function createRoom(code: string, conversationId: string): Room { ... }
export function getRoom(code: string): Room | undefined { ... }
export function addPlayer(code: string, player: Player): void { ... }
export function removePlayer(code: string, socketId: string): void { ... }
export function submitAction(code: string, socketId: string, action: string): boolean { ... }
export function allActionsSubmitted(code: string): boolean { ... }
```

### Pattern 3: Turn Timer with Auto-Fill

```typescript
// server/src/sockets/turnHandlers.ts
// Source: https://socket.io/docs/v4/rooms/
function startTurnTimer(io: Server, roomCode: string, durationMs = 60_000): void {
  const room = getRoom(roomCode);
  if (!room) return;

  room.timerStartedAt = Date.now();
  room.phase = "collecting-actions";

  // Broadcast timer start to all players in room
  io.to(roomCode).emit("turn:timer-start", { durationMs, endsAt: room.timerStartedAt + durationMs });

  room.timerHandle = setTimeout(() => {
    // Auto-fill missing actions before triggering DM
    for (const [, player] of room.players) {
      if (player.connected && player.submittedAction === null) {
        player.submittedAction = `${player.displayName} follows the group cautiously.`;
      }
    }
    void triggerDMResponse(io, roomCode);
  }, durationMs);
}

function handleActionSubmit(io: Server, roomCode: string, socketId: string, action: string): void {
  submitAction(roomCode, socketId, action);

  // Broadcast to room that this player has submitted (without revealing action text)
  io.to(roomCode).emit("turn:player-submitted", { socketId });

  // If all connected players have submitted, fire early
  if (allActionsSubmitted(roomCode)) {
    const room = getRoom(roomCode)!;
    if (room.timerHandle) clearTimeout(room.timerHandle);
    void triggerDMResponse(io, roomCode);
  }
}
```

### Pattern 4: LLM Streaming to All Room Members

The key difference from single-player: instead of writing SSE chunks to a single `res` object, each Bedrock text chunk is emitted as a Socket.IO event to the entire room:

```typescript
// server/src/sockets/turnHandlers.ts
async function triggerDMResponse(io: Server, roomCode: string): Promise<void> {
  const room = getRoom(roomCode);
  if (!room) return;

  room.phase = "dm-responding";

  // Build the combined player actions prompt
  const actions = [...room.players.values()]
    .filter(p => p.submittedAction)
    .map(p => `[${p.displayName} the ${p.characterClass}]: ${p.submittedAction}`)
    .join("\n");

  const combinedMessage = `The players act simultaneously:\n${actions}\n\nWeave all of these into one dramatic narrative. You have full creative authority.`;

  // Emit DM stream start
  io.to(roomCode).emit("dm:stream-start");

  try {
    // streamBedrockResponse already exists — reuse with room's conversation history
    const result = await streamBedrockResponse(
      getWindowedHistory(room.conversationId),
      (chunk) => {
        // Broadcast each token to all room members
        io.to(roomCode).emit("dm:chunk", { text: chunk });
      },
      { characterClass: buildMultiplayerClassContext(room) }
    );

    // Persist to shared conversation history
    appendMessage(room.conversationId, { role: "assistant", content: result.text });
    appendMessage(room.conversationId, { role: "user", content: combinedMessage });

    io.to(roomCode).emit("dm:stream-end", { fullText: result.text });

  } catch (err) {
    io.to(roomCode).emit("dm:error", { message: "The Dungeon Master was lost to the void." });
  }

  // Reset for next round
  for (const [, player] of room.players) {
    player.submittedAction = null;
  }
  room.phase = "playing";

  // Brief pause then start next timer (Claude's Discretion: 3 seconds recommended)
  setTimeout(() => startTurnTimer(io, roomCode), 3_000);
}
```

### Pattern 5: Client Socket Hook

```typescript
// client/src/services/socket.ts
// Source: https://socket.io/how-to/use-with-react
import { io } from "socket.io-client";

const URL = import.meta.env.DEV ? "http://localhost:3000" : undefined;

export const socket = io(URL, {
  autoConnect: false,  // Connect only when entering multiplayer mode
});
```

```typescript
// client/src/hooks/useMultiplayerRoom.ts
import { useEffect, useState, useCallback } from "react";
import { socket } from "../services/socket";

export function useMultiplayerRoom() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [dmMessages, setDmMessages] = useState<string[]>([]);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);

  useEffect(() => {
    socket.connect();

    function onRoomState(state: RoomStatePayload) { /* sync */ }
    function onDmChunk({ text }: { text: string }) { /* accumulate */ }
    function onPlayerSubmitted({ socketId }: { socketId: string }) { /* update bar */ }
    function onTurnTimerStart({ endsAt }: { endsAt: number }) { setTimerEndsAt(endsAt); }

    socket.on("room:state", onRoomState);
    socket.on("dm:chunk", onDmChunk);
    socket.on("turn:player-submitted", onPlayerSubmitted);
    socket.on("turn:timer-start", onTurnTimerStart);

    // CRITICAL: always clean up to prevent duplicate listeners on re-renders
    return () => {
      socket.off("room:state", onRoomState);
      socket.off("dm:chunk", onDmChunk);
      socket.off("turn:player-submitted", onPlayerSubmitted);
      socket.off("turn:timer-start", onTurnTimerStart);
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((displayName: string, characterClass: string) => {
    socket.emit("room:create", { displayName, characterClass });
  }, []);

  const joinRoom = useCallback((code: string, displayName: string, characterClass: string) => {
    socket.emit("room:join", { code, displayName, characterClass });
  }, []);

  const submitAction = useCallback((action: string) => {
    socket.emit("turn:submit-action", { action });
  }, []);

  return { roomCode, players, phase, dmMessages, timerEndsAt, createRoom, joinRoom, submitAction };
}
```

### Pattern 6: Room Code Generation

```typescript
// server/src/services/roomStore.ts
import { customAlphabet } from "nanoid";

// 6-char uppercase alpha — easy to type, read aloud, or share
// 26^6 = 308 million combinations; for 2-4 player sessions with short lifetime,
// collision rate is negligible. Scope uniqueness to active rooms only.
const generateCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ", 6);
// Note: omit I and O (visually similar to 1 and 0)

export function generateUniqueRoomCode(): string {
  let code: string;
  do {
    code = generateCode();
  } while (rooms.has(code));
  return code;
}
```

### Pattern 7: Player Disconnection Handling

```typescript
// server/src/sockets/roomHandlers.ts
// Source: https://socket.io/docs/v4/connection-state-recovery
socket.on("disconnect", () => {
  const { roomCode } = socket.data as { roomCode?: string };
  if (!roomCode) return;

  // Mark player as disconnected (do NOT remove — character stays in story)
  markPlayerDisconnected(roomCode, socket.id);

  // Notify other players in room
  io.to(roomCode).emit("room:player-disconnected", {
    socketId: socket.id,
    displayName: getPlayerName(roomCode, socket.id),
  });

  // If disconnected player hadn't submitted, auto-fill so turn can proceed
  autoFillMissingActionIfNeeded(roomCode, socket.id);
});
```

Reconnection handling using connection state recovery:
```typescript
socket.on("connection", (socket) => {
  if (socket.recovered) {
    // Socket.IO restored socket.data (includes roomCode, displayName, characterClass)
    // Re-add to room, mark as connected
    const { roomCode } = socket.data as { roomCode?: string };
    if (roomCode) {
      markPlayerReconnected(roomCode, socket.id);
      io.to(roomCode).emit("room:player-reconnected", { socketId: socket.id });
      // Send current room state to reconnected player
      socket.emit("room:state", getRoomState(roomCode));
    }
  }
});
```

### Pattern 8: Socket.IO + Vite Dev Proxy

To avoid CORS issues during development, proxy Socket.IO through Vite:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
```

Then on the client, use `socket = io()` with no URL (picks up from the page origin via proxy).

### Anti-Patterns to Avoid

- **Registering socket event listeners inside React child components:** Causes duplicate registrations on re-renders. Register in the top-level hook, pass state down via props or context.
- **Using `app.listen()` with Socket.IO:** Socket.IO must attach to the raw `http.Server`, not the Express app. The project already uses `createServer(app)` correctly.
- **Storing room timers without cleanup:** If a room is abandoned, `setTimeout` keeps firing. Always `clearTimeout` on room cleanup/deletion.
- **Sending DM action text to the player chat channel:** The player-to-player chat must remain strictly invisible to the Bedrock prompt. Two separate channels — never merge them into conversation history.
- **Emitting to rooms with `socket.to(room)` during DM streaming:** `socket.to()` excludes the sender. Since DM streaming is triggered server-side (not from a socket event), use `io.to(roomCode).emit()` to reach all players including the triggering socket.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Real-time bidirectional events | Custom WebSocket server | `socket.io` | Rooms, namespaces, reconnect, fallback transport all included |
| Reconnection logic | Manual ping/reconnect loop | Socket.IO's built-in reconnection + `connectionStateRecovery` | Race conditions, exponential backoff, and room restoration are solved |
| Room membership tracking | Manual Set of socketIds | `socket.join(roomCode)` + `io.to(roomCode)` | Socket.IO's Adapter manages this; sockets auto-leave on disconnect |
| Broadcast ordering | Message queue | Socket.IO guarantee: events arrive in-order per connection | Ordering within a room broadcast is guaranteed |
| Short unique IDs | Custom hex generator | `nanoid` with `customAlphabet` | Crypto-secure, configurable alphabet, ESM-native, tiny |

**Key insight:** Socket.IO's room system is purpose-built for this exact use case. Joining a room, broadcasting to a room, and excluding/including the sender are all one-liners. The effort should go into the turn state machine, not the transport layer.

---

## Common Pitfalls

### Pitfall 1: Timer Not Cleared on Early Submission
**What goes wrong:** All players submit actions before 60 seconds. Server correctly fires the DM. But the 60-second `setTimeout` also fires later, triggering a second DM call on the same round.
**Why it happens:** `setTimeout` handle is not cleared when early-trigger fires.
**How to avoid:** Always `clearTimeout(room.timerHandle)` before calling `triggerDMResponse`. Set `room.timerHandle = null` after clearing.
**Warning signs:** DM responds twice in a row with no player input between.

### Pitfall 2: Player Joins During DM Response
**What goes wrong:** A new player joins mid-game while the DM is streaming. They receive partial `dm:chunk` events and have an incomplete message in their chat.
**Why it happens:** Joining mid-stream puts them in the room before the stream completes.
**How to avoid:** When a player joins during `dm-responding` phase, send them the current room state but buffer incoming `dm:chunk` events client-side until `dm:stream-end` arrives. Alternatively, hold the full DM text in room state and send it as a single payload on join.
**Warning signs:** New joiners see a cut-off DM message.

### Pitfall 3: Duplicate Socket Event Listeners in React
**What goes wrong:** Component re-renders (e.g., state update during streaming) cause `useEffect` to re-run, registering the same listener twice. DM chunks appear doubled.
**Why it happens:** `socket.on()` doesn't deduplicate — calling it twice with the same handler registers it twice.
**How to avoid:** Always return a cleanup function from `useEffect` that calls `socket.off(event, handler)` using the exact same named function reference.
**Warning signs:** Every DM word appears twice; `socket.listenerCount('dm:chunk')` returns 2+.

### Pitfall 4: Bedrock Stream Runs Before All Actions Are Committed
**What goes wrong:** Timer fires; server starts building the DM prompt; meanwhile the last player's action submission event arrives concurrently and is not included.
**Why it happens:** Race between timer callback and final submission event.
**How to avoid:** When the timer fires, snapshot the current state of `room.players` immediately (synchronously, before any async work). Node.js is single-threaded so no actual race exists — just don't `await` between reading actions and using them.
**Warning signs:** One player's action is consistently ignored at timer expiry.

### Pitfall 5: Room Code Collision Under Load
**What goes wrong:** Two concurrent `room:create` events generate the same code.
**Why it happens:** `generateCode()` is called before either room is inserted.
**How to avoid:** Generate code and insert atomically in a synchronous function (Node.js single-thread makes this safe for in-memory store). The do-while loop in `generateUniqueRoomCode` is sufficient for in-memory Maps.
**Warning signs:** Two rooms share a code; players joining see each other's game.

### Pitfall 6: Socket.IO CORS Rejection in Development
**What goes wrong:** Client at `localhost:5173` connects to server at `localhost:3000`; Socket.IO rejects with CORS error.
**Why it happens:** Socket.IO has its own CORS config independent of Express's.
**How to avoid:** Either (a) configure `cors: { origin: "http://localhost:5173" }` in the `new Server()` options, or (b) use Vite's proxy (`ws: true`) so all Socket.IO traffic comes from the same origin. Option (b) is cleaner for dev.
**Warning signs:** Browser console shows `Access-Control-Allow-Origin` errors on `/socket.io/` polling requests.

### Pitfall 7: Memory Accumulation from Abandoned Rooms
**What goes wrong:** Players abandon a game without formally leaving. Room stays in memory forever, timer keeps running.
**Why it happens:** `disconnect` event fires but room is not cleaned up when all players leave.
**How to avoid:** In the `disconnect` handler, check if `room.players.values()` has zero connected players. If so, `clearTimeout(room.timerHandle)` and `rooms.delete(roomCode)`.
**Warning signs:** Node memory grows linearly with number of abandoned sessions.

---

## Code Examples

### Socket.IO Server Init (fits existing index.ts)

```typescript
// server/src/index.ts — existing structure, add one line
// Source: https://socket.io/docs/v4/server-initialization/
const app = createApp({ driver });
const server = createServer(app);
initSocketIO(server, config.CLIENT_ORIGIN ?? "http://localhost:5173");
server.listen(config.PORT, () => { ... });
```

### Typed Socket.IO Events

```typescript
// server/src/sockets/types.ts
// Source: https://socket.io/docs/v4/typescript/
export interface ServerToClientEvents {
  "room:state": (state: RoomStatePayload) => void;
  "room:player-joined": (player: PlayerPayload) => void;
  "room:player-disconnected": (data: { socketId: string; displayName: string }) => void;
  "room:player-reconnected": (data: { socketId: string }) => void;
  "room:started": () => void;
  "turn:timer-start": (data: { durationMs: number; endsAt: number }) => void;
  "turn:player-submitted": (data: { socketId: string }) => void;
  "dm:stream-start": () => void;
  "dm:chunk": (data: { text: string }) => void;
  "dm:stream-end": (data: { fullText: string }) => void;
  "dm:error": (data: { message: string }) => void;
  "chat:message": (data: ChatMessagePayload) => void;
  "chat:reaction": (data: { messageId: string; emoji: string; socketId: string }) => void;
  "dice:rolled": (data: { socketId: string; displayName: string; result: number }) => void;
}

export interface ClientToServerEvents {
  "room:create": (data: { displayName: string; characterClass: string }) => void;
  "room:join": (data: { code: string; displayName: string; characterClass: string }) => void;
  "room:ready": () => void;
  "turn:submit-action": (data: { action: string }) => void;
  "chat:send": (data: { text: string }) => void;
  "chat:react": (data: { messageId: string; emoji: string }) => void;
  "dice:roll": (data: { result: number }) => void;
}

export interface SocketData {
  roomCode: string;
  displayName: string;
  characterClass: string;
}
```

### Broadcasting Patterns Quick Reference

```typescript
// Source: https://socket.io/docs/v4/rooms/

// To all players in a room (including the triggering socket — use for DM streaming)
io.to(roomCode).emit("dm:chunk", { text });

// To all in room EXCEPT the sender (use for player chat — others see it)
socket.to(roomCode).emit("chat:message", payload);

// To a single player (e.g., send room state to reconnecting player)
socket.emit("room:state", getRoomState(roomCode));

// Check room membership server-side
const sockets = await io.in(roomCode).fetchSockets();
console.log(sockets.length); // number of connected sockets in room
```

### Game Start Trigger (Claude's Discretion Recommendation)

Recommended: start the game immediately when 2+ players are in lobby AND the last player clicks "Ready". No explicit host action needed (host has no special powers per locked decision).

```typescript
// server/src/sockets/roomHandlers.ts
socket.on("room:ready", () => {
  const { roomCode } = socket.data;
  const room = getRoom(roomCode);
  if (!room || room.phase !== "lobby") return;

  markPlayerReady(roomCode, socket.id);

  const connectedCount = [...room.players.values()].filter(p => p.connected).length;
  const readyCount = [...room.players.values()].filter(p => p.ready).length;

  if (connectedCount >= 2 && readyCount === connectedCount) {
    room.phase = "playing";
    io.to(roomCode).emit("room:started");
    // Brief dramatic pause (3s recommended) before first timer
    setTimeout(() => startTurnTimer(io, roomCode), 3_000);
  }
});
```

### Multiplayer DM System Prompt Extension

Extend the existing `DM_SYSTEM_PROMPT` for multiplayer context. The message sent to Bedrock must describe ALL players and their actions:

```typescript
// server/src/services/bedrock.ts — add alongside existing exports
export function buildMultiplayerSystemPrompt(players: Player[]): string {
  const roster = players.map(p => `- ${p.displayName}: ${p.characterClass}`).join("\n");
  return `${DM_SYSTEM_PROMPT}

## Multiplayer Party
This is a multiplayer session. The party consists of:
${roster}

When players act simultaneously, weave ALL of their actions into ONE cohesive narrative. You have full authorial control — actions may succeed, fail, contradict, or complement each other. Do not narrate each player's action separately. Create a unified, dramatic story beat. Address characters by their display names.`;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-polling fallback as default | WebSocket-first with polling fallback only on degraded networks | Socket.IO v3+ | No impact for this project — all dev/demo environments support WebSocket |
| Manual room cleanup on disconnect | `connectionStateRecovery` preserves room membership for reconnects | Socket.IO v4.6 (2023) | Players who drop briefly can resume without re-joining |
| `io.to()` mutating io instance (bug) | `io.to()` is immutable/chainable | Socket.IO v4.0 (2021) | Safe to call multiple times without side effects |

**Current recommended version:** 4.8.3 (December 2025, confirmed from official docs).

---

## Open Questions

1. **Single-player mode UI coexistence**
   - What we know: Single-player uses fetch+SSE; multiplayer uses Socket.IO. Both must coexist.
   - What's unclear: How the top-level `App.tsx` routes between modes — a mode selector screen is needed.
   - Recommendation: Add a `GameMode` enum (`"single" | "multiplayer"`) to top-level state. Render either `<SinglePlayerGame>` or `<MultiplayerLobby>` based on selection. Neither modifies the other's code.

2. **Lobby to game transition for first round**
   - What we know: Claude's Discretion — user left this open.
   - What's unclear: Should the first round have a timer immediately, or should the DM deliver an opening monologue first?
   - Recommendation: On `room:started`, trigger a DM opening monologue (same as single-player's opening) before starting the first 60-second timer. This gives all players context and a dramatic entry point.

3. **Player action visibility before DM responds**
   - What we know: Claude's Discretion — whether actions are hidden or visible before DM responds.
   - What's unclear: Surprise vs. transparency tradeoff.
   - Recommendation: Hide other players' action text until `dm:stream-end` fires. Show only "Player X has submitted" in the status bar (via `turn:player-submitted`). This preserves narrative surprise and prevents players from gaming each other.

4. **TTS in multiplayer**
   - What we know: TTS (MiniMax) exists for single-player. No multiplayer TTS decision was made.
   - What's unclear: Should DM responses be narrated aloud in multiplayer? With 4 players, audio coordination is complex.
   - Recommendation: Disable TTS in multiplayer for the hackathon demo. Text-stream only. The existing `stripTTSTags` function still strips emotion tags before displaying.

5. **Max rooms in memory**
   - What we know: No database; all state is in-memory.
   - What's unclear: How many concurrent rooms the demo will support before memory pressure.
   - Recommendation: Not a concern for the hackathon demo (expect < 5 concurrent rooms). No cap needed.

---

## Sources

### Primary (HIGH confidence)
- `https://socket.io/docs/v4/typescript/` — TypeScript typed events interface pattern (verified January 2026)
- `https://socket.io/docs/v4/server-initialization/` — http.createServer integration, CORS config (verified)
- `https://socket.io/docs/v4/rooms/` — room join/leave/broadcast API (verified)
- `https://socket.io/docs/v4/server-api/` — io.to(), io.fetchSockets(), socket.join() (verified)
- `https://socket.io/how-to/use-with-react` — React socket hook pattern, cleanup (verified)
- `https://socket.io/docs/v4/connection-state-recovery` — disconnect/reconnect state recovery (verified)
- `https://socket.io/docs/v4/tutorial/step-5` — broadcast patterns (verified)
- `https://socket.io/docs/v4/memory-usage/` — memory management per connection (verified)
- `https://www.npmjs.com/package/socket.io` — confirmed version 4.8.3 (December 2025)
- `https://www.npmjs.com/package/nanoid` — confirmed version 5.1.6, customAlphabet API

### Secondary (MEDIUM confidence)
- `https://socket.io/docs/v4/client-installation/` — socket.io-client version matches server 4.8.3 (WebSearch, confirmed by npm)
- Vite proxy config for WebSocket — multiple sources agree on `ws: true` + `/socket.io` path pattern

### Tertiary (LOW confidence)
- Game lobby "all players ready" trigger pattern — derived from multiple community examples (Medium, GitHub); no single authoritative source but pattern is consistent across all

---

## Metadata

**Confidence breakdown:**
- Standard stack (Socket.IO 4.8.3 + nanoid 5.1.6): HIGH — confirmed from official npm and Socket.IO docs dated January 2026
- Architecture patterns (room state machine, turn timer, broadcast): HIGH — Socket.IO APIs verified from official docs; state machine pattern is standard for this problem class
- LLM streaming to room: HIGH — `io.to(roomCode).emit()` per chunk is the standard pattern; Bedrock `streamBedrockResponse` already exists and is reusable
- React hook patterns: HIGH — verified from official Socket.IO React guide
- Pitfalls: HIGH — timer cleanup, duplicate listeners, CORS are well-documented; room cleanup is logic-derived from single-thread Node.js guarantees

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (Socket.IO 4.x is stable; nanoid 5.x is stable — 30 days is safe)
