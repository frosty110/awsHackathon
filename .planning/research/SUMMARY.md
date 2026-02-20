# Project Research Summary

**Project:** AI D&D Dungeon Master — AWS x Anthropic x Datadog GenAI Hackathon
**Domain:** AI chat application with graph RAG, LLM observability, and TTS narration
**Researched:** 2026-02-20
**Confidence:** MEDIUM

## Executive Summary

This is a 6-hour hackathon demo targeting four simultaneous prize tracks (main AWS/$15K credits, Datadog/Meta Glasses, Neo4j/Bose headphones, MiniMax/$12K pool). The winning strategy is not building the most complete D&D engine — it is building the most convincing live demo that visibly proves all four technologies working together in a single scripted 3-turn scenario. Every competitor uses OpenAI; none combine Neo4j graph RAG + Datadog LLM observability + MiniMax TTS. That combination is the differentiation story and should drive every build decision.

The recommended approach is a monorepo with a Node.js/Express backend and a Vite/React frontend. The single non-negotiable architectural constraint is that `@aws-sdk/client-bedrock-runtime` must be used for Claude calls — Datadog `dd-trace` auto-instruments that SDK and nothing else. Using the `@anthropic-ai/bedrock-sdk` instead produces zero Datadog LLM spans, which eliminates the Datadog prize entirely. The build order should follow hard dependencies: seed Neo4j first, get a bare Bedrock call working, add SSE streaming, layer in RAG, add Datadog instrumentation, and add TTS last as a demo flourish.

The three existential risks are: (1) Bedrock model access not pre-enabled before the clock starts — it cannot be fixed mid-hackathon; (2) `dd-trace` loaded after other modules, causing silent empty-dashboard failure at demo time; and (3) MiniMax TTS blocking the UI for 3-8 seconds per turn, which makes the demo feel broken. All three are preventable with pre-hackathon checklist work and architecture decisions made in Phase 1.

---

## Key Findings

### Recommended Stack

The stack is largely locked by hackathon requirements: Node.js 22 LTS, Express 5, React 19, and AWS Bedrock (Claude 3.5 Sonnet v2). The critical research finding on top of these constraints is that `@aws-sdk/client-bedrock-runtime` is the only SDK that Datadog `dd-trace` auto-instruments — this was verified via the DeepWiki dd-trace-js source and is the highest-stakes technical decision in the project. All other library choices follow from this constraint and from hackathon time pressure: `tsx` over `ts-node` for fast startup, raw `fetch` for MiniMax TTS (no Node.js SDK exists), Tailwind v4 + shadcn/ui for instant dark fantasy theming, and `neo4j-driver@^6.0.1` for AuraDB with native Vector type support.

**Core technologies:**
- `@aws-sdk/client-bedrock-runtime` ^3.x: Bedrock LLM calls — the ONLY SDK that Datadog auto-instruments; not interchangeable with `@anthropic-ai/bedrock-sdk`
- `dd-trace` ^5.86: LLM observability + APM — auto-instruments Bedrock with zero code changes when loaded via `NODE_OPTIONS`
- `neo4j-driver` ^6.0.1: Graph RAG database — v6 is current; native Vector type; AuraDB requires `neo4j+s://` URI scheme
- `vite` ^6.x + `react` ^19.0: Frontend SPA — instant HMR critical in a 6-hour window
- Tailwind CSS v4 + shadcn/ui: Styling — dark fantasy theme with zero runtime overhead; copy-paste components save 30+ minutes
- Raw `fetch` for MiniMax TTS: No official Node.js SDK exists; hex-decoded PCM response
- `tsx` + `nodemon`: TypeScript dev server with no compilation step

**Do not use:** `@anthropic-ai/bedrock-sdk` (breaks Datadog), LangChain (opaque abstractions, 5+ MB overhead), socket.io (SSE is sufficient for unidirectional streaming), Next.js (wrong server model).

### Expected Features

The demo is a scripted 3-turn scenario: tavern arrival → barkeep gives quest → goblin combat with dice roll. Every feature decision is evaluated against demo value, not product completeness. The research identified a clear tier structure.

**Must have (table stakes — demo day launch):**
- Chat UI with dark fantasy theme — judges expect themed UI; generic white chat signals no polish
- Claude via AWS Bedrock as DM — required for main prize eligibility
- Neo4j lore graph + Cypher RAG injection — graph-powered context must be visibly driving the narrative
- Datadog live trace visible during pitch — judges watch the dashboard; this is the observability demo moment
- Dice roll display (d20 attack in goblin combat) — animated reveal is the emotional peak of the demo
- MiniMax TTS narration — audio creates cinematic effect; no competing team is likely to have voice
- Scripted 3-turn scenario (tavern → quest → combat) — eliminates all improvisation risk

**Should have (P2 differentiators — add after MVP works end-to-end):**
- Named Datadog spans per pipeline stage (`neo4j.lore_query`, `minimax.tts`, `bedrock.dm_response`) — makes the dashboard far more impressive to Datadog judges
- NPC personality injected from graph node attributes — makes RAG tangible and auditable
- Dice roll value passed to LLM prompt — lets Claude narrate "your roll of 17 strikes true" instead of making up numbers

**Defer (post-hackathon only):**
- Character creation flow, persistent campaign memory, multiplayer support, full D&D 5e rules engine, image generation, voice input (ASR)

### Architecture Approach

The architecture is a straightforward three-tier system: React frontend communicates with Express backend via HTTP POST (user messages) and SSE streams (DM response chunks), and the backend orchestrates three external services — AWS Bedrock for LLM, Neo4j AuraDB for graph RAG, and MiniMax for TTS. Datadog `dd-trace` wraps the entire server layer via `NODE_OPTIONS` initialization. The key architectural insight is that MiniMax TTS should run against the opening monologue only (not every DM turn), as 1-3 second TTS latency blocks the chat feel. The RAG pipeline uses keyword matching against a pre-seeded entity list rather than a second LLM extraction call, keeping per-turn latency minimal.

**Major components:**
1. React Chat UI (`client/`) — SSE consumer via `fetch` + `ReadableStream`; `<audio>` element for TTS; dark fantasy theme via Tailwind/shadcn
2. Express `/chat` route — accepts message + history, runs RAG pipeline, streams Bedrock `ConverseStreamCommand` as SSE
3. Express `/narrate` route — accepts text, calls MiniMax T2A v2, returns audio buffer
4. RAG Pipeline Service (`services/rag.ts`) — keyword entity extraction + Neo4j Cypher query + prompt assembly; entities from current turn only
5. Bedrock Service (`services/bedrock.ts`) — `BedrockRuntimeClient` wrapper; pipes delta chunks to SSE response
6. TTS Service (`services/tts.ts`) — raw `fetch` to MiniMax; hex-decodes PCM buffer
7. Neo4j (`services/neo4j.ts`) — singleton driver; `driver.executeQuery()` with try/finally session close
8. Data seeding (`data/seed.ts`) — ~20 lore nodes run once at setup, not in request path

**Canonical file structure:**
```
project/
├── client/src/components/ (ChatWindow, MessageInput, AudioPlayer)
├── client/src/hooks/useSSEChat.ts
├── server/src/index.ts  (dd-trace bootstrap via NODE_OPTIONS)
├── server/src/routes/ (chat.ts, narrate.ts)
├── server/src/services/ (rag.ts, bedrock.ts, neo4j.ts, tts.ts, config.ts)
└── data/ (seed.ts, lore.json)
```

### Critical Pitfalls

1. **`dd-trace` loaded after other modules** — Use `NODE_OPTIONS='--import dd-trace/initialize.mjs'` in the start script, never rely on in-code import order. Missing `DD_LLMOBS_AGENTLESS_ENABLED=1` in a hackathon environment (no local Datadog Agent) causes silent total failure. Validate with a smoke-test request 30+ minutes before demo; screenshot real traces as backup.

2. **Bedrock model access not pre-enabled** — Claude models require a one-time use-case submission in the AWS Console → Bedrock → Model Catalog. IAM `AmazonBedrockFullAccess` is necessary but not sufficient. Do this on Day 0; it cannot be fixed during the 6-hour build window. Verify with `aws bedrock invoke-model` CLI before writing any application code.

3. **Neo4j AuraDB URI scheme** — AuraDB requires `neo4j+s://` (TLS); using `neo4j://` or `bolt://` causes SSL handshake failure. Always call `driver.verifyConnectivity()` at startup for fail-fast behavior. Create exactly one driver instance for the application lifetime — per-request instantiation exhausts the connection pool.

4. **MiniMax TTS blocking the UI** — The non-streaming MiniMax endpoint waits for full audio generation (3-6s for DM-length narration) before returning. Fire TTS in parallel with streaming LLM text to the UI, or restrict TTS to the scripted opening monologue only. Hex-decode response with `Buffer.from(data.data.audio, 'hex')` — forgetting this step returns a 200 response with unplayable audio.

5. **Datadog dashboard empty at demo time** — Multiple independent failure modes converge silently. Validate all five required env vars (`DD_LLMOBS_ENABLED`, `DD_LLMOBS_ML_APP`, `DD_API_KEY`, `DD_LLMOBS_AGENTLESS_ENABLED`, `DD_SITE`) against a real request during development. Build the dashboard after generating real trace data, not before. Keep LLM spans small (truncate to ~500 chars) to stay under the 1MB payload limit.

---

## Implications for Roadmap

Based on the combined research, a 7-phase build order respects hard dependencies, front-loads risk elimination, and matches the architecture's data flow.

### Phase 0: Pre-Hackathon Checklist
**Rationale:** Two critical blockers cannot be fixed during the 6-hour clock — Bedrock model access and Datadog account setup. Both must be resolved before hackathon day.
**Delivers:** Verified AWS credentials with Bedrock Claude access; Datadog account with API key and LLM Observability enabled; Neo4j AuraDB instance provisioned with correct `neo4j+s://` connection URI; all API keys in `.env`.
**Addresses:** Pitfall 2 (Bedrock access), Pitfall 5 (Datadog dashboard), Pitfall 3 (Neo4j URI scheme).
**Flag:** No research needed — checklists are deterministic. Execute, do not plan.

### Phase 1: Foundation and Scaffolding
**Rationale:** Project structure, environment validation, and the Datadog instrumentation layer must be correct before writing any feature code. A wrong `dd-trace` setup discovered in Phase 5 costs 30+ minutes of debugging. Better to validate observability with a "hello world" request in Phase 1.
**Delivers:** Monorepo scaffolded (`client/` + `server/`); `config.ts` validates all env vars at startup; `dd-trace` loading via `NODE_OPTIONS`; `driver.verifyConnectivity()` at Neo4j startup; `/health` endpoint appearing as a live trace in Datadog within 60 seconds of startup.
**Addresses:** Pitfall 1 (dd-trace load order), Pitfall 3 (Neo4j connection), Pitfall 6 (session management pattern established), security baseline (`.gitignore` for `.env`, parameterized Cypher from day one).
**Stack:** `express@^5`, `dd-trace@^5.86`, `neo4j-driver@^6.0.1`, `dotenv@^16`, `tsx`, `nodemon`.
**Research flag:** Standard patterns — no additional research needed.

### Phase 2: Neo4j Lore Graph and Seed Data
**Rationale:** The RAG pipeline and all downstream prompt assembly depend on having a populated lore graph. This is a build-time task that blocks Phase 3. Seeding ~20 nodes takes ~30 minutes and should be done while the basic Express/React plumbing is still simple.
**Delivers:** Cypher schema with node labels (Character, Location, Item, Faction, Event); 3-scene lore graph covering the tavern, barkeep NPC, goblin encounter; `seed.ts` script that can be re-run idempotently; verified Cypher queries for entity retrieval.
**Implements:** Neo4j component, RAG data model.
**Avoids:** Seeding under time pressure in Phase 4 or 5 after discovering the graph is empty.
**Research flag:** Schema design is well-documented in Neo4j D&D use-case blogs. No additional research needed.

### Phase 3: Bedrock Service + Bare LLM Call
**Rationale:** Get Claude responding as a DM in a plain Express endpoint before adding RAG or streaming complexity. This validates AWS credentials, confirms the correct model ID format, and establishes the `BedrockRuntimeClient` + `ConverseStreamCommand` pattern that all subsequent phases depend on.
**Delivers:** Working `/chat` endpoint returning a hardcoded-prompt DM response; `BedrockRuntimeClient` initialized with `@aws-sdk/client-bedrock-runtime`; model ID `anthropic.claude-3-5-sonnet-20241022-v2:0` confirmed working; Datadog LLM span visible in dashboard for the first time.
**Uses:** `@aws-sdk/client-bedrock-runtime@^3.x`.
**Avoids:** Pitfall 2 (confirms model access is functional before more code is written on top of it).
**Research flag:** Well-documented AWS SDK patterns. No additional research needed.

### Phase 4: SSE Streaming + React Chat UI
**Rationale:** SSE streaming is the architectural backbone of the chat experience. The React frontend SSE consumer and the Express stream piping need to be proven together before RAG or TTS is added on top. Visual token streaming also proves to the team that the pipeline is working end-to-end.
**Delivers:** Express `/chat` using `ConverseStreamCommand` with `res.write()` SSE; React `useSSEChat.ts` hook consuming the stream via `fetch` + `ReadableStream`; dark fantasy Tailwind/shadcn UI rendering streaming DM text; dice roll d20 animated reveal in chat.
**Addresses:** Table stakes features (chat UI, streaming response, dice roll display).
**Stack:** Vite + React 19, Tailwind CSS v4, shadcn/ui.
**Avoids:** SSE buffering behind proxies — set `X-Accel-Buffering: no` header; use `fetch` + `ReadableStream` (not `EventSource`) to allow POST body.
**Research flag:** Standard SSE pattern. No additional research needed.

### Phase 5: RAG Pipeline (Entity Extraction + Neo4j Injection)
**Rationale:** Layer graph RAG on top of the working chat + streaming pipeline. Keyword-based entity extraction (not a second LLM call) is fast and sufficient for a seeded ~20-node graph. This phase makes the Neo4j prize story tangible.
**Delivers:** `services/rag.ts` extracting entities from current user message; Cypher query injecting matched lore into system prompt; NPC personality attributes from graph nodes shaping barkeep dialogue; `neo4j.lore_query` manual Datadog tool span showing retrieval latency in dashboard.
**Implements:** RAG Pipeline Service, Entity-Anchored Cypher Retrieval pattern.
**Avoids:** Anti-Pattern 2 (no second LLM extraction call); Anti-Pattern 3 (only extract entities from current message, not full conversation history); Neo4j session leak via `driver.executeQuery()`.
**Research flag:** Patterns are established. No additional research needed.

### Phase 6: MiniMax TTS Narration
**Rationale:** TTS is an isolated feature (one route, one service file) that adds the MiniMax prize and cinematic impact without touching the core pipeline. Adding it last ensures it cannot break core functionality during development. Architecture decision made here: TTS on the scripted opening monologue only, not every DM turn.
**Delivers:** `services/tts.ts` calling MiniMax T2A v2 with `speech-02-hd` model; `POST /narrate` route; React `AudioPlayer.tsx` playing returned buffer; hex-decode verified in browser; UI loading state ("The Dungeon Master is speaking...") displayed during generation.
**Implements:** TTS Service component.
**Avoids:** Pitfall 4 (non-blocking TTS — fires after LLM text starts streaming to UI); hex-decode step (`Buffer.from(hex, 'hex')`) not omitted; MiniMax API key never exposed to React frontend.
**Research flag:** MiniMax has no official Node.js SDK — raw `fetch` pattern is verified but MEDIUM confidence. Validate response shape with a standalone script before integrating into the server.

### Phase 7: Polish, Demo Prep, and Rehearsal
**Rationale:** The scripted scenario, system prompt tuning, Datadog dashboard configuration, and demo rehearsal are not afterthoughts — they are the difference between a demo that impresses judges and one that goes off-script. Reserve the final hour for this.
**Delivers:** Scripted 3-turn scenario (pre-written player inputs: tavern arrival → quest acceptance → goblin combat with dice roll); system prompt refined for DM persona + lore consistency; full named Datadog spans for all pipeline stages; Datadog dashboard configured for 15-minute window and pre-populated with real trace data; screenshot backup of working traces; two-screen demo setup (app in browser + Datadog dashboard).
**Addresses:** Pitfall 5 (empty dashboard), UX pitfalls (loading states, audio toggle, error messages), all "Looks Done But Isn't" checklist items.
**Research flag:** No research needed — demo prep is execution, not design.

### Phase Ordering Rationale

- **Phase 0 before everything:** Bedrock access and Datadog account cannot be unblocked during the hackathon. Any other order risks losing the entire demo on an administrative blocker.
- **Phase 1 (observability first):** Datadog instrumentation must be the first thing verified, not the last. A 30-minute `dd-trace` debugging session in Phase 6 is catastrophic.
- **Phase 2 (data before RAG):** The RAG pipeline is meaningless without a populated graph. Seeding first prevents "clean integration, empty graph" surprises.
- **Phases 3 → 4 → 5 (LLM → streaming → RAG):** Each phase adds one layer of complexity on a proven foundation. Do not build streaming and RAG simultaneously.
- **Phase 6 (TTS last):** TTS has no dependencies on the demo pipeline and is fully isolatable. Its latency characteristics (Pitfall 4) are mitigated by its isolated architecture.

### Research Flags

**Phases needing deeper research during planning (none critical — patterns are established):**
- **Phase 6 (MiniMax TTS):** MEDIUM confidence on MiniMax response shape and voice IDs. Verify with a standalone test script against the actual API before integrating into the server route. Risk is LOW because TTS failure degrades gracefully (text-only demo still works).

**Phases with standard, well-documented patterns (skip `/gsd:research-phase`):**
- **Phase 1:** Express + dd-trace initialization is thoroughly documented.
- **Phase 2:** Neo4j Cypher schema + seed patterns are well-documented.
- **Phase 3:** AWS SDK Bedrock ConverseStreamCommand is official AWS documentation.
- **Phase 4:** SSE + React streaming pattern is a standard web platform feature.
- **Phase 5:** Entity-anchored Cypher retrieval is documented in Neo4j GraphRAG resources.
- **Phase 7:** Demo prep is execution work, not research.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core finding (use `@aws-sdk/client-bedrock-runtime`, not `@anthropic-ai/bedrock-sdk`) verified via DeepWiki dd-trace-js source analysis. Library versions verified via npm and official docs. MiniMax lacks official Node.js SDK — raw HTTP is confirmed but MEDIUM confidence on exact response shape. |
| Features | MEDIUM | Prize track requirements partially inferred from event pages; specific judging rubrics not published. Competitor feature analysis based on product sites (Friends & Fables, AI Dungeon). Table stakes and differentiators are well-reasoned from the 3-minute demo constraint. |
| Architecture | MEDIUM | Core patterns (SSE, Graph RAG, dd-trace span kinds) verified via official docs. Some specifics (Datadog Bedrock auto-instrumentation env vars, MiniMax streaming behavior) verified via secondary sources only. Overall architecture is consistent across all three primary components. |
| Pitfalls | MEDIUM | Bedrock model access, Neo4j AuraDB URI, and dd-trace load order are verified via official docs (HIGH). MiniMax TTS blocking behavior is MEDIUM (single detailed third-party source). Datadog 1MB payload limit is documented in a Python SDK issue but pattern applies to JS SDK. |

**Overall confidence:** MEDIUM — sufficient to build. No gaps require additional research before starting development.

### Gaps to Address

- **MiniMax voice ID list:** Available voice IDs (beyond `Wise_Woman`, `English_Trustworthy_Man`) are not fully documented in accessible sources. Run a standalone TTS test script on Day 0 to audition voices and choose the best DM narrator voice before the clock starts.
- **Datadog LLM Observability dashboard configuration:** The exact dashboard widget configuration for LLM spans (as opposed to APM traces) was not fully loadable from official docs. Build the dashboard after generating real trace data; use the LLM Observability → Traces tab as the primary judge-facing view rather than a custom dashboard if setup time is tight.
- **MiniMax `MINIMAX_GROUP_ID` requirement:** GroupId is required in the T2A v2 endpoint URL but its location in the MiniMax console was not confirmed with screenshots. Locate and save this value on Day 0.
- **Bedrock inference profile IDs vs. model IDs:** On-demand usage may require inference profile IDs rather than bare model IDs in some regions. Verify with `aws bedrock list-foundation-models` and a test invocation before hackathon day.

---

## Sources

### Primary (HIGH confidence)
- [DeepWiki dd-trace-js AI/ML Instrumentation](https://deepwiki.com/DataDog/dd-trace-js/3.6-aiml-instrumentation) — confirmed `@aws-sdk/client-bedrock-runtime` is the only auto-instrumented Bedrock SDK
- [Neo4j JavaScript Driver Manual](https://neo4j.com/docs/javascript-manual/current/) — v6 confirmed current; `driver.executeQuery()` pattern; `verifyConnectivity()` usage
- [AWS Bedrock ConverseStream Node.js SDK docs](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_ConverseStream_AnthropicClaude_section.html) — streaming API shape
- [AWS Bedrock Model Access docs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) — per-model per-region access enablement requirement
- [Datadog Node.js Tracing Library Config](https://docs.datadoghq.com/tracing/trace_collection/library_config/nodejs/) — `NODE_OPTIONS` initialization pattern
- [dd-trace npm](https://www.npmjs.com/package/dd-trace) — confirmed v5.86.0 is latest
- [neo4j-driver GitHub releases](https://github.com/neo4j/neo4j-javascript-driver/releases) — confirmed v6.0.1 is latest stable

### Secondary (MEDIUM confidence)
- [AWS blog: Monitor Bedrock agents with Datadog](https://aws.amazon.com/blogs/machine-learning/monitor-agents-built-on-amazon-bedrock-with-datadog-llm-observability/) — env var names confirmed
- [MiniMax TTS API handling blog (Jun 2025)](https://blog.williamchong.cloud/code/2025/06/21/handling-minimax-tts-api-basic-and-streaming.html) — no SDK, raw HTTP, hex-encoded PCM response
- [MiniMax Speech-02-series announcement](https://www.minimax.io/news/speech-02-series) — model names, voice capabilities
- [Neo4j: Creating a Neo4j Agentic Memory Multi-User Dungeon](https://neo4j.com/blog/developer/agentic-memory-multi-user-dungeon/) — graph schema for D&D (Sep 2025)
- [Friends & Fables AI Game Master](https://fables.gg/) — competitor feature analysis
- [AWS x Anthropic x Datadog GenAI Hackathon - Luma](https://luma.com/n84hk0l9) — prize tracks and judging context
- [Datadog dd-trace GitHub (agentless mode)](https://github.com/DataDog/dd-trace-js/issues/5441) — agentless mode requirement

### Tertiary (LOW confidence)
- [GenAI Hackathon lessons learned — Towards Data Science](https://towardsdatascience.com/things-i-learnt-by-participating-in-genai-hackathons-over-the-past-6-months/) — general hackathon pitfall patterns (editorial)

---
*Research completed: 2026-02-20*
*Ready for roadmap: yes*
