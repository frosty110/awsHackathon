import { Router } from "express";
import { generateTTS } from "../services/tts.js";
import { streamBedrockResponse } from "../services/bedrock.js";
import type { ChatMessage } from "../services/bedrock.js";
import { getOrCreate, appendMessage } from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";

const OPENING_PROMPT =
  "Begin the adventure. The player has just pushed open the door of the Shattered Crown Tavern. Set the opening scene — describe the tavern atmosphere, mention Gorm behind the bar, and hint that something feels wrong in this town. End with \"What do you do?\"";

const router = Router();

router.post(["/narrate", "/api/narrate"], async (req, res) => {
  const requestId = buildRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", requestId);
  const textInput = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const hasText = textInput.length > 0;
  logEvent("info", "narrate.request_received", {
    requestId,
    route: "/api/narrate",
    hasText,
    textLength: textInput.length,
  });

  // When text is provided, just TTS it and return audio (existing behavior)
  if (hasText) {
    try {
      const { audioBuffer } = await generateTTS(textInput);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
      logEvent("info", "narrate.tts_only_completed", {
        requestId,
        route: "/api/narrate",
        byteLength: audioBuffer.length,
      });
    } catch (err) {
      logEvent(
        "error",
        "narrate.tts_generation_failed",
        {
          requestId,
          route: "/api/narrate",
          stage: "tts_only",
          textLength: textInput.length,
          failureType: "terminal",
        },
        err
      );
      res.status(500).json({ error: "TTS generation failed", requestId });
    }
    return;
  }

  // No text — generate opening monologue from Bedrock, TTS it, return JSON
  const messages: ChatMessage[] = [{ role: "user", content: OPENING_PROMPT }];
  let text = "";

  try {
    text = await streamBedrockResponse(messages, () => {});
  } catch (err) {
    logEvent(
      "error",
      "narrate.opening_bedrock_failed",
      {
        requestId,
        route: "/api/narrate",
        stage: "bedrock_opening",
        failureType: "terminal",
      },
      err
    );
    res.status(500).json({ error: "Opening monologue generation failed", requestId });
    return;
  }

  // Create conversation and store the assistant opening
  const conversation = getOrCreate();
  appendMessage(conversation.id, { role: "assistant", content: text });

  try {
    const { audioBuffer } = await generateTTS(text);

    res.json({
      audio: audioBuffer.toString("base64"),
      text,
      conversationId: conversation.id,
    });
    logEvent("info", "narrate.opening_completed", {
      requestId,
      route: "/api/narrate",
      conversationId: conversation.id,
      textLength: text.length,
      byteLength: audioBuffer.length,
    });
  } catch (err) {
    logEvent(
      "error",
      "narrate.opening_tts_failed",
      {
        requestId,
        route: "/api/narrate",
        stage: "opening_tts",
        conversationId: conversation.id,
        textLength: text.length,
        failureType: "recoverable",
      },
      err
    );
    res.json({
      text,
      conversationId: conversation.id,
      ttsError: "Opening narration audio generation failed",
      requestId,
    });
  }
});

export default router;
