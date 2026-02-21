import { Router } from "express";
import { generateTTS } from "../services/tts.js";
import { streamBedrockResponse } from "../services/bedrock.js";
import type { ChatMessage } from "../services/bedrock.js";
import { getOrCreate, appendMessage } from "../services/conversationStore.js";

const OPENING_PROMPT =
  "Begin the adventure. The player has just pushed open the door of the Shattered Crown Tavern. Set the opening scene — describe the tavern atmosphere, mention Gorm behind the bar, and hint that something feels wrong in this town. End with \"What do you do?\"";

const router = Router();

router.post(["/narrate", "/api/narrate"], async (req, res) => {
  const hasText = typeof req.body?.text === "string" && req.body.text.trim();

  // When text is provided, just TTS it and return audio (existing behavior)
  if (hasText) {
    try {
      const { audioBuffer } = await generateTTS(req.body.text.trim());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
    } catch (err) {
      console.error("[narrate] TTS generation failed:", err);
      res.status(500).json({ error: "TTS generation failed" });
    }
    return;
  }

  // No text — generate opening monologue from Bedrock, TTS it, return JSON
  try {
    const messages: ChatMessage[] = [{ role: "user", content: OPENING_PROMPT }];
    const text = await streamBedrockResponse(messages, () => {});

    // Create conversation and store the assistant opening
    const conversation = getOrCreate();
    appendMessage(conversation.id, { role: "assistant", content: text });

    const { audioBuffer } = await generateTTS(text);

    res.json({
      audio: audioBuffer.toString("base64"),
      text,
      conversationId: conversation.id,
    });
  } catch (err) {
    console.error("[narrate] Opening monologue generation failed:", err);
    res.status(500).json({ error: "Opening monologue generation failed" });
  }
});

export default router;
