# Phase 13: Dead Code Cleanup - Research

**Researched:** 2026-02-21
**Domain:** TypeScript dead code deletion, duplicate function consolidation
**Confidence:** HIGH

## Summary

Phase 13 deletes ~2,237 lines of DI architecture scaffolding that was never wired into the running server, then fixes a duplicate `stripTTSTags` function in the client that diverges from the canonical shared-types version. This is a pure deletion phase — no new functionality, no refactoring of live code.

The dead code (five server paths: `container.ts`, `tokens.ts`, `transport/`, `domain/`, `adapters/`) was confirmed to be completely isolated from the live server. The live server entry point (`server/src/index.ts` → `app.ts`) never calls `configureContainer()` and never mounts any transport/domain/adapter routes. Zero live files import from these directories. Deleting them causes zero TypeScript errors (baseline: `tsc --noEmit` exits 0 today, and the dead directories contribute type-check work but no live bindings).

The duplicate `stripTTSTags` in `client/src/hooks/useMultiplayerRoom.ts` is missing the `{{scene:\w+}}` replacement that the shared-types canonical version includes, creating a silent maintenance divergence. The fix is a two-line change: add one import from `@ai-dm/shared-types` and remove the local 7-line function. `MessageBubble.tsx` also has a local copy but is NOT listed in the phase success criteria — treat it as out of scope unless the planner explicitly includes it.

**Primary recommendation:** Delete the five dead server paths with `rm -rf`, then fix `useMultiplayerRoom.ts` import, then verify with `tsc --noEmit` and `npm test --workspace=server`.

## Standard Stack

No new libraries needed. This phase uses only:

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| TypeScript `tsc --noEmit` | 5.x (already installed) | Verify no type errors after deletion | Official compiler, zero setup |
| `rm -rf` (shell) | OS built-in | Delete dead directories | Simplest correct tool for bulk directory deletion |
| vitest | 2.1.9 (already installed) | Confirm 41 server tests still pass | Already the test runner in this repo |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `npm test --workspace=server` | Run 41 server tests | After every deletion step |
| `@ai-dm/shared-types` | Provides canonical `stripTTSTags` | Already in `client/package.json` dependencies |

**Installation:** None required. All tools and packages already present.

## Architecture Patterns

### What the Dead Code Is

The dead code is a complete Hexagonal Architecture (ports-and-adapters) scaffold that was abandoned in favor of the simpler flat service layer that the live server actually uses.

```
server/src/ (LIVE — DO NOT TOUCH)
├── routes/           # Express route handlers (mounted in app.ts)
├── services/         # Business logic (bedrock, tts, rag, conversationStore, etc.)
├── sockets/          # Socket.IO handlers
├── middleware/        # Auth, rate limiting, security
├── content/          # Prompt content
├── config/           # Config service
├── app.ts            # Express app factory (no DI, no container)
└── index.ts          # Entry point (no configureContainer call)

server/src/ (DEAD — SAFE TO DELETE)
├── container.ts      # Registers tsyringe bindings; configureContainer() never called
├── tokens.ts         # String token constants; imported only by container.ts
├── transport/        # Duplicate route handlers; never mounted
│   └── http/routes/  # chat.ts, narrate.ts, music.ts, usage.ts, health.ts, sceneVideo.ts
├── domain/           # Ports (interfaces) + Services (classes with @injectable decorators)
│   ├── ports/        # 11 interface files; never used by live code
│   └── services/     # 9 service class files (GameService, DMService, etc.)
└── adapters/         # Port implementations; all registered in container.ts only
    ├── emitter/      # SocketIOEmitterAdapter
    ├── graph/        # Neo4jGraphAdapter
    ├── llm/          # BedrockLLMAdapter
    ├── music/        # MiniMaxMusicAdapter
    ├── storage/      # S3ObjectStorageAdapter
    ├── store/        # InMemoryConversation/Room/Usage/CacheAdapter
    ├── tts/          # MiniMaxTTSAdapter
    └── video/        # MiniMaxVideoAdapter
```

### Pattern 1: Verify-Before-Delete

**What:** Run `tsc --noEmit` and the test suite before AND after each deletion.
**When to use:** Any time deleting multiple files that might have cross-references.
**Why:** The dead directories import from `@ai-dm/shared-types` and from each other — but NOT from live services. After deletion the compiler cannot resolve those imports, so absence of errors after deletion confirms isolation.

```bash
# Before: establish baseline
npx tsc --noEmit -p server/tsconfig.json   # exits 0
npm test --workspace=server                 # 41/41 pass

# Delete
rm -rf server/src/container.ts server/src/tokens.ts
rm -rf server/src/transport server/src/domain server/src/adapters

# After: verify unchanged
npx tsc --noEmit -p server/tsconfig.json   # must still exit 0
npm test --workspace=server                 # must still be 41/41
```

### Pattern 2: Import Consolidation (useMultiplayerRoom.ts)

**What:** Replace a local function definition with an import from the canonical shared package.
**When to use:** When a local copy diverges from the package version.

```typescript
// BEFORE (lines 1-21 of useMultiplayerRoom.ts)
import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../services/socket';
// ...other imports...
import type {
  RoomPhase, MultiplayerPlayer, ChatMessage,
  CharacterClassId, GenderId, RoomState,
} from '../types/multiplayer';

function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{voice:\w+\}\}/g, "")   // MISSING: .replace(/\{\{scene:\w+\}\}\s*/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}

// AFTER
import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../services/socket';
// ...other imports...
import type {
  RoomPhase, MultiplayerPlayer, ChatMessage,
  CharacterClassId, GenderId, RoomState,
} from '../types/multiplayer';
import { stripTTSTags } from '@ai-dm/shared-types';
// (delete the local function definition entirely)
```

The `@ai-dm/shared-types` package is already a declared dependency in `client/package.json` and is already symlinked at `node_modules/@ai-dm/shared-types -> ../../packages/shared-types`. The dist is built. This import will resolve without any additional setup.

### Anti-Patterns to Avoid

- **Deleting one file at a time and checking after each**: The five dead server paths form a unit — delete all together, then verify once.
- **Touching live service files**: The live flat service layer (`server/src/services/`) must not be modified. The adapters in the dead `adapters/` directory are NOT the same as the live services.
- **Also fixing MessageBubble.tsx**: `MessageBubble.tsx` has a local `stripTTSTags` copy too, but the phase success criteria only mentions `useMultiplayerRoom.ts`. Scope creep risks breaking the 41-test baseline check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding all import references before deletion | Custom grep script | Just read `server/src/index.ts` and `app.ts` | The import chain is already fully mapped (see research) |
| Verifying no dead code remains | Custom tooling | `tsc --noEmit` + `npm test` | TypeScript will error if any live code still imports deleted files |

**Key insight:** The compiler is the verification tool. If `tsc --noEmit` exits 0 after deletion, the dead code had no live dependents.

## Common Pitfalls

### Pitfall 1: Assuming transport/domain/adapters Are Integrated
**What goes wrong:** Developer scans transport/http/routes and sees familiar route names (`chat.ts`, `narrate.ts`) and assumes they must be mounted somewhere.
**Why it happens:** The routes exist and look real, but `app.ts` only mounts from `./routes/` (the live directory), not from `./transport/http/routes/`.
**How to avoid:** Read `app.ts` imports directly — all 7 `import ...Router from "./routes/..."` lines reference the live `routes/` directory. No import from `transport/`.
**Warning signs:** Any uncertainty — run `grep -rn "transport\|domain\|adapters" server/src/app.ts server/src/index.ts` and see zero matches.

### Pitfall 2: stripTTSTags Behavior Difference
**What goes wrong:** After replacing the local copy in `useMultiplayerRoom.ts`, scene tags like `{{scene:tavern_idle}}` (if they ever appear in DM stream chunks) now get stripped where they were not before.
**Why it happens:** The local copy was missing `.replace(/\{\{scene:\w+\}\}\s*/g, "")`. The canonical version includes it.
**How to avoid:** This is the correct fix — the DM prompt instructs Claude to emit `{{scene:ID}}` tags, and the local copy's failure to strip them is a bug, not a feature.
**Warning signs:** None — this is the intended behavior of the canonical version.

### Pitfall 3: TypeScript Compilation Includes Dead Code
**What goes wrong:** `tsc --noEmit` passes today despite the dead code existing, because TypeScript compiles all files in `include: ["src"]`. After deletion it still passes, but for a different reason.
**Why it happens:** The dead files are valid TypeScript; the compiler doesn't distinguish live from dead code. Both before and after deletion, `tsc --noEmit` should exit 0.
**How to avoid:** Run the test suite after deletion — tests only exercise live code paths. Tests passing confirms no live code was accidentally deleted.

### Pitfall 4: Pre-Existing Client TypeScript Errors
**What goes wrong:** Running `tsc --noEmit` on the client project shows 2 errors in `backgroundMusic.ts` (lines 181, 190: `oldTrack` possibly null). These exist TODAY and are not related to Phase 13.
**Why it happens:** `backgroundMusic.ts` has pre-existing type errors unrelated to this phase.
**How to avoid:** The success criterion specifies `npx tsc --noEmit` — confirm this refers to the server (`-p server/tsconfig.json`). The client has pre-existing errors and is not the target. Do not attempt to fix client TypeScript errors as part of this phase.

## Code Examples

### Verified: No Live Imports from Dead Directories
```bash
# Source: direct codebase inspection (2026-02-21)
# Result: empty — confirmed no live files import from dead dirs
grep -rn "from.*domain\|from.*adapters\|from.*transport\|configureContainer\|TOKENS\b" \
  server/src \
  --include="*.ts" | \
  grep -v "/domain/" | \
  grep -v "/adapters/" | \
  grep -v "/transport/" | \
  grep -v "container.ts" | \
  grep -v "tokens.ts"
# Output: (empty)
```

### Verified: app.ts Never Calls configureContainer
```typescript
// server/src/app.ts — complete import list (verified 2026-02-21)
import express from "express";
import type { Driver } from "neo4j-driver";
import healthRouter from "./routes/health.js";       // live
import chatRouter from "./routes/chat.js";           // live
import narrateRouter from "./routes/narrate.js";     // live
import musicRouter from "./routes/music.js";         // live
import sceneVideoRouter from "./routes/sceneVideo.js"; // live
import usageRouter from "./routes/usage.js";         // live
import authRouter from "./routes/auth.js";           // live
// No import from ./container, ./tokens, ./transport, ./domain, ./adapters
```

### Verified: @ai-dm/shared-types Already Available in Client
```json
// client/package.json (verified 2026-02-21)
{
  "dependencies": {
    "@ai-dm/shared-types": "1.0.0"  // already declared
  }
}
// node_modules/@ai-dm/shared-types -> ../../packages/shared-types (symlinked)
// packages/shared-types/dist/text-utils.js (built, exports stripTTSTags)
```

### Verified: Canonical stripTTSTags Signature
```typescript
// Source: packages/shared-types/src/text-utils.ts (verified 2026-02-21)
export function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{scene:\w+\}\}\s*/g, "")   // <-- this line is missing from local copies
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}
```

### Verified: Server Test Baseline
```
# Source: npm test --workspace=server (run 2026-02-21)
Test Files  3 passed (3)
      Tests  41 passed (41)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DI container (tsyringe) scaffolded | Flat service layer (direct imports) | Never migrated — dead at creation | Scaffolding can be deleted without touching live code |
| Local `stripTTSTags` copies | Import from `@ai-dm/shared-types` | `useMultiplayerRoom.ts` fix in Phase 13 | Single source of truth; scene tag stripping fixed |

**Deprecated/outdated:**
- `server/src/container.ts`: tsyringe DI container — never called, safe to delete
- `server/src/tokens.ts`: tsyringe injection tokens — imported only by container.ts, safe to delete
- `server/src/transport/`: duplicate routes — never mounted, safe to delete
- `server/src/domain/`: ports + domain services — never resolved from container, safe to delete
- `server/src/adapters/`: port implementations — never resolved from container, safe to delete
- Local `stripTTSTags` in `useMultiplayerRoom.ts`: diverged copy — replace with shared-types import

## Open Questions

1. **Should MessageBubble.tsx also be fixed?**
   - What we know: `MessageBubble.tsx` has an identical local `stripTTSTags` missing the scene tag, just like `useMultiplayerRoom.ts`
   - What's unclear: The phase success criteria only mentions `useMultiplayerRoom.ts`
   - Recommendation: Planner should include it as a separate task or explicitly exclude it. The fix is trivial (same pattern: add import, remove local function). Including it closes the tech debt fully; excluding it leaves a known duplicate.

2. **Does `npx tsc --noEmit` in success criteria target server or both?**
   - What we know: The client has 2 pre-existing TypeScript errors in `backgroundMusic.ts` (lines 181, 190) that are unrelated to Phase 13. The server compiles cleanly (exit 0).
   - What's unclear: Whether the success criterion intends the server-only check (`-p server/tsconfig.json`) or a root-level check
   - Recommendation: Interpret as server-only (`npx tsc --noEmit -p server/tsconfig.json`). Client errors predate this phase.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `server/src/app.ts`, `server/src/index.ts` (confirmed no DI imports)
- Direct codebase inspection — `server/src/container.ts` (confirmed `configureContainer()` never called from entry points)
- Direct codebase inspection — `packages/shared-types/src/text-utils.ts`, `dist/text-utils.d.ts` (confirmed `stripTTSTags` exported)
- Direct codebase inspection — `client/package.json`, `node_modules/@ai-dm/shared-types` symlink (confirmed package available)
- `npm test --workspace=server` run (41/41 pass, 2026-02-21)
- `npx tsc --noEmit -p server/tsconfig.json` run (exit 0, 2026-02-21)
- `.planning/v1.0-MILESTONE-AUDIT.md` (authoritative source documenting the dead code and duplicate)

### Secondary (MEDIUM confidence)
- N/A — all findings verified directly from codebase

### Tertiary (LOW confidence)
- N/A

## Metadata

**Confidence breakdown:**
- Dead server code is isolated: HIGH — verified by grep and by TypeScript compiler (no live imports)
- Server TypeScript clean after deletion: HIGH — compiler already exits 0; dead code adds no live bindings
- stripTTSTags fix: HIGH — import already works in `useSSEChat.ts` (same pattern, same package)
- Test suite unaffected: HIGH — 41 tests target `server/src/services/`, not dead directories
- Client pre-existing errors: HIGH — confirmed in `backgroundMusic.ts`, unrelated to phase

**Research date:** 2026-02-21
**Valid until:** Stable (no external dependencies; all findings are codebase-internal). Valid until codebase changes.
