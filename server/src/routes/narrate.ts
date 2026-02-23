import { Router } from "express";
import { generateMultiVoiceTTS, stripTTSTags } from "../services/tts.js";
import { streamBedrockResponse } from "../services/bedrock.js";
import type { ChatMessage } from "../services/bedrock.js";
import { getOrCreate, appendMessage, ConversationOwnershipError } from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";
import { recordBedrockUsage, recordTtsUsage } from "../services/usageTracker.js";
import { queueBedrockCall } from "../services/bedrockQueue.js";
import { sanitizeUserInput, validateCharacterClass, sanitizePronouns } from "../services/inputSanitizer.js";
import { PHRASE_BANK } from "@ai-dm/shared-types";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const OPENING_PHRASES = PHRASE_BANK.filter((p) => p.id.startsWith("opening_"));

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

router.post("/api/narrate", async (req: AuthenticatedRequest, res) => {
  const requestId = buildRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", requestId);
  const textInput = sanitizeUserInput(typeof req.body?.text === "string" ? req.body.text : "", 5000);
  const bodyConversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : null;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (bodyConversationId && !UUID_RE.test(bodyConversationId)) {
    res.status(400).json({ error: "Invalid conversationId format" });
    return;
  }
  const characterClass = validateCharacterClass(req.body?.characterClass);
  const pronouns = sanitizePronouns(req.body?.pronouns);
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

  // No text — try pre-cached opening phrase first, Bedrock as fallback
  const openingPhrase = OPENING_PHRASES.length > 0
    ? OPENING_PHRASES[Math.floor(Math.random() * OPENING_PHRASES.length)]
    : null;

  if (openingPhrase) {
    // Fast path: use pre-written opening (TTS should be a cache hit from prewarm)
    try {
      const model = openingPhrase.models[0] ?? "speech-2.8-hd";
      const { audioBuffer } = await generateMultiVoiceTTS(openingPhrase.text, { model, mood: "tavern" });
      const conversation = await getOrCreate(undefined, req.userId, characterClass, pronouns);
      await appendMessage(conversation.id, { role: "assistant", content: openingPhrase.display });
      const ttsCostUsd = recordTtsUsage(conversation.id, openingPhrase.text.length);

      res.json({
        audio: audioBuffer.toString("base64"),
        text: openingPhrase.display,
        conversationId: conversation.id,
        usage: {
          bedrockInputTokens: 0,
          bedrockOutputTokens: 0,
          bedrockCostUsd: 0,
          ttsCharacters: openingPhrase.text.length,
          ttsCostUsd,
          totalCostUsd: ttsCostUsd,
        },
      });
      logEvent("info", "narrate.opening_phrase_completed", {
        requestId,
        route: "/api/narrate",
        conversationId: conversation.id,
        phraseId: openingPhrase.id,
        textLength: openingPhrase.display.length,
        byteLength: audioBuffer.length,
      });
      return;
    } catch (err) {
      // Pre-cached opening TTS failed — fall through to Bedrock path
      logEvent("warn", "narrate.opening_phrase_tts_failed", {
        requestId,
        route: "/api/narrate",
        phraseId: openingPhrase.id,
        error: String(err),
      });
    }
  }

  // Fallback: generate opening monologue from Bedrock, TTS it, return JSON
  const messages: ChatMessage[] = [{ role: "user", content: buildOpeningPrompt(characterClass, pronouns) }];
  let text = "";
  let bedrockCostUsd = 0;
  let bedrockInputTokens = 0;
  let bedrockOutputTokens = 0;

  try {
    const result = await queueBedrockCall(() =>
      streamBedrockResponse(messages, () => {}, { characterClass, pronouns })
    );
    text = result.text;
    bedrockInputTokens = result.inputTokens;
    bedrockOutputTokens = result.outputTokens;
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
  const conversation = await getOrCreate(undefined, req.userId, characterClass, pronouns);
  const cleanText = stripTTSTags(text);
  await appendMessage(conversation.id, { role: "assistant", content: cleanText });

  try {
    const { audioBuffer } = await generateMultiVoiceTTS(text, { model: "speech-2.8-hd" });
    const ttsCostUsd = recordTtsUsage(conversation.id, text.length);

    res.json({
      audio: audioBuffer.toString("base64"),
      text: cleanText,
      conversationId: conversation.id,
      usage: {
        bedrockInputTokens,
        bedrockOutputTokens,
        bedrockCostUsd,
        ttsCharacters: text.length,
        ttsCostUsd,
        totalCostUsd: bedrockCostUsd + ttsCostUsd,
      },
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
      usage: {
        bedrockInputTokens,
        bedrockOutputTokens,
        bedrockCostUsd,
        ttsCharacters: 0,
        ttsCostUsd: 0,
        totalCostUsd: bedrockCostUsd,
      },
    });
  }
});

export default router;
