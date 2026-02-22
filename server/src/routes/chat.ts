import { Router } from "express";
import { streamBedrockResponse } from "../services/bedrock.js";
import {
  getOrCreate,
  appendMessage,
  getWindowedHistory,
  getCharacterClass,
  getPronouns,
} from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";
import { recordBedrockUsage } from "../services/usageTracker.js";
import { stripTTSTags, extractMood, extractScene } from "../services/tts.js";
import { buildLoreContext } from "../services/rag.js";
import { queueBedrockCall, isBedrockQueueOverloaded } from "../services/bedrockQueue.js";

const router = Router();

router.post("/api/chat", async (req, res) => {
  const body = req.body as {
    conversationId?: string;
    message?: unknown;
    isSystemTrigger?: boolean;
    characterClass?: string;
    pronouns?: string;
  };
  const message = typeof body.message === "string" ? body.message : "";
  const isSystemTrigger = Boolean(body.isSystemTrigger);
  const characterClass = typeof body.characterClass === "string" ? body.characterClass.trim() : undefined;
  const pronouns = typeof body.pronouns === "string" ? body.pronouns.trim() : undefined;
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

  // Backpressure: return 503 early when Bedrock queue is overloaded
  if (isBedrockQueueOverloaded()) {
    logEvent("warn", "chat.queue_overloaded", {
      requestId,
      route: "/api/chat",
    });
    res.status(503).json({ error: "Server busy, try again shortly", requestId });
    return;
  }

  const conversation = await getOrCreate(body.conversationId, characterClass, pronouns);

  // System triggers (opening monologue) are sent to Bedrock but not stored
  // in history as player messages — keeps conversation context clean
  if (!isSystemTrigger) {
    await appendMessage(conversation.id, { role: "user", content: message });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // First event sends conversationId so client can track the session
  res.write(`data: ${JSON.stringify({ conversationId: conversation.id })}\n\n`);

  const history = await getWindowedHistory(conversation.id);
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
    // RAG: extract entities from user message and retrieve matching lore
    const loreContext = await buildLoreContext(message);
    const resolvedClass = characterClass || (await getCharacterClass(conversation.id));
    const resolvedPronouns = pronouns || (await getPronouns(conversation.id));
    const result = await queueBedrockCall(() =>
      streamBedrockResponse(
        bedrockMessages,
        (chunk) => {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        },
        { characterClass: resolvedClass, pronouns: resolvedPronouns, loreContext }
      )
    );
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

    // Categorize error for user-friendly message
    let userError = "The Dungeon Master encountered an error. Please try again.";
    if (err instanceof Error) {
      if (err.message.includes("security token") || err.message.includes("credential") || err.name === "UnrecognizedClientException") {
        userError = "The server's connection to the AI service is misconfigured. Please contact the administrator.";
      } else if (err.message.includes("timed out") || err.name === "AbortError") {
        userError = "The Dungeon Master took too long to respond. Please try again.";
      } else if (err.message.includes("throttl") || err.name === "ThrottlingException") {
        userError = "Too many adventurers! The Dungeon Master is overwhelmed. Please try again shortly.";
      }
    }
    res.write(
      `data: ${JSON.stringify({
        error: userError,
        requestId,
      })}\n\n`
    );
  }

  // Emit tagged text for client TTS consumption, then usage, before [DONE]
  if (!streamErrored && fullText) {
    const [mood] = extractMood(fullText);
    const [scene] = extractScene(fullText);
    res.write(`data: ${JSON.stringify({ ttsText: fullText, mood: mood ?? undefined, scene: scene ?? undefined })}\n\n`);

    const costUsd = recordBedrockUsage(conversation.id, "chat", inputTokens, outputTokens);
    res.write(`data: ${JSON.stringify({
      usage: { inputTokens, outputTokens, costUsd, model: "bedrock-haiku", feature: "chat" },
    })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();

  // Persist assistant response after stream completes (stripped of TTS tags)
  if (fullText) {
    await appendMessage(conversation.id, { role: "assistant", content: stripTTSTags(fullText) });
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
