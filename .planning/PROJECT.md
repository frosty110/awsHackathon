# AI Dungeon Master

## What This Is

An AI-powered Dungeon Master for tabletop D&D, built for small gaming communities. Players interact through a dark fantasy chat UI. The DM (powered by Claude via AWS Bedrock) narrates scenes, manages dice rolls, and weaves lore from a Neo4j knowledge graph — all with full LLM observability via Datadog. Voice narration via MiniMax TTS.

## Core Value

A production-quality AI Dungeon Master that serves ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.

## Requirements

### Validated

- [x] Chat UI with dark fantasy theme where players send messages and receive DM narration
- [x] AWS Bedrock integration calling Claude with D&D system prompt and full conversation history
- [x] Dice rolling mechanic (d20) triggered by player action, narrated by the AI
- [x] Datadog LLM Observability logging every Bedrock call (prompts, responses, tokens, latency)
- [x] Datadog dashboard showing request latency, token usage, prompt/response traces, error rate
- [x] Neo4j AuraDB seeded with demo lore (locations, NPCs, items, quests, relationships)
- [x] RAG pipeline: extract entities from player messages, query Neo4j, inject lore context into prompts
- [x] Neo4j retrieval traced as custom span in Datadog (full pipeline visibility)
- [x] MiniMax TTS for DM opening monologue (audio plays on "Start Adventure")
- [x] 3-turn demo scenario works reliably: tavern scene → barkeep quest → goblin combat + dice roll
- [x] Multiplayer mode: 2-4 players in shared rooms with turn-based DM narration
- [x] Multi-voice TTS with per-NPC voice profiles (narrator, barkeep, goblin)
- [x] Character creation with class selection, pronoun picker, and gender selection

### Active

- [ ] Mood-aware background music with crossfade and TTS ducking (in progress, uncommitted)
- [ ] RAG lore context wired into multiplayer turn handlers (in progress, uncommitted)

### Out of Scope

- Mobile app — web-only for now
- Video or image generation — text + voice only
- Full 5e rules engine — AI handles rules narratively

## Context

**Product vision:**
- Community-facing AI D&D game for small gaming communities (~1000 concurrent users).
- Players get immersive, open-ended D&D adventures with AI narration, voice, and lore-grounded storytelling.
- Full observability via Datadog for monitoring quality, latency, and cost at scale.

**Team:**
- Aristarkh (Product Lead) — prompt engineering, D&D game logic, scenario design
- Brandon (Backend Lead) — AWS Bedrock API, server, Datadog integration, Neo4j RAG pipeline
- Blaise (Fullstack Lead) — Chat UI, MiniMax voice, Neo4j data seeding, frontend polish

## Constraints

- **Scale target**: ~1000 concurrent users — architecture must handle real load.
- **Tech stack**: AWS Bedrock (Claude), Datadog LLM Observability, Neo4j AuraDB, MiniMax TTS.
- **Backend**: Node.js + Express.
- **Frontend**: React.
- **Deployment**: Production deployment with monitoring and alerting.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + Express for backend | Team familiarity, proven at scale | ✅ Adopted |
| React for frontend | Rich UI capabilities, team strength | ✅ Adopted |
| Neo4j AuraDB | Graph-powered lore retrieval, scalable managed service | ✅ Adopted |
| MiniMax TTS | Voice narration for immersive gameplay | ✅ Adopted — multi-voice with emotion tags |
| Single repo for full project | Team coordination, shared configs | ✅ Adopted — monorepo with workspaces |
| Dark fantasy theme (parchment gold, blood red) | Fits D&D atmosphere, strong brand identity | ✅ Adopted — Tailwind v4 CSS-only @theme |
| `@aws-sdk/client-bedrock-runtime` (not anthropic SDK) | Only SDK dd-trace auto-instruments | ✅ Adopted |
| Socket.IO for multiplayer | Real-time bidirectional events, connection recovery | ✅ Adopted |
| Redis for session/conversation state | Required for multi-instance deployment at 1000 users | Deferred to Phase 9 |
| User authentication | Required for persistent sessions and per-user rate limiting | Deferred to Phase 9 |

---
*Last updated: 2026-02-21 — synced with implementation status (phases 1-8 complete, 4 quick tasks shipped)*
