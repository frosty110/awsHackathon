import { LRUCache } from "lru-cache";
import tracer from "dd-trace";
import { config } from "./config.js";
import { logEvent } from "./logger.js";
import { isCircuitOpen, recordSuccess, recordFailure } from "./minimaxCircuitBreaker.js";
import { get as s3Get, put as s3Put, listKeys } from "./mediaCache.js";
import { recordMusicUsage } from "./usageTracker.js";
import { type GenerationEntry, getOrCreate, tryStartGeneration, recordGenerationFailure } from "./mediaGenerationHelpers.js";
import { randomUUID } from "node:crypto";
import { type SceneMood, VALID_MOODS } from "@dnd-adventures/shared-types";

export type { SceneMood };
export { VALID_MOODS };

// ── Mood prompts ──────────────────────────────────────────────────────────────

const MOOD_PROMPTS: Record<SceneMood, string> = {
  combat: "Epic orchestral fantasy battle, urgent drums, brass fanfare, instrumental, no vocals, fast tempo, 30 seconds",
  exploration: "Dark ambient fantasy, ethereal pads, subtle strings, suspenseful, instrumental, no vocals, slow tempo, 30 seconds",
  tavern: "Medieval tavern folk music, lute, fiddle, warm acoustic, instrumental, no vocals, moderate tempo, 30 seconds",
  mystery: "Dark mysterious fantasy, low cello drones, distant chimes, subtle tension, instrumental, no vocals, slow tempo, 30 seconds",
  dramatic: "Cinematic fantasy orchestral, sweeping strings, building crescendo, emotional, instrumental, no vocals, moderate tempo, 30 seconds",
  danger: "Ominous dark fantasy, deep war drums, dissonant brass, foreboding tension, instrumental, no vocals, slow building tempo, 30 seconds",
};

const MAX_VARIANTS = 5;

function buildMusicS3Key(mood: SceneMood, variant: number): string {
  return `music/v1/${mood}-${variant}.mp3`;
}

// ── Per-variant in-memory cache ──────────────────────────────────────────────

/** Metadata map: tracks generation state per mood-variant key e.g. "combat-3" */
const moodCache = new Map<string, GenerationEntry>();

/** LRU buffer cache: stores actual audio Buffers with 200MB byte budget and 1-hour TTL */
const musicBufferCache = new LRUCache<string, Buffer>({
  maxSize: 200 * 1024 * 1024, // 200MB byte budget
  sizeCalculation: (buf) => buf.byteLength,
  ttl: 60 * 60 * 1000, // 1 hour TTL
  allowStale: false,
});

const RETRY_COOLDOWN_MS = 30_000;
const MAX_SERVER_RETRIES = 3;

// ── Cache metrics ─────────────────────────────────────────────────────────────

let musicCacheHits = 0;
let musicCacheMisses = 0;

export function getMusicCacheStats() {
  const moods: Record<string, { cached: number; total: number }> = {};
  for (const mood of VALID_MOODS) {
    let cached = 0;
    for (let v = 1; v <= MAX_VARIANTS; v++) {
      if (musicBufferCache.has(`${mood}-${v}`)) cached++;
    }
    moods[mood] = { cached, total: MAX_VARIANTS };
  }
  return {
    hits: musicCacheHits,
    misses: musicCacheMisses,
    moods,
    byteSize: musicBufferCache.calculatedSize,
  };
}

// ── Random pool ──────────────────────────────────────────────────────────────

const MIN_RANDOM_POOL = 5;
let randomPoolGenerating = false;

// ── Internal helpers ──────────────────────────────────────────────────────────

function variantKey(mood: SceneMood, variant: number): string {
  return `${mood}-${variant}`;
}

function getOrCreateEntry(key: string): GenerationEntry {
  return getOrCreate(moodCache, key);
}

// ── Shared MiniMax music API call ─────────────────────────────────────────────

interface MusicAPIResult {
  buffer: Buffer;
  apiMs: number;
  cdnMs: number;
}

async function callMiniMaxMusicAPI(
  prompt: string,
  metadata: Record<string, unknown>,
): Promise<MusicAPIResult> {
  if (isCircuitOpen()) {
    throw new Error("MiniMax circuit breaker is open — too many consecutive failures");
  }

  const apiKey = config.MINIMAX_MUSIC_API_KEY || config.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("No MiniMax API key configured");

  const apiStart = Date.now();
  const res = await fetch("https://api.minimax.io/v1/music_generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "music-2.5",
      prompt,
      lyrics: "[instrumental]",
      audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
      output_format: "url",
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const apiMs = Date.now() - apiStart;

  if (!res.ok) throw new Error(`MiniMax music HTTP ${res.status}`);

  const json = (await res.json()) as {
    base_resp?: { status_code: number; status_msg: string };
    data?: { audio?: string };
  };

  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax music error: ${json.base_resp.status_msg}`);
  }

  const audioUrl = json.data?.audio;
  if (!audioUrl) throw new Error("No audio URL in response");

  const cdnStart = Date.now();
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!audioRes.ok) throw new Error(`CDN fetch failed: ${audioRes.status}`);

  const buffer = Buffer.from(await audioRes.arrayBuffer());
  const cdnMs = Date.now() - cdnStart;

  recordMusicUsage();

  try {
    tracer.llmobs.trace(
      { kind: "tool", name: "minimax.music_generation" },
      (span) => {
        tracer.llmobs.annotate(span, {
          inputData: JSON.stringify({ prompt, model: "music-2.5", ...metadata }),
          outputData: JSON.stringify({
            audioSizeBytes: buffer.length,
            format: "mp3",
            sampleRate: 44100,
            bitrate: 256000,
          }),
          metrics: { apiCallDurationMs: apiMs, cdnDownloadDurationMs: cdnMs, audioSizeBytes: buffer.length },
          tags: {
            "music.provider": "minimax",
            "music.model": "music-2.5",
            "music.format": "mp3",
            ...Object.fromEntries(
              Object.entries(metadata).map(([k, v]) => [`music.${k}`, String(v)])
            ),
          },
        });
      }
    );
  } catch { /* tracing failure should not affect music delivery */ }

  recordSuccess();
  return { buffer, apiMs, cdnMs };
}

function startGeneration(mood: SceneMood, variant: number) {
  const key = variantKey(mood, variant);
  const entry = getOrCreateEntry(key);
  const previousError = entry.error;
  if (!tryStartGeneration(entry, musicBufferCache.has(key), { maxRetries: MAX_SERVER_RETRIES, cooldownMs: RETRY_COOLDOWN_MS })) return;

  if (previousError) {
    logEvent("info", "music.retrying_after_failure", {
      mood,
      variant,
      previousError,
      retryCount: entry.retryCount,
      maxRetries: MAX_SERVER_RETRIES,
    });
  }

  logEvent("info", "music.generation_started", {
    mood,
    variant,
    model: "music-2.5",
    provider: "minimax",
  });

  void runGeneration(mood, variant);
}

async function runGeneration(mood: SceneMood, variant: number) {
  const key = variantKey(mood, variant);
  const entry = getOrCreateEntry(key);
  const overallStart = Date.now();
  const prompt = MOOD_PROMPTS[mood];
  let progressTimer: ReturnType<typeof setInterval> | undefined;

  try {
    progressTimer = setInterval(() => {
      logEvent("info", "music.generation_progress", {
        mood,
        variant,
        elapsedMs: Date.now() - overallStart,
        phase: "awaiting_api_response",
      });
    }, 30_000);

    const { buffer, apiMs, cdnMs } = await callMiniMaxMusicAPI(prompt, { mood, variant: String(variant) });
    musicBufferCache.set(key, buffer);

    // L2: fire-and-forget S3 persist
    const s3Key = buildMusicS3Key(mood, variant);
    s3Put(s3Key, buffer, "audio/mpeg", { mood, variant: String(variant), model: "music-2.5" })
      .catch((err) => logEvent("warn", "music.s3_cache_put_failed", { mood, variant, error: String(err) }));

    logEvent("info", "music.generation_completed", {
      mood,
      variant,
      generationDurationMs: Date.now() - overallStart,
      apiCallDurationMs: apiMs,
      cdnDownloadDurationMs: cdnMs,
      audioSizeBytes: buffer.length,
      audioSizeKB: Math.round(buffer.length / 1024),
    });
  } catch (err) {
    recordFailure();
    recordGenerationFailure(entry, String(err));

    logEvent(
      "error",
      "music.generation_failed",
      {
        mood,
        variant,
        durationMs: Date.now() - overallStart,
        failureType: "terminal",
      },
      err
    );
  } finally {
    clearInterval(progressTimer);
    entry.generating = false;
  }
}

// ── Random pool background generation ─────────────────────────────────────────

async function generateForRandomPool(): Promise<void> {
  if (randomPoolGenerating) return;
  randomPoolGenerating = true;

  const mood = VALID_MOODS[Math.floor(Math.random() * VALID_MOODS.length)];
  const prompt = MOOD_PROMPTS[mood];
  const trackId = randomUUID();
  const s3Key = `music/v1/pool-${mood}-${trackId}.mp3`;
  const overallStart = Date.now();

  logEvent("info", "music.random_pool_generation_started", { mood, trackId });

  try {
    const { buffer, apiMs, cdnMs } = await callMiniMaxMusicAPI(prompt, { mood, pool: "random" });

    await s3Put(s3Key, buffer, "audio/mpeg", { mood, model: "music-2.5", pool: "random" });

    logEvent("info", "music.random_pool_generation_completed", {
      mood,
      trackId,
      generationDurationMs: Date.now() - overallStart,
      apiCallDurationMs: apiMs,
      cdnDownloadDurationMs: cdnMs,
      audioSizeBytes: buffer.length,
    });
  } catch (err) {
    recordFailure();
    logEvent("error", "music.random_pool_generation_failed", { mood, trackId, error: String(err) }, err);
  } finally {
    randomPoolGenerating = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export type MusicResult =
  | { status: "ready"; audio: Buffer }
  | { status: "generating"; mood: SceneMood; startedAt: number }
  | { status: "retrying"; mood: SceneMood; startedAt: number }
  | { status: "error"; error: string; terminal: boolean };

/**
 * Get music for a given mood. Picks a random variant (1-5), checks L1→L2 cache,
 * falls back to any cached variant for the mood, then triggers generation.
 */
export async function getMusicForMood(mood: SceneMood): Promise<MusicResult> {
  const variant = Math.floor(Math.random() * MAX_VARIANTS) + 1;
  const key = variantKey(mood, variant);
  const entry = getOrCreateEntry(key);

  // L1: in-memory hit for chosen variant
  const cachedAudio = musicBufferCache.get(key);
  if (cachedAudio) {
    musicCacheHits++;
    tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'music', source: 'memory' });
    logEvent("info", "music.cache_hit", {
      route: "/api/music",
      mood,
      variant,
      source: "memory",
      audioSizeBytes: cachedAudio.length,
      cacheHits: musicCacheHits,
      cacheMisses: musicCacheMisses,
    });
    return { status: "ready", audio: cachedAudio };
  }

  // L2: check S3 for chosen variant (cold start)
  if (!entry.generating) {
    try {
      const s3Buf = await s3Get(buildMusicS3Key(mood, variant));
      if (s3Buf) {
        musicBufferCache.set(key, s3Buf);
        musicCacheHits++;
        tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'music', source: 's3' });
        logEvent("info", "music.cache_hit", {
          route: "/api/music",
          mood,
          variant,
          source: "s3",
          audioSizeBytes: s3Buf.length,
          cacheHits: musicCacheHits,
          cacheMisses: musicCacheMisses,
        });
        return { status: "ready", audio: s3Buf };
      }
    } catch (err) {
      logEvent("warn", "music.s3_cache_get_failed", { mood, variant, error: String(err) });
    }
  }

  // Fallback: try any other cached variant for this mood (L1 only for speed)
  for (let v = 1; v <= MAX_VARIANTS; v++) {
    if (v === variant) continue;
    const fallbackKey = variantKey(mood, v);
    const fallbackAudio = musicBufferCache.get(fallbackKey);
    if (fallbackAudio) {
      musicCacheHits++;
      tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'music', source: 'memory_fallback' });
      logEvent("info", "music.cache_hit", {
        route: "/api/music",
        mood,
        variant: v,
        source: "memory_fallback",
        requestedVariant: variant,
        audioSizeBytes: fallbackAudio.length,
        cacheHits: musicCacheHits,
        cacheMisses: musicCacheMisses,
      });
      return { status: "ready", audio: fallbackAudio };
    }
  }

  // Error state for chosen variant
  if (entry.error) {
    if (entry.retryCount >= MAX_SERVER_RETRIES) {
      logEvent("warn", "music.max_retries_exhausted", {
        route: "/api/music",
        mood,
        variant,
        error: entry.error,
        retryCount: entry.retryCount,
      });
      return { status: "error", error: entry.error, terminal: true };
    }
    if (entry.lastFailedAt && Date.now() - entry.lastFailedAt >= RETRY_COOLDOWN_MS) {
      startGeneration(mood, variant);
      logEvent("info", "music.retry_triggered", {
        route: "/api/music",
        mood,
        variant,
        retryCount: entry.retryCount,
        maxRetries: MAX_SERVER_RETRIES,
      });
      return { status: "retrying", mood, startedAt: entry.generationStartedAt ?? Date.now() };
    }
    logEvent("warn", "music.served_error", {
      route: "/api/music",
      mood,
      variant,
      error: entry.error,
    });
    return { status: "error", error: entry.error, terminal: false };
  }

  musicCacheMisses++;
  tracer.dogstatsd.increment('cache.miss', 1, { cache_type: 'music' });
  startGeneration(mood, variant);
  logEvent("info", "music.cache_miss", {
    route: "/api/music",
    mood,
    variant,
    generating: true,
    cacheHits: musicCacheHits,
    cacheMisses: musicCacheMisses,
    reason: "not_generated",
  });
  return { status: "generating", mood, startedAt: entry.generationStartedAt ?? Date.now() };
}

/**
 * Pick a random music track already cached in S3.
 * Returns the audio buffer or null if nothing is cached yet.
 */
export async function getRandomMusic(): Promise<Buffer | null> {
  try {
    const keys = await listKeys("music/v1/");

    // Grow the pool in the background when below minimum
    if (keys.length < MIN_RANDOM_POOL) {
      void generateForRandomPool();
    }

    if (keys.length === 0) return null;

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const buf = await s3Get(randomKey);
    if (buf) {
      logEvent("info", "music.random_served", {
        key: randomKey,
        audioSizeBytes: buf.length,
        totalCachedTracks: keys.length,
      });
    }
    return buf;
  } catch (err) {
    logEvent("warn", "music.random_failed", { error: String(err) });
    return null;
  }
}
