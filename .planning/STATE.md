# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** A production-quality AI Dungeon Master serving ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.
**Current focus:** Phase 13 (Dead Code Cleanup) COMPLETE — All plans done. Verification passed 4/4.

## Current Position

Phase: Phase 13 (Dead Code Cleanup) — ALL plans complete (01). Verified.
Plan: Phase 13 complete.
Status: Dead DI architecture scaffolding (container.ts, tokens.ts, transport/, domain/, adapters/) deleted. stripTTSTags consolidated to @ai-dm/shared-types import. All 41 server tests pass. TypeScript compiles clean.
Last activity: 2026-02-21 — Phase 13 verified and complete.

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 22 (across 8 phases) + 4 quick tasks
- Average duration: ~3 min per plan
- Total execution time: ~1.1 hours

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 01-scaffold | 3/3 | ✅ Complete |
| 02-chat-ui | 2/2 | ✅ Complete |
| 03-lore-graph-seed | 2/2 | ✅ Complete |
| 04-bedrock-chat-core | 2/2 | ✅ Complete |
| 05-rag-pipeline | 2/2 | ✅ Complete |
| 06-datadog-observability | 2/2 | ✅ Complete |
| 07-voice-demo-polish | 3/3 | ✅ Complete |
| 08-multiplayer-mode | 5/5 | ✅ Complete |

**Quick Tasks:** 4/4 complete (TTS optimization, chat styling, pronouns, gender)

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
| Phase 08-multiplayer P05 | 8 | 2 tasks | 2 files |
| Phase 09-scale-and-auth P01 | 3 | 2 tasks | 6 files |
| Phase 09 P02 | 3 | 2 tasks | 5 files |
| Phase 09-scale-and-auth P03 | 3 | 2 tasks | 5 files |
| Phase 11 P01 | 2 | 2 tasks | 5 files |
| Phase 11 P04 | 1 | 1 tasks | 2 files |
| Phase 11 P03 | 3 | 2 tasks | 3 files |
| Phase 11 P02 | 4 | 2 tasks | 2 files |
| Phase 11 P05 | 3 | 2 tasks | 6 files |
| Phase 11 P06 | 3 | 1 tasks | 1 file |
| Phase 12-production-hardening P02 | 3 | 1 tasks | 1 files |
| Phase 12-production-hardening P01 | 4 | 2 tasks | 3 files |
| Phase 13-dead-code-cleanup P01 | 2 | 2 tasks | 1 files |

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
- [Phase 08-05]: Initial appState is modeSelect (not idle): ensures mode selection is the canonical entry point for every session
- [Phase 08-05]: socket.disconnect() called in handleMultiplayerBack and handleMultiplayerLeave to prevent dangling connections
- [Phase 10-01]: Two-tier TTS cache: L1 in-memory Map (zero-latency) + L2 S3 (durable, cross-instance). L1 preserved to avoid S3 latency (~30-100ms) for recently generated audio in same session
- [Phase 10-01]: S3 put fire-and-forget (putAudio().catch(logEvent)) — TTS response latency unaffected by S3 write
- [Phase 10-01]: GetObject directly (not HeadObject + GetObject) — saves one S3 round trip per cache hit; NoSuchKey is GetObject's miss error class (NotFound is HeadObject's)
- [Phase 10-01]: span?.setTag() optional chaining required for tracer.trace() — dd-trace types span as Span | undefined in callback
- [Phase 10-01]: S3_AUDIO_CACHE_BUCKET uses z.string() blank-default pattern — empty string disables S3 gracefully (no startup failure if unconfigured)
- [Phase 09-scale-and-auth]: node-redis (not ioredis) singleton: connectRedis() called in main() before createApp(); bedrockQueue concurrency:20 with InstanceType<typeof PQueue> annotation for ESM type portability
- [Phase 09-scale-and-auth]: initSocketIO made async; Socket.IO Redis adapter conditionally wired (isRedisAvailable guard); connectionStateRecovery works single-instance only with Pub/Sub adapter
- [Phase 09]: Redis-backed conversationStore: async API surface with 7-day TTL, in-memory fallback, and TTL refresh on read
- [Phase 09]: 503 backpressure before SSE headers in chat route — allows clean JSON error response when Bedrock queue overloaded
- [Phase 09]: room:create handler made async — required for await getOrCreate(); Socket.IO supports async event handlers natively
- [Phase 09-03]: optionalAuth globally (not requireAuth) — existing unauthenticated gameplay preserved; auth is additive
- [Phase 09-03]: bcrypt 12 rounds — industry standard; balances security with registration latency
- [Phase 09-03]: Redis hashes at user:{username} — fast hGetAll lookup by username; in-memory fallback when Redis unavailable
- [Phase 09-03]: Constant-time user-not-found with dummy bcrypt.compare — prevents timing side-channel username enumeration
- [Phase 09-03]: narrateRateLimiter on both /api/narrate and /narrate — covers both paths registered in app.ts
- [Phase 11]: MusicResult typed union exported from musicService — route switch-matches on status for exhaustive HTTP translation
- [Phase 11]: getMusicCacheStats re-exported from routes/music.ts to preserve usage.ts import contract
- [Phase 11]: IConversationStore and IRoomStore interfaces with .bind() singleton free function exports enable Redis swap as one-line class substitution
- [Phase 11]: usageTracker lazy eviction at record-time (not timer): 24h TTL + 10k hard cap prevents unbounded memory at 1000-user scale
- [Phase 11-01]: helmet CSP connect-src: self preserves SSE EventSource connections on /api/chat
- [Phase 11-01]: ALLOWED_ORIGINS exported from security.ts — single source of truth shared by Express CORS and Socket.IO CORS
- [Phase 11-01]: musicLimiter (20/min) added to /api/music and /music — previously unprotected route
- [Phase 11-02]: bedrock.ts re-exports DM_SYSTEM_PROMPT and buildMultiplayerSystemPrompt from promptBuilder.ts for zero-change backward compatibility
- [Phase 11-02]: p-queue concurrency gate in separate bedrockQueue.ts module (not inline in bedrock.ts) — better separation of concerns, fulfills concurrency-20 requirement
- [Phase 11]: vitest 2.x pinned (not 4.x): yarn engine check rejected 4.x on Node 23; --ignore-engines + ^2.0.0 resolves correctly
- [Phase 11]: _testInternals pattern in usageTracker.ts: exports module-level entries + reset() for test isolation; never used in production
- [Phase 11]: vi.mock for redis.js in conversationStore tests: forces in-memory path, zero network dependency in tests
- [Phase 11-06]: Dead chatLimiter and narrateLimiter deleted from rateLimits.ts — neither imported anywhere; Phase 09 Redis-backed equivalents in rateLimiter.ts are authoritative
- [Phase 11-06]: rateLimits.ts architecture split documented via JSDoc: music uses conversationId key + MemoryStore (no auth); chat/narrate use userId key + Redis (authenticated)
- [Phase 12-01]: registerLimiter and loginLimiter use req.ip (not userId) — auth endpoints are unauthenticated by definition, userId not yet available
- [Phase 12-01]: Distinct Redis prefixes rl:register: and rl:login: keep counters independent — exhausting login limit won't block register and vice versa
- [Phase 12-01]: DEV_SECRET constant in auth.ts mirrors inline string in routes/auth.ts jwt.sign — consistent dev-mode behavior, auth works without JWT_SECRET env var
- [Phase 12-01]: Auth limiters mounted at step 5, authRouter at step 6 — Express middleware ordering guarantees rate limit fires before route handler
- [Phase 12-production-hardening]: try/catch in public methods (not private helpers) so catch falls through to in-memory block; console.error consistent with redis.ts error handler; identical message string across all 5 catch blocks for grep-based log alerting
- [Phase 13-01]: Dead DI scaffolding (container.ts, tokens.ts, transport/, domain/, adapters/) was untracked in git — filesystem-only deletion, ~2237 lines removed
- [Phase 13-01]: Local stripTTSTags in useMultiplayerRoom.ts was missing scene tag regex — replacing with @ai-dm/shared-types import is a bug fix

### Roadmap Evolution

- Phase 8 added: Multiplayer Mode — multiple users play D&D together in real-time
- Phase 10 added: S3 Audio Cache Infrastructure — Install @aws-sdk/client-s3, config, audioCache.ts service with S3 get/put/key-generation and Datadog tracing
- Phase 11 added: Investigate system architecture to determine improvements for a more ideal state for future iterations

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
| 2 | Style multiplayer chat bubbles with class-colored borders/backgrounds and inline action messages | 2026-02-21 | 71b869e | [2-style-multiplayer-chat-boxes-with-speake](./quick/2-style-multiplayer-chat-boxes-with-speake/) |
| 3 | Add pronoun picker to character creation with DM system prompt injection | 2026-02-21 | 5638a89 | [3-add-pronoun-picker-to-character-creation](./quick/3-add-pronoun-picker-to-character-creation/) |
| 4 | Add gender selection (Male/Female/Non-binary) to character creation with end-to-end threading | 2026-02-21 | fa2b01d | [4-add-gender-selection-to-character-creati](./quick/4-add-gender-selection-to-character-creati/) |

## In-Progress Work (Uncommitted)

Mood-aware background music system spanning 12 files (+411/-153 lines):
- **Client**: `backgroundMusic.ts` rewritten (mood-aware crossfade, TTS ducking), `audioController.ts` (duck/restore integration), `useSSEChat.ts` (mood from SSE stream), `useMultiplayerRoom.ts` (mood from socket events), `App.tsx` (tavern mood on start)
- **Server**: `music.ts` (per-mood generation/caching), `tts.ts` (barkeep voice change), `turnHandlers.ts` (RAG + mood extraction for multiplayer), `types.ts` (mood in dm:stream-end event)
- **UI**: `ClassSelect.tsx` and `ModeSelect.tsx` font size increases

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 13-01-PLAN.md (dead DI scaffolding deleted, stripTTSTags consolidated)
Resume context: Phase 13 Plan 01 complete. Deleted 5 dead server paths (container.ts, tokens.ts, transport/, domain/, adapters/) — 2,237 lines of untracked DI scaffold removed from disk. useMultiplayerRoom.ts now imports stripTTSTags from @ai-dm/shared-types (bug fix: scene tag stripping). All 41 server tests pass. TypeScript compiles clean.
