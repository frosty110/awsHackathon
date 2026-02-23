import { Router } from "express";
import {
  getOrCreate,
  appendMessage,
  ConversationOwnershipError,
  type Conversation,
} from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";
import { recordBedrockUsage } from "../services/usageTracker.js";
import { extractMood, extractScene } from "../services/tts.js";
import { isBedrockQueueOverloaded } from "../services/bedrockQueue.js";
import { sanitizeUserInput, validateCharacterClass, sanitizePronouns } from "../services/inputSanitizer.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { activeSSEStreams } from "../services/activeStreams.js";
import { executeDmTurn } from "../services/dmTurn.js";

const router = Router();

router.post("/api/chat", async (req: AuthenticatedRequest, res) => {
  const body = req.body as {
    conversationId?: string;
    message?: unknown;
    characterClass?: string;
    pronouns?: string;
  };
  const message = sanitizeUserInput(typeof body.message === "string" ? body.message : "");

  // M4: Validate conversationId format (must be UUID if provided)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (body.conversationId && !UUID_RE.test(body.conversationId)) {
    res.status(400).json({ error: "Invalid conversationId format" });
    return;
  }

  const characterClass = validateCharacterClass(body.characterClass);
  // If characterClass was provided but failed validation, reject the request
  if (body.characterClass && !characterClass) {
    res.status(400).json({ error: "Invalid characterClass" });
    return;
  }

  const pronouns = sanitizePronouns(body.pronouns);
  const requestId = buildRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", requestId);
  logEvent("info", "chat.request_received", {
    requestId,
    route: "/api/chat",
    conversationId: body.conversationId ?? null,
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

  let conversation: Conversation;
  try {
    conversation = await getOrCreate(body.conversationId, req.userId, characterClass, pronouns);
  } catch (err) {
    if (err instanceof ConversationOwnershipError) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    throw err;
  }

  // Always store user message in conversation history (Redis + local object)
  const userMessage = { role: "user" as const, content: message };
  await appendMessage(conversation.id, userMessage);
  // Also update local copy so conversation.history.slice() below is accurate
  conversation.history.push(userMessage);
  if (conversation.history.length > 100) conversation.history = conversation.history.slice(-100);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Track this SSE response for graceful shutdown notification
  activeSSEStreams.add(res);

  // M1: Detect client disconnect to abort SSE writes
  let clientDisconnected = false;
  req.on("close", () => {
    clientDisconnected = true;
    activeSSEStreams.delete(res);
  });

  // SSE helper: checks res.write() return value for backpressure.
  // Returns false when the TCP send buffer is full (slow client).
  // The Bedrock stream is short-lived enough that kernel buffering handles
  // temporary backup — we log but continue rather than doing a risky async
  // callback refactor of the moodStreamDetector sync callback chain.
  function checkedWrite(data: unknown): boolean {
    if (clientDisconnected) return false;
    const ok = res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (!ok) {
      logEvent("warn", "chat.sse_backpressure", { conversationId: conversation.id });
    }
    return ok;
  }

  // First event sends conversationId so client can track the session
  checkedWrite({ conversationId: conversation.id });

  // Use local conversation object for windowed history — we already have the full
  // history from getOrCreate + appendMessage(user), so no extra Redis read needed.
  const history = conversation.history.slice(-12);

  let fullText = "";
  let streamErrored = false;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // Read characterClass and pronouns from local conversation object instead
    // of making separate Redis calls (saves 2 round-trips per chat turn).
    const resolvedClass = characterClass || conversation.characterClass;
    const resolvedPronouns = pronouns || conversation.pronouns;
    const turnResult = await executeDmTurn(
      conversation,
      message,
      history,
      {
        onText: (text) => { checkedWrite({ text }); },
        onMoodChange: (mood) => { checkedWrite({ moodChange: mood }); },
      },
      { characterClass: resolvedClass, pronouns: resolvedPronouns }
    );
    fullText = turnResult.fullText;
    inputTokens = turnResult.inputTokens;
    outputTokens = turnResult.outputTokens;
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
    checkedWrite({ error: userError, requestId });
  }

  // M1: If client disconnected during streaming, skip final writes
  if (clientDisconnected) {
    activeSSEStreams.delete(res);
    res.end();
  } else {
    // Emit tagged text for client TTS consumption, then usage, before [DONE]
    if (!streamErrored && fullText) {
      const [mood] = extractMood(fullText);
      const [scene] = extractScene(fullText);
      checkedWrite({ ttsText: fullText, mood: mood ?? undefined, scene: scene ?? undefined });

      const costUsd = recordBedrockUsage(conversation.id, "chat", inputTokens, outputTokens);
      checkedWrite({ usage: { inputTokens, outputTokens, costUsd, model: "bedrock-haiku", feature: "chat" } });
    }

    res.write("data: [DONE]\n\n");
    activeSSEStreams.delete(res);
    res.end();
  }

  // Note: assistant message persistence is handled by executeDmTurn
  if (fullText) {
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
