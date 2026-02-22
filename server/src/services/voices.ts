/**
 * MiniMax TTS Voice Catalog & Character Casting
 *
 * SOURCE: MiniMax Get Voice API (POST https://api.minimax.io/v1/get_voice)
 *   Request:  { "voice_type": "system" }
 *   Auth:     Authorization: Bearer <MINIMAX_API_KEY>
 *   Docs:     https://platform.minimax.io/docs/api-reference/voice-management-get
 *   Fetched:  2026-02-21 — 332 total system voices, 45 English.
 *
 * Every voice_id below was verified against the live API response.
 * Descriptions are verbatim from the API (trimmed for line length).
 *
 * To refresh: call the API above and diff against VOICE_CATALOG.
 *
 * Storyline: The Shattered Crown Tavern, Ashwick
 * - Gorm: gruff one-eared dwarf barkeep, ex-soldier
 * - Goblins: raiders from the northern caves
 * - Narrator/DM: atmospheric dark fantasy storytelling
 */

// ── Full voice catalog (API-verified) ───────────────────────────────────────

export interface VoiceEntry {
  /** Exact voice_id string sent to MiniMax t2a_v2 API. */
  id: string;
  /** Human-readable name from API voice_name field. */
  name: string;
  /** Gender inferred from API description. */
  gender: "male" | "female";
  /** Age range from API description. */
  age: "youth" | "young adult" | "adult" | "middle-aged" | "senior";
  /** Accent from API description. */
  accent: "American" | "British" | "Australian" | "Indian" | "unspecified";
  /** Verbatim description from MiniMax API. */
  description: string;
  /** D&D archetype suggestion for casting. */
  archetype: string;
}

export const VOICE_CATALOG: VoiceEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MALE VOICES (21)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "English_expressive_narrator",
    name: "Expressive Narrator",
    gender: "male",
    age: "adult",
    accent: "British",
    description: "An expressive adult male voice with a British accent, perfect for engaging audiobook narration.",
    archetype: "cinematic narrator",
  },
  {
    id: "English_magnetic_voiced_man",
    name: "Magnetic-Voiced Male",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "A magnetic and persuasive adult male voice with a general American accent, ideal for advertisements and promotions.",
    archetype: "charismatic leader",
  },
  {
    id: "English_Aussie_Bloke",
    name: "Aussie Bloke",
    gender: "male",
    age: "adult",
    accent: "Australian",
    description: "A friendly, bright adult male voice with a distinct Australian accent, conveying a cheerful and approachable tone.",
    archetype: "rugged traveler",
  },
  {
    id: "English_Trustworth_Man",
    name: "Trustworthy Man",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "A trustworthy and resonant adult male voice with a general American accent, conveying sincerity and reliability.",
    archetype: "reliable ally / guard captain",
  },
  {
    id: "English_Gentle-voiced_man",
    name: "Gentle-Voiced Man",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "A gentle and resonant adult male voice with a general American accent, warm and reassuring.",
    archetype: "soft-spoken healer / sage",
  },
  {
    id: "English_Diligent_Man",
    name: "Diligent Man",
    gender: "male",
    age: "adult",
    accent: "Indian",
    description: "A diligent and sincere adult male voice with an Indian accent, conveying honesty and hard work.",
    archetype: "merchant / craftsman",
  },
  {
    id: "English_ReservedYoungMan",
    name: "Reserved Young Man",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "A reserved and cold adult male voice with a general American accent, conveying distance and introspection.",
    archetype: "brooding rogue / dark stranger",
  },
  {
    id: "English_ManWithDeepVoice",
    name: "Man With Deep Voice",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "An adult male with a deep, commanding voice and a general American accent, projecting authority and strength.",
    archetype: "imposing warrior / dungeon boss",
  },
  {
    id: "English_MaturePartner",
    name: "Mature Partner",
    gender: "male",
    age: "middle-aged",
    accent: "British",
    description: "A mature, gentle middle-aged male voice with a British accent, suitable for a caring and supportive partner role.",
    archetype: "world-weary mentor / retired knight",
  },
  {
    id: "English_FriendlyPerson",
    name: "Friendly Guy",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "A friendly and natural-sounding adult male voice with a general American accent, like an approachable guy-next-door.",
    archetype: "tavern regular / helpful townfolk",
  },
  {
    id: "English_Debator",
    name: "Male Debater",
    gender: "male",
    age: "middle-aged",
    accent: "American",
    description: "A tough, middle-aged male voice with a general American accent, perfect for debates and assertive arguments.",
    archetype: "gruff barkeep / seasoned soldier",
  },
  {
    id: "English_Steadymentor",
    name: "Reliable Man",
    gender: "male",
    age: "young adult",
    accent: "American",
    description: "A young adult male voice with a general American accent, projecting an air of arrogant reliability.",
    archetype: "cocky squire / guild officer",
  },
  {
    id: "English_Deep-VoicedGentleman",
    name: "Deep-Voiced Gentleman",
    gender: "male",
    age: "adult",
    accent: "British",
    description: "A deep-voiced and wise adult male gentleman with a classic British accent, sounding experienced and thoughtful.",
    archetype: "noble lord / elder wizard",
  },
  {
    id: "English_DecentYoungMan",
    name: "Decent Young Man",
    gender: "male",
    age: "adult",
    accent: "British",
    description: "A decent and respectable adult male voice with a British accent, sounding polite and well-mannered.",
    archetype: "paladin / honorable knight",
  },
  {
    id: "English_PassionateWarrior",
    name: "Passionate Warrior",
    gender: "male",
    age: "young adult",
    accent: "American",
    description: "An energetic and passionate young adult male warrior voice with a general American accent, ready for battle.",
    archetype: "young fighter / zealot",
  },
  {
    id: "English_WiseScholar",
    name: "Wise Scholar",
    gender: "male",
    age: "young adult",
    accent: "British",
    description: "A wise, conversational young adult scholar with a British accent, making complex topics accessible and engaging.",
    archetype: "wizard / lore keeper",
  },
  {
    id: "English_PatientMan",
    name: "Patient Man",
    gender: "male",
    age: "adult",
    accent: "British",
    description: "A patient adult male voice with a British accent, speaking in a calm and understanding manner.",
    archetype: "temple priest / healer",
  },
  {
    id: "English_Comedian",
    name: "Comedian",
    gender: "male",
    age: "young adult",
    accent: "British",
    description: "A breezy young adult male comedian with a British accent, delivering lines with a light and humorous touch.",
    archetype: "goblin / trickster / bard",
  },
  {
    id: "English_BossyLeader",
    name: "Bossy Leader",
    gender: "male",
    age: "adult",
    accent: "American",
    description: "A bossy adult male leader with a general American accent, speaking unconcernedly with an air of command.",
    archetype: "warlord / bandit chief",
  },
  {
    id: "English_Strong-WilledBoy",
    name: "Strong-Willed Boy",
    gender: "male",
    age: "young adult",
    accent: "British",
    description: "A mature-sounding and strong-willed young adult male with a British accent, showing determination beyond his years.",
    archetype: "scrappy goblin / determined apprentice",
  },
  {
    id: "English_Jovialman",
    name: "Jovial Man",
    gender: "male",
    age: "middle-aged",
    accent: "American",
    description: "A jovial and mature middle-aged male voice with a general American accent, cheerful and good-natured.",
    archetype: "friendly innkeeper / jolly merchant",
  },
  {
    id: "English_SadTeen",
    name: "Teen Boy",
    gender: "male",
    age: "young adult",
    accent: "British",
    description: "A frustrated young adult male voice with a British accent, perfect for a teen character expressing annoyance.",
    archetype: "whiny goblin / reluctant henchman",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FEMALE VOICES (22)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "English_radiant_girl",
    name: "Radiant Girl",
    gender: "female",
    age: "young adult",
    accent: "American",
    description: "A radiant and lively young adult female voice with a general American accent, full of energy and brightness.",
    archetype: "enthusiastic bard / tavern singer",
  },
  {
    id: "English_compelling_lady1",
    name: "Compelling Lady",
    gender: "female",
    age: "adult",
    accent: "British",
    description: "A compelling adult female voice with a British accent, suitable for broadcast and formal announcements.",
    archetype: "noble ambassador / court herald",
  },
  {
    id: "English_captivating_female1",
    name: "Captivating Female",
    gender: "female",
    age: "adult",
    accent: "American",
    description: "A captivating adult female voice with a general American accent, ideal for news reporting and documentary narration.",
    archetype: "enchantress / quest giver",
  },
  {
    id: "English_Upbeat_Woman",
    name: "Upbeat Woman",
    gender: "female",
    age: "adult",
    accent: "American",
    description: "An upbeat and bright adult female voice with a general American accent, perfect for energetic and positive messaging.",
    archetype: "cheerful merchant / guild recruiter",
  },
  {
    id: "English_CalmWoman",
    name: "Calm Woman",
    gender: "female",
    age: "adult",
    accent: "American",
    description: "A calm and soothing adult female voice with a general American accent, excellent for audiobooks and meditation guides.",
    archetype: "serene priestess / temple healer",
  },
  {
    id: "English_UpsetGirl",
    name: "Upset Girl",
    gender: "female",
    age: "young adult",
    accent: "British",
    description: "A young adult female voice with a British accent, effectively conveying sadness and distress.",
    archetype: "distressed villager / kidnapped noble",
  },
  {
    id: "English_Whispering_girl",
    name: "Whispering Girl",
    gender: "female",
    age: "young adult",
    accent: "unspecified",
    description: "(No official description.) A whispering female voice.",
    archetype: "shadowy informant / ghost",
  },
  {
    id: "English_Graceful_Lady",
    name: "Graceful Lady",
    gender: "female",
    age: "middle-aged",
    accent: "British",
    description: "A graceful and elegant middle-aged female voice with a classic British accent, exuding sophistication.",
    archetype: "elf queen / noble matriarch",
  },
  {
    id: "English_PlayfulGirl",
    name: "Playful Girl",
    gender: "female",
    age: "youth",
    accent: "American",
    description: "A playful female youth voice with a general American accent, ideal for cartoons and children's entertainment.",
    archetype: "mischievous fey / pixie",
  },
  {
    id: "English_MatureBoss",
    name: "Bossy Lady",
    gender: "female",
    age: "middle-aged",
    accent: "American",
    description: "A mature, middle-aged female voice with a general American accent, conveying authority and a commanding presence.",
    archetype: "guild leader / war matron",
  },
  {
    id: "English_LovelyGirl",
    name: "Lovely Girl",
    gender: "female",
    age: "youth",
    accent: "British",
    description: "A lovely and sweet female youth voice with a British accent, full of charm and innocence.",
    archetype: "healer's apprentice / village child",
  },
  {
    id: "English_Wiselady",
    name: "Wise Lady",
    gender: "female",
    age: "middle-aged",
    accent: "British",
    description: "A wise and genial middle-aged female voice with a British accent, offering kind and insightful words.",
    archetype: "oracle / fortune teller",
  },
  {
    id: "English_SentimentalLady",
    name: "Sentimental Lady",
    gender: "female",
    age: "middle-aged",
    accent: "British",
    description: "A sentimental and elegant middle-aged female voice with a British accent, perfect for nostalgic or emotional readings.",
    archetype: "mourning widow / tragic NPC",
  },
  {
    id: "English_ImposingManner",
    name: "Imposing Queen",
    gender: "female",
    age: "adult",
    accent: "British",
    description: "The imposing voice of an adult queen with a powerful British accent, commanding respect and authority.",
    archetype: "dark queen / villain monarch",
  },
  {
    id: "English_Soft-spokenGirl",
    name: "Soft-Spoken Girl",
    gender: "female",
    age: "youth",
    accent: "American",
    description: "An adorable, soft-spoken female youth voice with a general American accent, gentle and sweet.",
    archetype: "shy villager / rescued captive",
  },
  {
    id: "English_SereneWoman",
    name: "Serene Woman",
    gender: "female",
    age: "young adult",
    accent: "American",
    description: "A serene and friendly young adult female voice with a general American accent, calm and welcoming.",
    archetype: "temple keeper / druid",
  },
  {
    id: "English_ConfidentWoman",
    name: "Confident Woman",
    gender: "female",
    age: "young adult",
    accent: "American",
    description: "A confident and firm young adult female voice with a general American accent, assertive and clear.",
    archetype: "warrior captain / ranger",
  },
  {
    id: "English_StressedLady",
    name: "Stressed Lady",
    gender: "female",
    age: "middle-aged",
    accent: "American",
    description: "An unsure, stressed middle-aged female voice with a general American accent, conveying anxiety and uncertainty.",
    archetype: "panicked townsfolk / siege survivor",
  },
  {
    id: "English_AssertiveQueen",
    name: "Assertive Queen",
    gender: "female",
    age: "young adult",
    accent: "American",
    description: "An assertive yet guarded young adult queen with a general American accent, projecting authority while remaining cautious.",
    archetype: "rebel princess / wary ally",
  },
  {
    id: "English_AnimeCharacter",
    name: "Female Narrator",
    gender: "female",
    age: "middle-aged",
    accent: "British",
    description: "A sincere middle-aged female narrator with a British accent, perfect for trustworthy and heartfelt storytelling.",
    archetype: "lore narrator / chronicler",
  },
  {
    id: "English_WhimsicalGirl",
    name: "Whimsical Girl",
    gender: "female",
    age: "young adult",
    accent: "American",
    description: "A whimsical yet wary young adult female voice with a general American accent, combining playfulness with caution.",
    archetype: "forest sprite / curious halfling",
  },
  {
    id: "English_Kind-heartedGirl",
    name: "Kind-Hearted Girl",
    gender: "female",
    age: "young adult",
    accent: "American",
    description: "A kind-hearted and calm young adult female with a general American accent, speaking with gentle warmth.",
    archetype: "cleric / compassionate NPC",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NARRATOR VOICES (1 — also listed in male above as English_expressive_narrator)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "English_CaptivatingStoryteller",
    name: "Captivating Storyteller",
    gender: "male",
    age: "senior",
    accent: "American",
    description: "A captivating senior male storyteller with a cold, detached tone and a general American accent.",
    archetype: "dungeon master / omniscient narrator",
  },
];

// ── Character casting ───────────────────────────────────────────────────────
// Active voice assignments used by tts.ts VOICE_MAP.
// When changing casting, update BOTH here and in tts.ts VOICE_MAP.

export const CHARACTER_CASTING = {
  // ── Narrator / Dungeon Master ────────────────────────────────────────────
  narrator: {
    voiceId: "English_CaptivatingStoryteller",
    reasoning:
      "Senior male, cold detached tone — perfect dark fantasy DM. " +
      "American accent keeps it neutral for a wide audience.",
    alternatives: [
      "English_expressive_narrator",    // British, more animated — good for dramatic scenes
      "English_Deep-VoicedGentleman",   // British, deep and wise — slower, more gravitas
    ],
  },

  // ── Gorm — gruff one-eared dwarf barkeep, ex-soldier ────────────────────
  gorm: {
    voiceId: "English_Debator",
    reasoning:
      "Tough, middle-aged male. Assertive and argumentative — nails the gruff " +
      "ex-soldier energy. Gorm isn't polished or gentle, he's seen battle and " +
      "lost an ear. This voice has the weight and edge for that.",
    alternatives: [
      "English_ManWithDeepVoice",       // deep, commanding — more imposing brute than barkeep
      "English_BossyLeader",            // air of command — more officer than bartender
      "English_MaturePartner",          // British, middle-aged, gentle — if Gorm is world-weary
      "English_Aussie_Bloke",           // Australian, friendly — gruff but warmer Gorm variant
    ],
  },

  // ── Goblins — raiders from the northern caves ───────────────────────────
  goblin: {
    voiceId: "English_Comedian",
    reasoning:
      "Breezy British comedian — light, humorous delivery becomes unhinged " +
      "and chaotic with speed/pitch prosody cranked up. Perfect goblin energy.",
    alternatives: [
      "English_Strong-WilledBoy",       // British, determined youth — scrappy goblin scout
      "English_SadTeen",                // British, frustrated teen — whiny cowardly goblin
      "English_PlayfulGirl",            // American youth — higher pitch, impish goblin variant
    ],
  },

  // ── Future characters (uncomment & wire into CharacterVoice type) ──────

  // mysterious_stranger: {
  //   voiceId: "English_ReservedYoungMan",
  //   reasoning: "Cold, distant, introspective — perfect for a cloaked figure in the tavern corner.",
  //   alternatives: ["English_Whispering_girl", "English_Deep-VoicedGentleman"],
  // },

  // wise_sage: {
  //   voiceId: "English_WiseScholar",
  //   reasoning: "British scholar, conversational — makes lore exposition feel natural.",
  //   alternatives: ["English_PatientMan", "English_Wiselady"],
  // },

  // tavern_patron: {
  //   voiceId: "English_Jovialman",
  //   reasoning: "Middle-aged, cheerful, American — classic friendly drunk at the bar.",
  //   alternatives: ["English_FriendlyPerson", "English_Aussie_Bloke"],
  // },

  // elf_queen: {
  //   voiceId: "English_Graceful_Lady",
  //   reasoning: "Elegant British middle-aged female — exudes elven sophistication.",
  //   alternatives: ["English_ImposingManner", "English_AssertiveQueen"],
  // },

  // distressed_villager: {
  //   voiceId: "English_UpsetGirl",
  //   reasoning: "British, conveys sadness and distress — immediate emotional hook.",
  //   alternatives: ["English_StressedLady", "English_SadTeen"],
  // },
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Look up a voice entry by ID. */
export function getVoice(id: string): VoiceEntry | undefined {
  return VOICE_CATALOG.find((v) => v.id === id);
}

/** Get all voices matching a gender. */
export function voicesByGender(gender: VoiceEntry["gender"]): VoiceEntry[] {
  return VOICE_CATALOG.filter((v) => v.gender === gender);
}

/** Get all voices matching an archetype keyword (case-insensitive partial match). */
export function voicesByArchetype(keyword: string): VoiceEntry[] {
  const lower = keyword.toLowerCase();
  return VOICE_CATALOG.filter((v) => v.archetype.toLowerCase().includes(lower));
}
