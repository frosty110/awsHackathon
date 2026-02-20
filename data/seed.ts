import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import neo4j from 'neo4j-driver';

// Load .env from repo root regardless of cwd (avoids cwd-relative pitfall)
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

// Load lore.json via readFileSync (not ESM static import — avoids JSON import ESM issues)
const __dirname = dirname(fileURLToPath(import.meta.url));
const lore = JSON.parse(readFileSync(join(__dirname, 'lore.json'), 'utf8'));

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;

if (!uri || !user || !password) {
  console.error('Missing NEO4J_URI, NEO4J_USERNAME, or NEO4J_PASSWORD in .env');
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

async function seed() {
  console.log('Seeding lore graph...');

  // Phase A: Create uniqueness constraints (idempotent via IF NOT EXISTS)
  const labels = ['Character', 'Location', 'Item', 'Quest', 'Faction'];
  for (const label of labels) {
    await driver.executeQuery(
      `CREATE CONSTRAINT ${label.toLowerCase()}_name_unique IF NOT EXISTS FOR (n:${label}) REQUIRE n.name IS UNIQUE`,
      {},
      { database: 'neo4j' }
    );
  }
  console.log('Constraints created.');

  // Phase B: UNWIND batch MERGE per label (idempotent via MERGE + ON MATCH SET)
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

  // Phase C: MERGE relationships after all nodes exist
  let relationshipsMerged = 0;

  for (const rel of lore.relationships ?? []) {
    const result = await driver.executeQuery(
      `MATCH (a:${rel.fromLabel} {name: $from})
       MATCH (b:${rel.toLabel} {name: $to})
       MERGE (a)-[r:${rel.type}]->(b)
       ON CREATE SET r += $props
       ON MATCH SET r += $props
       RETURN r`,
      { from: rel.from, to: rel.to, props: rel.properties ?? {} },
      { database: 'neo4j' }
    );

    if (result.records.length === 0) {
      throw new Error(
        `Relationship failed: (${rel.fromLabel}:${rel.from})-[:${rel.type}]->(${rel.toLabel}:${rel.to})`
      );
    }

    relationshipsMerged += result.records.length;
  }
  console.log(`  Relationships: ${relationshipsMerged} merged`);
}

seed()
  .then(() => console.log('Seed complete.'))
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => driver.close());
