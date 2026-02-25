import { Router, type Response } from "express";
import { z } from "zod";
import { generateMultiVoiceTTS, stripTTSTags } from "../services/tts.js";
import { streamBedrockResponse } from "../services/bedrock.js";
import type { ChatMessage } from "@dnd-adventures/shared-types";
import { getOrCreate, appendMessage, ConversationOwnershipError } from "../services/conversationStore.js";
import { buildRequestId, logEvent } from "../services/logger.js";
import { recordBedrockUsage, recordTtsUsage } from "../services/usageTracker.js";
import { queueBedrockCall } from "../services/bedrockQueue.js";
import { sanitizeUserInput, validateCharacterClass, sanitizePronouns } from "../services/inputSanitizer.js";
import { PHRASE_BANK } from "@dnd-adventures/shared-types";
import { getRandomBundle } from "../services/openingBundleService.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const narrateBodySchema = z.object({
  text: z.string().max(5000).optional(),
  conversationId: z.string().uuid().optional(),
  characterClass: z.string().optional(),
  pronouns: z.string().optional(),
});

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

// ── Opening cascade helpers ──────────────────────────────────────────────────
// Each returns true if the response was sent, false to fall through.

async function serveOpeningBundle(
  bundle: NonNullable<ReturnType<typeof getRandomBundle>>,
  req: AuthenticatedRequest,
  res: Response,
  requestId: string,
  characterClass?: string,
  pronouns?: string,
): Promise<boolean> {
  try {
    const conversation = await getOrCreate(undefined, req.userId, characterClass, pronouns);
    await appendMessage(conversation.id, { role: "assistant", content: bundle.display });

    res.json({
      audio: bundle.audioBuffer.toString("base64"),
      text: bundle.display,
      conversationId: conversation.id,
      usage: {
        bedrockInputTokens: 0,
        bedrockOutputTokens: 0,
        bedrockCostUsd: 0,
        ttsCharacters: 0,
        ttsCostUsd: 0,
        totalCostUsd: 0,
      },
    });
    logEvent("info", "narrate.opening_bundle_served", {
      requestId,
      route: "/api/narrate",
      conversationId: conversation.id,
      phraseId: bundle.phraseId,
      textLength: bundle.display.length,
      byteLength: bundle.audioBuffer.length,
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      res.status(504).json({ error: "Request timed out", requestId });
      return true; // response sent (error)
    }
    logEvent("warn", "narrate.opening_bundle_serve_failed", {
      requestId,
      route: "/api/narrate",
      phraseId: bundle.phraseId,
      error: String(err),
    });
    return false;
  }
}

async function serveOpeningPhrase(
  phrase: (typeof OPENING_PHRASES)[number],
  req: AuthenticatedRequest,
  res: Response,
  requestId: string,
  characterClass?: string,
  pronouns?: string,
): Promise<boolean> {
  try {
    const model = phrase.models[0] ?? "speech-2.8-hd";
    const { audioBuffer } = await generateMultiVoiceTTS(phrase.text, { model, mood: "tavern" });
    const conversation = await getOrCreate(undefined, req.userId, characterClass, pronouns);
    await appendMessage(conversation.id, { role: "assistant", content: phrase.display });
    const ttsCostUsd = recordTtsUsage(conversation.id, phrase.text.length, req.userId ?? null);

    res.json({
      audio: audioBuffer.toString("base64"),
      text: phrase.display,
      conversationId: conversation.id,
      usage: {
        bedrockInputTokens: 0,
        bedrockOutputTokens: 0,
        bedrockCostUsd: 0,
        ttsCharacters: phrase.text.length,
        ttsCostUsd,
        totalCostUsd: ttsCostUsd,
      },
    });
    logEvent("info", "narrate.opening_phrase_completed", {
      requestId,
      route: "/api/narrate",
      conversationId: conversation.id,
      phraseId: phrase.id,
      textLength: phrase.display.length,
      byteLength: audioBuffer.length,
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      res.status(504).json({ error: "Request timed out", requestId });
      return true; // response sent (error)
    }
    logEvent("warn", "narrate.opening_phrase_tts_failed", {
      requestId,
      route: "/api/narrate",
      phraseId: phrase.id,
      error: String(err),
    });
    return false;
  }
}

async function generateBedrockOpening(
  req: AuthenticatedRequest,
  res: Response,
  requestId: string,
  characterClass?: string,
  pronouns?: string,
): Promise<void> {
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
    bedrockCostUsd = recordBedrockUsage(null, "narrate-opening", result.inputTokens, result.outputTokens, req.userId ?? null);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      res.status(504).json({ error: "Request timed out", requestId });
      return;
    }
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

  const conversation = await getOrCreate(undefined, req.userId, characterClass, pronouns);
  const cleanText = stripTTSTags(text);
  await appendMessage(conversation.id, { role: "assistant", content: cleanText });

  try {
    const { audioBuffer } = await generateMultiVoiceTTS(text, { model: "speech-2.8-hd" });
    const ttsCostUsd = recordTtsUsage(conversation.id, text.length, req.userId ?? null);

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
    if (err instanceof Error && err.name === "AbortError") {
      res.status(504).json({ error: "Request timed out", requestId });
      return;
    }
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
}

// ── Route handler ────────────────────────────────────────────────────────────

const router = Router();

router.post("/api/narrate", async (req: AuthenticatedRequest, res) => {
  const requestId = buildRequestId(req.get("x-request-id"));
  res.setHeader("x-request-id", requestId);

  const parsedBody = narrateBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    logEvent("warn", "narrate.validation_failed", {
      requestId,
      route: "/api/narrate",
      errors: parsedBody.error.flatten().fieldErrors,
    });
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const rawBody = parsedBody.data;

  const textInput = sanitizeUserInput(typeof rawBody.text === "string" ? rawBody.text : "", 5000);
  const bodyConversationId = rawBody.conversationId ?? null;
  const characterClass = validateCharacterClass(rawBody.characterClass);
  const pronouns = sanitizePronouns(rawBody.pronouns);
  const hasText = textInput.length > 0;
  logEvent("info", "narrate.request_received", {
    requestId,
    route: "/api/narrate",
    hasText,
    textLength: textInput.length,
  });

  // When text is provided, just TTS it and return audio
  if (hasText) {
    try {
      const { audioBuffer } = await generateMultiVoiceTTS(textInput, { model: "speech-2.8-turbo" });
      recordTtsUsage(bodyConversationId, textInput.length, req.userId ?? null);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
      logEvent("info", "narrate.tts_only_completed", {
        requestId,
        route: "/api/narrate",
        byteLength: audioBuffer.length,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        res.status(504).json({ error: "Request timed out", requestId });
        return;
      }
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

  // No text — opening monologue priority cascade

  // Priority 1: S3 bundle (zero cost, instant)
  const bundle = getRandomBundle();
  if (bundle && await serveOpeningBundle(bundle, req, res, requestId, characterClass, pronouns)) return;

  // Priority 2: Pre-cached opening phrase + TTS
  const phrase = OPENING_PHRASES.length > 0
    ? OPENING_PHRASES[Math.floor(Math.random() * OPENING_PHRASES.length)]
    : null;
  if (phrase && await serveOpeningPhrase(phrase, req, res, requestId, characterClass, pronouns)) return;

  // Priority 3: Generate from Bedrock + TTS
  await generateBedrockOpening(req, res, requestId, characterClass, pronouns);
});

export default router;
