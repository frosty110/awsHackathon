# Phase 9: Scale & Auth - Research

**Researched:** 2026-02-21
**Domain:** Redis session/state store, JWT authentication, per-user rate limiting, Bedrock backpressure, Socket.IO multi-instance
**Confidence:** HIGH (stack and patterns verified against official docs and official npm pages)

---

## Summary

Phase 9 migrates two in-memory module-level Maps — `conversationStore.ts` and `roomStore.ts` — to Redis, adds stateless JWT authentication, applies per-user rate limiting with Redis-backed counters, wraps Bedrock calls in a concurrency queue, and wires the Socket.IO Redis adapter so multi-instance deployment is possible. No new UI patterns are introduced; this is pure backend infrastructure.

The current architecture has a critical single-instance constraint: all state (conversations, rooms) lives in Node process memory. Any server restart or second instance loses all game sessions. Redis fixes this for conversations. Socket.IO multiplayer rooms are more complex because they include active timers and `timerHandle` references — those cannot be serialized to Redis. The pragmatic solution is to store conversation history in Redis and keep room state in-memory per-instance while using the Socket.IO Redis adapter for cross-instance event broadcasting.

Authentication for this app is a hackathon/community product — Passport + OAuth is overkill. A simple username+password login that issues a signed JWT (via `jsonwebtoken`) is the correct scope. Users.json or an in-memory user registry is sufficient; no PostgreSQL/MongoDB required.

**Primary recommendation:** Use `node-redis` (not `ioredis` — officially deprecated), `connect-redis` v9 for session store, `express-rate-limit` v7 + `rate-limit-redis` v4 for per-user limits, `jsonwebtoken` + `bcryptjs` for auth, `p-queue` for Bedrock concurrency, and `@socket.io/redis-adapter` for multi-instance Socket.IO.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `redis` (node-redis) | ^4.x | Redis client for all Redis operations | Official Redis recommendation; ioredis is now deprecated per redis.io |
| `connect-redis` | ^9.0.0 | Redis-backed express-session store | Official maintained Redis session store for Express |
| `express-session` | ^1.18 | Session middleware (wraps Redis store) | Standard Express session middleware |
| `express-rate-limit` | ^7.x | Rate limiting middleware | Maintained Express-ecosystem middleware, ESM support |
| `rate-limit-redis` | ^4.3.1 | Redis store backend for express-rate-limit | Official adapter maintained by express-rate-limit project |
| `jsonwebtoken` | ^9.x | Sign and verify JWTs | Battle-tested, widely used |
| `@types/jsonwebtoken` | latest | TypeScript types for jsonwebtoken | Types not bundled |
| `bcryptjs` | ^2.x | Password hashing | Pure JS, no native bindings required |
| `@types/bcryptjs` | latest | TypeScript types for bcryptjs | Types not bundled |
| `p-queue` | ^8.x | Bedrock request concurrency queue | Lightweight, native ESM, no external deps |
| `@socket.io/redis-adapter` | ^8.x | Cross-instance Socket.IO event broadcasting | Official Socket.IO adapter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/express-session` | latest | TypeScript types for express-session | Required for session type augmentation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node-redis` | `ioredis` | ioredis is officially deprecated by Redis as of 2025; node-redis is the current recommendation |
| `jsonwebtoken` + custom middleware | Passport.js + passport-jwt | Passport is correct for multi-strategy OAuth; for simple username/password JWT this is overkill |
| `p-queue` | `bullmq` | BullMQ requires Redis and is a full job queue system; p-queue is in-process and sufficient for backpressure |
| `bcryptjs` | `argon2` | Argon2 is technically superior (OWASP 2025 recommended) but requires native bindings; bcryptjs is pure JS, zero build friction |
| standard Redis adapter | Redis Streams adapter | Streams adapter supports connection state recovery in multi-instance mode; Pub/Sub adapter does NOT support it (confirmed in Socket.IO docs) |

**Installation:**
```bash
# Server workspace
yarn workspace server add redis connect-redis express-session express-rate-limit rate-limit-redis jsonwebtoken bcryptjs p-queue @socket.io/redis-adapter
yarn workspace server add -D @types/jsonwebtoken @types/bcryptjs @types/express-session
```

---

## Architecture Patterns

### Recommended Project Structure additions
```
server/src/
├── middleware/
│   ├── auth.ts           # JWT verification middleware
│   └── rateLimiter.ts    # Per-user rate limiter factory
├── routes/
│   └── auth.ts           # POST /api/auth/login, POST /api/auth/register
├── services/
│   ├── redis.ts          # Shared redis client singleton (IMPORTANT: single client)
│   ├── conversationStore.ts   # MODIFIED: Redis-backed (replaces Map)
│   ├── roomStore.ts      # UNCHANGED: stays in-memory (timers can't serialize)
│   └── bedrockQueue.ts   # NEW: p-queue concurrency wrapper for Bedrock calls
└── sockets/
    └── index.ts          # MODIFIED: add Redis adapter
```

### Pattern 1: Single Shared Redis Client

Create one Redis client module and import it everywhere. Never create new client instances per-request or per-file.

**What:** A singleton module that creates, connects, and exports the Redis client.
**When to use:** Always — multiple clients waste connections and cause event listener memory leaks.

```typescript
// server/src/services/redis.ts
// Source: https://redis.io/docs/latest/develop/clients/nodejs/
import { createClient } from "redis";
import { config } from "./config.js";

export const redisClient = createClient({
  url: config.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => {
  console.error("[redis] client error:", err);
});

// Called once in server startup (index.ts)
export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("[redis] connected");
  }
}
```

**Key difference from ioredis:** node-redis requires explicit `.connect()` — it does NOT auto-connect on instantiation.

### Pattern 2: Redis-Backed Conversation Store

Replace the in-memory `Map<string, Conversation>` with Redis HASH operations. The API surface of `conversationStore.ts` stays identical — callers don't change.

**What:** Wrap every store read/write in Redis HGET/HSET/JSON serialize calls.
**When to use:** For all conversation state that must survive server restarts.

```typescript
// Key pattern: conv:{conversationId}
// Value: JSON-serialized Conversation object
// TTL: 7 days (conversations expire if idle)

const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function getOrCreate(
  conversationId?: string,
  characterClass?: string,
  pronouns?: string,
): Promise<Conversation> {
  const id = conversationId ?? crypto.randomUUID();
  const key = `conv:${id}`;

  const raw = await redisClient.get(key);
  if (raw) {
    const convo = JSON.parse(raw) as Conversation;
    // Update TTL on access
    await redisClient.expire(key, CONVERSATION_TTL_SECONDS);
    return convo;
  }

  const convo: Conversation = { id, history: [], characterClass, pronouns };
  await redisClient.set(key, JSON.stringify(convo), {
    EX: CONVERSATION_TTL_SECONDS,
  });
  return convo;
}
```

**Note:** All store functions become async. Every caller in `chat.ts`, `turnHandlers.ts` must add `await`.

### Pattern 3: Redis Express Session Store

Used for web sessions (complement to JWT). If the auth model is purely JWT-stateless, express-session with Redis may be optional. However, it is needed for connect-redis to track session-associated conversation IDs across visits (SCALE-04).

```typescript
// Source: https://github.com/tj/connect-redis README (v9)
import { RedisStore } from "connect-redis";
import session from "express-session";
import { redisClient } from "../services/redis.js";

// Note: import uses named export — changed from v7
const sessionMiddleware = session({
  store: new RedisStore({
    client: redisClient,
    prefix: "sess:",
    ttl: 7 * 24 * 60 * 60, // 7 days
  }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
```

### Pattern 4: JWT Authentication (Stateless)

Issue JWT on login; verify on protected routes via middleware. No Passport needed.

```typescript
// server/src/middleware/auth.ts
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "../services/config.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, config.JWT_SECRET) as {
      userId: string;
      username: string;
    };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: "Token invalid or expired" });
  }
}
```

### Pattern 5: Per-User Rate Limiting (Redis-backed)

Apply two limiters: IP-based global fallback + authenticated user-based limit.

```typescript
// Source: https://github.com/express-rate-limit/rate-limit-redis
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../services/redis.js";

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1-minute window
  limit: 20,                // 20 requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use authenticated userId if available, fall back to IP
    const authReq = req as AuthenticatedRequest;
    return authReq.userId ?? req.ip ?? "unknown";
  },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:chat:",
  }),
});

export const narrateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,                // TTS is expensive — lower limit
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.userId ?? req.ip ?? "unknown";
  },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:narrate:",
  }),
});
```

### Pattern 6: Bedrock Concurrency Queue (p-queue)

Wrap `streamBedrockResponse` with a p-queue to prevent unbounded concurrent Bedrock calls under 1000 users.

```typescript
// server/src/services/bedrockQueue.ts
// Source: https://github.com/sindresorhus/p-queue
import PQueue from "p-queue";

// Bedrock Claude Haiku on-demand: typical ~10 TPS shared limit
// Under 1000 users, realistic Bedrock concurrent streams should be bounded
// 50 concurrent gives good throughput without hitting throttle limits
export const bedrockQueue = new PQueue({ concurrency: 50 });

export async function queueBedrockCall<T>(fn: () => Promise<T>): Promise<T> {
  return bedrockQueue.add(fn) as Promise<T>;
}
```

**Usage:** Wrap in `chat.ts` and `turnHandlers.ts`:
```typescript
const result = await queueBedrockCall(() =>
  streamBedrockResponse(bedrockMessages, onChunk, options)
);
```

**Backpressure:** When queue is full (`bedrockQueue.size >= MAX`), return 503 before queuing.

### Pattern 7: Socket.IO Redis Adapter

Required for multi-instance deployment so Socket.IO `io.to(roomCode).emit(...)` works across server instances.

```typescript
// Source: https://socket.io/docs/v4/redis-adapter/
import { createAdapter } from "@socket.io/redis-adapter";
import { redisClient } from "../services/redis.js";

const pubClient = redisClient;
const subClient = pubClient.duplicate();
await subClient.connect();

io.adapter(createAdapter(pubClient, subClient));
```

**CRITICAL CONSTRAINT:** The standard Redis adapter uses Pub/Sub and does NOT support `connectionStateRecovery`. The current Socket.IO config uses `connectionStateRecovery: { maxDisconnectionDuration: 2min }`. With multiple instances, this recovery cannot work cross-instance with Pub/Sub. Options:
1. Keep single-instance (deploy one server, scale vertically) — simplest, no recovery loss
2. Switch to `@socket.io/redis-streams-adapter` — supports recovery but different package
3. Accept that recovery only works within the same instance — acceptable for hackathon scale

For this phase, **keep single-instance + Redis adapter as prep for future horizontal scale**, and document the recovery limitation. The Redis adapter still provides value for future multi-instance without breaking the current recovery behavior for the 1-instance case.

### Anti-Patterns to Avoid
- **Creating a Redis client per-request:** Every request creates a new TCP connection — connections pile up and Redis chokes. Always use the singleton from `redis.ts`.
- **Storing room timer handles in Redis:** `timerHandle: ReturnType<typeof setTimeout>` cannot be serialized. Room state MUST stay in-memory; only conversation history goes to Redis.
- **Blocking the Express event loop on Redis operations:** All Redis calls are async — always `await`. Never use synchronous Redis patterns.
- **Using ioredis:** Officially deprecated by Redis Inc. in favor of node-redis. New code should use `redis` (node-redis) package.
- **Storing JWT secret in code:** Must be a long random string in environment variable `JWT_SECRET`. Never hardcode.
- **Rate limiting by IP only:** IP-based limiting is bypassable via proxies. Always key by authenticated userId when available.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis connection management | Custom reconnect logic | `node-redis` built-in retry | Exponential backoff, error events, connection pool already handled |
| Session persistence | Custom cookie + Redis serialization | `connect-redis` + `express-session` | TTL management, serialization, session ID cookie all handled |
| Rate limiting counters | Custom Redis INCR + expiry | `express-rate-limit` + `rate-limit-redis` | Sliding window, standard headers (RateLimit-*), atomic Redis EVAL script |
| JWT token parsing | Custom base64 decode + HMAC verify | `jsonwebtoken` | Edge cases in spec compliance, timing-safe comparison, algorithm validation |
| Password hashing | Custom PBKDF2 | `bcryptjs` | Salting, work factor tuning, timing-safe compare |
| Concurrency limiting | Custom semaphore | `p-queue` | Priority queue, pause/resume, size monitoring all built in |

**Key insight:** The rate limiting space is particularly complex — `rate-limit-redis` uses a Lua script executed atomically in Redis to avoid race conditions in the fixed window increment. Hand-rolling this will have race condition bugs under concurrent load.

---

## Common Pitfalls

### Pitfall 1: Async Store Functions Break All Callers

**What goes wrong:** Migrating `conversationStore.ts` from sync Map to async Redis makes every function return `Promise<...>`. Every callsite (`chat.ts`, `turnHandlers.ts`) must be updated to `await` — missing any `await` causes silent race conditions where the previous conversation state is used.

**Why it happens:** The original store was synchronous. Adding async is a viral change.

**How to avoid:** Do a full-codebase search for every import of `conversationStore` before writing a line of Redis code. Update all callers atomically in the same task.

**Warning signs:** TypeScript will error on unhandled Promises if you have `noImplicitAny` and strict mode — but only if return types are typed. Add explicit return types to all store functions.

### Pitfall 2: node-redis Requires Explicit .connect()

**What goes wrong:** Create client, immediately call `redisClient.get(...)` — throws `ClientClosedError` because node-redis does not auto-connect on instantiation (unlike ioredis).

**Why it happens:** node-redis API design: connection is explicit. This is different from ioredis behavior.

**How to avoid:** Call `await redisClient.connect()` in server startup (`index.ts` `main()`) before any route handlers execute. The singleton pattern in `redis.ts` with a `connectRedis()` function enforces this.

**Warning signs:** `ClientClosedError: The client is closed` in server logs.

### Pitfall 3: connect-redis v9 Breaking Import Change

**What goes wrong:** Copying old code that does `import connectRedis from "connect-redis"` and then `const RedisStore = connectRedis(session)` — this pattern was removed in v7 and will throw at import time.

**Why it happens:** connect-redis v7+ changed to named exports. v9 (current) uses `import { RedisStore } from "connect-redis"`.

**How to avoid:** Use the named import as documented above. No `session` parameter in the constructor.

**Warning signs:** `RedisStore is not a constructor` or `connectRedis is not a function` at startup.

### Pitfall 4: Rate Limiter Key Must Handle Unauthenticated Requests

**What goes wrong:** `keyGenerator` always returns `req.userId` but unauthenticated requests don't have a userId — returns `undefined`, all unauthenticated requests share one counter.

**Why it happens:** Auth middleware runs before rate limiter, so unauthenticated requests bypass the auth middleware and hit rate limiting with no userId.

**How to avoid:** Always fall back: `return authReq.userId ?? req.ip ?? "unknown"`. This keeps global IP-based limiting as the safety net.

**Warning signs:** Single `undefined` or `null` key with massive hit count in Redis — `rl:chat:undefined`.

### Pitfall 5: Room State Cannot Go Into Redis

**What goes wrong:** Attempting to serialize `Room` to Redis — the `timerHandle: ReturnType<typeof setTimeout>` field is a Node.js timer reference that cannot be serialized. Even ignoring the timer, room state includes active Socket.IO event flow that is per-instance.

**Why it happens:** Full multi-instance room state is a hard distributed systems problem (distributed countdown timers, atomic player action collection).

**How to avoid:** Keep `roomStore.ts` as in-memory only. Document that multi-instance room support requires a separate architectural investment (distributed locking, timer re-election). For this phase: deploy Redis + single instance of the game server.

**Warning signs:** Rooms disappearing on any server restart — this is expected behavior and acceptable for Phase 9 scope.

### Pitfall 6: Socket.IO Redis Adapter Needs Two Clients

**What goes wrong:** Pass the same Redis client for both pub and sub — Redis Pub/Sub requires the subscriber client to be in a dedicated subscriber mode, which blocks it from other commands.

**Why it happens:** Redis protocol constraint: once you SUBSCRIBE, that connection can only receive PUB messages.

**How to avoid:** Always `duplicate()` the client for the subscriber: `const subClient = pubClient.duplicate(); await subClient.connect();`

**Warning signs:** `ERR Command not allowed inside a transaction`, connection freezes, or pub messages not being received.

### Pitfall 7: JWT Secret Must Be Long and Random

**What goes wrong:** Using a short or predictable `JWT_SECRET` like `"secret"` or `"dev"` — the HS256 algorithm is only as strong as the secret. Short secrets are dictionary-attackable.

**Why it happens:** Developers use placeholder secrets in dev and forget to change them.

**How to avoid:** Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. Put in `.env`. Add `JWT_SECRET` to config validation and to `.env.example`.

**Warning signs:** Short `JWT_SECRET` in config defaults — treat as a security bug.

---

## Code Examples

### Redis Client Singleton Startup

```typescript
// server/src/index.ts — modified main()
import { connectRedis } from "./services/redis.js";

async function main(): Promise<void> {
  // Connect Redis before starting routes
  await connectRedis();

  // ... rest of startup
}
```

### Login Route (JWT Issuance)

```typescript
// server/src/routes/auth.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../services/config.js";

const router = Router();

// Simple in-memory user store — replace with Redis hash for persistence
// Format: { userId, username, passwordHash }
const users: Array<{ userId: string; username: string; passwordHash: string }> = [];

router.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  if (users.find((u) => u.username === username)) {
    res.status(409).json({ error: "username already taken" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();
  users.push({ userId, username, passwordHash });
  res.status(201).json({ message: "registered" });
});

router.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const user = users.find((u) => u.username === username);
  if (!user || !(await bcrypt.compare(password ?? "", user.passwordHash))) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const token = jwt.sign(
    { userId: user.userId, username: user.username },
    config.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({ token, userId: user.userId, username: user.username });
});

export default router;
```

### Apply Rate Limiters in Routes

```typescript
// server/src/routes/chat.ts (modified top)
import { chatRateLimiter } from "../middleware/rateLimiter.js";

router.post("/api/chat", chatRateLimiter, async (req, res) => { ... });
```

### Config Additions (envDefaults pattern)

```typescript
// additions to server/src/services/config.ts
const envDefaults = {
  // ... existing ...
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "",
  SESSION_SECRET: "",
};

const envSchema = z.object({
  // ... existing ...
  REDIS_URL: z.string(),
  JWT_SECRET: z.string(),
  SESSION_SECRET: z.string(),
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ioredis` | `node-redis` (package: `redis`) | 2024-2025 — ioredis deprecated by Redis Inc. | New code should use node-redis; existing ioredis code not urgently broken but no new features |
| `connect-redis` legacy mode: `connectRedis(session)` | Named export: `import { RedisStore } from "connect-redis"` | connect-redis v7 (2022), current v9 (June 2025) | Import pattern changed; old pattern throws |
| express-rate-limit `max:` option | `limit:` option | express-rate-limit v7 | `max` still supported but deprecated |
| Passport + passport-jwt for all JWT auth | Plain `jsonwebtoken` verify middleware | Ongoing — Passport remains for OAuth | For simple username/password JWT, Passport is unnecessary complexity |

**Deprecated/outdated:**
- `ioredis`: Deprecated by Redis Inc. per official docs — do not use for new code
- `socket.io-redis` (old package): Replaced by `@socket.io/redis-adapter` — npm warns on install

---

## Open Questions

1. **User persistence: in-memory users vs. Redis hash store**
   - What we know: In-memory user store is lost on server restart. Redis hash store (`user:{username}`) would persist users.
   - What's unclear: Is user persistence required for this phase? SCALE-02 says "login/session management" but doesn't specify durability across restarts.
   - Recommendation: Start with Redis-backed user store (trivial to implement, avoids losing all registered users on deploy). Add `user:{userId}` hash keys.

2. **SCALE-04 "persistent game sessions" — what counts as persistent?**
   - What we know: Conversation history in Redis survives restarts. Room state (multiplayer) in-memory does not.
   - What's unclear: Does SCALE-04 mean solo conversation resume (achievable) or multiplayer room resume (not achievable without major refactor)?
   - Recommendation: Scope SCALE-04 to solo conversation persistence via Redis + conversationId stored in session/JWT. Document multiplayer room persistence as out of scope.

3. **Bedrock concurrency limit — what number to set?**
   - What we know: AWS Bedrock on-demand Claude 3 Haiku has TPM and RPM quotas (visible in Service Quotas console; not publicly published for specific accounts). AWS docs confirm 429 throttling occurs when limits are exceeded.
   - What's unclear: The actual quota for this specific AWS account is not visible without console access.
   - Recommendation: Start with `concurrency: 20` and add retry-with-backoff on 429 errors. Monitor Datadog for throttle errors and tune upward.

4. **Socket.IO connectionStateRecovery + Redis adapter compatibility**
   - What we know: Standard Redis Pub/Sub adapter does NOT support connectionStateRecovery in multi-instance mode (confirmed by Socket.IO docs). Redis Streams adapter does support it.
   - What's unclear: Is multi-instance truly needed for this phase, or is Phase 9 about deploying one instance with Redis for state durability?
   - Recommendation: Phase 9 should target single-instance + Redis for state durability. Wire the Redis adapter for future-proofing but document the recovery limitation.

---

## Sources

### Primary (HIGH confidence)
- `https://redis.io/docs/latest/develop/clients/nodejs/migration/` — Confirmed ioredis deprecation; node-redis as official recommendation
- `https://socket.io/docs/v4/connection-state-recovery` — Confirmed standard Redis adapter does not support connectionStateRecovery
- `https://socket.io/docs/v4/redis-adapter/` — Redis adapter setup with pub/sub client duplication pattern
- `https://github.com/tj/connect-redis` (README) — connect-redis v9.0.0 named export pattern confirmed
- `https://github.com/express-rate-limit/rate-limit-redis` — rate-limit-redis v4.3.1 sendCommand pattern confirmed
- `https://github.com/sindresorhus/p-queue` — p-queue native ESM, concurrency API

### Secondary (MEDIUM confidence)
- `https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/` — bcryptjs vs argon2 tradeoff; Argon2 preferred but bcryptjs chosen for zero native binding constraint
- `https://github.com/express-rate-limit/express-rate-limit` (wiki/releases) — v7 `limit` config rename confirmed

### Tertiary (LOW confidence — verify if needed)
- AWS Bedrock Haiku on-demand quota numbers: not publicly confirmed for specific accounts. Check Service Quotas console before setting concurrency limits.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official deprecation notice from redis.io for ioredis; all library versions verified on npm/GitHub
- Architecture: HIGH — patterns derived from official library READMEs and Socket.IO docs
- Pitfalls: HIGH — the async migration and connect-redis import change are explicitly documented breaking changes
- Bedrock quotas: LOW — actual per-account numbers require AWS console access

**Research date:** 2026-02-21
**Valid until:** 2026-08-21 (stable libraries; check connect-redis for any v10 breaking changes before planning)
