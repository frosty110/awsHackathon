import { Router } from "express";
import { getGlobalUsage, getConversationUsage } from "../services/usageTracker.js";

const router = Router();

router.get("/api/usage", (req, res) => {
  const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId : null;
  const global = getGlobalUsage();
  const conversation = conversationId ? getConversationUsage(conversationId) : null;
  res.json({ global, conversation });
});

export default router;
