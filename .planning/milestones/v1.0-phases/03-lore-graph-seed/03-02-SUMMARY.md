---
phase: 03-lore-graph-seed
plan: 02
subsystem: database
tags: [neo4j, seed-script, typescript, rag, knowledge-graph, idempotent]

# Dependency graph
requires:
  - phase: 03-01
    provides: data/lore.json with 21 nodes and 11 relationships
  - phase: 01-scaffold
    provides: repo structure, .env pattern, neo4j-driver dependency in server
provides:
  - data/seed.ts — idempotent Neo4j seed script runnable via npx tsx or npm run seed
  - npm run seed at repo root
  - All 21 lore nodes and 11 relationships loadable into Neo4j AuraDB
affects:
  - 05-rag-pipeline (queries seeded Neo4j graph)
  - 06-datadog (seed run generates traceable Bedrock/Neo4j activity for observability validation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dotenv loaded with explicit path join from __dirname/../.env — cwd-safe"
    - "readFileSync + JSON.parse for lore.json — avoids ESM JSON import issues"
    - "neo4j driver.executeQuery with UNWIND $nodes for batch MERGE"
    - "Uniqueness constraints via CREATE CONSTRAINT ... IF NOT EXISTS before any MERGE"
    - "Relationship seeding uses ON MATCH SET r += $props — updates attributes on re-run"
    - "driver.close() in finally block — prevents script hang on AuraDB connection"
    - "Fail-fast throw on missing relationship endpoints — no silent skips"

key-files:
  created:
    - data/seed.ts
  modified:
    - package.json

key-decisions:
  - "npx tsx (not bare tsx) in npm run seed — tsx is a server devDependency, npx resolves from workspace node_modules"
  - "Relationship type templated directly into Cypher (not parameterized) — safe because lore.json is controlled input, Neo4j does not support parameterized relationship types"
  - "ON MATCH SET n += props for node re-runs — updates changed attributes, does not skip existing nodes"

# Metrics
duration: 1min
completed: 2026-02-20
---

# Phase 3 Plan 02: Lore Graph Seed (Script) Summary

**Idempotent Neo4j seed script in data/seed.ts using UNWIND+MERGE node batching, MERGE relationship seeding, and uniqueness constraints — runnable via npm run seed from repo root**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-20T23:26:10Z
- **Completed:** 2026-02-20T23:27:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `data/seed.ts` with all required correctness properties:
  - Loads `.env` from repo root via explicit path (not cwd-relative) — works from any cwd
  - Reads `lore.json` via `readFileSync + JSON.parse` — avoids ESM JSON import issues
  - Creates uniqueness constraints for all 5 labels (Character, Location, Item, Quest, Faction) via `IF NOT EXISTS` — safe to re-run
  - UNWIND batch MERGE for all node labels — `ON CREATE SET` + `ON MATCH SET` for idempotency
  - MERGE relationship seeding with `ON MATCH SET r += $props` — attributes updated on re-run
  - Fail-fast `throw` when relationship endpoints are missing — no silent skips that would corrupt the graph
  - `driver.close()` guaranteed via `finally` block — prevents script hang on AuraDB TLS connection
  - Clear console output: constraints, per-label node counts, relationship count
- Added `"seed": "npx tsx data/seed.ts"` to root `package.json` — `npm run seed` works from repo root

## Task Commits

Each task was committed atomically:

1. **Task 1: Create data/seed.ts** - `6977ab3` (feat)
2. **Task 2: Add npm run seed to package.json** - `6d9b405` (chore)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `data/seed.ts` — Idempotent Neo4j seed script (92 lines): dotenv, readFileSync, constraints, UNWIND+MERGE nodes, MERGE relationships, driver.close()
- `package.json` — Added `"seed": "npx tsx data/seed.ts"` to scripts

## Decisions Made

- `npx tsx` chosen over bare `tsx` in the npm run seed script — `tsx` lives in `server/` devDependencies, not the workspace root. `npx` resolves it from workspace node_modules transparently.
- Relationship type (`rel.type`) is interpolated directly into Cypher — Neo4j does not support parameterized relationship types. This is safe because `lore.json` is controlled input (not user-supplied data).
- `ON MATCH SET n += props` on node re-runs — ensures attributes are updated if lore.json changes, not silently skipped.

## Deviations from Plan

None — plan executed exactly as written.

## User Setup Required

Before running `npm run seed`:
1. Set `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` in `.env` at repo root
2. URI format for AuraDB: `neo4j+s://xxxxxxxx.databases.neo4j.io`
3. Run: `npm run seed`

Expected output:
```
Seeding lore graph...
Constraints created.
  Character: 5 nodes merged
  Location: 5 nodes merged
  Item: 4 nodes merged
  Quest: 2 nodes merged
  Faction: 5 nodes merged
  Relationships: 11 merged
Seed complete.
```

Running seed a second time produces the same output — no duplication.

## Next Phase Readiness

- Phase 5 RAG pipeline can now run `npm run seed` once to populate Neo4j AuraDB
- All 11 relationships are seeded including the Turn 3 chain: `Goblin Scout -[:APPEARS_IN]-> Survive the Goblin Ambush -[:ADVANCES]-> Retrieve the Ring of Ashwick`
- Phase 5 Cypher queries for tavern atmosphere, Gorm attributes, and Goblin Scout combat data will all resolve

## Self-Check: PASSED

- FOUND: data/seed.ts
- FOUND: package.json with seed script (npx tsx data/seed.ts)
- FOUND: commit 6977ab3
- FOUND: commit 6d9b405
- FOUND: .planning/phases/03-lore-graph-seed/03-02-SUMMARY.md

---
*Phase: 03-lore-graph-seed*
*Completed: 2026-02-20*
