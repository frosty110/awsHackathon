import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateTTS } from "../server/src/services/tts.js";

// Fallback static text for offline pre-generation (runtime uses Bedrock-generated text)
const STATIC_OPENING =
  "Welcome, brave soul. The night is dark, the road is long, and the Shattered Crown tavern stands before you — the last warm light before the wilderness swallows everything. Step inside. Your adventure begins now.";

(async () => {
  console.log("[generate-opening-audio] Generating opening monologue TTS...");

  const { audioBuffer, audioFormat, durationMs } =
    await generateTTS(STATIC_OPENING);

  const outputPath = resolve(
    new URL(".", import.meta.url).pathname,
    "../client/public/opening.mp3"
  );

  writeFileSync(outputPath, audioBuffer);

  console.log(`[generate-opening-audio] Written: ${outputPath}`);
  console.log(
    `[generate-opening-audio] Format: ${audioFormat}, Duration: ${durationMs}ms, Size: ${audioBuffer.length} bytes`
  );
})().catch((err) => {
  console.error("[generate-opening-audio] Failed:", err);
  process.exit(1);
});
