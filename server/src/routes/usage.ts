import { Router } from "express";
import { getGlobalUsage, getConversationUsage, getUserUsage } from "../services/usageTracker.js";
import { getTTSCacheStats } from "../services/tts.js";
import { getLoreCacheStats } from "../services/rag.js";
import { getMusicCacheStats } from "../services/musicService.js";
import { getSceneVideoStats } from "../services/videoGenerator.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

router.get("/api/usage", requireAuth, (req: AuthenticatedRequest, res) => {
  const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId : null;
  const global = getGlobalUsage();
  const conversation = conversationId ? getConversationUsage(conversationId) : null;
  // Security: use req.userId from JWT — NOT a query parameter — to prevent
  // users from viewing other users' cost data.
  const user = req.userId ? getUserUsage(req.userId) : null;
  const caches = {
    tts: getTTSCacheStats(),
    lore: getLoreCacheStats(),
    music: getMusicCacheStats(),
    video: getSceneVideoStats(),
  };
  res.json({ global, conversation, user, caches });
});

export default router;
