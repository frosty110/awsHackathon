import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateTTS } from "../server/src/services/tts.js";
import { OPENING_MONOLOGUE } from "../server/src/routes/narrate.js";

(async () => {
  console.log("[generate-opening-audio] Generating opening monologue TTS...");

  const { audioBuffer, audioFormat, durationMs } =
    await generateTTS(OPENING_MONOLOGUE);

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
