# Feature Research

**Domain:** AI Dungeon Master / AI RPG Game Master (Hackathon Demo)
**Researched:** 2026-02-20
**Confidence:** MEDIUM — ecosystem products verified via WebSearch + official sites; hackathon prize criteria partially inferred from event pages (specific judging rubrics not published)

---

## Context: Hackathon Constraints

This is a 6-hour hackathon demo with a 3-minute pitch. The goal is not a production product — it is a compelling, working demo targeting four prize tracks simultaneously:

1. **Main prize ($15K AWS credits)** — Bedrock + Datadog working end-to-end
2. **Datadog Award (Meta Glasses)** — rich LLM observability dashboard
3. **Neo4j Award (Bose headphones)** — graph-powered RAG visibly driving narrative
4. **MiniMax Prize ($12K pool)** — voice/audio integration

The demo is a scripted 3-turn scenario: tavern arrival → barkeep gives quest → goblin combat with dice roll. Every feature decision must answer: "Does this make the 3-minute demo more convincing, or does it eat build time?"

---

## Feature Landscape

### Table Stakes (Judges Won't Consider It Without These)

Features that every AI DM product ships. Missing these makes the project look unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chat-based interaction loop | All AI DM products (AI Dungeon, Friends & Fables, DNDAI) are chat-first. Judges expect it. | LOW | Single input → streaming response. FastAPI WebSocket or SSE. |
| Claude via AWS Bedrock responding as DM | Core hackathon requirement. Bedrock must be the LLM backend, not OpenAI. | LOW | `boto3` `invoke_model` with `anthropic.claude-3-5-sonnet`. System prompt sets DM persona. |
| Dice roll resolution (d20, damage dice) | Every AI DM project ships this. It's the mechanical soul of D&D. Judges expect to see a roll. | LOW | Server-side `random.randint`. Structured output or regex parse from LLM response. Return roll value + narrative. |
| Dark fantasy chat UI (themed, not generic) | Competitors all theme their UIs. A plain white chat box signals no polish. | LOW | CSS dark theme: parchment/stone palette, serif font for narration, monospace for dice. Off-the-shelf Tailwind + custom vars. |
| Narrative continuity across 3 turns | DM must remember what happened in turn 1 when generating turn 3. Breaks immersion otherwise. | LOW | Append full conversation history to each Bedrock call. No external persistence needed for 3-turn demo. |
| Datadog LLM observability traces visible | Main hackathon requirement and separate prize track. Judges will ask to see the dashboard. | LOW | `ddtrace` auto-instrumentation + manual spans. One DD_API_KEY env var enables it. |

### Differentiators (Prize-Winning Advantages)

Features that competing teams won't have, directly mapped to prize tracks.

| Feature | Value Proposition | Complexity | Prize Target | Notes |
|---------|-------------------|------------|--------------|-------|
| Neo4j lore graph driving RAG context | Judge sees: "AI knows the Ironspire Tavern is cursed because graph says so." Differentiates from flat-prompt DMs. | MEDIUM | Neo4j Award | Pre-seed graph with ~20 nodes: Location, NPC, Faction, Item, Quest. Cypher query injects relevant lore into system prompt before each Bedrock call. |
| Datadog dashboard with custom LLM spans | Judge sees: token count, latency, graph query time, TTS call time — all in one live dashboard. | MEDIUM | Datadog Award | Wrap each pipeline stage (graph query, LLM call, TTS) in named dd-trace spans. Custom dashboard in Datadog UI shows the full trace tree. |
| MiniMax TTS narration of DM responses | Audio output for cinematic demo effect. No competing hackathon team is likely to have voice. | MEDIUM | MiniMax Prize | POST to MiniMax Speech 2.6 API after each LLM response. Stream audio to browser. Use a "deep, gravelly narrator" voice. |
| Visible dice roll UI moment | The dice roll is the emotional peak of the demo. Show the number, the suspense, the outcome. | LOW | Demo polish | Animated d20 roll display in chat (CSS or SVG). Delay narrative reveal by 1.5s for suspense. Shows judges you understand game feel. |
| Graph-aware NPC personality | Barkeep's dialogue is shaped by his graph attributes (desperate, owes debt to guild). Makes RAG tangible. | MEDIUM | Neo4j Award | NPC nodes carry `personality`, `motivation`, `relationship` properties. Injected into prompt. Judges can see the graph and the NPC's matching tone. |
| Live Datadog trace during demo pitch | During 3-minute pitch, demo generates a request live and judge sees trace appear in real time in Datadog. | LOW | Datadog Award | Pre-open Datadog dashboard in browser before pitch. One demo turn generates a visible trace. Incredibly persuasive to Datadog judges. |
| Scripted scenario with reliable outcomes | Demo cannot fail. A scripted seed + deterministic branching ensures the 3 turns land correctly. | LOW | All prizes (demo reliability) | Seed the DM prompt with tavern context. Each player input is pre-chosen by teammate. Goblin combat roll is shown but outcome is DM-narrated regardless. |

### Anti-Features (Do Not Build in a 6-Hour Window)

Features that waste time and do not move the needle on any prize track.

| Anti-Feature | Why Requested | Why Problematic | What to Do Instead |
|--------------|---------------|-----------------|--------------------|
| Full D&D 5e rules engine | "It's D&D, so it needs real rules" | Implementing initiative, action economy, spell slots, and condition tracking takes days. Judges don't check rules fidelity. | Have Claude narrate combat outcomes narratively. One dice roll (d20 attack) is enough for the demo. |
| Character sheet / character creation flow | All mature AI DM products have it | Not needed for a scripted 3-turn demo. Adds 2+ hours of UI work. | Pre-define player character inline in system prompt ("You are Aldric, a human rogue..."). |
| Multiplayer / party support | Friends & Fables supports 6 players | Single-player demo is cleaner and faster to build. Multiplayer adds WebSocket state management complexity. | One player, one DM. Demo is 3 turns by one demonstrator. |
| Persistent campaign memory / database | PersistentDM and similar projects use vector DBs for long-term recall | A 3-turn scripted demo has no session to persist. Neo4j handles the lore graph; conversation history fits in RAM. | Append conversation history to context window. 3 turns = ~300 tokens. No DB needed. |
| Image generation for scenes / characters | AI Game Master and Friends & Fables generate images | DALL-E/Stable Diffusion calls add latency, cost, and API complexity. No image prize track exists. | Strong dark fantasy CSS theming + evocative text narration is enough. |
| Voice-to-text player input | Seems immersive | ASR adds latency, error surface, and integration complexity. Judges type, they don't speak. | Text chat input only. MiniMax TTS handles output voice; input stays text. |
| Save/load game state | Users expect it in production apps | Not relevant for a demo. Nobody is saving a 3-turn session. | Out of scope entirely. |
| User accounts / authentication | Needed for production | Adds zero demo value. Judges evaluate the AI, not the login page. | Pre-authenticated single session. No auth layer. |
| Streaming token-by-token TTS sync | Maximum immersion | Synchronizing LLM streaming tokens with TTS playback is a hard real-time problem. High failure risk. | Generate full LLM response, then send to MiniMax TTS, then play audio. Sequential pipeline is reliable. |
| 3D dice physics animation | Visually impressive | Three.js physics setup eats 2+ hours for cosmetic gain. | CSS animated number reveal with a brief fade-in delay. Visually clear, zero complexity. |

---

## Feature Dependencies

```
[AWS Bedrock LLM call]
    └──requires──> [System prompt with DM persona + lore context]
                       └──requires──> [Neo4j graph query for current scene]
                                          └──requires──> [Neo4j pre-seeded lore graph]

[Dice roll resolution]
    └──requires──> [Server-side roll function]
    └──enhances──> [LLM narrative] (roll result injected into next prompt)

[MiniMax TTS narration]
    └──requires──> [Full LLM response text]
    └──requires──> [MiniMax API key + voice ID]

[Datadog LLM spans]
    └──requires──> [ddtrace installed + DD_API_KEY set]
    └──enhances──> [Neo4j query span] (shows graph retrieval latency)
    └──enhances──> [MiniMax TTS span] (shows audio generation latency)
    └──enhances──> [Bedrock LLM span] (shows model latency + token count)

[Dark fantasy chat UI]
    └──requires──> [Backend WebSocket or SSE endpoint]
    └──enhances──> [Dice roll UI moment] (styled within chat window)
```

### Dependency Notes

- **Neo4j graph query requires pre-seeded graph:** The lore graph must be seeded before the demo. This is a build-time task, not runtime. ~20 nodes is achievable in 30 minutes.
- **MiniMax TTS requires full LLM response:** Do not attempt streaming TTS. Wait for complete Bedrock response, then fire TTS request. Sequential pipeline avoids sync complexity.
- **Datadog spans wrap everything:** The Datadog instrumentation layer sits around all other pipeline stages. Add it after the core pipeline works, not before.
- **Scripted scenario reduces all dependencies:** Pre-written player inputs eliminate unpredictable branches. Build the happy path first; make it robust to the exact 3 inputs.

---

## MVP Definition

### Launch With (Demo Day)

Minimum viable demo — what must work flawlessly for the 3-minute pitch.

- [ ] **Chat UI (dark fantasy theme)** — Players type, DM responds in narrated prose. Visually compelling on screen share.
- [ ] **Claude via AWS Bedrock as DM** — Every response comes from Bedrock. Required for main prize eligibility.
- [ ] **Neo4j lore graph + RAG injection** — Cypher query pulls scene/NPC lore into system prompt. Graph must be visible/queryable during demo to prove it's working.
- [ ] **Dice roll display (d20 attack roll in combat)** — Animated number reveal in chat. The goblin combat turn must show a real dice result.
- [ ] **Datadog live trace visible** — During the pitch, open Datadog dashboard showing traces with named spans (graph query, LLM call, TTS). Judges are watching.
- [ ] **MiniMax TTS audio for DM narration** — At minimum the final goblin combat narration plays as audio. Optional: all 3 turns voiced.
- [ ] **Scripted 3-turn scenario** — Tavern → quest → combat. Pre-written player inputs. Zero improvisation risk.

### Add If Time Permits (Stretch Goals)

Features to add only after MVP is working and tested end-to-end.

- [ ] **Named Datadog spans for each pipeline stage** — Beyond auto-instrumentation: custom span names like `neo4j.lore_query`, `minimax.tts`, `bedrock.dm_response` make the dashboard far more impressive.
- [ ] **NPC personality from graph attributes** — If barkeep node has `motivation: "desperate"`, inject that word into the prompt so his dialogue matches. Easy win for Neo4j judges.
- [ ] **Dice roll injected into LLM prompt** — Pass the raw roll result to Claude so it can narrate "your attack roll of 17 strikes true" instead of making up numbers.

### Future Consideration (Post-Hackathon Only)

Features that do not belong in a 6-hour build.

- [ ] **Character creation flow** — Only useful if the project becomes a real product.
- [ ] **Persistent campaign memory** — Requires vector DB + embedding pipeline. Days of work.
- [ ] **Multiplayer support** — Interesting product feature, zero demo value.
- [ ] **Full D&D 5e rules fidelity** — Years of work. Misses the point of the demo.

---

## Feature Prioritization Matrix

| Feature | Demo Value | Build Cost | Prize Impact | Priority |
|---------|------------|------------|--------------|----------|
| Chat UI dark theme | HIGH | LOW | All tracks (polish) | P1 |
| Bedrock LLM as DM | HIGH | LOW | Main prize (required) | P1 |
| Neo4j lore graph + RAG | HIGH | MEDIUM | Neo4j Award + narrative quality | P1 |
| Datadog trace visible during demo | HIGH | LOW | Datadog Award (required) | P1 |
| Dice roll display | HIGH | LOW | Demo drama | P1 |
| MiniMax TTS narration | MEDIUM | MEDIUM | MiniMax Prize | P1 |
| Named Datadog spans per stage | HIGH | LOW | Datadog Award differentiator | P2 |
| NPC personality from graph | MEDIUM | LOW | Neo4j Award differentiator | P2 |
| Dice roll value injected to LLM | MEDIUM | LOW | Narrative quality | P2 |
| Scripted 3-turn scenario | HIGH | LOW | Demo reliability (de-risks all) | P1 |
| Character sheet UI | LOW | HIGH | None | P3 |
| Image generation | LOW | HIGH | None | P3 |
| Voice input (ASR) | LOW | HIGH | None | P3 |
| Persistent campaign DB | LOW | HIGH | None | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | AI Dungeon | Friends & Fables | DNDAI / AI Realm | Our Approach |
|---------|------------|------------------|------------------|--------------|
| LLM backend | OpenAI | OpenAI | OpenAI/Gemini | AWS Bedrock (Claude) — hackathon differentiator |
| Knowledge graph / structured lore | None | Custom lore upload | None | Neo4j graph with Cypher RAG — genuine differentiator |
| Observability | None | None | None | Datadog LLM traces — unique in this space |
| Voice narration | None | TTS (character voices) | None | MiniMax Speech 2.6 — cinematic narration |
| Dice rolls | Text-described | Full 5e system | Text-described | Server-side d20 with UI reveal — right scope |
| Multiplayer | No | Up to 6 players | No | Single-player (scope appropriate for hackathon) |
| Character creation | Full flow | Full flow | Full flow | Pre-defined in system prompt (skip for demo) |
| Memory persistence | Vector DB | Custom | Custom | Conversation history in RAM (3-turn demo needs no more) |
| UI theme | Dark/adventure | Fantasy VTT | Dark fantasy | Dark fantasy chat — matches narrative tone |

**Conclusion:** No existing AI DM product combines Bedrock + Neo4j graph RAG + Datadog observability + MiniMax TTS. This stack is genuinely novel and hits all four prize tracks simultaneously. The demo differentiation story is strong.

---

## Sources

- [Friends & Fables AI Game Master](https://fables.gg/) — feature set analysis (WebFetch, MEDIUM confidence)
- [AI Game Master - Dungeon RPG (Product Hunt)](https://www.producthunt.com/products/ai-game-master/launches) — product feature list
- [Best DM Tools for D&D 2026 - Archivist](https://www.myarchivist.ai/ai-dungeon-master/best-dm-tools-2026) — industry priorities (WebFetch, MEDIUM confidence)
- [AWS x Anthropic x Datadog GenAI Hackathon - Luma](https://luma.com/n84hk0l9) — prize tracks and judging context (WebFetch, MEDIUM confidence)
- [Datadog LLM Observability Product Page](https://www.datadoghq.com/product/llm-observability/) — dashboard capabilities (WebFetch, MEDIUM confidence)
- [Datadog LLM Observability Instrumentation Docs](https://docs.datadoghq.com/llm_observability/instrumentation/) — ddtrace SDK, span model
- [Datadog LLM Observability SDK Reference](https://docs.datadoghq.com/llm_observability/instrumentation/sdk/) — manual instrumentation API
- [Neo4j GraphRAG Python Package](https://github.com/neo4j/neo4j-graphrag-python) — graph RAG patterns
- [Creating a Neo4j Agentic Memory Multi-User Dungeon](https://neo4j.com/blog/developer/agentic-memory-multi-user-dungeon/) — graph schema for D&D use case (Sep 2025)
- [MiniMax Speech 2.6](https://www.minimax.io/news/minimax-speech-26) — TTS capabilities and latency
- [PersistentDM GitHub](https://github.com/tarnvaal/PersistentDM) — reference implementation for context management
- [dnd-ai-dm Streamlit](https://github.com/aro-wen/dnd-ai-dm) — hackathon-scale AI DM reference

---
*Feature research for: AI Dungeon Master — AWS x Anthropic x Datadog GenAI Hackathon*
*Researched: 2026-02-20*
