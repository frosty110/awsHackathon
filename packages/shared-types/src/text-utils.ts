import type { SceneMood, SceneId, CharacterVoice } from "./tts.js";
import { VALID_SCENES, VALID_MOODS } from "./tts.js";

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

/** Strip emotion tags, mood tags, scene tags, and voice tags for UI display. */
export function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{scene:\w+\}\}\s*/g, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}
