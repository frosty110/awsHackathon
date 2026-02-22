// Chat & conversation types
export type { ChatMessage, BedrockResult } from "./chat.js";

// Room & multiplayer types
export type {
  RoomPhase,
  PlayerPayload,
  RoomStatePayload,
  ChatMessagePayload,
} from "./room.js";

// Player types
export type { CharacterClassId, GenderId } from "./player.js";

// TTS & scene types
export type { SceneMood, SceneId, CharacterVoice, MiniMaxEmotion } from "./tts.js";
export { VALID_SCENES, VALID_MOODS, VALID_EMOTIONS } from "./tts.js";

// Phrase bank types & data
export type { Phrase, TTSModel } from "./phrases.js";
export { PHRASE_BANK, PHRASE_MAP } from "./phrases.js";

// Socket event interfaces
export type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
} from "./socket-events.js";

// Usage & pricing types
export type { UsageEntry, UsageSummary } from "./usage.js";
export {
  BEDROCK_HAIKU_INPUT_PER_TOKEN,
  BEDROCK_HAIKU_OUTPUT_PER_TOKEN,
  MINIMAX_TTS_PER_CHAR,
  MINIMAX_MUSIC_PER_GENERATION,
  MINIMAX_VIDEO_PER_GENERATION,
} from "./usage.js";

// Text utility functions
export {
  extractMood,
  extractScene,
  extractEmotion,
  splitVoiceSegments,
  stripTTSTags,
  sanitizeForTTS,
  expandPhrases,
  expandPhrasesForDisplay,
} from "./text-utils.js";
