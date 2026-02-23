# Roadmap: AI Dungeon Master

## Overview

Build a production-quality AI Dungeon Master for small gaming communities (~1000 concurrent users). The roadmap progresses from core infrastructure through gameplay features to scale and reliability. Phases follow hard dependencies: scaffold before UI, lore data before RAG, Bedrock before streaming, observability before production deployment.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scaffold** - Monorepo structure, environment validation, and dev tooling for both client and server
- [x] **Phase 2: Chat UI** - Dark fantasy chat interface with dice roll mechanic (Blaise's pre-hackathon frontend build)
- [x] **Phase 3: Lore Graph Seed** - Neo4j AuraDB seeded with the 3-scene demo lore
- [x] **Phase 4: Bedrock Chat Core** - Claude via Bedrock with SSE streaming and full conversation history
- [x] **Phase 5: RAG Pipeline** - Entity extraction, Neo4j lore injection, and NPC personality from graph attributes
- [x] **Phase 6: Datadog Observability** - Full LLM tracing, named pipeline spans, and live dashboard
- [x] **Phase 7: Voice + Demo Polish** - MiniMax TTS opening monologue and adventure scenario validation
- [x] **Phase 8: Multiplayer Mode** - Multiple users play D&D together in real-time
- [x] **Phase 9: Scale & Auth** — Redis session store, user authentication, per-user rate limiting
- [x] **Phase 10: S3 Audio Cache Infrastructure**
- [x] **Phase 11: System Architecture Review**
- [x] **Phase 12: Production Hardening** — Auth rate limiting, Redis resilience, JWT secret alignment
- [x] **Phase 13: Dead Code Cleanup** — Remove dead DI scaffolding, deduplicate stripTTSTags
- [x] **Phase 14: Parallel TTS Processing** — Parallelize multi-voice TTS segment generation for ~5x narration latency reduction
- [x] **Phase 15: Client Polling Optimization** — Exponential backoff and initial delays for music/video polling to reduce wasted requests by ~70%
- [x] **Phase 16: Generation Observability & Log Hygiene** — Progress logging for long-running generation tasks, dev-mode log noise reduction
- [x] **Phase 17: Code Review Bug Fixes Wave 1** — Auth enforcement, JWT pinning, input validation, error handling
- [x] **Phase 18: Code Review Bug Fixes Wave 2** — IDOR, client auth, memory safety, prompt injection, performance

## Phase Details

### Phase 1: Scaffold
**Goal**: The full project structure exists and validates correctly on any teammate's machine
**Depends on**: Nothing (first phase)
**Requirements**: None directly — enables all downstream phases
**Success Criteria** (what must be TRUE):
  1. `npm run dev` starts both the Express server and Vite dev server from the monorepo root
  2. `/health` endpoint returns 200 with a JSON status payload (and `/api/health` matches for proxy usage)
  3. All required environment variables are validated at startup with clear error messages for missing values
  4. `.env.example` documents every integration key (AWS, Datadog LLMObs, Neo4j, MiniMax)
  5. Server `dev` and `start` scripts include `NODE_OPTIONS='--import dd-trace/initialize.mjs'`
  6. `.gitignore` excludes `.env` and `node_modules` — no secrets in git
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo init: root package.json with workspaces, client/ Vite+React, server/ Express+TypeScript, shared tsconfig, .gitignore (implemented; dependency verification blocked in sandbox)
- [x] 01-02-PLAN.md — Config validation: Zod env validation (DD_* LLMObs vars included), /health + /api/health route, server entry point with Neo4j connectivity check (explicit non-prod skip flag), .env.example (implemented; runtime verification blocked in sandbox)
- [x] 01-03-PLAN.md — Gap closure: Replace hard-fail .min(1) validators with envDefaults + warnOnBlankConfig pattern; add deferred requireConfigValues before Neo4j verifyConnectivity

---

### Phase 2: Chat UI
**Goal**: Users can interact with the full chat interface including dice rolls before any backend exists
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03, UI-04, GAME-01, GAME-02
**Success Criteria** (what must be TRUE):
  1. The chat UI renders in a dark fantasy theme (parchment gold `#e0d0b0`, blood red accent, Cinzel/IM Fell English fonts)
  2. DM messages and player messages are visually distinct chat bubbles
  3. A loading indicator ("The Dungeon Master is thinking...") appears while a response is pending
  4. The chat window auto-scrolls to the latest message on each new message
  5. A "Roll Dice" button triggers a distinct dice action message with brief shake animation (no frontend d20 reveal)
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Tailwind v4 setup + dark fantasy theme tokens, chat types (Message/AppState), useSSEChat mock hook, useChatScroll auto-scroll hook
- [x] 02-02-PLAN.md — ChatWindow, MessageBubble, MessageInput, DiceRoller components; App.tsx with idle/adventure state, header, reset, full wiring

---

### Phase 3: Lore Graph Seed
**Goal**: Neo4j AuraDB contains the complete demo lore and Cypher queries return correct data for all three demo turns
**Depends on**: Phase 1
**Requirements**: NEO4J-01
**Success Criteria** (what must be TRUE):
  1. `npm run seed` (or `tsx data/seed.ts`) runs to completion without errors
  2. The seed script is idempotent — running it twice does not duplicate nodes
  3. A test Cypher query for "tavern" returns the Shattered Crown Tavern node with location attributes
  4. A test Cypher query for "Gorm" returns the barkeep NPC with personality and motivation attributes
  5. A test Cypher query for "goblin" returns the combat encounter node with relationship to the quest
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Lore data: `data/lore.json` with 21 nodes (5 Character, 5 Location, 4 Item, 2 Quest, 5 Faction) and 11 relationships covering all 3 demo turns
- [x] 03-02-PLAN.md — Seed script: `data/seed.ts` with uniqueness constraints, UNWIND+MERGE node seeding, MERGE relationships, driver.close() cleanup; `npm run seed` in root package.json

---

### Phase 4: Bedrock Chat Core
**Goal**: Users can have a real back-and-forth conversation with an AI Dungeon Master whose responses stream live and incorporate dice roll results
**Depends on**: Phases 1, 2
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, GAME-03
**Success Criteria** (what must be TRUE):
  1. User types a message and sees DM narration streaming token-by-token in the chat window via SSE
  2. The DM responds in character using a D&D system prompt with full conversation history included
  3. When a dice roll is triggered, the result number is included in the next LLM prompt and the DM narrates it explicitly (e.g., "your roll of 17 strikes true")
  4. The DM narrates combat outcomes distinctly based on roll bracket (1-5 failure, 6-15 partial, 16-20 great success)
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Bedrock service + conversation store + chat route: BedrockRuntimeClient singleton with ConverseStreamCommand, in-memory conversation Map, POST /chat SSE endpoint with D&D system prompt and dice injection
- [x] 04-02-PLAN.md — Frontend SSE wiring + dice result: replace useSSEChat stub with real fetch+ReadableStream SSE, wire DiceRoller to generate d20 number, human-verify end-to-end streaming

---

### Phase 5: RAG Pipeline
**Goal**: Every DM response is contextually grounded in the lore graph — NPCs speak with graph-defined personalities and the narrative is driven by retrieved entities
**Depends on**: Phases 3, 4
**Requirements**: NEO4J-02, NEO4J-03, NEO4J-04
**Success Criteria** (what must be TRUE):
  1. Mentioning "tavern" in a player message causes the Shattered Crown Tavern's lore to appear in the system prompt before the Bedrock call
  2. Gorm (the barkeep NPC) speaks with the personality and motivation defined in the graph node, not generic barkeep dialogue
  3. The RAG lookup does not noticeably add latency — entities are extracted via keyword matching, not a second LLM call
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — RAG service: `server/src/services/rag.ts` with alias-based keyword entity extraction, Neo4j Cypher retrieval via `driver.executeQuery()`, lore context assembly with narrative attribute filtering; `initRag(driver)` startup wiring in `index.ts`
- [x] 05-02-PLAN.md — Prompt injection: modify `bedrock.ts` to accept loreContext as second SystemContentBlock; wire `buildLoreContext()` call into `chat.ts` route before each Bedrock call

---

### Phase 6: Datadog Observability
**Goal**: Every Bedrock LLM call and pipeline stage is visible in a live Datadog dashboard during the demo
**Depends on**: Phase 4
**Requirements**: DD-01, DD-02, DD-03, DD-04
**Success Criteria** (what must be TRUE):
  1. `dd-trace` auto-captures every Bedrock call — prompts, responses, token counts, and latency appear in Datadog LLM Observability without any manual span code
  2. Three named custom spans are visible in the trace waterfall: `neo4j.lore_query`, `minimax.tts`, `bedrock.dm_response`
  3. A Datadog dashboard is live and shows token usage timeseries, request latency, and trace waterfall for the past 15 minutes
  4. The dashboard is defined and managed programmatically via the Datadog API (not hand-configured in the UI)
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — Bootstrap verification + named LLMObs spans: confirm dd-trace NODE_OPTIONS and env vars; add DD_APP_KEY to .env.example; wrap bedrock.ts, neo4j.ts, tts.ts with tracer.llmobs.trace() (NOT startSpan) using correct span kinds (llm for bedrock, tool for neo4j/tts)
- [x] 06-02-PLAN.md — Programmatic dashboard: install @datadog/datadog-api-client; scripts/create-dashboard.ts creates dashboard with token usage timeseries, latency p95, and live trace stream widgets; template variables for env/service

---

### Phase 7: Voice + Demo Polish
**Goal**: The game runs reliably with a voiced opening monologue and a solid default adventure experience
**Depends on**: Phases 4, 5, 6
**Requirements**: VOICE-01, VOICE-02, DEMO-01
**Success Criteria** (what must be TRUE):
  1. Clicking "Start Adventure" plays an AI-narrated DM opening monologue and displays the first DM message in the chat
  2. The audio plays in the browser without user interaction errors (Web Audio API autoplay policy handled)
  3. The default adventure scenario (tavern arrival → quest acceptance → goblin combat with dice roll) works reliably with open-ended continuation
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — MiniMax TTS service: `server/src/services/tts.ts` (T2A v2 fetch + hex decode), `server/src/routes/narrate.ts` (POST /narrate returns audio/mpeg), mounted in `app.ts`
- [x] 07-02-PLAN.md — AudioPlayer + Start Adventure: `client/src/components/AudioPlayer.tsx` (fetch /narrate, blob playback, loading state, graceful degradation); App.tsx wiring
- [x] 07-03-PLAN.md — Demo system prompt + rehearsal: `server/src/services/system-prompt.ts` (DM persona, constraints, dice brackets, buildSystemPrompt for lore injection); human verification of demo script alignment

### Phase 8: Multiplayer Mode — multiple users play D&D together in real-time

**Goal:** 2-4 players can join a shared room via code, submit actions in batched 60-second rounds, and receive a unified DM narrative streamed to all players simultaneously, with a private player chat channel invisible to the DM
**Depends on:** Phase 7
**Requirements:** EXT-03
**Success Criteria** (what must be TRUE):
  1. Players can create or join a multiplayer room via a 6-character room code
  2. Lobby shows all joined players with names, character classes, and ready status
  3. Game starts when 2+ players are all ready; DM delivers an opening monologue
  4. 60-second turn timer runs per round; auto-fills missing actions on expiry
  5. DM weaves all player actions into one narrative, streaming to all players simultaneously
  6. Private player-to-player chat with emoji reactions is invisible to the DM AI
  7. Player status bar shows names, class-colored indicators, connection status, and submission status
  8. Single-player mode works exactly as before with no regressions
**Plans:** 5 plans

Plans:
- [x] 08-01-PLAN.md — Server Socket.IO foundation: install deps, typed events, Socket.IO init, room store, Vite WS proxy
- [x] 08-02-PLAN.md — Client multiplayer foundation: socket.io-client, socket singleton, types, ModeSelect screen, MultiplayerLobby
- [x] 08-03-PLAN.md — Server socket handlers: room create/join/ready/disconnect, turn timer + DM trigger, player chat relay, multiplayer system prompt
- [x] 08-04-PLAN.md — Client game UI: useMultiplayerRoom hook, MultiplayerGame component, PlayerStatusBar, PlayerChat panel
- [x] 08-05-PLAN.md — Integration wiring: Socket.IO init in server startup, App.tsx mode routing, end-to-end human verification

---

### Phase 9: Scale & Auth — Redis session store, user auth, per-user rate limiting

**Goal:** The game handles ~1000 concurrent users with persistent sessions, authentication, and production-grade reliability
**Depends on:** Phase 7
**Requirements:** SCALE-01, SCALE-02, SCALE-03, SCALE-04, SCALE-05
**Success Criteria** (what must be TRUE):
  1. Conversation state stored in Redis (not in-memory) — survives server restarts and supports multi-instance deployment
  2. Users can authenticate and their sessions persist across visits
  3. Per-user rate limiting prevents abuse on `/chat` and `/narrate`
  4. Bedrock request queuing handles backpressure under 1000 concurrent users

Note: Deployment infrastructure (auto-scaling, ECS/EKS config) is deferred to a future phase.

**Plans:** 3 plans

Plans:
- [x] 09-01-PLAN.md — Redis client singleton, Bedrock queue, config additions, Socket.IO Redis adapter wiring
- [x] 09-02-PLAN.md — Conversation store async migration to Redis with in-memory fallback, all callers updated, Bedrock queue wired into chat/narrate/multiplayer
- [x] 09-03-PLAN.md — JWT auth routes (register/login), auth middleware, per-user rate limiting on /api/chat and /api/narrate with Redis-backed counters

### Phase 10: S3 Audio Cache Infrastructure

**Goal:** Durable S3-backed TTS audio cache that persists across server restarts and supports cross-instance sharing, replacing the ephemeral in-memory-only cache
**Depends on:** Phase 9
**Plans:** 1 plans

Plans:
- [x] 10-01-PLAN.md — Install @aws-sdk/client-s3, create audioCache.ts with S3 get/put/buildCacheKey + Datadog tracing, wire into tts.ts as L2 cache behind existing in-memory L1

### Phase 11: Architecture Audit and Improvements

**Goal:** Harden the codebase for production readiness and future iteration by adding security middleware, rate limiting, Bedrock concurrency control, store interfaces for Redis readiness, service extraction for architectural consistency, and test scaffolding
**Depends on:** Phase 10
**Plans:** 6 plans

Plans:
- [x] 11-01-PLAN.md — Security middleware (helmet + CORS) and per-route rate limiting on /api/chat, /api/narrate, /api/music
- [x] 11-02-PLAN.md — Bedrock concurrency cap via p-queue and promptBuilder.ts extraction from bedrock.ts
- [x] 11-03-PLAN.md — IConversationStore and IRoomStore interfaces for Redis readiness, usageTracker rolling eviction
- [x] 11-04-PLAN.md — Extract musicService.ts from routes/music.ts for architectural consistency
- [x] 11-05-PLAN.md — Vitest scaffolding and unit tests for promptBuilder, conversationStore, usageTracker
- [x] 11-06-PLAN.md — Gap closure: remove dead chatLimiter and narrateLimiter from rateLimits.ts (orphaned by Phase 09 Redis-backed limiters)

### Phase 12: Production Hardening

**Goal:** Close resilience and security gaps identified by milestone audit for production readiness at 1000 users
**Depends on:** Phase 11
**Requirements:** Strengthens SCALE-02 (auth), SCALE-03 (rate limiting)
**Gap Closure:** Closes tech debt from v1.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. `/api/auth/register` rate-limited to 3 requests/minute per IP (prevents registration spam)
  2. `/api/auth/login` rate-limited to 10 requests/minute per IP (prevents credential stuffing)
  3. `conversationStore` Redis calls wrapped in try/catch — mid-run Redis failure falls back to in-memory instead of 500 errors
  4. JWT verify uses same dev-secret fallback as JWT sign — auth works in development without explicit JWT_SECRET
**Plans:** 2 plans

Plans:
- [x] 12-01-PLAN.md — Auth rate limiters (register 3/min, login 10/min per IP) in rateLimiter.ts, wired in app.ts; JWT verify dev-secret fallback in auth.ts
- [x] 12-02-PLAN.md — Redis resilience: wrap all 5 conversationStore public methods' Redis branches in try/catch with in-memory fallback

---

### Phase 13: Dead Code Cleanup

**Goal:** Remove dead DI architecture scaffolding and duplicate code to reduce maintenance burden and codebase confusion
**Depends on:** Phase 11
**Gap Closure:** Closes tech debt from v1.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. `server/src/container.ts`, `server/src/tokens.ts`, `server/src/transport/`, `server/src/domain/`, `server/src/adapters/` are deleted
  2. No TypeScript compilation errors after deletion (`npx tsc --noEmit`)
  3. All 41 existing server tests still pass
  4. `useMultiplayerRoom.ts` imports `stripTTSTags` from `@ai-dm/shared-types` instead of defining a local copy
**Plans:** 1 plan

Plans:
- [x] 13-01-PLAN.md — Delete dead DI scaffolding (container.ts, tokens.ts, transport/, domain/, adapters/), replace local stripTTSTags in useMultiplayerRoom.ts with @ai-dm/shared-types import

### Phase 14: Parallel TTS Processing

**Goal:** Parallelize multi-voice TTS segment generation for ~5x narration latency reduction (from ~15s sequential to ~3s parallel)
**Depends on:** Phase 13
**Success Criteria** (what must be TRUE):
  1. TTS segments are generated concurrently via `Promise.allSettled()` instead of sequential `for`/`await` loop
  2. Per-segment fallback-to-narrator logic preserved — if a non-narrator voice fails, that segment retries with narrator voice
  3. Narrator voice failure remains terminal (entire TTS call fails gracefully)
  4. Total narration generation time for 7 segments drops from ~15s to ~3-4s (bounded by slowest single segment)
  5. Existing L1/L2 cache behavior unchanged — cached segments still skip API calls
**Context:** Currently in `server/src/services/tts.ts`, the `generateMultiVoiceTTS` function processes voice segments in a sequential for loop (line ~282). Each segment takes 1-3s for the MiniMax API call, and with 7 segments that's ~15s total. These calls are independent and can be parallelized. The fallback logic (non-narrator failure retries as narrator) must be preserved per-segment within the parallel execution.
**Plans:** 1 plan

Plans:
- [x] 14-01-PLAN.md — Unit tests for parallel TTS behavior + refactor generateMultiVoiceTTS to Promise.allSettled fan-out with per-segment fallback and timing log

### Phase 15: Client Polling Optimization

**Goal:** Replace aggressive fixed-interval polling with exponential backoff, initial delays, and server-side progress signals to reduce wasted requests by ~70%
**Depends on:** Phase 13
**Success Criteria** (what must be TRUE):
  1. Music polling (`/api/music`) uses exponential backoff: 2s -> 4s -> 8s -> 16s -> 30s cap (instead of fixed 4s interval)
  2. Video polling (`/api/scene-video`) uses exponential backoff: 2s -> 4s -> 8s -> 16s -> 30s cap (instead of fixed 5s interval)
  3. Initial polling delay added -- music waits 10s before first poll, video waits 15s (matching typical minimum generation times)
  4. Server 202 responses include `startedAt` timestamp so clients can estimate wait time
  5. Total polling requests for a typical music generation (~55s) reduced from ~14 to ~6-7
  6. Total polling requests for a typical video generation (~180s) reduced proportionally
  7. Existing `MAX_POLLS` and `MAX_RETRIES` safety limits preserved as upper bounds
**Context:** The client polls `/api/music` every 4s (`client/src/services/backgroundMusic.ts`, `POLL_INTERVAL_MS = 4000`) and `/api/scene-video` every 5s (`client/src/services/sceneVideo.ts`, `POLL_INTERVAL_MS = 5000`) with no backoff. Music generation takes ~55s, producing 14 wasted 202 responses. Video generation takes up to 180s. The server routes (`server/src/routes/music.ts` and `server/src/routes/sceneVideo.ts`) return plain `{ status: "generating" }` with no progress info. The server-side music service (`server/src/services/musicService.ts`) and video generator (`server/src/services/videoGenerator.ts`) track generation start time internally.
**Plans:** 1 plan

Plans:
- [x] 15-01-PLAN.md — Server startedAt timestamps on 202 responses + client exponential backoff with initial delay

### Phase 16: Generation Observability & Log Hygiene

**Goal:** Add progress logging for long-running generation tasks and reduce dev-mode log noise for clearer debugging
**Depends on:** Phase 13
**Success Criteria** (what must be TRUE):
  1. Video generation internal polling logs progress every poll attempt (e.g., "video poll attempt 3/18, status: processing, elapsed: 30s")
  2. Music generation logs periodic progress during the MiniMax API call (start, 30s mark, completion)
  3. Config warnings for missing optional services (Redis, JWT) downgraded to debug level or logged only once per startup (not on every request)
  4. Log output during a typical cold-start + first request is reduced by at least 50% of noise lines
  5. All new log entries follow existing structured JSON logging format with event/timestamp/level fields
**Context:** Video generation submits a task to MiniMax (`server/src/services/videoGenerator.ts`) then polls internally every 10 seconds for up to 180 seconds, but logs nothing between task submission and completion/failure. Music generation (`server/src/services/musicService.ts`) similarly has a ~55s API call with no intermediate logging. Config warnings in `server/src/services/config.ts` fire for Redis and JWT on every startup even in dev mode where these are intentionally absent. The `SKIP_NEO4J_CONNECTIVITY_CHECK=1` pattern already exists as a model for optional-service handling.
**Plans:** 1 plan

Plans:
- [x] 16-01-PLAN.md — Video/music generation progress logging + dev-mode config warning suppression for Redis/JWT

### Phase 17: Code Review Bug Fixes Wave 1 — Auth enforcement, JWT pinning, input validation, error handling

**Goal:** Fix all critical and high-severity bugs plus easy/trivial medium-severity issues identified in `docs/CODE_REVIEW_2026-02-22.md` Wave 1 priority list — the pre-production blockers that must be resolved before deploying to 1000 users
**Depends on:** Phase 16
**Requirements:** Strengthens SCALE-02 (auth), SCALE-03 (rate limiting), SCALE-04 (reliability)
**Source:** `docs/CODE_REVIEW_2026-02-22.md` — Wave 1 (14 issues) + select Wave 2 easy fixes
**Success Criteria** (what must be TRUE):
  1. `requireAuth` middleware enforced on `/api/chat`, `/api/narrate`, `/api/music`, `/api/scene-video` (C-1)
  2. JWT sign/verify pinned to `HS256` algorithm explicitly (H-1)
  3. Socket.IO `skipMiddlewares: false` on connection state recovery (H-2)
  4. `dice:roll` event validates result as integer 1-20 (H-3)
  5. Emoji allowlist uses Unicode characters matching client-sent values (H-4)
  6. S3 `response.Body` null-checked before `transformToByteArray()` (H-8)
  7. Post-`res.end()` `appendMessage` wrapped in try/catch (H-9)
  8. Narrate route sanitizes input text with `sanitizeUserInput()` and length limit (H-15)
  9. Password policy requires 8-128 characters (M-3)
  10. Health endpoint no longer exposes `process.uptime()` (M-6)
  11. `x-request-id` validated against alphanumeric regex, max 128 chars (M-7)
  12. Narrate endpoint validates `conversationId` format (M-8)
  13. Bedrock queue overload threshold lowered to 40-60 (M-9)
  14. Neo4j query uses 5000ms timeout (M-12)
  15. Graceful shutdown closes Redis, Socket.IO, and stops accepting new connections (H-7)
  16. DM trigger functions have idempotency guard against concurrent invocation (H-10)
  17. Room deletion clears pending timers and emits dm:error if DM was streaming (H-13)
  18. TypeScript compiles clean (`npx tsc --noEmit`) and existing tests pass
**Context:** The comprehensive code review identified ~80 unique findings across 4 review dimensions (security, code quality, architecture, performance). This phase targets the 14 Wave 1 items (all trivial/easy effort) plus 3 easy Wave 2 items (H-7, H-10, H-13) that are critical for production safety. Wave 2 architectural changes (Redis Lists, circuit breakers, conversation ownership) and Wave 3 performance tuning are deferred to future phases.
**Plans:** 3 plans

Plans:
- [x] 17-01-PLAN.md — Auth enforcement (C-1), JWT algorithm pinning (H-1), Socket.IO auth bypass fix (H-2), password policy (M-3)
- [x] 17-02-PLAN.md — Input validation and error handling: dice:roll (H-3), emoji allowlist (H-4), S3 null check (H-8), post-stream try/catch (H-9), narrate sanitization (H-15), health uptime (M-6), request-id validation (M-7), narrate conversationId (M-8), Bedrock threshold (M-9), Neo4j timeout (M-12)
- [x] 17-03-PLAN.md — Graceful shutdown (H-7), DM trigger idempotency (H-10), room deletion cleanup (H-13)

### Phase 18: Code Review Bug Fixes Wave 2 — IDOR, Client Auth, Memory Safety, Prompt Injection, Performance

**Goal:** Fix all remaining findings from the comprehensive 4-agent code review (security, performance, architecture, code quality) not addressed by Phase 17. Covers IDOR access control, client auth integration, memory safety, prompt injection hardening, Redis optimization, and architectural improvements for ~1000 concurrent users.
**Depends on:** Phase 17
**Source:** Comprehensive 4-agent review (security auditor, performance engineer, architecture reviewer, code quality reviewer) — 2026-02-22
**Success Criteria** (what must be TRUE):
  CRITICAL (P0 — fix before any deployment):
  1. Conversations bound to userId — accessing another user's conversationId returns 403 (IDOR fix)
  2. Dev JWT secret is randomly generated at startup, not a hardcoded string in source
  3. Client sends Authorization: Bearer token on all /api/chat and /api/narrate requests
  4. Music and video in-memory caches have byte-size limits and LRU/TTL eviction
  HIGH (P1 — fix before scale to 1000 users):
  5. Socket.IO rejects unauthenticated connections in production
  6. inputSanitizer strips unicode control chars, zero-width chars; characterClass/pronouns validated against allowlist
  7. SSE stream respects backpressure (checks res.write() return, pauses on false)
  8. Chat route holds conversation in local variable, writes to Redis once (not 9 round-trips)
  9. JWT access token expiry reduced; refresh token flow implemented
  10. Multiplayer TTS audio served via S3 signed URLs (not base64 over Socket.IO)
  11. Shared DmTurnService extracted from chat.ts and turnHandlers.ts
  12. /api/usage endpoint requires authentication
  MEDIUM (P2):
  13. Character class enums unified in @ai-dm/shared-types (client and server match)
  14. Per-username account lockout after N failed login attempts
  15. Express trust proxy configured for deployment behind reverse proxy
  16. Conversation store in-memory fallback wrapped in withLock
  17. /api/narrate has overall 60s request timeout
  18. Graceful shutdown drains active SSE streams before closing
  19. Zod request validation on route bodies
  20. Dual route paths standardized to /api/ prefix only
  21. MessageBubble wrapped in React.memo with useMemo for content
  22. Multiplayer TTS Object URL cleanup on unmount/error
  23. React.lazy code splitting for multiplayer components
  24. isSystemTrigger removed from client control or restricted
  25. Bedrock queue has 15s wait timeout
  26. Redis conversation data validated with Zod after JSON.parse
  27. Password complexity requirements beyond length
  28. Large media (video) served from S3 via signed URLs, not through Express
  LOW (P3):
  29. All console.log/error calls replaced with logEvent()
  30. UUID regex extracted to shared validation utility
  31. Generic TieredCache<T> replaces 4 copy-pasted cache implementations
  32. Unused _deps parameter removed from createApp()
  33. Unused tsyringe + reflect-metadata removed from dependencies
  34. Mixed lockfiles resolved (single package manager)
  35. tsconfig.tsbuildinfo added to .gitignore
  36. bcrypt timing attack dummy uses valid pre-computed hash
  37. HSTS explicitly configured in Helmet
  38. CSP updated for WebSocket and media blob URLs
  39. DM_SYSTEM_PROMPT moved to dedicated content file
  40. _testInternals removed from production exports
  41. Client-side test infrastructure added (Vitest + Testing Library)
  42. Socket rate limiter changed from O(n) splice to O(1) counter
**Plans:** 10 plans

Plans:
- [x] 18-01-PLAN.md — P0 security: IDOR conversation ownership binding, random dev JWT secret, /api/usage auth enforcement
- [x] 18-02-PLAN.md — Prompt injection hardening: inputSanitizer unicode/role-tag expansion, characterClass allowlist, Socket.IO production auth, isSystemTrigger removal, bcrypt dummy hash
- [x] 18-03-PLAN.md — Memory safety: lru-cache byte-budget LRU for TTS (100MB), video (500MB), and music (200MB) caches
- [x] 18-04-PLAN.md — Redis optimization + SSE backpressure: GETEX replacing GET+EXPIRE, local conversation variable, res.write() backpressure check
- [x] 18-05-PLAN.md — Client auth integration: server refresh token flow (15m access + 7d refresh), login/register UI, Bearer headers on all API calls, Socket.IO auth token
- [x] 18-06-PLAN.md — Architecture extraction: DmTurnService from chat.ts/turnHandlers.ts, S3 signed URLs for multiplayer TTS
- [x] 18-07-PLAN.md — Server hardening P2: trust proxy, /api/-only route standardization, Bedrock queue 15s timeout, narrate 60s timeout, SSE stream drain on shutdown
- [x] 18-08-PLAN.md — Validation hardening: password complexity, per-username lockout, Zod on chat/narrate bodies, Zod on Redis conversation data
- [x] 18-09-PLAN.md — Frontend performance: React.memo MessageBubble, TTS Object URL cleanup, React.lazy code splitting, shared CHARACTER_CLASS_IDS
- [x] 18-10-PLAN.md — P3 cleanup: HSTS + CSP update, O(1) socket rate limiter, logEvent everywhere, remove _deps/tsyringe, .gitignore tsbuildinfo, gate _testInternals

### Phase 19: Code Review Wave 3 (Reduced) — Auth hardening, schema leakage, LRU cache, cleanup

**Goal:** Fix remaining actionable findings from the 2026-02-22 AI-powered code review. Scope reduced from 20 to 15 items by cutting YAGNI (distributed locks — single instance only, refresh token families — enterprise-grade for community game, consistent error envelope — cosmetic), absorbing M-7 into H-3, and simplifying M-8 to dead code removal.
**Depends on:** Phase 18
**Source:** AI-powered code review (Claude Opus 4.6) — 2026-02-22. Items C-2, H-1, L-2 deferred as YAGNI for ~1000-user single-instance deployment.
**Success Criteria** (what must be TRUE):
  CRITICAL (P0):
  1. Zod validation errors on `/api/chat` and `/api/narrate` return generic message only — field error details logged server-side via `logEvent`, never sent to client (C-1)
  2. User registration uses atomic Redis `HSETNX` — concurrent registrations with same username cannot both succeed (C-3)
  HIGH (P1):
  3. Socket.IO auth defaults to required unless `NODE_ENV === 'development'` explicitly — flip `=== 'production'` to `!== 'development'` (H-2)
  4. Lore cache uses `LRUCache` from `lru-cache` package (already used in tts.ts, musicService.ts, videoGenerator.ts) instead of plain `Map` with O(n) FIFO eviction — also resolves M-7 (H-3)
  5. `/api/auth/logout` endpoint exists — deletes refresh token from Redis/in-memory (H-4)
  6. In-memory login lockout counter expires after `LOCKOUT_DURATION_S` elapsed — store `{count, firstAttemptAt}` instead of bare number (H-5)
  MEDIUM (P2):
  7. `/api/auth/refresh` rate-limited to 5 req/min per IP — copy `registerLimiter` pattern (M-6)
  8. Narrate route dead AbortController removed — signal was never wired to any downstream call (M-8)
  9. Usage tracker has periodic `setInterval` cleanup timer as backup to lazy eviction (M-3)
  10. Neo4j query uses label constraint (e.g., `MATCH (n:Character)`) for index-eligible scans (M-4)
  LOW (P3):
  11. `getCharacterClass`/`getPronouns` verified unused after Phase 18 optimization, removed from public API if confirmed (L-1)
  12. `SESSION_SECRET` removed from config.ts and `.env.example` — dead config, app uses JWT_SECRET (L-3)
  13. Client TTS fetch uses abort signal for skip cancellation — add `signal: controller.signal` to one fetch call (L-4)
  14. Socket rate limit constants moved to config.ts (L-5)
  15. In-memory user store uses `Map<string, UserRecord>` instead of `Array` for O(1) lookup (L-6)
  16. TypeScript compiles clean (`npx tsc --noEmit`) and all existing tests pass
**Deferred (YAGNI for single-instance ~1000 users):**
  - C-2: Distributed locks — only needed for multi-instance deployment (not yet planned)
  - H-1: Refresh token family tracking — enterprise-grade; current rotation is sufficient
  - L-2: Consistent error envelope — cosmetic, high file churn, zero user value
**Plans:** 2 plans

Plans:
- [ ] 19-01-PLAN.md — Auth hardening: HSETNX registration atomicity (C-3), logout endpoint (H-4), lockout expiry TTL (H-5), refresh rate limiter (M-6), Map-based user store (L-6)
- [ ] 19-02-PLAN.md — Codebase cleanup: Zod error sanitization (C-1), Socket.IO auth default flip (H-2), lore cache LRU swap (H-3), usage tracker timer (M-3), Neo4j label constraint (M-4), remove dead AbortController (M-8), remove unused getCharacterClass/getPronouns (L-1), delete SESSION_SECRET (L-3), client TTS abort signal (L-4), socket rate config (L-5)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

Note: Phases 2 and 3 depend only on Phase 1 and can be worked on simultaneously if needed (lore seeding does not block UI work). Phase 9 (Scale & Auth) can begin after Phase 7 in parallel with Phase 8.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold | 3/3 | Complete | 2026-02-20 |
| 2. Chat UI | 2/2 | Complete | 2026-02-20 |
| 3. Lore Graph Seed | 2/2 | Complete | 2026-02-20 |
| 4. Bedrock Chat Core | 2/2 | Complete | 2026-02-20 |
| 5. RAG Pipeline | 2/2 | Complete | 2026-02-20 |
| 6. Datadog Observability | 2/2 | Complete | 2026-02-20 |
| 7. Voice + Demo Polish | 3/3 | Complete | 2026-02-20 |
| 8. Multiplayer Mode | 5/5 | Complete | 2026-02-21 |
| 9. Scale & Auth | 3/3 | Complete | 2026-02-21 |
| 10. S3 Audio Cache | 1/1 | Complete | 2026-02-21 |
| 11. Architecture Audit | 6/6 | Complete | 2026-02-21 |
| 12. Production Hardening | 2/2 | Complete | 2026-02-21 |
| 13. Dead Code Cleanup | 1/1 | Complete | 2026-02-21 |
| 14. Parallel TTS Processing | 1/1 | Complete | 2026-02-21 |
| 15. Client Polling Optimization | 1/1 | Complete | 2026-02-22 |
| 16. Generation Observability & Log Hygiene | 1/1 | Complete | 2026-02-22 |
| 17. Code Review Bug Fixes Wave 1 | 3/3 | Complete | 2026-02-22 |
| 18. Code Review Bug Fixes Wave 2 | 10/10 | Complete | 2026-02-22 |
| 19. Code Review Bug Fixes Wave 3 | 0/2 | Planned | -- |
