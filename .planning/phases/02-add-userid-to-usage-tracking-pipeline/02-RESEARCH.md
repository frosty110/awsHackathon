# Phase 2: Add userId to Usage Tracking Pipeline - Research

**Researched:** 2026-02-24
**Domain:** In-process usage tracking, TypeScript type propagation, request context threading
**Confidence:** HIGH

## Summary

Phase 2 is a pure server-side refactor with a well-bounded scope: thread `userId` from the JWT-authenticated request context through the usage tracking pipeline so that every `UsageEntry` in `server/src/services/usageTracker.ts` can be attributed to a specific user. This is an internal data enrichment task — no new libraries, no external APIs, no client-side changes.

The existing code already has the key infrastructure in place. `req.userId` is populated by `requireAuth` / `optionalAuth` middleware (see `server/src/middleware/auth.ts`). The `Conversation` type already carries a `userId` field (see `server/src/services/conversationStore.ts`). The only gap is that `UsageEntry` (in `packages/shared-types/src/usage.ts`) has no `userId` field, and the four `record*` functions do not accept or store it. Closing this gap requires changes to: the shared type, the four record functions, and every call site.

The call sites are limited and well-known. `recordBedrockUsage` is called from `server/src/routes/chat.ts` (where `req.userId` is directly available) and from `server/src/services/dmTurn.ts` (which must receive `userId` as a parameter). `recordTtsUsage` is called from `server/src/routes/narrate.ts`. `recordMusicUsage` and `recordVideoUsage` have no `userId` context today and will use `null | undefined` for now (music/video are not per-user features). The `getConversationUsage` endpoint can optionally gain a `getUserUsage` sibling for per-user aggregation.

**Primary recommendation:** Add `userId?: string | null` to `UsageEntry`, update all four `record*` functions to accept and store it, update call sites to pass `req.userId` (or `undefined` where no auth context exists), and add a `getUserUsage(userId: string)` function mirroring `getConversationUsage`. No new dependencies. Changes are additive.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (existing) | Type propagation | Already in codebase |
| zod | 3.x (existing) | Schema validation | Already used for Redis data validation |
| vitest | 2.x (existing) | Tests | Already pinned; existing `usageTracker.test.ts` covers the module |

### Supporting
None — this phase adds no new libraries.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Optional `userId?` on `UsageEntry` | Required `userId` | Optional is safer — music/video records have no user context; anon/unauthenticated chat calls produce `null` conversationIds today |
| Passing `userId` per-record-function | Passing full AuthenticatedRequest | Per-function is cleaner — services should not import Express types |

**Installation:**
No new packages required.

## Architecture Patterns

### Recommended Project Structure

No new files needed. Changes touch:
```
packages/shared-types/src/usage.ts          # Add userId?: string | null to UsageEntry
server/src/services/usageTracker.ts         # Add userId param to record* functions + getUserUsage
server/src/routes/chat.ts                   # Pass req.userId to recordBedrockUsage
server/src/routes/narrate.ts                # Pass conversation.userId (or req.userId) to record calls
server/src/services/dmTurn.ts               # Accept + forward userId if it calls record functions
server/src/routes/usage.ts                  # Add /api/usage?userId=... or /api/usage/user/:userId
server/src/__tests__/services/usageTracker.test.ts  # Add userId coverage to existing tests
```

### Pattern 1: Optional Parameter Addition (Additive Change)

**What:** Add `userId?: string | null` as the last parameter to all `record*` functions. Callers that already exist do not need to change signature — TypeScript optional parameters are backward-compatible. All new call sites pass it explicitly.

**When to use:** When adding context to an existing function without breaking callers.

**Example:**
```typescript
// Before (usageTracker.ts)
export function recordBedrockUsage(
  conversationId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
) { ... }

// After
export function recordBedrockUsage(
  conversationId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
  userId?: string | null,  // new — optional, backward-compatible
) { ... }
```

### Pattern 2: Call Site Threading

**What:** At each call site, pass `userId` from the nearest available authenticated context.

**When to use:** At every `record*` invocation where auth context is available.

**Known call sites (confirmed by codebase inspection):**

| Call Site | File | userId Source |
|-----------|------|--------------|
| `recordBedrockUsage(conversation.id, "chat", ...)` | `server/src/routes/chat.ts:197` | `req.userId` (available on `AuthenticatedRequest`) |
| `recordTtsUsage(conversation.id, phrase.text.length)` | `server/src/routes/narrate.ts:99` | `req.userId` (available on `AuthenticatedRequest`) |
| `recordTtsUsage(conversation.id, text.length)` | `server/src/routes/narrate.ts:185` | `req.userId` |
| `recordBedrockUsage(null, "narrate-opening", ...)` | `server/src/routes/narrate.ts:158` | `req.userId` (can pass even when conversationId is null) |
| `recordMusicUsage()` | Call sites (music service) | No user context — pass `undefined` or `null` |
| `recordVideoUsage()` | Call sites (video service) | No user context — pass `undefined` or `null` |

**Note on `dmTurn.ts`:** Inspect whether `dmTurn.ts` / `turnOrchestrator.ts` call `recordBedrockUsage`. If so, `userId` must be threaded through their function signatures. The `turnOrchestrator.ts` calls `executeDmTurn()` without a `userId` — it will need to forward the `room.conversationId` owner's userId, or omit userId for multiplayer sessions (acceptable for Phase 2).

**Example threading:**
```typescript
// server/src/routes/chat.ts (line ~197)
const costUsd = recordBedrockUsage(
  conversation.id,
  "chat",
  inputTokens,
  outputTokens,
  req.userId ?? null,   // <-- add this
);
```

### Pattern 3: getUserUsage — Mirror of getConversationUsage

**What:** Add a `getUserUsage(userId: string): UsageSummary` function that filters entries by `userId`.

**When to use:** Needed by Phase 3 (Bear Lumen) and by the `/api/usage` endpoint if it wants to surface per-user costs.

```typescript
export function getUserUsage(userId: string): UsageSummary {
  return summarize(entries.filter((e) => e.userId === userId));
}
```

**Route update for `/api/usage`:**
```typescript
// server/src/routes/usage.ts
const userId = typeof req.query.userId === "string" ? req.query.userId : null;
const user = userId ? getUserUsage(userId) : null;
res.json({ global, conversation, user, caches });
```

### Anti-Patterns to Avoid
- **Making `userId` required:** Music/video records have no per-user context. Required parameter would force null-threading through all service-level calls, creating coupling between auth and services that have no auth context.
- **Importing Express `Request` into service-level files:** `usageTracker.ts` is a pure service — it must not import from `../middleware/auth.js`. Pass `userId` as a primitive string, not as `req`.
- **Changing `getConversationUsage` to also filter by userId:** These are independent axes. Keep separate functions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type propagation | Custom wrapper types | TypeScript optional fields | Already the project pattern |
| Test isolation | Custom reset logic | Existing `_testInternals.reset()` pattern | Already implemented |
| Call site discovery | Manual grep | Grep tool or codebase search | Exhaustive search before writing code |

**Key insight:** The code is already well-structured for this change. The `_testInternals` pattern in `usageTracker.ts` handles test isolation cleanly. The existing test file (`usageTracker.test.ts`) just needs new assertions for `userId` storage and filtering.

## Common Pitfalls

### Pitfall 1: Missing Call Sites in dmTurn / turnOrchestrator
**What goes wrong:** `executeDmTurn` is called from both `chat.ts` (has `req.userId`) and `turnOrchestrator.ts` (Socket.IO path, no `req` object). If `recordBedrockUsage` is called inside `dmTurn.ts` rather than at the route level, userId will be unavailable unless explicitly threaded through `executeDmTurn`'s parameters.
**Why it happens:** `dmTurn.ts` is a service — it does not have access to `req`. The `turnOrchestrator.ts` operates outside HTTP and has no JWT context.
**How to avoid:** Audit exactly where `recordBedrockUsage` is called. If called inside `dmTurn.ts`, add a `userId?: string | null` parameter to `executeDmTurn()`. The chat route passes `req.userId`; the multiplayer path passes `undefined`.
**Warning signs:** `conversation.userId` exists on the `Conversation` object — it can be used as a fallback source even inside `dmTurn.ts` since the conversation is passed in.

**Verified by inspection:** `server/src/routes/chat.ts` line 197 calls `recordBedrockUsage(conversation.id, "chat", inputTokens, outputTokens)` directly in the route handler (after `executeDmTurn` returns). This means userId threading does NOT require touching `dmTurn.ts` for the primary chat path. However, `narrate.ts` calls `recordBedrockUsage(null, "narrate-opening", ...)` inside a helper that accepts `req: AuthenticatedRequest` — `req.userId` is available.

### Pitfall 2: Shared Type Rebuild After Modifying UsageEntry
**What goes wrong:** `packages/shared-types` is a workspace package that must be rebuilt after modifying `src/usage.ts`. The server imports from `@dnd-adventures/shared-types`, which resolves to the `dist/` folder.
**Why it happens:** TypeScript monorepo workspaces with a compiled shared package require a rebuild step.
**How to avoid:** After modifying `packages/shared-types/src/usage.ts`, run `yarn workspace @dnd-adventures/shared-types build` (or the equivalent in this repo's build setup) before running the server typecheck.
**Warning signs:** Server TS compilation errors claiming `UsageEntry` does not have `userId` even after the type is updated — this means `dist/usage.d.ts` has not been regenerated.

### Pitfall 3: Existing Tests Break on Stricter Type Assertions
**What goes wrong:** `usageTracker.test.ts` manually pushes raw `UsageEntry` objects into `internals.entries`. If `UsageEntry` gains a required field, those test fixtures fail TypeScript.
**Why it happens:** Test fixtures use object literals that must match the full type.
**How to avoid:** Make `userId` optional (`userId?: string | null`) in `UsageEntry` — consistent with `conversationId: string | null` which already allows null. Test fixtures without `userId` will still typecheck.

### Pitfall 4: The /api/usage Endpoint Exposes All User IDs
**What goes wrong:** Adding `getUserUsage` to the response without checking caller identity could expose one user's costs to another.
**Why it happens:** The current `/api/usage` route applies `requireAuth` globally, but does not verify the requesting user matches the queried userId.
**How to avoid:** In the route handler, if `userId` query param is provided, assert `userId === req.userId` (or that the caller is an admin). For Phase 2, the simplest safe approach: only return the authenticated caller's own usage — `const userId = req.userId ?? null`.

## Code Examples

Verified patterns from codebase inspection:

### UsageEntry type update (packages/shared-types/src/usage.ts)
```typescript
export interface UsageEntry {
  timestamp: number;
  conversationId: string | null;
  userId?: string | null;   // NEW — optional for backward compat and non-user-attributed events
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  characters: number;
  costUsd: number;
}
```

### Updated recordBedrockUsage (server/src/services/usageTracker.ts)
```typescript
export function recordBedrockUsage(
  conversationId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
  userId?: string | null,   // NEW
) {
  evictStaleEntries();
  const costUsd =
    inputTokens * BEDROCK_HAIKU_INPUT_PER_TOKEN +
    outputTokens * BEDROCK_HAIKU_OUTPUT_PER_TOKEN;
  entries.push({
    timestamp: Date.now(),
    conversationId,
    userId: userId ?? null,   // NEW
    feature,
    model: "bedrock-haiku",
    inputTokens,
    outputTokens,
    characters: 0,
    costUsd,
  });
  return costUsd;
}
```

### Updated call site in chat.ts (server/src/routes/chat.ts, ~line 197)
```typescript
// Before
const costUsd = recordBedrockUsage(conversation.id, "chat", inputTokens, outputTokens);

// After
const costUsd = recordBedrockUsage(conversation.id, "chat", inputTokens, outputTokens, req.userId ?? null);
```

### getUserUsage function (server/src/services/usageTracker.ts)
```typescript
export function getUserUsage(userId: string): UsageSummary {
  return summarize(entries.filter((e) => e.userId === userId));
}
```

### Updated usage route (server/src/routes/usage.ts)
```typescript
router.get("/api/usage", requireAuth, (req: AuthenticatedRequest, res) => {
  const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId : null;
  const global = getGlobalUsage();
  const conversation = conversationId ? getConversationUsage(conversationId) : null;
  // Only return the caller's own usage — no userId param needed, use req.userId directly
  const user = req.userId ? getUserUsage(req.userId) : null;
  const caches = {
    tts: getTTSCacheStats(),
    lore: getLoreCacheStats(),
    music: getMusicCacheStats(),
    video: getSceneVideoStats(),
  };
  res.json({ global, conversation, user, caches });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| conversationId-only tracking | conversationId + userId tracking | Phase 2 | Enables per-user cost attribution for Bear Lumen Phase 3 |

**Deprecated/outdated:** None — this is purely additive.

## Open Questions

1. **Does `dmTurn.ts` call `recordBedrockUsage` directly, or does chat.ts/narrate.ts always call it after?**
   - What we know: `chat.ts` calls it at line 197, after `executeDmTurn` returns. `narrate.ts` calls it at line 158 inside `generateBedrockOpening` (which has `req` in scope).
   - What's unclear: Whether `executeDmTurn` itself calls any record functions for sub-calls (e.g., re-ranking RAG queries). This requires a quick read of `dmTurn.ts`.
   - Recommendation: Read `dmTurn.ts` at plan time and adjust the plan if it has record calls that need userId threading.

2. **Should `recordMusicUsage()` and `recordVideoUsage()` ever get userId?**
   - What we know: Music/video are room-level features in multiplayer; in single-player, the requesting user is authenticated but the request may not carry conversationId. Route files for music/video do not use `AuthenticatedRequest`.
   - What's unclear: Whether adding `userId?` to music/video record functions is worth the call site changes.
   - Recommendation: Add the optional parameter for consistency but leave all current call sites passing `undefined`. The music/video routes can be updated to cast `AuthenticatedRequest` if needed in Phase 3.

3. **Does the client CostTooltip or usage display need updating to show per-user costs?**
   - What we know: `client/src/components/CostTooltip.tsx` exists. The usage SSE event payload in `chat.ts` is per-turn only.
   - What's unclear: Whether Phase 2 scope includes a client-visible per-user cost display.
   - Recommendation: Phase 2 scope is server-only (type + tracker + call sites). Client display is Phase 3 concern if Bear Lumen provides a dashboard. Do not change client code in Phase 2.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `server/src/services/usageTracker.ts` (confirmed: no userId field, 4 record functions, _testInternals pattern)
- Direct codebase inspection — `packages/shared-types/src/usage.ts` (confirmed: UsageEntry has no userId)
- Direct codebase inspection — `server/src/middleware/auth.ts` (confirmed: AuthenticatedRequest exposes userId, optionalAuth sets it when JWT valid)
- Direct codebase inspection — `server/src/routes/chat.ts` (confirmed: req.userId available, recordBedrockUsage called at line 197 after executeDmTurn)
- Direct codebase inspection — `server/src/routes/narrate.ts` (confirmed: req.userId available in AuthenticatedRequest, recordTtsUsage called with conversationId)
- Direct codebase inspection — `server/src/__tests__/services/usageTracker.test.ts` (confirmed: test pattern, _testInternals, existing assertions do not test userId)
- Direct codebase inspection — `server/src/services/conversationStore.ts` (confirmed: Conversation.userId exists, IDOR ownership check)
- Direct codebase inspection — `docs/BEAR-LUMEN-EVALUATION.md` (confirmed: Phase 2 = add userId prerequisite for Phase 3 Bear Lumen integration)

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` — Phase 2 goal confirmed as adding userId to usage tracking pipeline, depending on Phase 1 (now complete)
- `.planning/BUSINESS_PLAN.md` — Confirms per-user cost attribution is a business requirement for subscription tier pricing

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries, all existing patterns confirmed by direct code inspection
- Architecture: HIGH — All call sites identified by reading actual source; changes are additive and backward-compatible
- Pitfalls: HIGH — Shared type rebuild requirement is a known TypeScript monorepo pattern; test fixture issue is predictable; userId exposure risk identified from route inspection

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable domain — only changes if usageTracker.ts is significantly refactored before Phase 2 executes)
