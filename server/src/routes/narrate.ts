import { Router } from "express";
import { generateTTS } from "../services/tts.js";

export const OPENING_MONOLOGUE =
  "Welcome, brave soul. The night is dark, the road is long, and the Shattered Crown tavern stands before you — the last warm light before the wilderness swallows everything. Step inside. Your adventure begins now.";

const router = Router();

router.post(["/narrate", "/api/narrate"], async (req, res) => {
  const text: string =
    typeof req.body?.text === "string" && req.body.text.trim()
      ? req.body.text.trim()
      : OPENING_MONOLOGUE;

  try {
    const { audioBuffer } = await generateTTS(text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.send(audioBuffer);
  } catch (err) {
    console.error("[narrate] TTS generation failed:", err);
    res.status(500).json({ error: "TTS generation failed" });
  }
});

export default router;
