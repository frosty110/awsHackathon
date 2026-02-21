import { Router } from "express";
import { generateMultiVoiceTTS, stripTTSTags } from "../services/tts.js";
import { streamBedrockResponse } from "../services/bedrock.js";
import type { ChatMessage } from "../services/bedrock.js";
import { getOrCreate, appendMessage } from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";
import { recordBedrockUsage, recordTtsUsage } from "../services/usageTracker.js";

function buildOpeningPrompt(characterClass?: string, pronouns?: string): string {
  const classContext = characterClass
    ? ` The player is a ${characterClass}.`
    : "";
  const pronounContext = pronouns
    ? ` Use ${pronouns} pronouns when referring to the player's character.`
    : "";
  return `Begin the adventure.${classContext}${pronounContext} The player has just pushed open the door of the Shattered Crown Tavern. Set the opening scene — describe the tavern atmosphere, mention Gorm behind the bar, and hint that something feels wrong in this town. End with "What do you do?"`;
}

const router = Router();

router.post(["/narrate", "/api/narrate"], async (req, res) => {
  const requestId = buildRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", requestId);
  const textInput = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const bodyConversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : null;
  const characterClass = typeof req.body?.characterClass === "string" ? req.body.characterClass.trim() : undefined;
  const pronouns = typeof req.body?.pronouns === "string" ? req.body.pronouns.trim() : undefined;
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
      const { audioBuffer } = await generateMultiVoiceTTS(textInput, { model: "speech-2.8-turbo" });
      recordTtsUsage(bodyConversationId, textInput.length);
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
  const messages: ChatMessage[] = [{ role: "user", content: buildOpeningPrompt(characterClass, pronouns) }];
  let text = "";
  let bedrockCostUsd = 0;

  try {
    const result = await streamBedrockResponse(messages, () => {}, { characterClass, pronouns });
    text = result.text;
    bedrockCostUsd = recordBedrockUsage(null, "narrate-opening", result.inputTokens, result.outputTokens);
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

  // Create conversation and store the assistant opening (stripped of TTS tags)
  const conversation = getOrCreate(undefined, characterClass, pronouns);
  const cleanText = stripTTSTags(text);
  appendMessage(conversation.id, { role: "assistant", content: cleanText });

  try {
    const { audioBuffer } = await generateMultiVoiceTTS(text, { model: "speech-2.8-hd" });
    const ttsCostUsd = recordTtsUsage(conversation.id, text.length);

    res.json({
      audio: audioBuffer.toString("base64"),
      text: cleanText,
      conversationId: conversation.id,
      usage: { bedrockCostUsd, ttsCostUsd, totalCostUsd: bedrockCostUsd + ttsCostUsd },
    });
    logEvent("info", "narrate.opening_completed", {
      requestId,
      route: "/api/narrate",
      conversationId: conversation.id,
      textLength: cleanText.length,
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
        textLength: cleanText.length,
        failureType: "recoverable",
      },
      err
    );
    res.json({
      text: cleanText,
      conversationId: conversation.id,
      ttsError: "Opening narration audio generation failed",
      requestId,
      usage: { bedrockCostUsd, ttsCostUsd: 0, totalCostUsd: bedrockCostUsd },
    });
  }
});

export default router;
