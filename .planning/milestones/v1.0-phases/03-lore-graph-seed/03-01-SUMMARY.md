---
phase: 03-lore-graph-seed
plan: 01
subsystem: database
tags: [neo4j, lore, json, knowledge-graph, rag]

# Dependency graph
requires:
  - phase: 01-scaffold
    provides: repo structure and data/ directory conventions
provides:
  - data/lore.json with 21 nodes and 11 relationships for Neo4j seeding
  - Complete lore graph covering all 3 demo turns (tavern, quest hook, goblin combat)
  - Gorm NPC with locked personality/motivation/speakingStyle/background for Phase 5 RAG
  - Ring of Ashwick artifact attributes for Turn 2 RAG retrieval
  - Goblin Scout combat attributes and relationship chain for Turn 3
affects:
  - 03-02 (seed script consumes lore.json)
  - 05-rag-pipeline (queries Neo4j nodes seeded from this data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lore.json shape: top-level arrays per label (characters, locations, items, quests, factions) plus flat relationships array"
    - "relationships use fromLabel/toLabel for seed script MERGE dispatch"
    - "attribute values capped at ~150 chars for prompt-friendly RAG injection"

key-files:
  created:
    - data/lore.json
  modified: []

key-decisions:
  - "Ring of Ashwick is a protective talisman bound to Ashwick — symbolic dark fantasy artifact, goblins may not know what they have"
  - "Gorm speakingStyle: short sentences, does not volunteer, answers directly, opens up in bursts when trusted"
  - "21 nodes across 5 labels covers all 3 demo turns without prompt bloat"
  - "Goblin Scout APPEARS_IN Survive the Goblin Ambush which ADVANCES Retrieve the Ring of Ashwick — Turn 3 relationship chain intact"

patterns-established:
  - "Lore data lives at data/lore.json (repo root, not inside server/)"
  - "All entity names are unique per label — required for MERGE in seed script"
  - "Attribute values kept under 150 chars — Phase 5 injects these directly into prompts"

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 3 Plan 01: Lore Graph Seed (Data) Summary

**21-node lore graph in data/lore.json covering tavern arrival, barkeep quest hook, and goblin combat with Gorm's locked personality attributes and Ring of Ashwick as a warding talisman**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T23:22:05Z
- **Completed:** 2026-02-20T23:23:59Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `data/lore.json` with 5 characters, 5 locations, 4 items, 2 quests, 5 factions (21 nodes total)
- 11 relationships spanning all 3 demo turns, including the Turn 3 chain: Goblin Scout -> Survive the Goblin Ambush -> Retrieve the Ring of Ashwick
- Gorm has all locked attributes: personality, motivation, speakingStyle, background — ready for Phase 5 RAG verbatim injection
- Ring of Ashwick designed as a founding protective talisman (dark fantasy tone, symbolic weight, goblins may not know its value)
- All attribute values under 150 characters for prompt-friendly context injection

## Task Commits

Each task was committed atomically:

1. **Task 1: Create data/lore.json with complete demo lore graph** - `b810c95` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `data/lore.json` - Complete lore graph data: 21 nodes, 11 relationships, all attributes under 150 chars

## Decisions Made
- Ring of Ashwick: Chose protective talisman archetype — a founding artifact bound to the town, its absence felt as creeping wrongness. Goblins stole it without knowing its significance. Fits dark fantasy tone without being over-powered magic.
- Gorm's speakingStyle: Terse with occasional weight. "Short sentences. Does not volunteer. Answers directly. Occasionally bitter. Opens up in bursts when he trusts you." Suits gruff ex-soldier dwarf without caricature.
- Node count: 21 nodes (the research recommendation) — enough world density for the demo, concise enough to avoid prompt bloat.
- Goblin Scout background trimmed to 143 chars — started at 155, trimmed to meet ~150 char guideline while preserving all required locked content.

## Deviations from Plan

None — plan executed exactly as written. Minor trim to Gorm's background attribute (155 -> 143 chars) to meet the plan's explicit ~150 char constraint.

## Issues Encountered
- Gorm's background attribute initially 155 chars (5 over the ~150 char soft limit). Trimmed "Returned to Ashwick and opened the Shattered Crown" to "Returned to Ashwick, opened the Shattered Crown" and "Carries guilt about the ring's theft" to "Carries guilt over the ring" — final length 143 chars, meaning preserved.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `data/lore.json` is complete and ready for `data/seed.ts` (Plan 03-02)
- Plan 03-02 reads this file via `fs.readFileSync` + `JSON.parse` and seeds Neo4j AuraDB
- All 21 nodes have unique `name` properties — MERGE operations in the seed script will work correctly
- Phase 5 RAG pipeline can query Gorm, Ring of Ashwick, and Goblin Scout by name — all attributes are present

## Self-Check: PASSED

- FOUND: data/lore.json
- FOUND: .planning/phases/03-lore-graph-seed/03-01-SUMMARY.md
- FOUND: commit b810c95

---
*Phase: 03-lore-graph-seed*
*Completed: 2026-02-20*
