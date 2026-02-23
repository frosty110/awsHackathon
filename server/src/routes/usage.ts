import { Router } from "express";
import { getGlobalUsage, getConversationUsage } from "../services/usageTracker.js";
import { getTTSCacheStats } from "../services/tts.js";
import { getLoreCacheStats } from "../services/rag.js";
import { getMusicCacheStats } from "../routes/music.js";
import { getSceneVideoStats } from "../services/videoGenerator.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/api/usage", requireAuth, (req, res) => {
  const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId : null;
  const global = getGlobalUsage();
  const conversation = conversationId ? getConversationUsage(conversationId) : null;
  const caches = {
    tts: getTTSCacheStats(),
    lore: getLoreCacheStats(),
    music: getMusicCacheStats(),
    video: getSceneVideoStats(),
  };
  res.json({ global, conversation, caches });
});

export default router;
