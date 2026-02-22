import tracer from "dd-trace";
import { config } from "./config.js";
import { logEvent } from "./logger.js";
import { buildKey, get as s3Get, put as s3Put, listKeys } from "./mediaCache.js";
import { recordMusicUsage } from "./usageTracker.js";
import { type SceneMood, VALID_MOODS } from "@ai-dm/shared-types";

export type { SceneMood };
export { VALID_MOODS };

// ── Mood prompts ──────────────────────────────────────────────────────────────

const MOOD_PROMPTS: Record<SceneMood, string> = {
  combat: "Epic orchestral fantasy battle, urgent drums, brass fanfare, instrumental, no vocals, fast tempo",
  tavern: "Medieval tavern folk music, lute, fiddle, warm acoustic, instrumental, no vocals, moderate tempo",
  mystery: "Dark ambient fantasy, ethereal pads, subtle strings, suspenseful, instrumental, no vocals, slow tempo",
  dramatic: "Cinematic orchestral fantasy, sweeping strings, emotional crescendo, instrumental, no vocals, moderate tempo",
  danger: "Ominous dark fantasy, deep drums, minor key strings, tension building, instrumental, no vocals, slow tempo",
};

function buildMusicS3Key(mood: SceneMood): string {
  return buildKey("music/v1", `music-2.5|${mood}|${MOOD_PROMPTS[mood]}`, "mp3");
}

// ── Per-mood in-memory cache ──────────────────────────────────────────────────

interface MoodCacheEntry {
  audio: Buffer | null;
  generating: boolean;
  error: string | null;
  lastFailedAt: number | null;
  retryCount: number;
  generationStartedAt: number | null;
}

const moodCache = new Map<SceneMood, MoodCacheEntry>();

const RETRY_COOLDOWN_MS = 30_000;
const MAX_SERVER_RETRIES = 3;

// ── Cache metrics ─────────────────────────────────────────────────────────────

let musicCacheHits = 0;
let musicCacheMisses = 0;

export function getMusicCacheStats() {
  const moods: Record<string, boolean> = {};
  for (const mood of VALID_MOODS) {
    moods[mood] = moodCache.get(mood)?.audio !== null;
  }
  return { hits: musicCacheHits, misses: musicCacheMisses, moods };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getOrCreateEntry(mood: SceneMood): MoodCacheEntry {
  let entry = moodCache.get(mood);
  if (!entry) {
    entry = { audio: null, generating: false, error: null, lastFailedAt: null, retryCount: 0, generationStartedAt: null };
    moodCache.set(mood, entry);
  }
  return entry;
}

function startGeneration(mood: SceneMood) {
  const entry = getOrCreateEntry(mood);
  if (entry.generating || entry.audio) return;
  if (entry.retryCount >= MAX_SERVER_RETRIES) return;
  if (entry.error && entry.lastFailedAt && Date.now() - entry.lastFailedAt < RETRY_COOLDOWN_MS) return;
  if (entry.error) {
    entry.retryCount++;
    logEvent("info", "music.retrying_after_failure", {
      mood,
      previousError: entry.error,
      retryCount: entry.retryCount,
      maxRetries: MAX_SERVER_RETRIES,
    });
    entry.error = null;
  }
  entry.generating = true;
  entry.generationStartedAt = Date.now();

  logEvent("info", "music.generation_started", {
    mood,
    model: "music-2.5",
    provider: "minimax",
  });

  void runGeneration(mood);
}

async function runGeneration(mood: SceneMood) {
  const entry = getOrCreateEntry(mood);
  const overallStart = Date.now();
  const prompt = MOOD_PROMPTS[mood];
  let apiCallDurationMs: number | null = null;
  let cdnDownloadDurationMs: number | null = null;
  let progressTimer: ReturnType<typeof setInterval> | undefined;

  try {
    const apiKey = config.MINIMAX_MUSIC_API_KEY || config.MINIMAX_API_KEY;

    const apiStart = Date.now();
    progressTimer = setInterval(() => {
      logEvent("info", "music.generation_progress", {
        mood,
        elapsedMs: Date.now() - apiStart,
        phase: "awaiting_api_response",
      });
    }, 30_000);
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
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: "mp3",
        },
        output_format: "url",
      }),
      signal: AbortSignal.timeout(90_000),
    });
    apiCallDurationMs = Date.now() - apiStart;

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
    const audioRes = await fetch(audioUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!audioRes.ok) throw new Error(`CDN fetch failed: ${audioRes.status}`);

    entry.audio = Buffer.from(await audioRes.arrayBuffer());
    cdnDownloadDurationMs = Date.now() - cdnStart;

    // L2: fire-and-forget S3 persist
    s3Put(buildMusicS3Key(mood), entry.audio, "audio/mpeg", { mood, model: "music-2.5" })
      .catch((err) => logEvent("warn", "music.s3_cache_put_failed", { mood, error: String(err) }));

    const generationDurationMs = Date.now() - overallStart;
    const audioSizeBytes = entry.audio.length;
    recordMusicUsage();

    try {
      tracer.llmobs.trace(
        { kind: "tool", name: "minimax.music_generation" },
        (span) => {
          tracer.llmobs.annotate(span, {
            inputData: JSON.stringify({ prompt, model: "music-2.5", mood }),
            outputData: JSON.stringify({
              audioSizeBytes,
              format: "mp3",
              sampleRate: 44100,
              bitrate: 256000,
            }),
            metrics: {
              generationDurationMs,
              apiCallDurationMs: apiCallDurationMs ?? 0,
              cdnDownloadDurationMs: cdnDownloadDurationMs ?? 0,
              audioSizeBytes,
            },
            tags: {
              "music.provider": "minimax",
              "music.model": "music-2.5",
              "music.format": "mp3",
              "music.mood": mood,
            },
          });
        }
      );
    } catch { /* tracing failure should not affect music delivery */ }

    logEvent("info", "music.generation_completed", {
      mood,
      generationDurationMs,
      apiCallDurationMs,
      cdnDownloadDurationMs,
      audioSizeBytes,
      audioSizeKB: Math.round(audioSizeBytes / 1024),
    });
  } catch (err) {
    entry.error = String(err);
    entry.lastFailedAt = Date.now();
    const totalMs = Date.now() - overallStart;

    try {
      tracer.llmobs.trace(
        { kind: "tool", name: "minimax.music_generation" },
        (span) => {
          tracer.llmobs.annotate(span, {
            inputData: JSON.stringify({ prompt, model: "music-2.5", mood }),
            outputData: JSON.stringify({ error: entry.error }),
            tags: {
              "music.provider": "minimax",
              "music.model": "music-2.5",
              "music.error": "true",
              "music.mood": mood,
            },
          });
        }
      );
    } catch { /* tracing failure should not affect error reporting */ }

    logEvent(
      "error",
      "music.generation_failed",
      {
        mood,
        durationMs: totalMs,
        apiCallDurationMs,
        cdnDownloadDurationMs,
        failureType: "terminal",
      },
      err
    );
  } finally {
    clearInterval(progressTimer);
    entry.generating = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export type MusicResult =
  | { status: "ready"; audio: Buffer }
  | { status: "generating"; mood: SceneMood; startedAt: number }
  | { status: "retrying"; mood: SceneMood; startedAt: number }
  | { status: "error"; error: string; terminal: boolean };

/**
 * Get music for a given mood. Manages in-memory + S3 caching, retry logic, and
 * background generation via MiniMax music API.
 *
 * Returns:
 *   - { status: "ready", audio }      — cached audio available, serve immediately
 *   - { status: "generating", mood }  — generation in progress, client should retry
 *   - { status: "retrying", mood }    — previously failed, retry kicked off
 *   - { status: "error", error, terminal } — failed; terminal=true means max retries exhausted
 */
export async function getMusicForMood(mood: SceneMood): Promise<MusicResult> {
  const entry = getOrCreateEntry(mood);

  // L2: check S3 on cold start (no L1 audio and not currently generating)
  if (!entry.audio && !entry.generating) {
    try {
      const s3Buf = await s3Get(buildMusicS3Key(mood));
      if (s3Buf) {
        entry.audio = s3Buf;
        musicCacheHits++;
        tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'music', source: 's3' });
        logEvent("info", "music.cache_hit", {
          route: "/api/music",
          mood,
          source: "s3",
          audioSizeBytes: s3Buf.length,
          cacheHits: musicCacheHits,
          cacheMisses: musicCacheMisses,
        });
        return { status: "ready", audio: entry.audio };
      }
    } catch (err) {
      logEvent("warn", "music.s3_cache_get_failed", { mood, error: String(err) });
    }
  }

  // L1: in-memory hit
  if (entry.audio) {
    musicCacheHits++;
    tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'music', source: 'memory' });
    logEvent("info", "music.cache_hit", {
      route: "/api/music",
      mood,
      source: "memory",
      audioSizeBytes: entry.audio.length,
      cacheHits: musicCacheHits,
      cacheMisses: musicCacheMisses,
    });
    return { status: "ready", audio: entry.audio };
  }

  if (entry.error) {
    if (entry.retryCount >= MAX_SERVER_RETRIES) {
      logEvent("warn", "music.max_retries_exhausted", {
        route: "/api/music",
        mood,
        error: entry.error,
        retryCount: entry.retryCount,
      });
      return { status: "error", error: entry.error, terminal: true };
    }
    if (entry.lastFailedAt && Date.now() - entry.lastFailedAt >= RETRY_COOLDOWN_MS) {
      startGeneration(mood);
      logEvent("info", "music.retry_triggered", {
        route: "/api/music",
        mood,
        retryCount: entry.retryCount,
        maxRetries: MAX_SERVER_RETRIES,
      });
      return { status: "retrying", mood, startedAt: entry.generationStartedAt ?? Date.now() };
    }
    logEvent("warn", "music.served_error", {
      route: "/api/music",
      mood,
      error: entry.error,
    });
    return { status: "error", error: entry.error, terminal: false };
  }

  musicCacheMisses++;
  tracer.dogstatsd.increment('cache.miss', 1, { cache_type: 'music' });
  startGeneration(mood);
  logEvent("info", "music.cache_miss", {
    route: "/api/music",
    mood,
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
