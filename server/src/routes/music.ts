import tracer from "dd-trace";
import { Router } from "express";
import { config } from "../services/config.js";
import { logEvent } from "../services/logger.js";
import { recordMusicUsage } from "../services/usageTracker.js";

const router = Router();

// Cache the generated audio buffer for the server lifetime — generation is slow (~30-60s)
let cachedAudio: Buffer | null = null;
let generationError: string | null = null;
let generating = false;
let lastFailedAt: number | null = null;
const RETRY_COOLDOWN_MS = 30_000; // wait 30s before retrying after a failure

// Cache metrics
let musicCacheHits = 0;
let musicCacheMisses = 0;

export function getMusicCacheStats() {
  return { hits: musicCacheHits, misses: musicCacheMisses, cached: cachedAudio !== null };
}

// Timing metrics
let generationStartedAt: number | null = null;
let generationCompletedAt: number | null = null;
let generationDurationMs: number | null = null;
let cdnDownloadDurationMs: number | null = null;
let apiCallDurationMs: number | null = null;
let audioSizeBytes: number | null = null;

// Kick off generation in the background immediately on first request
function startGeneration() {
  if (generating || cachedAudio) return;
  // Allow retry after cooldown period
  if (generationError && lastFailedAt && Date.now() - lastFailedAt < RETRY_COOLDOWN_MS) return;
  if (generationError) {
    logEvent("info", "music.retrying_after_failure", { previousError: generationError });
    generationError = null;
  }
  generating = true;
  generationStartedAt = Date.now();

  logEvent("info", "music.generation_started", {
    model: "music-2.5",
    provider: "minimax",
  });

  // Run generation logic directly — don't gate control flow on dd-trace callback
  void runGeneration();
}

async function runGeneration() {
  const overallStart = Date.now();
  const prompt =
    "Epic orchestral fantasy, dark dungeon, ambient, instrumental, no vocals, slow tempo";

  try {
    const apiKey = config.MINIMAX_MUSIC_API_KEY || config.MINIMAX_API_KEY;

    // --- MiniMax API call ---
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
      throw new Error(
        `MiniMax music error: ${json.base_resp.status_msg}`
      );
    }

    const audioUrl = json.data?.audio;
    if (!audioUrl) throw new Error("No audio URL in response");

    // --- CDN download ---
    const cdnStart = Date.now();
    const audioRes = await fetch(audioUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!audioRes.ok)
      throw new Error(`CDN fetch failed: ${audioRes.status}`);

    cachedAudio = Buffer.from(await audioRes.arrayBuffer());
    cdnDownloadDurationMs = Date.now() - cdnStart;

    // Finalize timing
    generationCompletedAt = Date.now();
    generationDurationMs = generationCompletedAt - overallStart;
    audioSizeBytes = cachedAudio.length;
    recordMusicUsage();

    // Annotate dd-trace span (best-effort, don't let it break generation)
    try {
      tracer.llmobs.trace(
        { kind: "tool", name: "minimax.music_generation" },
        (span) => {
          tracer.llmobs.annotate(span, {
            inputData: JSON.stringify({ prompt, model: "music-2.5" }),
            outputData: JSON.stringify({
              audioSizeBytes,
              format: "mp3",
              sampleRate: 44100,
              bitrate: 256000,
            }),
            metrics: {
              generationDurationMs: generationDurationMs ?? 0,
              apiCallDurationMs: apiCallDurationMs ?? 0,
              cdnDownloadDurationMs: cdnDownloadDurationMs ?? 0,
              audioSizeBytes: audioSizeBytes ?? 0,
            },
            tags: {
              "music.provider": "minimax",
              "music.model": "music-2.5",
              "music.format": "mp3",
            },
          });
        }
      );
    } catch { /* tracing failure should not affect music delivery */ }

    logEvent("info", "music.generation_completed", {
      generationDurationMs,
      apiCallDurationMs,
      cdnDownloadDurationMs,
      audioSizeBytes,
      audioSizeKB: Math.round(audioSizeBytes / 1024),
    });
  } catch (err) {
    generationError = String(err);
    lastFailedAt = Date.now();
    const totalMs = Date.now() - overallStart;

    try {
      tracer.llmobs.trace(
        { kind: "tool", name: "minimax.music_generation" },
        (span) => {
          tracer.llmobs.annotate(span, {
            inputData: JSON.stringify({ prompt, model: "music-2.5" }),
            outputData: JSON.stringify({ error: generationError }),
            tags: {
              "music.provider": "minimax",
              "music.model": "music-2.5",
              "music.error": "true",
            },
          });
        }
      );
    } catch { /* tracing failure should not affect error reporting */ }

    logEvent(
      "error",
      "music.generation_failed",
      {
        durationMs: totalMs,
        apiCallDurationMs,
        cdnDownloadDurationMs,
        failureType: "terminal",
      },
      err
    );
  } finally {
    generating = false;
  }
}

router.get(["/music", "/api/music"], (req, res) => {
  if (!config.MINIMAX_MUSIC_API_KEY && !config.MINIMAX_API_KEY) {
    logEvent("warn", "music.not_configured", { route: "/api/music" });
    res.status(503).json({ error: "Music not configured" });
    return;
  }

  if (cachedAudio) {
    musicCacheHits++;
    logEvent("info", "music.cache_hit", {
      route: "/api/music",
      audioSizeBytes,
      generationDurationMs,
      cacheHits: musicCacheHits,
      cacheMisses: musicCacheMisses,
    });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(cachedAudio);
    return;
  }

  if (generationError) {
    // If cooldown has passed, retry instead of serving stale error
    if (lastFailedAt && Date.now() - lastFailedAt >= RETRY_COOLDOWN_MS) {
      startGeneration();
      logEvent("info", "music.retry_triggered", { route: "/api/music" });
      res.status(202).json({ status: "generating" });
      return;
    }
    logEvent("warn", "music.served_error", {
      route: "/api/music",
      error: generationError,
    });
    res.status(500).json({ error: generationError });
    return;
  }

  // Trigger generation if not already running, tell client to poll
  musicCacheMisses++;
  startGeneration();
  logEvent("info", "music.cache_miss", {
    route: "/api/music",
    generating: true,
    cacheHits: musicCacheHits,
    cacheMisses: musicCacheMisses,
    reason: "not_generated",
  });
  res.status(202).json({ status: "generating" });
});

export default router;
