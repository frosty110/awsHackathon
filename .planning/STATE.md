# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** A playable AI Dungeon Master demo that runs live with visible Datadog LLM observability — the minimum viable path to hackathon prize eligibility.
**Current focus:** Phase 4 plan 01 complete (retroactive SUMMARY); Phase 7 in progress — 07-02 (AudioPlayer) complete, next: 07-03

## Current Position

Phase: 7 of 7 (Voice Demo Polish) — IN PROGRESS
Plan: 2/3 complete (07-01 TTS + /narrate, 07-02 AudioPlayer component)
Status: 07-02 executed — AudioPlayer component, App.tsx wired with TTS fetch and graceful degradation
Last activity: 2026-02-21 — Completed quick task 1: Optimize MiniMax TTS (emotion tags, turbo model, mood prosody, multi-voice)

Progress: [███████░░░] 64%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~3 min
- Total execution time: ~0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-scaffold | 3 | ~10 min | ~3 min |
| 02-chat-ui | 2 (of 2) | ~4 min | ~2 min |
| 03-lore-graph-seed | 2 (of 2) | ~3 min | ~1.5 min |

**Recent Trend:**
- Last 5 plans: 01-03, 02-01, 02-02, 03-01, 03-02
- Trend: Stable

*Updated after each plan completion*
| Phase 04-bedrock-chat-core P01 | 3 | 2 tasks | 4 files |
| Phase 02-chat-ui P01 | 2 | 2 tasks | 6 files |
| Phase 02-chat-ui P02 | 2 | 2 tasks | 5 files |
| Phase 03-lore-graph-seed P01 | 2 | 1 task | 1 file |
| Phase 03-lore-graph-seed P02 | 1 | 2 tasks | 2 files |
| Phase 07-voice-demo-polish P01 | 5 | 3 tasks | 5 files |
| Phase 07-voice-demo-polish P02 | 5 | 2 tasks | 2 files |
| Phase 06-datadog-observability P01 | 3 | 2 tasks | 5 files |
| Phase 06-datadog-observability P02 | 4 | 1 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Use `@aws-sdk/client-bedrock-runtime` (NOT `@anthropic-ai/bedrock-sdk`) — this is the only SDK dd-trace auto-instruments; wrong choice eliminates Datadog prize entirely
- Roadmap: Phases 2 and 3 (Chat UI and Lore Seed) can run in parallel — both depend only on Phase 1, neither blocks the other
- Roadmap: MiniMax TTS scoped to opening monologue only (not every DM turn) — avoids 3-6s blocking latency per turn
- [Phase 01-scaffold]: envDefaults blank-default pattern: all integration keys default to empty string, validated at usage via requireConfigValues not at module load time
- [Phase 01-scaffold]: AppDeps.driver typed as Driver | null — neo4j.driver() only called after requireConfigValues validates non-blank keys in else branch
- [Phase 02-01]: No tailwind.config.js created — Tailwind v4 CSS-only @theme is the correct modern approach
- [Phase 02-01]: useSSEChat interface locked as { messages, isLoading, sendMessage, reset } — stable contract for Phase 4 drop-in replacement
- [Phase 02-01]: import type used for Message imports in hooks — required by verbatimModuleSyntax tsconfig setting
- [Phase 02-chat-ui]: Tailwind v4 CSS-only @theme — no tailwind.config.js, no postcss.config.js; useSSEChat interface locked as { messages, isLoading, sendMessage, reset } for Phase 4 drop-in
- [Phase 02-02]: DiceRoller shake-then-callback: 400ms setTimeout before onRoll(), useRef cleanup on unmount prevents stale calls
- [Phase 02-02]: needsRoll one-liner regex (roll|dice|check|save|attack) on last DM message — fully derived from messages, no separate state
- [Phase 02-02]: Dark overlay via absolute div (bg-black/60) inside relative outer wrapper — stretches full viewport independently of surface container
- [Phase 03-01]: Ring of Ashwick is a protective talisman (symbolic dark fantasy artifact, goblins may not know its value) — fits dark fantasy tone without over-powered magic
- [Phase 03-01]: Gorm speakingStyle: short sentences, does not volunteer, answers directly, opens up in bursts when trusted — suits gruff ex-soldier archetype
- [Phase 03-01]: lore.json shape uses flat relationships array with fromLabel/toLabel — enables seed script MERGE dispatch without embedded nesting
- [Phase 03-lore-graph-seed]: npx tsx in npm run seed — tsx is server devDependency, npx resolves from workspace node_modules
- [Phase 03-lore-graph-seed]: Relationship type templated into Cypher (not parameterized) — Neo4j does not support parameterized rel types; safe because lore.json is controlled input
- [Phase 07-01]: English_CaptivatingStoryteller voice at neutral settings (speed 1, pitch 0) — tune after hearing pre-generated audio
- [Phase 07-01]: OPENING_MONOLOGUE exported from narrate.ts (not a separate constants file) — single import source for pre-gen script
- [Phase 07-01]: Pre-generation script resolves output path via import.meta.url — location-independent
- [Phase 07-01]: No rate limiting or Datadog spans on /narrate — Phase 6 handles observability; hackathon simplicity
- [Phase 07-02]: AudioPlayer uses Blob URL approach (fetch -> arrayBuffer -> Blob -> URL.createObjectURL) inside onClick to preserve browser autoplay user gesture trust
- [Phase 07-02]: onAdventureStart() called immediately after status='playing', before audio.play() — chat UI appears concurrently with audio
- [Phase 07-02]: Catch block always calls onAdventureStart() — TTS failure is non-fatal, adventure still starts
- [Phase 06-01]: streamBedrockChunks (async generator) replaced by streamBedrockResponse(messages, onChunk) — async generators cannot be wrapped in tracer.llmobs.trace() Promise-based API; route updated to pass inline chunk callback
- [Phase 06-01]: neo4j.ts created with LLMObs span stub — real entity extraction deferred to Phase 5 RAG; span name and kind locked in now so traces appear correctly when Phase 5 runs
- [Phase 06-01]: kind='llm' for Bedrock span, kind='tool' for neo4j and TTS — matches LLMObs taxonomy: only actual LLM model calls use kind='llm'
- [Phase 06-datadog-observability]: import { client as ddClient, v1 } from '@datadog/datadog-api-client' — correct named import; top-level module exports client namespace not createConfiguration directly
- [Phase 04-01]: streamBedrockResponse uses onChunk callback (not async generator + AbortSignal) — enables Phase 06 LLMObs tracer.llmobs.trace() Promise wrapping
- [Phase 04-01]: getWindowedHistory(id, 12) replaces toBedrockMessages — returns Bedrock-shaped messages directly, eliminates separate mapping step
- [Phase 04-01]: isSystemTrigger flag: opening monologue sent to Bedrock without being stored in player history — keeps conversation context clean
- [Phase quick-01]: Voice IDs: narrator=CaptivatingStoryteller, barkeep=ManSportsCommentator, goblin=FloridaMan; mood prosody: combat 1.15x/+2, tavern 0.9x/-1, mystery 0.85x/-2
- [Phase quick-01]: stripTTSTags duplicated on client (no shared package); ttsText SSE event passes tagged Bedrock output to client for TTS; playFromResponse consolidates Blob audio logic

### Roadmap Evolution

- Phase 8 added: Multiplayer Mode — multiple users play D&D together in real-time

### Pending Todos

- Run `npm run dev` in client/ and verify Tailwind v4 classes load correctly (text-parchment, font-cinzel, etc.)
- Add royalty-free dark tavern/forest image to client/public/tavern-bg.jpg (Unsplash free license) — CSS has gradient fallback if absent
- Re-run `npx tsc --noEmit -p server` after server dependencies install.
- Verify `curl http://localhost:3001/health` and `curl http://localhost:3001/api/health` once server runs.

### Blockers/Concerns

- **Pre-hackathon blocker**: Bedrock model access must be enabled in AWS Console before hackathon day (cannot be fixed mid-build). Verify with `aws bedrock invoke-model` CLI before starting Phase 4.
- **Pre-hackathon blocker**: MiniMax `MINIMAX_GROUP_ID` location in console not confirmed — locate and save before hackathon day.
- **Pre-hackathon blocker**: Verify Bedrock inference profile IDs vs. model IDs in target region (`aws bedrock list-foundation-models`).
- **Phase 6 risk**: Datadog dashboard must be built after generating real trace data, not before. Validate all 5 LLM Observability env vars with a smoke-test request.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Optimize MiniMax TTS: emotion tags, turbo model, mood-based prosody, streaming audio, multi-character voices | 2026-02-21 | 1244c86 | [1-optimize-minimax-tts-emotion-tags-turbo-](./quick/1-optimize-minimax-tts-emotion-tags-turbo-/) |

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 04-01-PLAN.md (retroactive) — Bedrock chat pipeline, conversation store, POST /api/chat SSE route.
Resume file: `.planning/phases/04-bedrock-chat-core/04-01-SUMMARY.md`
