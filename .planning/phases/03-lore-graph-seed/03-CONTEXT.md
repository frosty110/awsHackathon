# Phase 3: Lore Graph Seed - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Seed Neo4j AuraDB with the lore data that powers the 3-scene demo. The graph must support entity retrieval for tavern arrival, barkeep quest hook, and goblin combat. RAG queries and prompt injection happen in Phase 5 — this phase only creates the data.

</domain>

<decisions>
## Implementation Decisions

### Demo narrative (locked from script)
- Opening monologue text is fixed (provided in demo script)
- 3-turn flow: tavern arrival → ask about the ring → goblin combat
- Player inputs are pre-scripted; the lore must support the exact narrative rails
- d20 roll brackets: 1-5 failure, 6-10 miss, 11-15 solid hit, 16-19 clean strike, 20 critical

### Core entities (from demo script)
- **The Shattered Crown Tavern** — half-empty, cold, stone hearth, fire barely holds back the chill, hooded travellers nursing ales
- **Gorm** — stocky dwarf, braided beard, one ear missing, ex-soldier, barkeep, gruff, guarded at first then opens up
- **Ring of Ashwick** — stolen, goblins suspected, northern caves, the town is afraid
- **Goblins** — suspected thieves, connected to the northern caves, one bursts through the tavern door in Turn 3
- **The quest** — retrieve the Ring of Ashwick from the northern caves, no one else will go

### NPC personality attributes
- Gorm must have graph-stored personality and motivation attributes (Phase 5 uses these verbatim in prompts)
- Personality traits: gruff, guarded, eventually forthcoming
- Motivation: wants the ring recovered, won't go himself
- Background: ex-soldier, something happened to his ear (implies combat history)

### Claude's Discretion
- **Ring of Ashwick backstory** — what it is, why it matters to the town (protective artifact, symbol of authority, or similar). Pick something fitting for dark fantasy tone.
- **Gorm's speaking style** — terse vs storyteller vs hybrid. Pick a voice that fits gruff ex-soldier dwarf archetype.
- **Lore breadth** — how many supporting entities beyond the core ~8 directly referenced in the script. Roadmap says ~20 nodes; Claude decides the right density.
- **Supporting entities** — factions, additional locations (northern caves, town of Ashwick), additional items, ambient NPCs. Build enough that the world feels real during the demo.
- **Node attribute depth** — how much prose per node. Enough for the DM to generate atmospheric descriptions, not so much that it bloats the prompt context.

</decisions>

<specifics>
## Specific Ideas

- The opening monologue is exact text: "The door of the Shattered Crown Tavern swings shut behind you, cutting off the cold night wind. The common room is half-empty — a few hooded travellers nurse their ales, and a fire barely holds back the chill in the stone hearth. Behind the bar, a stocky dwarf with a braided beard and one ear too few wipes a tankard without looking up. Something feels wrong in this town. You can't place it yet. What do you do?"
- Turn 2 specifically asks about "the ring" — the graph must return Ring of Ashwick data when "ring" is mentioned
- Turn 3 has a goblin bursting through the door — goblin entity must exist with combat-relevant attributes
- The demo pitch explicitly references Neo4j: "The AI knows about the ring and the quest because Neo4j told it. This is RAG — retrieval-augmented generation with a knowledge graph instead of a vector database."
- Graph labels from roadmap: Character, Location, Item, Quest, Faction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-lore-graph-seed*
*Context gathered: 2026-02-20*
