import { Router } from "express";
import { streamBedrockResponse } from "../services/bedrock.js";
import {
  getOrCreate,
  appendMessage,
  getWindowedHistory,
  getCharacterClass,
} from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";
import { recordBedrockUsage } from "../services/usageTracker.js";
import { stripTTSTags } from "../services/tts.js";

const router = Router();

router.post("/api/chat", async (req, res) => {
  const body = req.body as {
    conversationId?: string;
    message?: unknown;
    isSystemTrigger?: boolean;
    characterClass?: string;
  };
  const message = typeof body.message === "string" ? body.message : "";
  const isSystemTrigger = Boolean(body.isSystemTrigger);
  const characterClass = typeof body.characterClass === "string" ? body.characterClass.trim() : undefined;
  const requestId = buildRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", requestId);
  logEvent("info", "chat.request_received", {
    requestId,
    route: "/api/chat",
    conversationId: body.conversationId ?? null,
    isSystemTrigger,
    messageLength: message.length,
  });

  if (!message.trim()) {
    logEvent("warn", "chat.validation_failed", {
      requestId,
      route: "/api/chat",
      reason: "message_missing",
    });
    res.status(400).json({ error: "message is required", requestId });
    return;
  }

  const conversation = getOrCreate(body.conversationId, characterClass);

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
  let streamErrored = false;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const resolvedClass = characterClass || getCharacterClass(conversation.id);
    const result = await streamBedrockResponse(bedrockMessages, (chunk) => {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }, { characterClass: resolvedClass });
    fullText = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (err) {
    streamErrored = true;
    logEvent(
      "error",
      "chat.bedrock_stream_failed",
      {
        requestId,
        route: "/api/chat",
        conversationId: conversation.id,
        messageLength: message.length,
        isSystemTrigger: Boolean(isSystemTrigger),
        failureType: "recoverable_stream_error",
      },
      err
    );
    res.write(
      `data: ${JSON.stringify({
        error: "Bedrock stream failed",
        requestId,
      })}\n\n`
    );
  }

  // Emit tagged text for client TTS consumption, then usage, before [DONE]
  if (!streamErrored && fullText) {
    res.write(`data: ${JSON.stringify({ ttsText: fullText })}\n\n`);

    const costUsd = recordBedrockUsage(conversation.id, "chat", inputTokens, outputTokens);
    res.write(`data: ${JSON.stringify({
      usage: { inputTokens, outputTokens, costUsd, model: "bedrock-haiku", feature: "chat" },
    })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();

  // Persist assistant response after stream completes (stripped of TTS tags)
  if (fullText) {
    appendMessage(conversation.id, { role: "assistant", content: stripTTSTags(fullText) });
    logEvent("info", "chat.stream_completed", {
      requestId,
      route: "/api/chat",
      conversationId: conversation.id,
      responseLength: fullText.length,
    });
    return;
  }

  if (!streamErrored) {
    logEvent("warn", "chat.empty_assistant_response", {
      requestId,
      route: "/api/chat",
      conversationId: conversation.id,
    });
  }
});

export default router;
