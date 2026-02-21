import { S3Client, GetObjectCommand, PutObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import tracer from "dd-trace";
import { config } from "./config.js";
import type { CharacterVoice, SceneMood, TTSModel } from "./tts.js";

// ── S3Client singleton ────────────────────────────────────────────────────────
// Follows the same singleton pattern as bedrock.ts. SDK auto-picks up
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN from env.
const s3 = new S3Client({ region: config.AWS_REGION || "us-east-1" });

// ── Bucket guard ──────────────────────────────────────────────────────────────
// Warn once at module load if bucket is unconfigured. Operations are no-ops.
if (!config.S3_AUDIO_CACHE_BUCKET) {
  console.warn(
    "[audioCache] S3_AUDIO_CACHE_BUCKET is not configured — S3 audio caching disabled. " +
    "Set S3_AUDIO_CACHE_BUCKET to enable durable TTS caching across restarts."
  );
}

/**
 * Build a deterministic S3 object key from TTS parameters.
 * Key format: tts/v1/<sha256[0:32]>.mp3
 * The tts/v1/ prefix enables bucket lifecycle policies to be scoped to cache objects.
 */
export function buildCacheKey(
  text: string,
  voice: CharacterVoice,
  mood: SceneMood | undefined,
  model: TTSModel
): string {
  const preHash = `${model}|${voice}|${mood ?? "none"}|${text}`;
  const hash = createHash("sha256").update(preHash).digest("hex").slice(0, 32);
  return `tts/v1/${hash}.mp3`;
}

/**
 * Retrieve cached audio from S3.
 * Returns Buffer on cache hit, null on cache miss (NoSuchKey).
 * Other S3 errors are re-thrown to allow caller to handle graceful degradation.
 * Returns null immediately if S3_AUDIO_CACHE_BUCKET is unconfigured.
 */
export async function getAudio(key: string): Promise<Buffer | null> {
  if (!config.S3_AUDIO_CACHE_BUCKET) return null;

  return tracer.trace("s3.audio_cache.get", { resource: key }, async (span) => {
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: config.S3_AUDIO_CACHE_BUCKET, Key: key })
      );
      // Body is SdkStream — always consume it to release the HTTP socket
      const bytes = await response.Body!.transformToByteArray();
      span?.setTag("cache.result", "hit");
      span?.setTag("cache.bytes", bytes.byteLength);
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        // Cache miss — expected, not an error
        span?.setTag("cache.result", "miss");
        return null;
      }
      // Unexpected error (network, permissions, etc.) — mark span and re-throw
      span?.setTag("error", true);
      throw err;
    }
  });
}

/**
 * Store audio in S3 cache.
 * Content-addressed keys never change, so CacheControl is set to immutable.
 * Returns immediately (void) if S3_AUDIO_CACHE_BUCKET is unconfigured.
 */
export async function putAudio(
  key: string,
  audioBuffer: Buffer,
  meta: { voice: string; mood: string; model: string }
): Promise<void> {
  if (!config.S3_AUDIO_CACHE_BUCKET) return;

  return tracer.trace("s3.audio_cache.put", { resource: key }, async (span) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.S3_AUDIO_CACHE_BUCKET,
        Key: key,
        Body: audioBuffer,
        ContentType: "audio/mpeg",
        CacheControl: "max-age=31536000, immutable", // content-addressed keys never change
        Metadata: {
          voice: meta.voice,
          mood: meta.mood,
          model: meta.model,
          generatedAt: new Date().toISOString(),
        },
      })
    );
    span?.setTag("cache.bytes", audioBuffer.byteLength);
  });
}
