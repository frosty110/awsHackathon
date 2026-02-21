# Architecture Research

**Domain:** AI Chat Application with Graph RAG, LLM Observability, and TTS
**Researched:** 2026-02-20
**Confidence:** MEDIUM — Core patterns verified via official docs; some specifics (Datadog Bedrock auto-instrumentation, MiniMax response shape) verified via secondary sources.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  React Chat UI                                               │    │
│  │  - Message input + rendered conversation                     │    │
│  │  - fetch POST + ReadableStream SSE parser                    │    │
│  │  - <audio> element for MiniMax TTS playback                  │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │  HTTP POST (user message)
                              │  SSE stream (DM response chunks)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          SERVER LAYER                                │
│  Node.js + Express                                                   │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │  /chat route │   │  /narrate    │   │  /health               │  │
│  │  (SSE stream)│   │  route       │   │  route                 │  │
│  └──────┬───────┘   └──────┬───────┘   └────────────────────────┘  │
│         │                  │                                         │
│  ┌──────▼───────────────────▼────────────────────────────────────┐  │
│  │                   RAG Pipeline Service                         │  │
│  │   1. Entity extraction (simple keyword/NER from user msg)      │  │
│  │   2. Neo4j Cypher query → lore context                         │  │
│  │   3. Context injection → prompt assembly                       │  │
│  └──────────────────────────┬─────────────────────────────────── ┘  │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                 Bedrock Service                                │   │
│  │   BedrockRuntimeClient.ConverseStream (Claude)                 │   │
│  │   Streams delta chunks → SSE to React client                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 TTS Service                                    │   │
│  │   POST https://api.minimaxi.chat/v1/t2a_v2                    │   │
│  │   Returns hex-encoded PCM audio buffer                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   Datadog dd-trace (wraps all above automatically)             │   │
│  │   DD_LLMOBS_ENABLED=1  DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────┬───────────────────────────┬─────────────────┘
                        │                           │
          ┌─────────────▼──────────┐   ┌────────────▼────────────┐
          │   AWS Bedrock          │   │   Neo4j (AuraDB or      │
          │   Claude 3.x model     │   │   local Docker)          │
          │   ConverseStream API   │   │   D&D lore graph         │
          └────────────────────────┘   └─────────────────────────┘
                        │
          ┌─────────────▼──────────┐
          │   Datadog Agent        │
          │   Traces + LLM spans   │
          │   Dashboard for demo   │
          └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| React Chat UI | Render conversation, send `{ conversationId?, message }`, consume SSE stream, play TTS audio | Express server (HTTP + SSE) |
| Express `/chat` | Accept message, load+persist conversation state, run RAG pipeline, stream Bedrock response as SSE | Conversation Store, RAG Pipeline Service, Bedrock Service |
| Express `/narrate` | Accept text, call MiniMax TTS, return audio buffer | TTS Service |
| Conversation Store | Source of truth for conversation state keyed by `conversationId` (in-memory for dev, Redis for production) | Express `/chat` |
| RAG Pipeline Service | Extract entities from user message, query Neo4j, assemble injected prompt | Neo4j, Bedrock Service |
| Bedrock Service | Call `BedrockRuntimeClient.ConverseStream`, pipe chunks to response | AWS Bedrock (Claude) |
| TTS Service | POST to MiniMax T2A v2 API, decode hex PCM, wrap as WAV buffer, return to caller | MiniMax REST API |
| Neo4j | Store D&D lore as a labeled property graph (Characters, Locations, Items, Events, Factions) | RAG Pipeline Service |
| Datadog dd-trace | Auto-instrument Bedrock calls as LLM spans; manual `tool` spans for Neo4j queries | Datadog Agent → Datadog cloud |

---

## Recommended Project Structure

```
project/
├── client/                        # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx     # Message list + SSE consumer
│   │   │   ├── MessageInput.tsx   # User input form
│   │   │   └── AudioPlayer.tsx    # TTS playback
│   │   ├── hooks/
│   │   │   └── useSSEChat.ts      # fetch + ReadableStream SSE parser + state
│   │   ├── api.ts                 # fetch wrappers for /chat and /narrate
│   │   └── App.tsx
│   └── package.json
│
├── server/                        # Node.js + Express backend
│   ├── src/
│   │   ├── index.ts               # Express app init (dd-trace initialized via NODE_OPTIONS)
│   │   ├── routes/
│   │   │   ├── chat.ts            # POST /chat → SSE stream
│   │   │   └── narrate.ts         # POST /narrate → audio/wav buffer
│   │   ├── services/
│   │   │   ├── conversationStore.ts # In-memory conversation state (demo)
│   │   │   ├── rag.ts             # Entity extraction + Neo4j query + prompt assembly
│   │   │   ├── bedrock.ts         # BedrockRuntimeClient wrapper + stream handler
│   │   │   ├── neo4j.ts           # Driver singleton + typed query helpers
│   │   │   └── tts.ts             # MiniMax T2A REST call + PCM-to-WAV conversion
│   │   └── config.ts              # Env var validation (fail fast on missing keys)
│   └── package.json
│
├── data/                          # D&D lore seed scripts
│   ├── seed.ts                    # Cypher CREATE statements for lore graph
│   └── lore.json                  # Raw lore data
│
└── docker-compose.yml             # Local Neo4j + Datadog Agent containers
```

### Structure Rationale

- **`dd-trace` initializes before app code:** Prefer `NODE_OPTIONS="--import dd-trace/initialize.mjs"` so auto-instrumentation always patches dependencies before they load.
- **`services/` flat structure:** For a 6-hour hackathon, avoid deep nesting. Each service = one file, one responsibility.
- **`conversationStore.ts` as source of truth:** Keep history server-side. Client only sends `conversationId` + latest message.
- **`data/seed.ts` separate from server:** Seed runs once at setup, not in request path. Keep it isolated.
- **`client/hooks/useSSEChat.ts`:** Centralizes stream lifecycle and robust SSE chunk parsing so UI components stay presentational.

---

## Architectural Patterns

### Pattern 1: SSE Streaming for Chat Responses

**What:** Express sets response headers to `text/event-stream` and pipes Bedrock's `ConverseStream` delta chunks directly to the HTTP response as SSE events. React uses `fetch` + `ReadableStream` to consume chunks and append to UI state.

**When to use:** Any time the LLM response should appear progressively in the UI. Critical for D&D narration to feel alive rather than waiting 5-10 seconds for a full response.

**Trade-offs:** SSE is one-directional (server → client) which is all we need here. Simpler than WebSocket for this use case. `EventSource` is not used because chat requires a POST body (`conversationId` + `message`). For this demo there is no auth, so the transport stays minimal.

**Example:**
```typescript
// server/services/bedrock.ts
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

export async function streamBedrockResponse(
  messages: Array<{ role: string; content: string }>,
  res: Response // Express response
) {
  const command = new ConverseStreamCommand({
    modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    messages,
    system: [{ text: DM_SYSTEM_PROMPT }],
  });

  const response = await client.send(command);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const chunk of response.stream) {
    const delta = chunk.contentBlockDelta?.delta?.text;
    if (delta) {
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
    }
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
```

```typescript
// client/hooks/useSSEChat.ts
async function sendMessage(conversationId: string | null, userMessage: string) {
  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message: userMessage }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    pending += decoder.decode(value, { stream: true });
    const events = pending.split('\n\n');
    pending = events.pop() ?? '';

    for (const event of events) {
      if (!event.startsWith('data:')) continue;
      const payload = event.slice(5).trim();
      if (payload === '[DONE]') continue;
      if (payload.startsWith('{')) {
        const { text, conversationId: returnedId } = JSON.parse(payload);
        if (returnedId) setConversationId(returnedId);
        setCurrentResponse(prev => prev + text);
      }
    }
  }

  // Flush any trailing bytes that did not end with a full delimiter.
  pending += decoder.decode();
}
```

---

### Pattern 2: Server-Owned Conversation State + Token Budget

**What:** `/chat` accepts `{ conversationId?, message }`. The server creates a conversation when `conversationId` is missing, stores all turns, and is the only source of truth for history. Before each Bedrock call, the server applies a token budget policy (system prompt + RAG context + most recent turns that fit the budget).

**When to use:** Every chat turn. This is the default for the project.

**Trade-offs:** Prevents client tampering with history and keeps prompt assembly centralized. In-memory storage works for development; Redis required for production multi-instance deployment.

**Example:**
```typescript
// server/services/conversationStore.ts
type ChatMessage = { role: 'user' | 'assistant'; content: string };
const conversations = new Map<string, ChatMessage[]>();

export function getOrCreateConversation(conversationId?: string) {
  const id = conversationId ?? crypto.randomUUID();
  if (!conversations.has(id)) conversations.set(id, []);
  return { id, history: conversations.get(id)! };
}

export function buildModelMessages(history: ChatMessage[]) {
  // Demo token policy: keep last 12 turns; replace with true token counting if needed.
  return history.slice(-12);
}
```

```typescript
// server/routes/chat.ts
router.post('/chat', async (req, res) => {
  const { conversationId, message } = req.body;
  const { id, history } = getOrCreateConversation(conversationId);
  history.push({ role: 'user', content: message });

  // Send ID once so client can continue same server-owned conversation.
  res.write(`data: ${JSON.stringify({ conversationId: id, text: '' })}\n\n`);

  const modelMessages = buildModelMessages(history);
  const assistantText = await streamBedrockResponse(modelMessages, res);
  history.push({ role: 'assistant', content: assistantText });
});
```

---

### Pattern 3: Graph RAG — Entity-Anchored Cypher Retrieval

**What:** On each user message, extract named entities (character names, location names, item names) using simple string matching against a known entity list (for hackathon speed) or a lightweight NER pass. Use those entities as Cypher query parameters to retrieve related nodes up to 2 hops. Inject the returned subgraph text into the system prompt before calling Bedrock.

**When to use:** Every chat turn where the user mentions a known D&D lore entity. Skip RAG if no entities are found (fall back to general DM behavior).

**Trade-offs:** Simple keyword matching is fast and sufficient for a seeded lore graph. Full LLM-based entity extraction adds a second Bedrock call (doubles latency). For a 6-hour hackathon, keyword matching wins.

**Example:**
```typescript
// server/services/rag.ts
import { driver } from './neo4j';

const KNOWN_ENTITIES = ['Tavern of the Lost', 'Grimshaw', 'Amulet of Shadows']; // seeded lore

export async function buildLoreContext(userMessage: string): Promise<string> {
  // 1. Entity extraction — keyword match against known graph nodes
  const foundEntities = KNOWN_ENTITIES.filter(e =>
    userMessage.toLowerCase().includes(e.toLowerCase())
  );
  if (foundEntities.length === 0) return '';

  // 2. Cypher query — retrieve connected lore up to 2 hops
  const { records } = await driver.executeQuery(
    `MATCH (n WHERE n.name IN $entities)-[r*1..2]-(related)
     RETURN n.name AS entity, type(r[0]) AS relation, related.description AS context
     LIMIT 10`,
    { entities: foundEntities }
  );

  // 3. Text assembly for prompt injection
  return records
    .map(r => `${r.get('entity')} — ${r.get('relation')} — ${r.get('context')}`)
    .join('\n');
}
```

---

### Pattern 4: Datadog LLM Observability with Manual Neo4j Spans

**What:** Import `dd-trace` as the very first line in `index.ts` with `DD_LLMOBS_ENABLED=1` and `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true`. This auto-instruments every `BedrockRuntimeClient` call as an LLM span (captures model ID, token counts, latency). Neo4j queries are not auto-instrumented, so wrap them in manual `tool` spans.

**When to use:** The entire server. Always on. This is the demo's killer feature — Datadog dashboard showing LLM spans, token usage, and latency on the second screen.

**Trade-offs:** `dd-trace` must be imported before other modules or auto-patching fails silently. This is the most common setup mistake. For the demo, use `NODE_OPTIONS="--import dd-trace/initialize.mjs"` at process start rather than relying on import order in code.

**Example:**
```typescript
// server/src/index.ts — dd-trace MUST come before all other imports
// Use NODE_OPTIONS="--import dd-trace/initialize.mjs" in start script instead
// to guarantee initialization order regardless of bundler behavior.

// server/services/neo4j.ts
import tracer from 'dd-trace';

export async function queryLore(entities: string[]): Promise<Record[]> {
  return tracer.llmobs.trace(
    { name: 'neo4j-lore-query', kind: 'tool' },
    async (span) => {
      span.setTag('db.system', 'neo4j');
      span.setTag('entities.count', entities.length);
      const { records } = await driver.executeQuery(/* ... */);
      tracer.llmobs.annotate(span, {
        inputData: { entities },
        outputData: { recordCount: records.length },
      });
      return records;
    }
  );
}
```

```bash
# package.json start script
"start": "DD_LLMOBS_ENABLED=1 DD_LLMOBS_ML_APP=ai-dm DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true DD_API_KEY=$DD_API_KEY NODE_OPTIONS='--import dd-trace/initialize.mjs' node dist/index.js"
```

---

### Pattern 5: MiniMax TTS for Opening Monologue Only

**What:** On session start (or on demand), POST the opening monologue text to MiniMax's T2A v2 endpoint. Response contains hex-encoded PCM audio. Decode the PCM bytes, wrap them in a WAV container, return `audio/wav` to the client, and play via `<audio>`.

**When to use:** Opening monologue only. Do NOT run TTS on every DM response — MiniMax latency (1-3s for short clips) would break the conversational feel.

**Trade-offs:** Non-streaming TTS waits for full audio to generate before returning. Acceptable for a 100-300 word monologue. For longer text, use MiniMax's streaming T2A mode (SSE with hex-encoded PCM chunks).

**Example:**
```typescript
// server/services/tts.ts
export async function generateSpeechWav(text: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${process.env.MINIMAX_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model: 'speech-02-hd',
        voice_setting: {
          voice_id: 'English_Trustworthy_Man', // adjust for DM tone
          speed: 0.9,
          pitch: -2,
          emotion: 'neutral',
        },
      }),
    }
  );

  const data = await response.json();
  const pcm = Buffer.from(data.data.audio, 'hex'); // inline hex-encoded PCM
  return pcmToWav(pcm, { sampleRateHz: 32000, channels: 1, bitDepth: 16 });
}
```

```typescript
// server/routes/narrate.ts
router.post('/narrate', async (req, res) => {
  const { text } = req.body;
  const audioBuffer = await generateSpeechWav(text);
  res.setHeader('Content-Type', 'audio/wav');
  res.send(audioBuffer);
});
```

```typescript
// client — play the returned audio buffer
const response = await fetch('/narrate', {
  method: 'POST',
  body: JSON.stringify({ text: openingMonologue }),
  headers: { 'Content-Type': 'application/json' },
});
const blob = await response.blob();
const url = URL.createObjectURL(blob);
new Audio(url).play();
```

---

## Data Flow

### Primary Chat Flow (every user turn)

```
User types message
    │
    ▼
React: POST /chat { conversationId?, message }
    │
    ▼
Express /chat handler
    │
    ├─► Conversation Store
    │       │
    │       ├─► create conversationId if missing
    │       └─► append latest user message
    │
    ├─► RAG Pipeline Service
    │       │
    │       ├─► Entity extraction (keyword match)
    │       │
    │       └─► Neo4j Cypher query         ← Datadog tool span
    │               │
    │               └─► lore context string
    │
    ├─► Prompt assembly (token-budgeted)
    │       system: DM_SYSTEM_PROMPT + lore context
    │       messages: server-side conversation window
    │
    └─► Bedrock Service: ConverseStreamCommand  ← Datadog LLM span (auto)
            │
            ├─► SSE metadata event with conversationId
            └─► SSE stream of delta chunks
                    │
                    ▼
              React: append chunks to UI message bubble
                    │
                    ▼
              [DONE] sentinel → persist assistant message + mark turn complete
```

### Opening Monologue Flow (session start, once)

```
React mounts / "Start Adventure" click
    │
    ▼
React: POST /narrate { text: OPENING_MONOLOGUE }
    │
    ▼
Express /narrate handler → TTS Service
    │
    ▼
MiniMax T2A v2 API (POST, ~1-3s wait)
    │
    ▼
hex-encoded PCM audio → Buffer.from(hex, 'hex')
    │
    ▼
Express: wrap PCM in WAV container, send `audio/wav`
    │
    ▼
React: Blob URL → new Audio(url).play()
```

### Datadog Trace Propagation

```
HTTP request arrives at Express
    │
    └─► Datadog APM auto-creates root HTTP span
            │
            ├─► tool span: "neo4j-lore-query" (manual)
            │       tags: db.system=neo4j, entities.count=N
            │
            └─► LLM span: "bedrock.invoke" (auto-instrumented)
                    tags: model_id, input_tokens, output_tokens, latency
```

All spans roll up to a single trace per request — visible as a waterfall in Datadog APM and as an LLM trace in Datadog LLM Observability.

---

## Suggested Build Order

This order respects hard dependencies between components:

1. **Neo4j schema + seed data** — Everything downstream depends on having real data to query. Set up Docker Neo4j, define node labels (Character, Location, Item, Faction, Event), and seed lore. Write and test the Cypher queries that the RAG service will use.

2. **Bedrock service (no RAG, no trace)** — Get a bare Claude call working end-to-end in Express. This validates AWS credentials, region config, and the ConverseStream API shape. Hardcode a system prompt for now.

3. **SSE streaming (Express → React)** — Add streaming to the Bedrock route and build the React SSE consumer hook. Seeing text appear in the UI proves the pipeline works before adding complexity.

4. **RAG pipeline service** — Add entity extraction and Neo4j query on top of the working chat route. Inject lore context into the system prompt. Verify DM responses reference the injected lore.

5. **Datadog instrumentation** — Add `dd-trace` bootstrap last, after the pipeline is proven. Wrap Neo4j queries in manual tool spans. Verify traces appear in Datadog dashboard with LLM spans showing token counts.

6. **MiniMax TTS** — Add the `/narrate` route and React audio playback. Keep this isolated and late — it's a demo flourish, not core functionality. Test independently with a hardcoded monologue string.

7. **Polish + demo prep** — System prompt tuning, token-budget tuning, UI cleanup, test the two-screen demo (app + Datadog dashboard).

---

## Anti-Patterns

### Anti-Pattern 1: Import dd-trace After Other Modules

**What people do:** Add `import tracer from 'dd-trace'; tracer.init()` midway through `index.ts` after importing Express, the AWS SDK, etc.

**Why it's wrong:** dd-trace uses monkey-patching to instrument libraries. If the AWS SDK or Express is imported before dd-trace initializes, the patches never apply and you get no automatic spans. This fails silently with no error.

**Do this instead:** Use `NODE_OPTIONS="--import dd-trace/initialize.mjs"` in the process start command so dd-trace initializes before any application code loads, regardless of import order. Source: [Datadog Node.js Tracing Docs](https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/).

---

### Anti-Pattern 2: LLM-Based Entity Extraction in the RAG Pipeline

**What people do:** Send the user message to Bedrock to extract entities before the main DM call — two Bedrock round trips per user turn.

**Why it's wrong:** Doubles latency (200-500ms extra), burns twice the tokens, and for a seeded lore graph with < 100 entities, regex/keyword matching is just as effective and orders of magnitude faster.

**Do this instead:** Pre-compute a lookup dictionary from the seeded Neo4j graph at server start. Entity extraction becomes an O(n) string scan with no network call.

---

### Anti-Pattern 3: Sending Full Conversation History to Neo4j

**What people do:** Pass the entire conversation history into the entity extractor and try to query Neo4j for every entity mentioned in the whole conversation.

**Why it's wrong:** Entity density grows with conversation length, leading to Cypher queries returning hundreds of nodes and bloating the prompt beyond Claude's useful context window.

**Do this instead:** Extract entities only from the current user message (last turn). The conversation history is already in the Bedrock message array; RAG context should only add new information, not re-inject everything already said.

---

### Anti-Pattern 4: Running TTS on Every DM Response

**What people do:** Pipe every DM response text to MiniMax after Bedrock completes.

**Why it's wrong:** MiniMax T2A takes 1-3 seconds for short clips, longer for lengthy DM narration. The chat turn would feel unresponsive — users would wait for the audio before the next input becomes available.

**Do this instead:** TTS only for the scripted opening monologue. In-conversation responses stream as text only. If you want ambient voice, consider a short, fixed DM "thinking" audio clip played during generation rather than TTS of the full response.

---

## Reliability and Failure Handling

Define explicit failure behavior so the demo does not stall on dependency issues:

- **Bedrock timeout + cancellation:** Use `AbortController` per request (for example 30s hard timeout). On timeout, emit SSE error event and end stream cleanly.
- **RAG graceful degradation:** If Neo4j query fails or times out, continue with base system prompt and user message only. Do not fail the whole chat turn.
- **MiniMax timeout policy:** Timeout `/narrate` calls (for example 10s). If TTS fails, return JSON error and let UI continue without audio.
- **SSE error contract:** Emit `data: {"error":"...","conversationId":"..."}` before `[DONE]` when recoverable; client renders a retry affordance.
- **Idempotency:** Persist assistant output only once per turn after stream completion to avoid duplicate messages on retries.

---

## Security Posture

Production deployment requires proper authentication and access controls.

- **Authentication:** User login with session management (required for persistent sessions and per-user rate limiting).
- **CORS:** Allow only the production frontend origin(s), not `*`.
- **Request limits:** Apply JSON body size limits (e.g., `1mb`) and per-user rate limiting on `/chat` and `/narrate`.
- **Secrets:** Keep API keys server-side only; never expose `MINIMAX_API_KEY`, `DD_API_KEY`, or AWS credentials to client code.
- **Prompt hardening:** System prompt guardrails and sanitize user-provided text that may be reflected in logs/UI.
- **Session security:** Secure cookies, CSRF protection, session expiry.

---

## Integration Points

### External Services

| Service | Integration Pattern | Credential | Notes |
|---------|---------------------|-----------|-------|
| AWS Bedrock (Claude) | `@aws-sdk/client-bedrock-runtime` `ConverseStreamCommand` | AWS credentials via env or IAM role | Use `anthropic.claude-3-5-sonnet-20241022-v2:0` or specify model ARN. Region must match where Bedrock Claude is enabled. Confidence: HIGH |
| Neo4j | `neo4j-driver` singleton — `driver.executeQuery()` with parameterized Cypher | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | AuraDB free tier or local Docker `neo4j:5`. Single Driver instance for the process lifetime. Confidence: HIGH |
| MiniMax TTS | REST `POST /v1/t2a_v2?GroupId=<id>` with Bearer token | `MINIMAX_API_KEY`, `MINIMAX_GROUP_ID` | GroupId is required (found in MiniMax console). Response is inline hex-encoded PCM; server wraps it as WAV before returning to client. Confidence: MEDIUM |
| Datadog Agent | dd-trace auto-instruments via `NODE_OPTIONS` env var | `DD_API_KEY`, `DD_LLMOBS_ML_APP` | Requires local Datadog Agent running (or use agentless mode with `DD_LLMOBS_AGENTLESS_ENABLED=true`). Confidence: HIGH |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React UI ↔ Express `/chat` | HTTP POST (`conversationId?` + `message`) → SSE stream (text chunks) | Use `fetch` + `ReadableStream` (not `EventSource`) because request body is required |
| Express `/chat` ↔ RAG Service | In-process function call | No HTTP; same Node.js process |
| Express `/narrate` ↔ TTS Service | In-process function call | Returns a WAV `Buffer` |
| RAG Service ↔ Neo4j | `neo4j-driver` query over Bolt protocol | Single shared Driver instance; sessions created per request and closed immediately |
| Bedrock Service ↔ AWS | AWS SDK ConverseStream over HTTPS | SDK handles connection pooling; no manual session management needed |
| Server ↔ Datadog Agent | dd-trace SDK → local Agent over HTTP (default port 8126/TCP) | Agent forwards to Datadog cloud. In agentless mode, SDK posts directly. |

---

## Scaling Considerations

The architecture targets ~1000 concurrent users as the primary scale point.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Dev/testing (1-2 users) | In-memory conversation store, single Express process, local/AuraDB Neo4j. |
| Production (~1000 users) | Redis for conversation state, user authentication, per-user rate limiting, Bedrock request queuing with backpressure, multi-instance Express behind a load balancer. |
| 100k+ users | Separate RAG worker pool, Neo4j cluster, Redis pub/sub for SSE fan-out, CDN for static assets. Out of scope for now. |

**First bottleneck:** Bedrock latency (not throughput). Claude ConverseStream returns first tokens in ~300-600ms. The SSE streaming pattern masks the latency by showing characters as they arrive. At 1000 users, Bedrock concurrency limits become the constraint — implement request queuing.

**Second bottleneck:** Neo4j query time. With a seeded lore graph of < 500 nodes and proper indexes on `name` property, queries return in < 10ms. At 1000 users, connection pooling via the Neo4j driver handles this well.

---

## Sources

- [Datadog LLM Observability Node.js SDK](https://docs.datadoghq.com/llm_observability/setup/sdk/nodejs/) — LLMObs span API (MEDIUM: page rendered as nav-only; SDK patterns verified via DeepWiki secondary source)
- [DeepWiki: DD-Trace-JS AI/ML Instrumentation](https://deepwiki.com/DataDog/dd-trace-js/3.6-aiml-instrumentation) — Span kinds, LLMObs.trace API, Bedrock env var (MEDIUM: secondary source, consistent with official docs)
- [Datadog Node.js Tracing Library Config](https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/) — NODE_OPTIONS initialization pattern (HIGH: official Datadog docs)
- [AWS Bedrock ConverseStream — Node.js SDK examples](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_ConverseStream_AnthropicClaude_section.html) — Streaming API shape (HIGH: official AWS docs)
- [Neo4j JavaScript Driver Manual — Cypher Workflow](https://neo4j.com/docs/javascript-manual/current/cypher-workflow/) — `driver.executeQuery()` pattern (HIGH: official Neo4j docs)
- [MiniMax TTS API — Basic HTTP integration](https://blog.williamchong.cloud/code/2025/06/21/handling-minimax-tts-api-basic-and-streaming.html) — Request shape, hex-encoded PCM response (MEDIUM: third-party verified blog, June 2025)
- [MiniMax Official Docs](https://platform.minimax.io/docs/api-reference/speech-t2a-intro) — T2A endpoint reference (MEDIUM: page rendered as nav-only, endpoint URL confirmed via third-party source)
- [Neo4j GraphRAG Python Package](https://neo4j.com/developer/genai-ecosystem/graphrag-python/) — GraphRAG retrieval patterns (MEDIUM: Python-focused but patterns apply to Node.js)

---

*Architecture research for: AI D&D Dungeon Master (React + Node.js/Express + AWS Bedrock + Neo4j + Datadog + MiniMax TTS)*
*Researched: 2026-02-20*
*Updated: 2026-02-20 — scope shift from hackathon demo to ~1000-user community product*
