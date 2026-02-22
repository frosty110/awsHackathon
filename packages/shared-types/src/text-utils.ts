import type { SceneMood, SceneId, CharacterVoice, MiniMaxEmotion } from "./tts.js";
import { VALID_SCENES, VALID_MOODS, VALID_EMOTIONS } from "./tts.js";
import { PHRASE_MAP } from "./phrases.js";

/** Extract and strip {{mood:TAG}} from start of text. Returns [mood, cleanText]. */
export function extractMood(text: string): [SceneMood | null, string] {
  const match = text.match(/^\{\{mood:(\w+)\}\}\s*/);
  if (!match) return [null, text];
  const mood = match[1] as SceneMood;
  return VALID_MOODS.includes(mood) ? [mood, text.slice(match[0].length)] : [null, text];
}

/** Extract and strip {{scene:TAG}} from text. Returns [scene, cleanText]. */
export function extractScene(text: string): [SceneId | null, string] {
  const match = text.match(/\{\{scene:(\w+)\}\}\s*/);
  if (!match) return [null, text];
  const scene = match[1] as SceneId;
  return VALID_SCENES.includes(scene) ? [scene, text.replace(match[0], "")] : [null, text];
}

/** Split text into segments by {{voice:ID}}...{{/voice}} tags. */
export function splitVoiceSegments(text: string): Array<{ voice: CharacterVoice; text: string }> {
  const segments: Array<{ voice: CharacterVoice; text: string }> = [];
  const regex = /\{\{voice:(\w+)\}\}([\s\S]*?)\{\{\/voice\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ voice: "narrator", text: before });
    }
    const voice = match[1] as CharacterVoice;
    const validVoices: CharacterVoice[] = ["narrator", "barkeep", "goblin"];
    segments.push({
      voice: validVoices.includes(voice) ? voice : "narrator",
      text: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) segments.push({ voice: "narrator", text: remaining });

  return segments.length > 0 ? segments : [{ voice: "narrator", text }];
}

/** Extract first {{emotion:TAG}} and strip all emotion tags. Returns [emotion, cleanText]. */
export function extractEmotion(text: string): [MiniMaxEmotion | null, string] {
  const match = text.match(/\{\{emotion:(\w+)\}\}/);
  const raw = match ? match[1] as MiniMaxEmotion : null;
  const emotion = raw && VALID_EMOTIONS.includes(raw) ? raw : null;
  const cleanText = text.replace(/\{\{emotion:\w+\}\}\s*/g, "");
  return [emotion, cleanText];
}

/** Strip all {{tag}} metadata (mood, scene, voice, emotion, phrase) for UI display. */
export function stripTTSTags(text: string): string {
  return text
    .replace(/\{\{mood:\w+\}\}\s*/g, "")
    .replace(/\{\{scene:\w+\}\}\s*/g, "")
    .replace(/\{\{emotion:\w+\}\}\s*/g, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\{\{phrase:\w+\}\}/g, "")  // safety net for unexpanded phrase tags
    .trim();
}

/** Replace {{phrase:ID}} tags with the phrase's TTS text (for the audio pipeline). */
export function expandPhrases(text: string): string {
  return text.replace(/\{\{phrase:(\w+)\}\}/g, (_match, id: string) => {
    const phrase = PHRASE_MAP.get(id);
    return phrase ? phrase.text : "";
  });
}

/** Replace {{phrase:ID}} tags with the phrase's display text (for chat UI). */
export function expandPhrasesForDisplay(text: string): string {
  return text.replace(/\{\{phrase:(\w+)\}\}/g, (_match, id: string) => {
    const phrase = PHRASE_MAP.get(id);
    return phrase ? phrase.display : "";
  });
}

/**
 * Sanitize text for TTS: strip markdown formatting so the speech engine
 * doesn't read formatting characters aloud.
 * Note: {{emotion:TAG}} is extracted separately by extractEmotion() before this runs.
 */
export function sanitizeForTTS(text: string): string {
  return text
    // Safety net: strip any leftover {{emotion:...}} tags
    .replace(/\{\{emotion:\w+\}\}\s*/g, "")
    // Strip bold/italic markdown (order matters: bold first, then italic)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Strip markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Strip horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Strip markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Strip inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    // Strip blockquote markers
    .replace(/^>\s+/gm, "")
    // Strip dice emoji that the prompt uses
    .replace(/🎲/g, "")
    // Collapse multiple blank lines / excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
