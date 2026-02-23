import { createHash } from "node:crypto";
import tracer from "dd-trace";
import type { Driver } from "neo4j-driver";
import { LRUCache } from "lru-cache";
import { queryLore, type LoreRecord } from "./neo4j.js";
import { logEvent } from "./logger.js";

// ── Module-level driver reference (set via initRag) ──────────────────────────

let _driver: Driver | null = null;

export function initRag(driver: Driver | null): void {
  _driver = driver;
  if (driver) {
    console.log("RAG pipeline initialized with Neo4j driver");
  } else {
    console.warn("[rag] No Neo4j driver — RAG pipeline disabled, chat continues without lore");
  }
}

// ── Lore cache ───────────────────────────────────────────────────────────────
// Caches Neo4j query results by entity set to reduce DB queries.

interface LoreCacheEntry {
  context: string;
  records: LoreRecord[];
}

const LORE_CACHE_MAX_SIZE = 100;
const LORE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const loreCache = new LRUCache<string, LoreCacheEntry>({
  max: LORE_CACHE_MAX_SIZE,
  ttl: LORE_CACHE_TTL_MS,
  allowStale: false,
});

let loreCacheHits = 0;
let loreCacheMisses = 0;

function buildLoreCacheKey(entities: string[]): string {
  return entities.slice().sort().join("|");
}

function hashLoreKey(preHashKey: string): string {
  return createHash("sha256").update(preHashKey).digest("hex").slice(0, 16);
}

export function getLoreCacheStats() {
  return { hits: loreCacheHits, misses: loreCacheMisses, size: loreCache.size };
}

// ── Entity alias map ─────────────────────────────────────────────────────────
// Maps lowercase keywords/aliases → canonical Neo4j node names.
// Built from data/lore.json entity names. No LLM call needed.

const ENTITY_ALIASES: Map<string, string> = new Map([
  // Characters
  ["gorm", "Gorm"],
  ["barkeep", "Gorm"],
  ["bartender", "Gorm"],
  ["dwarf", "Gorm"],
  ["goblin scout", "Goblin Scout"],
  ["goblin", "Goblin Scout"],
  ["goblins", "Goblin Scout"],
  ["elder mira", "Elder Mira"],
  ["mira", "Elder Mira"],
  ["elder", "Elder Mira"],
  ["hooded traveller", "Hooded Traveller"],
  ["traveller", "Hooded Traveller"],
  ["traveler", "Hooded Traveller"],
  ["hooded figure", "Hooded Traveller"],
  ["chieftain skrix", "Chieftain Skrix"],
  ["skrix", "Chieftain Skrix"],
  ["chieftain", "Chieftain Skrix"],

  // Locations
  ["shattered crown tavern", "The Shattered Crown Tavern"],
  ["shattered crown", "The Shattered Crown Tavern"],
  ["tavern", "The Shattered Crown Tavern"],
  ["inn", "The Shattered Crown Tavern"],
  ["ashwick", "Ashwick"],
  ["town", "Ashwick"],
  ["northern caves", "Northern Caves"],
  ["caves", "Northern Caves"],
  ["cave", "Northern Caves"],
  ["coldwall pass", "Coldwall Pass"],
  ["coldwall", "Coldwall Pass"],
  ["barrow road", "The Barrow Road"],

  // Items
  ["ring of ashwick", "Ring of Ashwick"],
  ["ring", "Ring of Ashwick"],
  ["artifact", "Ring of Ashwick"],
  ["tankard", "Gorm's Tankard"],
  ["lantern", "Iron Lantern"],
  ["iron lantern", "Iron Lantern"],
  ["short sword", "Short Sword"],
  ["sword", "Short Sword"],

  // Quests
  ["retrieve the ring", "Retrieve the Ring of Ashwick"],
  ["quest", "Retrieve the Ring of Ashwick"],
  ["goblin ambush", "Survive the Goblin Ambush"],
  ["ambush", "Survive the Goblin Ambush"],

  // Factions
  ["townsfolk", "Ashwick Townsfolk"],
  ["villagers", "Ashwick Townsfolk"],
  ["goblin warband", "Goblin Warband"],
  ["warband", "Goblin Warband"],
  ["coldwall veterans", "Coldwall Veterans"],
  ["veterans", "Coldwall Veterans"],
  ["northern wanderers", "Northern Wanderers"],
  ["wanderers", "Northern Wanderers"],
  ["founders", "Founders of Ashwick"],
]);

// Sort aliases by length descending so longer phrases match first
// (e.g., "goblin scout" before "goblin")
const SORTED_ALIASES = [...ENTITY_ALIASES.entries()].sort(
  (a, b) => b[0].length - a[0].length
);

// ── Entity extraction ────────────────────────────────────────────────────────

export function extractEntities(message: string): string[] {
  const lower = message.toLowerCase();
  const matched = new Set<string>();

  for (const [alias, canonical] of SORTED_ALIASES) {
    if (lower.includes(alias)) {
      matched.add(canonical);
    }
  }

  return [...matched];
}

// ── Lore context assembly ────────────────────────────────────────────────────

function formatLoreRecord(record: LoreRecord): string {
  let line = `- **${record.name}**: ${record.description}`;
  if (record.relationship && record.relatedName) {
    line += ` [${record.relationship} → ${record.relatedName}]`;
  }
  return line;
}

function assembleLoreContext(records: LoreRecord[]): string {
  if (records.length === 0) return "";

  // Deduplicate by name+relationship combo
  const seen = new Set<string>();
  const unique: LoreRecord[] = [];
  for (const r of records) {
    const key = `${r.name}|${r.relationship ?? ""}|${r.relatedName ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  return unique.map(formatLoreRecord).join("\n");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract entities from a player message and retrieve matching lore from Neo4j.
 * Returns a formatted lore context string (empty string if no matches or RAG disabled).
 * Failures degrade gracefully — chat continues without lore.
 */
export async function buildLoreContext(message: string): Promise<string> {
  if (!_driver) return "";

  const entities = extractEntities(message);
  if (entities.length === 0) return "";

  // ── Cache lookup ────────────────────────────────────────────────────────
  const preHashKey = buildLoreCacheKey(entities);
  const cacheKey = hashLoreKey(preHashKey);
  const cached = loreCache.get(cacheKey);

  if (cached) {
    loreCacheHits++;
    tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'lore', source: 'memory' });
    logEvent("info", "rag.cache_hit", {
      cacheKey,
      preHashKey,
      entities,
      recordCount: cached.records.length,
      cacheHits: loreCacheHits,
      cacheMisses: loreCacheMisses,
      cacheSize: loreCache.size,
    });
    return cached.context;
  }

  loreCacheMisses++;
  tracer.dogstatsd.increment('cache.miss', 1, { cache_type: 'lore' });
  logEvent("info", "rag.cache_miss", {
    cacheKey,
    preHashKey,
    entities,
    cacheHits: loreCacheHits,
    cacheMisses: loreCacheMisses,
    cacheSize: loreCache.size,
    reason: "not_found",
  });

  // ── Neo4j query (cache miss) ───────────────────────────────────────────
  try {
    const records = await queryLore(_driver, entities);
    const context = assembleLoreContext(records);

    // Store in cache
    loreCache.set(cacheKey, { context, records });

    if (context) {
      logEvent("info", "rag.lore_injected", {
        cacheKey,
        preHashKey,
        entityCount: entities.length,
        entities,
        recordCount: records.length,
        cacheSize: loreCache.size,
      });
    }

    return context;
  } catch (err) {
    logEvent(
      "warn",
      "rag.lore_query_failed",
      { cacheKey, preHashKey, entities, failureType: "recoverable_rag_error" },
      err
    );
    return "";
  }
}
