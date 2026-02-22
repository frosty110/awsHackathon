import { Router } from "express";
import tracer from "dd-trace";
import { config } from "../services/config.js";
import { logEvent } from "../services/logger.js";
import { getOrCreateEntry, startGeneration, tryLoadFromS3 } from "../services/videoGenerator.js";
import { type SceneId, VALID_SCENES } from "@ai-dm/shared-types";

const router = Router();

const MAX_RETRIES = 2;
const RETRY_COOLDOWN_MS = 60_000;

router.get(["/scene-video", "/api/scene-video"], async (req, res) => {
  if (!config.MINIMAX_API_KEY) {
    logEvent("warn", "video.not_configured", { route: "/api/scene-video" });
    res.status(503).json({ error: "Video not configured" });
    return;
  }

  const rawScene = typeof req.query.scene === "string" ? req.query.scene : "";
  if (!VALID_SCENES.includes(rawScene as SceneId)) {
    res.status(400).json({ error: "Invalid scene" });
    return;
  }
  const scene = rawScene as SceneId;

  const entry = getOrCreateEntry(scene);

  // L2: check S3 on cold start (no L1 and not currently generating)
  if (!entry.video && !entry.generating) {
    await tryLoadFromS3(scene);
  }

  if (entry.video) {
    tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'video', source: 'memory' });
    logEvent("info", "video.cache_hit", {
      route: "/api/scene-video",
      scene,
      videoSizeBytes: entry.video.length,
    });
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", entry.video.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(entry.video);
    return;
  }

  if (entry.error) {
    if (entry.retryCount >= MAX_RETRIES) {
      logEvent("warn", "video.max_retries_exhausted", {
        route: "/api/scene-video",
        scene,
        error: entry.error,
        retryCount: entry.retryCount,
      });
      res.status(500).json({ error: entry.error, terminal: true });
      return;
    }
    if (entry.lastFailedAt && Date.now() - entry.lastFailedAt >= RETRY_COOLDOWN_MS) {
      startGeneration(scene);
      logEvent("info", "video.retry_triggered", {
        route: "/api/scene-video",
        scene,
        retryCount: entry.retryCount,
      });
      res.status(202).json({ status: "generating", scene, startedAt: entry.generationStartedAt ?? Date.now() });
      return;
    }
    logEvent("warn", "video.served_error", {
      route: "/api/scene-video",
      scene,
      error: entry.error,
    });
    res.status(500).json({ error: entry.error });
    return;
  }

  startGeneration(scene);
  tracer.dogstatsd.increment('cache.miss', 1, { cache_type: 'video' });
  logEvent("info", "video.cache_miss", {
    route: "/api/scene-video",
    scene,
    generating: true,
    reason: "not_generated",
  });
  res.status(202).json({ status: "generating", scene, startedAt: entry.generationStartedAt ?? Date.now() });
});

export default router;
