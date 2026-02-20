# Phase 5: RAG Pipeline - Research

**Researched:** 2026-02-20
**Domain:** Neo4j keyword-based entity extraction, Cypher retrieval, system prompt injection, NPC personality grounding
**Confidence:** HIGH

---

## Summary

Phase 5 wires the seeded Neo4j lore graph (Phase 3) into the Bedrock chat pipeline (Phase 4). Every chat turn now passes through a `rag.ts` service that: (1) extracts entity names from the user's latest message via keyword matching against a pre-loaded entity dictionary, (2) queries Neo4j for the matching nodes and their attributes, and (3) assembles a lore context string that is injected into the Bedrock `ConverseStreamCommand` system prompt before the call.

The entire phase is two files: `server/src/services/rag.ts` (entity extraction + Neo4j retrieval + context assembly) and a modification to the chat route or bedrock service to inject the lore context into the system array. No new npm packages are required — neo4j-driver v6.0.1, `@aws-sdk/client-bedrock-runtime`, and the existing config/app infrastructure are all already installed.

The critical constraint is latency. The architecture doc is explicit: entity extraction MUST use keyword matching against a pre-loaded dictionary, NOT a second Bedrock/LLM call. With a 21-node graph and indexed name lookups, the Neo4j round-trip is well under 10 ms. The system prompt for ConverseStreamCommand accepts `system: SystemContentBlock[]` where each block is `{ text: string }` — the lore context is appended as additional text in a second block or concatenated with the base DM system prompt.

**Primary recommendation:** Load the entity dictionary once at server start (reading it from Neo4j or from lore.json) into a `Set<string>`, scan the user message for matches at request time (O(n) over ~21 entity names), run a single parameterized Cypher query `MATCH (n WHERE n.name IN $names) RETURN n`, and format the result as a compact lore block injected into the system prompt.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| neo4j-driver | 6.0.1 (installed) | Bolt protocol queries to AuraDB | Official driver; `driver.executeQuery()` API; already in project |
| @aws-sdk/client-bedrock-runtime | ^3.0.0 (installed) | ConverseStreamCommand with system prompt | Already in project; system param accepts `SystemContentBlock[]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.0.0 (installed) | Type-validate Neo4j record shape | Optional: use when casting record fields to typed objects |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keyword dictionary match | LLM-based NER (second Bedrock call) | Keyword match: ~0 ms, zero cost, sufficient for 21-node seeded graph. LLM NER: ~200-500 ms extra latency, doubles token cost — wrong for hackathon demo |
| Direct name lookup `WHERE n.name IN $names` | Full-text search index | Direct lookup: uses uniqueness index (already created in Phase 3), deterministic, no schema change needed. Full-text: faster for fuzzy match but requires extra index creation and adds complexity |
| String concat for system prompt | Separate SystemContentBlock | Concatenation is simpler and sufficient. Multiple blocks work too but require array manipulation |

**Installation:**

None required. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
server/src/
├── services/
│   ├── rag.ts           # Entity extraction + Neo4j retrieval + context assembly
│   ├── bedrock.ts       # ConverseStreamCommand wrapper (receives system prompt string)
│   ├── config.ts        # Existing env config
│   └── conversationStore.ts  # Existing store
├── routes/
│   └── chat.ts          # Calls rag.ts then bedrock.ts
└── app.ts               # Wires driver into AppDeps (already passes driver: Driver | null)
```

The `rag.ts` service receives the `Driver | null` from `AppDeps` (passed through at server startup). It must handle `null` gracefully (Neo4j skipped or failed).

### Pattern 1: Entity Dictionary Pre-Load

**What:** At module initialization time, load all entity names from the graph into a `Set<string>`. This happens once when the server starts, not per request. Entity extraction at request time is then a synchronous in-memory scan.

**When to use:** Server startup, after driver is confirmed connected.

**Example:**
```typescript
// server/src/services/rag.ts
// Source: Architecture pattern from .planning/research/ARCHITECTURE.md
import type { Driver } from 'neo4j-driver';

let entityDictionary: Set<string> = new Set();

export async function initRag(driver: Driver | null): Promise<void> {
  if (!driver) return; // graceful skip if Neo4j unavailable
  try {
    const { records } = await driver.executeQuery(
      'MATCH (n) WHERE n.name IS NOT NULL RETURN n.name AS name',
      {},
      { routing: 'READ', database: 'neo4j' }
    );
    entityDictionary = new Set(records.map(r => r.get('name') as string));
    console.log(`[rag] entity dictionary loaded: ${entityDictionary.size} entries`);
  } catch (err) {
    console.error('[rag] failed to load entity dictionary, RAG disabled:', err);
  }
}
```

**Alternative (no extra query):** If lore.json is accessible at server startup, extract names from it directly. This avoids one extra Neo4j round-trip and is acceptable for the hackathon. Either approach is fine since the dictionary is loaded once.

### Pattern 2: Keyword Entity Extraction (Synchronous, O(n))

**What:** Scan the user's latest message for exact substring matches against each entity name in the dictionary. Case-insensitive. Return all matched entity names.

**When to use:** Per request, on the latest user message only (not the full conversation history).

**Example:**
```typescript
// server/src/services/rag.ts
// Source: Architecture doc anti-pattern guidance (no second LLM call)
export function extractEntities(userMessage: string): string[] {
  const lower = userMessage.toLowerCase();
  const found: string[] = [];
  for (const name of entityDictionary) {
    if (lower.includes(name.toLowerCase())) {
      found.push(name);
    }
  }
  return found;
}
```

**Key detail:** "Ring of Ashwick" → user says "the ring" will NOT match (substring "ring" is too short and ambiguous). Handle this with aliases: add shortened aliases like "ring", "gorm", "tavern", "goblin" to the dictionary pointing to the full entity name, or add a separate alias map.

### Pattern 3: Alias Map for Demo Keywords

**What:** The 3-turn demo uses specific keywords players will type: "tavern", "ring", "gorm", "goblin". The full entity names are "The Shattered Crown Tavern", "Ring of Ashwick", "Gorm", "Goblin Scout". Define an explicit alias map so short keywords resolve to full names.

**When to use:** At module init, merge aliases into the entity lookup. Essential for the demo success criteria ("mentioning 'tavern' causes tavern lore to appear").

**Example:**
```typescript
// server/src/services/rag.ts
const ENTITY_ALIASES: Record<string, string> = {
  'tavern': 'The Shattered Crown Tavern',
  'shattered crown': 'The Shattered Crown Tavern',
  'ring': 'Ring of Ashwick',
  'ashwick ring': 'Ring of Ashwick',
  'gorm': 'Gorm',
  'barkeep': 'Gorm',
  'dwarf': 'Gorm',
  'goblin': 'Goblin Scout',
  'scout': 'Goblin Scout',
  'northern caves': 'Northern Caves',
  'caves': 'Northern Caves',
};

export function extractEntities(userMessage: string): string[] {
  const lower = userMessage.toLowerCase();
  const found = new Set<string>();

  // Check alias map first (handles demo keywords)
  for (const [alias, canonicalName] of Object.entries(ENTITY_ALIASES)) {
    if (lower.includes(alias)) {
      found.add(canonicalName);
    }
  }

  // Check full entity names from dictionary
  for (const name of entityDictionary) {
    if (lower.includes(name.toLowerCase())) {
      found.add(name);
    }
  }

  return [...found];
}
```

### Pattern 4: Cypher Retrieval — Single Multi-Label Query

**What:** Given the list of matched entity names, run a single Cypher query that matches across all labels using `WHERE n.name IN $names`. Return node properties as a map. Use READ routing (this is a read-only query).

**When to use:** Per request, after entity extraction, when at least one entity was found.

**Example:**
```typescript
// server/src/services/rag.ts
// Source: neo4j-driver v6 executeQuery API — .planning/phases/03-lore-graph-seed/03-RESEARCH.md
import neo4j from 'neo4j-driver';

export async function fetchLoreNodes(
  driver: Driver,
  entityNames: string[]
): Promise<Record<string, unknown>[]> {
  const { records } = await driver.executeQuery(
    `MATCH (n)
     WHERE n.name IN $names
     RETURN n { .* } AS node, labels(n) AS nodeLabels`,
    { names: entityNames },
    { routing: neo4j.routing.READ, database: 'neo4j' }
  );

  return records.map(r => ({
    ...r.get('node') as Record<string, unknown>,
    _labels: r.get('nodeLabels') as string[],
  }));
}
```

**Cypher note:** `n { .* }` is a map projection that returns all node properties as a plain object. This avoids needing to know property names in advance.

### Pattern 5: Lore Context Assembly — Compact String Block

**What:** Format the retrieved node data into a compact string block for system prompt injection. Include the entity name, its label, and the most narrative-relevant attributes. Exclude internal/game-mechanic properties (e.g., `hp`, `damage`) from the lore block unless the entity is a combat entity.

**When to use:** After `fetchLoreNodes()` returns records.

**Example:**
```typescript
// server/src/services/rag.ts
const NARRATIVE_ATTRS = ['personality', 'motivation', 'speakingStyle', 'background',
                          'description', 'atmosphere', 'lore', 'behavior', 'status'];
const COMBAT_ATTRS = ['hp', 'weapon', 'behavior'];

export function assembleLoreContext(nodes: Record<string, unknown>[]): string {
  if (nodes.length === 0) return '';

  const lines: string[] = ['[LORE CONTEXT — use this to ground your narration:]'];

  for (const node of nodes) {
    const label = (node._labels as string[])?.[0] ?? 'Entity';
    const name = node.name as string;
    lines.push(`\n${label}: ${name}`);

    const attrsToShow = label === 'Character'
      ? [...NARRATIVE_ATTRS, ...COMBAT_ATTRS]
      : NARRATIVE_ATTRS;

    for (const attr of attrsToShow) {
      if (node[attr] != null) {
        lines.push(`  ${attr}: ${node[attr]}`);
      }
    }
  }

  return lines.join('\n');
}
```

### Pattern 6: System Prompt Injection into ConverseStreamCommand

**What:** The Bedrock `ConverseStreamCommand` accepts a `system` parameter of type `SystemContentBlock[]`. Each block is `{ text: string }`. The base DM system prompt is one block; the lore context is a second block (or concatenated into the first).

**When to use:** Every chat turn. If lore context is empty (no entities found), pass only the base DM system prompt.

**Example:**
```typescript
// server/src/services/bedrock.ts or routes/chat.ts
// Source: AWS Bedrock ConverseStream SDK schema — confirmed from installed package schemas_0.js
import { ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const DM_SYSTEM_PROMPT = `You are a Dungeon Master for a dark fantasy tabletop RPG.
Speak in second person. Be atmospheric and immersive. Keep responses under 100 words
unless narrating combat. Never break character.`;

export async function streamBedrockResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  loreContext: string,  // from rag.ts — empty string if no entities matched
  res: Response
): Promise<string> {
  const systemBlocks: Array<{ text: string }> = [
    { text: DM_SYSTEM_PROMPT }
  ];

  if (loreContext) {
    systemBlocks.push({ text: loreContext });
  }

  const command = new ConverseStreamCommand({
    modelId: config.BEDROCK_MODEL_ID,
    messages: messages.map(m => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    system: systemBlocks,
  });

  const response = await client.send(command);
  // ... stream chunks to SSE
}
```

### Pattern 7: NPC Personality Verbatim Injection

**What:** When Gorm's node is retrieved, his `personality`, `motivation`, `speakingStyle`, and `background` attributes are injected verbatim. The lore context tells Claude to speak as Gorm with those traits. No additional prompt engineering needed — Claude will honor these in-context instructions.

**When to use:** Turn 2 of the demo (player asks about the ring, triggering Gorm retrieval via "gorm" or "barkeep" alias). Also Turn 1 if player addresses "the barkeep".

**Why verbatim works:** Claude 3.x models follow in-context instruction well. Putting `personality: Gruff, guarded, eventually forthcoming` and `speakingStyle: Short sentences. Does not volunteer.` in the system prompt directly constrains the NPC voice without a separate fine-tuning step.

### Pattern 8: Graceful Degradation on Neo4j Failure

**What:** Wrap the entire RAG call in try/catch. If Neo4j throws (connection loss, timeout, query error), log the error and return an empty string. The chat route proceeds with only the base DM system prompt. No hard stop, no error visible to the player.

**When to use:** Always — Neo4j is declared a graceful-degradation dependency in CLAUDE.md.

**Example:**
```typescript
// server/src/services/rag.ts
export async function buildLoreContext(
  driver: Driver | null,
  userMessage: string
): Promise<string> {
  if (!driver) return '';

  try {
    const entities = extractEntities(userMessage);
    if (entities.length === 0) return '';

    const nodes = await fetchLoreNodes(driver, entities);
    return assembleLoreContext(nodes);
  } catch (err) {
    console.error('[rag] retrieval failed, continuing without lore:', err);
    return '';
  }
}
```

### Pattern 9: Wire RAG into Chat Route

**What:** The chat route calls `buildLoreContext()` before assembling the Bedrock call. The `driver` is available via `AppDeps` which is passed to the route at startup via `createApp(_deps)`.

**When to use:** This is the integration point — every `/chat` POST invokes RAG before Bedrock.

**Example:**
```typescript
// server/src/routes/chat.ts
import { buildLoreContext } from '../services/rag.js';
import { streamBedrockResponse } from '../services/bedrock.js';

router.post('/chat', async (req, res) => {
  const { conversationId, message } = req.body;
  const { id, history } = getOrCreateConversation(conversationId);
  history.push({ role: 'user', content: message });

  // RAG: extract entities from latest user turn, retrieve lore
  const loreContext = await buildLoreContext(deps.driver, message);

  // Bedrock: stream response with lore in system prompt
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ conversationId: id, text: '' })}\n\n`);

  const assistantText = await streamBedrockResponse(
    buildModelMessages(history),
    loreContext,
    res
  );
  history.push({ role: 'assistant', content: assistantText });
});
```

### Anti-Patterns to Avoid

- **LLM-based entity extraction:** Adding a second Bedrock call to extract entities doubles latency (~300-600 ms extra). For 21 seeded entities, keyword matching is strictly better.
- **Querying full conversation history for entities:** Entity density grows with turns, leading to query bloat. Extract from latest user turn only.
- **Not limiting Cypher result set:** `MATCH (n WHERE n.name IN $names)` with 21 total nodes returns at most 21 results. Safe without LIMIT for this graph, but add `LIMIT 20` as defensive practice.
- **Including all node properties in the lore block:** Properties like `hp: 12` or `damage: 1d6` are game mechanics, not narrative lore. Filter to narrative-relevant attributes to keep the injected context under ~500 tokens.
- **Hardcoding lore in TypeScript instead of querying Neo4j:** Defeats the demo pitch ("Neo4j told it about the ring"). Always query the graph even if the data is predictable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Entity extraction NLP | Custom NER model, SpaCy wrapper, second LLM call | Keyword dictionary + alias map | For 21 entities, dictionary match is O(n) and zero-latency. NLP adds complexity and latency with no benefit. |
| Neo4j connection pooling | Custom pool or singleton pattern | neo4j-driver's built-in pool | `driver.executeQuery()` manages session lifecycle, retries, and pool automatically |
| System prompt assembly | XML/JSON serialization format | Plain string with labeled sections | Bedrock/Claude parses natural language in-context instructions well. Structured formats add parsing complexity with no benefit. |
| Lore caching | Redis or in-memory LRU cache | None (query per request) | Neo4j indexed name lookup is <10 ms for 21 nodes. Caching adds complexity the hackathon doesn't need. |
| Graph traversal (multi-hop) | Recursive path queries | Single `MATCH (n WHERE n.name IN $names)` | For demo turns, direct node attribute retrieval is sufficient. Relationship traversal returns noisy data that bloats the prompt. |

**Key insight:** This is a seeded, deterministic graph with 21 nodes. The "correct" implementation is the simplest one — keyword match + direct node lookup + string formatting. Anything more sophisticated adds latency and bugs without improving the demo experience.

---

## Common Pitfalls

### Pitfall 1: Alias Gap — "tavern" Does Not Match "The Shattered Crown Tavern"

**What goes wrong:** Player types "I walk into the tavern" and the RAG returns nothing because "tavern" is not an exact substring of "The Shattered Crown Tavern" (it is, but it's a substring of the `type` field "Tavern", not the name). Actually "tavern" IS a substring of "The Shattered Crown Tavern" — but "ring" is NOT a substring of "Ring of Ashwick" (it is: "ring" in "Ring" matches case-insensitively). The dangerous case: "the ring" matches via "ring" but the word "ring" alone also matches "Ring of Ashwick" correctly.

**The real gap:** Player types "ask about the ring" — "ring" is a substring of "Ring of Ashwick", so this works. Player types "what happened here" — no entities matched, no lore injected. This is fine and expected.

**How to avoid:** Maintain the explicit alias map (Pattern 3) covering the exact keywords from the scripted demo turns: "tavern", "ring", "gorm"/"barkeep"/"dwarf", "goblin". Verify each alias against the actual scripted player inputs before demo day.

**Warning signs:** Demo Turn 1 (player enters tavern) produces generic DM narration with no mention of the stone hearth or hooded travellers. Check that "tavern" alias resolves correctly.

### Pitfall 2: Driver Null at RAG Init

**What goes wrong:** `initRag(driver)` is called before `verifyConnectivity()` completes, or driver is null because `SKIP_NEO4J_CONNECTIVITY_CHECK=1`. The entity dictionary stays empty. All RAG calls return empty context silently.

**Why it happens:** Startup sequencing mistake — `initRag` called too early or skipped.

**How to avoid:** Call `initRag(driver)` in `main()` in `index.ts` AFTER `verifyConnectivity()` succeeds. If `driver` is null (skip mode), log a warning and proceed — graceful degradation.

**Warning signs:** `[rag] entity dictionary loaded: 0 entries` in the server logs, or the log line is missing entirely.

### Pitfall 3: System Prompt Token Bloat

**What goes wrong:** Multiple entities match, each with verbose attributes. The lore context block exceeds 1000 tokens. Claude's response quality degrades as context competes with the system prompt for the model's attention, and costs increase.

**Why it happens:** All node properties included without filtering; multiple entities all matched on a single turn.

**How to avoid:** Filter to `NARRATIVE_ATTRS` (6-8 key attributes per node). Cap the entities list to the 3 most relevant matches if more than 3 are found. A 21-node graph with 5-7 attributes per node formatted as concise strings should produce ~200-400 tokens of lore context — well within safe bounds.

**Warning signs:** Lore context string exceeds 2000 characters. DM responses start ignoring narrative attributes.

### Pitfall 4: neo4j-driver routing.READ Not Imported Correctly

**What goes wrong:** `{ routing: neo4j.routing.READ }` fails because `neo4j` is the default export of the driver, and `routing` must be accessed from it. In ESM/NodeNext, the import shape matters.

**Why it happens:** Confusion between named and default exports.

**How to avoid:** Use the default import:
```typescript
import neo4j from 'neo4j-driver';
// ...
{ routing: neo4j.routing.READ, database: 'neo4j' }
```
The constant `neo4j.routing.READ` is `'READ'` (a string literal). You can also pass the string directly: `{ routing: 'READ' as const }`.

**Warning signs:** TypeScript error `Property 'routing' does not exist on type 'typeof neo4j'` — check import style.

### Pitfall 5: Cypher Map Projection `n { .* }` Returns Nested Object

**What goes wrong:** `n { .* }` returns a plain JavaScript object (not a Neo4j `Node` instance), so there is no `.get()` method. Accessing properties works directly: `record.get('node').name` — not `record.get('node').get('name')`.

**Why it happens:** Mixing up Record (which has `.get()`) with plain objects returned by map projections.

**How to avoid:** When using `RETURN n { .* } AS node`, access properties with `(record.get('node') as Record<string, unknown>).name`. When using `RETURN n AS node`, the result is a Neo4j `Node` instance — access properties via `record.get('node').properties.name`.

**Warning signs:** `TypeError: record.get(...).get is not a function` when trying to access node properties.

### Pitfall 6: Missing `.js` Extension on Service Imports

**What goes wrong:** `import { buildLoreContext } from '../services/rag'` fails in NodeNext module resolution. TSConfig uses `"moduleResolution": "NodeNext"` which requires explicit `.js` extensions.

**Why it happens:** Forgetting that NodeNext requires explicit extensions even for TypeScript source files.

**How to avoid:** Always use `.js` extension in imports: `import { buildLoreContext } from '../services/rag.js'`. TypeScript compiles this correctly to the `.js` output file.

**Warning signs:** `Cannot find module '../services/rag'` at runtime (not compile time, because TypeScript resolves it).

---

## Code Examples

Verified patterns from official sources and project conventions:

### Complete rag.ts Service

```typescript
// server/src/services/rag.ts
// Source: neo4j-driver v6 API — node_modules confirmed; project patterns from ARCHITECTURE.md
import type { Driver } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

// Keyword aliases for demo turn keywords → canonical entity names
const ENTITY_ALIASES: Record<string, string> = {
  'tavern': 'The Shattered Crown Tavern',
  'shattered crown': 'The Shattered Crown Tavern',
  'ring': 'Ring of Ashwick',
  'gorm': 'Gorm',
  'barkeep': 'Gorm',
  'dwarf behind the bar': 'Gorm',
  'goblin': 'Goblin Scout',
  'goblins': 'Goblin Scout',
  'northern caves': 'Northern Caves',
  'caves': 'Northern Caves',
  'ashwick': 'Ashwick',
  'quest': 'Retrieve the Ring of Ashwick',
};

// Attributes to include in lore context (ordered by narrative relevance)
const NARRATIVE_ATTRS = [
  'description', 'atmosphere', 'personality', 'motivation',
  'speakingStyle', 'background', 'lore', 'status', 'behavior',
  'weapon', 'hp',
];

let entityDictionary: Set<string> = new Set();

export async function initRag(driver: Driver | null): Promise<void> {
  if (!driver) {
    console.warn('[rag] driver is null — RAG disabled (no lore will be injected)');
    return;
  }
  try {
    const { records } = await driver.executeQuery(
      'MATCH (n) WHERE n.name IS NOT NULL RETURN DISTINCT n.name AS name',
      {},
      { routing: neo4j.routing.READ, database: 'neo4j' }
    );
    entityDictionary = new Set(records.map(r => r.get('name') as string));
    console.log(`[rag] entity dictionary loaded: ${entityDictionary.size} entries`);
  } catch (err) {
    console.error('[rag] failed to load entity dictionary, RAG disabled:', err);
  }
}

function extractEntities(userMessage: string): string[] {
  const lower = userMessage.toLowerCase();
  const found = new Set<string>();

  // Check alias map (demo keyword shortcuts)
  for (const [alias, canonicalName] of Object.entries(ENTITY_ALIASES)) {
    if (lower.includes(alias)) {
      found.add(canonicalName);
    }
  }

  // Check full entity names from dictionary
  for (const name of entityDictionary) {
    if (lower.includes(name.toLowerCase())) {
      found.add(name);
    }
  }

  return [...found].slice(0, 5); // cap at 5 entities to prevent prompt bloat
}

async function fetchLoreNodes(
  driver: Driver,
  entityNames: string[]
): Promise<Record<string, unknown>[]> {
  const { records } = await driver.executeQuery(
    `MATCH (n)
     WHERE n.name IN $names
     RETURN n { .* } AS node, labels(n) AS nodeLabels
     LIMIT 20`,
    { names: entityNames },
    { routing: neo4j.routing.READ, database: 'neo4j' }
  );

  return records.map(r => ({
    ...(r.get('node') as Record<string, unknown>),
    _labels: r.get('nodeLabels') as string[],
  }));
}

function assembleLoreContext(nodes: Record<string, unknown>[]): string {
  if (nodes.length === 0) return '';

  const lines: string[] = [
    '[LORE CONTEXT — ground your narration in these facts:]',
  ];

  for (const node of nodes) {
    const label = (node._labels as string[])?.[0] ?? 'Entity';
    const name = node.name as string;
    lines.push(`\n${label}: ${name}`);

    for (const attr of NARRATIVE_ATTRS) {
      if (node[attr] != null) {
        lines.push(`  ${attr}: ${node[attr]}`);
      }
    }
  }

  return lines.join('\n');
}

export async function buildLoreContext(
  driver: Driver | null,
  userMessage: string
): Promise<string> {
  if (!driver) return '';

  try {
    const entities = extractEntities(userMessage);
    if (entities.length === 0) return '';

    const nodes = await fetchLoreNodes(driver, entities);
    return assembleLoreContext(nodes);
  } catch (err) {
    console.error('[rag] retrieval failed, continuing without lore:', err);
    return '';
  }
}
```

### System Prompt Injection in ConverseStreamCommand

```typescript
// server/src/services/bedrock.ts (excerpt)
// Source: AWS SDK schema confirmed from installed package + ARCHITECTURE.md pattern
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const DM_SYSTEM_PROMPT = `You are a Dungeon Master running a dark fantasy tabletop RPG.
Speak in atmospheric second-person prose. Keep responses under 120 words unless narrating
combat. Never break character. When lore context is provided, use it to ground NPC dialogue
and descriptions — NPCs speak with their defined personality, not generic fantasy dialogue.`;

export async function streamBedrockResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  loreContext: string,
  res: import('express').Response
): Promise<string> {
  const systemBlocks: Array<{ text: string }> = [{ text: DM_SYSTEM_PROMPT }];
  if (loreContext) {
    systemBlocks.push({ text: loreContext });
  }

  const command = new ConverseStreamCommand({
    modelId: config.BEDROCK_MODEL_ID,
    messages: messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: [{ text: m.content }],
    })),
    system: systemBlocks,
  });

  const response = await client.send(command);
  let assistantText = '';

  for await (const chunk of response.stream ?? []) {
    const delta = chunk.contentBlockDelta?.delta?.text;
    if (delta) {
      assistantText += delta;
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
  return assistantText;
}
```

### initRag Call in index.ts (startup sequence)

```typescript
// server/src/index.ts (additions)
import { initRag } from './services/rag.js';

async function main(): Promise<void> {
  // ... existing driver setup ...

  if (driver) {
    // driver is confirmed connected at this point
    await initRag(driver);
  }

  const app = createApp({ driver });
  // ...
}
```

### Chat Route Integration

```typescript
// server/src/routes/chat.ts
import { buildLoreContext } from '../services/rag.js';

// Inside route handler, before Bedrock call:
const loreContext = await buildLoreContext(deps.driver, message);
const assistantText = await streamBedrockResponse(
  buildModelMessages(history),
  loreContext,
  res
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `session.run()` for ad-hoc queries | `driver.executeQuery()` | neo4j-driver v5+ | No manual session management; retry-safe; type-inferred result |
| Separate LLM call for entity extraction | Keyword dictionary match | Architecture decision for hackathon | Zero latency overhead; no cost for entity extraction |
| `EventSource` for SSE | `fetch` + `ReadableStream` | Per architecture doc (POST body required) | Allows `{ conversationId, message }` in request body |
| Multi-hop graph traversal for RAG | Direct node attribute retrieval | Architecture decision | Simpler Cypher; sufficient for seeded demo graph |

**Deprecated/outdated in this project:**
- `session.run()`: Still works but deprecated pattern. Use `driver.executeQuery()`.
- Passing `{ database: 'neo4j' }` without routing: Default routing is WRITE, which routes to primary in a cluster. Use `routing: neo4j.routing.READ` for read-only queries.

---

## Open Questions

1. **Does Phase 4 (Bedrock chat) already exist as `server/src/services/bedrock.ts` and `server/src/routes/chat.ts`?**
   - What we know: Phase 4 directory is empty in `.planning/` — the plans have not been written yet. The server currently has no `/chat` route or bedrock service.
   - What's unclear: Phase 5 research is written before Phase 4 is planned. Phase 5 plans (05-01, 05-02) will need to account for the exact interface Phase 4 establishes.
   - Recommendation: Phase 5 plans should treat Phase 4 as a dependency and specify the exact function signatures `streamBedrockResponse(messages, loreContext, res)` that Phase 4 must implement. If Phase 4 implements a different interface, Phase 5 adapts.

2. **Should `initRag()` block server startup or run in background?**
   - What we know: The entity dictionary is needed before the first chat request. Server startup with a cold AuraDB connection may take 1-2 seconds.
   - What's unclear: Whether to `await initRag(driver)` (blocks startup, guarantees dictionary ready) or fire-and-forget (faster startup, possible race if first request arrives immediately).
   - Recommendation: `await initRag(driver)` — startup latency of 1-2s is acceptable. Guarantees dictionary is populated before any request hits the route.

3. **Lore context token count at demo scale**
   - What we know: Each node has 5-8 attributes, each ~50-150 characters. 3 nodes retrieved = ~1500 characters = ~375 tokens.
   - What's unclear: Whether 375 tokens of lore context + base system prompt (~200 tokens) stays within Claude 3's effective attention for 12-turn conversations.
   - Recommendation: Claude 3.5 Sonnet has 200K token context window. 575 tokens of system instructions is negligible. No concern at demo scale.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/neo4j-driver-core/lib/driver.js` — `executeQuery()` method signature, routing constants (`neo4j.routing.READ = 'READ'`), `EagerResult` shape with `records` array; verified against installed neo4j-driver 6.0.1
- `node_modules/neo4j-driver-core/types/record.d.ts` — `Record.get(key)` API; map projection returns plain object (not Node instance)
- `node_modules/@aws-sdk/client-bedrock-runtime/dist-cjs/schemas/schemas_0.js` — `SystemContentBlock$` schema confirming `{ text: string }` shape; `ConverseStream$` confirming `system: SystemContentBlock[]` parameter
- `.planning/research/ARCHITECTURE.md` — Full data flow, RAG pipeline pattern (Pattern 3), anti-patterns (no LLM NER, latest-turn-only extraction); project authoritative source

### Secondary (MEDIUM confidence)

- `.planning/phases/03-lore-graph-seed/03-RESEARCH.md` — Cypher patterns, MERGE semantics, `driver.executeQuery()` with `{ database: 'neo4j' }` config, AuraDB routing considerations
- `.planning/phases/03-lore-graph-seed/03-01-PLAN.md` — Exact entity names, attribute names (personality, motivation, speakingStyle, background, atmosphere), relationship types — defines what's queryable in Phase 5
- `server/src/app.ts` — `AppDeps { driver: Driver | null }` interface shape; confirms driver passed through createApp

### Tertiary (LOW confidence)

- CLAUDE.md reliability requirements — Neo4j failures degrade gracefully; confirmed pattern but is internal project spec, not external verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All packages confirmed installed (neo4j-driver 6.0.1, @aws-sdk/client-bedrock-runtime); no new installs needed
- Entity extraction pattern: HIGH — Keyword match approach confirmed in ARCHITECTURE.md anti-pattern section; alias map is a project-specific addition verified against demo script entity names
- Cypher query patterns: HIGH — `executeQuery()` API verified from installed package; `n { .* }` map projection is standard Cypher; `WHERE n.name IN $names` uses parameterized queries
- System prompt injection: HIGH — `SystemContentBlock` schema verified from installed AWS SDK package; `system: [{ text }]` shape confirmed
- Graceful degradation: HIGH — CLAUDE.md reliability contract; try/catch pattern is standard; driver null check is already in project (index.ts pattern)
- NPC personality injection: HIGH — Gorm's `personality`, `motivation`, `speakingStyle`, `background` attributes confirmed in Phase 3 plan; verbatim injection into system prompt is standard Claude prompt engineering
- Alias map: MEDIUM — Alias keywords inferred from demo script turn descriptions; should be verified against actual scripted player inputs in DEMO-SCRIPT.md

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (all libraries stable; neo4j-driver v6 and AWS SDK v3 are stable)
