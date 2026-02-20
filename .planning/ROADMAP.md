# Roadmap: AI Dungeon Master

## Overview

Build a live, demo-ready AI Dungeon Master for the AWS x Anthropic x Datadog GenAI Hackathon. The roadmap front-loads pre-hackathon work Blaise can complete now (scaffold, UI, lore data) so the team's 6-hour build window focuses exclusively on integrating the backend services. Phases follow hard dependencies: scaffold before UI, lore data before RAG, Bedrock before streaming, observability before demo polish.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Scaffold** - Monorepo structure, environment validation, and dev tooling for both client and server
- [ ] **Phase 2: Chat UI** - Dark fantasy chat interface with dice roll mechanic (Blaise's pre-hackathon frontend build)
- [ ] **Phase 3: Lore Graph Seed** - Neo4j AuraDB seeded with the 3-scene demo lore
- [ ] **Phase 4: Bedrock Chat Core** - Claude via Bedrock with SSE streaming and full conversation history
- [ ] **Phase 5: RAG Pipeline** - Entity extraction, Neo4j lore injection, and NPC personality from graph attributes
- [ ] **Phase 6: Datadog Observability** - Full LLM tracing, named pipeline spans, and live dashboard
- [ ] **Phase 7: Voice + Demo Polish** - MiniMax TTS opening monologue and rehearsed 3-turn scenario

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
- [ ] 01-03-PLAN.md — Gap closure: Replace hard-fail .min(1) validators with envDefaults + warnOnBlankConfig pattern; add deferred requireConfigValues before Neo4j verifyConnectivity

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
  5. A "Roll Dice" button triggers an animated d20 reveal with a suspense delay before showing the result
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Tailwind v4 setup + dark fantasy theme tokens, chat types (Message/AppState), useSSEChat mock hook, useChatScroll auto-scroll hook
- [ ] 02-02-PLAN.md — ChatWindow, MessageBubble, MessageInput, DiceRoller components; App.tsx with idle/adventure state, header, reset, full wiring

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
**Plans**: TBD

Plans:
- [ ] 03-01: Lore schema + JSON — `data/lore.json` with ~20 nodes (Character, Location, Item, Quest, Faction labels); 3-scene coverage (tavern, barkeep, goblin encounter)
- [ ] 03-02: Seed script + verification — `data/seed.ts` with `MERGE` for idempotency; `driver.executeQuery()` pattern; verify Cypher queries for all three demo turns

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
**Plans**: TBD

Plans:
- [ ] 04-01: Bedrock service — `server/src/services/bedrock.ts` using `@aws-sdk/client-bedrock-runtime` `BedrockRuntimeClient` + `ConverseStreamCommand`; model ID verified with test invocation
- [ ] 04-02: Chat route + SSE — `server/src/routes/chat.ts` accepts `{ message, history, diceResult? }`, pipes stream chunks as SSE with `X-Accel-Buffering: no`; D&D system prompt with dice result injection
- [ ] 04-03: Frontend SSE wiring — connect `useSSEChat.ts` to live `/chat` endpoint; verify streaming renders in `ChatWindow`; wire dice roll value into next message payload

---

### Phase 5: RAG Pipeline
**Goal**: Every DM response is contextually grounded in the lore graph — NPCs speak with graph-defined personalities and the narrative is driven by retrieved entities
**Depends on**: Phases 3, 4
**Requirements**: NEO4J-02, NEO4J-03, NEO4J-04
**Success Criteria** (what must be TRUE):
  1. Mentioning "tavern" in a player message causes the Shattered Crown Tavern's lore to appear in the system prompt before the Bedrock call
  2. Gorm (the barkeep NPC) speaks with the personality and motivation defined in the graph node, not generic barkeep dialogue
  3. The RAG lookup does not noticeably add latency — entities are extracted via keyword matching, not a second LLM call
**Plans**: TBD

Plans:
- [ ] 05-01: RAG service — `server/src/services/rag.ts` with keyword entity extraction against a pre-seeded entity list; Cypher retrieval of matching nodes; lore context assembled as a string block
- [ ] 05-02: Prompt injection + NPC personality — inject lore context into system prompt before each Bedrock call; NPC node attributes (personality, motivation) included verbatim; verify demo Turn 1 and Turn 2 prompt content

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
**Plans**: TBD

Plans:
- [ ] 06-01: dd-trace bootstrap — `NODE_OPTIONS='--import dd-trace/initialize.mjs'` in server start script; all five required env vars validated (`DD_LLMOBS_ENABLED`, `DD_LLMOBS_ML_APP`, `DD_API_KEY`, `DD_LLMOBS_AGENTLESS_ENABLED`, `DD_SITE`); smoke-test with one real request to confirm LLM span appears in Datadog
- [ ] 06-02: Named custom spans — `tracer.startSpan('neo4j.lore_query')`, `tracer.startSpan('minimax.tts')`, `tracer.startSpan('bedrock.dm_response')` wrapping the relevant service calls with try/finally finish
- [ ] 06-03: Programmatic dashboard — Datadog API script (`scripts/create-dashboard.ts`) creates token usage timeseries, latency graph, and trace waterfall widget; run against real trace data before demo

---

### Phase 7: Voice + Demo Polish
**Goal**: The demo runs flawlessly for three turns with a voiced opening monologue and zero improvisation risk
**Depends on**: Phases 4, 5, 6
**Requirements**: VOICE-01, VOICE-02, DEMO-01
**Success Criteria** (what must be TRUE):
  1. Clicking "Start Adventure" plays an AI-narrated DM opening monologue and displays the first DM message in the chat
  2. The audio plays in the browser without user interaction errors (Web Audio API autoplay policy handled)
  3. The scripted 3-turn demo (tavern arrival → quest acceptance → goblin combat with dice roll) completes without errors or off-script DM responses
**Plans**: TBD

Plans:
- [ ] 07-01: MiniMax TTS service — `server/src/services/tts.ts` using raw `fetch` to MiniMax T2A v2; hex-decode `Buffer.from(hex, 'hex')`; `POST /narrate` route returns audio buffer; standalone test script validates response shape before integration
- [ ] 07-02: AudioPlayer + Start Adventure — `client/src/components/AudioPlayer.tsx`; "Start Adventure" button calls `/narrate` then plays audio; loading state ("The Dungeon Master is speaking...") during generation
- [ ] 07-03: Demo scenario rehearsal — 3 pre-written player inputs locked in; system prompt tuned for lore consistency; Datadog dashboard pre-populated with real traces; two-screen setup confirmed (app + dashboard)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

Note: Phases 2 and 3 depend only on Phase 1 and can be worked on simultaneously if needed (lore seeding does not block UI work).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold | 2/3 | Gap closure planned for config validation pattern | 2026-02-20 |
| 2. Chat UI | 0/2 | Planned | - |
| 3. Lore Graph Seed | 0/2 | Not started | - |
| 4. Bedrock Chat Core | 0/3 | Not started | - |
| 5. RAG Pipeline | 0/2 | Not started | - |
| 6. Datadog Observability | 0/3 | Not started | - |
| 7. Voice + Demo Polish | 0/3 | Not started | - |
