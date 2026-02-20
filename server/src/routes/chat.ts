import { Router } from "express";
import { streamBedrockChunks } from "../services/bedrock.js";
import {
  getOrCreate,
  appendMessage,
  getWindowedHistory,
} from "../services/conversationStore.js";

const router = Router();

router.post("/api/chat", async (req, res) => {
  const { conversationId, message, isSystemTrigger } = req.body as {
    conversationId?: string;
    message: string;
    isSystemTrigger?: boolean;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const conversation = getOrCreate(conversationId);

  // System triggers (opening monologue) are sent to Bedrock but not stored
  // in history as player messages — keeps conversation context clean
  if (!isSystemTrigger) {
    appendMessage(conversation.id, { role: "user", content: message });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // First event sends conversationId so client can track the session
  res.write(`data: ${JSON.stringify({ conversationId: conversation.id })}\n\n`);

  const history = getWindowedHistory(conversation.id);
  // System triggers aren't stored in history, so we must include the message
  // directly in the Bedrock call so there's at least one user turn.
  const bedrockMessages = isSystemTrigger
    ? [...history, { role: "user" as const, content: message }]
    : history;
  let fullText = "";

  try {
    for await (const chunk of streamBedrockChunks(bedrockMessages)) {
      fullText += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: "Bedrock stream failed" })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();

  // Persist assistant response after stream completes
  if (fullText) {
    appendMessage(conversation.id, { role: "assistant", content: fullText });
  }
});

export default router;
