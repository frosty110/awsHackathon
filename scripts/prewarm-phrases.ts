/**
 * Pre-warm the TTS cache for all phrase bank entries.
 * Iterates each phrase x mood x model combination and calls generateMultiVoiceTTS,
 * which populates both L1 (memory) and L2 (S3) caches.
 *
 * Usage: tsx --env-file=../.env scripts/prewarm-phrases.ts
 */
import { PHRASE_BANK } from "../packages/shared-types/src/phrases.js";
import { generateMultiVoiceTTS } from "../server/src/services/tts.js";

const THROTTLE_MS = 300; // delay between TTS calls to avoid MiniMax rate limits

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  // Build the list of (phrase, mood, model) tuples to pre-warm
  const jobs: Array<{ phraseId: string; text: string; mood: string; model: string }> = [];
  for (const phrase of PHRASE_BANK) {
    for (const mood of phrase.moods) {
      for (const model of phrase.models) {
        jobs.push({ phraseId: phrase.id, text: phrase.text, mood, model });
      }
    }
  }

  console.log(`[prewarm] ${jobs.length} TTS jobs across ${PHRASE_BANK.length} phrases`);

  let completed = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      await generateMultiVoiceTTS(job.text, {
        mood: job.mood as Parameters<typeof generateMultiVoiceTTS>[1]["mood"],
        model: job.model as Parameters<typeof generateMultiVoiceTTS>[1]["model"],
      });
      completed++;
      process.stdout.write(
        `\r[prewarm] ${completed}/${jobs.length} done (${errors} errors) — ${job.phraseId} [${job.mood}/${job.model}]`
      );
    } catch (err) {
      errors++;
      console.error(`\n[prewarm] FAILED: ${job.phraseId} [${job.mood}/${job.model}]: ${err}`);
    }

    await sleep(THROTTLE_MS);
  }

  console.log(`\n[prewarm] Complete: ${completed} cached, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
})().catch((err) => {
  console.error("[prewarm] Fatal:", err);
  process.exit(1);
});
