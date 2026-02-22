# API Reference

Base URL: `http://localhost:3001/api`

All endpoints accept and return JSON unless otherwise noted. SSE endpoints stream `text/event-stream`.

---

## Endpoints

### POST /api/chat

Stream a DM response as Server-Sent Events (SSE). This is the primary gameplay endpoint for single-player mode.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `string` | Yes | Player's action or dialogue |
| `conversationId` | `string` | No | Session ID (generated if omitted) |
| `diceResult` | `number` | No | d20 roll result (1-20) |
| `characterClass` | `string` | No | Player's class (fighter, wizard, rogue, cleric, ranger, paladin) |
| `pronouns` | `string` | No | Player's pronouns (e.g., "They/Them") |
| `isSystemTrigger` | `boolean` | No | Internal flag for opening monologue generation |

**Example Request:**

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "I draw my sword and attack the goblin!",
  "diceResult": 17,
  "characterClass": "fighter",
  "pronouns": "He/Him"
}
```

**Response:** `Content-Type: text/event-stream`

The stream emits multiple `data:` events in order:

```
data: {"conversationId":"550e8400-e29b-41d4-a716-446655440000"}

data: {"text":"The goblin "}
data: {"text":"snarls as your "}
data: {"text":"blade finds its mark..."}

data: {"ttsText":"The goblin snarls as your blade finds its mark...","mood":"combat"}

data: {"usage":{"inputTokens":1250,"outputTokens":180,"costUsd":0.000538,"model":"claude-3-haiku","feature":"chat"}}

data: [DONE]
```

**SSE Event Types:**

| Event | Shape | Description |
|-------|-------|-------------|
| Session | `{ conversationId: string }` | First event -- session identifier |
| Text chunk | `{ text: string }` | Streaming narrative text |
| TTS trigger | `{ ttsText: string, mood?: string }` | Full response for TTS generation |
| Usage | `{ usage: UsagePayload }` | Token counts and cost |
| Done | `[DONE]` | Stream termination signal |

**Error Response:** `500`

```json
{ "error": "Bedrock streaming failed" }
```

**Internal Flow:**
1. Validate and sanitize input message
2. Get or create conversation by `conversationId`
3. Append user message to history (skipped if `isSystemTrigger`)
4. Build lore context via Neo4j RAG pipeline
5. Call Bedrock `ConverseStreamCommand` with system prompt + history + lore
6. Stream text chunks as SSE events
7. Extract mood tags (`{{mood:combat}}`) and TTS tags from response
8. Record usage metrics
9. Persist assistant response (cleaned of metadata tags)

---

### POST /api/narrate

Generate an opening monologue with optional TTS audio. Supports two modes:

**Mode 1: Full Generation** (no `text` provided)

Generates opening monologue via Bedrock, then synthesizes TTS audio.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characterClass` | `string` | No | Player's class |
| `pronouns` | `string` | No | Player's pronouns |
| `conversationId` | `string` | No | Existing session to continue |

**Response:** `200 OK` `application/json`

```json
{
  "audio": "<base64-encoded-mp3>",
  "text": "You push open the heavy oak door of The Shattered Crown Tavern...",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "usage": {
    "bedrockCostUsd": 0.000312,
    "ttsCostUsd": 0.0024,
    "totalCostUsd": 0.002712
  }
}
```

**Mode 2: TTS Only** (`text` provided)

Synthesizes audio from provided text without calling Bedrock.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | `string` | Yes | Text to synthesize |

**Response:** `200 OK` `audio/mpeg` (binary MP3 stream)

**Error Response:** `500`

```json
{ "error": "Narration generation failed", "details": "..." }
```

If TTS fails but text generation succeeds, the response includes `ttsError` and the text is still returned.

---

### GET /api/music

Fetch mood-based background music. Uses async generation with in-memory caching.

**Query Parameters:**

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `mood` | `string` | Yes | `tavern`, `combat`, `mystery`, `dramatic`, `danger` |

**Response States:**

**202 Accepted** -- Music is being generated (first request for this mood):

```json
{ "status": "generating", "mood": "tavern" }
```

**200 OK** -- Music is ready:

`Content-Type: audio/mpeg` with `Cache-Control: public, max-age=3600`

Returns binary MP3 audio data.

**500 Error** -- Generation failed:

```json
{ "error": "Music generation failed", "terminal": false }
```

`terminal: true` means retries are exhausted for this mood.

**Caching Behavior:**
- First request for a mood triggers background generation, returns 202
- Subsequent requests during generation return 202
- After generation completes, returns 200 with cached audio
- Cache persists for the server lifetime (no TTL eviction)
- Max 3 retries per mood with 30s cooldown between failures

---

### GET /api/health

Server health check.

**Response:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-02-21T15:30:00.000Z",
  "uptime": 3600
}
```

---

### GET /api/usage

Cost tracking and usage statistics.

**Response:** `200 OK`

```json
{
  "global": {
    "totalCostUsd": 0.0523,
    "entries": [...],
    "byFeature": {
      "chat": { "inputTokens": 15000, "outputTokens": 3200, "costUsd": 0.0078 },
      "narrate": { "inputTokens": 2000, "outputTokens": 800, "costUsd": 0.0015 }
    },
    "byModel": {
      "claude-3-haiku": { "inputTokens": 17000, "outputTokens": 4000, "costUsd": 0.0093 }
    }
  }
}
```

---

## Common Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 202 | Accepted (async generation in progress) |
| 400 | Bad request (missing required fields, validation error) |
| 500 | Internal server error (Bedrock timeout, TTS failure, etc.) |

## Authentication

No authentication is currently required (development mode). Production deployment will require authentication per the security posture in CLAUDE.md.

## Rate Limiting

Not yet implemented. Production will enforce per-user rate limiting on `/chat` and `/narrate`.

## CORS

Development mode allows all origins via Vite proxy. Production will enforce a strict CORS allowlist.
