---
phase: 06-datadog-observability
plan: 01
subsystem: observability
tags: [datadog, llmobs, dd-trace, bedrock, neo4j, tts, spans]
dependency_graph:
  requires: []
  provides:
    - bedrock.dm_response LLMObs span in server/src/services/bedrock.ts
    - neo4j.lore_query LLMObs span in server/src/services/neo4j.ts
    - minimax.tts LLMObs span in server/src/services/tts.ts
    - DD_APP_KEY documented in .env.example
  affects:
    - server/src/routes/chat.ts (uses new streamBedrockResponse API)
    - Phase 06-02 (dashboard script depends on DD_APP_KEY)
tech_stack:
  added: []
  patterns:
    - tracer.llmobs.trace() callback pattern for LLMObs named spans
    - annotate() called before callback return to avoid silent drop
    - kind='llm' for Bedrock, kind='tool' for neo4j and TTS
key_files:
  created:
    - server/src/services/neo4j.ts
  modified:
    - server/src/services/bedrock.ts
    - server/src/services/tts.ts
    - server/src/routes/chat.ts
    - .env.example
decisions:
  - "streamBedrockChunks (async generator) replaced by streamBedrockResponse(messages, onChunk) to enable tracer.llmobs.trace() wrapping — generators cannot be directly wrapped in the Promise-based llmobs.trace() API"
  - "neo4j.ts created as stub with real Cypher query skeleton — Phase 5 RAG fills in entity extraction; span wrapper already in place"
  - "tts.ts wrapped in-place: generateTTS() inner logic unchanged, outer llmobs.trace() shell added"
metrics:
  duration: ~3 min
  completed: 2026-02-21
  tasks_completed: 2
  files_changed: 5
---

# Phase 6 Plan 1: Datadog LLM Observability Spans Summary

Three named LLMObs spans wired into the server pipeline using `tracer.llmobs.trace()`: `bedrock.dm_response` (kind=llm), `neo4j.lore_query` (kind=tool), and `minimax.tts` (kind=tool), with `DD_APP_KEY` documented in `.env.example`.

## What Was Built

- **bedrock.ts**: Refactored `streamBedrockChunks` (async generator) into `streamBedrockResponse(messages, onChunk)` wrapped in `tracer.llmobs.trace({ kind: 'llm', name: 'bedrock.dm_response', modelName, modelProvider: 'aws' })`. Extracts token counts from `chunk.metadata.usage` during stream and calls `tracer.llmobs.annotate()` with inputData, outputData, and metrics before the callback returns.

- **neo4j.ts**: New file. Exports `queryLore(driver, entities)` wrapped in `tracer.llmobs.trace({ kind: 'tool', name: 'neo4j.lore_query' })`. Contains a real Cypher `MATCH (n) WHERE n.name IN $entities OPTIONAL MATCH (n)-[r]->(related)` query skeleton ready for Phase 5 RAG to extend. Annotates with entity list and result count.

- **tts.ts**: Wrapped existing `generateTTS()` in `tracer.llmobs.trace({ kind: 'tool', name: 'minimax.tts' })`. All original MiniMax API logic is preserved inside the callback. Annotates with truncated input text and audio buffer byte length.

- **chat.ts**: Updated to call `streamBedrockResponse(messages, onChunk)` instead of the old `streamBedrockChunks` generator.

- **.env.example**: Added `DD_APP_KEY=` with comment explaining it is for `scripts/create-dashboard.ts` (not server runtime).

## Verification Results

All plan success criteria confirmed:

1. All three span names appear in respective service files.
2. `tracer.llmobs.trace()` used everywhere — no `startSpan` usage.
3. `tracer.llmobs.annotate()` called inside callback before `return` in all three files.
4. `DD_APP_KEY` declared in `.env.example`.
5. `NODE_OPTIONS='--import dd-trace/initialize.mjs'` confirmed in both `dev` and `start` scripts.
6. No new runtime dependencies added (`dd-trace` was already installed at `^5.86.0`).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `2c3914f` | `chore(06-01): add DD_APP_KEY to .env.example and verify bootstrap` |
| 2 | `8ff477c` | `feat(06-01): wrap service functions with tracer.llmobs.trace() spans` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refactored async generator to callback-based function**
- **Found during:** Task 2
- **Issue:** `streamBedrockChunks` was an `AsyncGenerator<string>` which cannot be wrapped in `tracer.llmobs.trace()` — the LLMObs API requires a callback that returns a `Promise`, not an async generator. A generator-based function has no single return point to call `annotate()` before.
- **Fix:** Replaced with `streamBedrockResponse(messages, onChunk)` which accepts a chunk callback. The route (`chat.ts`) was updated to use the new API (passing an inline `(chunk) => res.write(...)` callback). All behavior is identical from the user's perspective.
- **Files modified:** `server/src/services/bedrock.ts`, `server/src/routes/chat.ts`
- **Commit:** `8ff477c`

## Self-Check: PASSED

All files exist on disk. Both task commits verified in git log.
