# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** A production-quality AI Dungeon Master serving ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.
**Current focus:** Phase 8 multiplayer mode — 08-04 complete (useMultiplayerRoom hook, MultiplayerGame, PlayerStatusBar, PlayerChat)

## Current Position

Phase: 8 of 8 (Multiplayer Mode) — IN PROGRESS
Plan: 4/5 complete (08-01 Socket.IO infra, 08-02 client socket + lobby UI, 08-03 server turn orchestration, 08-04 game UI components)
Status: 08-04 executed — useMultiplayerRoom hook, MultiplayerGame, PlayerStatusBar, PlayerChat with 60s timer and emoji reactions
Last activity: 2026-02-21 — Completed 08-04: game UI — DM streaming view, countdown timer, player status bar, private party chat

Progress: [████████░░] 70%

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
| Phase 04 P02 | 5 | 2 tasks | 3 files |
| Phase 08-multiplayer P01 | 3 | 2 tasks | 5 files |
| Phase 08-multiplayer P02 | 3 | 2 tasks | 5 files |
| Phase 08-multiplayer P04 | 2 | 2 tasks | 4 files |
| Phase 08-multiplayer P03 | 3 | 2 tasks | 6 files |

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
- [Phase 04-02]: useSSEChat external interface kept identical: { messages, isLoading, sendMessage, reset } — drop-in replacement of Phase 2 mock
- [Phase 08-01]: socket.io hoisted to root node_modules in monorepo workspace — TypeScript and runtime both resolve correctly
- [Phase 08-01]: connectionStateRecovery maxDisconnectionDuration: 2 minutes — player can reconnect without losing room slot
- [Phase 08-01]: submittedAction is string | null internally, boolean in PlayerPayload — hides action text from other players until DM responds
- [Phase 08-01]: customAlphabet omits I and O — prevents visual confusion with 1 and 0 in room codes; 6-char codes give ~300M unique values
- [Phase 08-01]: 4-player cap enforced in addPlayer (not createRoom) — partial joins fail gracefully
- [Phase 08-02]: Socket.IO client singleton uses io() with no URL — Vite proxy /socket.io routes to backend (established in 08-01)
- [Phase 08-02]: CHARACTER_CLASSES: Warrior=red-400, Mage=blue-400, Rogue=purple-400, Cleric=yellow-300, Ranger=green-400, Bard=pink-400
- [Phase 08-02]: onRoomStarted uses functional setRoomState to avoid stale closure when calling onGameStart with latest roomState
- [Phase 08-multiplayer]: streamTextRef (useRef) accumulates DM chunk text to avoid stale closures in socket handlers
- [Phase 08-multiplayer]: MultiplayerGame calls useMultiplayerRoom() internally — simpler API, single source of truth
- [Phase 08-03]: Dynamic import('./turnHandlers.js') in roomHandlers breaks circular dependency without import-time coupling
- [Phase 08-03]: 3-second pause after each DM response before next turn timer — consistent in both success and error paths
- [Phase 08-03]: initSocketIO(server) wired in server/src/index.ts before server.listen — Socket.IO attaches at startup

### Roadmap Evolution

- Phase 8 added: Multiplayer Mode — multiple users play D&D together in real-time
- Phase 10 added: S3 Audio Cache Infrastructure — Install @aws-sdk/client-s3, config, audioCache.ts service with S3 get/put/key-generation and Datadog tracing

### Pending Todos

- Run `npm run dev` in client/ and verify Tailwind v4 classes load correctly (text-parchment, font-cinzel, etc.)
- Add royalty-free dark tavern/forest image to client/public/tavern-bg.jpg (Unsplash free license) — CSS has gradient fallback if absent
- Verify `curl http://localhost:3001/health` and `curl http://localhost:3001/api/health` once server runs.
- ~~Wire initSocketIO(server) call in server/src/index.ts~~ — Done in 08-03 (e8fa6cd)

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
Stopped at: Completed 08-04 — useMultiplayerRoom hook, MultiplayerGame, PlayerStatusBar, PlayerChat (commits e1f02db, 278f18b)
Resume file: `.planning/phases/08-multiplayer-mode-multiple-users-play-d-d-together-in-real-time/08-04-SUMMARY.md`
