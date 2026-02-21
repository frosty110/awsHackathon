# Phase 11: Architecture Audit and Improvement Research

**Researched:** 2026-02-21
**Domain:** Node.js + React full-stack architecture audit — AI chat, SSE streaming, Socket.IO multiplayer, RAG, TTS, S3 caching
**Confidence:** HIGH (codebase read directly; external claims cross-verified)

---

## Summary

This is an architecture audit phase, not a feature phase. The codebase (~7500 lines of TypeScript across 55 files) is well-structured for its build phase but has reached a threshold where several patterns that were acceptable shortcuts in early phases have become structural risks as the system grows toward 1000 concurrent users. The core gameplay loop is solid. The primary gaps are: (1) state that doesn't survive restarts, (2) no rate limiting or backpressure on expensive AI calls, (3) type duplication between client and server, (4) security middleware missing from Express, and (5) no automated tests.

The system does NOT need a full rewrite. The architecture is clean (routes, services, sockets separation; dependency injection via `initRag(driver)`; graceful degradation patterns). The improvements are targeted additions and reorganization, not foundational changes. The planner should create small, focused tasks that each address one gap without touching others.

**Primary recommendation:** Add rate limiting + Bedrock concurrency cap first (highest risk at scale), then shared types package, then Helmet security headers, then a Redis-ready store interface, then test scaffolding — in that order of impact.

---

## Current Architecture Assessment

### What Is Working Well (Do Not Change)

- **Service layer separation** is clean: `routes/` for HTTP handling, `services/` for business logic, `sockets/` for Socket.IO — this is the correct pattern for Express at this scale.
- **Graceful degradation** via `initRag(driver)` pattern: RAG degrades to no-lore when Neo4j is unavailable. TTS errors don't block chat. S3 cache failure degrades to L1 cache. These are correct.
- **Two-tier TTS cache** (L1 in-memory + L2 S3) is architecturally sound. The fire-and-forget S3 write pattern is correct.
- **Datadog tracing** via `NODE_OPTIONS='--import dd-trace/initialize.mjs'` bootstrap is the only correct pattern for dd-trace auto-instrumentation of `@aws-sdk/client-bedrock-runtime`. Do not change this.
- **Config validation** with zod + blank-default pattern is production-grade. All 25 env vars validated at startup, graceful empty-string defaults avoid startup failures on optional integrations.
- **Logger** (`logEvent`) produces structured JSON logs, which Datadog ingests correctly.
- **SSE streaming** pattern (fetch POST + ReadableStream) is the correct modern approach for streaming LLM responses to browsers.
- **Socket.IO event typing** (`ClientToServerEvents` / `ServerToClientEvents`) is correctly typed and separated into `types.ts`.

### Critical Gaps Found by Direct Code Audit

#### Gap 1: In-Memory State Won't Survive Restarts (CRITICAL at scale)

Both `conversationStore.ts` and `roomStore.ts` use module-level `Map` objects:
```typescript
// conversationStore.ts:13
const store = new Map<string, Conversation>();

// roomStore.ts:33
const rooms = new Map<string, Room>();
```

**Impact at 1000 users:** Single server process restart wipes all active sessions. Single instance only — horizontal scaling impossible because two Node.js processes don't share memory. At 1000 users, a single deploy wipes 1000 concurrent sessions.

**Compound risk:** `usageTracker.ts` also uses an in-memory array (`const entries: UsageEntry[] = []`) — billing data is lost on restart.

#### Gap 2: No Rate Limiting or Backpressure on Bedrock (HIGH risk)

`/api/chat` has no rate limiting. Each request fires a Bedrock `ConverseStreamCommand` with no concurrency cap. At 1000 concurrent users all sending messages simultaneously:
- Bedrock throttling errors cause cascading failures
- Each Bedrock call holds an HTTP connection for up to 45 seconds (the `BEDROCK_STREAM_TIMEOUT_MS`)
- 1000 simultaneous 45-second streams = 45,000 concurrent-seconds of connection holding

No `express-rate-limit` middleware is installed anywhere in the codebase. `app.ts` has no rate limiting applied.

#### Gap 3: Type Duplication Between Client and Server (MEDIUM risk)

`RoomPhase` type is defined in two places:
- `server/src/sockets/types.ts:3` — `export type RoomPhase = "lobby" | "playing" | "collecting-actions" | "dm-responding";`
- `client/src/types/multiplayer.ts:57` — `export type RoomPhase = 'lobby' | 'playing' | 'collecting-actions' | 'dm-responding';`

`ChatMessage` type name conflicts:
- `server/src/services/bedrock.ts:162` — `export type ChatMessage` (role + content for Bedrock)
- `client/src/types/multiplayer.ts:80` — `export interface ChatMessage` (player-to-player side chat)
- `server/src/services/conversationStore.ts:1` — yet another `export type ChatMessage`

`stripTTSTags()` is duplicated:
- `server/src/services/tts.ts:141` — server version (source of truth)
- `client/src/hooks/useSSEChat.ts:9` — copy-pasted client version (will drift)

This pattern will cause silent type mismatches over time as the API evolves.

#### Gap 4: Security Middleware Missing (MEDIUM risk for production)

`app.ts` has no security headers. Missing:
- `helmet` — sets 15 security HTTP headers (Content-Security-Policy, X-Frame-Options, etc.)
- `cors` — currently allowing all origins (no allowlist)
- CORS on Socket.IO — currently `cors: { origin: "*" }` (not yet verified but typical default)

CLAUDE.md specifies: "Strict CORS allowlist for allowed origins" — this is not implemented.

#### Gap 5: No Automated Tests (LOW-MEDIUM risk for maintainability)

Zero test files found in the entire codebase. For an architecture audit phase, this matters because:
- Refactoring without tests = no safety net
- `stripTTSTags`, `extractMood`, `extractEntities` are pure functions with no test coverage
- `conversationStore` functions are testable in isolation

#### Gap 6: System Prompt Lives in bedrock.ts (LOW risk, HIGH maintainability impact)

`DM_SYSTEM_PROMPT` is a 160-line string literal inside `bedrock.ts`. The `buildMultiplayerSystemPrompt()` function is also in `bedrock.ts`. These are content/prompt concerns, not Bedrock transport concerns. They belong in a `promptBuilder.ts` service. `bedrock.ts` should only know about AWS transport, not D&D adventure content.

#### Gap 7: `music.ts` Route Contains Generation Service Logic (LOW risk)

`routes/music.ts` is 293 lines and contains the full music generation state machine (polling, retries, in-memory cache, MiniMax API calls). This belongs in `services/musicService.ts` with a thin route handler. Current pattern is inconsistent with how `chat.ts` delegates to `bedrock.ts` and `tts.ts`.

#### Gap 8: No Backpressure on Multiplayer Bedrock Calls (HIGH risk for multiplayer)

`triggerDMResponse` and `triggerDMOpening` in `turnHandlers.ts` call `streamBedrockResponse` directly with no concurrency limit across rooms. 250 simultaneous multiplayer rooms each submitting actions at the same moment = 250 simultaneous Bedrock calls.

---

## Standard Stack

### Core (already in use — verify these versions)

| Library | Current Version | Purpose | Status |
|---------|----------------|---------|--------|
| express | ^5.0.0 | HTTP server | Correct — Express 5 stable |
| socket.io | ^4.8.3 | Multiplayer real-time | Correct |
| @aws-sdk/client-bedrock-runtime | ^3.0.0 | Bedrock streaming | Correct — required for dd-trace |
| @aws-sdk/client-s3 | ^3.995.0 | S3 audio cache | Correct |
| dd-trace | ^5.86.0 | Datadog APM + LLMObs | Correct |
| zod | ^4.0.0 | Config validation | Correct |
| neo4j-driver | ^6.0.0 | Graph RAG | Correct |
| nanoid | ^5.1.6 | Room code generation | Correct |

### New Libraries Needed for Architecture Improvements

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| helmet | ^8.x | Security HTTP headers | Official Express recommendation; sets 15 headers in one call |
| cors | ^2.x | CORS allowlist | Express official; needed with Helmet for proper CORS handling |
| express-rate-limit | ^7.x | Per-route rate limiting | 10M+ weekly downloads; standard for Express API protection |
| p-queue | ^8.x | Bedrock concurrency cap | Sindre Sorhus; ESM-native; sliding window for API calls |
| vitest | ^3.x | Unit testing | Native TypeScript + ESM; zero-config for modern Node.js projects |
| supertest | ^7.x | Integration testing Express | Standard Express HTTP testing companion |
| @vitest/coverage-v8 | ^3.x | Code coverage | Pairs with vitest; V8 coverage without babel transform |

**Installation for security + rate limiting:**
```bash
yarn workspace server add helmet cors express-rate-limit p-queue
yarn workspace server add -D @types/cors
```

**Installation for testing:**
```bash
yarn workspace server add -D vitest supertest @vitest/coverage-v8 @types/supertest
```

**Installation for shared types:**
```bash
mkdir packages/shared-types
# Add to root workspaces in package.json
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue (Bedrock cap) | Custom semaphore | p-queue handles priority, timeout, concurrency, interval — don't hand-roll |
| express-rate-limit | rate-limiter-flexible | rate-limiter-flexible is more powerful (Redis-backed) but more complex; express-rate-limit is correct for this scale |
| vitest | Jest | Jest requires ESM config ceremony for TypeScript ESM projects; vitest is zero-config for ESM |
| helmet standalone | manual header setting | helmet wraps 15 sub-middlewares correctly; hand-rolling security headers is error-prone |

---

## Architecture Patterns

### Recommended Project Structure (Delta from Current)

```
server/src/
├── routes/          # Thin HTTP handlers only (no service logic inside)
│   ├── chat.ts      # Already correct
│   ├── music.ts     # NEEDS: extract service logic to services/musicService.ts
│   ├── narrate.ts   # Already correct
│   ├── health.ts    # Already correct
│   ├── usage.ts     # Already correct
│   └── sceneVideo.ts # Already correct
├── services/
│   ├── bedrock.ts       # NEEDS: remove DM_SYSTEM_PROMPT and buildMultiplayerSystemPrompt
│   ├── promptBuilder.ts # NEW: owns all prompt construction logic
│   ├── musicService.ts  # NEW: extract from routes/music.ts
│   ├── tts.ts           # Already correct
│   ├── rag.ts           # Already correct
│   ├── audioCache.ts    # Already correct
│   ├── conversationStore.ts  # ADD: IConversationStore interface for Redis readiness
│   ├── roomStore.ts          # ADD: IRoomStore interface for Redis readiness
│   └── ...              # Other services unchanged
├── middleware/      # NEW: dedicated middleware directory
│   ├── rateLimits.ts    # NEW: rate limiters for /api/chat, /api/narrate, /api/music
│   └── security.ts      # NEW: helmet + cors configuration
└── sockets/         # Already correct

packages/            # NEW: shared monorepo packages
└── shared-types/    # NEW: types shared between client and server
    ├── package.json
    └── src/
        ├── multiplayer.ts   # RoomPhase, PlayerPayload, RoomStatePayload, socket events
        ├── tts.ts           # SceneMood, SceneId, CharacterVoice
        └── index.ts         # Re-exports

server/src/
└── __tests__/       # NEW: test directory
    ├── services/
    │   ├── tts.test.ts          # extractMood, extractScene, stripTTSTags, splitVoiceSegments
    │   ├── rag.test.ts          # extractEntities
    │   └── conversationStore.test.ts
    └── routes/
        └── chat.test.ts         # Integration test with supertest
```

### Pattern 1: Rate Limiting Middleware Layer

**What:** Apply `express-rate-limit` per route with sensible limits before route handlers. Key generator falls back to IP when no session/user identity exists.

**When to use:** On all stateful or expensive routes — `/api/chat`, `/api/narrate`, `/api/music`.

**Example:**
```typescript
// Source: https://github.com/express-rate-limit/express-rate-limit
import rateLimit from 'express-rate-limit';

// Chat: 60 messages per minute per IP (1 per second average)
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',  // RateLimit-* headers (RFC 9110)
  legacyHeaders: false,
  message: { error: 'Too many requests', retryAfter: 60 },
  keyGenerator: (req) => {
    // Use conversationId if available, fall back to IP
    const body = req.body as { conversationId?: string };
    return body.conversationId || req.ip || 'unknown';
  },
});

// Narrate (TTS generation): 10 per minute per IP — expensive MiniMax call
export const narrateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Apply in app.ts before routes
app.use('/api/chat', chatLimiter, chatRouter);
app.use('/api/narrate', narrateLimiter, narrateRouter);
```

### Pattern 2: Bedrock Concurrency Cap via p-queue

**What:** Wrap all `streamBedrockResponse` calls in a global p-queue with a fixed concurrency limit. When the queue is full, requests wait rather than being rejected.

**When to use:** Any process-wide cap on concurrent calls to an external API with known throttling limits.

**Example:**
```typescript
// Source: https://github.com/sindresorhus/p-queue
import PQueue from 'p-queue';

// Bedrock allows ~10 concurrent streams per account by default
// Conservative cap: 8 (leaves headroom for burst)
const bedrockQueue = new PQueue({ concurrency: 8 });

export async function streamBedrockResponse(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: BedrockOptions
): Promise<BedrockResult> {
  return bedrockQueue.add(() => streamBedrockResponseInternal(messages, onChunk, options));
}
```

### Pattern 3: Store Interface for Redis Readiness

**What:** Extract an `IConversationStore` interface so the in-memory implementation can be swapped for a Redis implementation without changing callers.

**When to use:** Any stateful service that will eventually need to survive restarts or scale horizontally.

**Example:**
```typescript
// services/conversationStore.ts
export interface IConversationStore {
  getOrCreate(conversationId?: string, characterClass?: string, pronouns?: string): Conversation;
  appendMessage(conversationId: string, message: ChatMessage): void;
  getWindowedHistory(conversationId: string, maxTurns?: number): ChatMessage[];
  getCharacterClass(conversationId: string): string | undefined;
  getPronouns(conversationId: string): string | undefined;
}

class InMemoryConversationStore implements IConversationStore {
  private store = new Map<string, Conversation>();
  // ... current implementation
}

// Singleton for now — swap to RedisConversationStore when Redis is added
export const conversationStore: IConversationStore = new InMemoryConversationStore();

// Export free functions that delegate to the singleton (backward compat)
export const getOrCreate = conversationStore.getOrCreate.bind(conversationStore);
```

### Pattern 4: Security Middleware Setup

**What:** Apply `helmet` and `cors` before all routes. These must be registered before any route handler to take effect.

**When to use:** All Express production apps.

**Example:**
```typescript
// Source: https://expressjs.com/en/advanced/best-practice-security.html
import helmet from 'helmet';
import cors from 'cors';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];

app.use(helmet());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: false,
}));
app.disable('x-powered-by');  // Already handled by helmet but belt-and-suspenders
```

### Pattern 5: Shared Types Package

**What:** A `packages/shared-types` workspace package that exports types used by both client and server. No build step required — TypeScript can resolve source `.ts` files directly via `exports` in `package.json`.

**When to use:** Any type that appears in both `client/src/types/` and `server/src/sockets/types.ts`.

**Example:**
```json
// packages/shared-types/package.json
{
  "name": "@ai-dm/shared-types",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

```typescript
// server/src/sockets/types.ts — import from shared instead of redefining
import type { RoomPhase, PlayerPayload, RoomStatePayload } from '@ai-dm/shared-types';
```

### Pattern 6: promptBuilder.ts Service Extraction

**What:** Move all prompt construction logic out of `bedrock.ts` into a dedicated `promptBuilder.ts`. `bedrock.ts` becomes a pure AWS transport layer.

**When to use:** When a module is doing two distinct jobs (transport + content).

**Example:**
```typescript
// services/promptBuilder.ts
export function buildSinglePlayerPrompt(options: {
  characterClass?: string;
  pronouns?: string;
  loreContext?: string;
}): SystemBlock[] { ... }

export function buildMultiplayerPrompt(players: Player[]): SystemBlock[] { ... }

export { DM_SYSTEM_PROMPT };
```

### Anti-Patterns to Avoid

- **Route handlers containing service state:** `music.ts` has an in-memory `moodCache` Map inside a route file. State belongs in service classes, not route files.
- **Duplicated type definitions:** Never define the same type in both `client/src/types/` and `server/src/sockets/types.ts`. Use the shared package.
- **Duplicated pure functions:** `stripTTSTags` appears in both `server/src/services/tts.ts` and `client/src/hooks/useSSEChat.ts`. The function must live in one canonical location.
- **Unbounded in-memory growth:** All five in-memory caches (ttsCache, loreCache, moodCache, conversationStore, roomStore, usageTracker entries array) will grow without bound under sustained load. The TTS and lore caches have eviction but the others do not.
- **Module-level singleton state without interface:** `conversationStore.ts` exports free functions that close over a module-level `Map`. This makes testing hard and Redis migration harder. Wrap in a class with an interface.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Security HTTP headers | Custom header middleware | `helmet` | Helmet covers 15 headers correctly including CSP nonces, HSTS preload, Referrer-Policy; hand-rolled headers miss edge cases |
| Rate limiting | Custom request counter Map | `express-rate-limit` | Handles distributed counting (Redis store), sliding windows, standard headers (RFC 9110), skip conditions, trust proxy |
| Bedrock concurrency cap | Custom semaphore | `p-queue` | p-queue handles priority queuing, timeouts, interval rate, and pause/resume; semaphore alone doesn't handle interval-based rate limits |
| TypeScript test runner config | Custom Jest config | `vitest` | Vitest is zero-config for ESM TypeScript projects; Jest requires ts-jest or babel-jest for ESM, causing configuration complexity |
| CORS header handling | Manual `res.setHeader('Access-Control-Allow-Origin')` | `cors` middleware | CORS has 14 headers to set correctly across preflight and actual requests; hand-rolling misses preflight OPTIONS handling |

**Key insight:** The Express ecosystem has battle-tested middleware for every security and reliability concern in this system. The failure mode for hand-rolled solutions is not initial incorrectness — it's the edge cases discovered at scale (Redis store swap, trusted proxy headers, rate limit bypass via header manipulation).

---

## Common Pitfalls

### Pitfall 1: Helmet Breaking SSE Connections

**What goes wrong:** Helmet's default `Content-Security-Policy` can block `EventSource` connections if the CSP `connect-src` directive doesn't include the API origin.
**Why it happens:** Helmet sets a strict CSP by default. SSE uses `EventSource` which is subject to CSP `connect-src`.
**How to avoid:** When adding helmet, configure CSP to allow `connect-src 'self'` or disable CSP temporarily and add it explicitly.
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "connect-src": ["'self'"],
    },
  },
}));
```
**Warning signs:** Browser DevTools shows CSP violation in console after adding helmet; SSE stream stops working.

### Pitfall 2: Rate Limiter Breaking SSE Streams Mid-Response

**What goes wrong:** Applying a rate limiter to `/api/chat` will correctly block the HTTP handshake, but if the rate limiter runs during the response stream, it may interfere.
**Why it happens:** Express middleware runs on the request, not the response. Rate limiting on the request phase is safe.
**How to avoid:** Apply rate limiters as route-level middleware (before the handler), not as global middleware. The limiter checks count on request arrival, not during streaming.
**Warning signs:** Rate limit errors appearing in the middle of an SSE stream response.

### Pitfall 3: p-queue Adding Latency to Single-Player Chat

**What goes wrong:** With `concurrency: 8`, if 8 Bedrock calls are in flight, the 9th waits in queue. For a single user, their chat appears slower.
**Why it happens:** The global concurrency limit is shared across all users.
**How to avoid:** Set concurrency to a number that won't be routinely hit by normal usage. At ~1000 users where only a fraction are actively chatting simultaneously, 20-30 concurrent Bedrock calls is a reasonable ceiling that provides backpressure without impacting typical usage. Tune based on Bedrock account limits.
**Warning signs:** Datadog traces show Bedrock calls waiting longer than expected; p-queue size metric growing.

### Pitfall 4: Shared Types Package Breaking ESM Resolution

**What goes wrong:** TypeScript cannot resolve `@ai-dm/shared-types` because the monorepo workspace linking doesn't include the `exports` field correctly for `.ts` source files.
**Why it happens:** The `exports` field in package.json for TypeScript source must use `"types"` and `"import"` conditions correctly.
**How to avoid:** Use the "live types" pattern: set `"exports": { ".": "./src/index.ts" }` and configure `"moduleResolution": "bundler"` or `"node16"` in the consumer's tsconfig. Add `paths` mapping in root `tsconfig.json`.
**Warning signs:** TypeScript error `Cannot find module '@ai-dm/shared-types'` after package creation.

### Pitfall 5: Socket.IO CORS Different from Express CORS

**What goes wrong:** Adding `cors` middleware to Express doesn't apply to Socket.IO WebSocket upgrade requests. They have separate CORS configuration.
**Why it happens:** Socket.IO has its own CORS configuration on the `Server` constructor.
**How to avoid:** Set CORS on both Express (`app.use(cors(...))`) and Socket.IO (`new Server(httpServer, { cors: { origin: ALLOWED_ORIGINS } })`). Keep both in sync.
**Warning signs:** Socket.IO connections fail after tightening CORS on Express; browser shows CORS error on WebSocket upgrade.

### Pitfall 6: In-Memory usageTracker Array Growing Without Bound

**What goes wrong:** `usageTracker.ts` appends every usage record to `const entries: UsageEntry[] = []` with no eviction. At 1000 users over days, this grows to millions of entries.
**Why it happens:** The tracker was built for hackathon-scale usage, not sustained operation.
**How to avoid:** Add a rolling window eviction (keep last 24h or last 10k entries). Or flush aggregated stats to a persistent store.
**Warning signs:** Server memory climbing over hours of operation; `getGlobalUsage()` taking longer over time.

### Pitfall 7: Circular Dependency Risk When Extracting promptBuilder.ts

**What goes wrong:** `bedrock.ts` imports from `promptBuilder.ts`, and `promptBuilder.ts` might want to import types from `bedrock.ts` (e.g., `ChatMessage`), creating a circular import.
**Why it happens:** Type sharing creates implicit coupling between files.
**How to avoid:** Define shared types (like `ChatMessage`, `BedrockMessage`) in a separate `types/bedrock.ts` or in the shared types package. Both `bedrock.ts` and `promptBuilder.ts` import from the types file.
**Warning signs:** TypeScript error "circular dependency detected" or runtime `undefined` where an import should be a function.

---

## Code Examples

### Rate Limiting Setup in app.ts

```typescript
// Source: https://expressjs.com/en/advanced/best-practice-security.html + express-rate-limit docs
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { logEvent } from './services/logger.js';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];

export function createApp(deps: AppDeps): Express {
  const app = express();

  // Security headers — MUST come before routes
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "connect-src": ["'self'"],  // Required for SSE EventSource
      },
    },
  }));

  // CORS — MUST come before routes
  app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  }));

  app.use(express.json({ limit: '64kb' }));

  // Per-route rate limits
  const chatLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded. Slow down, adventurer.' },
    handler: (req, res, _next, options) => {
      logEvent('warn', 'rate_limit.exceeded', { route: req.path, ip: req.ip });
      res.status(429).json(options.message);
    },
  });

  const narrateLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.use('/api/chat', chatLimiter, chatRouter);
  app.use('/api/narrate', narrateLimiter, narrateRouter);
  app.use(musicRouter);
  // ... rest of routes
}
```

### p-queue Bedrock Concurrency Wrapper

```typescript
// Source: https://github.com/sindresorhus/p-queue
// server/src/services/bedrock.ts — add near top of file
import PQueue from 'p-queue';

// Account-level Bedrock concurrency limit. Adjust based on Bedrock service quotas.
// Default Bedrock quota is typically 10-20 concurrent requests per model.
const bedrockQueue = new PQueue({ concurrency: 20 });

export async function streamBedrockResponse(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: BedrockOptions
): Promise<BedrockResult> {
  return bedrockQueue.add(
    () => streamBedrockResponseInternal(messages, onChunk, options),
    { throwOnTimeout: true }
  ) as Promise<BedrockResult>;
}

// Internal function with all existing logic (rename from current streamBedrockResponse)
async function streamBedrockResponseInternal(...): Promise<BedrockResult> {
  // All existing tracer.llmobs.trace() and ConverseStreamCommand logic unchanged
}
```

### Vitest Test for Pure Functions

```typescript
// Source: https://vitest.dev/
// server/src/__tests__/services/tts.test.ts
import { describe, it, expect } from 'vitest';
import { extractMood, extractScene, stripTTSTags, splitVoiceSegments } from '../../services/tts.js';

describe('extractMood', () => {
  it('extracts valid mood tag from start of text', () => {
    const [mood, rest] = extractMood('{{mood:combat}} The goblin charges!');
    expect(mood).toBe('combat');
    expect(rest).toBe('The goblin charges!');
  });

  it('returns null for invalid mood', () => {
    const [mood] = extractMood('{{mood:invalid}} text');
    expect(mood).toBeNull();
  });

  it('returns null when no mood tag present', () => {
    const [mood, rest] = extractMood('Plain text');
    expect(mood).toBeNull();
    expect(rest).toBe('Plain text');
  });
});

describe('stripTTSTags', () => {
  it('strips all tag types', () => {
    const result = stripTTSTags(
      '{{mood:tavern}} {{scene:tavern_idle}} [whisper] Hello. {{voice:barkeep}}Greetings{{/voice}}'
    );
    expect(result).toBe('Hello. Greetings');
  });
});
```

### IConversationStore Interface Pattern

```typescript
// server/src/services/conversationStore.ts
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Conversation = {
  id: string;
  history: ChatMessage[];
  characterClass?: string;
  pronouns?: string;
};

export interface IConversationStore {
  getOrCreate(id?: string, characterClass?: string, pronouns?: string): Conversation;
  appendMessage(id: string, message: ChatMessage): void;
  getWindowedHistory(id: string, maxTurns?: number): ChatMessage[];
  getCharacterClass(id: string): string | undefined;
  getPronouns(id: string): string | undefined;
}

class InMemoryConversationStore implements IConversationStore {
  private store = new Map<string, Conversation>();

  getOrCreate(conversationId?: string, characterClass?: string, pronouns?: string): Conversation {
    // ... existing logic verbatim
  }
  // ... other methods verbatim
}

export const conversationStore: IConversationStore = new InMemoryConversationStore();

// Backward-compatible free function exports
export const { getOrCreate, appendMessage, getWindowedHistory, getCharacterClass, getPronouns } = conversationStore;
```

### Shared Types Package Setup

```json
// packages/shared-types/package.json
{
  "name": "@ai-dm/shared-types",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./multiplayer": "./src/multiplayer.ts",
    "./tts": "./src/tts.ts"
  }
}
```

```typescript
// packages/shared-types/src/multiplayer.ts
// Single source of truth — server and client both import from here
export type RoomPhase = 'lobby' | 'playing' | 'collecting-actions' | 'dm-responding';
export type { PlayerPayload, RoomStatePayload, ClientToServerEvents, ServerToClientEvents } from './events.js';
```

```json
// root tsconfig.json — add paths for workspace resolution
{
  "compilerOptions": {
    "paths": {
      "@ai-dm/shared-types": ["./packages/shared-types/src/index.ts"],
      "@ai-dm/shared-types/*": ["./packages/shared-types/src/*"]
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach (this codebase) | SOTA for 1000 Users | Impact |
|--------------|----------------------------------|---------------------|--------|
| In-memory session state | In-memory Map (current) | Redis-backed store with interface abstraction | Sessions survive restarts; enables horizontal scaling |
| No rate limiting | No rate limiting (current) | express-rate-limit per route with Redis store | Prevents Bedrock/MiniMax cost runaway; protects against abuse |
| Unbounded AI concurrency | Direct Bedrock calls (current) | p-queue concurrency cap | Prevents throttling cascades at scale |
| Type duplication | Types defined in both client/server (current) | Shared types package in monorepo | Eliminates drift between API contract and client types |
| No security headers | Missing (current) | helmet middleware | 15 HTTP security headers in one line |
| Prompt logic in transport layer | DM_SYSTEM_PROMPT in bedrock.ts (current) | Separate promptBuilder.ts | Enables prompt A/B testing, cleaner bedrock.ts |
| No tests | Zero test files (current) | Vitest unit tests for pure functions | Safety net for refactoring |
| Route-level service state | moodCache in music.ts (current) | State in service class | Consistent with rest of architecture |

**Deprecated/outdated:**
- Session state in process memory: Correct for single-instance dev; must evolve before horizontal scaling.
- Allowing `*` CORS: Acceptable for hackathon; must be locked to specific origins before production.

---

## Open Questions

1. **What is the actual AWS Bedrock concurrency quota for this account?**
   - What we know: Default is typically 10-20 concurrent inference requests per model per account
   - What's unclear: The specific account's quota for `global.anthropic.claude-3-haiku-20240307-v1:0`
   - Recommendation: Set p-queue `concurrency` to 10 initially; observe Bedrock `ThrottlingException` rate in Datadog; raise if no throttling observed

2. **Should the shared types package use path aliases or build step?**
   - What we know: "Live types" via `paths` in tsconfig works for internal packages without publishing; requires all consumers to share root tsconfig
   - What's unclear: Whether Vite's client build respects the root `tsconfig.json` `paths` without a vite config alias
   - Recommendation: Use Vite alias in `vite.config.ts` to mirror the tsconfig `paths` entry; test both `vite build` and `tsc` compilation paths

3. **Is Redis needed now or can the interface abstraction wait?**
   - What we know: In-memory store works correctly for single-instance operation; interface abstraction is the prerequisite for Redis migration
   - What's unclear: Whether the hackathon will use multi-instance deployment
   - Recommendation: Add the `IConversationStore` interface now (low risk, no behavior change); defer Redis implementation to when horizontal scaling is actually needed

4. **Should `usageTracker.ts` persist to a database or just add eviction?**
   - What we know: Current array grows unboundedly; for a hackathon, this is a memory leak risk
   - What's unclear: Whether usage data needs to survive restarts for billing purposes
   - Recommendation: Add rolling eviction (keep last 24h or 10k entries); this is the minimal fix; full persistence is out of scope for this phase

---

## Prioritized Improvement List

This ordering maximizes impact per unit of work. The planner should create tasks in this order:

| Priority | Improvement | Risk if skipped | Effort |
|----------|-------------|-----------------|--------|
| 1 | Add `express-rate-limit` to `/api/chat` and `/api/narrate` | Bedrock cost runaway at scale; abuse vector | LOW |
| 2 | Add p-queue concurrency cap to Bedrock calls | Throttling cascades at scale | LOW |
| 3 | Add `helmet` + `cors` with allowlist | Security posture; CLAUDE.md compliance | LOW |
| 4 | Add `IConversationStore` interface (no Redis yet) | Blocks Redis migration later | MEDIUM |
| 5 | Extract `promptBuilder.ts` from `bedrock.ts` | Maintainability; DM_SYSTEM_PROMPT changes require touching bedrock.ts | MEDIUM |
| 6 | Extract `musicService.ts` from `routes/music.ts` | Architectural inconsistency with rest of routes | MEDIUM |
| 7 | Add shared types package (`@ai-dm/shared-types`) | Type drift between client/server as API evolves | HIGH |
| 8 | Add vitest + unit tests for pure functions | No safety net for future refactoring | MEDIUM |
| 9 | Add usageTracker rolling eviction | Memory leak over time | LOW |
| 10 | Add `IRoomStore` interface (no Redis yet) | Blocks multiplayer horizontal scaling | MEDIUM |

---

## Sources

### Primary (HIGH confidence — direct code audit)

All findings about the current codebase were derived from direct file reads:
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/app.ts` — no security middleware confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/routes/chat.ts` — no rate limiting confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/services/conversationStore.ts` — in-memory Map confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/services/roomStore.ts` — in-memory Map confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/services/usageTracker.ts` — unbounded array confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/services/bedrock.ts` — DM_SYSTEM_PROMPT in transport layer confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/server/src/routes/music.ts` — service logic in route confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/client/src/hooks/useSSEChat.ts` — stripTTSTags duplication confirmed
- `/Users/blaisealbuquerque/Projects/awsHackathon/client/src/types/multiplayer.ts` — RoomPhase duplication confirmed

### Secondary (MEDIUM confidence — official docs verified)

- [Express security best practices](https://expressjs.com/en/advanced/best-practice-security.html) — helmet, CORS, disable x-powered-by
- [Socket.IO Redis adapter docs](https://socket.io/docs/v4/redis-adapter/) — `@socket.io/redis-adapter` setup and sticky session requirement
- [express-rate-limit npm](https://www.npmjs.com/package/express-rate-limit) — keyGenerator, windowMs, max, standardHeaders
- [p-queue GitHub](https://github.com/sindresorhus/p-queue) — concurrency, interval, intervalCap options
- [vitest.dev](https://vitest.dev/) — native ESM TypeScript support, zero-config

### Tertiary (LOW confidence — WebSearch only, flag for validation)

- Bedrock concurrency quota defaults — stated as "10-20 per account" but the exact limit for `global.anthropic.claude-3-haiku-20240307-v1:0` must be verified via AWS console or `aws bedrock get-model-invocation-logging-configuration`
- Helmet CSP breaking SSE — inferred from CSP `connect-src` spec behavior; should be tested after implementation

---

## Metadata

**Confidence breakdown:**
- Current codebase gaps: HIGH — read directly from source
- Standard stack recommendations: HIGH — verified against official docs
- Security middleware setup: HIGH — official Express docs + helmet docs
- Redis readiness interface pattern: HIGH — standard OOP abstraction
- Shared types package: MEDIUM — pattern is well-established; specific Vite path alias behavior needs testing
- Bedrock concurrency quota: LOW — account-specific; must verify

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (library versions stable; architectural findings don't expire)
