import { createHash } from "node:crypto";
import tracer from "dd-trace";
import { config } from "./config.js";
import { logEvent } from "./logger.js";

export type TTSModel = "speech-2.8-hd" | "speech-2.8-turbo";

export type SceneMood = "combat" | "tavern" | "mystery" | "dramatic" | "danger";

export type CharacterVoice = "narrator" | "barkeep" | "goblin";

export interface TTSOptions {
  model?: TTSModel;         // default "speech-2.8-hd"
  mood?: SceneMood;         // affects speed/pitch
  voice?: CharacterVoice;   // affects voice_id
  stream?: boolean;         // default false
}

export interface TTSResult {
  audioBuffer: Buffer;
  audioFormat: string;
  durationMs: number;
}

const VOICE_MAP: Record<CharacterVoice, string> = {
  narrator: "English_CaptivatingStoryteller",
  barkeep: "English_ManSportsCommentator",    // deep, gruff male
  goblin: "English_FloridaMan",               // nasal, energetic
};

const MOOD_PROSODY: Record<SceneMood, { speed: number; pitch: number }> = {
  combat:   { speed: 1.15, pitch: 2 },
  tavern:   { speed: 0.9,  pitch: -1 },
  mystery:  { speed: 0.85, pitch: -2 },
  dramatic: { speed: 0.95, pitch: 1 },
  danger:   { speed: 1.05, pitch: 3 },
};

// ── TTS audio cache ──────────────────────────────────────────────────────────
// Key = hash of (text + voice + mood + model). Avoids duplicate MiniMax calls.

interface TTSCacheEntry {
  result: TTSResult;
  createdAt: number;
}

const ttsCache = new Map<string, TTSCacheEntry>();
const TTS_CACHE_MAX_SIZE = 200;
const TTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let ttsCacheHits = 0;
let ttsCacheMisses = 0;

function buildTTSCacheKey(text: string, voice: CharacterVoice, mood: SceneMood | undefined, model: TTSModel): string {
  return `${model}|${voice}|${mood ?? "none"}|${text}`;
}

function hashKey(preHashKey: string): string {
  return createHash("sha256").update(preHashKey).digest("hex").slice(0, 16);
}

function evictStaleTTSEntries(): void {
  const now = Date.now();
  for (const [key, entry] of ttsCache) {
    if (now - entry.createdAt > TTS_CACHE_TTL_MS) {
      ttsCache.delete(key);
    }
  }
}

export function getTTSCacheStats() {
  return { hits: ttsCacheHits, misses: ttsCacheMisses, size: ttsCache.size };
}

/** Extract and strip {{mood:TAG}} from start of text. Returns [mood, cleanText]. */
export function extractMood(text: string): [SceneMood | null, string] {
  const match = text.match(/^\{\{mood:(\w+)\}\}\s*/);
  if (!match) return [null, text];
  const mood = match[1] as SceneMood;
  const valid: SceneMood[] = ["combat", "tavern", "mystery", "dramatic", "danger"];
  return valid.includes(mood) ? [mood, text.slice(match[0].length)] : [null, text];
}

/** Split text into segments by {{voice:ID}}...{{/voice}} tags.
 *  Returns array of { voice: CharacterVoice, text: string } segments. */
export function splitVoiceSegments(text: string): Array<{ voice: CharacterVoice; text: string }> {
  const segments: Array<{ voice: CharacterVoice; text: string }> = [];
  const regex = /\{\{voice:(\w+)\}\}([\s\S]*?)\{\{\/voice\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this voice tag = narrator
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ voice: "narrator", text: before });
    }
    const voice = match[1] as CharacterVoice;
    const validVoices: CharacterVoice[] = ["narrator", "barkeep", "goblin"];
    segments.push({
      voice: validVoices.includes(voice) ? voice : "narrator",
      text: match[2].trim()
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last voice tag
  const remaining = text.slice(lastIndex).trim();
  if (remaining) segments.push({ voice: "narrator", text: remaining });

  return segments.length > 0 ? segments : [{ voice: "narrator", text }];
}

/** Strip emotion tags, mood tags, and voice tags for UI display. */
export function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}

export async function generateTTS(text: string, options: TTSOptions = {}): Promise<TTSResult> {
  const model = options.model ?? "speech-2.8-hd";
  const voice = options.voice ?? "narrator";
  const prosody = options.mood ? MOOD_PROSODY[options.mood] : { speed: 1, pitch: 0 };

  // ── Cache lookup ──────────────────────────────────────────────────────
  const preHashKey = buildTTSCacheKey(text, voice, options.mood, model);
  const cacheKey = hashKey(preHashKey);
  const cached = ttsCache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < TTS_CACHE_TTL_MS) {
    ttsCacheHits++;
    logEvent("info", "tts.cache_hit", {
      cacheKey,
      preHashKey: preHashKey.slice(0, 120),
      textLength: text.length,
      voice,
      mood: options.mood ?? "none",
      model,
      cacheHits: ttsCacheHits,
      cacheMisses: ttsCacheMisses,
      cacheSize: ttsCache.size,
    });
    return cached.result;
  }

  ttsCacheMisses++;
  logEvent("info", "tts.cache_miss", {
    cacheKey,
    preHashKey: preHashKey.slice(0, 120),
    textLength: text.length,
    voice,
    mood: options.mood ?? "none",
    model,
    cacheHits: ttsCacheHits,
    cacheMisses: ttsCacheMisses,
    cacheSize: ttsCache.size,
    reason: cached ? "expired" : "not_found",
  });

  // ── API call (cache miss) ─────────────────────────────────────────────
  return tracer.llmobs.trace(
    { kind: "tool", name: "minimax.tts" },
    async (span) => {
      const url = `https://api.minimax.io/v1/t2a_v2?GroupId=${config.MINIMAX_GROUP_ID}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.MINIMAX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          text,
          stream: false,
          output_format: "hex",
          voice_setting: {
            voice_id: VOICE_MAP[voice],
            speed: prosody.speed,
            vol: 1,
            pitch: prosody.pitch,
          },
          audio_setting: {
            sample_rate: 32000,
            format: "mp3",
            channel: 1,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(
          `MiniMax TTS HTTP error: ${response.status} ${response.statusText}`
        );
      }

      const json = await response.json() as {
        base_resp: { status_code: number; status_msg: string };
        data: { audio: string };
        extra_info: { audio_format?: string; audio_length?: number };
      };

      if (json.base_resp.status_code !== 0) {
        throw new Error(
          `MiniMax TTS application error: ${json.base_resp.status_code} — ${json.base_resp.status_msg}`
        );
      }

      const audioBuffer = Buffer.from(json.data.audio, "hex");
      const result: TTSResult = {
        audioBuffer,
        audioFormat: json.extra_info.audio_format ?? "mp3",
        durationMs: json.extra_info.audio_length ?? 0,
      };

      // Annotate BEFORE callback returns — span finishes on return
      tracer.llmobs.annotate(span, {
        inputData: text.slice(0, 200),
        outputData: JSON.stringify({
          byteLength: audioBuffer.byteLength,
          model,
          voice: VOICE_MAP[voice],
          mood: options.mood ?? "neutral",
        }),
        tags: { "tts.provider": "minimax", "tts.model": model, "tts.voice": voice },
      });

      // ── Store in cache ──────────────────────────────────────────────────
      evictStaleTTSEntries();
      if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
        // Evict oldest entry
        const oldestKey = ttsCache.keys().next().value;
        if (oldestKey) ttsCache.delete(oldestKey);
      }
      ttsCache.set(cacheKey, { result, createdAt: Date.now() });

      logEvent("info", "tts.api_call_completed", {
        cacheKey,
        preHashKey: preHashKey.slice(0, 120),
        textLength: text.length,
        voice,
        model,
        byteLength: audioBuffer.byteLength,
        cacheSize: ttsCache.size,
      });

      return result;
    }
  );
}

/**
 * Generate TTS for text that may contain multiple character voice segments.
 * Generates audio for each segment sequentially and concatenates the buffers.
 */
export async function generateMultiVoiceTTS(
  text: string,
  options: Omit<TTSOptions, "voice"> = {}
): Promise<TTSResult> {
  const [mood, cleanText] = extractMood(text);
  const segments = splitVoiceSegments(cleanText);
  const effectiveMood = options.mood ?? mood ?? undefined;

  const buffers: Buffer[] = [];
  let totalDuration = 0;

  for (const segment of segments) {
    const result = await generateTTS(segment.text, {
      ...options,
      mood: effectiveMood,
      voice: segment.voice,
    });
    buffers.push(result.audioBuffer);
    totalDuration += result.durationMs;
  }

  return {
    audioBuffer: Buffer.concat(buffers),
    audioFormat: "mp3",
    durationMs: totalDuration,
  };
}
