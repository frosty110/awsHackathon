# Socket.IO Event Reference

Real-time multiplayer communication uses Socket.IO (WebSocket transport with HTTP long-polling fallback).

**Connection:** `ws://localhost:3001` (proxied via Vite in development)

The client socket is created with `autoConnect: false` and manually connected when entering multiplayer mode.

**Connection Recovery:** `maxDisconnectionDuration: 120000` (2 minutes). Disconnected players can rejoin automatically within this window.

---

## Client -> Server Events

Events emitted by the client to the server.

### room:create

Create a new multiplayer room.

```typescript
socket.emit("room:create", {
  displayName: "Shadowmere",
  characterClass: "wizard",
  gender: "female",
  pronouns: "She/Her"       // optional
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | `string` | Yes | Player's display name |
| `characterClass` | `string` | Yes | One of: fighter, wizard, rogue, cleric, ranger, paladin |
| `gender` | `string` | Yes | One of: male, female, nonbinary |
| `pronouns` | `string` | No | Custom pronoun string (defaults by gender) |

**Server Response:** `room:created` + `room:state`

---

### room:join

Join an existing room by code.

```typescript
socket.emit("room:join", {
  code: "ABCDEF",
  displayName: "Thornwick",
  characterClass: "fighter",
  gender: "male",
  pronouns: "He/Him"
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | Yes | 6-character room code |
| `displayName` | `string` | Yes | Player's display name |
| `characterClass` | `string` | Yes | Character class |
| `gender` | `string` | Yes | Gender selection |
| `pronouns` | `string` | No | Custom pronouns |

**Server Response:** `room:state` (to all players) + `room:player-joined` (to others)

**Error:** `room:error` if room doesn't exist or is full (4-player cap).

---

### room:ready

Signal that the player is ready to start the game.

```typescript
socket.emit("room:ready");
```

No payload. When all connected players are ready, the server transitions to `playing` phase and triggers the DM opening monologue.

---

### turn:submit-action

Submit the player's action for the current turn.

```typescript
socket.emit("turn:submit-action", {
  action: "I cast fireball at the group of goblins!"
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `string` | Yes | Player's action text |

**Behavior:**
- First submission in a turn starts the 30-second countdown timer
- If all connected players have submitted, the DM responds immediately (no timer wait)
- Players who don't submit before the timer expires get auto-filled with "waits and observes"

---

### turn:unsubmit-action

Retract a previously submitted action (allows editing).

```typescript
socket.emit("turn:unsubmit-action");
```

No payload. Clears the player's submitted action. Only valid during `collecting-actions` phase.

---

### chat:send

Send a player-to-player chat message.

```typescript
socket.emit("chat:send", {
  text: "Should we split up?"
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | Yes | Chat message text |

---

### chat:react

React to a chat message with an emoji.

```typescript
socket.emit("chat:react", {
  messageId: "msg-uuid-123",
  emoji: "sword"            // or "shield", "skull", "fire", "laugh"
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageId` | `string` | Yes | ID of the message to react to |
| `emoji` | `string` | Yes | Reaction emoji identifier |

---

### dice:roll

Broadcast a dice roll result to all players.

```typescript
socket.emit("dice:roll", {
  result: 17
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `result` | `number` | Yes | d20 roll result (1-20) |

---

### player:idle / player:active

Signal player presence state changes.

```typescript
socket.emit("player:idle");
socket.emit("player:active");
```

No payload. Used for idle detection and display in the player status bar.

---

## Server -> Client Events

Events emitted by the server to clients.

### Room Lifecycle

#### room:created

Confirms room creation with the generated code.

```typescript
{ code: "XKWPLT" }
```

#### room:state

Full room state snapshot. Sent on join, phase transitions, and reconnection.

```typescript
{
  code: "XKWPLT",
  phase: "lobby",    // "lobby" | "playing" | "collecting-actions" | "dm-responding"
  players: [
    {
      socketId: "abc123",
      displayName: "Shadowmere",
      characterClass: "wizard",
      gender: "female",
      pronouns: "She/Her",
      connected: true,
      ready: true,
      submittedAction: false,
      idle: false
    }
  ]
}
```

#### room:player-joined

A new player has joined the room.

```typescript
{
  socketId: "def456",
  displayName: "Thornwick",
  characterClass: "fighter",
  gender: "male",
  pronouns: "He/Him",
  connected: true,
  ready: false,
  submittedAction: false,
  idle: false
}
```

#### room:player-disconnected

A player has disconnected (may reconnect within 2 minutes).

```typescript
{
  socketId: "def456",
  displayName: "Thornwick"
}
```

#### room:player-reconnected

A previously disconnected player has reconnected.

```typescript
{ socketId: "def456" }
```

#### room:player-idle / room:player-active

Player presence state changed.

```typescript
{ socketId: "def456" }
```

#### room:started

All players are ready. The game is starting.

```typescript
// no payload
```

#### room:error

An error occurred (room full, invalid code, etc.).

```typescript
{ message: "Room is full (max 4 players)" }
```

---

### Turn Orchestration

#### turn:collecting-start

A new turn has begun. Players can submit actions.

```typescript
// no payload
```

#### turn:timer-start

The countdown timer has started (triggered by the first player's submission).

```typescript
{
  durationMs: 30000,
  endsAt: 1708531800000    // Unix timestamp
}
```

#### turn:player-submitted

A player submitted their action.

```typescript
{ socketId: "abc123" }
```

#### turn:player-unsubmitted

A player retracted their action.

```typescript
{ socketId: "abc123" }
```

---

### DM Narration

#### dm:stream-start

The DM is about to start narrating. Clear previous response and show loading.

```typescript
// no payload
```

#### dm:chunk

A chunk of the DM's streaming narration.

```typescript
{ text: "The goblin chieftain raises " }
```

#### dm:stream-end

The DM has finished narrating this turn.

```typescript
{
  fullText: "The goblin chieftain raises his rusty blade...",
  mood: "combat"    // optional: tavern, combat, mystery, dramatic, danger
}
```

#### dm:tts-ready

TTS audio has been generated for the DM's response.

```typescript
{ audio: "<base64-encoded-mp3>" }
```

#### dm:error

An error occurred during DM response generation.

```typescript
{ message: "Bedrock streaming timed out" }
```

---

### Player Chat

#### chat:message

A player-to-player chat message.

```typescript
{
  id: "msg-uuid-456",
  fromSocketId: "abc123",
  fromName: "Shadowmere",
  fromClass: "wizard",
  fromGender: "female",
  text: "Should we split up?",
  timestamp: 1708531800000,
  type: "chat"           // "chat" or "action"
}
```

#### chat:reaction

A reaction to a chat message.

```typescript
{
  messageId: "msg-uuid-456",
  emoji: "fire",
  fromSocketId: "def456",
  fromName: "Thornwick"
}
```

#### dice:rolled

A player rolled the dice.

```typescript
{
  socketId: "abc123",
  displayName: "Shadowmere",
  result: 17
}
```

---

## Room Phase State Machine

```
lobby ──(all players ready)──> playing
                                  │
                                  v
                          collecting-actions
                           │              │
            (all submitted) │              │ (30s timer expires)
                           │              │
                           v              v
                          dm-responding
                                  │
                      (response complete + 3s pause)
                                  │
                                  v
                          collecting-actions  (next turn)
```

## Connection Lifecycle

```
1. Client creates socket with autoConnect: false
2. User enters multiplayer → socket.connect()
3. User creates/joins room → room:create / room:join
4. Server responds with room:state
5. Players ready up → room:ready
6. All ready → room:started + dm opening monologue
7. Turn loop begins (collecting → dm-responding → collecting)
8. On disconnect → room:player-disconnected (2min recovery window)
9. On reconnect → room:player-reconnected + room:state (full resync)
10. On leave → socket.disconnect() + return to mode select
```
