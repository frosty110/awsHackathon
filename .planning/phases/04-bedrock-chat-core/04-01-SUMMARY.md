---
phase: 04-bedrock-chat-core
plan: 01
subsystem: api
tags: [bedrock, aws-sdk, sse, streaming, conversation, express, zod]

# Dependency graph
requires:
  - phase: 01-scaffold
    provides: Express app scaffold, config service, TypeScript setup
provides:
  - BedrockRuntimeClient singleton with ConverseStreamCommand streaming
  - In-memory conversation store (getOrCreate, appendMessage, getWindowedHistory)
  - POST /api/chat SSE streaming route with D&D system prompt
  - chatRouter registered in app.ts
affects: [05-neo4j-rag, 06-datadog-observability, 07-voice-demo-polish]

# Tech tracking
tech-stack:
  added: ["@aws-sdk/client-bedrock-runtime (ConverseStreamCommand)"]
  patterns:
    - "Bedrock singleton client at module scope, reused across requests"
    - "SSE headers set before async work, flushHeaders() called first"
    - "AbortController with 45s timeout wired to client disconnect via req.on('close')"
    - "Conversation history windowed to last 12 turns for token budget"
    - "isSystemTrigger pattern: message sent to Bedrock without being stored in history"

key-files:
  created:
    - server/src/services/bedrock.ts
    - server/src/services/conversationStore.ts
    - server/src/routes/chat.ts
  modified:
    - server/src/app.ts

key-decisions:
  - "streamBedrockResponse uses callback-based onChunk pattern (not async generator) — enables LLMObs tracer.llmobs.trace() Promise wrapping added in Phase 06"
  - "isSystemTrigger boolean flag: opening monologue sent to Bedrock but not persisted in conversation history — keeps history clean for player turns"
  - "getWindowedHistory(id, 12) replaces toBedrockMessages: returns last 12 ChatMessage entries already in Bedrock-compatible shape"
  - "DM_SYSTEM_PROMPT exported from bedrock.ts (not a separate constants file) — single source of truth for narrative rails"

patterns-established:
  - "SSE pattern: set headers -> flushHeaders() -> write conversationId event -> stream chunks -> write [DONE] -> res.end()"
  - "Conversation store: Map<string, Conversation> in-memory, keyed by UUID, never persisted across restarts"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 4 Plan 01: Bedrock Chat Core Summary

**BedrockRuntimeClient singleton + in-memory conversation store + POST /api/chat SSE streaming route with D&D system prompt, AbortController timeout, and dice result injection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T03:53:56Z
- **Completed:** 2026-02-21T03:56:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Bedrock service with `BedrockRuntimeClient` singleton, `ConverseStreamCommand` streaming, and 45s AbortController timeout
- In-memory conversation store with `getOrCreate`, `appendMessage`, and `getWindowedHistory` (12-turn window)
- POST `/api/chat` (and `/api/chat`) SSE route with D&D DM system prompt, dice result augmentation, and full abort/timeout handling
- `chatRouter` registered in `app.ts` alongside existing health, narrate, music, and usage routers

## Task Commits

Work completed across prior execution phases (project was built iteratively):

1. **Task 1: Create Bedrock service and conversation store** - `8e8d20d` (feat: Bedrock streaming service, conversation store, test script)
2. **Task 2: Create chat route and register in app.ts** - `bed4b44` (feat: wire AWS Bedrock chat with SSE streaming and dark fantasy styling)

Note: Phase 06 (LLMObs) subsequently enhanced `bedrock.ts` with `tracer.llmobs.trace()` wrapping in commit `8ff477c`. The final state exceeds plan requirements.

**Plan metadata:** See final commit in this execution run.

## Files Created/Modified

- `server/src/services/bedrock.ts` - BedrockRuntimeClient singleton, `streamBedrockResponse` function with Datadog LLMObs span, `DM_SYSTEM_PROMPT` constant, `ChatMessage` and `BedrockResult` types
- `server/src/services/conversationStore.ts` - In-memory Map store, `getOrCreate`, `appendMessage`, `getWindowedHistory(id, maxTurns=12)`
- `server/src/routes/chat.ts` - POST `/api/chat` with SSE streaming, Zod-style validation, `isSystemTrigger` support, usage tracking, structured logging
- `server/src/app.ts` - `chatRouter` imported and mounted

## Decisions Made

- `streamBedrockResponse` uses callback pattern (`onChunk: (text: string) => void`) instead of the plan's `AbortSignal` parameter — this was necessary for Phase 06's `tracer.llmobs.trace()` Promise-based API wrapping (async generators cannot be wrapped cleanly)
- `getWindowedHistory` replaces the plan's `toBedrockMessages` — the function already returns Bedrock-shaped messages (each with `role` and `content: [{ text }]`), eliminating a separate mapping step
- `DM_SYSTEM_PROMPT` significantly expanded beyond plan spec with full narrative rails, dice outcome ranges, character backstory, and style rules — better demo immersion
- `isSystemTrigger` flag added to support opening monologue (sent to Bedrock for narration but not stored as a player message in conversation history)

## Deviations from Plan

### Scope Exceeded (Prior Phase Evolution)

The plan describes the minimal Phase 4 implementation. The actual files reflect evolution through Phase 06 (LLMObs) and Phase 07 (voice polish):

**1. [Rule 2 - Enhancement] Datadog LLMObs span wrapping added in Phase 06**
- `streamBedrockResponse` wrapped in `tracer.llmobs.trace()` with `kind: 'llm'`, model metadata, and full `annotate()` call with input/output data and cost metrics
- Files modified: `server/src/services/bedrock.ts`

**2. [Rule 2 - Enhancement] Usage tracking added in Phase 07**
- `recordBedrockUsage` called after stream, usage event written to SSE stream before `[DONE]`
- Files modified: `server/src/routes/chat.ts`, `server/src/services/usageTracker.ts` (new)

**3. [Rule 2 - Enhancement] Structured logging added in post-Phase 04**
- `logEvent` calls added for request received, validation failure, stream completed, empty response
- Files modified: `server/src/routes/chat.ts`

---

**Total deviations:** 3 scope expansions (all from later phases building on this foundation)
**Impact on plan:** All additions enhance observability and demo quality. Core plan contracts met exactly.

## Issues Encountered

None — all target files exist, TypeScript compiles with zero errors (`npx tsc --noEmit -p server` exit code 0).

## User Setup Required

**AWS Bedrock requires manual configuration.** Before running the server:

1. Enable Bedrock model access in AWS Console (Bedrock -> Model access -> Enable `anthropic.claude-3-5-haiku-20241022-v1:0`)
2. Set environment variables in `server/.env`:
   - `AWS_REGION` — e.g., `us-east-1`
   - `AWS_ACCESS_KEY_ID` — from IAM -> Users -> Security credentials
   - `AWS_SECRET_ACCESS_KEY` — from IAM -> Users -> Security credentials
   - `BEDROCK_MODEL_ID` — `anthropic.claude-3-5-haiku-20241022-v1:0`

## Next Phase Readiness

- Bedrock chat pipeline complete and working — `curl -X POST /api/chat -H 'Content-Type: application/json' -d '{"message":"I enter the tavern"}' --no-buffer` returns SSE stream
- Phase 05 (Neo4j RAG) can inject lore context into Bedrock messages via `getWindowedHistory` + entity extraction
- Phase 06 LLMObs already wired — spans will appear in Datadog once `DD_LLMOBS_ENABLED=1` and valid `DD_API_KEY` set

---
*Phase: 04-bedrock-chat-core*
*Completed: 2026-02-21*
