# Phase 1: Session Persistence & Save/Resume - Research

**Researched:** 2026-02-23
**Domain:** Game state persistence — Redis key design, REST API for save/resume, React save-slot UI
**Confidence:** HIGH (codebase is fully readable; Redis/S3/auth stack verified in source)

---

## Summary

The existing codebase has near-complete infrastructure for session persistence: Redis stores
conversations under `conv:<uuid>` keys with a 7-day idle TTL, S3 handles durable media cache,
JWT auth ties every request to a `userId`, and the IDOR ownership check already pins
conversations to their owning user. The single gap is that there is no way for a player to
**list their saved sessions** or **resume one by name/slot**. The `conversationId` is never
associated with a user-visible label, and the client discards it on `reset()`.

The implementation adds two thin layers:
1. **Server** — a `saves:` Redis index per user that maps `conversationId` to save metadata
   (name, class, pronouns, turn count, savedAt, lastPlayedAt), plus REST endpoints to
   CRUD those save records. The conversations themselves are unchanged — the save index is
   purely a pointer and name lookup.
2. **Client** — a "Saved Adventures" screen on the Mode Select page that lists saves and
   resumes by injecting the `conversationId` back into `useSSEChat`.

Both single-player and multiplayer sessions are in scope. Multiplayer resumption is
simpler: restore the conversation history, reconnect players to a new room with the old
`conversationId`. Room phase and player roster do not survive across sessions.

**Primary recommendation:** Use Redis sorted sets (`ZADD` by timestamp) as the per-user save
index (`saves:<userId>`), with each save's metadata stored as a Redis hash
(`save:<userId>:<conversationId>`). Keep the conversation blob unchanged. Add four REST
endpoints under `/api/saves`. Maximum 10 saves per user; enforce at write time.

---

## Standard Stack

### Core (already in repo — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `redis` (node-redis) | ^5.11.0 | Sorted set for save index + hash per save | Already connected, Zod-validated, fallback patterns established |
| `zod` | ^4.0.0 | Validate save name input | Already used project-wide for request validation |
| `jsonwebtoken` | ^9.0.3 | Auth — `req.userId` available via `requireAuth` | Existing middleware pattern |
| `@aws-sdk/client-s3` | ^3.995.0 | S3 client already configured | S3 bucket exists; `mediaCache.ts` pattern to copy |

### No New Dependencies

No new packages needed. All infrastructure (Redis, S3, JWT, Zod, Express) is already
wired. This phase is purely additive — new routes, new Redis keys, new React screen.

**Installation:**
```bash
# No new packages required
```

---

## Architecture Patterns

### Redis Key Namespace (fits existing conventions)

Existing keys in this codebase:
- `conv:<conversationId>` — conversation blob (string, JSON)
- `user:<username>` — user credentials (hash)
- `refresh:<token>` — refresh token (string, JSON)
- `rl:*` — rate limiter prefixes

New keys to add:
```
saves:<userId>               # Sorted set: score=savedAt timestamp, member=conversationId
save:<userId>:<conversationId>  # Hash: { name, characterClass, pronouns, turnCount, savedAt, lastPlayedAt }
```

Using a sorted set for the index means `ZREVRANGE saves:<userId> 0 9` returns the 10 most
recent saves without any cursor pagination. `ZADD` with `lastPlayedAt` score keeps the
sorted order fresh on resume.

### Recommended File Structure (additions only)

```
server/src/
├── routes/
│   └── saves.ts            # New: CRUD save-slot REST API
├── services/
│   └── saveStore.ts        # New: Redis save index read/write (mirrors conversationStore.ts pattern)
└── app.ts                  # Modify: mount saves router + requireAuth

client/src/
├── components/
│   └── SaveSlotList.tsx     # New: list + resume + delete save UI
├── services/
│   └── saves.ts            # New: fetch wrappers for /api/saves
└── App.tsx                  # Modify: add 'savedGames' app state, wire resume into useSSEChat
```

### Pattern 1: Sorted Set Save Index

**What:** Per-user sorted set of `conversationId` members, scored by `lastPlayedAt` Unix ms.
**When to use:** When you need ordered list of saves per user without scanning all save hashes.

```typescript
// Source: existing redis.ts + auth.ts patterns in this codebase
// server/src/services/saveStore.ts

const MAX_SAVES = 10;

export async function upsertSave(
  userId: string,
  conversationId: string,
  meta: SaveMeta
): Promise<void> {
  if (!isRedisAvailable()) {
    inMemorySaves.set(`${userId}:${conversationId}`, meta);
    return;
  }
  const indexKey = `saves:${userId}`;
  const hashKey  = `save:${userId}:${conversationId}`;
  const now = Date.now();

  await redisClient.hSet(hashKey, {
    name:           meta.name,
    characterClass: meta.characterClass ?? '',
    pronouns:       meta.pronouns ?? '',
    turnCount:      String(meta.turnCount),
    savedAt:        meta.savedAt ? String(meta.savedAt) : String(now),
    lastPlayedAt:   String(now),
  });
  // No TTL on the hash — save persists until explicitly deleted or user deletes
  // The index expires after 365 days idle; hash keys are cleaned up when save is deleted.

  // Add/update in sorted set (score = lastPlayedAt)
  await redisClient.zAdd(indexKey, { score: now, value: conversationId });

  // Enforce per-user limit: trim oldest saves beyond MAX_SAVES
  const count = await redisClient.zCard(indexKey);
  if (count > MAX_SAVES) {
    const toRemove = await redisClient.zRange(indexKey, 0, count - MAX_SAVES - 1);
    for (const id of toRemove) {
      await redisClient.del(`save:${userId}:${id}`);
    }
    await redisClient.zRemRangeByRank(indexKey, 0, count - MAX_SAVES - 1);
  }
}

export async function listSaves(userId: string): Promise<SaveRecord[]> {
  if (!isRedisAvailable()) {
    // return in-memory fallback filtered by userId
    return [];
  }
  const indexKey = `saves:${userId}`;
  // Returns newest first (rev order)
  const ids = await redisClient.zRange(indexKey, 0, -1, { REV: true });
  const saves: SaveRecord[] = [];
  for (const id of ids) {
    const raw = await redisClient.hGetAll(`save:${userId}:${id}`);
    if (raw.name) saves.push({ conversationId: id, ...raw } as SaveRecord);
  }
  return saves;
}

export async function deleteSave(userId: string, conversationId: string): Promise<void> {
  if (!isRedisAvailable()) return;
  await redisClient.del(`save:${userId}:${conversationId}`);
  await redisClient.zRem(`saves:${userId}`, conversationId);
}
```

### Pattern 2: REST Endpoints

**What:** Four routes under `/api/saves`, all behind `requireAuth`.

```typescript
// Source: mirrors existing routes/chat.ts + routes/usage.ts patterns
// server/src/routes/saves.ts

// GET  /api/saves            — list current user's saves (up to 10)
// POST /api/saves            — create or update a save (body: { conversationId, name })
// PUT  /api/saves/:id/name   — rename a save slot
// DELETE /api/saves/:id      — delete a save slot (does NOT delete the conversation)
```

**Request body for POST /api/saves:**
```typescript
const saveBodySchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(50).trim(),
});
```

**IDOR enforcement:** Every save endpoint checks that the `conversationId` in the save index
belongs to `req.userId` — reuse the `ConversationOwnershipError` pattern from `conversationStore.ts`.

### Pattern 3: Client Resume Flow

**What:** Inject `conversationId` into `useSSEChat` without going through startAdventure.

```typescript
// client/src/hooks/useSSEChat.ts — add a resumeSession function
const resumeSession = useCallback(
  (conversationId: string, characterClass?: CharacterClass, pronouns?: string) => {
    // Set refs that normally come from startAdventure
    conversationIdRef.current = conversationId;
    if (characterClass) characterClassRef.current = characterClass;
    if (pronouns) pronounsRef.current = pronouns;
    // messages state stays empty — first real sendMessage fetches from server
  },
  []
);
```

The server already has the full conversation history in Redis. No client-side replay of
messages is needed unless you want to display conversation history on resume (see Open Questions).

### Anti-Patterns to Avoid

- **Storing full conversation history in the save hash:** The conversation blob is already
  in `conv:<conversationId>`. Don't duplicate it. The save hash holds only metadata.
- **Scanning Redis with KEYS:** Never use `KEYS saves:*` in production — use the sorted set
  index per user. The existing codebase never uses KEYS.
- **Auto-saving on every turn:** Too many writes. Auto-save after every DM response is a
  UX feature, but the implementation should batch/debounce: save after DM turn, not on
  every user message.
- **Deleting the conversation when the save is deleted:** A save slot is just a named
  pointer. Delete the save metadata but leave `conv:<conversationId>` to expire naturally
  (7-day TTL from conversationStore).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-user ordered save list | Custom sorted array in Redis string | `ZADD` / `ZRANGE` sorted set | Atomic rank trimming, O(log N) insert, O(1) cardinality |
| Input validation on save name | Manual regex check | Zod schema (already in project) | Consistent with all other routes |
| IDOR check on save access | Ad-hoc userId compare | `ConversationOwnershipError` from conversationStore | Same pattern, same error handling |
| In-memory fallback for saves | Full parallel implementation | Simple `Map<string, SaveMeta>` | Saves are best-effort when Redis is down; don't block play |

**Key insight:** The save system is a thin metadata index on top of the existing conversation
infrastructure. Over-engineering it (S3-backed saves, database tables, complex versioning)
adds latency and complexity for no user-visible gain given the 7-day Redis TTL already in place.

---

## Common Pitfalls

### Pitfall 1: Save Slot Limit Not Enforced Atomically

**What goes wrong:** Two concurrent save requests race to check count; both pass the limit
check and both write, resulting in 11 saves.
**Why it happens:** Non-atomic read-then-write.
**How to avoid:** Use a Lua script or accept the occasional +1 overage and trim in the next
write. For 1000 users the race window is negligible; trimming on every write (as shown in
the pattern above) is sufficient.
**Warning signs:** `ZCARD saves:<userId>` returns 11 or 12.

### Pitfall 2: Resume Returns Empty Chat Window

**What goes wrong:** Player resumes a save but the chat window is blank because messages
are in Redis but not fetched to the client.
**Why it happens:** The resume flow skips `startAdventure`; no initial message payload
is returned to the client.
**How to avoid:** Add a `GET /api/conversations/:id/history` endpoint (or use the existing
conversation data returned by the chat endpoint's first SSE event) to fetch the last N
messages for display. Alternatively, accept the blank window and show a "You resume your
adventure..." prompt, which is a valid D&D UX choice.
**Warning signs:** User sees empty chat after clicking Resume.

### Pitfall 3: Orphaned Save Index After Conversation TTL Expiry

**What goes wrong:** A save slot points to a `conv:<id>` that Redis evicted after 7 days idle.
Resume succeeds at the API level (the save hash exists) but the conversation is empty.
**Why it happens:** Save hash has no TTL; conversation TTL is 7 days.
**How to avoid:** On resume, call `conversationStore.getOrCreate(conversationId, userId)`.
If the conversation is empty (0 history), inform the user that this save has expired. The
`getOrCreate` will create a fresh conversation under that same ID, so the save slot can be
refreshed.
**Warning signs:** Resume produces "Welcome to your adventure!" opening despite being an old save.

### Pitfall 4: Multiplayer Room State Cannot Be Resumed

**What goes wrong:** A multiplayer save is "resumed" but room phase and player roster are
gone because `roomStore` is in-memory only.
**Why it happens:** Only `conversationId` is saved — room metadata is ephemeral.
**How to avoid:** Be explicit in the UI that multiplayer "resume" means: restore conversation
history, start a new room with same `conversationId`. Players must re-join via new room code.
Document this in the save slot UX ("Your adventure history is preserved — your party must
re-assemble").
**Warning signs:** User expects same room code to work after server restart.

### Pitfall 5: Save Name XSS on Render

**What goes wrong:** Save name `<script>alert(1)</script>` is stored and rendered unsafely.
**Why it happens:** Save names are user-provided strings displayed in the UI.
**How to avoid:** Zod schema trims and max-lengths the name; React renders it as text (not
innerHTML). Both layers are needed.
**Warning signs:** Raw HTML tags visible in save list.

---

## Code Examples

Verified patterns from this codebase (all confirmed by source read):

### Existing Redis Key Namespaces to Follow

```typescript
// Source: server/src/services/conversationStore.ts (line 47-49)
function redisKey(conversationId: string): string {
  return `conv:${conversationId}`;
}

// Source: server/src/routes/auth.ts (line 37, 80)
// refresh:<token>        — refresh token string
// user:<username>        — user credentials hash
```

New keys must follow the same `<domain>:<identifier>` convention:
```
saves:<userId>                      # sorted set
save:<userId>:<conversationId>      # hash
```

### Zod Validation Pattern (from existing routes)

```typescript
// Source: server/src/routes/chat.ts (line 19-24)
const chatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  characterClass: z.string().optional(),
  pronouns: z.string().optional(),
});

// Apply same pattern for saves route:
const saveBodySchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(50).trim(),
});
```

### requireAuth + Route Mount Pattern

```typescript
// Source: server/src/app.ts (lines 43-47)
app.use("/api/chat", requireAuth, chatRateLimiter);
// ...
app.use(chatRouter);

// Apply same pattern:
app.use("/api/saves", requireAuth);
app.use(savesRouter);
```

### In-Memory Fallback Pattern

```typescript
// Source: server/src/routes/auth.ts (line 15-18)
// In-memory fallback when Redis is unavailable
type UserRecord = { userId: string; username: string; passwordHash: string };
const inMemoryUsers = new Map<string, UserRecord>();

// Pattern: check isRedisAvailable() first, fall back to Map
```

### Auto-Save After DM Turn

```typescript
// Source: server/src/routes/chat.ts (line 206) — assistant message is persisted in executeDmTurn
// Auto-save hook: call upsertSave after fullText is confirmed
if (fullText && conversation.userId) {
  const existingSave = await saveStore.findByConversationId(conversation.userId, conversation.id);
  if (existingSave) {
    // Update lastPlayedAt and turnCount without renaming
    await saveStore.upsertSave(conversation.userId, conversation.id, {
      ...existingSave,
      turnCount: (conversation.history.length / 2) | 0,
    });
  }
  // If no save exists for this conversation, don't auto-create — player must explicitly save
}
```

### Client: Auth Header Pattern (for saves fetch calls)

```typescript
// Source: client/src/services/auth.ts (line 33-35)
export function authHeaders(): HeadersInit {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

// Use in saves.ts service:
const res = await fetch(`${API_BASE}/api/saves`, {
  headers: { ...authHeaders() },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Conversation TTL only — loss on eviction | Explicit save slot index + user-visible list | This phase | Players choose what to keep |
| Client re-creates conversationId on every reset | Client stores conversationId in saved slot, resumes by injecting it | This phase | No re-send of history needed |
| No save name | User-defined name (max 50 chars) | This phase | Players name their campaigns |

**Nothing deprecated or outdated** in the current stack for this feature. The `node-redis` v5
API (ZADD, ZRANGE with REV option, HSET, HGETALL) is current as of Feb 2026 and matches
the version already installed.

---

## Open Questions

1. **Display conversation history on resume**
   - What we know: The conversation blob is in Redis; the client has no copy after page reload.
   - What's unclear: Should resume show the last N messages, or start with a blank window + contextual prompt?
   - Recommendation: Start with blank window + server-generated "You resume your adventure..." DM message (simplest, avoids `/history` endpoint). Planner can offer this as a plan option.

2. **Multiplayer save behavior**
   - What we know: Room state is ephemeral; conversation history persists.
   - What's unclear: Whether the UI should differentiate SP vs MP saves or treat them identically.
   - Recommendation: Treat identically in the backend (both are `conversationId` + metadata). Add `mode: 'single' | 'multi'` field to the save hash for display purposes.

3. **Auto-save vs explicit save**
   - What we know: Turn-by-turn auto-save on every DM response adds write latency.
   - What's unclear: Whether auto-save is desired or if explicit "Save Game" button is sufficient.
   - Recommendation: Explicit save button in the UI (simpler to implement, less Redis write amplification). Auto-save can be a follow-up.

4. **Save expiry alignment**
   - What we know: Conversations expire after 7 days idle; save hashes have no TTL.
   - What's unclear: Should save hashes also expire after 7 days (matching conversation TTL)?
   - Recommendation: Set save hash TTL to 90 days (independent of conversation activity) so players see their saved campaigns even after a break, but get a "save expired" message on resume if conversation was evicted.

---

## Sources

### Primary (HIGH confidence — verified by direct source read)

- `/server/src/services/conversationStore.ts` — existing Redis key patterns, TTL, ownership checks, Zod validation, in-memory fallback
- `/server/src/routes/auth.ts` — existing sorted set / hash key patterns (`user:`, `refresh:`), route structure
- `/server/src/app.ts` — `requireAuth` middleware mount pattern
- `/server/src/services/redis.ts` — `isRedisAvailable()` fallback pattern, node-redis v5 API
- `/server/src/services/mediaCache.ts` — S3 client pattern (reference only; S3 not needed for this phase)
- `/client/src/hooks/useSSEChat.ts` — conversationId ref, reset(), startAdventure() lifecycle
- `/client/src/services/auth.ts` — authHeaders(), restoreAuth() for client API calls

### Secondary (MEDIUM confidence — official docs + community sources)

- [Redis LLM Message History docs](https://redis.io/docs/latest/develop/ai/redisvl/user_guide/message_history/) — confirmed sorted set / session_tag pattern for per-user conversation indexing
- [Redis Anti-Patterns](https://redis.io/tutorials/redis-anti-patterns-every-developer-should-avoid/) — confirmed: never use KEYS in production, use index structures
- [REST API Best Practices - Stack Overflow Blog](https://stackoverflow.blog/2020/03/02/best-practices-for-rest-api-design/) — plural noun route naming (`/api/saves`)

### Tertiary (LOW confidence — general guides, not project-specific)

- [Redis Strings vs Hashes comparison](https://moldstud.com/articles/p-redis-strings-vs-hashes-which-data-structure-is-best-for-your-application) — hash recommended for multi-field objects; consistent with approach used in `user:<username>` in this codebase
- [React localStorage persistence pattern](https://www.joshwcomeau.com/react/persisting-react-state-in-localstorage/) — `localStorage` for save list cache on client side (optional optimization, not required for V1)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; everything verified in existing source
- Architecture: HIGH — key design derived directly from existing codebase conventions
- Pitfalls: HIGH — derived from known Redis/game-state patterns + direct code inspection
- Open questions: MEDIUM — design choices pending planner/user decisions

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable patterns; node-redis v5 and Redis sorted set API are stable)
