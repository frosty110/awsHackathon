# Requirements: AI Dungeon Master

**Defined:** 2026-02-20
**Updated:** 2026-02-20
**Core Value:** A production-quality AI Dungeon Master serving ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.

## v1 Requirements

Core requirements for the community product. Each maps to roadmap phases.

### Chat & LLM

- [ ] **CHAT-01**: User can type messages and receive streaming DM narration via SSE
- [ ] **CHAT-02**: DM responses powered by Claude via AWS Bedrock with D&D system prompt
- [ ] **CHAT-03**: Full conversation history sent with each request for narrative continuity
- [ ] **CHAT-04**: Dice roll result injected into LLM prompt so Claude narrates the actual number

### Game Mechanics

- [ ] **GAME-01**: User can trigger a d20 dice roll via a "Roll Dice" button
- [ ] **GAME-02**: "Roll Dice" triggers a distinct dice action message with brief button animation (no frontend d20 reveal)
- [ ] **GAME-03**: DM narrates combat outcome based on actual roll result (1-5 failure, 16-20 great success)

### Knowledge Graph (Neo4j)

- [ ] **NEO4J-01**: Neo4j AuraDB seeded with demo lore (~20 nodes: locations, NPCs, items, quests, relationships)
- [ ] **NEO4J-02**: RAG pipeline extracts entities from player messages and queries Neo4j for matching lore
- [ ] **NEO4J-03**: Lore context injected into system prompt before each Bedrock call
- [ ] **NEO4J-04**: NPC personality and motivation driven by graph node attributes

### Observability (Datadog)

- [ ] **DD-01**: dd-trace auto-instrumentation captures every Bedrock LLM call
- [ ] **DD-02**: Named custom spans per pipeline stage (neo4j.lore_query, minimax.tts, bedrock.dm_response)
- [ ] **DD-03**: Live Datadog dashboard showing token usage, latency timeseries, trace waterfall
- [ ] **DD-04**: Datadog dashboards created and managed programmatically via code (Datadog API)

### Voice (MiniMax)

- [ ] **VOICE-01**: MiniMax TTS generates voiced DM opening monologue
- [ ] **VOICE-02**: "Start Adventure" button plays voiced intro and displays first DM message

### UI & Demo

- [ ] **UI-01**: Dark fantasy chat UI (parchment gold #e0d0b0, blood red accent, Cinzel/IM Fell English fonts)
- [ ] **UI-02**: Styled chat bubbles distinguishing DM messages from player messages
- [ ] **UI-03**: Loading indicator ("The Dungeon Master is thinking...") during Bedrock calls
- [ ] **UI-04**: Auto-scroll to latest message
- [ ] **DEMO-01**: Default adventure scenario works reliably (tavern → barkeep quest → goblin combat) with open-ended continuation

### Scale & Infrastructure

- [ ] **SCALE-01**: Redis-backed conversation store for multi-instance deployment
- [ ] **SCALE-02**: User authentication (login/session management)
- [ ] **SCALE-03**: Per-user rate limiting on `/chat` and `/narrate`
- [ ] **SCALE-04**: Persistent game sessions (users can resume adventures)
- [ ] **SCALE-05**: Bedrock request queuing with backpressure for 1000 concurrent users

### Extended Gameplay

- [ ] **EXT-01**: Character creation flow with class/race selection
- [ ] **EXT-03**: Multiplayer party support (2-6 players)
- [ ] **EXT-04**: Persistent campaign memory via vector DB

### Extended Voice

- [ ] **EXTV-01**: TTS narration for every DM response (not just opening monologue)
- [ ] **EXTV-03**: Different voice profiles per NPC

## v2 Requirements

Tracked but not in current roadmap.

### Extended Gameplay

- **EXT-02**: Full D&D 5e rules engine (initiative, action economy, spell slots)

### Extended Voice

- **EXTV-02**: Voice-to-text player input via ASR

### Extended UI

- **EXTU-01**: AI-generated scene illustrations
- **EXTU-02**: 3D dice physics animation
- **EXTU-03**: Character portrait display

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app / responsive mobile layout | Web-first, mobile deferred |
| Full 5e rules engine | AI handles rules narratively; formal engine is v2 |
| Image generation (DALL-E/SD) | Adds latency and cost, text + voice is the core experience |
| Streaming token-by-token TTS sync | Hard real-time problem, high failure risk |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 4 | Pending |
| CHAT-02 | Phase 4 | Pending |
| CHAT-03 | Phase 4 | Pending |
| CHAT-04 | Phase 4 | Pending |
| GAME-01 | Phase 2 | Pending |
| GAME-02 | Phase 2 | Pending |
| GAME-03 | Phase 4 | Pending |
| NEO4J-01 | Phase 3 | Pending |
| NEO4J-02 | Phase 5 | Pending |
| NEO4J-03 | Phase 5 | Pending |
| NEO4J-04 | Phase 5 | Pending |
| DD-01 | Phase 6 | Pending |
| DD-02 | Phase 6 | Pending |
| DD-03 | Phase 6 | Pending |
| DD-04 | Phase 6 | Pending |
| VOICE-01 | Phase 7 | Pending |
| VOICE-02 | Phase 7 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| DEMO-01 | Phase 7 | Pending |

| SCALE-01 | TBD | Pending |
| SCALE-02 | TBD | Pending |
| SCALE-03 | TBD | Pending |
| SCALE-04 | TBD | Pending |
| SCALE-05 | TBD | Pending |
| EXT-01 | TBD | Pending |
| EXT-03 | Phase 8 | Pending |
| EXT-04 | TBD | Pending |
| EXTV-01 | TBD | Pending |
| EXTV-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 22
- Unmapped: 10 (SCALE-*, EXT-01, EXT-04, EXTV-01, EXTV-03)

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 — scope shift from hackathon to community product*
