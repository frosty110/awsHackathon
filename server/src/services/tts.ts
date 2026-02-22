import { createHash } from "node:crypto";
import tracer from "dd-trace";
import { config } from "./config.js";
import { logEvent } from "./logger.js";
import { buildKey, get as s3Get, put as s3Put } from "./mediaCache.js";
import {
  type SceneMood,
  type SceneId,
  type CharacterVoice,
  VALID_SCENES,
  VALID_MOODS,
  extractMood,
  extractScene,
  splitVoiceSegments,
  stripTTSTags,
} from "@ai-dm/shared-types";

export type { SceneMood, SceneId, CharacterVoice };
export { extractMood, extractScene, splitVoiceSegments, stripTTSTags };

export type TTSModel = "speech-2.8-hd" | "speech-2.8-turbo";

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
  barkeep: "English_Debator",                 // Gorm: tough, middle-aged, assertive ex-soldier
  goblin: "English_Comedian",                 // chaotic, quirky goblin energy
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

export async function generateTTS(text: string, options: TTSOptions = {}): Promise<TTSResult> {
  const model = options.model ?? "speech-2.8-hd";
  const voice = options.voice ?? "narrator";
  const prosody = options.mood ? MOOD_PROSODY[options.mood] : { speed: 1, pitch: 0 };

  // ── Cache lookup ──────────────────────────────────────────────────────
  const preHashKey = buildTTSCacheKey(text, voice, options.mood, model);
  const cacheKey = hashKey(preHashKey);
  const s3Key = buildKey("tts/v1", `${model}|${voice}|${options.mood ?? "none"}|${text}`, "mp3");

  // L1: in-memory Map (zero latency for recently generated audio)
  const l1Cached = ttsCache.get(cacheKey);
  if (l1Cached && Date.now() - l1Cached.createdAt < TTS_CACHE_TTL_MS) {
    ttsCacheHits++;
    tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'tts', source: 'memory' });
    logEvent("info", "tts.cache_hit", {
      cacheKey,
      s3Key,
      source: "memory",
      preHashKey: preHashKey.slice(0, 120),
      textLength: text.length,
      voice,
      mood: options.mood ?? "none",
      model,
      cacheHits: ttsCacheHits,
      cacheMisses: ttsCacheMisses,
      cacheSize: ttsCache.size,
    });
    return l1Cached.result;
  }

  // L2: S3 (durable, cross-instance cache)
  let s3Buffer: Buffer | null = null;
  try {
    s3Buffer = await s3Get(s3Key);
  } catch (err) {
    // S3 unavailable — degrade gracefully, treat as miss
    logEvent("warn", "tts.s3_cache_get_failed", { s3Key, error: String(err) });
  }

  if (s3Buffer) {
    ttsCacheHits++;
    tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'tts', source: 's3' });
    const s3Result: TTSResult = { audioBuffer: s3Buffer, audioFormat: "mp3", durationMs: 0 };
    // Promote to L1 for zero-latency access on subsequent requests in this session
    ttsCache.set(cacheKey, { result: s3Result, createdAt: Date.now() });
    logEvent("info", "tts.cache_hit", {
      cacheKey,
      s3Key,
      source: "s3",
      preHashKey: preHashKey.slice(0, 120),
      textLength: text.length,
      voice,
      mood: options.mood ?? "none",
      model,
      cacheHits: ttsCacheHits,
      cacheMisses: ttsCacheMisses,
      cacheSize: ttsCache.size,
    });
    return s3Result;
  }

  ttsCacheMisses++;
  tracer.dogstatsd.increment('cache.miss', 1, { cache_type: 'tts' });
  logEvent("info", "tts.cache_miss", {
    cacheKey,
    s3Key,
    preHashKey: preHashKey.slice(0, 120),
    textLength: text.length,
    voice,
    mood: options.mood ?? "none",
    model,
    cacheHits: ttsCacheHits,
    cacheMisses: ttsCacheMisses,
    cacheSize: ttsCache.size,
    reason: l1Cached ? "expired" : "not_found",
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
      // L1: store in memory
      evictStaleTTSEntries();
      if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
        // Evict oldest entry
        const oldestKey = ttsCache.keys().next().value;
        if (oldestKey) ttsCache.delete(oldestKey);
      }
      ttsCache.set(cacheKey, { result, createdAt: Date.now() });

      // L2: store in S3 (fire-and-forget, non-blocking — does NOT add latency to TTS response)
      s3Put(s3Key, result.audioBuffer, "audio/mpeg", {
        voice: VOICE_MAP[voice],
        mood: options.mood ?? "none",
        model,
      }).catch((err) =>
        logEvent("warn", "tts.s3_cache_put_failed", { s3Key, error: String(err) })
      );

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
    try {
      const result = await generateTTS(segment.text, {
        ...options,
        mood: effectiveMood,
        voice: segment.voice,
      });
      buffers.push(result.audioBuffer);
      totalDuration += result.durationMs;
    } catch (err) {
      // If a non-narrator voice fails, retry with narrator as fallback
      if (segment.voice !== "narrator") {
        logEvent("warn", "tts.voice_fallback", {
          failedVoice: segment.voice,
          voiceId: VOICE_MAP[segment.voice],
          error: String(err),
        });
        const fallback = await generateTTS(segment.text, {
          ...options,
          mood: effectiveMood,
          voice: "narrator",
        });
        buffers.push(fallback.audioBuffer);
        totalDuration += fallback.durationMs;
      } else {
        throw err; // narrator voice failing is unrecoverable
      }
    }
  }

  return {
    audioBuffer: Buffer.concat(buffers),
    audioFormat: "mp3",
    durationMs: totalDuration,
  };
}
