# AI Dungeon Master

## What This Is

An AI-powered Dungeon Master for tabletop D&D, built for small gaming communities (~1000 concurrent users). Players interact through a dark fantasy chat UI with single-player and multiplayer modes. The DM (powered by Claude via AWS Bedrock) narrates scenes, manages dice rolls, and weaves lore from a Neo4j knowledge graph. Multi-voice TTS narration via MiniMax brings NPCs to life. Full LLM observability via Datadog. Production-hardened with JWT auth, IDOR protection, rate limiting, and comprehensive input validation.

## Core Value

A production-quality AI Dungeon Master that serves ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.

## Requirements

### Validated

- ✓ Chat UI with dark fantasy theme (parchment gold, blood red, Cinzel fonts) — v1.0
- ✓ AWS Bedrock integration with Claude, D&D system prompt, full conversation history — v1.0
- ✓ Dice rolling mechanic (d20), narrated by the AI with bracket-based outcomes — v1.0
- ✓ Datadog LLM Observability: auto-instrumented Bedrock calls, named pipeline spans, programmatic dashboard — v1.0
- ✓ Neo4j AuraDB seeded with demo lore (locations, NPCs, items, quests, relationships) — v1.0
- ✓ RAG pipeline: entity extraction, Neo4j lore query, lore context injection into prompts — v1.0
- ✓ MiniMax TTS opening monologue and multi-voice per-NPC narration (narrator, barkeep, goblin) — v1.0
- ✓ 3-turn demo scenario: tavern → barkeep quest → goblin combat with open-ended continuation — v1.0
- ✓ Multiplayer mode: 2-4 players in shared rooms with turn-based DM narration and private chat — v1.0
- ✓ Character creation with class selection, pronoun picker, and gender selection — v1.0
- ✓ Redis-backed conversation store with in-memory fallback — v1.0
- ✓ JWT auth with refresh tokens, IDOR protection, per-user rate limiting — v1.0
- ✓ Bedrock request queuing with backpressure handling — v1.0
- ✓ S3 audio cache for cross-instance TTS persistence — v1.0
- ✓ Production security: Helmet, CORS, input sanitization, prompt injection hardening — v1.0
- ✓ Parallel TTS processing (~5x latency reduction) — v1.0
- ✓ Exponential backoff polling for music/video generation — v1.0
- ✓ LRU memory management for TTS, video, music, and lore caches — v1.0

### Active

- [ ] Mood-aware background music with crossfade and TTS ducking (uncommitted)
- [ ] RAG lore context wired into multiplayer turn handlers (uncommitted)

### Out of Scope

- Mobile app — web-only for now
- Full 5e rules engine — AI handles rules narratively; formal engine is v2
- Image/video generation in gameplay — text + voice is the core experience
- Streaming token-by-token TTS sync — hard real-time problem, high failure risk
- Persistent campaign memory via vector DB — deferred to v2

## Context

Shipped v1.0 with 16,722 LOC TypeScript across 310 files.
Tech stack: React frontend, Node.js/Express backend, AWS Bedrock (Claude), Neo4j AuraDB, Datadog, MiniMax TTS, Redis, S3, Socket.IO.
Built in 3 days (2026-02-20 → 2026-02-22) across 19 phases and 52 plans.
Comprehensive 4-agent code review addressed ~80 findings across 3 waves (security, performance, architecture, code quality).
53 unit tests passing. TypeScript compiles clean.

## Constraints

- **Scale target**: ~1000 concurrent users — architecture must handle real load.
- **Tech stack**: AWS Bedrock (Claude), Datadog LLM Observability, Neo4j AuraDB, MiniMax TTS.
- **Backend**: Node.js + Express.
- **Frontend**: React.
- **Deployment**: Production deployment with monitoring and alerting.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + Express for backend | Team familiarity, proven at scale | ✅ Good |
| React for frontend | Rich UI capabilities, team strength | ✅ Good |
| Neo4j AuraDB for lore graph | Graph-powered retrieval, managed service | ✅ Good |
| MiniMax TTS for voice | Multi-voice narration, emotion tags | ✅ Good — parallel processing added |
| Monorepo with workspaces | Team coordination, shared configs | ✅ Good |
| Dark fantasy theme | D&D atmosphere, strong brand identity | ✅ Good |
| `@aws-sdk/client-bedrock-runtime` | Only SDK dd-trace auto-instruments | ✅ Good |
| Socket.IO for multiplayer | Real-time bidirectional, connection recovery | ✅ Good |
| Redis for session/conversation state | Multi-instance deployment at 1000 users | ✅ Good — in-memory fallback added |
| JWT auth with refresh tokens | Stateless auth, refresh for security | ✅ Good — 15m access + 7d refresh |
| lru-cache for memory management | Byte-budget eviction prevents OOM | ✅ Good — TTS 100MB, video 500MB, music 200MB |
| p-queue for Bedrock concurrency | Prevents Bedrock throttling under load | ✅ Good — 15s wait timeout |
| DmTurnService extraction | Shared DM logic between chat + multiplayer | ✅ Good — eliminates duplication |
| S3 signed URLs for multiplayer audio | Avoids base64 over Socket.IO | ✅ Good — reduces memory pressure |

---
*Last updated: 2026-02-23 after v1.0 milestone*
