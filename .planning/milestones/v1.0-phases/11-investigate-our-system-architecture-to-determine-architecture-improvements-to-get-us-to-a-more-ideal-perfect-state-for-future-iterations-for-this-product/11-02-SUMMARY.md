---
phase: 11-architecture-audit
plan: 02
subsystem: api
tags: [bedrock, p-queue, prompt-engineering, separation-of-concerns, typescript]

# Dependency graph
requires:
  - phase: 04-bedrock-chat-core
    provides: streamBedrockResponse function and DM_SYSTEM_PROMPT
  - phase: 08-multiplayer-mode
    provides: buildMultiplayerSystemPrompt used in turnHandlers
  - phase: 09-scale-and-auth
    provides: bedrockQueue.ts with p-queue concurrency cap (already present)
provides:
  - "server/src/services/promptBuilder.ts — all DM prompt content in one module"
  - "bedrock.ts as pure AWS transport layer with re-exports for backward compatibility"
  - "p-queue concurrency cap of 20 on all Bedrock calls via bedrockQueue.ts"
affects: [future-prompt-iteration, bedrock-callers, multiplayer-turn-handlers]

# Tech tracking
tech-stack:
  added: ["p-queue@9.1.0 (already present from Phase 09)"]
  patterns:
    - "Content/transport separation: prompt strings live in promptBuilder.ts, AWS calls in bedrock.ts"
    - "Re-export pattern: bedrock.ts re-exports DM_SYSTEM_PROMPT and buildMultiplayerSystemPrompt for backward compatibility"
    - "Concurrency gate: bedrockQueue.ts wraps all Bedrock calls with PQueue concurrency: 20"

key-files:
  created:
    - "server/src/services/promptBuilder.ts — DM_SYSTEM_PROMPT and buildMultiplayerSystemPrompt"
  modified:
    - "server/src/services/bedrock.ts — removed prompt content, added re-exports from promptBuilder.ts"

key-decisions:
  - "bedrock.ts re-exports DM_SYSTEM_PROMPT and buildMultiplayerSystemPrompt from promptBuilder.ts — zero caller changes required"
  - "p-queue concurrency gate lives in bedrockQueue.ts (separate module) rather than inline in bedrock.ts — better separation, already established in Phase 09"
  - "Datadog LLMObs tracing preserved inside streamBedrockResponse — queue wait time correctly included in span latency"

patterns-established:
  - "Prompt-as-content: all LLM prompt strings live in promptBuilder.ts or content/prompts.ts, never in transport modules"
  - "Re-export for compat: bedrock.ts re-exports prompt symbols so callers need no import path changes"

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 11 Plan 02: p-queue Bedrock Concurrency Cap + promptBuilder Extraction Summary

**DM_SYSTEM_PROMPT and buildMultiplayerSystemPrompt extracted to promptBuilder.ts; bedrock.ts is now pure AWS transport with backward-compatible re-exports; all Bedrock calls capped at 20 concurrent via p-queue in bedrockQueue.ts**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-21T21:49:31Z
- **Completed:** 2026-02-21T21:53:00Z
- **Tasks:** 2
- **Files modified:** 2 (bedrock.ts, promptBuilder.ts — committed in 11-01)

## Accomplishments

- `promptBuilder.ts` created with the full 160-line `DM_SYSTEM_PROMPT` and `buildMultiplayerSystemPrompt` — all DM narrative content consolidated in one module
- `bedrock.ts` stripped of prompt content and simplified to pure AWS Bedrock transport (client, streaming, Datadog tracing)
- Backward-compatible re-exports from `bedrock.ts` ensure zero changes needed in `chat.ts`, `turnHandlers.ts`, or other callers
- p-queue concurrency cap of 20 already in place via `bedrockQueue.ts` (established in Phase 09) — all callers already use `queueBedrockCall()`
- TypeScript compiles cleanly with no type errors

## Task Commits

Both tasks were implemented as part of the 11-01 commit (the extraction was bundled with security middleware work):

1. **Task 1: Extract promptBuilder.ts and p-queue cap** - `a937743` (feat)
2. **Task 2: Verify all callers resolve correctly** - Verification only, no additional commits needed

**Plan metadata:** See final docs commit below.

## Files Created/Modified

- `server/src/services/promptBuilder.ts` — Created: exports `DM_SYSTEM_PROMPT` (160-line system prompt) and `buildMultiplayerSystemPrompt(players)` function
- `server/src/services/bedrock.ts` — Modified: removed prompt literals, added `import { DM_SYSTEM_PROMPT } from "./promptBuilder.js"`, added re-export line for both symbols
- `server/src/services/bedrockQueue.ts` — Already exists: `PQueue({ concurrency: 20 })` wrapping all Bedrock calls (from Phase 09)

## Decisions Made

- `bedrock.ts` re-exports `DM_SYSTEM_PROMPT` and `buildMultiplayerSystemPrompt` from `promptBuilder.ts` so that all existing callers (`turnHandlers.ts`, `chat.ts`) continue to import from `bedrock.js` without any changes.
- The p-queue concurrency gate was already implemented as a separate `bedrockQueue.ts` module in Phase 09 rather than inline in `bedrock.ts`. This is architecturally superior (single responsibility) and fulfills the plan's must-have requirement that Bedrock calls be capped at concurrency 20.
- Datadog LLMObs `tracer.llmobs.trace()` wrapping preserved inside `streamBedrockResponse` — queue wait time is correctly reflected in span latency.

## Deviations from Plan

### Pre-existing Work

**1. [Planned work already completed] promptBuilder.ts and bedrock.ts update bundled in 11-01 commit**
- **Found during:** Task 1 execution
- **Issue:** The `a937743` commit (labeled as `feat(11-01)`) already included `promptBuilder.ts` creation and `bedrock.ts` update as part of the 11-01 security middleware plan execution.
- **Fix:** Verified the work was complete and correct. Wrote the same content to confirm no diff. All success criteria already met.
- **Files:** `server/src/services/promptBuilder.ts`, `server/src/services/bedrock.ts`
- **Verification:** `tsc --noEmit` passes. All 7 verification checks pass.

**2. [Architecture variation] p-queue in bedrockQueue.ts (not inline in bedrock.ts)**
- **Issue:** The plan specified adding p-queue wrapping inline to `bedrock.ts`. The implementation uses a separate `bedrockQueue.ts` module with `queueBedrockCall()` that callers use directly.
- **Assessment:** Better separation of concerns. Fulfills the plan's must-have truths: "Bedrock calls are capped at 20 concurrent requests via p-queue" and "Additional Bedrock requests queue and wait rather than being rejected" — both true via `bedrockQueue.ts`.
- **Impact:** No behavioral difference. All callers use `queueBedrockCall()` from `bedrockQueue.ts`.

---

**Total deviations:** 2 (both pre-existing architecture decisions, no scope issues)
**Impact on plan:** All success criteria met. Work was already done correctly.

## Issues Encountered

None — all plan requirements were already satisfied. Execution was primarily verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `promptBuilder.ts` is the canonical home for all DM prompt content — future prompt iteration only touches this one file
- `bedrock.ts` is clean AWS transport — Bedrock API changes only touch this file
- p-queue at concurrency 20 protects against ThrottlingException cascades for 1000 concurrent users
- Phase 11 plans 03, 04, 05 can proceed with confidence in the architecture

---
*Phase: 11-architecture-audit*
*Completed: 2026-02-21*
