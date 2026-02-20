# Requirements: AI Dungeon Master

**Defined:** 2026-02-20
**Core Value:** A playable AI Dungeon Master demo that runs live with visible Datadog LLM observability — the minimum viable path to hackathon prize eligibility.

## v1 Requirements

Requirements for hackathon demo. Each maps to roadmap phases.

### Chat & LLM

- [ ] **CHAT-01**: User can type messages and receive streaming DM narration via SSE
- [ ] **CHAT-02**: DM responses powered by Claude via AWS Bedrock with D&D system prompt
- [ ] **CHAT-03**: Full conversation history sent with each request for narrative continuity
- [ ] **CHAT-04**: Dice roll result injected into LLM prompt so Claude narrates the actual number

### Game Mechanics

- [ ] **GAME-01**: User can trigger a d20 dice roll via a "Roll Dice" button
- [ ] **GAME-02**: Animated dice roll reveal in chat UI with suspense delay
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
- [ ] **DEMO-01**: Scripted 3-turn demo scenario works reliably (tavern → barkeep quest → goblin combat)

## v2 Requirements

Deferred to post-hackathon. Tracked but not in current roadmap.

### Extended Gameplay

- **EXT-01**: Character creation flow with class/race selection
- **EXT-02**: Full D&D 5e rules engine (initiative, action economy, spell slots)
- **EXT-03**: Multiplayer party support (2-6 players)
- **EXT-04**: Persistent campaign memory via vector DB

### Extended Voice

- **EXTV-01**: TTS narration for every DM response (not just opening monologue)
- **EXTV-02**: Voice-to-text player input via ASR
- **EXTV-03**: Different voice profiles per NPC

### Extended UI

- **EXTU-01**: AI-generated scene illustrations
- **EXTU-02**: 3D dice physics animation
- **EXTU-03**: Character portrait display

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / accounts | Zero demo value — single-player demo session |
| Save/load game state | 3-turn scripted demo needs no persistence |
| Mobile app / responsive mobile layout | Desktop demo for judges on laptops |
| Full 5e rules engine | Days of work, judges don't check rules fidelity |
| Image generation (DALL-E/SD) | No image prize track, adds latency and cost |
| Real-time multiplayer | Single demonstrator runs the 3-turn script |
| Streaming token-by-token TTS sync | Hard real-time problem, high failure risk |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | — | Pending |
| CHAT-02 | — | Pending |
| CHAT-03 | — | Pending |
| CHAT-04 | — | Pending |
| GAME-01 | — | Pending |
| GAME-02 | — | Pending |
| GAME-03 | — | Pending |
| NEO4J-01 | — | Pending |
| NEO4J-02 | — | Pending |
| NEO4J-03 | — | Pending |
| NEO4J-04 | — | Pending |
| DD-01 | — | Pending |
| DD-02 | — | Pending |
| DD-03 | — | Pending |
| DD-04 | — | Pending |
| VOICE-01 | — | Pending |
| VOICE-02 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| DEMO-01 | — | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 0
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 after initial definition*
