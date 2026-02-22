/**
 * Maps lowercase keywords/aliases to canonical Neo4j node names.
 * Built from data/lore.json entity names. No LLM call needed.
 */
export const ENTITY_ALIASES: Map<string, string> = new Map([
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

/** Sorted by length descending so longer phrases match first. */
export const SORTED_ALIASES = [...ENTITY_ALIASES.entries()].sort(
  (a, b) => b[0].length - a[0].length,
);
