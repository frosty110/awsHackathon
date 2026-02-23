/** Canonical list of valid character class IDs — single source of truth for client and server. */
export const CHARACTER_CLASS_IDS = ['fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'paladin'] as const;

/** Character class identifiers for D&D characters. */
export type CharacterClassId = typeof CHARACTER_CLASS_IDS[number];

/** Gender identifiers for character creation. */
export type GenderId = "male" | "female" | "nonbinary";
