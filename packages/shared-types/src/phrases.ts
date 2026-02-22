import type { SceneMood, CharacterVoice } from "./tts.js";

/** MiniMax TTS model identifiers used for phrase pre-warming. */
export type TTSModel = "speech-2.8-hd" | "speech-2.8-turbo";

/** A pre-voiced phrase the LLM can reference via {{phrase:ID}}. */
export interface Phrase {
  id: string;
  /** TTS text — includes bracket emotion tags and voice tags. */
  text: string;
  /** Clean text for chat bubble display (no tags). */
  display: string;
  /** Primary voice for this phrase. */
  voice: CharacterVoice;
  /** Which moods to pre-warm in cache. */
  moods: SceneMood[];
  /** Which TTS models to pre-warm. */
  models: TTSModel[];
}

// ── Phrase Bank ────────────────────────────────────────────────────────────────

export const PHRASE_BANK: Phrase[] = [
  // ── Closings ──────────────────────────────────────────────────────────────
  {
    id: "narrator_what_do_you_do",
    text: "What do you do?",
    display: "What do you do?",
    voice: "narrator",
    moods: ["combat", "tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_roll_attack",
    text: "[excited] Roll for your attack!",
    display: "Roll for your attack! \u{1F3B2}",
    voice: "narrator",
    moods: ["combat"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_roll_persuasion",
    text: "Roll for persuasion!",
    display: "Roll for persuasion! \u{1F3B2}",
    voice: "narrator",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_roll_perception",
    text: "[whisper] Roll for perception \u2014 something feels off.",
    display: "Roll for perception \u2014 something feels off. \u{1F3B2}",
    voice: "narrator",
    moods: ["exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_roll_stealth",
    text: "[whisper] Roll for stealth.",
    display: "Roll for stealth. \u{1F3B2}",
    voice: "narrator",
    moods: ["exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_roll_luck",
    text: "[excited] Fortune favors the bold. Roll your luck!",
    display: "Fortune favors the bold. Roll your luck! \u{1F3B2}",
    voice: "narrator",
    moods: ["combat", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_choose_wisely",
    text: "Choose wisely.",
    display: "Choose wisely.",
    voice: "narrator",
    moods: ["exploration"],
    models: ["speech-2.8-turbo"],
  },

  // ── Transitions ───────────────────────────────────────────────────────────
  {
    id: "narrator_time_passes",
    text: "Time passes.",
    display: "Time passes.",
    voice: "narrator",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_meanwhile",
    text: "Meanwhile...",
    display: "Meanwhile...",
    voice: "narrator",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_dawn_breaks",
    text: "Dawn breaks over the horizon, painting the sky in shades of amber and gold.",
    display: "Dawn breaks over the horizon, painting the sky in shades of amber and gold.",
    voice: "narrator",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_night_falls",
    text: "[whisper] Night falls, and the shadows grow long.",
    display: "Night falls, and the shadows grow long.",
    voice: "narrator",
    moods: ["exploration"],
    models: ["speech-2.8-turbo"],
  },

  // ── Reactions ─────────────────────────────────────────────────────────────
  {
    id: "narrator_critical_hit",
    text: "[excited] A critical hit! Legendary!",
    display: "A critical hit! Legendary!",
    voice: "narrator",
    moods: ["combat"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_critical_fail",
    text: "[sad] A critical failure. The fates are cruel.",
    display: "A critical failure. The fates are cruel.",
    voice: "narrator",
    moods: ["combat"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_success",
    text: "[excited] Success!",
    display: "Success!",
    voice: "narrator",
    moods: ["combat", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_failure",
    text: "The attempt falls short.",
    display: "The attempt falls short.",
    voice: "narrator",
    moods: ["combat", "exploration"],
    models: ["speech-2.8-turbo"],
  },

  // ── Atmosphere ────────────────────────────────────────────────────────────
  {
    id: "narrator_tavern_ambience",
    text: "The fire crackles in the hearth. The smell of stale ale and pipe smoke fills the air.",
    display: "The fire crackles in the hearth. The smell of stale ale and pipe smoke fills the air.",
    voice: "narrator",
    moods: ["tavern"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_cave_ambience",
    text: "[whisper] Water drips in the darkness. The air is cold and still.",
    display: "Water drips in the darkness. The air is cold and still.",
    voice: "narrator",
    moods: ["exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "narrator_forest_ambience",
    text: "Wind rustles through ancient trees. Somewhere in the distance, a crow calls.",
    display: "Wind rustles through ancient trees. Somewhere in the distance, a crow calls.",
    voice: "narrator",
    moods: ["exploration"],
    models: ["speech-2.8-turbo"],
  },

  // ── Gorm (barkeep) ───────────────────────────────────────────────────────
  {
    id: "gorm_greeting",
    text: "{{voice:barkeep}}What'll it be?{{/voice}}",
    display: "What'll it be?",
    voice: "barkeep",
    moods: ["tavern"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "gorm_suspicious",
    text: "{{voice:barkeep}}[angry] I don't talk to strangers about town business.{{/voice}}",
    display: "I don't talk to strangers about town business.",
    voice: "barkeep",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "gorm_warning",
    text: "{{voice:barkeep}}I'd stay away from the northern caves if I were you.{{/voice}}",
    display: "I'd stay away from the northern caves if I were you.",
    voice: "barkeep",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "gorm_quest_hook",
    text: "{{voice:barkeep}}The Ring of Ashwick. Stolen three nights ago. Goblins took it to the northern caves.{{/voice}}",
    display: "The Ring of Ashwick. Stolen three nights ago. Goblins took it to the northern caves.",
    voice: "barkeep",
    moods: ["tavern", "exploration"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "gorm_farewell",
    text: "{{voice:barkeep}}Watch yourself out there.{{/voice}}",
    display: "Watch yourself out there.",
    voice: "barkeep",
    moods: ["tavern"],
    models: ["speech-2.8-turbo"],
  },

  // ── Goblin ────────────────────────────────────────────────────────────────
  {
    id: "goblin_taunt",
    text: "{{voice:goblin}}[angry] You dare enter our domain, surface dweller?{{/voice}}",
    display: "You dare enter our domain, surface dweller?",
    voice: "goblin",
    moods: ["combat"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "goblin_flee",
    text: "{{voice:goblin}}[fearful] Run! Run away!{{/voice}}",
    display: "Run! Run away!",
    voice: "goblin",
    moods: ["combat"],
    models: ["speech-2.8-turbo"],
  },
  {
    id: "goblin_ambush",
    text: "{{voice:goblin}}[excited] Get them! Attack!{{/voice}}",
    display: "Get them! Attack!",
    voice: "goblin",
    moods: ["combat"],
    models: ["speech-2.8-turbo"],
  },

  // ── Opening monologues (speech-2.8-hd for quality) ────────────────────────
  {
    id: "opening_tavern_v1",
    text: "[whisper] The heavy oak door groans as you push it open, and the warmth of the Shattered Crown Tavern washes over you. The fire crackles low in the stone hearth, casting long shadows across half-empty tables. The air is thick with pipe smoke and the sour tang of stale ale. Behind the bar, a stocky dwarf with a braided beard and a missing left ear polishes a tankard without looking up. This is Gorm \u2014 and something about the way his eye follows you tells you this town has seen better days. What do you do?",
    display: "The heavy oak door groans as you push it open, and the warmth of the Shattered Crown Tavern washes over you. The fire crackles low in the stone hearth, casting long shadows across half-empty tables. The air is thick with pipe smoke and the sour tang of stale ale. Behind the bar, a stocky dwarf with a braided beard and a missing left ear polishes a tankard without looking up. This is Gorm \u2014 and something about the way his eye follows you tells you this town has seen better days. What do you do?",
    voice: "narrator",
    moods: ["tavern"],
    models: ["speech-2.8-hd"],
  },
  {
    id: "opening_tavern_v2",
    text: "Cold air bites at your heels as the door of the Shattered Crown Tavern swings shut behind you. Inside, the fire crackles low, painting long shadows across stone walls and worn wooden tables. A handful of patrons sit scattered about, speaking in hushed tones \u2014 or not at all. Behind the bar stands a one-eared dwarf, his braided beard streaked with grey. [whisper] He doesn't greet you. He simply watches, polishing the same tankard he's been polishing since you walked in. The town of Ashwick feels like it's holding its breath. What do you do?",
    display: "Cold air bites at your heels as the door of the Shattered Crown Tavern swings shut behind you. Inside, the fire crackles low, painting long shadows across stone walls and worn wooden tables. A handful of patrons sit scattered about, speaking in hushed tones \u2014 or not at all. Behind the bar stands a one-eared dwarf, his braided beard streaked with grey. He doesn't greet you. He simply watches, polishing the same tankard he's been polishing since you walked in. The town of Ashwick feels like it's holding its breath. What do you do?",
    voice: "narrator",
    moods: ["tavern"],
    models: ["speech-2.8-hd"],
  },
  {
    id: "opening_tavern_v3",
    text: "You step inside. Dim firelight. The smell of old ale and something faintly metallic. [whisper] Three hooded figures sit in the far corner, their conversation dying the moment you enter. At the bar, a stocky dwarf \u2014 missing his left ear, braided beard, arms like tree trunks \u2014 gives you a look that's equal parts suspicion and exhaustion. His name is Gorm. And whatever's wrong in this town, it's written all over his face. What do you do?",
    display: "You step inside. Dim firelight. The smell of old ale and something faintly metallic. Three hooded figures sit in the far corner, their conversation dying the moment you enter. At the bar, a stocky dwarf \u2014 missing his left ear, braided beard, arms like tree trunks \u2014 gives you a look that's equal parts suspicion and exhaustion. His name is Gorm. And whatever's wrong in this town, it's written all over his face. What do you do?",
    voice: "narrator",
    moods: ["tavern"],
    models: ["speech-2.8-hd"],
  },
];

/** O(1) lookup map from phrase ID to Phrase. */
export const PHRASE_MAP: Map<string, Phrase> = new Map(
  PHRASE_BANK.map((p) => [p.id, p]),
);
