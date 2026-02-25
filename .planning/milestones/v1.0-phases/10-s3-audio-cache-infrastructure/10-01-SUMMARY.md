---
phase: 10-s3-audio-cache-infrastructure
plan: "01"
subsystem: infra
tags: [aws-s3, tts, caching, datadog, dd-trace]

# Dependency graph
requires:
  - phase: 07-voice-demo-polish
    provides: "tts.ts generateTTS() with in-memory Map cache — this is the L1 cache we preserved"
  - phase: 01-scaffold
    provides: "config.ts blank-default pattern and envDefaults/envSchema Zod structure"
provides:
  - "audioCache.ts service with S3 get/put/buildCacheKey and Datadog APM spans"
  - "Two-tier TTS cache: L1 in-memory Map + L2 S3 bucket for durable cross-instance caching"
  - "S3_AUDIO_CACHE_BUCKET env var validated via Zod in config.ts"
affects:
  - "09-scale-auth — TTS caching is now durable across restarts and server instances"
  - "any future phase that calls generateTTS or generateMultiVoiceTTS"

# Tech tracking
tech-stack:
  added:
    - "@aws-sdk/client-s3@^3.995.0 — S3Client, GetObjectCommand, PutObjectCommand, NoSuchKey"
  patterns:
    - "Two-tier cache: L1 in-memory Map (zero-latency) + L2 S3 (durable, cross-instance)"
    - "S3 put fire-and-forget: putAudio().catch(logEvent) does not block TTS response"
    - "S3 graceful degradation: getAudio() errors caught in caller, treated as cache miss"
    - "S3Client singleton at module scope (matches bedrock.ts pattern)"
    - "tracer.trace() for S3 spans (NOT tracer.llmobs.trace() — reserved for LLM calls)"
    - "span?.setTag() optional chaining — dd-trace types span as Span | undefined in tracer.trace()"
    - "Empty bucket guard: S3_AUDIO_CACHE_BUCKET='' disables S3 ops with console.warn at load"

key-files:
  created:
    - "server/src/services/audioCache.ts"
  modified:
    - "server/src/services/tts.ts"
    - "server/src/services/config.ts"
    - ".env.example"

key-decisions:
  - "Keep L1 in-memory Map — avoid S3 latency (~30-100ms) for recently generated audio in same session"
  - "S3 put is fire-and-forget (non-blocking) — TTS response latency unaffected by S3 write"
  - "GetObject directly (not HeadObject + GetObject) — saves one S3 round trip per cache hit"
  - "NoSuchKey for GetObject cache miss (not NotFound — that is HeadObject's error class)"
  - "32-char SHA-256 hex prefix (not 16) for stronger collision resistance on S3 keys"
  - "tts/v1/ key prefix namespaces cache objects for future S3 Lifecycle policy scoping"
  - "span?.setTag() optional chaining required — dd-trace tracer.trace() types span as Span | undefined"
  - "S3_AUDIO_CACHE_BUCKET uses z.string() (not .min(1)) — blank default disables gracefully per Phase 01 convention"

patterns-established:
  - "Two-tier cache pattern: in-memory L1 + S3 L2 + API fallback with graceful degradation at each tier"
  - "Fire-and-forget S3 write: putAudio().catch(logEvent) pattern for non-blocking cache population"

# Metrics
duration: 2min
completed: "2026-02-21"
---

# Phase 10 Plan 01: S3 Audio Cache Infrastructure Summary

**Two-tier TTS cache (L1 in-memory + L2 S3) with Datadog-traced S3 operations, graceful degradation, and fire-and-forget writes using @aws-sdk/client-s3**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T16:08:15Z
- **Completed:** 2026-02-21T16:10:55Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- Created `audioCache.ts` service with S3Client singleton, SHA-256 content-addressed keys (`tts/v1/<hash32>.mp3`), Datadog-traced `getAudio`/`putAudio`, and graceful no-op when bucket is unconfigured
- Wired S3 cache into `tts.ts` as L2 behind existing in-memory L1 Map: lookup order is L1 -> L2 S3 -> MiniMax API, with S3 hits promoted to L1
- S3 put is fire-and-forget (`.catch()` with `logEvent warn`) so TTS response latency is unaffected by S3 write time

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @aws-sdk/client-s3 and add S3_AUDIO_CACHE_BUCKET config** - `5c02ebd` (chore)
2. **Task 2: Create audioCache.ts and wire into tts.ts as L2 cache** - `32b5288` (feat)

**Plan metadata:** (created after this summary)

## Files Created/Modified

- `server/src/services/audioCache.ts` - S3 audio cache service: S3Client singleton, buildCacheKey (SHA-256, tts/v1/ prefix), getAudio (GetObjectCommand + NoSuchKey catch + Datadog trace span), putAudio (PutObjectCommand + metadata + Datadog trace span), bucket-unconfigured guard
- `server/src/services/tts.ts` - Added import from audioCache.js; modified generateTTS() cache lookup to L1 in-memory -> L2 S3 -> MiniMax; added fire-and-forget S3 putAudio after MiniMax API success
- `server/src/services/config.ts` - Added S3_AUDIO_CACHE_BUCKET to envDefaults (empty string) and envSchema (z.string())
- `.env.example` - Added S3_AUDIO_CACHE_BUCKET under new "S3 Audio Cache" section; added AWS_SESSION_TOKEN and MINIMAX_MUSIC_API_KEY that were missing

## Decisions Made

- **Keep L1 in-memory Map**: S3 GetObject adds ~30-100ms per call; the existing 200-entry Map avoids that for recently generated audio in the same server session. L1 -> L2 -> API is the correct multi-tier cache pattern.
- **GetObject directly, not HeadObject first**: Saves one S3 round trip per cache hit. `NoSuchKey` from `GetObjectCommand` is the correct miss indicator (distinct from `NotFound` on `HeadObjectCommand`).
- **32-char hash prefix**: The plan specifies 32 chars (not the 16 used in the L1 in-memory key) for stronger collision resistance on S3 keys.
- **span?.setTag() optional chaining**: dd-trace's `tracer.trace()` types `span` as `Span | undefined` in TypeScript. Optional chaining is the correct fix — aligns with how callers would handle a tracing-disabled environment.
- **S3_AUDIO_CACHE_BUCKET z.string() not z.string().min(1)**: Empty string default disables S3 gracefully per the blank-default pattern established in Phase 01. No hard failure at startup if bucket not configured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed span?.setTag() optional chaining for tracer.trace() callback**
- **Found during:** Task 2 (Create audioCache.ts)
- **Issue:** dd-trace's TypeScript types define `span` in `tracer.trace()` callbacks as `Span | undefined`, causing 5 TypeScript compile errors on `span.setTag()` calls
- **Fix:** Changed all `span.setTag(...)` to `span?.setTag(...)` using optional chaining
- **Files modified:** `server/src/services/audioCache.ts`
- **Verification:** `npx tsc --noEmit` returned zero errors after fix
- **Committed in:** `32b5288` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix required for TypeScript compilation. No scope creep. The optional chaining is correct — in a tracing-disabled environment, span may legitimately be undefined.

## Issues Encountered

None beyond the TypeScript type fix documented above.

## User Setup Required

S3 bucket must be created manually before S3 caching activates:

```bash
aws s3 mb s3://<bucket-name> --region us-east-1
```

Then set in `.env`:
```
S3_AUDIO_CACHE_BUCKET=<bucket-name>
```

The system degrades gracefully (in-memory L1 only) if this env var is not set.

## Next Phase Readiness

- S3 audio cache infrastructure is complete and ready for use
- Phase 09 (Scale & Auth) can leverage durable TTS caching across server instances
- To activate: create S3 bucket and set `S3_AUDIO_CACHE_BUCKET` env var
- Datadog APM will show `s3.audio_cache.get` and `s3.audio_cache.put` spans with `cache.result` (hit/miss) and `cache.bytes` tags

---
*Phase: 10-s3-audio-cache-infrastructure*
*Completed: 2026-02-21*
