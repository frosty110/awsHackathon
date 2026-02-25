---
phase: 18-code-review-bug-fixes-wave-2
plan: "01"
subsystem: security
tags:
  - idor
  - jwt
  - auth
  - conversation-ownership
dependency_graph:
  requires:
    - "17-01 (requireAuth on game routes)"
    - "09-03 (auth middleware pattern)"
  provides:
    - "IDOR prevention: userId ownership bound to conversations"
    - "Random dev JWT secret per process"
    - "/api/usage requires authentication"
  affects:
    - "server/src/services/conversationStore.ts"
    - "server/src/routes/chat.ts"
    - "server/src/routes/narrate.ts"
    - "server/src/middleware/auth.ts"
    - "server/src/routes/usage.ts"
    - "server/src/app.ts"
tech_stack:
  added: []
  patterns:
    - "ConversationOwnershipError custom error class for cross-user access rejection"
    - "Migration path: legacy conversations (no userId) claimed on first authenticated access"
    - "Double-enforcement pattern: requireAuth in both route file and app.ts"
key_files:
  created: []
  modified:
    - server/src/services/conversationStore.ts
    - server/src/routes/chat.ts
    - server/src/routes/narrate.ts
    - server/src/middleware/auth.ts
    - server/src/routes/usage.ts
    - server/src/app.ts
    - server/src/__tests__/services/conversationStore.test.ts
decisions:
  - "userId added as second parameter to getOrCreate (after conversationId, before characterClass/pronouns) — positional shift preserves existing call patterns"
  - "Migration path for legacy conversations: no userId set means first authenticated caller claims ownership — prevents false 403s on existing sessions"
  - "ConversationOwnershipError re-thrown through Redis catch block to prevent swallowing ownership errors as Redis errors"
  - "crypto.randomBytes(32) generated once at module load (not per-call) — stable within a process, invalidated on restart"
  - "Double-enforcement of auth on /api/usage: requireAuth in route file AND app.ts middleware — matches established codebase pattern for chat/narrate"
metrics:
  duration: "~7 minutes"
  completed: "2026-02-23"
  tasks_completed: 2
  files_modified: 7
---

# Phase 18 Plan 01: IDOR Fix, Random Dev JWT Secret, Usage Auth Summary

IDOR conversation ownership binding, random dev JWT secret via crypto.randomBytes, and requireAuth on /api/usage route.

## What Was Built

### Task 1: IDOR Fix — Conversation Ownership Binding

Added `userId` ownership to conversations to prevent cross-user access (IDOR vulnerability):

**`server/src/services/conversationStore.ts`:**
- Added `userId?: string` to `Conversation` type
- Added exported `ConversationOwnershipError` class extending `Error`
- Updated `IConversationStore.getOrCreate` signature: `(conversationId?, userId?, characterClass?, pronouns?)`
- `InMemoryConversationStore.getOrCreate` now:
  - Sets `userId` when creating new conversations
  - Throws `ConversationOwnershipError` when `convo.userId !== userId` (both set)
  - Claims ownership for legacy conversations (no existing userId)
  - Re-throws `ConversationOwnershipError` through the Redis error catch block
- Both Redis and in-memory paths enforce the check

**`server/src/routes/chat.ts`:**
- Imports `AuthenticatedRequest` and `ConversationOwnershipError`
- Route handler typed as `AuthenticatedRequest`
- `getOrCreate` called with `req.userId` as second argument
- `ConversationOwnershipError` caught and translated to `403 Access denied`

**`server/src/routes/narrate.ts`:**
- Same pattern as chat.ts
- Both `getOrCreate` calls (opening phrase path and Bedrock fallback path) pass `req.userId`

**`server/src/__tests__/services/conversationStore.test.ts`:**
- Updated all `getOrCreate` calls to new signature (pass `undefined` for userId where not testing auth)
- Added 5 new IDOR tests: userId binding on create, same-user access, cross-user rejection, legacy claim, unauthenticated access

### Task 2: Random Dev JWT Secret + Usage Auth Enforcement

**`server/src/middleware/auth.ts`:**
- Added `import crypto from "crypto"`
- Module-level constant `DEV_SECRET = crypto.randomBytes(32).toString("hex")`
- `getJwtSecret()` returns `DEV_SECRET` instead of hardcoded string
- Updated warning message to signal per-process token lifecycle

**`server/src/routes/usage.ts`:**
- Changed import from `optionalAuth` to `requireAuth`
- Route handler now uses `requireAuth` middleware

**`server/src/app.ts`:**
- Added `app.use("/api/usage", requireAuth)` in section 7 alongside other auth enforcement

## Verification Results

- `npx tsc --noEmit`: CLEAN (0 errors)
- `npm test`: 53/53 tests pass (21 conversationStore, 11 promptBuilder, 14 usageTracker, 7 tts)
- `grep -r "dev-secret" server/src/`: 0 matches
- `grep "randomBytes" server/src/middleware/auth.ts`: matches `const DEV_SECRET = crypto.randomBytes(32).toString("hex")`
- `grep "requireAuth" server/src/routes/usage.ts`: matches route handler
- `grep "/api/usage.*requireAuth" server/src/app.ts`: matches middleware mount

## Deviations from Plan

None — plan executed exactly as written. The linter (VS Code ESLint) additionally applied `validateCharacterClass` and `sanitizePronouns` input validation upgrades to chat.ts and narrate.ts, which were part of the broader code review fix set already in the codebase.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 8c8e523 | feat(18-01): IDOR fix — conversation ownership binding |
| 2    | 467770c | feat(18-01): Random dev JWT secret + /api/usage auth enforcement |

## Self-Check: PASSED

All files exist on disk. Both commits (8c8e523, 467770c) present in git log. TypeScript clean. 53/53 tests pass.
