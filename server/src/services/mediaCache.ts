import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, NoSuchKey } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import tracer from "dd-trace";
import { config } from "./config.js";

// ── S3Client singleton ────────────────────────────────────────────────────────
const s3 = new S3Client({ region: config.AWS_REGION || "us-east-1" });

// ── Bucket resolution ─────────────────────────────────────────────────────────
// Prefer S3_MEDIA_CACHE_BUCKET, fall back to S3_AUDIO_CACHE_BUCKET for compat.
const bucket = config.S3_MEDIA_CACHE_BUCKET || config.S3_AUDIO_CACHE_BUCKET;

if (!bucket) {
  console.warn(
    "[mediaCache] S3_MEDIA_CACHE_BUCKET is not configured — S3 media caching disabled. " +
    "Set S3_MEDIA_CACHE_BUCKET to enable durable caching across restarts."
  );
}

/**
 * Build a deterministic S3 object key.
 * Key format: `<prefix>/<sha256[0:32]>.<ext>`
 */
export function buildKey(prefix: string, hashInput: string, extension: string): string {
  const hash = createHash("sha256").update(hashInput).digest("hex").slice(0, 32);
  return `${prefix}/${hash}.${extension}`;
}

/**
 * Retrieve cached media from S3.
 * Returns Buffer on hit, null on miss or if bucket is unconfigured.
 */
export async function get(key: string): Promise<Buffer | null> {
  if (!bucket) return null;

  const cacheType = key.split("/")[0] || "unknown";
  return tracer.trace("s3.media_cache.get", { resource: key }, async (span) => {
    span?.setTag("cache.type", cacheType);
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      const bytes = await response.Body!.transformToByteArray();
      span?.setTag("cache.result", "hit");
      span?.setTag("cache.bytes", bytes.byteLength);
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        span?.setTag("cache.result", "miss");
        return null;
      }
      span?.setTag("error", true);
      throw err;
    }
  });
}

/**
 * List all object keys under a given S3 prefix.
 * Returns an empty array if the bucket is unconfigured.
 */
export async function listKeys(prefix: string): Promise<string[]> {
  if (!bucket) return [];

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Store media in S3 cache (fire-and-forget from caller's perspective).
 * Content-addressed keys never change, so CacheControl is immutable.
 */
export async function put(
  key: string,
  buffer: Buffer,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<void> {
  if (!bucket) return;

  const cacheType = key.split("/")[0] || "unknown";
  return tracer.trace("s3.media_cache.put", { resource: key }, async (span) => {
    span?.setTag("cache.type", cacheType);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "max-age=31536000, immutable",
        Metadata: {
          ...metadata,
          generatedAt: new Date().toISOString(),
        },
      })
    );
    span?.setTag("cache.bytes", buffer.byteLength);
  });
}
