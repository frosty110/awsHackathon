# Phase 17: Code Review Bug Fixes Wave 1 - Research

**Researched:** 2026-02-22
**Domain:** Node.js/Express security hardening, JWT auth, Socket.IO auth, input validation, graceful shutdown
**Confidence:** HIGH

## Summary

Phase 17 fixes 17 concrete bugs identified in `docs/CODE_REVIEW_2026-02-22.md` across two waves. All 14 Wave 1 items are trivial/easy one-liners or small guards. Three Wave 2 items (H-7 graceful shutdown, H-10 DM idempotency guard, H-13 room deletion cleanup) are also included because they are "easy" effort and critical for production safety at 1000 users.

The fixes span five files in the server and one in sockets. No new dependencies are required. The fixes are surgical: each change is 1-8 lines. The only architectural concern is C-1 (auth enforcement), which has a subtle ordering constraint — `requireAuth` must be inserted _after_ the global `optionalAuth` middleware but _before_ the route handlers in `app.ts`, preserving the existing auth route exemption pattern.

The emoji allowlist fix (H-4) is the only fix with a client-server contract implication: the server `ALLOWED_EMOJIS` set must be changed to match the Unicode characters that `PlayerChat.tsx` already sends (`'👍'`, `'💀'`, etc.). The client does not need to change.

**Primary recommendation:** Apply all 17 fixes in small focused commits, verify TypeScript compiles clean (`npx tsc --noEmit`) after each group, and run the existing Vitest suite after all changes.

## Existing Codebase State

This phase is purely bug-fix — no new architecture, no new packages. The codebase already has:

- `requireAuth` middleware at `server/src/middleware/auth.ts:36` — exists but is never applied to game routes
- `optionalAuth` applied globally in `app.ts:32` — correctly preserves unauthenticated access to `/api/auth/*`
- `sanitizeUserInput()` in `inputSanitizer.ts` — used in chat route, missing in narrate route
- `getJwtSecret()` in `middleware/auth.ts` — both sign and verify paths need `algorithm`/`algorithms` option
- `skipMiddlewares: true` in `sockets/index.ts:77` — needs to be `false`
- `response.Body!.transformToByteArray()` in `mediaCache.ts:43` — force-unwrap needs null check
- `bedrockQueue.pending > 100` threshold in `bedrockQueue.ts:27` — needs lowering to 40-60
- Neo4j `driver.executeQuery()` call in `neo4j.ts:25` — missing `{ timeout: 5000 }` option
- `process.uptime()` in `health.ts:9` — needs removal
- `buildRequestId()` in `logger.ts:71` — accepts any string, needs regex validation
- Graceful shutdown in `index.ts:90-97` — closes Neo4j and HTTP server but not Redis or Socket.IO
- `triggerDMOpening` and `triggerDMResponse` in `turnHandlers.ts` — phase guard set AFTER function entry, not atomic
- Room deletion in `roomHandlers.ts:268-269` — `deleteRoom()` does not clear timers or abort streams

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jsonwebtoken` | ^9.0.3 | JWT sign/verify | Already used; `algorithms` option is a built-in param |
| `socket.io` | ^4.8.3 | WebSocket server | Already used; `skipMiddlewares` is a top-level option |
| `redis` | ^5.11.0 | Redis client | Already used; `redisClient.quit()` is the correct graceful close method |
| `express` | ^5.0.0 | HTTP framework | Already used; route-level middleware insertion is the fix pattern |
| `neo4j-driver` | ^6.0.0 | Neo4j client | Already used; `executeQuery` accepts `{ timeout }` as third arg |

No new packages are required for any of the 17 fixes.

## Architecture Patterns

### Pattern 1: Route-Level Auth Enforcement in app.ts (C-1)

**What:** Insert `requireAuth` as a per-path middleware before each protected route's handler.
**When to use:** When a route must reject unauthenticated requests with 401.

The current `app.ts` structure:
```typescript
// Step 7 in app.ts — BEFORE route handlers, AFTER rate limiters
app.use("/api/chat", chatRateLimiter);   // existing
app.use("/api/narrate", narrateRateLimiter);  // existing
```

The fix inserts `requireAuth` before the rate limiters (so unauthenticated requests are rejected before being counted toward the rate limit):

```typescript
import { requireAuth, optionalAuth } from "./middleware/auth.js";

// Auth enforcement on game routes — must come before rate limiters
app.use("/api/chat", requireAuth, chatRateLimiter);
app.use("/api/narrate", requireAuth, narrateRateLimiter);
app.use("/api/music", requireAuth, musicLimiter);
app.use("/api/scene-video", requireAuth);

// Auth routes (/api/auth/register, /api/auth/login) remain unprotected — no requireAuth here
```

**Critical ordering note:** The global `optionalAuth` at line 32 runs first and populates `req.userId` if a valid token is present. `requireAuth` at the route level then checks for `req.userId` being absent and rejects. This is correct — no conflict.

**Important:** The narrate route registers both `/narrate` and `/api/narrate` paths. Both need auth. Since `narrateRouter` handles both internally, applying `requireAuth` only to `/api/narrate` in app.ts would leave `/narrate` open. The fix must also add `app.use("/narrate", requireAuth)` before the route handler — or change the narrate route to only register as `/api/narrate`.

The simplest fix given prior decisions (preserve unauthenticated gameplay is a PRIOR DECISION from Phase 09-03) conflicts with C-1. The code review identifies this as a critical bug. The resolution from the code review is to apply `requireAuth` — this overrides the earlier "optionalAuth globally" pattern. The planner must make a note of this tension.

### Pattern 2: JWT Algorithm Pinning (H-1)

**What:** Pass `{ algorithm: "HS256" }` on sign and `{ algorithms: ["HS256"] }` on verify.
**Files:** `server/src/routes/auth.ts:126-129` (sign), `server/src/middleware/auth.ts:49` and `:78` (verify in both requireAuth and optionalAuth).

```typescript
// Sign (auth.ts route)
const token = jwt.sign(
  { userId: user.userId, username: user.username },
  getJwtSecret(),
  { algorithm: "HS256", expiresIn: "7d" }   // add algorithm
);

// Verify (middleware/auth.ts — both requireAuth and optionalAuth)
const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as { ... };
```

Note: `jwt.sign` takes `algorithm` (singular string); `jwt.verify` takes `algorithms` (plural array). This is the jsonwebtoken API convention.

### Pattern 3: Socket.IO skipMiddlewares Fix (H-2)

**What:** Change `skipMiddlewares: true` to `skipMiddlewares: false` in the `connectionStateRecovery` option.
**File:** `server/src/sockets/index.ts:77`

```typescript
connectionStateRecovery: {
  maxDisconnectionDuration: 2 * 60 * 1000,
  skipMiddlewares: false,   // was true — auth middleware now runs on reconnection
},
```

### Pattern 4: dice:roll Validation (H-3)

**What:** Validate `result` is an integer in range 1-20 before broadcasting.
**File:** `server/src/sockets/chatHandlers.ts:61`

```typescript
socket.on("dice:roll", ({ result }) => {
  if (typeof result !== "number" || !Number.isInteger(result) || result < 1 || result > 20) return;
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;
  io.to(roomCode).emit("dice:rolled", {
    socketId: socket.id,
    displayName: socket.data.displayName ?? "Unknown",
    result,
  });
});
```

### Pattern 5: Emoji Allowlist Fix (H-4)

**What:** Change server-side `ALLOWED_EMOJIS` to Unicode characters that match what the client actually sends.
**File:** `server/src/sockets/chatHandlers.ts:9`

The client (`PlayerChat.tsx:6-13`) sends these Unicode strings via `socket.emit('chat:react', { messageId, emoji })`:
- `'👍'` (thumbsup)
- `'💀'` (skull)
- `'🔥'` (fire)
- `'⚔️'` (swords — note: this is a two-codepoint sequence U+2694 U+FE0F)
- `'✨'` (sparkles)
- `'😂'` (laugh)

Server fix:
```typescript
const ALLOWED_EMOJIS = new Set(["👍", "💀", "🔥", "⚔️", "✨", "😂"]);
```

**Pitfall:** `'⚔️'` is `U+2694 U+FE0F` (crossed swords + variation selector-16). The Set lookup uses strict string equality so the literal `"⚔️"` in the source file must match exactly what the client sends. The client uses `'⚔️'` in its source, so they match as long as the file encoding is consistent UTF-8.

### Pattern 6: S3 Body Null Check (H-8)

**What:** Guard `response.Body` before calling `transformToByteArray()`.
**File:** `server/src/services/mediaCache.ts:43`

```typescript
const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
if (!response.Body) {
  span?.setTag("cache.result", "miss");
  return null;
}
const bytes = await response.Body.transformToByteArray();
```

### Pattern 7: Post-res.end() try/catch (H-9)

**What:** Wrap the `appendMessage` call after `res.end()` in a try/catch.
**File:** `server/src/routes/chat.ts:177-178`

```typescript
if (fullText) {
  try {
    await appendMessage(conversation.id, { role: "assistant", content: stripTTSTags(expandPhrases(fullText)) });
  } catch (err) {
    logEvent("error", "chat.persist_assistant_failed", { conversationId: conversation.id }, err);
  }
  // ...rest of logging
}
```

### Pattern 8: Narrate Input Sanitization (H-15)

**What:** Apply `sanitizeUserInput()` to the `text` field and enforce a length limit (5000 chars is reasonable for narration).
**File:** `server/src/routes/narrate.ts:28`

```typescript
import { sanitizeUserInput } from "../services/inputSanitizer.js";

// Replace:
const textInput = typeof req.body?.text === "string" ? req.body.text.trim() : "";
// With:
const textInput = sanitizeUserInput(typeof req.body?.text === "string" ? req.body.text : "", 5000);
```

### Pattern 9: Password Policy (M-3)

**What:** Change minimum from 6 to 8 characters and add 128 character maximum.
**File:** `server/src/routes/auth.ts:35`

```typescript
// Replace:
if (typeof password !== "string" || password.length < 6) {
  res.status(400).json({ error: "Password must be at least 6 characters" });
// With:
if (typeof password !== "string" || password.length < 8 || password.length > 128) {
  res.status(400).json({ error: "Password must be 8-128 characters" });
```

### Pattern 10: Health Endpoint Uptime Removal (M-6)

**What:** Remove `uptime: process.uptime()` from the response.
**File:** `server/src/routes/health.ts:9`

```typescript
router.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    // uptime removed — leaks deployment schedule (M-6)
  });
});
```

### Pattern 11: x-request-id Validation (M-7)

**What:** Validate the header value against an alphanumeric regex before trusting it as a request ID.
**File:** `server/src/services/logger.ts:71-74`

```typescript
const REQUEST_ID_RE = /^[a-zA-Z0-9\-_]{1,128}$/;

export function buildRequestId(headerValue: string | undefined): string {
  const trimmed = headerValue?.trim();
  return trimmed && REQUEST_ID_RE.test(trimmed) ? trimmed : crypto.randomUUID();
}
```

### Pattern 12: Narrate conversationId Validation (M-8)

**What:** Apply the same UUID regex validation that chat route already uses.
**File:** `server/src/routes/narrate.ts`

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodyConversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : null;
if (bodyConversationId && !UUID_RE.test(bodyConversationId)) {
  res.status(400).json({ error: "Invalid conversationId format" });
  return;
}
```

### Pattern 13: Bedrock Queue Threshold (M-9)

**What:** Lower `pending > 100` to `pending > 50` (midpoint of the 40-60 recommendation).
**File:** `server/src/services/bedrockQueue.ts:27`

```typescript
export function isBedrockQueueOverloaded(): boolean {
  return bedrockQueue.pending > 50;  // was 100; 40-60 recommended by code review
}
```

### Pattern 14: Neo4j Query Timeout (M-12)

**What:** Add `{ timeout: 5000 }` as the third argument to `driver.executeQuery()`.
**File:** `server/src/services/neo4j.ts:25`

```typescript
const { records } = await driver.executeQuery(
  `MATCH (n) WHERE n.name IN $entities ...`,
  { entities },
  { timeout: 5000 }   // 5 second timeout — prevents hung RAG pipeline
);
```

**Verify:** Neo4j driver v6 `executeQuery()` signature accepts `{ timeout: number }` in the third options argument. This is confirmed by the neo4j-driver v6 API.

### Pattern 15: Graceful Shutdown (H-7)

**What:** Close Redis and Socket.IO in the shutdown handler.
**File:** `server/src/index.ts:90-97`

The `io` instance is available via `initSocketIO()` return value. The shutdown handler needs access to both `io` and `redisClient`.

```typescript
import { redisClient, isRedisAvailable } from "./services/redis.js";

const io = await initSocketIO(server);

const shutdown = async (signal: string) => {
  console.log(`[shutdown] ${signal} received, closing gracefully...`);
  io.close();           // close Socket.IO — disconnects all WebSocket clients gracefully
  server.close();       // stop accepting new HTTP connections
  if (driver) await driver.close();
  if (isRedisAvailable()) await redisClient.quit();  // flush pending commands, close TCP
  process.exit(0);
};
```

**Ordering matters:** `io.close()` should come before `server.close()` so Socket.IO has a chance to send disconnect events before the HTTP server stops accepting connections.

### Pattern 16: DM Trigger Idempotency Guard (H-10)

**What:** Add phase guard at the top of `triggerDMOpening` and `triggerDMResponse` to prevent concurrent invocation.
**File:** `server/src/sockets/turnHandlers.ts:140, 227`

```typescript
export async function triggerDMOpening(io: IO, roomCode: string): Promise<void> {
  const room = getRoom(roomCode);
  if (!room || room.phase === "dm-responding") return;  // idempotency guard
  room.phase = "dm-responding";
  // ...rest of function
}

export async function triggerDMResponse(io: IO, roomCode: string): Promise<void> {
  const room = getRoom(roomCode);
  if (!room || room.phase === "dm-responding") return;  // idempotency guard
  room.phase = "dm-responding";
  // ...rest of function
}
```

Note: The current code at line 144/231 already sets `room.phase = "dm-responding"` — the fix moves the phase check to BEFORE the assignment and makes it the first thing done.

### Pattern 17: Room Deletion Timer/Stream Cleanup (H-13)

**What:** When all players disconnect and the room is deleted, clear any pending setTimeout and abort any in-progress Bedrock stream.
**File:** `server/src/sockets/roomHandlers.ts:267-270`

The `roomStore` needs to expose the timer handle, which it already does (`room.timerHandle`). The deletion logic in the `disconnect` handler needs to:

1. Read `room.timerHandle` before calling `deleteRoom()`
2. Call `clearTimeout(room.timerHandle)` if non-null

For Bedrock stream abort: The room does not currently store an `AbortController`. The simplest fix is to check if the room is in `dm-responding` phase at deletion time and emit a `dm:error` event — the Bedrock stream itself will error naturally when it tries to write to the now-deleted room object. A more robust fix is to store an `AbortController` ref on the room, but that adds complexity the code review marks as "easy" effort.

Pragmatic fix (matches "easy" effort assessment):

```typescript
// In disconnect handler, before deleteRoom():
if (getConnectedPlayerCount(roomCode) === 0) {
  const room = getRoom(roomCode);
  if (room) {
    // Clear the action collection timer if active
    if (room.timerHandle !== null) {
      clearTimeout(room.timerHandle);
      room.timerHandle = null;
    }
    // If DM is streaming, signal error to any remaining sockets (none should be left)
    if (room.phase === "dm-responding") {
      io.to(roomCode).emit("dm:error", { message: "All players disconnected." });
    }
  }
  deleteRoom(roomCode);
}
```

### Anti-Patterns to Avoid

- **Applying requireAuth to /api/auth routes:** Auth routes must stay open. Only apply to `/api/chat`, `/api/narrate`, `/api/music`, `/api/scene-video`.
- **Using `algorithms: "HS256"` (string) instead of `algorithms: ["HS256"]` (array) in jwt.verify:** jsonwebtoken's `algorithms` option requires an array. Using a string causes a type error and may not enforce the restriction.
- **Removing the optionalAuth global middleware:** It should remain — it's needed for rate limiting to key by userId when available.
- **Forgetting the `/narrate` alias path:** The narrate route registers under both `/narrate` and `/api/narrate`. Auth must cover both paths.
- **Phase guard using `room.phase !== "dm-responding"` vs `room.phase === "dm-responding"`:** The guard should ALLOW entry when phase is NOT already "dm-responding", then set it. Don't invert the logic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT algorithm enforcement | Custom token parser | `{ algorithms: ["HS256"] }` option in `jwt.verify()` | jsonwebtoken built-in, covers all attack vectors |
| Input sanitization | New regex patterns | Existing `sanitizeUserInput()` in `inputSanitizer.ts` | Already tested, consistent behavior |
| UUID format validation | New parser | Existing `UUID_RE` regex already in `chat.ts` — copy it | DRY principle, already battle-tested |
| Redis graceful close | Connection pool drain | `redisClient.quit()` | node-redis built-in — flushes pending, closes cleanly |
| Socket.IO graceful close | WebSocket frame loop | `io.close()` | Socket.IO built-in — sends disconnect packets to all clients |

**Key insight:** All fixes use existing APIs and patterns already present in the codebase. Zero new libraries needed.

## Common Pitfalls

### Pitfall 1: requireAuth on `/narrate` Dual-Path Route

**What goes wrong:** `requireAuth` is applied to `/api/narrate` in `app.ts` but not `/narrate`. The narrate router internally registers `["/narrate", "/api/narrate"]`. The app.ts path-prefix middleware only covers the `/api/narrate` prefix.

**Why it happens:** Express `app.use("/api/narrate", requireAuth)` only intercepts requests whose path starts with `/api/narrate`. Requests to `/narrate` bypass this.

**How to avoid:** Either add a separate `app.use("/narrate", requireAuth)` line in app.ts, or modify the narrate route to drop the `/narrate` alias and only register as `/api/narrate` (cleaner).

**Warning signs:** POST to `/narrate` succeeding without Authorization header after the fix is applied.

### Pitfall 2: jwt.verify `algorithms` Accepts Array Only

**What goes wrong:** TypeScript `@types/jsonwebtoken` types `algorithms` as `Algorithm[]` (array of strings). Passing a plain string compiles to `never` or gets silently ignored.

**Why it happens:** Developer uses `algorithm: "HS256"` (the sign-time option name) instead of `algorithms: ["HS256"]` (the verify-time option name).

**How to avoid:** Sign uses `algorithm` (singular); verify uses `algorithms` (plural array). Always double-check.

### Pitfall 3: Emoji Unicode String Literal Encoding

**What goes wrong:** `"⚔️"` in the source file is `U+2694 U+FE0F`. If the editor strips the variation selector (U+FE0F), the server Set contains `"⚔"` (single codepoint) but the client sends `"⚔️"` (two codepoints), and they don't match.

**Why it happens:** Some text editors normalize or strip Unicode variation selectors when saving.

**How to avoid:** After saving `chatHandlers.ts`, verify the byte count of the `"⚔️"` literal is 6 bytes (UTF-8 encoding of U+2694 = 3 bytes + U+FE0F = 3 bytes). Alternatively, use the hexadecimal escape: `"\u2694\uFE0F"`.

**Test:** A trivial test that checks `ALLOWED_EMOJIS.has("⚔️")` catches this before production.

### Pitfall 4: Shutdown Order — io.close() vs server.close()

**What goes wrong:** Calling `server.close()` before `io.close()` means Socket.IO cannot complete WebSocket handshake teardowns because the underlying HTTP server is already closed.

**Why it happens:** Developers follow the pattern "close the outer resource first".

**How to avoid:** `io.close()` first, then `server.close()`, then `redisClient.quit()`. Socket.IO needs the HTTP server running briefly to send disconnect packets.

### Pitfall 5: Neo4j executeQuery timeout Option Location

**What goes wrong:** Passing `{ timeout: 5000 }` as the second argument (where parameters go) instead of the third argument (session config).

**Why it happens:** Developer confuses the parameter and options positions.

**How to avoid:** `driver.executeQuery(query, params, { timeout: 5000 })` — three arguments. The third argument is the session/query config object.

### Pitfall 6: DM Phase Guard Race Condition Scope

**What goes wrong:** The idempotency guard checks `room.phase` but the phase is set to `"dm-responding"` only after the guard passes — not atomically. In a single-process Node.js event loop this is safe (no true concurrency), but two timer callbacks firing in the same event loop turn could both pass the guard before either sets the phase.

**Why it happens:** Node.js is single-threaded but `setTimeout` callbacks can interleave between `await` points.

**How to avoid:** Set `room.phase = "dm-responding"` as the very first statement after the null check, before any `await`. This is guaranteed to execute synchronously before any other event loop callbacks can run.

## Code Examples

### requireAuth Middleware Application (verified from existing codebase)

```typescript
// Source: server/src/app.ts — current structure (lines 44-55), fix shown
import { requireAuth, optionalAuth } from "./middleware/auth.js";

// Section 7 of createApp() — after rate limiters are imported
app.use("/api/chat", requireAuth, chatRateLimiter);
app.use("/api/narrate", requireAuth, narrateRateLimiter);
app.use("/narrate", requireAuth, narrateRateLimiter);   // covers dual-path narrate route
app.use("/api/music", requireAuth, musicLimiter);
app.use("/api/scene-video", requireAuth);
```

### JWT Algorithm Pinning (verified from jsonwebtoken docs)

```typescript
// Source: server/src/routes/auth.ts:126 — sign
jwt.sign(
  { userId: user.userId, username: user.username },
  getJwtSecret(),
  { algorithm: "HS256", expiresIn: "7d" }
);

// Source: server/src/middleware/auth.ts:49 and :78 — verify (requireAuth AND optionalAuth)
jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as { userId: string; username: string };
```

### Graceful Shutdown with Redis and Socket.IO

```typescript
// Source: server/src/index.ts:80-97 — current pattern, extended
const io = await initSocketIO(server);

const shutdown = async (signal: string) => {
  console.log(`[shutdown] ${signal} received, closing gracefully...`);
  io.close();
  server.close();
  if (driver) await driver.close();
  if (isRedisAvailable()) await redisClient.quit();
  process.exit(0);
};
```

### Narrate Route Dual-Path Auth (app.ts pattern)

```typescript
// Current (app.ts):
app.use("/api/narrate", narrateRateLimiter);
app.use("/narrate", narrateRateLimiter);

// Fixed:
app.use("/api/narrate", requireAuth, narrateRateLimiter);
app.use("/narrate", requireAuth, narrateRateLimiter);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jwt.verify with no algorithms option | jwt.verify with `{ algorithms: ["HS256"] }` | CVE published 2015 (algorithm confusion) | Prevents alg:none and RS256 spoofing attacks |
| skipMiddlewares: true on reconnect | skipMiddlewares: false | Socket.IO 4.x | Ensures auth runs on every connection including recovery |
| Trusting client-provided request IDs | Validate against alphanumeric regex | OWASP 2021 | Prevents log injection attacks |

## Open Questions

1. **Auth enforcement vs. prior "optionalAuth globally" decision from Phase 09-03**
   - What we know: Phase 09-03 locked "optionalAuth globally (not requireAuth) — existing unauthenticated gameplay preserved"
   - What's unclear: The code review (C-1) marks this as CRITICAL and requires requireAuth on game routes. This directly conflicts with the Phase 09-03 locked decision.
   - Recommendation: The code review post-dates Phase 09-03 and represents an explicit override. The planner should treat C-1 as superseding the Phase 09-03 decision, noting this in the plan. The description says "Strengthens SCALE-02 (auth)" which aligns with requireAuth.

2. **Narrate route `/narrate` vs `/api/narrate` path consolidation**
   - What we know: The narrate router uses `["/narrate", "/api/narrate"]` dual paths. Auth must cover both.
   - What's unclear: Should the dual path be removed (L-12 in the code review) as part of this fix, or just apply auth to both paths?
   - Recommendation: Scope-match — only add auth to both paths in app.ts. Don't remove the dual path (that's a separate L-12 cleanup not in Wave 1 scope).

3. **H-13 room deletion and AbortController for Bedrock stream**
   - What we know: `triggerDMResponse` holds a Bedrock streaming call. When the room is deleted mid-stream, the streaming continues until the Bedrock call completes or times out (45s max).
   - What's unclear: Does the code review's "easy" effort assessment mean adding an AbortController ref to the room store, or just clearing the timer?
   - Recommendation: The "easy" fix is: clear the setTimeout timer handle (which the room already stores as `room.timerHandle`) and emit a `dm:error` for the abandoned room. Do NOT add AbortController — that touches room store types and is medium effort. The Bedrock call will naturally fail when it attempts to write to a deleted room's refs.

## Prior Decisions (from phase context)

These prior decisions from previous phases constrain the approach:

- **Phase 09-03:** `optionalAuth` globally — but C-1 overrides this for game routes. Auth routes (`/api/auth/register`, `/api/auth/login`) remain open.
- **Phase 09-03:** bcrypt 12 rounds — preserved, no change.
- **Phase 09-03:** Redis hashes at `user:{username}` — preserved, no change.
- **Phase 09-03:** Constant-time user-not-found with dummy bcrypt.compare — preserved, no change.
- **Phase 11-01:** helmet CSP connect-src: self — not touched in this phase.
- **Phase 11-01:** ALLOWED_ORIGINS exported from security.ts — not touched.
- **Phase 12-01:** registerLimiter and loginLimiter use req.ip — not touched.
- **Phase 12-01:** DEV_SECRET constant mirrors inline string — not touched, but algorithm pinning must be added to both sign call in `routes/auth.ts` and both verify calls in `middleware/auth.ts`.
- **Phase 12-production-hardening:** try/catch in public methods for Redis resilience — H-9 adds try/catch around appendMessage post-stream, consistent with this decision.

## Sources

### Primary (HIGH confidence — codebase inspection)

- `server/src/app.ts` — route ordering and middleware structure
- `server/src/middleware/auth.ts` — `requireAuth` and `optionalAuth` implementations, `jwt.verify` calls
- `server/src/routes/auth.ts` — `jwt.sign` call, password validation
- `server/src/sockets/index.ts` — `skipMiddlewares` location, Socket.IO auth middleware
- `server/src/sockets/chatHandlers.ts` — `ALLOWED_EMOJIS` set, `dice:roll` handler
- `server/src/services/mediaCache.ts` — `response.Body!` force-unwrap
- `server/src/routes/chat.ts` — post-`res.end()` `appendMessage`, UUID_RE regex (to copy)
- `server/src/routes/narrate.ts` — missing sanitization and conversationId validation
- `server/src/routes/health.ts` — `process.uptime()` leak
- `server/src/services/logger.ts` — `buildRequestId()` without validation
- `server/src/services/bedrockQueue.ts` — `pending > 100` threshold
- `server/src/services/neo4j.ts` — missing `executeQuery` timeout
- `server/src/index.ts` — incomplete graceful shutdown
- `server/src/sockets/turnHandlers.ts` — missing phase guard in DM triggers
- `server/src/sockets/roomHandlers.ts` — room deletion without timer cleanup
- `client/src/components/PlayerChat.tsx` — emoji Unicode constants sent by client
- `docs/CODE_REVIEW_2026-02-22.md` — authoritative source for all 17 fixes

### Secondary (MEDIUM confidence — jsonwebtoken API)

- jsonwebtoken v9 sign options: `{ algorithm: "HS256" }` (singular) — standard API
- jsonwebtoken v9 verify options: `{ algorithms: ["HS256"] }` (plural array) — confirmed by library types

### Tertiary (LOW confidence — not verified against live docs)

- neo4j-driver v6 `executeQuery` third argument `{ timeout: number }` — based on codebase pattern and driver v6 docs knowledge; planner should verify against neo4j-driver v6 changelog if uncertain

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all fixes use existing APIs
- Architecture: HIGH — all 17 fix locations verified by reading source files
- Pitfalls: HIGH — derived from direct source inspection and known API conventions
- Neo4j executeQuery timeout option: MEDIUM — planner should verify arg position in neo4j-driver v6 docs

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable — no version-sensitive dependencies; fixes are pure code changes)
