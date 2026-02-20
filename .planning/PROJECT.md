# AI Dungeon Master

## What This Is

An AI-powered Dungeon Master for tabletop D&D, built for the AWS x Anthropic x Datadog GenAI Hackathon at AWS Builder Loft, SF. Players interact through a dark fantasy chat UI. The DM (powered by Claude via AWS Bedrock) narrates scenes, manages dice rolls, and weaves lore from a Neo4j knowledge graph — all with full LLM observability via Datadog. Optional voice narration via MiniMax TTS.

## Core Value

A playable AI Dungeon Master demo that runs live with visible Datadog LLM observability — the minimum viable path to hackathon prize eligibility.

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

- Mobile app — web-only demo
- User authentication — single-player demo, no login needed
- Persistent game state / save games — demo is a one-shot
- Real-time multiplayer — single player interacts with DM
- Video or image generation — text + voice only
- Production deployment — runs locally or on a single dev server for demo

## Context

**Hackathon details:**
- AWS x Anthropic x Datadog GenAI Hackathon, AWS Builder Loft, SF
- 6-hour hacking window (11:00 AM - 5:00 PM), science fair judging 5:00-7:00 PM
- Live demo required — must run on a screen with Datadog dashboard visible on second screen

**Team:**
- Aristarkh (Product Lead) — prompt engineering, D&D game logic, demo scenario, pitch
- Brandon (Backend Lead) — AWS Bedrock API, server, Datadog integration, Neo4j RAG pipeline
- Blaise (Fullstack Lead) — Chat UI, MiniMax voice, Neo4j data seeding, CSS polish

**Prize targets (priority order):**
1. Main prize pool ($15K AWS credits + cash) — Bedrock + Datadog working end-to-end [MUST]
2. Datadog Observability Award (Meta Glasses) — rich LLM observability dashboard [MUST]
3. Neo4j Award (Bose headphones + credits) — graph-powered RAG lore retrieval [HIGH]
4. MiniMax cash prize ($12K pool) — voice/audio for the DM [HIGH]

**Emergency cut order (bottom first):**
CSS polish → MiniMax voice → Neo4j RAG → Datadog → Bedrock chat (never cut)

**Demo scenario (3 turns):**
- Turn 0: Opening monologue (MiniMax voiced if available)
- Turn 1: Player enters tavern, approaches barkeep (Neo4j lore: Shattered Crown Tavern, Gorm)
- Turn 2: Player asks about the ring (Neo4j quest data: Ring of Ashwick, goblin caves)
- Turn 3: Goblin attacks, player rolls dice, DM narrates outcome

## Constraints

- **Timeline**: 6 hours of hacking — every feature must justify its time cost
- **Tech stack (required for prizes)**: AWS Bedrock (Claude), Datadog LLM Observability, Neo4j AuraDB, MiniMax TTS
- **Backend**: Node.js + Express
- **Frontend**: React
- **Demo**: Must run live during science fair judging with Datadog dashboard visible
- **Pre-work scope**: Full project scaffold + frontend build. Backend and prompt engineering done by teammates day-of.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + Express for backend | Team familiarity, fast to scaffold | — Pending |
| React for frontend | Fast to build chat UI, Blaise's strength | — Pending |
| Neo4j AuraDB free tier | Required for Neo4j prize, free cloud instance | — Pending |
| MiniMax for voice only on opening monologue | Reduces complexity vs voicing every message | — Pending |
| Single repo for full project | Team coordination, shared configs | — Pending |
| Dark fantasy theme (parchment gold, blood red) | Fits D&D atmosphere, quick to implement with CSS variables | — Pending |

---
*Last updated: 2026-02-20 after initialization*
