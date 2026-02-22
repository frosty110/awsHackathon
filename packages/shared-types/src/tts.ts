/** Scene mood tags embedded in DM responses for music selection. */
export type SceneMood = "combat" | "exploration" | "tavern" | "mystery" | "dramatic" | "danger";

/** Scene video identifiers for background video selection. */
export type SceneId =
  | "tavern_idle" | "tavern_tense" | "goblin_ambush" | "combat_melee"
  | "cave_entrance" | "cave_interior" | "npc_dialogue" | "forest_path"
  | "town_street" | "campfire" | "treasure_found" | "magic_spell"
  | "fireball" | "stealth" | "trap_danger" | "locked_door"
  | "rain_storm" | "victory" | "defeat" | "potion_drink"
  | "bridge_crossing" | "throne_room" | "moonrise" | "merchant" | "dice_roll";

/** All valid scene IDs. */
export const VALID_SCENES: SceneId[] = [
  "tavern_idle", "tavern_tense", "goblin_ambush", "combat_melee",
  "cave_entrance", "cave_interior", "npc_dialogue", "forest_path",
  "town_street", "campfire", "treasure_found", "magic_spell",
  "fireball", "stealth", "trap_danger", "locked_door",
  "rain_storm", "victory", "defeat", "potion_drink",
  "bridge_crossing", "throne_room", "moonrise", "merchant", "dice_roll",
];

/** All valid scene moods. */
export const VALID_MOODS: SceneMood[] = ["combat", "exploration", "tavern", "mystery", "dramatic", "danger"];

/** Character voice identifiers for multi-voice TTS. */
export type CharacterVoice = "narrator" | "barkeep" | "goblin";

/**
 * MiniMax voice_setting.emotion values.
 * Bedrock outputs these directly via {{emotion:TAG}} — no mapping needed.
 * speech-2.8 models support all except "whisper".
 */
export type MiniMaxEmotion = "happy" | "sad" | "angry" | "fearful" | "surprised" | "calm";

export const VALID_EMOTIONS: MiniMaxEmotion[] = ["happy", "sad", "angry", "fearful", "surprised", "calm"];
