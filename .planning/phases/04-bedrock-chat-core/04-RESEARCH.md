# Phase 4: Bedrock Chat Core - Research

**Researched:** 2026-02-20
**Domain:** AWS Bedrock ConverseStreamCommand + Express SSE + React ReadableStream
**Confidence:** HIGH

---

## Summary

Phase 4 wires the live `/chat` endpoint: replacing the Phase 2 `useSSEChat` stub with real SSE fetch, implementing the Bedrock service using `ConverseStreamCommand`, adding the chat route with D&D system prompt and dice result injection, and managing server-side conversation history. The stack is fully locked by prior decisions — `@aws-sdk/client-bedrock-runtime` is mandatory (dd-trace only auto-instruments this SDK, not `@anthropic-ai/bedrock-sdk`), and the hook interface `{ messages, isLoading, sendMessage, reset }` is frozen from Phase 2.

The Converse API is the correct path for multi-turn chat: it accepts a `messages` array (alternating `user`/`assistant` roles) plus a `system` array, returns an `AsyncIterable<ConverseStreamOutput>`, and emits `contentBlockDelta` events carrying text deltas. Express pipes these deltas as SSE `data:` events. The client parses SSE chunks using `fetch` + `ReadableStream` (not `EventSource`, which cannot POST). Server conversation history is stored in-memory in a `Map<string, ChatMessage[]>` keyed by `conversationId` — the client sends `conversationId` back on subsequent turns.

The dice mechanic is straightforward: when the client sends a message that includes a dice roll result, the server injects it into the prompt before calling Bedrock. The D&D system prompt instructs the DM to bracket outcomes (1-5 failure, 6-15 partial, 16-20 great success). AbortController with a 30s timeout handles Bedrock cancellation; if the client disconnects, the `req.on('close', ...)` handler aborts the stream.

**Primary recommendation:** Build `bedrock.ts` (client singleton + `streamToSSE` function), `conversationStore.ts` (in-memory Map), and `chat.ts` (route with system prompt + dice injection), then replace the stub in `useSSEChat.ts` with the real SSE fetch loop. Everything compiles to TypeScript ESM under `tsx watch`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-bedrock-runtime` | 3.995.0 (installed) | Bedrock API — `BedrockRuntimeClient` + `ConverseStreamCommand` | Only SDK dd-trace auto-instruments; locked decision |
| `express` | ^5.0.0 (installed) | HTTP server and route handling | Already in project |
| `zod` | ^4.0.0 (installed) | Request body validation | Already in project |
| `dd-trace` | ^5.86.0 (installed) | Bedrock auto-instrumentation via AWS SDK plugin | `NODE_OPTIONS='--import dd-trace/initialize.mjs'` already wired |

### No New Server Dependencies Needed

All server dependencies for Phase 4 are already installed. The `@aws-sdk/client-bedrock-runtime` package is present at version 3.995.0.

### Frontend — No New Dependencies

The Phase 2 `useSSEChat` hook is a stub that gets its internals replaced. No new client packages are needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@aws-sdk/client-bedrock-runtime` | `@anthropic-ai/bedrock-sdk` | Anthropic SDK is NOT instrumented by dd-trace — eliminates Datadog prize. Hard locked. |
| `fetch` + `ReadableStream` SSE | `EventSource` API | EventSource cannot POST; cannot send JSON body with `conversationId`. Use `fetch`. |
| In-memory `Map` for conversation store | Redis, database | Demo has 1 user; in-memory is sufficient and zero setup |
| AbortController for timeout | Express-timeout middleware | AbortController propagates directly to the AWS SDK stream; cleaner cancellation |

**Installation:** None needed — all dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure

Files this phase creates or modifies:

```
server/src/
├── services/
│   ├── bedrock.ts          # BedrockRuntimeClient singleton + streamToSSE
│   └── conversationStore.ts # In-memory Map<string, ChatMessage[]>
├── routes/
│   └── chat.ts             # POST /chat — SSE stream, system prompt, dice injection
└── app.ts                  # Register chatRouter (modify)

client/src/
└── hooks/
    └── useSSEChat.ts       # Replace mock block with real SSE fetch (modify)
```

### Pattern 1: BedrockRuntimeClient Singleton

**What:** Create a single `BedrockRuntimeClient` at module load time. Reuse it per request. The SDK manages connection pooling internally.

**When to use:** Always. Do not instantiate per-request — expensive and leaks connections.

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseStreamCommand/
// server/src/services/bedrock.ts

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from './config.js';

const bedrockClient = new BedrockRuntimeClient({
  region: config.AWS_REGION,
  // Credentials auto-resolve from env: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
});
```

### Pattern 2: ConverseStreamCommand with System Prompt

**What:** Send conversation history as `messages` array, system prompt as `system` array. Roles must be `'user'` and `'assistant'` (Bedrock Converse API values). Content is an array of `{ text: string }` objects.

**When to use:** Every `/chat` request.

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseStreamCommand/
// Source: https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html

const command = new ConverseStreamCommand({
  modelId: config.BEDROCK_MODEL_ID,  // e.g. anthropic.claude-3-5-haiku-20241022-v1:0
  system: [{ text: DM_SYSTEM_PROMPT }],
  messages: bedrockMessages,         // Array<{ role: 'user'|'assistant', content: [{text}] }>
  inferenceConfig: {
    maxTokens: 1024,
    temperature: 0.85,
  },
});
```

### Pattern 3: Streaming Bedrock to Express SSE

**What:** Iterate `response.stream` with `for await...of`, extract `contentBlockDelta.delta?.text`, write SSE data lines. Set SSE headers BEFORE starting the Bedrock call so Express does not buffer.

**When to use:** Every chat turn.

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseStreamCommand/
// server/src/services/bedrock.ts

export async function streamBedrockToSSE(
  messages: BedrockMessage[],
  systemPrompt: string,
  res: express.Response,
  signal: AbortSignal,
): Promise<string> {
  const command = new ConverseStreamCommand({
    modelId: config.BEDROCK_MODEL_ID,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens: 1024, temperature: 0.85 },
  });

  const response = await bedrockClient.send(command, { abortSignal: signal });
  let fullText = '';

  for await (const event of response.stream ?? []) {
    if (signal.aborted) break;
    const delta = event.contentBlockDelta?.delta?.text;
    if (delta) {
      fullText += delta;
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
    }
  }

  return fullText; // caller persists this as the assistant message
}
```

### Pattern 4: Express SSE Headers

**What:** Set three headers before writing any response. Call `res.flushHeaders()` immediately to flush the header to the client — without this, some proxies and Express 5 buffer the response.

**When to use:** At the very start of the `/chat` handler, before any async work.

```typescript
// Source: https://masteringjs.io/tutorials/express/server-sent-events
// Source: project ARCHITECTURE.md (X-Accel-Buffering for nginx)

res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');   // Prevents nginx from buffering chunks
res.flushHeaders();                           // Send headers immediately
```

### Pattern 5: AbortController for Timeout + Client Disconnect

**What:** Create an `AbortController` per request. Pass `signal` to `bedrockClient.send()`. Wire both a 30s timeout and `req.on('close', ...)` to `controller.abort()`.

**When to use:** Every Bedrock call. Required by architecture contracts.

```typescript
// Source: ARCHITECTURE.md reliability requirements
// server/src/routes/chat.ts

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);

req.on('close', () => {
  controller.abort();
  clearTimeout(timeout);
});

try {
  const fullText = await streamBedrockToSSE(messages, systemPrompt, res, controller.signal);
  // persist fullText as assistant message
} catch (err) {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
  }
} finally {
  clearTimeout(timeout);
  if (!res.writableEnded) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
```

### Pattern 6: In-Memory Conversation Store

**What:** `Map<string, ChatMessage[]>` keyed by `conversationId`. On first request (no `conversationId`), create a UUID. Return `conversationId` in the first SSE event so the client can send it back next turn.

**When to use:** Every `/chat` request.

```typescript
// Source: ARCHITECTURE.md Pattern 2 (Server-Owned Conversation State)
// server/src/services/conversationStore.ts

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
const store = new Map<string, ChatMessage[]>();

export function getOrCreate(conversationId?: string) {
  const id = conversationId ?? crypto.randomUUID();
  if (!store.has(id)) store.set(id, []);
  return { id, history: store.get(id)! };
}

// Convert internal format to Bedrock message shape
export function toBedrockMessages(history: ChatMessage[]) {
  // Keep last 12 turns to stay within token budget
  return history.slice(-12).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: [{ text: m.content }],
  }));
}
```

### Pattern 7: Dice Result Injection

**What:** If the client sends `diceResult` (a number 1-20) alongside `message`, the server appends `[Dice roll result: ${diceResult}]` to the user message before sending to Bedrock. The system prompt instructs the DM to narrate based on this number.

**When to use:** When `req.body.diceResult` is present.

```typescript
// server/src/routes/chat.ts

const { conversationId, message, diceResult } = req.body;

// Augment user message with dice result for DM narration
const augmentedMessage = diceResult != null
  ? `${message}\n[Dice roll result: ${diceResult}. Narrate the outcome accordingly: 1-5 is a failure, 6-15 is a partial success, 16-20 is a great success.]`
  : message;
```

### Pattern 8: D&D System Prompt

**What:** A compact system prompt that establishes the DM persona, narration style, and dice outcome rules. Kept as a constant in `chat.ts` or `bedrock.ts`.

```typescript
// server/src/routes/chat.ts or server/src/services/bedrock.ts

const DM_SYSTEM_PROMPT = `You are a dramatic and immersive Dungeons & Dragons Dungeon Master narrating a dark fantasy adventure. \
Speak in second person ("you"), use vivid sensory detail, and maintain narrative tension. \
Keep responses concise (2-4 sentences) to match the streaming chat format. \
When a dice roll result is provided, narrate the outcome explicitly using the number: \
a roll of 1-5 results in clear failure with consequences, 6-15 is a partial success with complications, \
16-20 is a great success worthy of celebration. \
Current scenario: The Shattered Crown tavern — a goblin ambush is underway.`;
```

### Pattern 9: Client SSE Parser (useSSEChat replacement)

**What:** Replace the mock timeout block in `useSSEChat.ts` with a real `fetch` + `ReadableStream` SSE consumer. The external interface `{ messages, isLoading, sendMessage, reset }` stays identical — only the internals change.

**When to use:** Phase 4 drop-in replacement for the Phase 2 stub.

```typescript
// Source: ARCHITECTURE.md Pattern 1 (SSE Streaming) + Phase 2 RESEARCH.md SSE pattern
// client/src/hooks/useSSEChat.ts — replace the mock block with this

const sendMessage = useCallback(async (content: string) => {
  // ... add user message to state, setIsLoading(true) — same as before ...

  const abortController = new AbortController();
  pendingAbort.current = abortController;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversationIdRef.current, message: content }),
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) throw new Error('Stream failed');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let dmMessageId = crypto.randomUUID();

    // Add an empty streaming DM message placeholder
    setMessages(prev => [...prev, { id: dmMessageId, role: 'dm', content: '', isStreaming: true }]);

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
        try {
          const parsed = JSON.parse(payload);
          if (parsed.conversationId) conversationIdRef.current = parsed.conversationId;
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            setMessages(prev => prev.map(m =>
              m.id === dmMessageId
                ? { ...m, content: m.content + parsed.text }
                : m
            ));
          }
        } catch { /* skip malformed events */ }
      }
    }

    // Mark streaming complete
    setMessages(prev => prev.map(m =>
      m.id === dmMessageId ? { ...m, isStreaming: false } : m
    ));
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      // Show error as DM message fallback
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'dm',
        content: 'The connection to the Dungeon Master was lost. Please try again.',
      }]);
    }
  } finally {
    pendingAbort.current = null;
    setIsLoading(false);
  }
}, []);
```

### Anti-Patterns to Avoid

- **Setting SSE headers after starting async work:** The `Content-Type: text/event-stream` header must be sent FIRST before any await. If Express sends a 200 with JSON content-type first, the client's SSE parser breaks.
- **Not flushing headers:** Without `res.flushHeaders()`, Express 5 may batch the header with the first data chunk, breaking SSE parsing.
- **Returning history in every SSE event:** Only send `conversationId` once in the FIRST event. Subsequent events carry only `{ text: delta }`.
- **Using `role: 'system'`:** Bedrock Converse API does not accept `'system'` in the `messages` array. System prompts go in the separate `system` parameter. Mixing them causes `ValidationException`.
- **Accumulating full conversation in Datadog spans:** Span size > 1MB is silently dropped. Truncate any input/output logging to 500 chars per message.
- **Calling `res.end()` before writing `[DONE]`:** If the try block ends normally, always write the `[DONE]` sentinel BEFORE `res.end()`. Client uses `[DONE]` to know the turn is complete.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE event framing | Custom byte-level chunking | `res.write('data: ...\n\n')` standard format | MDN SSE spec is 2 lines; reinventing is always wrong |
| Conversation state | Custom session middleware | Simple `Map<string, ChatMessage[]>` | One-liner; Redis is overkill for 1-user demo |
| Stream cancellation | Signal polling loop | `AbortController` + `{ abortSignal: signal }` to SDK | SDK handles `AbortError` internally; polling is fragile |
| SSE chunk parsing | Manual byte index tracking | Split on `\n\n`, check `startsWith('data:')` | The 5-line pattern from ARCHITECTURE.md works correctly |
| D&D dice outcome logic | Probability tables, rule engine | System prompt instruction + dice number injection | LLM interprets bracket instructions reliably; no rule engine needed |

**Key insight:** Every "clever" SSE implementation builds bugs that only appear at demo time. Use the exact patterns from ARCHITECTURE.md which were researched and verified.

---

## Common Pitfalls

### Pitfall 1: `ValidationException` — Wrong Message Role or Format

**What goes wrong:** Bedrock returns `ValidationException: The model ID is invalid` or `The messages field is invalid` with no useful detail.

**Why it happens:** Three root causes:
1. Using `role: 'system'` inside the `messages` array (only `'user'` and `'assistant'` are valid)
2. Content is a bare string instead of an array: `content: 'text'` instead of `content: [{ text: 'text' }]`
3. Conversation starts with an `'assistant'` message instead of `'user'`

**How to avoid:** Always map to: `{ role: 'user' | 'assistant', content: [{ text: string }] }`. System prompt goes in `system: [{ text: '...' }]`.

**Warning signs:** ValidationException in logs immediately on the first Bedrock call.

---

### Pitfall 2: Model ID Not Enabled or Wrong Format

**What goes wrong:** `AccessDeniedException: You don't have access to the model with the specified model ID` even with correct IAM credentials.

**Why it happens:** Bedrock requires per-model access enablement via the AWS Console Model Catalog. Having `AmazonBedrockFullAccess` IAM policy is necessary but not sufficient. Also: model ID format matters — `anthropic.claude-3-5-haiku-20241022-v1:0` not `anthropic/claude-3-5-haiku`.

**How to avoid:** Enable model access in AWS Console before coding. Use the exact ID from the console (copy-paste, don't type). For fast demo inference with low cost, `anthropic.claude-3-5-haiku-20241022-v1:0` is recommended — it supports ConverseStream and is available in `us-east-1`. The BEDROCK_MODEL_ID env var is already in `.env.example`.

**Warning signs:** Error on first `bedrockClient.send()` call.

---

### Pitfall 3: Client Disconnect Leaves Bedrock Stream Open

**What goes wrong:** User resets the chat while DM is responding. Server keeps consuming the Bedrock stream and writing to a closed response, causing unhandled errors in the log.

**Why it happens:** No `req.on('close', ...)` handler to abort the in-flight stream.

**How to avoid:** Register `req.on('close', () => controller.abort())` before the Bedrock call. Pass `signal: controller.signal` to `bedrockClient.send()`. The SDK throws `AbortError` which must be caught and NOT re-thrown as a fatal error.

**Warning signs:** `Error: write after end` or `ERR_HTTP_HEADERS_SENT` in server logs after chat reset.

---

### Pitfall 4: `res.write()` After `res.end()`

**What goes wrong:** `Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client`.

**Why it happens:** The `finally` block calls `res.end()` unconditionally. If the request handler for a `close` event also writes to `res`, or if the error handler runs after `res.end()`, you get this error.

**How to avoid:** Guard all writes with `if (!res.writableEnded)`. Call `res.end()` only once, and only in the `finally` block after writing `[DONE]`.

**Warning signs:** Error appears in logs after stream completes, especially after client disconnect.

---

### Pitfall 5: Vite Proxy Not Forwarding SSE Correctly

**What goes wrong:** SSE stream appears in Postman but not in the React app. Browser DevTools show the `/api/chat` call completing immediately with all chunks at once.

**Why it happens:** Vite's dev server proxy buffers the response. The proxy must be configured to pass through streaming responses.

**How to avoid:** In `client/vite.config.ts`, the proxy is already configured (from Phase 1). Verify it has no `timeout` or buffering settings. If needed, add `changeOrigin: true` and ensure the dev server does not set `compress: true` on proxy targets (compression prevents streaming). Standard Vite proxy passes SSE correctly by default.

**Warning signs:** EventStream tab in DevTools shows all events arriving at once at stream end.

---

### Pitfall 6: Token Budget Overflow on Long Sessions

**What goes wrong:** After several chat turns, Bedrock returns `ValidationException: Input is too long for requested model`. The context window is exceeded.

**Why it happens:** Sending the full conversation history without pruning. Claude 3.5 Haiku has a 200k token context window, but each turn can add 200-500 tokens. After 20+ turns, you hit the limit.

**How to avoid:** Slice history to last 12 turns before sending to Bedrock: `history.slice(-12)`. For a 3-turn demo, this is not a real concern, but the slice guard prevents demo failures on re-runs.

**Warning signs:** Works fine for first 3-5 turns, then fails on longer sessions.

---

## Code Examples

Verified patterns from official sources:

### Complete `/chat` Route Handler

```typescript
// Source: ARCHITECTURE.md Pattern 2 + Pattern 1 combined
// server/src/routes/chat.ts

import { Router } from 'express';
import { z } from 'zod';
import { getOrCreate, toBedrockMessages, appendMessage } from '../services/conversationStore.js';
import { streamBedrockToSSE } from '../services/bedrock.js';

const chatRouter = Router();

const ChatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  diceResult: z.number().int().min(1).max(20).optional(),
});

const DM_SYSTEM_PROMPT = `You are a dramatic and immersive Dungeons & Dragons Dungeon Master \
narrating a dark fantasy adventure. Speak in second person ("you"), use vivid sensory detail, \
and keep responses concise (2-4 sentences). When a dice roll result is provided, \
narrate the outcome using the number explicitly: 1-5 is a critical failure, \
6-15 is a partial success with complications, 16-20 is a great success.`;

chatRouter.post('/chat', async (req, res) => {
  // 1. Validate body
  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const { conversationId, message, diceResult } = parsed.data;

  // 2. Get or create conversation
  const { id, history } = getOrCreate(conversationId);

  // 3. Augment message with dice result if present
  const augmentedMessage = diceResult != null
    ? `${message}\n[Dice roll result: ${diceResult}. Narrate the outcome: 1-5 failure, 6-15 partial success, 16-20 great success.]`
    : message;

  // 4. Append user turn to history
  appendMessage(id, { role: 'user', content: augmentedMessage });

  // 5. Set SSE headers BEFORE any async work
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 6. Send conversationId in first event so client can reuse it
  res.write(`data: ${JSON.stringify({ conversationId: id })}\n\n`);

  // 7. AbortController for timeout + client disconnect
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  req.on('close', () => { controller.abort(); clearTimeout(timeout); });

  try {
    const bedrockMessages = toBedrockMessages(history);
    const fullText = await streamBedrockToSSE(
      bedrockMessages, DM_SYSTEM_PROMPT, res, controller.signal
    );
    // 8. Persist assistant response
    appendMessage(id, { role: 'assistant', content: fullText });
  } catch (err) {
    const isAbort = (err as Error).name === 'AbortError';
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: isAbort ? 'Cancelled' : 'Stream failed' })}\n\n`);
    }
  } finally {
    clearTimeout(timeout);
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

export default chatRouter;
```

### Bedrock Service — Client + Stream Helper

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseStreamCommand/
// server/src/services/bedrock.ts

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
} from '@aws-sdk/client-bedrock-runtime';
import type { Response } from 'express';
import { config } from './config.js';

// Singleton — created once at module load
const bedrockClient = new BedrockRuntimeClient({ region: config.AWS_REGION });

export async function streamBedrockToSSE(
  messages: BedrockMessage[],
  systemPrompt: string,
  res: Response,
  signal: AbortSignal,
): Promise<string> {
  const command = new ConverseStreamCommand({
    modelId: config.BEDROCK_MODEL_ID,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens: 1024, temperature: 0.85 },
  });

  const response = await bedrockClient.send(command, { abortSignal: signal });
  let fullText = '';

  for await (const event of response.stream ?? []) {
    if (signal.aborted) break;
    const delta = event.contentBlockDelta?.delta?.text;
    if (delta) {
      fullText += delta;
      // Guard against writing to a closed response
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      }
    }
  }

  return fullText;
}
```

### Conversation Store

```typescript
// Source: ARCHITECTURE.md Pattern 2
// server/src/services/conversationStore.ts

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const store = new Map<string, ChatMessage[]>();

export function getOrCreate(conversationId?: string): { id: string; history: ChatMessage[] } {
  const id = conversationId ?? crypto.randomUUID();
  if (!store.has(id)) store.set(id, []);
  return { id, history: store.get(id)! };
}

export function appendMessage(id: string, message: ChatMessage): void {
  store.get(id)?.push(message);
}

export function toBedrockMessages(history: ChatMessage[]) {
  // Keep last 12 turns; convert to Bedrock Converse message shape
  return history.slice(-12).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: [{ text: m.content }],
  }));
}
```

### useSSEChat.ts — Tracking conversationId

```typescript
// client/src/hooks/useSSEChat.ts
// Add conversationId tracking alongside messages

const conversationIdRef = useRef<string | null>(null);
const pendingAbort = useRef<AbortController | null>(null);

const reset = useCallback(() => {
  if (pendingAbort.current) {
    pendingAbort.current.abort();
    pendingAbort.current = null;
  }
  conversationIdRef.current = null;  // Reset conversation for a fresh session
  setMessages([]);
  setIsLoading(false);
}, []);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `InvokeModelCommand` with custom prompt format | `ConverseStreamCommand` with standard messages format | Bedrock Converse API launched 2024 | No need to hand-assemble XML/JSON prompt; model-agnostic API |
| `EventSource` for streaming | `fetch` + `ReadableStream` | Standard since ~2020 | EventSource cannot POST; fetch works for all HTTP methods |
| Polling for LLM responses | SSE streaming from Express | Mainstream 2023+ | Token-by-token rendering; eliminates perceived latency |
| Separate import of `dd-trace` in code | `NODE_OPTIONS='--import dd-trace/initialize.mjs'` | dd-trace recommendation | Guarantees instrumentation before any module loads |

**Deprecated/outdated for this stack:**
- `InvokeModelCommand` with raw body JSON: Works but requires model-specific prompt format. ConverseStream is model-agnostic. Do not use `InvokeModelCommand`.
- `InvokeModelWithResponseStreamCommand`: Lower-level than ConverseStream; requires parsing raw event stream bytes manually. ConverseStream handles this.
- `@anthropic-ai/bedrock-sdk` for this project: NOT dd-trace instrumented. Hard locked against.

---

## Model ID Reference

For use in `BEDROCK_MODEL_ID` env var (as of 2026-02-20, source: official Anthropic Bedrock docs):

| Model | Model ID | Cost/Speed | Note |
|-------|----------|------------|------|
| Claude Haiku 3.5 | `anthropic.claude-3-5-haiku-20241022-v1:0` | Fastest, cheapest | Recommended for demo |
| Claude Sonnet 4 | `anthropic.claude-sonnet-4-20250514-v1:0` | Higher quality | Use if demo needs richer narration |
| Claude 3.7 Sonnet | `anthropic.claude-3-7-sonnet-20250219-v1:0` | RETIRED 2026-02-19 | Do NOT use |

**Recommendation:** Use `anthropic.claude-3-5-haiku-20241022-v1:0` for the demo. Fast first-token latency (~300ms), sufficient for DM narration, cheapest rate. If judges demand higher quality narration, `us.anthropic.claude-sonnet-4-20250514-v1:0` is the next option (note: newer models may require `us.` prefix for regional routing).

**CRITICAL:** Bedrock model access must be enabled per-account per-region in the AWS Console Model Catalog before any API calls will succeed. Enable this BEFORE writing Phase 4 code.

---

## Open Questions

1. **Dice result delivery mechanism**
   - What we know: CHAT-04 says "dice roll result injected into LLM prompt." Phase 2 sends `'🎲 I roll the dice!'` as a message string — no numeric value.
   - What's unclear: Phase 4 needs to inject a number (1-20). Currently the frontend sends a string, not a number. The dice roll happens server-side or client-side?
   - Recommendation: Per ARCHITECTURE.md and CLAUDE.md, the client sends `{ conversationId?, message, diceResult? }`. The Roll Dice button in Phase 2 sends a string. Phase 4 should extend the `sendMessage` signature (or add a separate `sendDiceRoll(result: number)` path) so the client generates the d20 number locally and sends it as `diceResult`. The server then injects it into the prompt. This keeps the pattern minimal — add `diceResult?: number` to the request body and generate it client-side via `Math.floor(Math.random() * 20) + 1`. Note: CONTEXT.md for Phase 2 says "no frontend dice generation" — but that referred to the dice animation, not the number generation for server injection. The number must exist somewhere; server-side generation requires an extra round-trip. Client-side generation with server injection is the intended flow.

2. **Vite proxy path prefix**
   - What we know: `client/vite.config.ts` proxies `/api` to `http://localhost:3001` (set in Phase 1). Routes should be `/api/chat`.
   - What's unclear: Whether the chat route is mounted at `/chat` (server-side) and rewritten to `/api/chat` by Vite proxy, or at `/api/chat` directly.
   - Recommendation: Mount at `/chat` in Express (consistent with ARCHITECTURE.md). Vite proxy handles `/api` → server. Client fetches `/api/chat`. No change needed to vite.config.ts.

---

## Sources

### Primary (HIGH confidence)

- `https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/command/ConverseStreamCommand/` — Full TypeScript API: input type, output stream event types, `for await` iteration pattern
- `https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html` — System prompt format (`system` array), messages format (`role`/`content` structure), multi-turn conversation pattern
- `https://docs.aws.amazon.com/code-library/latest/ug/bedrock-runtime_example_bedrock-runtime_ConverseStream_AnthropicClaude_section.html` — Complete TypeScript ConverseStream example with Claude model
- `https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock` — Definitive Claude model ID table with retirement dates; global vs regional endpoint guidance
- `node_modules/@aws-sdk/client-bedrock-runtime/package.json` — Confirmed version 3.995.0 installed
- `server/package.json` — Confirmed all dependencies installed; no new packages needed
- `.planning/research/ARCHITECTURE.md` — SSE streaming pattern, conversation store pattern, AbortController reliability contract, Datadog dd-trace bootstrap pattern (verified 2026-02-20)
- `.planning/research/PITFALLS.md` — Bedrock model access pitfall, dd-trace ordering, session management

### Secondary (MEDIUM confidence)

- `https://masteringjs.io/tutorials/express/server-sent-events` — Express SSE header pattern; `res.flushHeaders()` usage; `res.write()` vs `res.send()`
- `https://github.com/DataDog/dd-trace-js/blob/master/packages/dd-trace/src/plugins/index.js` — Confirmed dd-trace instruments AWS SDK via `@smithy/smithy-client` and `@aws-sdk/smithy-client` entry points
- `https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_ConverseStream_AmazonNovaText_section.html` — ConverseStream pattern with Express SSE integration example

### Tertiary (LOW confidence)

- WebSearch for dd-trace ConverseStream instrumentation specifics — confirmed infrastructure exists (`datadog-plugin-aws-sdk`) but specific ConverseStream span attributes not documented publicly; defer to Phase 6 research

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All packages already installed and at known versions; SDK API verified via official docs
- Architecture patterns: HIGH — ConverseStreamCommand API fully documented; SSE patterns verified; conversation store is a simple Map
- Model IDs: HIGH — Sourced from official Anthropic Bedrock docs (2026-02-20)
- Pitfalls: HIGH — Bedrock model access, AbortController, SSE header patterns verified via official docs and project ARCHITECTURE.md
- Dice injection: MEDIUM — Pattern is clear; exact client-side vs server-side dice generation is an open design point resolved via recommendation
- dd-trace ConverseStream span details: LOW — Infrastructure confirmed but span attribute specifics deferred to Phase 6

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days; AWS Bedrock Converse API is stable; model IDs change — re-verify if BEDROCK_MODEL_ID needs to change)
