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

// Timing metrics
let generationStartedAt: number | null = null;
let generationCompletedAt: number | null = null;
let generationDurationMs: number | null = null;
let cdnDownloadDurationMs: number | null = null;
let apiCallDurationMs: number | null = null;
let audioSizeBytes: number | null = null;

// Kick off generation in the background immediately on first request
function startGeneration() {
  if (generating || cachedAudio || generationError) return;
  generating = true;
  generationStartedAt = Date.now();

  logEvent("info", "music.generation_started", {
    model: "music-2.5",
    provider: "minimax",
  });

  void tracer.llmobs.trace(
    { kind: "tool", name: "minimax.music_generation" },
    async (span) => {
      const overallStart = Date.now();

      try {
        const apiKey = config.MINIMAX_MUSIC_API_KEY || config.MINIMAX_API_KEY;
        const prompt =
          "Epic orchestral fantasy, dark dungeon, ambient, instrumental, no vocals, slow tempo";

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

        tracer.llmobs.annotate(span, {
          inputData: JSON.stringify({ prompt, model: "music-2.5" }),
          outputData: JSON.stringify({
            audioSizeBytes,
            format: "mp3",
            sampleRate: 44100,
            bitrate: 256000,
          }),
          metrics: {
            generationDurationMs,
            apiCallDurationMs,
            cdnDownloadDurationMs,
            audioSizeBytes,
          },
          tags: {
            "music.provider": "minimax",
            "music.model": "music-2.5",
            "music.format": "mp3",
          },
        });

        logEvent("info", "music.generation_completed", {
          generationDurationMs,
          apiCallDurationMs,
          cdnDownloadDurationMs,
          audioSizeBytes,
          audioSizeKB: Math.round(audioSizeBytes / 1024),
        });
      } catch (err) {
        generationError = String(err);
        const totalMs = Date.now() - overallStart;

        tracer.llmobs.annotate(span, {
          inputData: JSON.stringify({
            prompt:
              "Epic orchestral fantasy, dark dungeon, ambient, instrumental, no vocals, slow tempo",
            model: "music-2.5",
          }),
          outputData: JSON.stringify({ error: generationError }),
          tags: {
            "music.provider": "minimax",
            "music.model": "music-2.5",
            "music.error": "true",
          },
        });

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
  );
}

router.get(["/music", "/api/music"], (req, res) => {
  if (!config.MINIMAX_MUSIC_API_KEY && !config.MINIMAX_API_KEY) {
    logEvent("warn", "music.not_configured", { route: "/api/music" });
    res.status(503).json({ error: "Music not configured" });
    return;
  }

  if (cachedAudio) {
    logEvent("info", "music.served_from_cache", {
      route: "/api/music",
      audioSizeBytes,
      generationDurationMs,
    });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(cachedAudio);
    return;
  }

  if (generationError) {
    logEvent("warn", "music.served_error", {
      route: "/api/music",
      error: generationError,
    });
    res.status(500).json({ error: generationError });
    return;
  }

  // Trigger generation if not already running, tell client to poll
  startGeneration();
  logEvent("info", "music.client_polling", {
    route: "/api/music",
    generating: true,
  });
  res.status(202).json({ status: "generating" });
});

export default router;
