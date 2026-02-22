# Backend Services Reference

All services are located under `server/src/services/`.

---

## bedrock.ts -- AWS Bedrock Integration

The core LLM service. Wraps AWS Bedrock's `ConverseStreamCommand` for streaming Claude responses.

### Functions

#### `streamBedrockResponse(messages, onChunk, options)`

Stream a response from Claude via Bedrock.

| Parameter | Type | Description |
|-----------|------|-------------|
| `messages` | `ChatMessage[]` | Conversation history (system + user/assistant turns) |
| `onChunk` | `(text: string) => void` | Callback for each streamed text chunk |
| `options.characterClass` | `string?` | Player's class for prompt context |
| `options.pronouns` | `string?` | Player's pronouns for narrative |
| `options.loreContext` | `string?` | Injected Neo4j lore context |
| `options.isMultiplayer` | `boolean?` | Use multiplayer system prompt |
| `options.players` | `Player[]?` | Party roster for multiplayer prompt |

**Returns:** `{ text: string, inputTokens: number, outputTokens: number }`

**Behavior:**
- 45-second timeout via AbortSignal
- Datadog LLMObs tracing (kind: 'llm')
- Streams text chunks via callback for SSE compatibility
- Strips internal tags (mood, voice, TTS) from final persisted text

### System Prompts

Two system prompt variants are maintained:

**`DM_SYSTEM_PROMPT`** -- Single-player base prompt:
- DM persona: gruff, world-weary veteran of The Shattered Crown Tavern
- Key NPCs: Gorm (barkeep), Goblin Scout, Elder Mira, Hooded Traveller
- Quest hook: Ring of Ashwick stolen, goblins suspected, northern caves
- Dice roll instructions with result brackets (1-5 failure through 20 critical)
- MiniMax TTS emotion tags: `[excited]`, `[whisper]`, `[angry]`, `[fearful]`, `[sad]`, `[shouting]`
- Mood tags: `{{mood:combat|tavern|mystery|dramatic|danger}}`
- Character voice tags: `{{voice:barkeep}}...{{/voice}}`, `{{voice:goblin}}...{{/voice}}`

**`buildMultiplayerSystemPrompt(players)`** -- Extends base prompt with:
- Party roster with each player's name, class, gender, and pronouns
- Rules for addressing individual players by name
- Pronoun usage instructions per player

---

## tts.ts -- MiniMax Text-to-Speech

Multi-voice TTS with emotion control, mood-based prosody, and caching.

### Models

| Model | Quality | Latency | Use Case |
|-------|---------|---------|----------|
| `speech-2.8-hd` | Higher | Slower | Opening monologue |
| `speech-2.8-turbo` | Standard | Faster | In-game narration |

### Voice Casting

| Character | Voice ID | Description |
|-----------|----------|-------------|
| `narrator` | English_CaptivatingStoryteller | Senior storyteller, cold/detached |
| `barkeep` | English_Debator | Tough middle-aged ex-soldier |
| `goblin` | English_Comedian | Breezy, chaotic energy |

### Mood Prosody

Mood affects speed and pitch of TTS output:

| Mood | Speed | Pitch | Feel |
|------|-------|-------|------|
| `combat` | 1.15 | +2 | Urgent, high pitch |
| `tavern` | 0.9 | -1 | Relaxed, low pitch |
| `mystery` | 0.85 | -2 | Slow, mysterious |
| `dramatic` | 0.95 | +1 | Emotional, heightened |
| `danger` | 1.05 | +3 | Tense, high pitch |

### Functions

#### `synthesizeSpeech(text, options)`

Generate audio from text.

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | Text to synthesize |
| `options.voice` | `string?` | Voice ID (default: narrator) |
| `options.mood` | `string?` | Mood for prosody adjustment |
| `options.model` | `string?` | TTS model (hd or turbo) |

**Returns:** `Buffer` (MP3 audio data)

#### `splitVoiceSegments(text)`

Parse text with `{{voice:name}}...{{/voice}}` tags into segments for multi-voice synthesis.

**Returns:** `Array<{ voice: string, text: string }>`

### Caching

- **Key:** SHA-256 hash of `text + voice + mood + model`
- **TTL:** 30 minutes
- **Max entries:** 200 (LRU eviction)
- **Fallback:** If a non-narrator voice fails, retries with narrator voice

### Datadog Tracing

Each TTS call is wrapped in a manual `tool` span with tags:
- `provider: minimax`
- `model: speech-2.8-hd|turbo`
- `voice: <voice-id>`
- `mood: <mood>`

---

## voices.ts -- Voice Catalog

Comprehensive catalog of 45 verified English voices from the MiniMax platform.

### Voice Metadata

Each voice entry includes:
- `id` -- API voice identifier
- `name` -- Human-readable name
- `gender` -- male/female
- `age` -- young/middle/senior
- `accent` -- American/British/Australian/etc.
- `description` -- Voice character description
- `archetype` -- Suggested D&D character archetype

### Helper Functions

| Function | Description |
|----------|-------------|
| `getVoice(id)` | Get voice metadata by ID |
| `voicesByGender(gender)` | Filter voices by gender |
| `voicesByArchetype(archetype)` | Filter voices by D&D archetype |

---

## rag.ts -- Neo4j Retrieval-Augmented Generation

Lightweight RAG pipeline for injecting world lore into Bedrock prompts.

### Entity Extraction

Keyword-based (no LLM call). Matches player message text against a hardcoded alias map:

| Category | Entities |
|----------|----------|
| Characters | Gorm, Goblin Scout, Elder Mira, Hooded Traveller, Chieftain Skrix |
| Locations | Ashwick, The Shattered Crown Tavern, Northern Caves, Coldwall Pass, The Barrow Road |
| Items | Ring of Ashwick, Gorm's Tankard, Iron Lantern, Short Sword |
| Quests | Retrieve the Ring of Ashwick, Survive the Goblin Ambush |
| Factions | Ashwick Townsfolk, Goblin Warband, Coldwall Veterans, Northern Wanderers |

### Functions

#### `buildLoreContext(message)`

Extract entities from the player's message and query Neo4j for related lore.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Player's latest message |

**Returns:** `string` -- Formatted markdown bullet list of lore, or empty string on failure.

### Caching

- **Key:** SHA-256 hash of sorted entity set
- **TTL:** 10 minutes
- **Max entries:** 100

### Graceful Degradation

If Neo4j is unavailable or queries fail, `buildLoreContext` returns an empty string. Chat continues without lore injection. No error is surfaced to the player.

---

## neo4j.ts -- Neo4j Driver

Singleton Neo4j driver management.

### Initialization

```typescript
// Called at server startup (index.ts)
const driver = neo4j.driver(
  'neo4j+s://xxx.databases.neo4j.io',
  neo4j.auth.basic(username, password)
);
await driver.verifyConnectivity();  // Fail-fast
```

### Usage

Uses `driver.executeQuery()` (preferred over manual session management) which handles session lifecycle automatically.

**Connection scheme:** Must be `neo4j+s://` for AuraDB (TLS required).

---

## conversationStore.ts -- Single-Player Conversation History

In-memory conversation state for single-player sessions.

### Data Structure

```typescript
Map<conversationId, {
  id: string;
  history: ChatMessage[];
  characterClass?: string;
  pronouns?: string;
}>
```

### Functions

| Function | Description |
|----------|-------------|
| `getOrCreate(id?, class?, pronouns?)` | Get existing or create new conversation |
| `appendMessage(id, message)` | Add a message to conversation history |
| `getWindowedHistory(id, maxTurns?)` | Get last N turns (default: 12) |
| `getCharacterClass(id)` | Get stored character class |
| `getPronouns(id)` | Get stored pronouns |

### Token Budget

`getWindowedHistory` returns only the last 12 turns to stay within Bedrock's token budget (~500 tokens per turn average).

---

## roomStore.ts -- Multiplayer Room State

In-memory room management for multiplayer sessions.

### Data Structures

**Room:**
```typescript
{
  code: string;                    // 6-char code (A-Z, no I/O)
  conversationId: string;          // Shared conversation history
  phase: RoomPhase;                // lobby | playing | collecting-actions | dm-responding
  players: Map<socketId, Player>;
  timerStartedAt: number | null;
  timerHandle: NodeJS.Timeout | null;
  currentDmText: string;           // For late-joiner catch-up
}
```

**Player:**
```typescript
{
  socketId: string;
  displayName: string;
  characterClass: string;
  gender: string;
  pronouns: string;
  connected: boolean;
  ready: boolean;
  submittedAction: string | null;
  idle: boolean;
}
```

### Functions

| Function | Description |
|----------|-------------|
| `generateUniqueRoomCode()` | 6-char base26 (excludes I/O for readability) |
| `createRoom(code, conversationId)` | Initialize a new room |
| `getRoom(code)` | Get room by code |
| `deleteRoom(code)` | Remove room |
| `addPlayer(code, player)` | Add player (max 4 enforced) |
| `submitAction(code, socketId, action)` | Record player's action |
| `allActionsSubmitted(code)` | Check if all connected players submitted |

---

## config.ts -- Environment Configuration

Zod-validated environment variable loading.

### Validation Strategy

Variables are validated at usage time, not at module load. This allows the server to start even if some optional integrations (Neo4j, Datadog, MiniMax) aren't configured.

### Variable Groups

| Group | Variables | Required |
|-------|-----------|----------|
| AWS | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID` | Yes (for chat) |
| Neo4j | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | No (graceful degradation) |
| Datadog | `DD_API_KEY`, `DD_SITE`, `DD_LLMOBS_*` vars | No (tracing disabled) |
| MiniMax | `MINIMAX_API_KEY`, `MINIMAX_GROUP_ID`, `MINIMAX_MUSIC_API_KEY` | No (text-only mode) |
| Server | `PORT` (default: 3001), `NODE_ENV` | No (defaults provided) |

---

## usageTracker.ts -- Cost Tracking

Tracks API usage costs across all integrations.

### Pricing

| Service | Rate |
|---------|------|
| Bedrock Haiku (input) | $0.25 / 1M tokens |
| Bedrock Haiku (output) | $1.25 / 1M tokens |
| MiniMax TTS | $0.004 / 1K characters |
| MiniMax Music | $0.10 / generation |

### Functions

| Function | Description |
|----------|-------------|
| `recordBedrockUsage(convId, feature, in, out)` | Record LLM call cost |
| `recordTtsUsage(convId, chars)` | Record TTS cost |
| `recordMusicUsage()` | Record music generation cost |
| `getGlobalUsage()` | Aggregate usage across all sessions |
| `getConversationUsage(convId)` | Usage for a specific session |

---

## logger.ts -- Event Logging

Structured logging with request tracking.

### Features

- JSON-formatted log output
- Request ID correlation
- Event type categorization
- Timestamp and duration tracking

---

## system-prompt.ts -- DM System Prompt

Template functions for building the DM's system prompt.

### Template Variables

The system prompt includes dynamic sections for:
- Character class context (abilities, combat style)
- Lore context from Neo4j RAG
- Player pronouns
- Party roster (multiplayer)
- Mood/emotion tag instructions
- Voice casting instructions
