# Phase 18: Code Review Bug Fixes Wave 2 — Research

**Researched:** 2026-02-22
**Domain:** Security hardening, memory safety, prompt injection, Redis optimization, SSE backpressure, React memoization
**Confidence:** HIGH (all findings grounded in direct codebase inspection + confirmed against code review document)

---

## Summary

Phase 18 targets the remaining findings from the 4-agent code review not addressed in Phase 17. The phase covers five distinct technical domains: security (IDOR access control, Socket.IO production auth, prompt injection), memory safety (unbounded in-memory media caches), Redis/performance (conversation store round-trips, SSE backpressure), architectural improvements (DmTurnService extraction, shared character class enums), and frontend memoization (MessageBubble, TTS Object URL cleanup).

The codebase inspection confirms: (1) Phase 17 completed all auth enforcement and JWT pinning — `requireAuth` is applied to all 6 game routes in `app.ts`. (2) The `conversationStore.ts` still uses GET+EXPIRE (8 Redis round-trips per chat turn) — no GETEX or local variable pattern exists. (3) The `inputSanitizer.ts` only strips `{{ }}` and `<| |>` patterns, missing XML-like role tags and unicode control chars. (4) The TTS, video, and music caches are all unbounded `Map<string, entry>` with count-based eviction only, no byte-budget eviction. (5) The client does NOT send `Authorization: Bearer token` on any fetch calls to `/api/chat` or `/api/narrate`. (6) The Socket.IO auth middleware allows unauthenticated connections even in production. (7) The `characterClass` field is trimmed but not allowlist-validated before prompt injection. (8) The `/api/usage` route uses `optionalAuth` not `requireAuth`. (9) `isSystemTrigger` is accepted from the client body without restriction.

The work is well-understood, bounded, and requires no new npm packages — all fixes are code changes only. Priority ordering aligns with the success criteria: P0 first (IDOR, dev JWT secret, client auth headers, cache limits), then P1 (Socket.IO prod auth, sanitizer expansion, SSE backpressure, Redis optimization, refresh tokens, S3 TTS URLs, DmTurnService, usage auth), then P2/P3 cleanup.

**Primary recommendation:** Group by file locality to minimize context switching. Plan as 4-5 plans: (1) security fixes P0/P1 server-side, (2) Redis/SSE performance, (3) client auth integration, (4) architectural extraction, (5) P2/P3 cleanup.

---

## Standard Stack

### Core (already installed — no new packages needed for P0/P1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jsonwebtoken | ^9.0.3 | JWT sign/verify, refresh token support | Already in use — `expiresIn` option accepts any time string |
| redis (node-redis) | ^5.11.0 | `GETEX` command, conversation store | Redis 6.2+ supports GETEX (combine GET+TTL in one round-trip) |
| zod | ^4.0.0 | Request body validation schemas | Already in use for config; add to route bodies |
| p-queue | ^9.1.0 | MiniMax TTS concurrency gate | Already gates Bedrock; identical pattern for TTS |
| @aws-sdk/client-s3 | ^3.995.0 | S3 signed URL generation for TTS audio | Already installed; use `GetObjectCommand` presigned URL |

### New packages needed

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @aws-sdk/s3-request-presigner | ^3.x | Generate S3 presigned URLs | Required for S3 signed URL delivery (not in current deps) |
| lru-cache | ^11.x | LRU eviction for media caches | Proper byte-budget LRU; simpler than hand-rolling |

**Note on lru-cache:** The `lru-cache` package (npm) is the standard Node.js LRU with `maxSize` (byte budget) and `sizeCalculation` callback. Version 11.x is ESM-native. The current hand-rolled eviction logic can be replaced or wrapped.

**Installation:**
```bash
# From server/
yarn add @aws-sdk/s3-request-presigner lru-cache
```

**Note on `@types/express` and `@types/node` pinned to `latest` (L-15):** Change to `^5.0.0` and `^22.0.0` respectively in server/package.json for deterministic builds.

---

## Architecture Patterns

### Current State vs Required State

#### P0-1: IDOR — Conversation Ownership (H-6)

**Current:** `getOrCreate(body.conversationId, ...)` in `chat.ts:70` creates or retrieves any conversation without checking ownership. Any authenticated user can pass any `conversationId` UUID and access another user's conversation.

**Required:** `conversationStore` must associate a `userId` with each conversation at creation time, and verify ownership on every access.

**Pattern:**
```typescript
// In conversationStore.ts — add userId to Conversation type
export type Conversation = {
  id: string;
  userId: string;  // NEW — owner of this conversation
  history: ChatMessage[];
  characterClass?: string;
  pronouns?: string;
};

// getOrCreate: set userId on creation, verify on existing
async getOrCreate(conversationId?: string, userId?: string, ...): Promise<Conversation> {
  // On existing: check userId matches
  if (convo && userId && convo.userId && convo.userId !== userId) {
    throw new ConversationOwnershipError(`Conversation belongs to different user`);
  }
}

// In chat.ts — pass req.userId (from requireAuth) to getOrCreate
const conversation = await getOrCreate(body.conversationId, req.userId, characterClass, pronouns);
// Handle ConversationOwnershipError -> 403
```

**Key insight:** `requireAuth` is already applied to `/api/chat`, so `req.userId` is guaranteed to be set when the route handler runs. Cast `req` as `AuthenticatedRequest` to access `req.userId`.

#### P0-2: Dev JWT Secret Should Be Random, Not Hardcoded

**Current:** `auth.ts:23` returns `"dev-secret-do-not-use-in-production"` (hardcoded string in source).

**Required:** Generate a random secret at startup using `crypto.randomBytes(32).toString('hex')`. The secret is module-level so it persists for the process lifetime (restarts invalidate dev tokens — acceptable in dev).

```typescript
// auth.ts
const DEV_SECRET = crypto.randomBytes(32).toString('hex');
// Replace "dev-secret-do-not-use-in-production" with DEV_SECRET
```

#### P0-3: Client Auth Headers — All Fetch Calls

**Current:** `useSSEChat.ts:82` POSTs to `/api/chat` without `Authorization` header. `useSSEChat.ts:226` POSTs to `/api/narrate` without auth. `AudioPlayer.tsx:27` calls `/api/narrate` without auth. Socket.IO connection in `socket.ts` does not pass a token.

**Required:** A token management utility in the client. All fetch calls must include `Authorization: Bearer <token>`. Socket.IO connection must pass `{ auth: { token } }`.

**Pattern:**
```typescript
// client/src/services/auth.ts (NEW FILE)
let _token: string | null = null;

export function setAuthToken(token: string): void { _token = token; }
export function getAuthToken(): string | null { return _token; }
export function clearAuthToken(): void { _token = null; }

export function authHeaders(): HeadersInit {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}
```

The client currently has no login/register UI. For Phase 18 scope, the client needs auth UI (login/register form) that stores the returned JWT. App.tsx needs an `authState` state machine: `login` -> `modeSelect` -> game states. This is a significant client-side addition.

**Alternative minimal approach:** A dev-only hardcoded token flow for hackathon scope, with TODO for production UI. This is LOW confidence as a planning decision and should be flagged to the user.

**Socket.IO token passing:**
```typescript
// client/src/services/socket.ts
import { getAuthToken } from './auth';
// Pass token in handshake auth:
export function connectSocket(): void {
  socket.auth = { token: getAuthToken() };
  socket.connect();
}
```

#### P0-4: In-Memory Cache Byte-Size Limits (H-11)

**Current:**
- `tts.ts:62-64`: `Map<string, TTSCacheEntry>` evicted at `TTS_CACHE_MAX_SIZE = 200` entries, but each entry contains `result.audioBuffer` (Buffer of 10-40MB) — no byte limit.
- `videoGenerator.ts:18`: `Map<SceneId, SceneCacheEntry>` with `.video: Buffer | null`, unbounded.
- `musicService.ts:41`: `Map<string, MoodCacheEntry>` with `.audio: Buffer | null`, unbounded.

**Required:** Byte-budget LRU eviction. Two approaches:

*Option A: lru-cache library* (recommended)
```typescript
import { LRUCache } from 'lru-cache';

const ttsCache = new LRUCache<string, TTSCacheEntry>({
  maxSize: 100 * 1024 * 1024, // 100MB
  sizeCalculation: (entry) => entry.result.audioBuffer.byteLength,
  ttl: 30 * 60 * 1000, // 30 minutes
});
```

*Option B: Hand-roll byte counter* (no new dependency)
```typescript
let ttsCacheBytes = 0;
const TTS_CACHE_MAX_BYTES = 100 * 1024 * 1024;

// On insert: evict LRU entries until under limit
// On evict: subtract from ttsCacheBytes
```

Option A is simpler and handles TTL+LRU+byte-budget together. Option B keeps zero new dependencies. The `lru-cache` package is widely used and stable.

**Video cache note:** The video cache stores one Buffer per SceneId (keyed by scene type). Total scenes: limited set (tavern, combat, etc. from SCENE_PROMPTS). The bigger issue is the Buffer size itself — video should be served via S3 signed URLs (P3 item), not stored in Node memory. For P0, a 500MB hard cap with LRU eviction on the video cache is sufficient.

#### P1-1: Socket.IO Reject Unauthenticated in Production (criterion 5)

**Current:** `sockets/index.ts:95-109` — Socket.IO middleware calls `next()` for unauthenticated connections (allows them in). This is the `optionalAuth` pattern for sockets.

**Required:** In production, reject unauthenticated Socket.IO connections with `next(new Error("Authentication required"))`.

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    if (config.NODE_ENV === 'production') {
      return next(new Error("Authentication required"));
    }
    return next(); // Allow unauthenticated in dev
  }
  // ... jwt.verify ...
});
```

#### P1-2: inputSanitizer Expansion (criterion 6)

**Current:** `inputSanitizer.ts` strips `{{ }}` and `<| |>` patterns and ASCII control chars `\x00-\x08`.

**Required additions:**
1. Unicode control characters and zero-width chars
2. XML-like role confusion tags Claude interprets
3. `characterClass` and `pronouns` validated against allowlist (not just trimmed)

```typescript
// Expanded INJECTION_PATTERNS
const INJECTION_PATTERNS = /\{\{|\}\}|<\||>\||<\/?(?:system|human|assistant|prompt|instruction|context)[^>]*>/gi;

// Unicode control chars (full range, excluding tab/newline/CR)
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g;

// Zero-width and invisible chars
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;

// characterClass allowlist — matches client's ClassSelect IDs
export const VALID_CHARACTER_CLASSES = new Set([
  'fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'paladin'
]);

// pronouns allowlist — permissive, allow custom but strip injection
export function sanitizePronouns(pronouns: string): string | undefined {
  const clean = sanitizeUserInput(pronouns, 50);
  return clean || undefined;
}
```

**Note on characterClass in chat.ts:** Current code does `body.characterClass.trim()` only. Must change to: if present, must be in `VALID_CHARACTER_CLASSES`, else return 400.

**Note on characterClass in narrate.ts:** Same issue — must validate against allowlist.

#### P1-3: SSE Backpressure (criterion 7, M-15)

**Current:** `chat.ts:108-110` — `res.write()` return value is never checked. Node.js buffers writes silently when the client is slow.

**Required:** Check `res.write()` return value; if `false`, the write buffer is full — pause the Bedrock stream source, listen for `drain` event, then resume.

**Implementation approach:**
```typescript
// Replace direct res.write with a checked version
function writeSSE(res: Response, data: unknown): boolean {
  return res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// In the stream callback:
const canWrite = writeSSE(res, { text });
if (!canWrite) {
  // Backpressure: pause stream
  // Node's Writable stream emits 'drain' when buffer clears
  await new Promise<void>((resolve) => res.once('drain', resolve));
}
```

**Bedrock stream limitation:** `streamBedrockResponse` uses AWS SDK streaming which doesn't expose a Node.js Readable directly — the `onChunk` callback is called synchronously inside an async loop in `bedrock.ts`. Pausing requires introducing an async flag pattern in the callback.

**Practical implementation:**
```typescript
// Add backpressure flag to chunk handler
let backpressured = false;
const detector = createMoodStreamDetector(
  (mood) => { if (!clientDisconnected) writeSSE(res, { moodChange: mood }); },
  async (text) => {
    if (clientDisconnected) return;
    const ok = res.write(`data: ${JSON.stringify({ text })}\n\n`);
    if (!ok) {
      await new Promise<void>((resolve) => res.once('drain', resolve));
    }
  },
);
```

Note: The `moodStreamDetector` callback is synchronous currently. Making it async requires updating `createMoodStreamDetector`'s type signature. This is a medium-effort change.

#### P1-4: Conversation Store — Local Variable + Single Write (criterion 8)

**Current:** `chat.ts:70-75` calls `getOrCreate`, then `appendMessage` (user), then later `appendMessage` (assistant) — each goes through Redis. `_getFromRedis` does GET + EXPIRE separately = 8 round-trips.

**Required approach (conservative — matches P1 scope):** Hold the conversation object in a local variable; perform a single `getOrCreate` that loads from Redis once; do both `appendMessage` calls against the in-memory object; write to Redis once at the end.

This requires restructuring `conversationStore.ts` to expose a `withConversation(id, fn)` helper that loads once, applies mutations, and writes once:

```typescript
async withConversation<T>(id: string, fn: (conv: Conversation) => T): Promise<T> {
  const conv = await this._getFromRedis(id);
  if (!conv) throw new Error(`Conversation ${id} not found`);
  const result = fn(conv);
  await this._saveToRedis(conv);
  return result;
}
```

**Note on GETEX:** `redisClient.getEx(key, { EX: CONVERSATION_TTL_SECONDS })` combines GET + TTL refresh in one call (Redis 6.2+). This alone eliminates 1 round-trip per read. The current `redis` package (node-redis v4/v5) supports `GETEX` natively.

**Note:** Full migration to Redis Lists (C-4) is out of scope for P1 — the code review marks it "medium" effort and the phase success criteria only requires "chat route holds conversation in local variable, writes to Redis once." The withConversation pattern achieves this without a full data model restructure.

#### P1-5: JWT Access Token Expiry + Refresh Token Flow (criterion 9)

**Current:** `auth.ts:129` — `expiresIn: "7d"`. No refresh endpoint.

**Required:** Reduce to 15-minute access tokens + refresh token stored server-side. Refresh tokens need storage (Redis preferred) and a `/api/auth/refresh` endpoint.

```typescript
// Signing:
const accessToken = jwt.sign(payload, getJwtSecret(), { algorithm: "HS256", expiresIn: "15m" });
const refreshToken = crypto.randomBytes(32).toString('hex');

// Store refresh token in Redis with 7d TTL:
await redisClient.set(`refresh:${refreshToken}`, JSON.stringify({ userId, username }), { EX: 7 * 24 * 60 * 60 });

// POST /api/auth/refresh endpoint:
// - Accept { refreshToken }
// - Look up in Redis, return new accessToken
// - Rotate: delete old refresh token, issue new one
```

**Client impact:** With 15-minute expiry, the client must implement token refresh before expiry (or on 401 response). This pairs with criterion 3 (client auth headers) — both require the client auth infrastructure.

#### P1-6: Multiplayer TTS via S3 Signed URLs (criterion 10, C-3)

**Current:** `turnHandlers.ts:195-203` — `generateMultiVoiceTTS` returns a Buffer, which is base64-encoded and emitted via `io.to(roomCode).emit("dm:tts-ready", { audio: audioBuffer.toString("base64") })`. This inflates audio 33% and sends it through the Socket.IO + Redis adapter pipeline.

**Required:** Upload audio to S3 using existing `mediaCache.put()`, generate a presigned URL, emit the URL instead of the buffer.

```typescript
// Install: @aws-sdk/s3-request-presigner
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

// After TTS generation:
const key = `tts/multiplayer/${roomCode}-${Date.now()}.mp3`;
await s3Put(key, audioBuffer, 'audio/mpeg');
const url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
io.to(roomCode).emit("dm:tts-ready", { audioUrl: url });
```

**Client-side:** `useMultiplayerRoom.ts:177-192` currently handles `onDmTtsReady` with a blob. Must change to fetch the URL and create a blob.

**Constraint:** The S3 client is currently instantiated inside `mediaCache.ts`. For presigned URL generation, the same client instance can be reused — export it or pass a reference.

#### P1-7: Shared DmTurnService Extraction (criterion 11)

**Current:** `chat.ts` and `turnHandlers.ts` both independently call `getOrCreate`, `appendMessage`, `getWindowedHistory`, `queueBedrockCall`, `streamBedrockResponse`, `createMoodStreamDetector`, `buildLoreContext`, `sanitizeUserInput`. The two code paths differ primarily in whether they stream to SSE (HTTP) or to Socket.IO events.

**Required:** Extract a `DmTurnService` (or shared `dmTurn.ts` module) that encapsulates: conversation loading, lore context building, Bedrock streaming via queue, and response persistence. The two callers provide transport-specific callbacks.

```typescript
// server/src/services/dmTurn.ts
export interface DmTurnCallbacks {
  onText: (text: string) => void;
  onMoodChange: (mood: string) => void;
}

export async function executeDmTurn(
  conversationId: string,
  userMessage: { role: 'user'; content: string },
  callbacks: DmTurnCallbacks,
  options: { multiplayerPrompt?: string; characterClass?: string; pronouns?: string }
): Promise<{ fullText: string; mood?: string }> {
  // shared logic: getWindowedHistory, buildLoreContext, queueBedrockCall, streamBedrockResponse
}
```

**Scope note:** This is marked P1 (criterion 11). It is a refactor that does not change runtime behavior — only code organization. The planner should order this after security and performance fixes to avoid merge conflicts.

#### P1-8: `/api/usage` Requires Auth (criterion 12)

**Current:** `usage.ts:11` — `router.get("/api/usage", optionalAuth, ...)`. The route is open to unauthenticated callers.

**Required:** Change `optionalAuth` to `requireAuth` in usage.ts, and also apply `requireAuth` middleware in `app.ts` for the `/api/usage` path (consistent with how other protected routes are handled).

**Note:** `app.ts` currently has no `requireAuth` on `/api/usage`. Add it. The route handler also needs to cast `req` as `AuthenticatedRequest`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU cache with byte budget | Custom Map + manual eviction | `lru-cache` npm package | TTL + LRU + sizeCalculation + maxSize all built in |
| S3 presigned URL generation | Custom URL signing | `@aws-sdk/s3-request-presigner` `getSignedUrl` | AWS signature v4 is complex; official SDK handles it |
| Refresh token storage | Custom TTL map | Redis with `EX` flag | Already have Redis; `SET key value EX seconds` is atomic |
| GETEX combined GET+expire | Two separate calls | `redisClient.getEx(key, { EX: ttl })` | Already supported in node-redis v4/v5 |

**Key insight:** All libraries needed are either already installed or have minimal API surfaces. The hardest part of Phase 18 is client-side auth integration, which requires new UI state (login form), not new npm packages.

---

## Common Pitfalls

### Pitfall 1: IDOR Fix Breaks Existing Conversations

**What goes wrong:** Adding `userId` to the `Conversation` type means existing Redis-stored conversations (created before Phase 18) have no `userId` field. The ownership check `convo.userId !== userId` throws a false 403 for existing conversations.

**Why it happens:** Redis stores JSON blobs. Old blobs lack `userId`. JSON.parse gives `convo.userId = undefined`.

**How to avoid:** The ownership check must handle the migration case: if `convo.userId` is undefined (legacy conversation), allow access and set `convo.userId = userId` (claim ownership). Only enforce ownership when `convo.userId` is explicitly set.

```typescript
if (convo.userId && userId && convo.userId !== userId) {
  throw new ConversationOwnershipError(...);
}
if (!convo.userId && userId) {
  convo.userId = userId; // Claim legacy conversation
}
```

**Warning signs:** Test suite failures on `conversationStore.test.ts` that assume no `userId` field.

### Pitfall 2: Client Auth Integration Breaks Existing Fetch Calls

**What goes wrong:** Adding `Authorization: Bearer ${token}` to all fetch calls but the token is `null` before login — the header becomes `Authorization: Bearer null`.

**How to avoid:** The `authHeaders()` utility must return empty object `{}` when token is null (not `{ Authorization: "Bearer null" }`). Check `_token !== null` before constructing the header.

**Warning signs:** Server returns 401 for API calls that used to work.

### Pitfall 3: SSE Backpressure Makes `moodStreamDetector` Callbacks Async

**What goes wrong:** `createMoodStreamDetector` currently accepts synchronous callbacks. Making the `onText` callback async requires updating the type signature and every call site. If you return a Promise from a synchronous context, the await is missed.

**Why it happens:** The Bedrock streaming loop calls `detector(chunk)` as a sync function. Making this async requires `await detector(chunk)` throughout the call chain.

**How to avoid:** Either keep text callbacks sync (skip the drain wait, just check the return value and log when dropping), or carefully audit every `createMoodStreamDetector` call site and make the chain async. The conservative fix (log and continue without pausing) still satisfies criterion 7's intent to "check res.write() return."

**Warning signs:** TypeScript errors like "Type 'Promise<void>' is not assignable to type 'void'".

### Pitfall 4: `isSystemTrigger` Client Control (criterion 24, P2)

**What goes wrong:** `chat.ts:29` reads `body.isSystemTrigger` from the request body with `Boolean(body.isSystemTrigger)`. A malicious client can set this to `true` to prevent their messages from being stored in conversation history.

**How to avoid:** Remove `isSystemTrigger` from the publicly accepted body. The system trigger use case (narrate.ts calling chat) should be handled via a separate internal mechanism (a server-side flag, or direct Bedrock call without going through the chat route). For Phase 18 P2 scope: simply remove the field from the body parsing and hardcode `isSystemTrigger = false`.

**Warning signs:** The narrate route uses this implicitly through the `buildOpeningPrompt` pattern (separate Bedrock call), so removing it from chat.ts should not break narrate.ts.

### Pitfall 5: bcrypt Timing Attack Dummy Hash (L-36)

**What goes wrong:** `auth.ts:115` uses `await bcrypt.compare(password, "$2a$12$invalidhashfortimingnorm123456")`. The string `"$2a$12$invalidhashfortimingnorm123456"` is not a valid bcrypt hash — it's too short and will fail at different timing than a real hash comparison.

**How to avoid:** Pre-compute a valid bcrypt hash of a dummy password and hardcode that (60-char bcrypt string). The format is `$2b$12$<22-char-salt><31-char-hash>`. A valid dummy:

```typescript
const DUMMY_HASH = "$2b$12$eImiTXuWVxfM37uY4JANjQ.GCQPekzNaZMbLLCe6ib7TRF7bBm4TK";
await bcrypt.compare(password, DUMMY_HASH);
```

**Warning signs:** Username enumeration via timing differences — valid usernames return faster (real hash comparison) vs. invalid ones.

### Pitfall 6: lru-cache v10 vs v11 API Difference

**What goes wrong:** `lru-cache` v10 uses `maxSize`+`sizeCalculation`. Older versions used `max` (entry count). Mixing versions or using wrong API causes silent no-op (entries never evicted).

**How to avoid:** Pin to `^11.0.0` in package.json. Check the API: `maxSize` (bytes), `sizeCalculation: (value, key) => number`, `ttl` (ms), `allowStale: false`. Always use these fields for byte-budget eviction.

**Warning signs:** Cache grows without bound despite `maxSize` being set — check you're using `sizeCalculation` not just `max`.

### Pitfall 7: Redis GETEX Availability

**What goes wrong:** `GETEX` requires Redis 6.2+. If the deployment uses Redis 6.0 or 5.x, the command fails at runtime with `ERR unknown command 'GETEX'`.

**How to avoid:** The `redis` npm package v5.x supports `GETEX` on Redis 6.2+. Add a startup check or use the `GET` + `EXPIRE` fallback pattern if GETEX is unavailable. For this project, the current Redis version should be 6.2+ (the node-redis client was set up in Phase 09 and the code review recommended GETEX).

**Confidence:** MEDIUM — Redis version in actual deployment is unverified. Flag in plan as conditional.

### Pitfall 8: `withConversation` Pattern Introduces Write Amplification on Error

**What goes wrong:** `withConversation` loads, mutates, then saves. If the Bedrock call fails mid-stream (after the user message was appended to the in-memory object but before save), the user message is lost.

**How to avoid:** The save should happen in two steps: (1) save with user message immediately after `getOrCreate`, (2) save again with assistant message after stream completes. This means two writes total instead of 8, not one.

**Warning signs:** Conversation history missing user messages after a Bedrock error.

---

## Code Examples

Verified patterns from direct codebase inspection:

### GETEX in node-redis (node-redis v4/v5 API)

```typescript
// Source: node-redis v5 API (verified against installed package)
// Replaces: GET key + EXPIRE key ttl (2 round-trips)
const raw = await redisClient.getEx(redisKey(conversationId), {
  EX: CONVERSATION_TTL_SECONDS
});
if (!raw) return null;
return JSON.parse(raw) as Conversation;
```

### LRU Cache with Byte Budget (lru-cache v11)

```typescript
// Source: lru-cache npm package README (HIGH confidence)
import { LRUCache } from 'lru-cache';

const ttsCache = new LRUCache<string, TTSCacheEntry>({
  maxSize: 100 * 1024 * 1024, // 100MB total
  sizeCalculation: (entry) => entry.result.audioBuffer.byteLength,
  ttl: 30 * 60 * 1000,        // 30-minute TTL
  allowStale: false,
});

// Usage mirrors Map API:
ttsCache.set(key, entry);
const entry = ttsCache.get(key); // returns undefined on miss or expired
```

### S3 Presigned URL (AWS SDK v3)

```typescript
// Source: @aws-sdk/s3-request-presigner official docs
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const url = await getSignedUrl(
  s3Client,
  new GetObjectCommand({ Bucket: bucket, Key: key }),
  { expiresIn: 300 } // 5 minutes
);
```

### requireAuth on /api/usage in app.ts

```typescript
// Current: app.use(usageRouter) with no auth
// Required: add requireAuth before usageRouter
app.use("/api/usage", requireAuth);  // <-- add this
app.use(usageRouter);
```

### Random Dev JWT Secret

```typescript
// auth.ts
import crypto from "crypto";

// Generate once at module load — different per process restart (acceptable in dev)
const DEV_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  if (config.JWT_SECRET) return config.JWT_SECRET;
  if (config.NODE_ENV === "production") throw new Error("FATAL: JWT_SECRET required");
  if (!devSecretWarned) {
    console.warn("[auth] WARNING: Using random dev secret. Tokens invalidate on restart.");
    devSecretWarned = true;
  }
  return DEV_SECRET;
}
```

### Character Class Allowlist Validation

```typescript
// inputSanitizer.ts — add exported constant
export const VALID_CHARACTER_CLASSES = new Set([
  'fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'paladin'
]);

// chat.ts — replace current trim-only pattern
const rawClass = typeof body.characterClass === "string" ? body.characterClass.toLowerCase().trim() : undefined;
if (rawClass && !VALID_CHARACTER_CLASSES.has(rawClass)) {
  res.status(400).json({ error: "Invalid characterClass" });
  return;
}
const characterClass = rawClass;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GET + EXPIRE (2 Redis calls) | GETEX (1 Redis call) | Redis 6.2 (2021) | Halves read round-trips |
| Count-based cache eviction | Byte-budget LRU (lru-cache) | Widely adopted 2022+ | Prevents OOM at 1000 users |
| Base64 audio over WebSocket | S3 presigned URL + HTTP fetch | Industry standard | 33% smaller, CDN cacheable |
| Hardcoded dev secrets | Random per-restart secret | Security baseline | Reduces secret exposure |
| optionalAuth on all sockets | requireAuth in production | Phase 17 pattern | Enforces identity |

---

## Open Questions

1. **Client Login UI Scope**
   - What we know: Criterion 3 requires client to send `Authorization: Bearer token` on all API calls. The server returns a token on login. No login form exists in the client.
   - What's unclear: Is a minimal login/register form in scope for Phase 18, or should the phase focus on backend and assume the frontend token is injected via a known mechanism (e.g., localStorage or hardcoded for hackathon)?
   - Recommendation: Include a minimal login form in Phase 18. Without it, criterion 3 cannot be satisfied end-to-end. Keep the UI simple — username/password fields, submit button, store token in memory (`useRef` or context).

2. **Redis Version for GETEX**
   - What we know: `GETEX` requires Redis 6.2+. The project uses node-redis v5.
   - What's unclear: What Redis version is running in the deployment environment?
   - Recommendation: Implement GETEX with a fallback try/catch that falls back to GET+EXPIRE if the command is unknown. This provides the optimization when available and degrades gracefully.

3. **DmTurnService Extraction Scope**
   - What we know: Criterion 11 requires extracting a shared `DmTurnService` from `chat.ts` and `turnHandlers.ts`. These two files share ~60% of their logic.
   - What's unclear: Should the extraction include full SSE/Socket.IO transport abstraction, or just the Bedrock/conversation/lore orchestration?
   - Recommendation: Extract only the shared inner logic (conversation loading, lore, Bedrock call, persistence). Keep transport (SSE writes vs socket emits) in the callers. This is a pure refactor — no behavior change.

4. **S3 Client Export for Presigned URLs**
   - What we know: `mediaCache.ts` creates an `S3Client` internally but doesn't export it. Presigned URLs need the same client.
   - What's unclear: Should `s3` client be exported from `mediaCache.ts` or should `mediaCache.ts` export a `getPresignedUrl` helper?
   - Recommendation: Add `getPresignedUrl(key: string, expiresIn: number): Promise<string>` to `mediaCache.ts`. Keeps the S3 client encapsulated. Callers don't need to import `@aws-sdk/s3-request-presigner` directly.

5. **Zod Request Validation Scope (criterion 19)**
   - What we know: Criterion 19 requires "Zod request validation on route bodies." The project already uses Zod for config validation.
   - What's unclear: Should every route get a Zod schema, or just the highest-risk ones (chat, narrate)?
   - Recommendation: Add Zod schemas to chat.ts and narrate.ts route bodies. These are the P1 routes that accept user input most directly. The auth route bodies can be added in a P3 plan.

---

## Priority-Ordered Fix Map

Cross-referencing success criteria (P0-P3) with current code locations:

### P0 Fixes (criteria 1-4) — Must fix before any deployment

| Criterion | File(s) | Change |
|-----------|---------|--------|
| 1: IDOR 403 | `conversationStore.ts`, `chat.ts` | Add `userId` to Conversation type; check ownership in getOrCreate; 403 on mismatch |
| 2: Random dev JWT secret | `middleware/auth.ts` | Replace hardcoded string with `crypto.randomBytes(32).toString('hex')` |
| 3: Client sends Bearer token | `useSSEChat.ts`, `AudioPlayer.tsx`, `socket.ts`, NEW `client/src/services/auth.ts`, NEW login form | Auth header utility + login UI |
| 4: Cache byte limits | `tts.ts`, `videoGenerator.ts`, `musicService.ts` | Replace `Map` with `LRUCache` (lru-cache) with maxSize |

### P1 Fixes (criteria 5-12) — Fix before scale to 1000 users

| Criterion | File(s) | Change |
|-----------|---------|--------|
| 5: Socket.IO prod auth | `sockets/index.ts` | Reject unauthenticated in production |
| 6: inputSanitizer unicode + allowlist | `inputSanitizer.ts`, `chat.ts`, `narrate.ts` | Expand patterns; validate characterClass/pronouns |
| 7: SSE backpressure | `chat.ts` | Check `res.write()` return; await drain |
| 8: Redis round-trips | `conversationStore.ts`, `chat.ts` | GETEX + local variable pattern |
| 9: JWT refresh tokens | `routes/auth.ts`, NEW `/api/auth/refresh` | 15m access + 7d refresh token flow |
| 10: Multiplayer TTS S3 URLs | `sockets/turnHandlers.ts`, `mediaCache.ts`, `useMultiplayerRoom.ts` | S3 put + presigned URL emit |
| 11: DmTurnService extraction | NEW `services/dmTurn.ts`, `routes/chat.ts`, `sockets/turnHandlers.ts` | Extract shared Bedrock/conversation logic |
| 12: Usage auth | `routes/usage.ts`, `app.ts` | requireAuth on `/api/usage` |

### P2 Fixes (criteria 13-28) — Fix before scale

| Criterion | File(s) | Change |
|-----------|---------|--------|
| 13: Shared CharacterClass enums | `packages/shared-types/src/player.ts`, `client/src/types/multiplayer.ts`, `client/src/components/ClassSelect.tsx` | Move to shared-types; remove client duplicates |
| 14: Per-username lockout | `routes/auth.ts` | Redis counter `login-attempts:{username}` with TTL |
| 15: Trust proxy | `app.ts` | `app.set('trust proxy', 1)` |
| 16: In-memory fallback withLock | `conversationStore.ts` | Wrap in-memory fallback reads with mutex |
| 17: Narrate 60s timeout | `routes/narrate.ts` | `AbortController` with 60s timeout |
| 18: Graceful shutdown drain SSE | `index.ts` | Track active SSE res objects; call `.end()` on SIGTERM |
| 19: Zod validation on route bodies | `routes/chat.ts`, `routes/narrate.ts` | Add Zod schemas |
| 20: Standardize /api/ prefix | `routes/narrate.ts`, `routes/music.ts`, `routes/sceneVideo.ts`, `app.ts` | Remove non-/api/ paths |
| 21: MessageBubble React.memo | `components/MessageBubble.tsx` | Wrap in memo; useMemo for content |
| 22: TTS Object URL cleanup | `hooks/useMultiplayerRoom.ts` | Revoke all URLs on unmount |
| 23: React.lazy code splitting | `App.tsx` | Lazy load MultiplayerGame, MultiplayerLobby |
| 24: isSystemTrigger removal | `routes/chat.ts` | Remove from accepted body |
| 25: Bedrock queue 15s wait | `services/bedrockQueue.ts` | `timeout` option in PQueue |
| 26: Zod validate Redis JSON | `conversationStore.ts` | Parse with Zod schema after JSON.parse |
| 27: Password complexity | `routes/auth.ts` | Regex check (upper + lower + digit) |
| 28: Large video via S3 | `routes/sceneVideo.ts`, `services/videoGenerator.ts` | Signed URL instead of Buffer |

### P3 Fixes (criteria 29-42) — Cleanup

| Criterion | File(s) | Change |
|-----------|---------|--------|
| 29: logEvent everywhere | `sockets/*.ts` | Replace console.log with logEvent |
| 30: UUID regex shared | `routes/chat.ts`, `routes/narrate.ts` | Extract to shared util |
| 31: Generic TieredCache<T> | `services/tts.ts`, `services/videoGenerator.ts`, `services/musicService.ts` | Unified cache abstraction |
| 32: Remove _deps param | `app.ts` | Remove `_deps: AppDeps` parameter |
| 33: Remove tsyringe | `server/package.json` | `yarn remove tsyringe reflect-metadata` |
| 34: Single lockfile | Root `package.json` | Standardize on yarn |
| 35: .gitignore tsbuildinfo | `.gitignore` | Add `*.tsbuildinfo` |
| 36: bcrypt dummy hash | `routes/auth.ts` | Use valid pre-computed hash |
| 37: HSTS via Helmet | `middleware/security.ts` | `hsts: { maxAge: 31536000 }` |
| 38: CSP for WebSocket + blobs | `middleware/security.ts` | Add `ws:`, `wss:`, `blob:` to CSP |
| 39: DM_SYSTEM_PROMPT to file | `services/promptBuilder.ts` | Move to `content/systemPrompt.ts` |
| 40: Remove _testInternals | `services/usageTracker.ts` | Gate behind `NODE_ENV === "test"` |
| 41: Client test infra | `client/` | Add Vitest + Testing Library |
| 42: Socket rate limiter O(1) | `sockets/index.ts` | Counter + timestamp instead of splice |

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all modified files — findings grounded in actual code at commit `adefe13`
- `docs/CODE_REVIEW_2026-02-22.md` — the 4-agent review document (current, 2026-02-22)
- `server/src/app.ts`, `middleware/auth.ts`, `routes/chat.ts`, `routes/narrate.ts`, `routes/usage.ts` — Phase 17 output verified
- `server/src/services/conversationStore.ts`, `inputSanitizer.ts`, `mediaCache.ts`, `tts.ts`, `videoGenerator.ts`, `musicService.ts` — inspected directly
- `server/src/sockets/index.ts`, `turnHandlers.ts` — inspected directly
- `client/src/hooks/useSSEChat.ts`, `AudioPlayer.tsx`, `App.tsx` — inspected for missing auth headers

### Secondary (MEDIUM confidence)
- node-redis v5 `GETEX` support: verified against node-redis GitHub (supports Redis 6.2+ `GETEX`)
- lru-cache v11 API (`maxSize`, `sizeCalculation`): verified against npm package README
- `@aws-sdk/s3-request-presigner` `getSignedUrl`: standard AWS SDK v3 pattern; package not yet installed

### Tertiary (LOW confidence)
- Redis 6.2 availability in deployment — not verified; GETEX should be conditional
- lru-cache v11 ESM compatibility with project's `"type": "module"` — likely fine but unverified

---

## Metadata

**Confidence breakdown:**
- Security fixes (IDOR, dev secret, sanitizer): HIGH — code inspected, patterns clear
- Client auth integration: MEDIUM — patterns clear, but login UI scope needs planning decision
- Cache byte limits: HIGH — lru-cache API is standard; direct replacement of Map
- Redis GETEX optimization: MEDIUM — API verified, Redis version in deployment unverified
- SSE backpressure: MEDIUM — approach is correct; async callback chain requires careful implementation
- DmTurnService extraction: HIGH — pure refactor, scope is clear
- S3 presigned URLs: HIGH — existing mediaCache.ts pattern; presigner SDK standard

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days; all libraries are stable)
