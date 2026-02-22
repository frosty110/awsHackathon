# Phase 12: Production Hardening - Research

**Researched:** 2026-02-21
**Domain:** Express.js rate limiting, JWT secret management, Redis error resilience
**Confidence:** HIGH

## Summary

Phase 12 closes four specific resilience and security gaps identified by the v1.0 milestone audit. The gaps are surgical: two missing rate limiters on auth routes, one Redis error-handling gap in `conversationStore`, and one JWT secret inconsistency between sign and verify. All four can be addressed with small, isolated code changes — no new libraries required. Every dependency needed is already installed.

The phase touches three files: `server/src/middleware/rateLimiter.ts` (add two auth limiters), `server/src/app.ts` (wire auth limiters before authRouter), `server/src/middleware/auth.ts` (fix JWT verify fallback), and `server/src/services/conversationStore.ts` (wrap Redis calls in try/catch with in-memory fallback). The scope is intentionally narrow — this is debt closure, not feature addition.

The existing rate limiting infrastructure (`express-rate-limit` 8.2.1 with `RedisStore`) is the correct foundation. Auth route limiters are IP-keyed (not userId-keyed) because unauthenticated requests don't carry a userId. The `InMemoryConversationStore._getFromRedis()` and `._saveToRedis()` private helpers need try/catch blocks that catch errors and fall through to the in-memory store. The JWT fix is a one-line change: add the same `|| "dev-secret-do-not-use-in-production"` fallback to `jwt.verify()` calls in `auth.ts`.

**Primary recommendation:** Four targeted edits — no new dependencies, no new files, no architectural changes. Each success criterion maps to exactly one code location.

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express-rate-limit | 8.2.1 | Per-IP rate limiting middleware | Already used for chat/narrate; MemoryStore default, RedisStore optional |
| rate-limit-redis | 4.3.1 | Redis-backed rate limit store | Already wired via `createStore()` in `rateLimiter.ts` |
| redis (node-redis) | 5.11.0 | Redis client | Already used for conversation/session storage |
| jsonwebtoken | 9.0.3 | JWT sign and verify | Already used in `routes/auth.ts` and `middleware/auth.ts` |

### No New Dependencies

All four success criteria are achievable with the existing stack. No `npm install` required.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Existing Rate Limiter Pattern (rateLimiter.ts)

The codebase already has a `createStore(prefix)` helper that returns `RedisStore` when Redis is available, or `undefined` (MemoryStore) when not. Auth limiters must use this same pattern.

```typescript
// Source: server/src/middleware/rateLimiter.ts (existing pattern)
function createStore(prefix: string) {
  if (isRedisAvailable()) {
    return new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      prefix,
    });
  }
  return undefined; // express-rate-limit uses built-in MemoryStore
}
```

Auth limiters are IP-keyed (not userId-keyed) because these are unauthenticated endpoints — no userId exists yet. Use `req.ip ?? "unknown"` as key.

### Pattern 1: Auth Route Rate Limiters

**What:** Add `registerLimiter` (3/min per IP) and `loginLimiter` (10/min per IP) to `rateLimiter.ts`.
**When to use:** These are brute-force / registration-spam protection — must be tight.
**Example:**

```typescript
// Source: rateLimiter.ts — add after existing exports
/**
 * registerLimiter — 3 requests per minute per IP.
 * Prevents registration spam. Auth endpoints are IP-keyed (no userId yet).
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: createStore("rl:register:"),
  message: { error: "Too many registration attempts, slow down" },
});

/**
 * loginLimiter — 10 requests per minute per IP.
 * Prevents credential stuffing. Auth endpoints are IP-keyed (no userId yet).
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: createStore("rl:login:"),
  message: { error: "Too many login attempts, slow down" },
});
```

### Pattern 2: Mounting Auth Limiters in app.ts

**What:** Apply auth limiters to specific paths before `authRouter` is mounted. Mirror the existing chat/narrate pattern exactly.
**When to use:** Must come after CORS/security headers, after `optionalAuth`, before the auth router.

```typescript
// Source: server/src/app.ts — updated section 5/6
// 5. Auth route rate limiting — applied before auth router
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/login", loginLimiter);

// 6. Auth routes
app.use(authRouter);
```

Note: The current comment says "no rate limit" on auth routes. That comment must be updated.

### Pattern 3: Redis Error Resilience in conversationStore.ts

**What:** Wrap every `isRedisAvailable()` branch's Redis calls in try/catch. On error, log and fall through to in-memory behavior.
**When to use:** Guards against mid-run Redis drops (connection drops, timeouts, evictions) that currently cause uncaught promise rejections → 500 responses.

The current `_getFromRedis` and `_saveToRedis` private methods throw if Redis fails. The fix wraps them so callers handle errors gracefully. The simplest approach: wrap the Redis branch inside each public method.

```typescript
// Source: server/src/services/conversationStore.ts — patched getOrCreate example
async getOrCreate(
  conversationId?: string,
  characterClass?: string,
  pronouns?: string
): Promise<Conversation> {
  const id = conversationId ?? crypto.randomUUID();

  if (isRedisAvailable()) {
    try {
      let convo = await this._getFromRedis(id);
      if (!convo) {
        convo = { id, history: [], characterClass, pronouns };
      } else {
        if (characterClass && !convo.characterClass) convo.characterClass = characterClass;
        if (pronouns && !convo.pronouns) convo.pronouns = pronouns;
      }
      await this._saveToRedis(convo);
      return convo;
    } catch (err) {
      // Redis mid-run failure — fall through to in-memory
      console.error("[conversationStore] Redis error, falling back to in-memory:", err);
    }
  }

  // In-memory fallback (also used when Redis try/catch catches)
  if (!this.store.has(id)) {
    this.store.set(id, { id, history: [], characterClass, pronouns });
  }
  const convo = this.store.get(id)!;
  if (characterClass && !convo.characterClass) convo.characterClass = characterClass;
  if (pronouns && !convo.pronouns) convo.pronouns = pronouns;
  return convo;
}
```

Apply the same try/catch pattern to `appendMessage`, `getWindowedHistory`, `getCharacterClass`, and `getPronouns`. Each method already has an in-memory fallback block — the fix wraps the Redis block in try/catch and falls through to that block on error.

### Pattern 4: JWT Verify Fallback (middleware/auth.ts)

**What:** The sign side already has `config.JWT_SECRET || "dev-secret-do-not-use-in-production"`. The verify side uses `config.JWT_SECRET` directly, which is an empty string when `JWT_SECRET` is unset — causing `jwt.verify()` to throw `secretOrPublicKey must have a value`, breaking auth in development.
**When to use:** Fix is a one-liner in both `requireAuth` and `optionalAuth`.

```typescript
// Source: server/src/middleware/auth.ts — current (broken dev behavior)
const payload = jwt.verify(token, config.JWT_SECRET) as { ... };

// Fixed (matches sign fallback)
const DEV_SECRET = "dev-secret-do-not-use-in-production";

const payload = jwt.verify(token, config.JWT_SECRET || DEV_SECRET) as { ... };
```

Both `requireAuth` and `optionalAuth` have this call — fix both. Define `DEV_SECRET` as a module-level constant to avoid repeating the string literal.

### Recommended Project Structure (no changes needed)

The phase does not add new files. All edits are in-place:

```
server/src/
├── middleware/
│   ├── auth.ts              # Fix jwt.verify fallback (both requireAuth + optionalAuth)
│   └── rateLimiter.ts       # Add registerLimiter + loginLimiter
├── app.ts                   # Wire auth limiters before authRouter
└── services/
    └── conversationStore.ts # Wrap Redis branches in try/catch (5 methods)
```

### Anti-Patterns to Avoid

- **Do not add rate limiters to `rateLimits.ts`** — that file is for the music limiter (MemoryStore, conversationId-keyed). Auth limiters are Redis-backed (like chat/narrate) and belong in `rateLimiter.ts` alongside the `createStore()` helper.
- **Do not use a shared limiter for both register and login** — they need different limits (3 vs 10) and separate Redis key prefixes.
- **Do not catch Redis errors silently** — always log with `console.error("[conversationStore] Redis error...")`  so operators can detect Redis degradation in logs/Datadog.
- **Do not remove the in-memory fallback** — it is the graceful degradation path, not dead code. The fix makes it reachable from Redis failures.
- **Do not use `logEvent()` for conversationStore Redis errors** — `console.error` is consistent with the existing `redisClient.on("error")` pattern in `redis.ts`. Using `logEvent()` would add a new dependency on the logger in a service module that doesn't currently import it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom counter in Redis | express-rate-limit + RedisStore | Handles distributed counting, window sliding, headers, store failures automatically |
| JWT fallback string | Complex env detection | Single `||` fallback operator | `jwt.sign`/`jwt.verify` accept any non-empty string; the existing fallback pattern is the right model |
| Redis error recovery | Custom retry/reconnect logic | try/catch + fall through to in-memory | node-redis handles reconnection via the `"error"` event listener already wired in `redis.ts`; the conversationStore just needs to not propagate errors |

**Key insight:** Every tool needed is already installed. The "hand-roll" trap here is writing new infrastructure when the fix is wrapping existing code in try/catch or adding `|| "fallback"`.

## Common Pitfalls

### Pitfall 1: Mounting Auth Limiters After authRouter

**What goes wrong:** If `app.use("/api/auth/register", registerLimiter)` is placed after `app.use(authRouter)`, the limiter never runs — Express routes are matched in registration order.
**Why it happens:** The current app.ts comment "no rate limit" misleads implementers to skip the rate-limit section and go straight to the router.
**How to avoid:** Place auth limiter registrations between step 5 (currently the router) and step 6 in app.ts. Model exactly on the existing pattern for chat/narrate.
**Warning signs:** Rate limiter not triggering under rapid test requests.

### Pitfall 2: Using `config.JWT_SECRET` Directly in Tests

**What goes wrong:** Unit tests that don't set `JWT_SECRET` env var get an empty string passed to `jwt.verify()`, throwing `secretOrPublicKey must have a value`.
**Why it happens:** The dev fallback must be consistent between sign and verify. If only one side has it, tokens signed in dev can't be verified.
**How to avoid:** Add `const DEV_SECRET = "dev-secret-do-not-use-in-production"` at module top in `auth.ts` and use it in both `requireAuth` and `optionalAuth`.
**Warning signs:** Auth tests fail with `Error: secretOrPublicKey must have a value`.

### Pitfall 3: Redis Fallback Silently Loses Conversation State

**What goes wrong:** When Redis fails mid-run and the fallback activates, the in-memory store starts empty — existing conversations stored in Redis are not migrated. Users see an empty conversation.
**Why it happens:** This is inherent to the fallback design, not a bug to fix. The fallback is for resilience (avoid 500), not for data continuity.
**How to avoid:** Document this behavior. The error log is the signal to operators. This is acceptable for the ~1000 user scale (Redis drops are rare, and in-memory starts fresh gracefully).
**Warning signs:** Users report "conversation restarted" after Redis instability — this is expected fallback behavior, not a crash.

### Pitfall 4: Forgetting appendMessage Throws Without a Conversation

**What goes wrong:** `appendMessage` currently throws `Conversation ${id} not found` when the conversation doesn't exist. After the Redis try/catch, if `getOrCreate` redirected to in-memory but a subsequent `appendMessage` still hits Redis (Redis recovered), the conversation won't exist in Redis.
**Why it happens:** Redis branch and in-memory branch are independent stores; a mid-request Redis failure can cause split state.
**How to avoid:** Wrap `appendMessage`'s Redis branch in try/catch too — on error, log and attempt the in-memory store. The in-memory store also throws on missing key, so callers will still see the error if the conversation is truly missing.
**Warning signs:** 500 errors on chat messages after Redis recovery.

### Pitfall 5: Rate Limiter Redis Key Prefix Collision

**What goes wrong:** If `registerLimiter` and `loginLimiter` use the same Redis prefix (e.g., both `"rl:auth:"`), they share hit counts — a login attempt counts toward register quota.
**Why it happens:** Copy-paste error when creating the second limiter.
**How to avoid:** Use distinct prefixes: `"rl:register:"` and `"rl:login:"`.
**Warning signs:** Login rate limit triggers after only 3 requests (register threshold), or vice versa.

## Code Examples

Verified patterns from official sources and existing codebase:

### express-rate-limit 8.2.1 — IP-keyed limiter with MemoryStore fallback

```typescript
// Source: node_modules/express-rate-limit/dist/index.d.ts (verified locally)
// Options.keyGenerator: ValueDeterminingMiddleware<string>
// Options.limit: number | ValueDeterminingMiddleware<number>
// Options.store: Store (undefined = built-in MemoryStore)

export const registerLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  limit: 3,               // 3 requests per window per key
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: createStore("rl:register:"),
  message: { error: "Too many registration attempts, slow down" },
});
```

### node-redis 5.11.0 — Error resilience pattern

```typescript
// Source: existing redis.ts error handler pattern (verified in codebase)
// redisClient.on("error", ...) handles reconnection — conversationStore
// just needs to not propagate promise rejections from transient failures.

try {
  const result = await redisClient.get(key);
  // ... use result
} catch (err) {
  console.error("[conversationStore] Redis error, falling back to in-memory:", err);
  // fall through to in-memory branch
}
```

### jsonwebtoken 9.0.3 — Consistent secret fallback

```typescript
// Source: routes/auth.ts line 128 (existing sign pattern — verified in codebase)
// jwt.sign uses:   config.JWT_SECRET || "dev-secret-do-not-use-in-production"
// jwt.verify uses: config.JWT_SECRET  ← BUG: empty string throws
//
// Fix — add DEV_SECRET constant and use consistently:
const DEV_SECRET = "dev-secret-do-not-use-in-production";

// In requireAuth and optionalAuth:
const payload = jwt.verify(token, config.JWT_SECRET || DEV_SECRET) as { ... };
```

### Existing app.ts rate limiter mount pattern

```typescript
// Source: server/src/app.ts lines 41-45 (verified in codebase)
// Apply limiter to path before registering route handler — copy this pattern
app.use("/api/chat", chatRateLimiter);
app.use("/api/narrate", narrateRateLimiter);
app.use("/narrate", narrateRateLimiter);

// Auth limiters follow the same pattern — route-specific, not global:
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/login", loginLimiter);
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Auth routes unprotected | IP-keyed rate limiters on register (3/min) and login (10/min) | Closes credential stuffing / spam registration risk at 1000-user scale |
| JWT verify throws on empty secret | `|| DEV_SECRET` fallback consistent with sign | Auth works in development without explicit JWT_SECRET |
| Redis failures propagate as 500 | try/catch + in-memory fallback | Service degrades gracefully on transient Redis drops |

**Deprecated/outdated:**
- app.ts comment "Auth routes — no rate limit": this will be wrong after the fix; update the comment.

## Open Questions

1. **Should auth rate limiters use Redis store?**
   - What we know: `createStore()` already provides Redis-backed or MemoryStore depending on availability. Auth limiters should use the same approach for cross-instance consistency.
   - What's unclear: Whether auth limiter Redis keys need longer TTLs than the default window (they don't — standard sliding window is correct).
   - Recommendation: Use `createStore("rl:register:")` and `createStore("rl:login:")` — identical pattern to chat/narrate.

2. **Should conversationStore errors use logEvent() instead of console.error?**
   - What we know: `redis.ts` uses `console.error` for its error handler. `conversationStore.ts` does not currently import the logger.
   - What's unclear: Whether adding logger import is worth the change.
   - Recommendation: Use `console.error` for consistency with `redis.ts`. Avoids adding a new import and keeps the fallback simple.

3. **Does the existing vitest test suite need updates for the Redis try/catch?**
   - What we know: `conversationStore.test.ts` mocks `isRedisAvailable` to return `false`, so the Redis branch is never entered. The try/catch doesn't affect the in-memory path tests.
   - What's unclear: Whether a new test for the Redis failure path is needed.
   - Recommendation: Add a test that mocks `isRedisAvailable: () => true` and `redisClient.get` to throw — verifies the fallback activates without a 500. This is a good sanity check, not strictly required for the success criteria.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `server/src/middleware/rateLimiter.ts` — existing rate limiter pattern, `createStore()` helper
- Codebase inspection: `server/src/routes/auth.ts` — JWT sign with fallback (line 128), current login/register handlers
- Codebase inspection: `server/src/middleware/auth.ts` — JWT verify without fallback (lines 28, 57)
- Codebase inspection: `server/src/services/conversationStore.ts` — all 5 public methods with Redis branches
- Codebase inspection: `server/src/app.ts` — rate limiter mount order and auth router position
- Local package inspection: `node_modules/express-rate-limit` v8.2.1 — confirmed `limit`, `keyGenerator`, `store`, `standardHeaders` options
- Local package inspection: `node_modules/redis` v5.11.0 — confirmed installed version
- `.planning/v1.0-MILESTONE-AUDIT.md` — authoritative source for the four specific gaps to close

### Secondary (MEDIUM confidence)
- `server/package.json` — confirmed all required library versions already installed

### Tertiary (LOW confidence)
- None — all findings verified from codebase and local packages.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries inspected locally, versions confirmed
- Architecture: HIGH — existing patterns verified from source, changes are additive
- Pitfalls: HIGH — pitfalls derived from direct code analysis of the exact files being modified

**Research date:** 2026-02-21
**Valid until:** 2026-03-23 (30 days — stable libraries, no ecosystem churn expected)
