import { Router } from "express";
import { config } from "../services/config.js";

const router = Router();

// Cache the generated audio buffer for the server lifetime — generation is slow (~30-60s)
let cachedAudio: Buffer | null = null;
let generationError: string | null = null;
let generating = false;

// Kick off generation in the background immediately on first request
function startGeneration() {
  if (generating || cachedAudio || generationError) return;
  generating = true;
  console.log("[music] starting background generation...");

  (async () => {
    try {
      const apiKey = config.MINIMAX_MUSIC_API_KEY || config.MINIMAX_API_KEY;
      const res = await fetch("https://api.minimax.io/v1/music_generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "music-2.5",
          prompt: "Epic orchestral fantasy, dark dungeon, ambient, instrumental, no vocals, slow tempo",
          lyrics: "[instrumental]",
          audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
          output_format: "url",
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!res.ok) throw new Error(`MiniMax music HTTP ${res.status}`);

      const json = (await res.json()) as {
        base_resp?: { status_code: number; status_msg: string };
        data?: { audio?: string };
      };

      console.log("[music] API response:", JSON.stringify(json).slice(0, 300));

      if (json.base_resp && json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax music error: ${json.base_resp.status_msg}`);
      }

      const audioUrl = json.data?.audio;
      if (!audioUrl) throw new Error("No audio URL in response");

      console.log("[music] downloading from CDN:", audioUrl.slice(0, 80));
      const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
      if (!audioRes.ok) throw new Error(`CDN fetch failed: ${audioRes.status}`);

      cachedAudio = Buffer.from(await audioRes.arrayBuffer());
      console.log(`[music] ready — ${(cachedAudio.length / 1024).toFixed(0)} KB`);
    } catch (err) {
      generationError = String(err);
      console.error("[music] generation failed:", err);
    } finally {
      generating = false;
    }
  })();
}

router.get(["/music", "/api/music"], (req, res) => {
  if (!config.MINIMAX_MUSIC_API_KEY && !config.MINIMAX_API_KEY) {
    res.status(503).json({ error: "Music not configured" });
    return;
  }

  if (cachedAudio) {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(cachedAudio);
    return;
  }

  if (generationError) {
    res.status(500).json({ error: generationError });
    return;
  }

  // Trigger generation if not already running, tell client to poll
  startGeneration();
  res.status(202).json({ status: "generating" });
});

export default router;
