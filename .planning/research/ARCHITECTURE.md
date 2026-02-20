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
│  │  - Message input + conversation history                      │    │
│  │  - EventSource (SSE) for streaming DM responses              │    │
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
│  │   DD_LLMOBS_ENABLED=1  DD_TRACE_AWS_SDK_BEDROCKRUNTIME=true   │   │
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
| React Chat UI | Render conversation, send user messages, consume SSE stream, play TTS audio | Express server (HTTP + SSE) |
| Express `/chat` | Accept message, run RAG pipeline, stream Bedrock response as SSE | RAG Pipeline Service, Bedrock Service |
| Express `/narrate` | Accept text, call MiniMax TTS, return audio buffer | TTS Service |
| RAG Pipeline Service | Extract entities from user message, query Neo4j, assemble injected prompt | Neo4j, Bedrock Service |
| Bedrock Service | Call `BedrockRuntimeClient.ConverseStream`, pipe chunks to response | AWS Bedrock (Claude) |
| TTS Service | POST to MiniMax T2A v2 API, decode hex PCM buffer, return to caller | MiniMax REST API |
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
│   │   │   └── useSSEChat.ts      # EventSource management + state
│   │   ├── api.ts                 # fetch wrappers for /chat and /narrate
│   │   └── App.tsx
│   └── package.json
│
├── server/                        # Node.js + Express backend
│   ├── src/
│   │   ├── index.ts               # Express app init + dd-trace bootstrap (MUST be first import)
│   │   ├── routes/
│   │   │   ├── chat.ts            # POST /chat → SSE stream
│   │   │   └── narrate.ts         # POST /narrate → audio buffer
│   │   ├── services/
│   │   │   ├── rag.ts             # Entity extraction + Neo4j query + prompt assembly
│   │   │   ├── bedrock.ts         # BedrockRuntimeClient wrapper + stream handler
│   │   │   ├── neo4j.ts           # Driver singleton + typed query helpers
│   │   │   └── tts.ts             # MiniMax T2A REST call + hex decode
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

- **`index.ts` imports dd-trace first:** Datadog requires `dd-trace` to be required/imported before any other module for auto-instrumentation to patch dependencies correctly. This is non-negotiable.
- **`services/` flat structure:** For a 6-hour hackathon, avoid deep nesting. Each service = one file, one responsibility.
- **`data/seed.ts` separate from server:** Seed runs once at setup, not in request path. Keep it isolated.
- **`client/hooks/useSSEChat.ts`:** Centralizes SSE lifecycle management (open, message, error, close) so the component stays presentational.

---

## Architectural Patterns

### Pattern 1: SSE Streaming for Chat Responses

**What:** Express sets response headers to `text/event-stream` and pipes Bedrock's `ConverseStream` delta chunks directly to the HTTP response as SSE events. React uses `EventSource` or a manual `fetch` + `ReadableStream` to consume chunks and append to UI state.

**When to use:** Any time the LLM response should appear progressively in the UI. Critical for D&D narration to feel alive rather than waiting 5-10 seconds for a full response.

**Trade-offs:** SSE is one-directional (server → client) which is all we need here. Simpler than WebSocket for this use case. Browser auto-reconnects on drop. Does not support request headers natively on `EventSource`, so use `fetch` + `ReadableStream` if auth headers are needed.

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
async function sendMessage(userMessage: string) {
  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const { text } = JSON.parse(line.slice(6));
        setCurrentResponse(prev => prev + text);
      }
    }
  }
}
```

---

### Pattern 2: Graph RAG — Entity-Anchored Cypher Retrieval

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

### Pattern 3: Datadog LLM Observability with Manual Neo4j Spans

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

### Pattern 4: MiniMax TTS for Opening Monologue Only

**What:** On session start (or on demand), POST the opening monologue text to MiniMax's T2A v2 endpoint. Response contains hex-encoded PCM audio. Decode to a `Buffer`, encode as base64, return to client, play via `<audio>` element.

**When to use:** Opening monologue only. Do NOT run TTS on every DM response — MiniMax latency (1-3s for short clips) would break the conversational feel.

**Trade-offs:** Non-streaming TTS waits for full audio to generate before returning. Acceptable for a 100-300 word monologue. For longer text, use MiniMax's streaming T2A mode (SSE with hex-encoded PCM chunks).

**Example:**
```typescript
// server/services/tts.ts
export async function generateSpeech(text: string): Promise<Buffer> {
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
  return Buffer.from(data.data.audio, 'hex'); // inline hex-encoded PCM
}
```

```typescript
// server/routes/narrate.ts
router.post('/narrate', async (req, res) => {
  const { text } = req.body;
  const audioBuffer = await generateSpeech(text);
  res.setHeader('Content-Type', 'audio/mpeg');
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
React: POST /chat { message, history }
    │
    ▼
Express /chat handler
    │
    ├─► RAG Pipeline Service
    │       │
    │       ├─► Entity extraction (keyword match)
    │       │
    │       └─► Neo4j Cypher query         ← Datadog tool span
    │               │
    │               └─► lore context string
    │
    ├─► Prompt assembly
    │       system: DM_SYSTEM_PROMPT + lore context
    │       messages: full conversation history + user message
    │
    └─► Bedrock Service: ConverseStreamCommand  ← Datadog LLM span (auto)
            │
            └─► SSE stream of delta chunks
                    │
                    ▼
              React: append chunks to UI message bubble
                    │
                    ▼
              [DONE] sentinel → mark message complete
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
Express: send audio/mpeg buffer
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

7. **Polish + demo prep** — System prompt tuning, conversation history handling, UI cleanup, test the two-screen demo (app + Datadog dashboard).

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

## Integration Points

### External Services

| Service | Integration Pattern | Credential | Notes |
|---------|---------------------|-----------|-------|
| AWS Bedrock (Claude) | `@aws-sdk/client-bedrock-runtime` `ConverseStreamCommand` | AWS credentials via env or IAM role | Use `anthropic.claude-3-5-sonnet-20241022-v2:0` or specify model ARN. Region must match where Bedrock Claude is enabled. Confidence: HIGH |
| Neo4j | `neo4j-driver` singleton — `driver.executeQuery()` with parameterized Cypher | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | AuraDB free tier or local Docker `neo4j:5`. Single Driver instance for the process lifetime. Confidence: HIGH |
| MiniMax TTS | REST `POST /v1/t2a_v2?GroupId=<id>` with Bearer token | `MINIMAX_API_KEY`, `MINIMAX_GROUP_ID` | GroupId is required (found in MiniMax console). Response is inline hex-encoded PCM, not a URL. Confidence: MEDIUM |
| Datadog Agent | dd-trace auto-instruments via `NODE_OPTIONS` env var | `DD_API_KEY`, `DD_LLMOBS_ML_APP` | Requires local Datadog Agent running (or use agentless mode with `DD_LLMOBS_AGENTLESS_ENABLED=true`). Confidence: HIGH |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React UI ↔ Express `/chat` | HTTP POST (message + history) → SSE stream (text chunks) | Use `fetch` + `ReadableStream` on client (not `EventSource`) to allow POST body with auth headers |
| Express `/chat` ↔ RAG Service | In-process function call | No HTTP; same Node.js process |
| Express `/narrate` ↔ TTS Service | In-process function call | Returns a `Buffer` |
| RAG Service ↔ Neo4j | `neo4j-driver` query over Bolt protocol | Single shared Driver instance; sessions created per request and closed immediately |
| Bedrock Service ↔ AWS | AWS SDK ConverseStream over HTTPS | SDK handles connection pooling; no manual session management needed |
| Server ↔ Datadog Agent | dd-trace SDK → UDP to local Agent (default port 8126) | Agent forwards to Datadog cloud. In agentless mode, SDK posts directly. |

---

## Scaling Considerations

This is a 6-hour hackathon demo. The architecture is deliberately scoped for a single-server, demo-scale deployment.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Demo (1-2 users) | Current design is sufficient. Single Express process, local/AuraDB Neo4j, no queue. |
| 0-100 users | Add Redis for conversation history (replace in-memory array). Rate-limit Bedrock calls. |
| 100k+ users | Separate RAG worker pool, Neo4j cluster, Bedrock request queue with backpressure, Redis pub/sub for SSE fan-out. Not relevant for this project. |

**First bottleneck:** Bedrock latency (not throughput). Claude ConverseStream returns first tokens in ~300-600ms. For the demo, this is fine. The SSE streaming pattern masks the latency by showing characters as they arrive.

**Second bottleneck (if it matters):** Neo4j query time. With a seeded lore graph of < 500 nodes and proper indexes on `name` property, queries return in < 10ms. No concern at demo scale.

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
