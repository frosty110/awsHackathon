# Phase 3: Lore Graph Seed - Research

**Researched:** 2026-02-20
**Domain:** Neo4j AuraDB / Cypher graph seeding with TypeScript
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Demo narrative (locked from script)
- Opening monologue text is fixed (provided in demo script)
- 3-turn flow: tavern arrival → ask about the ring → goblin combat
- Player inputs are pre-scripted; the lore must support the exact narrative rails
- d20 roll brackets: 1-5 failure, 6-10 miss, 11-15 solid hit, 16-19 clean strike, 20 critical

#### Core entities (from demo script)
- **The Shattered Crown Tavern** — half-empty, cold, stone hearth, fire barely holds back the chill, hooded travellers nursing ales
- **Gorm** — stocky dwarf, braided beard, one ear missing, ex-soldier, barkeep, gruff, guarded at first then opens up
- **Ring of Ashwick** — stolen, goblins suspected, northern caves, the town is afraid
- **Goblins** — suspected thieves, connected to the northern caves, one bursts through the tavern door in Turn 3
- **The quest** — retrieve the Ring of Ashwick from the northern caves, no one else will go

#### NPC personality attributes
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase seeds Neo4j AuraDB with the lore graph that powers the 3-scene demo. The output is `data/lore.json` (the source data) and `data/seed.ts` (the seed script). No RAG or prompt injection happens here — that is Phase 5. The seed script must be idempotent (MERGE, not CREATE), run cleanly with `tsx data/seed.ts`, and leave queryable nodes that Phase 5 depends on.

The technical work is straightforward: neo4j-driver v6 is already a project dependency, and the `driver.executeQuery()` API provides everything needed for seeding. The primary complexity is content — designing the ~20-node lore graph so that the three demo Cypher queries (tavern, Gorm, goblin) all return correctly attributed nodes and the AI gets enough context to stay on narrative rails.

The seed script location (`data/seed.ts`) and lore JSON location (`data/lore.json`) are prescribed by the architecture doc. These files live at the repo root, not inside `server/`. The seed script reads `.env` directly, connects to AuraDB, runs MERGE statements, then closes the driver.

**Primary recommendation:** Use `UNWIND $nodes AS n MERGE (node:Label {name: n.name}) ON CREATE SET node += n` batch pattern with a single `executeQuery` call per label. Create a uniqueness constraint on `name` for each label before seeding so MERGE is index-backed and idempotent.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| neo4j-driver | ^6.0.0 (already in `server/package.json`) | Bolt protocol client for Node.js | Official Neo4j driver; already a project dependency |
| dotenv | ^17.0.0 (already in `server/package.json`) | Load `.env` for credentials | Matches project pattern in `server/src/index.ts` |
| tsx | latest (already a devDependency) | Run `data/seed.ts` without a build step | Used by `npm run dev` script — no new tooling needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.0.0 (already in `server/package.json`) | Validate lore.json shape at runtime | Catches malformed JSON before seed hits Neo4j |

No new packages need to be installed. Everything the seed script needs is already present in the project.

**Installation:**

None required. Seed script can import directly from the project's existing `node_modules`.

---

## Architecture Patterns

### Recommended Project Structure

```
data/
├── lore.json         # Static lore data (~20 nodes, typed by label)
└── seed.ts           # Seed script: load lore.json → connect → MERGE → close
```

The `data/` directory is at the repo root (not inside `server/`), as specified in `.planning/research/ARCHITECTURE.md`. The seed script is a one-shot Node.js script, not part of the server build. It reads `.env` directly.

### Pattern 1: UNWIND Batch MERGE (per label)

**What:** Load all nodes of a given label in one `executeQuery` call using `UNWIND` over the JSON array. Use `MERGE` on the unique `name` property, then `ON CREATE SET node += props` to set all attributes. This is idempotent — re-running adds nothing, only updates ON MATCH if needed.

**When to use:** Every node type in the seed script. Run one UNWIND statement per label (Character, Location, Item, Quest, Faction).

**Example:**
```typescript
// Source: https://neo4j.com/docs/javascript-manual/current/query-simple/
await driver.executeQuery(
  `UNWIND $nodes AS props
   MERGE (n:Character {name: props.name})
   ON CREATE SET n += props
   ON MATCH SET n += props`,
  { nodes: lore.characters },
  { database: 'neo4j' }
);
```

### Pattern 2: MERGE Relationship After Nodes

**What:** After all nodes are seeded, create relationships with MERGE. First MATCH both endpoint nodes by `name`, then MERGE the relationship between them. Keeps node seeding and relationship seeding as separate passes.

**When to use:** After all label passes complete. Relationships depend on nodes existing first.

**Example:**
```typescript
// Source: https://neo4j.com/docs/cypher-manual/current/clauses/merge/
await driver.executeQuery(
  `MATCH (npc:Character {name: $npcName})
   MATCH (location:Location {name: $locationName})
   MERGE (npc)-[:LOCATED_IN]->(location)`,
  { npcName: 'Gorm', locationName: 'The Shattered Crown Tavern' },
  { database: 'neo4j' }
);
```

### Pattern 3: Uniqueness Constraint Before Seeding

**What:** Run `CREATE CONSTRAINT IF NOT EXISTS` for each label before any MERGE. This makes MERGE index-backed (fast, deterministic) and enforces data integrity.

**When to use:** At the top of the seed script, before any node creation.

**Example:**
```cypher
// Source: https://neo4j.com/docs/getting-started/cypher/schema/
CREATE CONSTRAINT character_name_unique IF NOT EXISTS
FOR (n:Character) REQUIRE n.name IS UNIQUE
```

```typescript
const constraints = [
  'CREATE CONSTRAINT character_name_unique IF NOT EXISTS FOR (n:Character) REQUIRE n.name IS UNIQUE',
  'CREATE CONSTRAINT location_name_unique IF NOT EXISTS FOR (n:Location) REQUIRE n.name IS UNIQUE',
  'CREATE CONSTRAINT item_name_unique IF NOT EXISTS FOR (n:Item) REQUIRE n.name IS UNIQUE',
  'CREATE CONSTRAINT quest_name_unique IF NOT EXISTS FOR (n:Quest) REQUIRE n.name IS UNIQUE',
  'CREATE CONSTRAINT faction_name_unique IF NOT EXISTS FOR (n:Faction) REQUIRE n.name IS UNIQUE',
];
for (const cql of constraints) {
  await driver.executeQuery(cql, {}, { database: 'neo4j' });
}
```

### Pattern 4: Range Index on Name for RAG Queries

**What:** Add a range index on the `name` property for each label. CONSTRAINT creation in Neo4j automatically creates a backing index, so explicit `CREATE INDEX` is only needed for non-constrained properties (e.g., `description` if full-text search is needed later). For Phase 3, the constraint covers the `name` index. Phase 5 RAG queries use `WHERE n.name IN $entities` which hits this index.

**When to use:** Covered by the constraint creation in Pattern 3 — no additional index statements needed for the demo.

### Pattern 5: lore.json Shape

**What:** Structure `lore.json` as a top-level object with one array per node label, plus a `relationships` array. Each node object has a `name` (required, indexed) plus label-specific attributes. Relationships are objects with `from`, `to`, `type`, and optional `properties`.

**When to use:** This is the entire content plan.

**Example:**
```json
{
  "characters": [
    {
      "name": "Gorm",
      "race": "Dwarf",
      "role": "Barkeep",
      "personality": "gruff, guarded, eventually forthcoming",
      "motivation": "Wants the Ring of Ashwick recovered. Won't go himself — the leg wound from the Siege of Coldwall ended his fighting days.",
      "background": "Ex-soldier. Lost his left ear to a goblin blade at Coldwall Pass. Returned to Ashwick and opened the Shattered Crown. Carries guilt about the ring.",
      "speakingStyle": "Terse. Short sentences. Pauses before answering. Softens only when he trusts you.",
      "description": "Stocky dwarf, braided iron-grey beard, one ear missing. Wipes the same tankard all evening."
    }
  ],
  "locations": [...],
  "items": [...],
  "quests": [...],
  "factions": [...],
  "relationships": [
    { "from": "Gorm", "fromLabel": "Character", "to": "The Shattered Crown Tavern", "toLabel": "Location", "type": "WORKS_AT" }
  ]
}
```

### Anti-Patterns to Avoid

- **Using CREATE instead of MERGE:** Duplicate nodes on every seed run. Always use MERGE.
- **MERGE without a uniqueness constraint:** Without a backing index, MERGE full-scans the label on every call — fine for 20 nodes, but violates correctness guarantees. Add constraints.
- **Embedding relationships inside node objects:** Harder to process. Keep a flat `relationships` array at the top level.
- **Storing long prose in node attributes:** Phase 5 injects node attributes directly into the prompt context. Attributes over ~150 characters will bloat the prompt. Keep descriptions tight.
- **Not calling `driver.close()` at the end of the seed script:** Leaves Bolt connections open, script hangs on exit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Batch node creation | Custom loop with individual CREATE statements | `UNWIND $nodes AS n MERGE (n:Label {name: n.name})` | Single network round-trip; Cypher handles the batch |
| Idempotency | Track which nodes exist and skip duplicates | MERGE + ON CREATE SET | MERGE is atomic and index-backed — the right tool |
| Schema enforcement | Custom pre-check queries | CREATE CONSTRAINT IF NOT EXISTS | Built-in, idempotent, errors on conflict |
| Script runner | ts-node, babel-node, custom compile step | tsx (already a devDep) | tsx is already how the server runs; zero new tooling |
| Credentials loading | Custom .env parser | dotenv (already a dep) | Already used in `server/src/index.ts` — consistent |

**Key insight:** The neo4j-driver `executeQuery()` API handles session management, retries on transient errors, and result typing. There is nothing to build that the driver doesn't already provide.

---

## Common Pitfalls

### Pitfall 1: MERGE Without an Index → Silent Full Scan

**What goes wrong:** MERGE on `name` without a constraint works correctly but scans every node with that label. For 20 nodes it is imperceptibly slow, but it is semantically wrong — without a uniqueness constraint, two nodes with the same name can exist after concurrent writes. The seed script is single-threaded so this is not a real hazard here, but Phase 5 RAG queries that depend on `name` lookups may be inconsistent.

**Why it happens:** Developers skip schema setup because MERGE "works" without it.

**How to avoid:** Always run `CREATE CONSTRAINT ... IF NOT EXISTS` before seeding.

**Warning signs:** Two nodes with identical `name` properties appear in Cypher queries. `MATCH (n:Character {name: 'Gorm'}) RETURN count(n)` returns 2+.

### Pitfall 2: `driver.close()` Not Called → Script Hangs

**What goes wrong:** The seed script finishes its work but the process never exits. The Bolt connection pool stays open waiting for work.

**Why it happens:** `driver.executeQuery()` manages sessions automatically but does not close the driver. The driver must be explicitly closed.

**How to avoid:** Always end the seed script with `await driver.close()` in a `finally` block.

**Warning signs:** `tsx data/seed.ts` appears to finish (last console.log printed) but the terminal cursor stays blinking.

### Pitfall 3: `ON CREATE SET node = props` vs `node += props`

**What goes wrong:** Using `SET node = props` replaces all node properties with `props`, erasing the `name` property used in the MERGE key (since `name` is in `props`, this is usually harmless — but it is semantically dangerous with extra computed properties). The safe idiom is `SET node += props` which merges properties additively.

**Why it happens:** Typo / unfamiliarity with Cypher SET variants.

**How to avoid:** Always use `+=` in ON CREATE SET and ON MATCH SET inside UNWIND seeds.

**Warning signs:** `name` property disappears from nodes after seeding (would cause total RAG failure in Phase 5).

### Pitfall 4: lore.json Import in ESM Context

**What goes wrong:** `import lore from '../data/lore.json'` fails in ESM (`"type": "module"` in `server/package.json`) because JSON modules require `assert { type: 'json' }` in Node.js < 22, or `with { type: 'json' }` in Node.js >= 22. tsx may or may not handle this transparently depending on version.

**Why it happens:** JSON imports have different syntax across Node.js versions.

**How to avoid:** Use `fs.readFileSync` + `JSON.parse` instead of a static import. This is always safe regardless of Node.js version or ESM context.

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lore = JSON.parse(readFileSync(join(__dirname, 'lore.json'), 'utf8'));
```

**Warning signs:** `SyntaxError: Cannot use import statement` or `Error [ERR_IMPORT_ASSERTION_TYPE_MISSING]` when running the seed.

### Pitfall 5: AuraDB Bolt URI Format

**What goes wrong:** Using `neo4j://` instead of `neo4j+s://` for AuraDB. AuraDB requires TLS — plain `neo4j://` connections are rejected.

**Why it happens:** Local Docker Neo4j uses `neo4j://` (no TLS), which is the default shown in most tutorials.

**How to avoid:** The `.env.example` already shows `NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io` — follow that. Confirm the AuraDB connection string from the AuraDB console.

**Warning signs:** `ServiceUnavailable: Could not perform discovery` or TLS handshake errors on connection.

### Pitfall 6: The Seed Script's `.env` Path

**What goes wrong:** The seed script lives at `data/seed.ts` (repo root level), but `.env` also lives at the repo root. Relative path `dotenv.config()` (default) resolves relative to the process working directory (cwd). If the user runs `tsx data/seed.ts` from the repo root, this works. If they run it from inside `data/`, it fails.

**Why it happens:** `dotenv` uses process.cwd() by default, not the script's location.

**How to avoid:** Use explicit path: `dotenv.config({ path: new URL('../.env', import.meta.url).pathname })`. Alternatively document in the script that it must be run from the repo root (simpler for the hackathon).

---

## Code Examples

Verified patterns from official sources:

### Full Seed Script Structure

```typescript
// data/seed.ts
// Source: neo4j.com/docs/javascript-manual/current/query-simple/
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import neo4j from 'neo4j-driver';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));
const lore = JSON.parse(readFileSync(join(__dirname, 'lore.json'), 'utf8'));

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
);

async function seed(): Promise<void> {
  console.log('Seeding lore graph...');

  // 1. Create constraints (idempotent)
  const labels = ['Character', 'Location', 'Item', 'Quest', 'Faction'];
  for (const label of labels) {
    await driver.executeQuery(
      `CREATE CONSTRAINT ${label.toLowerCase()}_name_unique IF NOT EXISTS
       FOR (n:${label}) REQUIRE n.name IS UNIQUE`,
      {},
      { database: 'neo4j' }
    );
  }
  console.log('Constraints ready.');

  // 2. Seed nodes per label (idempotent via MERGE)
  const labelMap: Record<string, string> = {
    characters: 'Character',
    locations: 'Location',
    items: 'Item',
    quests: 'Quest',
    factions: 'Faction',
  };

  for (const [key, label] of Object.entries(labelMap)) {
    const nodes = lore[key] ?? [];
    if (nodes.length === 0) continue;
    const result = await driver.executeQuery(
      `UNWIND $nodes AS props
       MERGE (n:${label} {name: props.name})
       ON CREATE SET n += props
       ON MATCH SET n += props
       RETURN n.name AS name`,
      { nodes },
      { database: 'neo4j' }
    );
    console.log(`  ${label}: ${result.records.length} nodes merged`);
  }

  // 3. Seed relationships (idempotent via MERGE)
  for (const rel of lore.relationships ?? []) {
    await driver.executeQuery(
      `MATCH (a:${rel.fromLabel} {name: $from})
       MATCH (b:${rel.toLabel} {name: $to})
       MERGE (a)-[r:${rel.type}]->(b)
       ON CREATE SET r += $props`,
      { from: rel.from, to: rel.to, props: rel.properties ?? {} },
      { database: 'neo4j' }
    );
  }
  console.log(`  Relationships: ${lore.relationships?.length ?? 0} merged`);

  console.log('Seed complete.');
}

seed()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => driver.close());
```

### Verification Queries for Demo Turns

```cypher
-- Turn 1: tavern arrival
MATCH (t:Location {name: 'The Shattered Crown Tavern'}) RETURN t;

-- Turn 2: ring query
MATCH (i:Item) WHERE toLower(i.name) CONTAINS 'ring' RETURN i;

-- Turn 3: goblin entity
MATCH (g:Character {name: 'Goblin Scout'}) RETURN g;

-- Gorm NPC with all attributes (for Phase 5 RAG)
MATCH (n:Character {name: 'Gorm'}) RETURN n.personality, n.motivation, n.speakingStyle;

-- Relationship check: Gorm → tavern
MATCH (g:Character {name: 'Gorm'})-[:WORKS_AT]->(t:Location) RETURN t.name;

-- Quest connected to ring and goblins
MATCH (q:Quest)-[:INVOLVES]->(i:Item {name: 'Ring of Ashwick'}) RETURN q;
```

### npm Script to Add

```json
// Add to root package.json scripts (or data/package.json if preferred)
"seed": "tsx data/seed.ts"
```

Since `tsx` is a devDependency in `server/`, invoke via: `npx tsx data/seed.ts` or add a workspace script.

---

## Lore Design Recommendations (Claude's Discretion)

These are recommendations that the planner should implement directly in `lore.json`.

### Ring of Ashwick Backstory

**Recommendation:** Protective artifact — a warding talisman bound to the town of Ashwick, forged when the town was founded by a dwarven smith-priest. While the ring rests in the town, misfortune is supposed to stay outside its walls. Its theft is the reason the crops are thin, strangers feel watched, and fires go out. Dark fantasy tone: the ring does not have dramatic magic — it has symbolic weight the townsfolk believe in, and its absence feels like a wound. The goblins may not know what they have.

**Attributes:** `{ name: "Ring of Ashwick", type: "Artifact", material: "Iron and ash-wood", lore: "Founding talisman of Ashwick. Said to ward the town from ill fortune. Its absence is felt as a creeping wrongness. Stolen three nights ago.", location: "Northern Caves (stolen)", status: "Stolen" }`

### Gorm's Speaking Style

**Recommendation:** Terse with occasional weight. Short declarative sentences. He does not volunteer information — he answers direct questions directly. When he trusts you (Turn 2), he opens up in paragraph-sized bursts before going quiet again. This suits the gruff ex-soldier archetype without making him a caricature.

**speakingStyle attribute:** `"Short sentences. Does not volunteer. Answers directly. Occasionally bitter. Opens up in bursts when he trusts you."`

### Recommended Node Count (~21 nodes)

| Label | Nodes | Examples |
|-------|-------|---------|
| Character | 5 | Gorm, Goblin Scout, Town Elder Mira, Hooded Traveller (ambient), Player Character (placeholder) |
| Location | 5 | The Shattered Crown Tavern, Ashwick (town), Northern Caves, Coldwall Pass (Gorm's backstory), The Barrow Road (route to caves) |
| Item | 4 | Ring of Ashwick, Gorm's Tankard (ambient flavor), Iron Lantern (caves), Short Sword (starter item) |
| Quest | 2 | Retrieve the Ring of Ashwick, Survive the Goblin Ambush (Turn 3 encounter) |
| Faction | 5 | The Ashwick Townsfolk, The Goblin Warband, Coldwall Veterans (Gorm's unit), The Northern Wanderers (hooded travellers), The Founders of Ashwick |

This gives 21 nodes and enough relationship density that the world feels connected without overwhelming the prompt.

### Key Relationships

| From | Type | To | Reason |
|------|------|----|--------|
| Gorm | WORKS_AT | The Shattered Crown Tavern | Core — RAG Turn 1 |
| Gorm | MEMBER_OF | Coldwall Veterans | Backstory flavor |
| Gorm | SEEKS | Ring of Ashwick (via Quest) | Core — RAG Turn 2 |
| Goblin Scout | LOCATED_IN | Northern Caves | Core — RAG Turn 3 |
| Goblin Scout | MEMBER_OF | The Goblin Warband | Combat context |
| Ring of Ashwick | STOLEN_BY | The Goblin Warband | Quest driver |
| Ring of Ashwick | BELONGS_TO | Ashwick (town) | Lore |
| Quest (retrieve ring) | INVOLVES | Ring of Ashwick | Quest–item link |
| Quest (retrieve ring) | TAKES_PLACE_AT | Northern Caves | Quest–location link |
| Town Elder Mira | LOCATED_IN | Ashwick | Ambient NPC |
| The Shattered Crown Tavern | LOCATED_IN | Ashwick | Tavern is in town |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `session.run()` + manual session management | `driver.executeQuery()` | neo4j-driver v5+ | Simpler API; no session.close() needed |
| `CREATE` for seeding (clobber on re-run) | `MERGE` + `ON CREATE SET` | Standard since Neo4j 2.x | Idempotency built into the query |
| `ts-node` for TypeScript scripts | `tsx` | ~2023 | tsx is faster, handles ESM natively, already in project |
| Separate index + constraint statements | `CREATE CONSTRAINT ... REQUIRE ... IS UNIQUE` (auto-creates index) | Neo4j 4.x+ | One statement does both |

**Deprecated/outdated:**
- `session.run()` for simple queries: Still works, but `driver.executeQuery()` is the recommended API in v5+. Do not use `session.run()` in the seed script.
- `CREATE` without MERGE: Creates duplicates on every run. Never use in a seed script.

---

## Open Questions

1. **Where does `data/seed.ts` import `neo4j-driver` from?**
   - What we know: `neo4j-driver` is in `server/package.json` not the root. The repo uses yarn workspaces.
   - What's unclear: Whether `tsx data/seed.ts` from the repo root can resolve `neo4j-driver` from `server/node_modules` or root `node_modules`.
   - Recommendation: Add `neo4j-driver` and `dotenv` to root `package.json` dependencies OR put a `data/package.json` that references them. Alternatively, put `seed.ts` inside `server/` and invoke as `tsx server/src/data/seed.ts`. The planner should decide the placement.

2. **AuraDB default database name**
   - What we know: AuraDB free tier uses the default database named `neo4j`.
   - What's unclear: Whether the user has already created the AuraDB instance and knows the database name.
   - Recommendation: Default to `{ database: 'neo4j' }` in all `executeQuery` calls. Document that this matches AuraDB free tier default.

3. **RELATIONSHIP_TYPE naming convention with dynamic labels in seed**
   - What we know: Cypher relationship types cannot be parameterized — `MERGE (a)-[:$type]->(b)` is invalid.
   - What's unclear: How to handle the relationship type dynamically from lore.json in a clean TypeScript loop.
   - Recommendation: Accept the limitation and template the type directly into the Cypher string for each relationship (`MERGE (a)-[:${rel.type}]->(b)`). This is safe because `rel.type` comes from the controlled `lore.json` file, not user input.

---

## Sources

### Primary (HIGH confidence)
- [Neo4j JavaScript Driver Manual — Query Simple](https://neo4j.com/docs/javascript-manual/current/query-simple/) — `executeQuery()` pattern, UNWIND+MERGE, result handling
- [Neo4j Cypher Manual — MERGE](https://neo4j.com/docs/cypher-manual/current/clauses/merge/) — MERGE syntax, ON CREATE SET, ON MATCH SET, relationship MERGE
- [Neo4j Getting Started — Schema](https://neo4j.com/docs/getting-started/cypher/schema/) — CREATE CONSTRAINT, CREATE INDEX syntax
- [Neo4j Cypher Manual — Create Indexes](https://neo4j.com/docs/cypher-manual/current/indexes/search-performance-indexes/create-indexes/) — CREATE INDEX IF NOT EXISTS syntax verified

### Secondary (MEDIUM confidence)
- [Neo4j JavaScript Driver Manual — Advanced Queries](https://neo4j.com/docs/javascript-manual/current/query-advanced/) — session.run() vs executeQuery() distinction, CALL IN TRANSACTIONS pattern
- [tsx npm](https://www.npmjs.com/package/tsx) — ESM TypeScript execution, latest version 4.21.0

### Tertiary (LOW confidence)
- Architecture patterns for the data/ directory placement and seed script invocation are inferred from `.planning/research/ARCHITECTURE.md` in this repo (HIGH for this project, but it is internal not external source)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — neo4j-driver v6 already in project; executeQuery API verified against official docs
- Architecture patterns: HIGH — MERGE idempotency, constraint creation, UNWIND batch all verified against official Cypher and JS driver docs
- Pitfalls: HIGH — driver.close() hang, ESM JSON import issue, AuraDB TLS URI are all verified gotchas from official sources or project context
- Lore content design: MEDIUM — creative content is judgement call; node structure aligns with architecture doc

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable library; neo4j-driver v6 ABI is stable)
