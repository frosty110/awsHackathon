# Comprehensive Code Review Report: AI Dungeon Master

**Codebase**: ~12K lines | Node.js/Express + React | AWS Bedrock, Neo4j, MiniMax TTS, Socket.IO
**Date**: 2026-02-22
**Reviewers**: 4 parallel agents (Security, Code Quality, Architecture, Performance)

---

## Executive Summary

The codebase shows strong security awareness (helmet, CORS, bcrypt, Zod config validation, parameterized Neo4j queries) and thoughtful architecture (streaming SSE, multi-tier TTS caching, graceful degradation for Neo4j/Redis failures). However, the review identified **significant issues that must be addressed before production deployment at 1000 users**.

After deduplication across all four reviews: **~80 unique findings**.

### Severity Distribution (deduplicated)

| Severity | Count | Examples |
|----------|-------|---------|
| **CRITICAL** | 5 | Auth never enforced, room state not scalable, TTS audio via WebSocket, conversation lock not distributed, race conditions |
| **HIGH** | 12 | JWT algorithm confusion, socket auth bypass, no circuit breakers, missing input validation, memory leaks |
| **MEDIUM** | 25 | Prompt injection gaps, Neo4j timeouts, Redis reconnection, markdown re-rendering jank, queue thresholds |
| **LOW** | 18 | Dead code, magic numbers, stale timestamps, bcryptjs blocking |

---

## Table of Contents

- [Critical Findings](#critical-findings)
- [High Findings](#high-findings)
- [Medium Findings](#medium-findings)
  - [Security & Input Validation](#security--input-validation)
  - [Performance & Scalability](#performance--scalability)
  - [Architecture & Operations](#architecture--operations)
- [Low Findings](#low-findings)
- [Positive Findings (Commendations)](#positive-findings-commendations)
- [Recommended Fix Priority](#recommended-fix-priority)

---

## Critical Findings

### C-1: Authentication Middleware Never Enforced

| Field | Value |
|-------|-------|
| **File** | `server/src/app.ts` |
| **Category** | Security |
| **CWE** | CWE-306 (Missing Authentication for Critical Function) |
| **Effort** | easy |

`requireAuth` exists in `server/src/middleware/auth.ts:36` but is **never applied** to any route. All endpoints (`/api/chat`, `/api/narrate`, `/api/music`, etc.) are accessible without authentication. The only auth middleware in use is `optionalAuth`, applied globally in `app.ts:32`, which explicitly does not reject unauthenticated requests. Rate limiting falls back to IP-based keying, which is trivially bypassed via IP rotation or proxies.

**Impact**: Any anonymous user can consume Bedrock inference and TTS credits (direct cost attack), create unlimited conversations, and access the full game API.

**Fix**: Apply `requireAuth` to all game endpoints:

```typescript
import { requireAuth } from "./middleware/auth.js";

app.use("/api/chat", requireAuth, chatRateLimiter);
app.use("/api/narrate", requireAuth, narrateRateLimiter);
app.use("/api/music", requireAuth, musicLimiter);
app.use("/api/scene-video", requireAuth);
```

---

### C-2: Room State is Purely In-Memory -- No Horizontal Scaling

| Field | Value |
|-------|-------|
| **File** | `server/src/services/roomStore.ts` |
| **Category** | Architecture / Scalability |
| **Effort** | hard |

`InMemoryRoomStore` stores all rooms in a local `Map`. With Socket.IO's Redis adapter, socket events are broadcast across instances, but room state is not. Two server instances behind a load balancer cannot share room state. Timer handles (`setTimeout`) are local and cannot survive process restarts. At 1000 concurrent users with multiplayer rooms, this is a showstopper for horizontal scaling.

**Fix**: Implement `RedisRoomStore implements IRoomStore` that stores room state as Redis hashes. Replace `setTimeout`-based timers with Redis key expiry + pub/sub notifications. Alternatively, if single-instance is the target for the current milestone, document this limitation explicitly and add a startup guard that prevents multiple instances.

---

### C-3: TTS Audio Broadcast via Socket.IO as Base64

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/turnHandlers.ts:196-204, 286-294` |
| **Category** | Architecture / Performance |
| **Effort** | medium |

DM narration audio (500KB-2MB) is base64-encoded (+33%) and broadcast to all room members via Socket.IO. At 250 rooms of 4 players each, a single DM turn could generate 250 x 2MB x 1.33 = ~665MB of data flowing through the Socket.IO + Redis pipeline.

**Fix**: Upload audio to S3 (using existing `mediaCache.put()`), emit only the URL via Socket.IO. Clients fetch audio via HTTP, benefiting from CDN caching and chunked transfer.

---

### C-4: Conversation Store Lock is Process-Local, Not Distributed

| Field | Value |
|-------|-------|
| **File** | `server/src/services/conversationStore.ts:41-53` |
| **Category** | Architecture / Concurrency |
| **CWE** | CWE-362 (Race Condition) |
| **Effort** | medium |

The `withLock` method uses an in-process `Map<string, Promise<void>>` for per-conversation locking. Multiple instances or concurrent requests during Redis round-trips can read the same conversation state, both append, and one overwrites the other's message. Additionally, the split-brain fallback pattern (catching Redis errors and falling through to in-memory) creates divergent state.

**Fix**: Switch to Redis Lists (`RPUSH` for atomic append, `LRANGE` for windowed read) which eliminates the need for locking entirely. Store conversation metadata in a separate Redis hash.

---

### C-5: Race Condition on Concurrent Chat Requests Per Conversation

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/chat.ts:70-76` |
| **Category** | Code Quality / Concurrency |
| **Effort** | medium |

Two simultaneous requests for the same `conversationId` can interleave `appendMessage` calls, both reading the same history, both calling Bedrock, and both appending responses -- resulting in duplicated or interleaved conversation entries due to the JSON blob read-modify-write pattern.

**Fix**: Same as C-4 -- use Redis Lists for atomic operations, or add a per-conversationId mutex at the route level.

---

## High Findings

### H-1: JWT Signed Without Algorithm Restriction

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/auth.ts:126-129`, `server/src/middleware/auth.ts:49` |
| **Category** | Security |
| **CWE** | CWE-327 (Use of a Broken or Risky Cryptographic Algorithm) |
| **Effort** | trivial |

JWT tokens are signed without specifying an explicit algorithm. `jwt.verify()` without an `algorithms` option will accept any algorithm the token claims, enabling algorithm confusion attacks.

**Fix**:

```typescript
// Signing
jwt.sign(payload, getJwtSecret(), { algorithm: "HS256", expiresIn: "7d" });

// Verification (BOTH requireAuth and optionalAuth)
jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
```

---

### H-2: Socket.IO `skipMiddlewares: true` Bypasses JWT on Reconnection

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/index.ts:77` |
| **Category** | Security |
| **CWE** | CWE-287 (Improper Authentication) |
| **Effort** | trivial |

The Socket.IO connection state recovery sets `skipMiddlewares: true`. When a socket reconnects within the 2-minute window, the JWT authentication middleware is completely skipped. If a user's token is revoked or expires during this window, the reconnected socket continues operating with stale authentication state.

**Fix**: Set `skipMiddlewares: false`.

---

### H-3: `dice:roll` Event Broadcasts Unvalidated Arbitrary Data to Room

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/chatHandlers.ts:61-71` |
| **Category** | Security / Input Validation |
| **CWE** | CWE-20 (Improper Input Validation) |
| **Effort** | trivial |

The `dice:roll` handler accepts `{ result }` from the client and broadcasts it to all room members without any type checking, range validation, or sanitization. A malicious client can send arbitrary objects, XSS payloads, or huge payloads as `result`.

**Fix**:

```typescript
socket.on("dice:roll", ({ result }) => {
  if (typeof result !== "number" || !Number.isInteger(result) || result < 1 || result > 20) return;
  // ...rest of handler
});
```

---

### H-4: Emoji Allowlist Mismatch -- All Reactions Silently Dropped

| Field | Value |
|-------|-------|
| **Files** | `server/src/sockets/chatHandlers.ts:9`, `client/src/components/PlayerChat.tsx:6-13` |
| **Category** | Bug |
| **Effort** | trivial |

The server's `ALLOWED_EMOJIS` set contains string IDs like `"thumbs_up"`, `"skull"`, etc. The client sends actual Unicode emoji characters like `'👍'`, `'💀'`. Since these never match, **ALL reactions are silently dropped by the server**. Additionally, `messageId` format is not validated.

**Fix**: Either change the server to accept Unicode emoji characters, or change the client to send ID strings:

```typescript
// Server fix:
const ALLOWED_EMOJIS = new Set(["👍", "💀", "🔥", "⚔️", "✨", "😂"]);
```

---

### H-5: No Circuit Breakers for External Services

| Field | Value |
|-------|-------|
| **Files** | `server/src/services/bedrock.ts`, `server/src/services/tts.ts`, `server/src/services/musicService.ts` |
| **Category** | Resilience |
| **Effort** | medium |

When Bedrock, MiniMax TTS, or MiniMax Music APIs experience an outage, every user request still attempts the call, waits for the timeout (30-90 seconds), then fails. With 1000 users, this means 1000 simultaneous failing requests eating queue slots and connections.

**Fix**: Implement a circuit breaker (`cockatiel` or `opossum` library) for each external service. After N consecutive failures within a time window, the circuit opens and immediately returns a degraded response.

---

### H-6: No Conversation Ownership Check

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/chat.ts:70` |
| **Category** | Security / Authorization |
| **Effort** | medium |

Any client can send a `conversationId` and append messages to any conversation. There is no check that the requesting user owns or is a participant in that conversation.

**Fix**: Associate conversations with a `userId` on creation. Verify ownership on every `appendMessage` and `getWindowedHistory` call.

---

### H-7: Graceful Shutdown Incomplete

| Field | Value |
|-------|-------|
| **File** | `server/src/index.ts:90-97` |
| **Category** | Operations |
| **Effort** | easy |

The shutdown handler closes the HTTP server and Neo4j driver but does not close Redis, Socket.IO, or drain active SSE streams. WebSocket clients experience abrupt disconnections.

**Fix**:

```typescript
const shutdown = async (signal: string) => {
    io.close();
    server.close();
    if (driver) await driver.close();
    if (isRedisAvailable()) await redisClient.quit();
    process.exit(0);
};
```

---

### H-8: `response.Body!` Force-Unwrap Crashes on Empty S3 Response

| Field | Value |
|-------|-------|
| **File** | `server/src/services/mediaCache.ts:43` |
| **Category** | Bug |
| **Effort** | trivial |

`response.Body!.transformToByteArray()` uses the non-null assertion. If S3 returns `undefined` Body, this throws an unhandled TypeError.

**Fix**:

```typescript
if (!response.Body) {
    span?.setTag("cache.result", "miss");
    return null;
}
const bytes = await response.Body.transformToByteArray();
```

---

### H-9: Unhandled Promise After `res.end()` in Chat Route

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/chat.ts:177-186` |
| **Category** | Bug / Error Handling |
| **Effort** | trivial |

After `res.end()`, the route continues with `await appendMessage(...)`. If this throws, the error is unhandled since Express has already sent the response.

**Fix**: Wrap in try/catch:

```typescript
if (fullText) {
    try {
        await appendMessage(conversation.id, { role: "assistant", content: stripTTSTags(expandPhrases(fullText)) });
    } catch (err) {
        logEvent("error", "chat.persist_assistant_failed", { conversationId: conversation.id }, err);
    }
}
```

---

### H-10: No Guard Against Concurrent DM Invocations

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/turnHandlers.ts:140, 227` |
| **Category** | Code Quality / Race Condition |
| **Effort** | easy |

`triggerDMOpening` and `triggerDMResponse` can be invoked concurrently if the timer fires and `allActionsSubmitted` returns true at nearly the same time. The `room.phase` check is not atomic.

**Fix**: Add an idempotency guard:

```typescript
if (!room || room.phase === "dm-responding") return;
room.phase = "dm-responding";
```

---

### H-11: In-Memory TTS/Video/Music Caches Unbounded Memory

| Field | Value |
|-------|-------|
| **Files** | `server/src/services/tts.ts:62-64`, `server/src/services/videoGenerator.ts:214`, `server/src/services/musicService.ts:175` |
| **Category** | Performance / Memory |
| **Effort** | easy (TTS), medium (video/music) |

TTS cache stores raw audio Buffers (10-40MB at 200 entries). Video cache stores 5-20MB buffers per scene (up to 540MB for all scenes). Music cache stores 500KB-2MB per track. No byte-size-based eviction exists for any of these.

**Fix**: Cap caches by total byte size (e.g., 100MB total for all media). Use LRU eviction. Serve media via S3/CDN presigned URLs instead of buffering in Node.js.

---

### H-12: Socket.IO Events Have Zero Structured Logging

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/*.ts` |
| **Category** | Observability |
| **Effort** | medium |

HTTP routes have structured logging, request IDs, and Datadog traces. Socket.IO events have only scattered `console.log` statements. At 1000 users, diagnosing multiplayer issues without telemetry will be extremely difficult.

**Fix**: Add `logEvent()` calls to all socket event handlers. Include `roomCode`, `socketId`, `userId`, and event name in each log entry.

---

### H-13: Room Deletion During Active DM Streaming

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/roomHandlers.ts:267-270` |
| **Category** | Code Quality / Resource Management |
| **Effort** | easy |

If all players disconnect during `dm-responding` phase, the room is deleted but `triggerDMResponse` still holds a reference and continues writing to a dangling object. The 3-second timer and TTS generation continue wasting resources.

**Fix**: Clear pending timers and abort Bedrock streaming when a room is deleted.

---

### H-14: Recursive Polling Creates Deep Promise Chains

| Field | Value |
|-------|-------|
| **Files** | `client/src/services/sceneVideo.ts:49-109`, `client/src/services/backgroundMusic.ts:86-153` |
| **Category** | Code Quality |
| **Effort** | easy |

Both `fetchSceneVideo` and `fetchMoodAudio` use recursive `setTimeout` polling. With flaky servers, retry + poll counters interact to create up to `MAX_RETRIES * MAX_POLLS` requests.

**Fix**: Convert to iterative async loops.

---

### H-15: Narrate Route Missing Input Sanitization

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/narrate.ts:28` |
| **Category** | Security / Input Validation |
| **Effort** | trivial |

The `chat` route runs `sanitizeUserInput()` but the `narrate` route uses `req.body.text` directly without sanitization or length limit.

**Fix**: `const textInput = sanitizeUserInput(typeof req.body?.text === "string" ? req.body.text : "", 5000);`

---

### H-16: Conversation Store: 8 Redis Round-Trips Per Chat Turn

| Field | Value |
|-------|-------|
| **File** | `server/src/services/conversationStore.ts:168-173` |
| **Category** | Performance |
| **Effort** | easy |

Every `_getFromRedis` performs `GET` + `EXPIRE` sequentially. A single chat turn executes `getWindowedHistory` (GET+EXPIRE) + two `appendMessage` calls (GET+EXPIRE+SET each) = 8 Redis round-trips.

**Fix**: Use `GETEX` (Redis 6.2+) to combine GET + TTL refresh in one command. Better yet, switch to Redis Lists per C-4.

---

### H-17: Markdown Re-Parsed on Every Stream Chunk (50x per response)

| Field | Value |
|-------|-------|
| **File** | `client/src/components/MultiplayerGame.tsx:138-145` |
| **Category** | Performance / Client |
| **Effort** | medium |

Streaming DM message renders `<Markdown>{currentStreamText}</Markdown>` on every `dm:chunk` event. Each chunk triggers a full re-parse of the entire accumulated markdown string. On mobile, 50 re-renders with progressively longer strings causes visible jank.

**Fix**: Debounce markdown rendering (every 100ms), or render streaming text as plain text and apply markdown only once streaming completes.

---

## Medium Findings

### Security & Input Validation

#### M-1: Incomplete Prompt Injection Sanitization

| Field | Value |
|-------|-------|
| **File** | `server/src/services/inputSanitizer.ts:7-24` |
| **CWE** | CWE-77 |
| **Effort** | easy |

The sanitizer strips `{{ }}` and `<| |>` template markers but does not address XML-like tags Claude may interpret (`<system>`, `<human>`), role confusion patterns (`Assistant:`), or Unicode homoglyphs.

**Fix**: Expand patterns:

```typescript
const INJECTION_PATTERNS = /\{\{|\}\}|<\||>\||<\/?(?:system|human|assistant|prompt|instruction)[^>]*>/gi;
```

---

#### M-2: `characterClass` and `pronouns` Not Sanitized Before Prompt Injection

| Field | Value |
|-------|-------|
| **Files** | `server/src/routes/chat.ts:38-39`, `server/src/services/bedrock.ts:51-53` |
| **CWE** | CWE-77 |
| **Effort** | easy |

These fields are trimmed but not sanitized before direct interpolation into the system prompt. An attacker can set `characterClass` to a prompt injection payload.

**Fix**: Validate against an allowlist:

```typescript
const VALID_CLASSES = new Set(["warrior", "mage", "rogue", "cleric", "ranger", "bard"]);
```

---

#### M-3: Weak Password Policy

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/auth.ts:35` |
| **CWE** | CWE-521 |
| **Effort** | trivial |

Registration only requires 6 characters with no complexity requirements, no upper length limit, no common password check.

**Fix**: `if (typeof password !== "string" || password.length < 8 || password.length > 128)`

---

#### M-4: JWT 7-Day Lifetime Without Refresh/Rotation

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/auth.ts:129` |
| **CWE** | CWE-613 |
| **Effort** | medium |

Tokens expire after 7 days with no refresh mechanism, no revocation capability, and no sliding window renewal.

**Fix**: Reduce to 15-30 minute access tokens, implement refresh token flow with server-side storage.

---

#### M-5: No Per-Username Account Lockout

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/auth.ts:87-138` |
| **CWE** | CWE-307 |
| **Effort** | easy |

Login rate limiting is IP-keyed only. Distributed attacks across multiple IPs can brute-force a single username.

**Fix**: Track failed attempts per username in Redis with exponential backoff.

---

#### M-6: Health Endpoint Leaks Server Uptime

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/health.ts:9` |
| **CWE** | CWE-200 |
| **Effort** | trivial |

`process.uptime()` is exposed publicly, revealing patching/deployment schedules.

**Fix**: Remove `uptime` from the public response.

---

#### M-7: `x-request-id` Header Accepted Without Sanitization -- Log Injection

| Field | Value |
|-------|-------|
| **File** | `server/src/services/logger.ts:71-74` |
| **CWE** | CWE-117 |
| **Effort** | trivial |

Client-provided `x-request-id` is used directly in logs without format/length validation.

**Fix**:

```typescript
const REQUEST_ID_RE = /^[a-zA-Z0-9\-_]{1,128}$/;
return trimmed && REQUEST_ID_RE.test(trimmed) ? trimmed : crypto.randomUUID();
```

---

#### M-8: Narrate Endpoint Doesn't Validate `conversationId` Format

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/narrate.ts:29` |
| **CWE** | CWE-20 |
| **Effort** | trivial |

The chat endpoint validates `conversationId` against a UUID regex, but the narrate endpoint accepts any string.

**Fix**: Apply the same UUID validation as the chat endpoint.

---

### Performance & Scalability

#### M-9: Bedrock Queue Overload Threshold Too High (100 pending)

| Field | Value |
|-------|-------|
| **File** | `server/src/services/bedrockQueue.ts:27` |
| **Effort** | trivial |

At 100 pending with concurrency 20, the last queued user waits 60+ seconds. The 503 only fires at position 101+.

**Fix**: Lower threshold to 40-60 (2-3x concurrency). Add per-request queue timeout.

---

#### M-10: No Concurrency Limit on MiniMax TTS API Calls

| Field | Value |
|-------|-------|
| **File** | `server/src/services/tts.ts:178-203, 292-316` |
| **Effort** | easy |

Unlike Bedrock, TTS API calls have no `PQueue`. Cold caches with 1000 users could fire hundreds of simultaneous MiniMax calls.

**Fix**: Add `PQueue` with concurrency 10-20 for MiniMax calls.

---

#### M-11: Neo4j Query Uses Label-Agnostic `MATCH (n)` -- Full Scan

| Field | Value |
|-------|-------|
| **File** | `server/src/services/neo4j.ts:25-32` |
| **Effort** | easy |

`MATCH (n) WHERE n.name IN $entities` scans all nodes. Adding a label enables index usage.

**Fix**: `MATCH (n:Entity) WHERE n.name IN $entities` + `CREATE INDEX FOR (n:Entity) ON (n.name)`.

---

#### M-12: No Neo4j Query Timeout

| Field | Value |
|-------|-------|
| **File** | `server/src/services/neo4j.ts:25` |
| **Effort** | trivial |

A hung Neo4j query blocks the RAG pipeline indefinitely until the 45-second Bedrock timeout fires.

**Fix**: `driver.executeQuery(query, params, { timeout: 5000 })`

---

#### M-13: ImageBitmap Frame Capture Unbounded (~525MB per video)

| Field | Value |
|-------|-------|
| **File** | `client/src/components/SceneBackground.tsx:31-46` |
| **Effort** | easy |

`usePingPong` captures every frame at 30fps as `ImageBitmap`. A 5-second 720p video = ~150 frames x 3.5MB = 525MB.

**Fix**: Cap at 60 frames, skip every other frame, or reduce capture resolution.

---

#### M-14: PlayerChat Re-Renders All Messages on Every New Message

| Field | Value |
|-------|-------|
| **File** | `client/src/components/PlayerChat.tsx:103-193` |
| **Effort** | easy |

Every new message triggers full re-render of all messages plus reaction grouping recalculation for each.

**Fix**: Extract `React.memo`-wrapped `ChatMessageItem`. Memoize reaction grouping with `useMemo`.

---

#### M-15: No SSE Backpressure Handling for Slow Clients

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/chat.ts:91-101` |
| **Effort** | medium |

`res.write()` return value is never checked. Slow clients cause unbounded buffering in Node.js writable stream.

**Fix**: Check `res.write()` return value; pause Bedrock stream on `false`, resume on `drain` event.

---

#### M-16: Base64 Audio via WebSocket Doubles Memory

| Field | Value |
|-------|-------|
| **File** | `server/src/sockets/turnHandlers.ts:197-200` |
| **Effort** | medium |

Overlaps with C-3. Base64 encoding inflates audio by 33%, multiplied by all room members.

**Fix**: Use Socket.IO binary transport or S3 URLs (see C-3).

---

### Architecture & Operations

#### M-17: Redis Reconnection Not Handled

| Field | Value |
|-------|-------|
| **File** | `server/src/services/redis.ts` |
| **Effort** | easy |

The `"end"` handler sets `redisEnabled = false` permanently. The `"ready"` handler exists but the system doesn't recover after a transient disconnect.

**Fix**: Listen for `"ready"` after reconnection and re-enable `redisEnabled = true`.

---

#### M-18: Zod Config Accepts Empty Strings for Secrets in Production

| Field | Value |
|-------|-------|
| **File** | `server/src/services/config.ts:31-64` |
| **Effort** | easy |

`z.string()` accepts empty strings for `JWT_SECRET`, API keys, etc. Failures only surface at runtime.

**Fix**: Add `.min(1)` for critical keys in production, or add a startup check that fails fast.

---

#### M-19: No Deep Health Check

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/health.ts` |
| **Effort** | easy |

Health check returns `ok` unconditionally. A load balancer would route traffic to an instance with no Redis or Neo4j.

**Fix**: Add `/api/health/deep` that checks Redis ping, Neo4j connectivity, and Bedrock queue depth.

---

#### M-20: No Metrics for Active Connections or Room Count

| Field | Value |
|-------|-------|
| **Files** | `server/src/sockets/index.ts`, `server/src/services/roomStore.ts` |
| **Effort** | easy |

No DogStatsD gauges for active WebSocket connections, rooms, players, or queue depth. Capacity planning for 1000 users is guesswork.

**Fix**: Emit periodic gauge metrics every 10 seconds.

---

#### M-21: Shared Types Package Not in Build Chain

| Field | Value |
|-------|-------|
| **File** | `package.json:11` |
| **Effort** | trivial |

Root `build` script doesn't build `@ai-dm/shared-types` first. Stale `dist/` causes build failures.

**Fix**: `npm run build -w packages/shared-types && npm run build -w client && npm run build -w server`

---

#### M-22: Rate Limiter Stores Created Before Redis Connects

| Field | Value |
|-------|-------|
| **File** | `server/src/middleware/rateLimiter.ts:11-19` |
| **Effort** | easy |

`createStore(prefix)` runs at module import time when `isRedisAvailable()` is always `false`. Rate limiters always use MemoryStore.

**Fix**: Defer store creation until after `connectRedis()` resolves.

---

#### M-23: `setState` During Render in SceneBackground

| Field | Value |
|-------|-------|
| **File** | `client/src/components/SceneBackground.tsx:152-159` |
| **Effort** | easy |

`setIncomingUrl` and `setIncomingReady` called inside the render body, which is a React anti-pattern.

**Fix**: Move logic into a `useEffect`.

---

#### M-24: Object URLs for TTS Audio Never Revoked in Multiplayer

| Field | Value |
|-------|-------|
| **File** | `client/src/hooks/useMultiplayerRoom.ts:177-192` |
| **Effort** | easy |

`URL.createObjectURL(blob)` in `onDmTtsReady` is only revoked on audio `ended` event. If audio is never played, URLs leak.

**Fix**: Track URLs in a ref and revoke all on component unmount.

---

#### M-25: `replayMessageAudio` Stale Closure -- New Function on Every Message

| Field | Value |
|-------|-------|
| **File** | `client/src/hooks/useSSEChat.ts:48-54` |
| **Effort** | trivial |

`useCallback` with `[messages]` dependency creates a new function on every message update, defeating memoization and causing downstream re-renders.

**Fix**: Use a ref for messages and an empty dependency array.

---

#### M-26: Unsafe `as Promise<T>` Cast in BedrockQueue

| Field | Value |
|-------|-------|
| **File** | `server/src/services/bedrockQueue.ts:18` |
| **Effort** | trivial |

`PQueue.add()` returns `Promise<T | void>`. The cast suppresses TypeScript errors but could yield `undefined`.

**Fix**: `const result = await bedrockQueue.add(fn); if (result === undefined) throw new Error(...);`

---

#### M-27: Non-Null Assertion on `multiplayerRoomCode!`

| Field | Value |
|-------|-------|
| **File** | `client/src/App.tsx:170` |
| **Effort** | trivial |

If `appState` becomes `'multiplayerGame'` before `multiplayerRoomCode` is set, this passes `null` silently.

**Fix**: Add a guard: `appState === 'multiplayerGame' && multiplayerRoomCode ? <MultiplayerGame ... /> : null`

---

#### M-28: Missing `try/catch` Around `getOrCreate` in Chat Route

| Field | Value |
|-------|-------|
| **File** | `server/src/routes/chat.ts:70` |
| **Effort** | trivial |

If `getOrCreate` throws on a Redis connection reset, the error becomes an unhandled rejection.

**Fix**: Wrap in try/catch with proper error response.

---

#### M-29: No Redis Connection Pooling

| Field | Value |
|-------|-------|
| **File** | `server/src/services/redis.ts` |
| **Effort** | easy |

Default single-connection mode bottlenecks at 1000 concurrent users.

**Fix**: Configure with `isolationPoolOptions: { min: 2, max: 10 }`.

---

#### M-30: InMemoryConversationStore is a Redis-Aware Hybrid

| Field | Value |
|-------|-------|
| **File** | `server/src/services/conversationStore.ts` |
| **Effort** | medium |

The class named "InMemory" is actually Redis-primary with in-memory fallback, violating SRP. No separate `RedisConversationStore` exists.

**Fix**: Extract `RedisConversationStore implements IConversationStore`. Use DI to select at startup.

---

## Low Findings

### L-1: `voices.ts` is 557 Lines of Dead Code

| **File** | `server/src/services/voices.ts` | **Effort** | trivial |

Never imported by any runtime file. `tts.ts` has its own hardcoded `VOICE_MAP`.

---

### L-2: `extractMood` Called Twice on Same Text

| **File** | `server/src/routes/chat.ts:162` | **Effort** | trivial |

Mood already extracted by `MoodStreamDetector` during streaming, then called again on the complete text.

---

### L-3: Magic Numbers Throughout Socket Handlers

| **Files** | Multiple | **Effort** | easy |

`4` (max players), `30_000` (timer), `3_000` (post-DM pause), `100` (max history), `500` (chat max length) -- not named constants.

---

### L-4: `console.log` Instead of Structured `logEvent` in Socket Handlers

| **Files** | `roomHandlers.ts`, `turnHandlers.ts` | **Effort** | easy |

Inconsistent log formatting makes Datadog parsing harder.

---

### L-5: `_testInternals` Exported in Production Bundle

| **File** | `server/src/services/usageTracker.ts:155-160` | **Effort** | trivial |

Test-only code ships in production. Gate behind `NODE_ENV === "test"`.

---

### L-6: `formatTime` Relative Timestamps Never Update

| **File** | `client/src/components/PlayerChat.tsx:24-32` | **Effort** | easy |

Messages show "just now" forever until the next re-render.

---

### L-7: Blob URLs Never Revoked on Scene Reset

| **File** | `client/src/services/sceneVideo.ts:135-142` | **Effort** | trivial |

`resetScenes()` clears maps but doesn't revoke accumulated blob URLs.

---

### L-8: Room Code Generation Has No Upper Bound

| **File** | `server/src/services/roomStore.ts:68-73` | **Effort** | trivial |

`do-while` loop with no max iterations guard.

---

### L-9: `socketRateMap` Memory Leak on Failed Connections

| **File** | `server/src/sockets/index.ts:23-47` | **Effort** | easy |

Cleanup only fires on `disconnect` for successfully connected sockets. Rejected connections leave entries.

---

### L-10: Circular Dependency via Dynamic Import

| **File** | `server/src/sockets/roomHandlers.ts:195-201` | **Effort** | easy |

Three `import("./turnHandlers.js")` calls. If path changes, errors are swallowed and game silently breaks.

---

### L-11: Stale Closure in Crossfade Timeout

| **File** | `client/src/components/SceneBackground.tsx:161-168` | **Effort** | trivial |

`handleIncomingCanPlay` references `incomingUrl` which could change during 600ms timeout.

---

### L-12: Dual Route Paths Create Ambiguity

| **Files** | `narrate.ts`, `music.ts`, `sceneVideo.ts` | **Effort** | easy |

Routes register both `/path` and `/api/path`. Inconsistent with chat route.

---

### L-13: Two Rate Limiter Files with Confusing Names

| **Files** | `rateLimiter.ts`, `rateLimits.ts` | **Effort** | trivial |

Nearly identical names, split for no strong reason.

---

### L-14: `tsyringe` Declared but Unused

| **File** | `server/package.json` | **Effort** | trivial |

`tsyringe` and `reflect-metadata` listed as deps but never imported.

---

### L-15: `@types/express` and `@types/node` Pinned to `"latest"`

| **File** | `server/package.json` | **Effort** | trivial |

Non-deterministic builds on fresh installs.

---

### L-16: `bcryptjs` Blocks Event Loop (~250ms per hash)

| **File** | `server/src/routes/auth.ts:56` | **Effort** | trivial |

Pure JS implementation doesn't use libuv thread pool. Consider switching to native `bcrypt` or `argon2`.

---

### L-17: Blob URL Leak on Unmount in `useSSEChat`

| **File** | `client/src/hooks/useSSEChat.ts:239-244` | **Effort** | trivial |

Audio blob URLs tracked in ref but not revoked on unmount (only on explicit `reset`).

---

### L-18: Usage Tracker Linear Scan (O(n) at 10K entries)

| **File** | `server/src/services/usageTracker.ts:147-149` | **Effort** | easy |

`getConversationUsage` filters entire array on every call. Add a secondary `Map` index.

---

## Positive Findings (Commendations)

1. **Helmet + CSP** properly configured with restrictive directives
2. **CORS allowlist** environment-driven and shared between Express and Socket.IO
3. **Bcrypt cost 12** for password hashing
4. **Parameterized Neo4j queries** prevent Cypher injection
5. **No `dangerouslySetInnerHTML`** anywhere -- React escaping covers XSS
6. **Bedrock 45s timeout** with AbortController prevents hung connections
7. **Queue backpressure** returns 503 early when overloaded
8. **Generic error messages** -- no stack traces leaked to clients
9. **Two-tier TTS cache** (L1 memory, L2 S3) with phrase pre-warming
10. **Graceful Neo4j/Redis degradation** -- chat continues without lore/persistence
11. **Well-typed Socket.IO events** via shared types package
12. **Zod config validation** catches misconfiguration at startup
13. **Mood stream detector** elegantly handles partial tag boundaries across chunks
14. **Body size limit 64KB** + Socket.IO `maxHttpBufferSize 16KB`
15. **Production JWT_SECRET enforcement** -- fatal error if missing in production

---

## Recommended Fix Priority

### Wave 1 -- Before Production (CRITICAL + easy HIGH fixes)

| # | Issue | Effort |
|---|-------|--------|
| C-1 | Enforce `requireAuth` on all game API routes | easy |
| H-1 | Pin JWT algorithm to HS256 | trivial |
| H-2 | Fix `skipMiddlewares: true` on socket recovery | trivial |
| H-3 | Validate `dice:roll` result type/range | trivial |
| H-4 | Fix emoji allowlist mismatch | trivial |
| H-8 | Guard `S3 response.Body` null check | trivial |
| H-9 | Wrap post-`res.end()` operations in try/catch | trivial |
| H-15 | Add sanitization to narrate text input | trivial |
| M-3 | Strengthen password policy | trivial |
| M-6 | Remove uptime from health endpoint | trivial |
| M-7 | Validate `x-request-id` format | trivial |
| M-8 | Validate `conversationId` on narrate endpoint | trivial |
| M-9 | Lower Bedrock queue threshold to 40-60 | trivial |
| M-12 | Add Neo4j query timeout | trivial |

### Wave 2 -- Scale Readiness (architectural)

| # | Issue | Effort |
|---|-------|--------|
| C-3 | Move TTS audio delivery from Socket.IO to S3 URLs | medium |
| C-4/C-5 | Refactor conversation storage to Redis Lists | medium |
| H-5 | Add circuit breakers for external services | medium |
| H-6 | Add conversation ownership validation | medium |
| H-7 | Implement full graceful shutdown | easy |
| H-10 | Add idempotency guard to DM trigger functions | easy |
| H-12 | Add structured logging to all socket handlers | medium |
| H-13 | Clear timers/abort streams on room deletion | easy |
| M-17 | Fix Redis reconnection handling | easy |
| M-18 | Harden config validation for production secrets | easy |
| M-22 | Defer rate limiter store creation until after Redis connects | easy |

### Wave 3 -- Performance Tuning

| # | Issue | Effort |
|---|-------|--------|
| H-11 | Add byte-budget LRU to TTS/video/music caches | easy-medium |
| H-16 | Eliminate redundant Redis round-trips | easy |
| H-17 | Debounce/memo markdown rendering during streaming | medium |
| M-10 | Add PQueue concurrency limit for MiniMax TTS | easy |
| M-11 | Add Neo4j label + index | easy |
| M-13 | Cap ImageBitmap frame capture | easy |
| M-14 | Memoize PlayerChat message rendering | easy |
| M-19 | Add deep health check endpoint | easy |
| M-20 | Add operational metrics (connections, rooms, queue depth) | easy |
| M-29 | Configure Redis connection pooling | easy |

### Wave 4 -- Hardening & Cleanup

| # | Issue | Effort |
|---|-------|--------|
| C-2 | Document single-instance constraint or implement Redis room store | hard |
| M-1 | Expand prompt injection sanitization | easy |
| M-2 | Validate `characterClass` against allowlist | easy |
| M-4 | Implement token refresh/rotation | medium |
| M-5 | Add per-username login rate limiting | easy |
| M-15 | Add SSE backpressure handling | medium |
| M-30 | Separate Redis and in-memory store implementations | medium |
| L-* | All LOW findings | trivial-easy |
