# Phase 10: S3 Audio Cache Infrastructure - Research

**Researched:** 2026-02-21
**Domain:** AWS S3 object storage, TTS audio caching, Datadog APM instrumentation
**Confidence:** HIGH

## Summary

Phase 10 replaces the current in-process Map-based TTS cache in `tts.ts` with a durable S3-backed audio cache. The existing in-memory cache (200-entry LRU, 30-minute TTL) is lost on every server restart and can not be shared across multiple server instances — a direct blocker for the Phase 9 scale target of ~1000 concurrent users. S3 solves both problems: objects persist across restarts, and all server instances share one bucket.

The implementation is a new `audioCache.ts` service that wraps S3 operations (`GetObject`, `PutObject`, `HeadObject`) behind a clean interface: `getAudio(key)`, `putAudio(key, buffer, metadata)`, and `buildCacheKey(text, voice, mood, model)`. The service is called by `tts.ts` before and after MiniMax API calls, replacing the existing `ttsCache` Map. The project already uses `@aws-sdk/client-bedrock-runtime` at version 3.995.0, so adding `@aws-sdk/client-s3` (same version family) requires no new credential setup — existing `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` env vars are sufficient.

Datadog tracing should wrap S3 get and put operations using `tracer.trace()` (not `tracer.llmobs.trace()`, which is reserved for LLM calls) so cache hit/miss latency and error rates are observable in the existing Datadog APM dashboard.

**Primary recommendation:** Install `@aws-sdk/client-s3@^3.995.0`, build `server/src/services/audioCache.ts` with SHA-256 keyed S3 get/put/head operations, and wire it into the existing `generateTTS()` function in `tts.ts` as a drop-in replacement for the `ttsCache` Map.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-s3` | `^3.995.0` | S3 GetObject, PutObject, HeadObject | Same AWS SDK v3 family as existing `@aws-sdk/client-bedrock-runtime`; consistent credentials, config, retry, and error handling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (built-in) | N/A | SHA-256 cache key generation | Already used in `tts.ts` for `hashKey()`; no new dependency needed |
| `zod` (already in project) | `^4.0.0` | Env schema extension for `S3_AUDIO_CACHE_BUCKET` | Already used in `config.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@aws-sdk/client-s3` | `aws-sdk` (v2) | v2 is in maintenance mode; project is already on v3 |
| S3 cache | Redis cache | Redis is Phase 9 work; S3 is durable and simpler to operate for audio blobs |
| S3 cache | CloudFront CDN | CloudFront reduces latency for clients but is infrastructure-layer work; out of scope here |

**Installation:**
```bash
cd server && npm install @aws-sdk/client-s3@^3.995.0
```

## Architecture Patterns

### Recommended Project Structure
```
server/src/services/
├── audioCache.ts       # NEW: S3 cache service (get, put, buildCacheKey)
├── tts.ts              # MODIFIED: replace ttsCache Map with audioCache calls
├── config.ts           # MODIFIED: add S3_AUDIO_CACHE_BUCKET env var
└── bedrock.ts          # UNCHANGED
```

### Pattern 1: S3Client Singleton
**What:** Create one `S3Client` instance at module load time, share it for all operations.
**When to use:** Always — matches the bedrock.ts pattern exactly.
**Example:**
```typescript
// Source: official AWS SDK v3 docs — https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { config } from "./config.js";

const s3 = new S3Client({ region: config.AWS_REGION || "us-east-1" });
```
The SDK automatically picks up `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` from the environment — no credential config needed beyond region.

### Pattern 2: Cache Key Generation
**What:** Build a deterministic key from (text + voice + mood + model), hash with SHA-256, use hex string as S3 key.
**When to use:** Always — same key strategy as the current in-memory cache.
**Example:**
```typescript
// Source: existing tts.ts pattern, adapted for S3 key format
import { createHash } from "node:crypto";

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
```
The `tts/v1/` prefix namespaces audio objects within the bucket and makes lifecycle policies trivially easy to scope. The `.mp3` extension sets expectations for the content type.

### Pattern 3: Get with Head-Before-Get (Existence Check)
**What:** Use `HeadObjectCommand` to check existence before `GetObjectCommand`. On HeadObject `NotFound`, treat as cache miss and return null.
**When to use:** When you want to check existence without downloading the body — useful for metrics before the full get.

**Alternative — Try GetObject Directly:**
**What:** Skip HeadObject, attempt `GetObjectCommand` directly; catch `NoSuchKey` for cache miss.
**When to use:** Preferred when you always need the body anyway — saves one S3 request per cache hit.
**Example:**
```typescript
// Source: AWS SDK v3 docs — GetObjectCommand, NoSuchKey
import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";

export async function getAudio(key: string): Promise<Buffer | null> {
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: config.S3_AUDIO_CACHE_BUCKET,
      Key: key,
    }));
    // Body is SdkStream — must consume it
    const bytes = await response.Body!.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err) {
    if (err instanceof NoSuchKey) {
      return null; // cache miss
    }
    throw err; // unexpected error — re-throw
  }
}
```

### Pattern 4: Put with ContentType and CacheControl
**What:** Upload audio buffer to S3 with appropriate metadata.
**When to use:** After every MiniMax API call (cache miss path).
**Example:**
```typescript
// Source: AWS SDK v3 docs — PutObjectCommand
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function putAudio(
  key: string,
  audioBuffer: Buffer,
  meta: { voice: string; mood: string; model: string }
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: config.S3_AUDIO_CACHE_BUCKET,
    Key: key,
    Body: audioBuffer,
    ContentType: "audio/mpeg",
    CacheControl: "max-age=31536000, immutable", // 1 year — keys are content-addressed
    Metadata: {
      voice: meta.voice,
      mood: meta.mood,
      model: meta.model,
      generatedAt: new Date().toISOString(),
    },
  }));
}
```
Content-addressed keys (hash of text+params) never need invalidation, so `immutable` cache-control is safe.

### Pattern 5: Datadog Tracing for S3 Operations
**What:** Wrap S3 get and put in `tracer.trace()` spans (NOT `tracer.llmobs.trace()` — that is reserved for LLM calls).
**When to use:** For all S3 cache operations to measure latency and error rate in Datadog APM.
**Example:**
```typescript
// Source: Datadog dd-trace API — tracer.trace()
import tracer from "dd-trace";

export async function getAudio(key: string): Promise<Buffer | null> {
  return tracer.trace("s3.audio_cache.get", { resource: key }, async (span) => {
    try {
      const response = await s3.send(new GetObjectCommand({
        Bucket: config.S3_AUDIO_CACHE_BUCKET,
        Key: key,
      }));
      const bytes = await response.Body!.transformToByteArray();
      span.setTag("cache.result", "hit");
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        span.setTag("cache.result", "miss");
        return null;
      }
      span.setTag("error", true);
      throw err;
    }
  });
}
```

### Pattern 6: tts.ts Integration
**What:** Replace the `ttsCache` Map in `generateTTS()` with `audioCache.getAudio()` and `audioCache.putAudio()`. Preserve the existing cache-hit/miss log events.
**When to use:** This is the primary wiring point.
**Example:**
```typescript
// In generateTTS() — replace ttsCache Map lookup
const cacheKey = buildCacheKey(text, voice, options.mood, model);

const cached = await audioCache.getAudio(cacheKey);
if (cached) {
  ttsCacheHits++;
  logEvent("info", "tts.cache_hit", { cacheKey, ... });
  return { audioBuffer: cached, audioFormat: "mp3", durationMs: 0 };
}

// ... MiniMax API call (existing code) ...

// After API call — store in S3
await audioCache.putAudio(cacheKey, result.audioBuffer, { voice, mood, model });
```

### Anti-Patterns to Avoid
- **Using HeadObject + GetObject on every cache check:** Double the S3 requests on hits. Use GetObject directly and catch `NoSuchKey`.
- **Not streaming body to completion:** If `GetObjectCommand` response is received but `Body` is not fully consumed, the HTTP socket is not released. Always call `.transformToByteArray()` or `.destroy()`.
- **Blocking the MiniMax API call on slow S3 writes:** `putAudio()` should be awaited after the result is ready to return, but logging errors from put failures should not crash the TTS result. Consider fire-and-forget for the put with error logging.
- **Using `tracer.llmobs.trace()` for S3 spans:** LLMObs spans appear in LLM Observability specifically; use `tracer.trace()` for infrastructure calls.
- **Storing the S3 bucket name in code:** Must live in env config (Zod schema + `config.ts`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 authentication and request signing | Custom HMAC signing, pre-signed URL logic | `@aws-sdk/client-s3` S3Client | AWS Signature V4 has many edge cases; the SDK handles session token refresh, retry, and signing |
| Retry on transient S3 errors | Custom exponential backoff | SDK built-in retry with `maxAttempts` config | SDK handles retryable errors (5xx, throttling) automatically |
| Content-addressing / key uniqueness | Custom UUID or timestamp keys | SHA-256 of (text+voice+mood+model) | Content-addressed keys guarantee no duplicate storage for identical audio |
| S3 Body stream consumption | Manual stream reader loops | `.transformToByteArray()` method on Body | SDK provides this helper — manual stream reading is error-prone and leaks sockets |
| Lifecycle TTL | Explicit delete after N days | S3 Lifecycle policy on bucket prefix `tts/v1/` | Lifecycle policies are declarative and operate independently of the application |

**Key insight:** The AWS SDK v3 handles all credential management, retry logic, and request signing. The service code only needs to express the intent (get/put/check), not the transport mechanics.

## Common Pitfalls

### Pitfall 1: HeadObject vs GetObject for Existence Check
**What goes wrong:** Using `HeadObjectCommand` and catching `NotFound` for cache misses causes double S3 requests (one head, one get) on every cache hit.
**Why it happens:** Developers copy the "check before fetch" pattern from databases.
**How to avoid:** Use `GetObjectCommand` directly and catch `NoSuchKey` for misses. Only use `HeadObject` when you need metadata without the body (not the case here).
**Warning signs:** Two S3 `GET` requests logged per cache hit in Datadog.

### Pitfall 2: HeadObject Error Class Mismatch
**What goes wrong:** Code catches `NoSuchKey` from `HeadObjectCommand`, but `HeadObjectCommand` throws `NotFound` (not `NoSuchKey`) for 404s. The miss is not caught and the error propagates.
**Why it happens:** The error classes differ between Get and Head operations — `GetObject` throws `NoSuchKey`, `HeadObject` throws `NotFound`.
**How to avoid:** Import and use `NotFound` for HeadObject error handling, `NoSuchKey` for GetObject. Since we recommend Get-direct pattern, this is mostly moot.
**Warning signs:** Cache miss errors visible in Datadog; TTS calls never returning cached audio.

### Pitfall 3: S3 Body Stream Not Consumed
**What goes wrong:** Getting a `GetObjectCommand` response but never reading `Body` causes the underlying HTTP socket to remain open. Under load this exhausts the socket pool.
**Why it happens:** Treating the response like a simple object instead of a stream.
**How to avoid:** Always call `response.Body.transformToByteArray()` (or `response.Body.destroy()` on error). Put in `try/finally` to guarantee execution.
**Warning signs:** Server starts hanging on S3 operations under moderate load; connection count grows without bound.

### Pitfall 4: S3 Put Blocking Audio Response
**What goes wrong:** Awaiting `putAudio()` before returning `TTSResult` to the caller adds S3 write latency (~50-200ms) to every TTS cache miss path.
**Why it happens:** Natural async/await flow awaits all operations before returning.
**How to avoid:** After the MiniMax API call completes and the result is assembled, fire the S3 put as a non-blocking background operation. Log errors but do not throw them.
**Warning signs:** TTS latency includes S3 write time even on cache misses.

### Pitfall 5: Missing S3_AUDIO_CACHE_BUCKET in Config Validation
**What goes wrong:** Service silently fails with unclear errors if the bucket env var is not set.
**Why it happens:** Env var is added to the service but not to the Zod schema in `config.ts`.
**How to avoid:** Add `S3_AUDIO_CACHE_BUCKET: z.string()` to `envSchema` in `config.ts` and add it to `.env.example`.
**Warning signs:** `config.S3_AUDIO_CACHE_BUCKET` is undefined at runtime; PutObject calls fail with "bucket name cannot be empty".

### Pitfall 6: Graceful Degradation on S3 Failure
**What goes wrong:** If S3 is unavailable (network partition, misconfigured bucket), TTS completely fails instead of falling back to the MiniMax API.
**Why it happens:** Errors from `getAudio()` propagate uncaught.
**How to avoid:** Wrap `getAudio()` calls in a try/catch; on error, log it and continue to the MiniMax API call (treat as cache miss). Wrap `putAudio()` in fire-and-forget with error logging.
**Warning signs:** TTS entirely broken when S3 has issues; 500 errors on narrate endpoint.

## Code Examples

### Complete audioCache.ts Service
```typescript
// Source: AWS SDK v3 docs (GetObjectCommand, PutObjectCommand) + project dd-trace pattern
import { S3Client, GetObjectCommand, PutObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import tracer from "dd-trace";
import { config } from "./config.js";
import type { CharacterVoice, SceneMood, TTSModel } from "./tts.js";

const s3 = new S3Client({ region: config.AWS_REGION || "us-east-1" });

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

export async function getAudio(key: string): Promise<Buffer | null> {
  return tracer.trace("s3.audio_cache.get", { resource: key }, async (span) => {
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: config.S3_AUDIO_CACHE_BUCKET, Key: key })
      );
      const bytes = await response.Body!.transformToByteArray();
      span.setTag("cache.result", "hit");
      span.setTag("cache.bytes", bytes.byteLength);
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        span.setTag("cache.result", "miss");
        return null;
      }
      span.setTag("error", true);
      throw err;
    }
  });
}

export async function putAudio(
  key: string,
  audioBuffer: Buffer,
  meta: { voice: string; mood: string; model: string }
): Promise<void> {
  return tracer.trace("s3.audio_cache.put", { resource: key }, async (span) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.S3_AUDIO_CACHE_BUCKET,
        Key: key,
        Body: audioBuffer,
        ContentType: "audio/mpeg",
        CacheControl: "max-age=31536000, immutable",
        Metadata: {
          voice: meta.voice,
          mood: meta.mood,
          model: meta.model,
          generatedAt: new Date().toISOString(),
        },
      })
    );
    span.setTag("cache.bytes", audioBuffer.byteLength);
  });
}
```

### config.ts Extension
```typescript
// Add to envDefaults:
S3_AUDIO_CACHE_BUCKET: "",

// Add to envSchema:
S3_AUDIO_CACHE_BUCKET: z.string(),
```

### tts.ts Integration (generateTTS cache block replacement)
```typescript
// Replace in-memory ttsCache Map with S3 cache:
import { buildCacheKey, getAudio, putAudio } from "./audioCache.js";

// In generateTTS():
const cacheKey = buildCacheKey(text, voice, options.mood, model);

// S3 cache lookup (replaces ttsCache.get())
let cachedBuffer: Buffer | null = null;
try {
  cachedBuffer = await getAudio(cacheKey);
} catch (err) {
  // S3 unavailable — degrade gracefully, treat as miss
  logEvent("warn", "tts.s3_cache_get_failed", { cacheKey, error: String(err) });
}

if (cachedBuffer) {
  ttsCacheHits++;
  logEvent("info", "tts.cache_hit", { cacheKey, source: "s3", ... });
  return { audioBuffer: cachedBuffer, audioFormat: "mp3", durationMs: 0 };
}

// ... existing MiniMax API call ...

// After MiniMax call — put in S3 (fire-and-forget, non-blocking)
putAudio(cacheKey, result.audioBuffer, { voice: VOICE_MAP[voice], mood: options.mood ?? "none", model })
  .catch((err) => logEvent("warn", "tts.s3_cache_put_failed", { cacheKey, error: String(err) }));

return result;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AWS SDK v2 global object | AWS SDK v3 modular packages | 2022 | v3 is tree-shakeable; each service is its own npm package |
| v2 `s3.getObject().promise()` | v3 `s3.send(new GetObjectCommand())` | 2022 | Command pattern; same for all SDK v3 services |
| v2 `Body` as `Buffer` or `string` | v3 `Body` as `SdkStream` with `.transformToByteArray()` | 2022 | Must call helper method; returning raw stream without consuming leaks sockets |
| `tracer.startSpan()` + manual `span.finish()` | `tracer.trace()` callback pattern | Ongoing | `tracer.trace()` handles finish/error automatically; matches existing bedrock.ts and tts.ts patterns |

**Deprecated/outdated:**
- `aws-sdk` (v2): Still works but in maintenance mode. Do not use it — project is already on v3.
- `body.pipe()` pattern for reading S3 objects: Works but fragile. Use `.transformToByteArray()` instead.

## Open Questions

1. **S3 bucket provisioning**
   - What we know: The code needs a bucket name via `S3_AUDIO_CACHE_BUCKET` env var.
   - What's unclear: Whether the bucket must be created manually (before deploy), via Terraform/CDK, or via a setup script in the project.
   - Recommendation: Document bucket creation in `.env.example` comments. Bucket creation is one CLI command: `aws s3 mb s3://<bucket-name> --region us-east-1`. Defer infrastructure-as-code to Phase 9 deployment work.

2. **durationMs on cache hits from S3**
   - What we know: The current TTSResult interface includes `durationMs` (from MiniMax `audio_length` field). When serving from S3 cache, this field is not available in the stored audio.
   - What's unclear: Whether callers depend on `durationMs` being accurate.
   - Recommendation: Store `durationMs` as S3 object metadata alongside voice/mood/model. Retrieve it from `response.Metadata.durationMs` on cache hits. If missing (old cached objects), return 0.

3. **S3 Lifecycle policy for cache TTL**
   - What we know: S3 objects under `tts/v1/` prefix with content-addressed keys will never change but will accumulate.
   - What's unclear: What TTL is appropriate for audio cache objects.
   - Recommendation: Add a 90-day lifecycle expiry rule on `tts/v1/` prefix objects. This is a bucket-level S3 console or CLI operation, not application code.

4. **In-memory L1 cache retention**
   - What we know: The current 200-entry in-memory Map is a fast, zero-latency local cache. S3 GetObject adds ~30-100ms per call.
   - What's unclear: Whether to keep the in-memory Map as an L1 cache above S3 (L2).
   - Recommendation: Keep the in-memory Map as L1. Check Map first, then S3, then MiniMax. This is the standard multi-tier cache pattern and avoids S3 latency for recently-generated audio during the same server session.

## Sources

### Primary (HIGH confidence)
- [AWS SDK for JavaScript v3 - S3Client docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) — S3Client config, command pattern, credential resolution
- [GetObjectCommand API reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/) — Body type (SdkStream), transformToByteArray(), NoSuchKey error
- [HeadObjectCommand API reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/HeadObjectCommand/) — NotFound error (distinct from NoSuchKey in GetObject)
- [NoSuchKey exception class](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/NoSuchKey/) — Confirms NoSuchKey is for GetObject, not HeadObject
- Existing `server/src/services/bedrock.ts` — Established S3Client singleton, tracer.llmobs.trace() pattern for reference
- Existing `server/src/services/tts.ts` — Current in-memory cache structure, buildTTSCacheKey, hashKey functions to preserve

### Secondary (MEDIUM confidence)
- [Datadog dd-trace-js API.md on GitHub](https://github.com/DataDog/dd-trace-js/blob/master/docs/API.md) — tracer.trace() API, confirmed distinct from tracer.llmobs.trace()
- [AWS S3 Error Handling Blog Post](https://aws.amazon.com/blogs/developer/service-error-handling-modular-aws-sdk-js/) — instanceof pattern for typed error catching in SDK v3
- npm registry — `@aws-sdk/client-s3@3.995.0` confirmed current version matching bedrock-runtime

### Tertiary (LOW confidence)
- S3 audio caching best practices patterns from community sources — general pattern confirmed; no TTS-specific authoritative source found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@aws-sdk/client-s3` is the only correct choice; version verified from npm
- Architecture: HIGH — S3Client singleton, Get-direct pattern, fire-and-forget put all verified against official docs
- Pitfalls: HIGH — HeadObject/GetObject error class distinction verified from official SDK docs; body consumption requirement verified
- Integration (tts.ts wiring): HIGH — based on direct reading of existing tts.ts code

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days — AWS SDK v3 API is stable; unlikely to change)
