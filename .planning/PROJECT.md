# AI Dungeon Master

## What This Is

An AI-powered Dungeon Master for tabletop D&D, built for small gaming communities. Players interact through a dark fantasy chat UI. The DM (powered by Claude via AWS Bedrock) narrates scenes, manages dice rolls, and weaves lore from a Neo4j knowledge graph — all with full LLM observability via Datadog. Voice narration via MiniMax TTS.

## Core Value

A production-quality AI Dungeon Master that serves ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Chat UI with dark fantasy theme where players send messages and receive DM narration
- [ ] AWS Bedrock integration calling Claude with D&D system prompt and full conversation history
- [ ] Dice rolling mechanic (d20) triggered by player action, narrated by the AI
- [ ] Datadog LLM Observability logging every Bedrock call (prompts, responses, tokens, latency)
- [ ] Datadog dashboard showing request latency, token usage, prompt/response traces, error rate
- [ ] Neo4j AuraDB seeded with demo lore (locations, NPCs, items, quests, relationships)
- [ ] RAG pipeline: extract entities from player messages, query Neo4j, inject lore context into prompts
- [ ] Neo4j retrieval traced as custom span in Datadog (full pipeline visibility)
- [ ] MiniMax TTS for DM opening monologue (audio plays on "Start Adventure")
- [ ] 3-turn demo scenario works reliably: tavern scene → barkeep quest → goblin combat + dice roll

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
| Node.js + Express for backend | Team familiarity, proven at scale | — Pending |
| React for frontend | Rich UI capabilities, team strength | — Pending |
| Neo4j AuraDB | Graph-powered lore retrieval, scalable managed service | — Pending |
| MiniMax TTS | Voice narration for immersive gameplay | — Pending |
| Single repo for full project | Team coordination, shared configs | — Pending |
| Dark fantasy theme (parchment gold, blood red) | Fits D&D atmosphere, strong brand identity | — Pending |
| Redis for session/conversation state | Required for multi-instance deployment at 1000 users | — Pending |
| User authentication | Required for persistent sessions and per-user rate limiting | — Pending |

---
*Last updated: 2026-02-20 after initialization*
