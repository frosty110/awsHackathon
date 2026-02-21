# Requirements: AI Dungeon Master

**Defined:** 2026-02-20
**Updated:** 2026-02-21
**Core Value:** A production-quality AI Dungeon Master serving ~1000 concurrent players with immersive, open-ended D&D gameplay and full Datadog LLM observability.

## v1 Requirements

Core requirements for the community product. Each maps to roadmap phases.

### Chat & LLM

- [x] **CHAT-01**: User can type messages and receive streaming DM narration via SSE
- [x] **CHAT-02**: DM responses powered by Claude via AWS Bedrock with D&D system prompt
- [x] **CHAT-03**: Full conversation history sent with each request for narrative continuity
- [x] **CHAT-04**: Dice roll result injected into LLM prompt so Claude narrates the actual number

### Game Mechanics

- [x] **GAME-01**: User can trigger a d20 dice roll via a "Roll Dice" button
- [x] **GAME-02**: "Roll Dice" triggers a distinct dice action message with brief button animation (no frontend d20 reveal)
- [x] **GAME-03**: DM narrates combat outcome based on actual roll result (1-5 failure, 16-20 great success)

### Knowledge Graph (Neo4j)

- [x] **NEO4J-01**: Neo4j AuraDB seeded with demo lore (~20 nodes: locations, NPCs, items, quests, relationships)
- [x] **NEO4J-02**: RAG pipeline extracts entities from player messages and queries Neo4j for matching lore
- [x] **NEO4J-03**: Lore context injected into system prompt before each Bedrock call
- [x] **NEO4J-04**: NPC personality and motivation driven by graph node attributes

### Observability (Datadog)

- [x] **DD-01**: dd-trace auto-instrumentation captures every Bedrock LLM call
- [x] **DD-02**: Named custom spans per pipeline stage (neo4j.lore_query, minimax.tts, bedrock.dm_response)
- [x] **DD-03**: Live Datadog dashboard showing token usage, latency timeseries, trace waterfall
- [x] **DD-04**: Datadog dashboards created and managed programmatically via code (Datadog API)

### Voice (MiniMax)

- [x] **VOICE-01**: MiniMax TTS generates voiced DM opening monologue
- [x] **VOICE-02**: "Start Adventure" button plays voiced intro and displays first DM message

### UI & Demo

- [x] **UI-01**: Dark fantasy chat UI (parchment gold #e0d0b0, blood red accent, Cinzel/IM Fell English fonts)
- [x] **UI-02**: Styled chat bubbles distinguishing DM messages from player messages
- [x] **UI-03**: Loading indicator ("The Dungeon Master is thinking...") during Bedrock calls
- [x] **UI-04**: Auto-scroll to latest message
- [x] **DEMO-01**: Default adventure scenario works reliably (tavern → barkeep quest → goblin combat) with open-ended continuation

### Scale & Infrastructure

- [ ] **SCALE-01**: Redis-backed conversation store for multi-instance deployment
- [ ] **SCALE-02**: User authentication (login/session management)
- [ ] **SCALE-03**: Per-user rate limiting on `/chat` and `/narrate`
- [ ] **SCALE-04**: Persistent game sessions (users can resume adventures)
- [ ] **SCALE-05**: Bedrock request queuing with backpressure for 1000 concurrent users

### Extended Gameplay

- [x] **EXT-01**: Character creation flow with class/race selection
- [x] **EXT-03**: Multiplayer party support (2-4 players)
- [ ] **EXT-04**: Persistent campaign memory via vector DB

### Extended Voice

- [x] **EXTV-01**: TTS narration for every DM response (not just opening monologue)
- [x] **EXTV-03**: Different voice profiles per NPC (narrator, barkeep, goblin)

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
| CHAT-01 | Phase 4 | ✅ Complete |
| CHAT-02 | Phase 4 | ✅ Complete |
| CHAT-03 | Phase 4 | ✅ Complete |
| CHAT-04 | Phase 4 | ✅ Complete |
| GAME-01 | Phase 2 | ✅ Complete |
| GAME-02 | Phase 2 | ✅ Complete |
| GAME-03 | Phase 4 | ✅ Complete |
| NEO4J-01 | Phase 3 | ✅ Complete |
| NEO4J-02 | Phase 5 | ✅ Complete |
| NEO4J-03 | Phase 5 | ✅ Complete |
| NEO4J-04 | Phase 5 | ✅ Complete |
| DD-01 | Phase 6 | ✅ Complete |
| DD-02 | Phase 6 | ✅ Complete |
| DD-03 | Phase 6 | ✅ Complete |
| DD-04 | Phase 6 | ✅ Complete |
| VOICE-01 | Phase 7 | ✅ Complete |
| VOICE-02 | Phase 7 | ✅ Complete |
| UI-01 | Phase 2 | ✅ Complete |
| UI-02 | Phase 2 | ✅ Complete |
| UI-03 | Phase 2 | ✅ Complete |
| UI-04 | Phase 2 | ✅ Complete |
| DEMO-01 | Phase 7 | ✅ Complete |
| SCALE-01 | Phase 9 | Pending |
| SCALE-02 | Phase 9 | Pending |
| SCALE-03 | Phase 9 | Pending |
| SCALE-04 | Phase 9 | Pending |
| SCALE-05 | Phase 9 | Pending |
| EXT-01 | Quick tasks | ✅ Complete |
| EXT-03 | Phase 8 | ✅ Complete |
| EXT-04 | TBD | Pending |
| EXTV-01 | Quick task 1 | ✅ Complete |
| EXTV-03 | Quick task 1 | ✅ Complete |

**Coverage:**
- v1 requirements: 32 total
- Complete: 27
- Pending: 5 (SCALE-01..05)
- Unmapped: 1 (EXT-04)

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-21 — synced all requirement statuses with implementation reality*
