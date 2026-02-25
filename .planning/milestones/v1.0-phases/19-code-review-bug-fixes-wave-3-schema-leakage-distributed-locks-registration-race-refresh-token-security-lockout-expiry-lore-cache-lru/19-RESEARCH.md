# Phase 19: Code Review Wave 3 (Reduced) — Research

**Researched:** 2026-02-22
**Domain:** Auth hardening, schema leakage, LRU cache, codebase cleanup
**Confidence:** HIGH

## Summary

Phase 19 fixes 15 code-review findings across four concern areas: (1) information disclosure via Zod validation error details leaking to clients, (2) auth hardening (atomic registration, Socket.IO auth default, in-memory lockout expiry, logout endpoint, refresh rate limit), (3) lore cache upgrade from plain `Map` with FIFO eviction to `LRUCache`, and (4) dead code removal and minor cleanup.

All changes are surgical modifications to existing files — no new dependencies are required. The `lru-cache` package (v11.2.6) is already installed and used in `tts.ts`, `musicService.ts`, and `videoGenerator.ts`. The `redis` package's `hSetNX` command is available in the installed version (`@redis/client` already exports `hSetNX`). All 15 items can be executed independently; there are no cross-item dependencies beyond the logical groupings below.

**Primary recommendation:** Execute as two PLAN files: one for auth hardening (C-1, C-3, H-2, H-3, H-4, H-5, M-6) and one for cleanup (M-3, M-4, M-8, L-1, L-3, L-4, L-5, L-6). Batch within plans by file to minimize context switching.

## Standard Stack

### Core (all already installed — no `npm install` needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `lru-cache` | 11.2.6 | LRU eviction for lore cache | Already used in tts.ts, musicService.ts, videoGenerator.ts |
| `@redis/client` (via `redis`) | 5.11.0 | `hSetNX` for atomic registration check | Already installed; `hSetNX` confirmed exported |
| `express-rate-limit` | 8.2.1 | `registerLimiter` pattern for refresh rate limit | Already used for register/login/chat/narrate |
| `zod` | 4.0.0 | `.safeParse()` already in place; fix is suppressing `details` in response | Already in use |

**No new dependencies.**

## Architecture Patterns

### Recommended File Organization

All changes are within existing files. The two logical groups map to two PLAN files:

```
server/src/
├── routes/
│   ├── auth.ts          # C-1 (partial), C-3, H-2 (no), H-4, H-5, M-6, L-6
│   ├── chat.ts          # C-1 (Zod error sanitization)
│   └── narrate.ts       # C-1 (Zod error sanitization), M-8 (dead AbortController)
├── services/
│   ├── rag.ts           # H-3 (LRU swap), M-4 (Neo4j label constraint)
│   ├── usageTracker.ts  # M-3 (setInterval backup timer)
│   ├── config.ts        # L-3 (remove SESSION_SECRET), L-5 (socket rate constants)
│   └── conversationStore.ts  # L-1 (verify getCharacterClass/getPronouns unused, remove exports)
├── sockets/
│   └── index.ts         # H-2 (flip === 'production' to !== 'development'), L-5 (move constants to config)
└── middleware/
    └── rateLimiter.ts   # M-6 (add refreshLimiter)
client/src/
└── hooks/
    └── useSSEChat.ts    # L-4 (add signal to TTS fetch)
.env.example             # L-3 (remove SESSION_SECRET)
```

### Pattern 1: Zod Error Sanitization (C-1)

**What:** Zod `.safeParse()` already used in `chat.ts` and `narrate.ts`. Both currently return `details: parsed.error.flatten().fieldErrors` in the HTTP 400 response, leaking schema structure to clients.

**Current code in chat.ts (line 30):**
```typescript
res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
```

**Fix:** Remove `details` from response body; log field errors server-side with `logEvent`.
```typescript
// Source: codebase (server/src/routes/chat.ts, narrate.ts)
if (!parsed.success) {
  logEvent("warn", "chat.validation_failed", {
    requestId,
    route: "/api/chat",
    errors: parsed.error.flatten().fieldErrors, // server-side only
  });
  res.status(400).json({ error: "Invalid request body" }); // no details
  return;
}
```

Apply the same pattern to `narrate.ts` (line 41).

### Pattern 2: Atomic Registration with HSETNX (C-3)

**What:** Current registration in `auth.ts` (lines 75-87) does `hGetAll` to check existence then `hSet` to write — this is a check-then-act race condition. Two concurrent registrations for the same username can both see "not found" and both proceed to write.

**The problem with `hSetNX`:** `hSetNX` sets a single field. Our user hash has three fields (`userId`, `username`, `passwordHash`). The correct atomic pattern uses `hSetNX` on the `userId` field as the uniqueness sentinel, then only writes the other fields if the sentinel set succeeded.

**Correct pattern:**
```typescript
// Source: @redis/client docs — hSetNX returns 1 if field was set (key didn't exist), 0 if already existed
const set = await redisClient.hSetNX(`user:${username}`, 'userId', userId);
if (!set) {
  // Username already taken — another concurrent registration won
  res.status(409).json({ error: "Username already taken" });
  return;
}
// Only we set userId — now set the remaining fields
await redisClient.hSet(`user:${username}`, { username, passwordHash });
```

**Why this is atomic enough for a single-instance deployment:** `HSETNX` is an atomic Redis command. If two concurrent registrations race, exactly one will get `set=1` (won the race) and the other will get `set=0` (lost). The two-step write (`hSetNX` + `hSet`) is not a single atomic transaction, but the uniqueness check (`hSetNX` on `userId`) IS atomic. If the server crashes between the two steps, `userId` exists but `passwordHash` is missing — the mitigation is to also remove the `hGetAll` pre-check (replaced by `hSetNX`) and add defensive handling: if `hGetAll` returns `userId` but missing `passwordHash`, treat as corrupt and reject. For a 1000-user single-instance deployment this race is acceptable per-spec.

**In-memory fallback:** Replace `Array.find()` (O(n)) with `Map.has()` (O(1)) for consistency with the L-6 change:
```typescript
// Change inMemoryUsers from Array to Map<string, UserRecord>
const inMemoryUsers = new Map<string, { userId: string; username: string; passwordHash: string }>();

// Registration: use Map.has() as atomic analog (single-threaded Node.js — no actual race in memory)
if (inMemoryUsers.has(username)) {
  res.status(409).json({ error: "Username already taken" });
  return;
}
inMemoryUsers.set(username, { userId, username, passwordHash });

// Login lookup
const user = inMemoryUsers.get(username);
```

### Pattern 3: Socket.IO Auth Default Flip (H-2)

**What:** Current code (sockets/index.ts line 95):
```typescript
if (config.NODE_ENV === 'production') {
  return next(new Error("Authentication required"));
}
```

**Fix:** Flip to `!== 'development'` so that test environments also require auth (avoids accidental auth bypass in staging):
```typescript
if (config.NODE_ENV !== 'development') {
  return next(new Error("Authentication required"));
}
```

### Pattern 4: LRU Cache Swap for Lore Cache (H-3)

**What:** `rag.ts` uses `new Map<string, LoreCacheEntry>()` with manual FIFO eviction (deletes the oldest key via `loreCache.keys().next().value` — O(n) iteration). The `LRUCache` class already imported in tts.ts/musicService.ts/videoGenerator.ts handles eviction automatically and uses the LRU policy (removes least-recently-used, not least-recently-inserted).

**Current lore cache in rag.ts (lines 29-31):**
```typescript
const loreCache = new Map<string, LoreCacheEntry>();
const LORE_CACHE_MAX_SIZE = 100;
const LORE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
```

**Current eviction (lines 44-51) — to be deleted:**
```typescript
function evictStaleLoreEntries(): void {
  const now = Date.now();
  for (const [key, entry] of loreCache) {
    if (now - entry.createdAt > LORE_CACHE_TTL_MS) {
      loreCache.delete(key);
    }
  }
}
```

**Replacement — mirrors tts.ts pattern exactly:**
```typescript
// Source: tts.ts line 65-70 (verified in codebase)
import { LRUCache } from "lru-cache";

const loreCache = new LRUCache<string, LoreCacheEntry>({
  max: LORE_CACHE_MAX_SIZE,    // 100 entries
  ttl: LORE_CACHE_TTL_MS,      // 10 minutes
  allowStale: false,
});
```

**Cache usage changes:**
- `loreCache.get(cacheKey)` — already the right call; LRUCache returns `undefined` on miss/expired
- `loreCache.set(cacheKey, entry)` — unchanged
- `loreCache.size` — unchanged (LRUCache has `.size` property)
- Remove: `evictStaleLoreEntries()` call, `LORE_CACHE_MAX_SIZE` sentinel eviction block (the `if (loreCache.size >= LORE_CACHE_MAX_SIZE)` block)
- Remove: manual TTL check `Date.now() - cached.createdAt < LORE_CACHE_TTL_MS` from the cache hit path (LRUCache handles expiry internally; `.get()` returns `undefined` for expired entries)
- `LoreCacheEntry.createdAt` field can be removed if only used for manual TTL check

**IMPORTANT note on `loreCache.size` logging:** After switching to LRUCache, `loreCache.size` reflects the count of **non-expired** items at time of `.size` access. This is fine for logging purposes.

### Pattern 5: Logout Endpoint (H-4)

**What:** No `/api/auth/logout` endpoint currently exists in `auth.ts`. Add it.

```typescript
// Source: pattern from existing refresh token deletion in /api/auth/refresh (auth.ts line 241-243)
router.post("/api/auth/logout", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken !== "string" || !refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }

  try {
    if (isRedisAvailable()) {
      await redisClient.del(`refresh:${refreshToken}`);
    } else {
      inMemoryRefreshTokens.delete(refreshToken);
    }
    res.status(200).json({ message: "logged out" });
  } catch (err) {
    logEvent("error", "auth.logout_error", {}, err);
    res.status(500).json({ error: "Logout failed" });
  }
});
```

No auth required on logout (client may call it with an expired access token). The refresh token itself is the credential being revoked. Idempotent — deleting a non-existent key is a no-op.

### Pattern 6: Lockout Counter Expiry (H-5)

**What:** Current in-memory lockout uses `Map<string, number>` (bare count). This means lockout counters never expire in the in-memory fallback — a user locked out with 5 failed attempts stays locked out forever (until server restart). The fix stores `{count, firstAttemptAt}` and checks elapsed time.

**Current (auth.ts line 22):**
```typescript
const inMemoryLoginAttempts = new Map<string, number>();
```

**Fix:**
```typescript
interface LockoutRecord {
  count: number;
  firstAttemptAt: number;
}
const inMemoryLoginAttempts = new Map<string, LockoutRecord>();
```

**Updated lookup logic in /api/auth/login:**
```typescript
// Source: pattern — mirrors Redis GETEX with TTL
if (isRedisAvailable()) {
  const raw = await redisClient.get(lockoutKey);
  attempts = raw ? parseInt(raw, 10) : 0;
} else {
  const record = inMemoryLoginAttempts.get(username);
  if (record) {
    const elapsed = (Date.now() - record.firstAttemptAt) / 1000;
    if (elapsed >= LOCKOUT_DURATION_S) {
      // Lockout expired — clear it
      inMemoryLoginAttempts.delete(username);
      attempts = 0;
    } else {
      attempts = record.count;
    }
  }
}
```

**Updated increment logic:**
```typescript
// On failed attempt (replace inMemoryLoginAttempts.set(username, attempts + 1)):
const existing = inMemoryLoginAttempts.get(username);
inMemoryLoginAttempts.set(username, {
  count: (existing?.count ?? 0) + 1,
  firstAttemptAt: existing?.firstAttemptAt ?? Date.now(),
});

// On success (clear):
inMemoryLoginAttempts.delete(username);
```

### Pattern 7: Refresh Rate Limit (M-6)

**What:** Copy `registerLimiter` pattern from `middleware/rateLimiter.ts`. Add a new `refreshLimiter` — 5 req/min per IP. Wire it in `app.ts`.

```typescript
// Source: rateLimiter.ts lines 57-65 (registerLimiter pattern)
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  store: createStore("rl:refresh:"),
  message: { error: "Too many token refresh attempts, slow down" },
});
```

**Wire in app.ts** (after the loginLimiter line):
```typescript
app.use("/api/auth/refresh", refreshLimiter);
```

### Pattern 8: Usage Tracker Periodic Timer (M-3)

**What:** `usageTracker.ts` currently relies on lazy eviction (called at the start of each `record*` function). If no records are added for a long time, stale entries accumulate. A backup `setInterval` provides cleanup during idle periods.

```typescript
// Source: pattern from evictStaleLoreEntries concept, adapted to usageTracker
// Add at module level in usageTracker.ts (after evictStaleEntries function):
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const _cleanupTimer = setInterval(() => {
  evictStaleEntries();
}, CLEANUP_INTERVAL_MS);

// Prevent the timer from keeping Node.js alive if nothing else is running
if (_cleanupTimer.unref) _cleanupTimer.unref();
```

**Testing note:** The `_testInternals` gate pattern (`process.env.NODE_ENV === "test"`) is already in place. Tests should NOT test the timer directly — test `evictStaleEntries()` in isolation (already done).

### Pattern 9: Neo4j Label Constraint (M-4)

**What:** Current Cypher query in `neo4j.ts` (line 26):
```cypher
MATCH (n)
WHERE n.name IN $entities
```

This is a full-graph scan. Adding a label makes the query index-eligible.

**Fix:**
```cypher
MATCH (n:Entity)
WHERE n.name IN $entities
```

**CRITICAL prerequisite:** The label `Entity` must match what was used when loading the lore data into Neo4j. Check `data/lore.json` or Neo4j seed scripts to confirm the actual label. If nodes use different labels (e.g., `Character`, `Location`, `Item`), the query must use `(n:Character|Location|Item)` OR a common shared label applied at load time.

**Verification needed before implementing:** Run `MATCH (n) RETURN DISTINCT labels(n) LIMIT 20` against the Neo4j instance to see actual labels.

### Pattern 10: Dead AbortController Removal (M-8)

**What:** `narrate.ts` creates an `AbortController` (line 47-48) and passes `abortController.abort()` to a `setTimeout`, but the `abortController.signal` is never passed to any fetch, Bedrock, or TTS call. The timeout fires but nothing observes the signal. The route already has explicit `clearTimeout(timeoutId)` calls in every success/error path.

**Fix:** Remove lines 47-48 from narrate.ts:
```typescript
// DELETE THESE LINES:
const abortController = new AbortController();
const timeoutId = setTimeout(() => abortController.abort(), 60_000);
```

Wait — the `timeoutId` IS used (clearTimeout). What the review actually flags is that `abortController.signal` is never wired. The AbortController is dead weight but `timeoutId` is meaningful. After deletion of AbortController, the timeout still fires but does nothing. The correct fix is: remove ONLY the `abortController` (lines creating it), leave `timeoutId` cleanup in place. Reread the original code carefully.

On re-reading narrate.ts (lines 47-49):
```typescript
const abortController = new AbortController();
const timeoutId = setTimeout(() => abortController.abort(), 60_000);
```

The `timeoutId` is cleared at every code path (`clearTimeout(timeoutId)`) — this prevents the callback from firing. So the AbortController is indeed dead: the signal is never used, and the timer is always cancelled before it fires. The timeout provides no protection.

**Fix options:**
1. Remove entire AbortController + setTimeout (simplest — M-8 as stated)
2. Wire the signal properly (out of scope for this phase)

**Implement option 1:** Remove both lines 47-48, remove all `clearTimeout(timeoutId)` calls, and remove `abortController.abort()` from the timeout callback (since both are gone). The net result is a simpler route handler.

### Pattern 11: Unused Function Removal (L-1)

**What:** `getCharacterClass` and `getPronouns` are exported from `conversationStore.ts` (lines 275-276) but NOT imported anywhere in route/service files:

```bash
# Verified: no imports of getCharacterClass or getPronouns in routes/ or services/
# They only appear in:
# - conversationStore.ts (definition + export)
# - __tests__/services/conversationStore.test.ts (test file — references the store method directly)
```

**Fix:** Remove lines 275-276 from `conversationStore.ts`. Leave the interface methods (`IConversationStore` lines 55-56) and concrete implementations (lines 146-168) intact — they are part of the interface contract and tested. Only remove the free-function re-exports at module bottom.

**Impact on tests:** The test at `conversationStore.test.ts` lines 144-167 tests `store.getCharacterClass()` and `store.getPronouns()` on a local `InMemoryConversationStore` instance — these tests test the class method directly, not the free-function exports. They will continue to pass.

### Pattern 12: SESSION_SECRET Removal (L-3)

**What:** `SESSION_SECRET` is in `config.ts` (envDefaults line 28, envSchema line 63) and `.env.example` (line 42), but nothing in the server uses `config.SESSION_SECRET`. The app uses JWT-based auth, not session cookies.

**Fix — two files:**

1. In `server/src/services/config.ts`:
   - Remove `SESSION_SECRET: ""` from `envDefaults`
   - Remove `SESSION_SECRET: z.string()` from `envSchema`

2. In `.env.example`:
   - Remove the `SESSION_SECRET=` line

**CAUTION:** After removing from `envSchema`, any deployment that has `SESSION_SECRET` set in environment will NOT cause a crash (extra env vars are ignored by Zod when using `z.object()` with `safeParse` + `...process.env` — Zod strips unknown keys by default). Verify no other files reference `config.SESSION_SECRET` before removing.

### Pattern 13: Client TTS Abort Signal (L-4)

**What:** `useSSEChat.ts` line 242 — the TTS fetch to `/api/narrate` has no abort signal. If the user clicks "Skip" while TTS is loading, the SSE chat fetch is aborted (`controller.signal` is already wired to the chat fetch at lines 95, 106) but the TTS fetch continues in the background.

**Fix:** Pass `signal: controller.signal` to the TTS fetch:
```typescript
// Source: useSSEChat.ts line 242 (current) — add signal
const ttsRes = await fetch('/api/narrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders() },
  body: JSON.stringify({ text: ttsPayload, conversationId: conversationId.current }),
  signal: controller.signal, // ADD THIS
});
```

**Catch clause impact:** The existing `catch { pushError("Voice", "Network error during narration") }` at line 267 will now also catch `AbortError`. Since skip is intentional, we should NOT show an error to the user on abort:
```typescript
} catch (err) {
  if ((err as Error).name !== 'AbortError') {
    pushError("Voice", "Network error during narration");
  }
}
```

### Pattern 14: Socket Rate Constants to Config (L-5)

**What:** `sockets/index.ts` lines 31-32 have magic numbers:
```typescript
const SOCKET_RATE_LIMIT = 30; // max events per window
const SOCKET_RATE_WINDOW_MS = 10_000; // 10 seconds
```

**Fix:** Move to `config.ts` as typed constants (not env vars — these are deployment constants, not per-environment config). Two options:
1. Add to `config.ts` as exported constants (non-env-backed)
2. Keep in `sockets/index.ts` but move to a shared constants file

The simplest approach that fits the existing pattern: export from `config.ts` as non-env constants (similar to `BEDROCK_MODEL_ID` at line 77):
```typescript
// In config.ts:
export const SOCKET_RATE_LIMIT = 30;       // max events per window
export const SOCKET_RATE_WINDOW_MS = 10_000; // 10 seconds
```

Then in `sockets/index.ts`:
```typescript
import { config, SOCKET_RATE_LIMIT, SOCKET_RATE_WINDOW_MS } from "../services/config.js";
// Remove local const declarations
```

### Pattern 15: In-Memory User Store to Map (L-6)

**What:** `inMemoryUsers` in `auth.ts` is `Array<{...}>` with O(n) `.find()` lookups. This is already combined with C-3's `Map` conversion.

**Note:** L-6 and C-3 overlap — both change `inMemoryUsers` from Array to Map. Implement both in the same code change.

```typescript
// Source: auth.ts — combined C-3 + L-6 change
type UserRecord = { userId: string; username: string; passwordHash: string };
const inMemoryUsers = new Map<string, UserRecord>(); // key = username (O(1) lookup)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU eviction for lore cache | Custom FIFO eviction with O(n) iteration | `LRUCache` from `lru-cache` (already installed) | Already handles TTL, max size, proper LRU eviction order |
| Rate limiting on refresh endpoint | Custom counter | `express-rate-limit` + `createStore()` pattern | Already has Redis fallback, standard headers |
| Atomic uniqueness check | Lua script or transactions | `hSetNX` on sentinel field | Single Redis command, atomic, sufficient for single-instance |

## Common Pitfalls

### Pitfall 1: HSETNX Signature — Single Field Only
**What goes wrong:** Developer tries `redisClient.hSetNX(key, { userId, username, passwordHash })` expecting multi-field atomic set.
**Why it happens:** `HSET` accepts an object; `HSETNX` only accepts `(key, field, value)` — three arguments.
**How to avoid:** Use `hSetNX(key, 'userId', userId)` as the sentinel check, then `hSet(key, { username, passwordHash })` if the sentinel succeeded.
**Warning signs:** TypeScript will error if passing an object to `hSetNX`.

### Pitfall 2: LRUCache TTL Check — Don't Double-Check
**What goes wrong:** After switching to LRUCache, developer keeps the manual TTL check: `if (cached && Date.now() - cached.createdAt < LORE_CACHE_TTL_MS)`.
**Why it happens:** The old Map code required this check; LRUCache `.get()` returns `undefined` for expired entries automatically.
**How to avoid:** Simply `const cached = loreCache.get(cacheKey);` — if `cached` is truthy, it's valid.
**Warning signs:** `LoreCacheEntry.createdAt` still being read after the switch.

### Pitfall 3: Forgetting `clearTimeout` After Removing AbortController
**What goes wrong:** Developer removes the `AbortController` lines but leaves the `clearTimeout(timeoutId)` calls — now `timeoutId` is undefined and `clearTimeout(undefined)` throws/is a no-op in Node.js.
**Why it happens:** `timeoutId` was defined alongside `abortController`.
**How to avoid:** Remove BOTH the AbortController AND the `setTimeout`/`clearTimeout` lines together.
**Warning signs:** `const timeoutId = setTimeout(...)` still present without `const abortController`.

### Pitfall 4: Socket.IO Auth Flip Breaks Tests
**What goes wrong:** Changing `=== 'production'` to `!== 'development'` means test environments (NODE_ENV=test) now require auth.
**Why it happens:** Tests may connect sockets without tokens.
**How to avoid:** Check test files for socket connection setup. If tests don't send tokens, update test socket setup OR keep `!== 'development'` and confirm `NODE_ENV=test` sets a token.
**Warning signs:** Socket.IO tests fail with "Authentication required".

### Pitfall 5: Neo4j Label Mismatch
**What goes wrong:** Adding `(n:Entity)` when nodes are actually labeled `(n:Character)`, `(n:Location)`, etc. — zero results from all lore queries.
**Why it happens:** Assuming label name without checking actual Neo4j schema.
**How to avoid:** Verify label with `MATCH (n) RETURN DISTINCT labels(n) LIMIT 20` before committing the Cypher change.
**Warning signs:** `rag.cache_miss` logs increase, `rag.lore_injected` logs disappear.

### Pitfall 6: setInterval Keeps Node.js Alive in Tests
**What goes wrong:** The usage tracker cleanup `setInterval` prevents tests from exiting cleanly.
**Why it happens:** `setInterval` creates a "ref'd" timer — Node.js won't exit while it's active.
**How to avoid:** Call `.unref()` on the returned timer handle, which allows Node.js to exit if nothing else is running.
**Warning signs:** Tests hang at end instead of exiting.

### Pitfall 7: Zod Error Logging Before requestId Is Available
**What goes wrong:** In `narrate.ts`, `requestId` is built AFTER the Zod parse (line 36-42 vs line 37). Logging validation errors with `requestId` may log `undefined`.
**Why it happens:** Request ID and Zod parse are close together in narrate.ts but requestId comes first; in chat.ts the parse comes BEFORE `requestId` is built.
**How to avoid:** Use `req.get("x-request-id") ?? "unknown"` or build requestId before Zod parse in chat.ts, or omit requestId from validation error log.

## Code Examples

### LRUCache for Lore (verified from tts.ts in codebase)

```typescript
// Source: server/src/services/tts.ts lines 65-70 (verified)
const ttsCache = new LRUCache<string, TTSCacheEntry>({
  maxSize: 100 * 1024 * 1024, // byte budget variant
  sizeCalculation: (entry) => entry.result.audioBuffer.byteLength,
  ttl: TTS_CACHE_TTL_MS,
  allowStale: false,
});

// For lore cache — use max (count) not maxSize (bytes):
const loreCache = new LRUCache<string, LoreCacheEntry>({
  max: 100,               // max 100 entries
  ttl: 10 * 60 * 1000,   // 10 minutes
  allowStale: false,
});
```

### hSetNX Atomic Registration (verified from @redis/client)

```typescript
// Source: @redis/client HSETNX command — confirmed available as redisClient.hSetNX()
// Returns 1 if field was set (key:field combo didn't exist), 0 if already existed
const set = await redisClient.hSetNX(`user:${username}`, 'userId', userId);
if (!set) {
  res.status(409).json({ error: "Username already taken" });
  return;
}
await redisClient.hSet(`user:${username}`, { username, passwordHash });
```

### registerLimiter Pattern (verified from rateLimiter.ts)

```typescript
// Source: server/src/middleware/rateLimiter.ts lines 57-65
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  store: createStore("rl:refresh:"),
  message: { error: "Too many token refresh attempts, slow down" },
});
```

### setInterval with unref (Node.js standard pattern)

```typescript
// Source: Node.js documentation — unref() allows process to exit if timer is only remaining thing
const _cleanupTimer = setInterval(evictStaleEntries, 60 * 60 * 1000);
if (typeof _cleanupTimer.unref === 'function') _cleanupTimer.unref();
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `Map` + manual FIFO eviction | `LRUCache` with TTL | Correct LRU semantics, O(1) eviction, no O(n) key iteration |
| `Array<UserRecord>` with `.find()` | `Map<string, UserRecord>` with `.get()` | O(1) vs O(n) lookup |
| Bare lockout count (never expires in memory) | `{count, firstAttemptAt}` with elapsed check | Lockout expires correctly |
| `hGetAll` check + `hSet` (non-atomic) | `hSetNX` sentinel + `hSet` (atomic check) | No registration race |

## Open Questions

1. **Neo4j node labels**
   - What we know: Current query uses `MATCH (n)` (no label). Adding a label is required for M-4.
   - What's unclear: What labels were used when loading `data/lore.json` into Neo4j.
   - Recommendation: Add a verification step to the M-4 task — run `MATCH (n) RETURN DISTINCT labels(n) LIMIT 20` and use the actual label. If multiple labels, use `MATCH (n) WHERE any(l IN labels(n) WHERE l IN ['Character','Location','Item'])` or apply a common `Entity` label at load time.

2. **Socket.IO test setup after H-2 flip**
   - What we know: Changing `=== 'production'` to `!== 'development'` affects `NODE_ENV=test`.
   - What's unclear: Do any tests create Socket.IO clients without JWT tokens?
   - Recommendation: Planner should add a verification step: search test files for `io()` or `io.connect()` calls and confirm they pass auth tokens (or use `NODE_ENV=development` in test config).

3. **L-1: Interface methods vs public API**
   - What we know: `getCharacterClass` and `getPronouns` appear only in conversationStore.ts exports and conversationStore.test.ts (testing the class methods, not the free-function exports).
   - What's unclear: Whether any future code (sockets, new routes added in Phase 18-05+) might call these via the free-function import.
   - Recommendation: Remove only the free-function exports at bottom of conversationStore.ts (lines 275-276). Leave the interface and class implementations intact.

## Sources

### Primary (HIGH confidence)
- Codebase inspection (`server/src/routes/auth.ts`) — confirmed current registration flow, lockout Map type, missing logout endpoint
- Codebase inspection (`server/src/routes/chat.ts`, `narrate.ts`) — confirmed Zod `details` leak
- Codebase inspection (`server/src/services/rag.ts`) — confirmed Map with FIFO eviction
- Codebase inspection (`server/src/services/tts.ts`, `musicService.ts`, `videoGenerator.ts`) — confirmed LRUCache pattern already in use
- Codebase inspection (`server/src/sockets/index.ts`) — confirmed `=== 'production'` check (H-2)
- `@redis/client` dist files — confirmed `hSetNX` exported as `redisClient.hSetNX(key, field, value)`
- `lru-cache` v11.2.6 README (installed at `/Users/blaisealbuquerque/Projects/awsHackathon/node_modules/lru-cache/`) — confirmed `max`, `ttl`, `allowStale` options
- Codebase inspection (`server/src/services/config.ts`) — confirmed `SESSION_SECRET` present in envDefaults and envSchema
- Codebase inspection (`.env.example`) — confirmed `SESSION_SECRET` line

### Secondary (MEDIUM confidence)
- Redis `HSETNX` documentation (embedded in `@redis/client` JSDoc) — `Returns 1 if field set, 0 if already existed`

### Tertiary (LOW confidence)
- Neo4j label for lore nodes — UNVERIFIED. The Cypher change for M-4 requires runtime verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and used in codebase
- Architecture: HIGH — all patterns sourced from existing codebase files
- Pitfalls: HIGH — identified from actual code paths in current implementation
- Neo4j label (M-4): LOW — runtime verification required

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days — stable libraries, no active churn)
