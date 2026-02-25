# Phase 3: Persist Usage Data with Bear Lumen Integration — Research

**Researched:** 2026-02-24
**Domain:** AI cost intelligence integration / external event pipeline
**Confidence:** HIGH

---

## Summary

Phase 2 is complete: `userId` is threaded end-to-end through all `record*` functions and route call sites, and every `UsageEntry` now carries a `userId` field. Phase 3 builds directly on that work. The goal is to start forwarding those usage events to Bear Lumen's persistent analytical layer so that cost data outlives the 24-hour in-memory eviction window and becomes queryable for per-user attribution, feature-level margin analysis, and investor reporting.

The integration architecture is deliberately minimal and non-disruptive. The existing `usageTracker.ts` and Datadog spans remain entirely unchanged. Bear Lumen receives a forwarded copy of each event via fire-and-forget. Two integration paths exist: REST API (fewer moving parts, no new dependency) and the official `@bearlumen/node-sdk` v0.2.0 SDK (cleaner long-term, batching, auto-extraction for Bedrock streams). The evaluation document commits us to the REST API path first on staging, SDK path later — this research documents both so the planner can break them into two sequential plans.

A critical architectural detail: Bear Lumen's SDK uses a background `EventQueue` that flushes on a timer and never throws. The shutdown hook in `server/src/index.ts` already handles SIGTERM/SIGINT — Bear Lumen's `bear.shutdown()` must be called inside that handler to drain any unflushed events before process exit.

**Primary recommendation:** Implement REST API path first (one new function, ~15 lines, no new dependency) so Bear Lumen's dashboards can be validated against real staging data before adding the SDK to the import chain.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@bearlumen/node-sdk` | 0.2.0 | AI cost event tracking — batches, flushes, never blocks | Official SDK from vendor; single dependency (axios); MIT license; confirmed on npm registry |
| Node.js built-in `fetch` | (Node 18+) | REST API path — fire-and-forget POST | Zero dependency; already available in our Node 22 environment |
| `node:crypto` `randomUUID()` | built-in | Generate idempotent `sdk_event_id` per event | Built-in; SDK uses same approach |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `axios` | ^1.6.0 | HTTP transport inside SDK (indirect dependency) | Pulled in automatically by `@bearlumen/node-sdk`; we never call it directly |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST API path | SDK path only | SDK provides batching + auto token extraction; REST path has zero new dependencies and is better for initial staging validation |
| Bear Lumen SDK | Build custom persistent store (Postgres/Redis) | Custom storage requires months of work; Bear Lumen provides dashboards, Stripe margin integration, and investor reports we cannot replicate quickly |

**Installation (SDK path, deferred to second plan):**
```bash
yarn workspace @dnd-adventures/server add @bearlumen/node-sdk
```

No installation required for REST API path (uses Node built-in fetch).

---

## Architecture Patterns

### Recommended Project Structure

The integration touches only one new file and extends two existing files:

```
server/src/
├── services/
│   ├── usageTracker.ts          # EXISTING — no changes needed
│   ├── bearLumen.ts             # NEW — REST API path (Plan 03-01)
│   └── bearLumenSdk.ts          # NEW — SDK path (Plan 03-02, deferred)
├── index.ts                     # MODIFIED — bear.shutdown() in SIGTERM/SIGINT handler (SDK path only)
└── services/config.ts           # MODIFIED — add BEAR_LUMEN_API_KEY to env schema
```

### Pattern 1: Fire-and-Forget REST API (Plan 03-01)

**What:** A thin wrapper around `fetch` that POSTs a `UsageEntry` to Bear Lumen's REST API. Called at the end of each `record*` function in `usageTracker.ts`. The entire call is wrapped in a try/catch with a no-op catch — it never throws, never blocks, never delays the game response.

**When to use:** REST API path is the right first step. No new import chain, no new process-level singleton, no shutdown concerns. Easy to verify in Bear Lumen dashboards. Easy to remove if evaluation fails.

**Example (verified from BEAR-LUMEN-EVALUATION.md and SDK source):**
```typescript
// Source: docs/BEAR-LUMEN-EVALUATION.md + confirmed against SDK wire format
import { randomUUID } from 'node:crypto';
import type { UsageEntry } from '@dnd-adventures/shared-types';

const BEAR_LUMEN_API_KEY = process.env.BEAR_LUMEN_API_KEY ?? '';
const BEAR_LUMEN_ENABLED = BEAR_LUMEN_API_KEY.length > 0;

export async function pushToBearLumen(entry: UsageEntry): Promise<void> {
  if (!BEAR_LUMEN_ENABLED) return;
  try {
    void fetch('https://api.bearlumen.com/usage/events/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BEAR_LUMEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{
          sdk_event_id: randomUUID(),
          model: entry.model,
          input_tokens: entry.inputTokens,
          output_tokens: entry.outputTokens,
          event_invoked_at: new Date(entry.timestamp).toISOString(),
          user_id: entry.userId ?? undefined,
          metadata: {
            provider: entry.model.startsWith('bedrock') ? 'bedrock' : 'minimax',
            feature: entry.feature,
            ...(entry.characters > 0 ? { units: { characters: entry.characters } } : {}),
          },
        }],
      }),
    }).catch(() => {});
  } catch { /* never throws */ }
}
```

**Important wire format note:** The SDK internally POSTs to `/usage/events/batch` (not `/v1/usage-events` as the earlier evaluation doc suggested). The actual endpoint was verified by reading `dist/index.js` from the unpacked npm tarball, where `sendBatch` calls `this.client.post('/usage/events/batch', { events })`.

### Pattern 2: SDK Integration (Plan 03-02, Deferred)

**What:** Replace manual REST calls with the official SDK. The SDK handles batching (default 20 events per batch, 10s flush interval), token auto-extraction for Bedrock streams, and graceful error handling. A module-level singleton is initialized at startup and `bear.shutdown()` is added to the SIGTERM/SIGINT handler.

**When to use:** After REST API path is validated against real staging data and Bear Lumen's dashboards are confirmed to meet the six evaluation criteria in the evaluation doc. SDK path should NOT be added until REST validation passes.

**Example (verified from SDK README and dist/index.js):**
```typescript
// Source: @bearlumen/node-sdk@0.2.0 README + dist/index.js
import { BearLumen, Provider } from '@bearlumen/node-sdk';
import { config } from './config.js';

export const bear = config.BEAR_LUMEN_API_KEY
  ? new BearLumen({
      apiKey: config.BEAR_LUMEN_API_KEY,
      onError: (error) => {
        // Silent in production — Bear Lumen errors never reach the player
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[bear-lumen] background flush error:', error);
        }
      },
    })
  : null;

// TTS (manual tracking — no LLM response to pass)
bear?.track(null, {
  model: 'minimax-tts',
  provider: Provider.MINIMAX,
  feature: 'tts',
  userId: userId ?? undefined,
  units: { characters },
});

// Music / Video (flat-rate, manual)
bear?.track(null, {
  model: 'minimax-music-2.5',
  provider: Provider.MINIMAX,
  feature: 'music',
  userId: userId ?? undefined,
});

// Bedrock (streaming — SDK wraps the async iterable)
// Note: our bedrock.ts iterates response.stream manually.
// SDK stream wrapping would require restructuring streamBedrockResponse().
// Prefer manual tracking for Bedrock in SDK phase as well:
bear?.track(null, {
  model: 'anthropic.claude-3-haiku',
  provider: Provider.BEDROCK,
  feature,
  userId: userId ?? undefined,
  units: { inputTokens, outputTokens },  // pass explicitly; SDK reads from metadata
});
```

**Bedrock streaming limitation:** Our `streamBedrockResponse()` in `bedrock.ts` iterates `response.stream` directly inside a `tracer.llmobs.trace()` closure. Wrapping it with `bear.track(response.stream, ...)` would require passing the `TrackedStream` back through that closure, and the Datadog span annotation happens after iteration. For the SDK phase, manual tracking (`bear.track(null, {...})`) with explicit token counts is cleaner and safer than restructuring the Bedrock streaming path. The SDK's Bedrock stream-wrapping example in the README uses a different call pattern (`bedrock.send()` result), not the `response.stream` async iterable shape we use.

### Pattern 3: Environment Variable Guard

**What:** Bear Lumen integration is opt-in via `BEAR_LUMEN_API_KEY`. If the key is absent (local dev, CI), all Bear Lumen calls are no-ops. This matches how we handle optional services (Neo4j, Redis).

```typescript
// In config.ts — add to envDefaults and envSchema
BEAR_LUMEN_API_KEY: '',   // optional; empty string disables integration

// In envSchema (zod):
BEAR_LUMEN_API_KEY: z.string(),  // optional, not required
```

### Pattern 4: Shutdown Hook Integration (SDK path only)

**What:** `bear.shutdown()` drains the in-memory event queue before process exit. Must be called in the existing SIGTERM/SIGINT handler in `index.ts`.

```typescript
// Source: SDK README + dist/batching/event-queue.js
// In server/src/index.ts shutdown handler, before process.exit(0):
if (bear) await bear.shutdown();
```

The SDK's `EventQueue` uses `timer.unref()` so it never prevents process exit on its own — but calling `shutdown()` ensures in-flight events reach the API before the process ends.

### Anti-Patterns to Avoid

- **Throwing on Bear Lumen failure:** Never let a Bear Lumen error propagate. The integration MUST be fire-and-forget at every layer. Same standard as Neo4j and TTS circuit breakers.
- **Blocking game response for Bear Lumen:** `pushToBearLumen()` must be called with `void` — the route handler does not await it.
- **Initializing SDK without API key guard:** `new BearLumen({ apiKey: '' })` throws a `BearLumenApiError` with `authentication_error`. Always guard with key presence check.
- **Calling record* functions twice:** Do NOT call `recordBedrockUsage()` AND `bear.track()` for the same event — that double-counts. In REST phase, `pushToBearLumen()` is called from inside the existing `record*` functions. In SDK phase, `record*` calls are replaced or supplemented (not doubled).
- **Using the wrong endpoint:** The REST endpoint is `/usage/events/batch` (verified from SDK source), not `/v1/usage-events` as the evaluation doc suggested. The batch endpoint accepts `{ events: [...] }`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent cost storage | Custom Postgres schema + migration + query API | Bear Lumen platform | Per-user trends, Stripe margin integration, investor reports would take months to build |
| Event batching + retry | Custom queue with Redis-backed retry | SDK's `EventQueue` | SDK's queue is timer-based, non-blocking, unref'd, handles partial batch failures |
| Provider token extraction | Manual Bedrock chunk parsing (we already do this) | SDK `bear.track(stream)` (SDK phase only) | SDK handles chunk-level token accumulation for streaming; already solves the problem we solved in usageTracker.ts |
| Historical cost queries | Custom time-series queries | `bear.costs.byModel()`, `byFeature()`, `byProvider()` | These return pre-aggregated data from Bear Lumen's persistent store |

**Key insight:** The value proposition is not the event pipeline (we can build that) — it is the persistent analytical store and the dashboards that answer business questions (tier profitability, per-user cost trends, margin analysis). Building those ourselves would take a dedicated engineering quarter.

---

## Common Pitfalls

### Pitfall 1: Wrong REST Endpoint

**What goes wrong:** Using `/v1/usage-events` (from early evaluation notes) instead of the actual batch endpoint.
**Why it happens:** The evaluation doc was written before the SDK was inspected. The SDK's actual wire endpoint is `/usage/events/batch` with a `{ events: [...] }` wrapper, which we verified from `dist/index.js`.
**How to avoid:** Use `/usage/events/batch` with `{ events: [singleEvent] }` even for single-event REST calls. This matches the SDK's batch format and is consistent.
**Warning signs:** HTTP 404 from Bear Lumen API.

### Pitfall 2: Forgetting the API Key Guard

**What goes wrong:** Server startup throws `BearLumenApiError: API key is required` when `BEAR_LUMEN_API_KEY` is not set.
**Why it happens:** `new BearLumen({ apiKey: '' })` throws synchronously in the constructor.
**How to avoid:** Always guard initialization: `config.BEAR_LUMEN_API_KEY ? new BearLumen({...}) : null`. In REST path, check `BEAR_LUMEN_ENABLED` flag before `fetch`.
**Warning signs:** Server startup crash on environments without the key.

### Pitfall 3: Awaiting Bear Lumen in Request Handler

**What goes wrong:** `await pushToBearLumen(entry)` in a route handler adds latency to every game response.
**Why it happens:** Forgetting that fire-and-forget means `void pushToBearLumen(entry)` — the game does not wait for it.
**How to avoid:** Always use `void` at the call site. Never use `await` for Bear Lumen calls in request-critical paths.
**Warning signs:** SSE chat response latency increases after integration.

### Pitfall 4: Calling bear.shutdown() Before Neo4j/Redis

**What goes wrong:** Process exits before events are flushed if shutdown order is wrong.
**Why it happens:** `bear.shutdown()` flushes to Bear Lumen API — this requires the HTTP connection to be alive. It should run before Neo4j and Redis are closed.
**How to avoid:** In `index.ts` shutdown handler, call `bear.shutdown()` early in the sequence — before Neo4j driver close and Redis quit.
**Warning signs:** Bear Lumen dashboards missing events from sessions that were in-flight during a deployment restart.

### Pitfall 5: Double-Counting in SDK Migration

**What goes wrong:** Both `pushToBearLumen(entry)` (REST path) and `bear.track(null, {...})` (SDK path) fire for the same event.
**Why it happens:** Forgetting to remove the REST call when adding SDK tracking.
**How to avoid:** Plan 03-02 must explicitly remove the `pushToBearLumen()` calls from `usageTracker.ts` as part of replacing them with SDK calls.
**Warning signs:** Bear Lumen dashboards show doubled cost figures.

### Pitfall 6: Sending cost field not included in wire format

**What goes wrong:** Passing `cost: entry.costUsd` in the event payload when the SDK computes cost server-side from token counts and model pricing.
**Why it happens:** Evaluation doc showed a `cost` field. The SDK's `enqueueEvent` does not include a `cost` field in the wire format — cost is derived by Bear Lumen from `model`, `input_tokens`, and `output_tokens`.
**How to avoid:** Do not include `cost` in the REST event body. For MiniMax flat-rate events (music $0.10, video $0.25), send `units: { generations: 1 }` and let Bear Lumen apply their pricing.

---

## Code Examples

Verified patterns from SDK source (unpacked from npm tarball):

### REST API fire-and-forget (Plan 03-01)
```typescript
// Source: docs/BEAR-LUMEN-EVALUATION.md + verified wire format from dist/index.js
// server/src/services/bearLumen.ts
import { randomUUID } from 'node:crypto';
import type { UsageEntry } from '@dnd-adventures/shared-types';

const BEAR_LUMEN_API_KEY = process.env.BEAR_LUMEN_API_KEY ?? '';
const BEAR_LUMEN_ENABLED = BEAR_LUMEN_API_KEY.length > 0;
const BEAR_LUMEN_ENDPOINT = 'https://api.bearlumen.com/usage/events/batch';

export function pushToBearLumen(entry: UsageEntry): void {
  if (!BEAR_LUMEN_ENABLED) return;
  try {
    void fetch(BEAR_LUMEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BEAR_LUMEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{
          sdk_event_id: randomUUID(),
          model: entry.model,
          input_tokens: entry.inputTokens,
          output_tokens: entry.outputTokens,
          event_invoked_at: new Date(entry.timestamp).toISOString(),
          user_id: entry.userId ?? undefined,
          metadata: {
            provider: resolveProvider(entry.model),
            feature: entry.feature,
            ...(entry.characters > 0 ? { units: { characters: entry.characters } } : {}),
          },
        }],
      }),
    }).catch(() => {});
  } catch { /* never throws */ }
}

function resolveProvider(model: string): string {
  if (model.startsWith('bedrock')) return 'bedrock';
  if (model.startsWith('minimax')) return 'minimax';
  return 'unknown';
}
```

### Calling pushToBearLumen from usageTracker.ts
```typescript
// Source: pattern from BEAR-LUMEN-EVALUATION.md, aligned to existing record* structure
// Add to the end of each record* function in usageTracker.ts:
export function recordBedrockUsage(
  conversationId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
  userId?: string | null,
): number {
  evictStaleEntries();
  const costUsd = /* ... existing calculation ... */;
  const entry: UsageEntry = {
    timestamp: Date.now(),
    conversationId,
    userId: userId ?? null,
    feature,
    model: 'bedrock-haiku',
    inputTokens,
    outputTokens,
    characters: 0,
    costUsd,
  };
  entries.push(entry);
  pushToBearLumen(entry);  // fire-and-forget, never throws
  return costUsd;
}
```

### SDK initialization singleton (Plan 03-02 pattern)
```typescript
// Source: @bearlumen/node-sdk README + dist/index.js constructor behavior
// server/src/services/bearLumenSdk.ts
import { BearLumen, Provider } from '@bearlumen/node-sdk';

export const bear = process.env.BEAR_LUMEN_API_KEY
  ? new BearLumen({
      apiKey: process.env.BEAR_LUMEN_API_KEY,
      onError: (error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[bear-lumen] flush error (events dropped):', String(error));
        }
      },
    })
  : null;
```

### Config schema addition
```typescript
// Source: existing config.ts pattern + new key
// In envDefaults:
BEAR_LUMEN_API_KEY: '',

// In zod envSchema:
BEAR_LUMEN_API_KEY: z.string(),

// In warnOnBlankConfig (index.ts):
warnOnBlankConfig(['BEAR_LUMEN_API_KEY'], 'Bear Lumen cost intelligence (optional — events not forwarded)');
```

### Shutdown hook addition (SDK path, index.ts)
```typescript
// Source: dist/batching/event-queue.js shutdown() method + existing index.ts pattern
// Inside shutdown() handler, BEFORE Neo4j and Redis close:
if (bear) await bear.shutdown();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory tracker only (24h eviction) | In-memory tracker + Bear Lumen forwarding | Phase 3 | Cost data persists beyond restart; per-user trends queryable |
| No user attribution | userId threaded to all events | Phase 2 (complete) | Per-user cost reports now possible |
| Manual token parsing + hardcoded rates | SDK auto-extracts tokens (SDK phase) | Phase 3 Plan 02 | Removes rate constant maintenance burden |

**Not deprecated:**
- `usageTracker.ts` — stays for Datadog integration and local debugging. Bear Lumen is additive.
- Hardcoded rate constants in `shared-types/usage.ts` — still needed for in-memory cost calculation. SDK phase does not remove these.

---

## Open Questions

1. **Exact REST endpoint authentication token format**
   - What we know: Authorization header `Bearer ${BEAR_LUMEN_API_KEY}` based on SDK source
   - What's unclear: Whether sandbox API keys use the same header format as production
   - Recommendation: Test with `curl` against sandbox endpoint when keys are received. SDK confirms the header format from `dist/index.js` line: `'Authorization': \`Bearer ${config.apiKey}\``

2. **MiniMax flat-rate events: provider string**
   - What we know: SDK has `Provider.MINIMAX` constant; MiniMax is listed in supported providers table
   - What's unclear: Whether Bear Lumen has server-side pricing for MiniMax music ($0.10) and video ($0.25) or whether these need explicit `cost` fields
   - Recommendation: For REST phase, send `units: { generations: 1 }` and see if dashboards show cost. If not, file issue with Bear Lumen team.

3. **Bear Lumen demo account vs. sandbox API keys**
   - What we know: As of 2026-02-24, Bear Lumen provided a demo account with pre-seeded data; production sandbox keys are contingent on go/no-go decision
   - What's unclear: Whether sandbox keys have been issued since the evaluation doc was written
   - Recommendation: Check with Bear Lumen directly. Plan 03-01 (REST integration) should only be implemented after sandbox keys are confirmed available.

4. **Streaming Bedrock integration in SDK phase**
   - What we know: SDK supports `bear.track(asyncIterable, options)` returning a `TrackedStream`; our `streamBedrockResponse()` iterates `response.stream` inside a Datadog tracer closure
   - What's unclear: Whether SDK stream-wrapping and Datadog annotation can coexist cleanly
   - Recommendation: Use manual tracking (`bear.track(null, { inputTokens, outputTokens })`) for Bedrock in SDK phase. Avoid restructuring `streamBedrockResponse()` — the Datadog integration is critical and must not regress.

---

## Validation Architecture

nyquist_validation is not enabled (not in config.json). Skipping this section.

---

## Sources

### Primary (HIGH confidence)
- `@bearlumen/node-sdk@0.2.0` npm tarball — unpacked and read `dist/index.js`, `dist/batching/event-queue.js`, `dist/providers/bedrock.js`, `dist/index.d.ts`, `README.md` directly
- `docs/BEAR-LUMEN-EVALUATION.md` — integration path, risk assessment, evaluation criteria, communication log
- `server/src/services/usageTracker.ts` — current implementation, all record* functions, test internals
- `packages/shared-types/src/usage.ts` — UsageEntry type with userId field (Phase 2 complete)
- `server/src/index.ts` — shutdown handler pattern for shutdown hook integration
- `server/src/services/config.ts` — env schema pattern for adding BEAR_LUMEN_API_KEY
- `.planning/phases/02-add-userId-to-usage-tracking-pipeline/02-02-SUMMARY.md` — Phase 2 completion confirmation

### Secondary (MEDIUM confidence)
- `docs/BEAR-LUMEN-EVALUATION.md` Chapter 4 (Bear Lumen pitch) — wire format shape. Note: endpoint URL in evaluation doc (`/v1/usage-events`) was superseded by actual SDK source (`/usage/events/batch`)
- `.planning/BUSINESS_PLAN.md` — business context driving requirement for persistent cost data

### Tertiary (LOW confidence)
- `https://docs.bearlumen.com` — not fetched directly; SDK README covers same content and is verified from npm tarball. Docs URL mentioned in README as authoritative reference.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK unpacked and read directly from npm tarball; no inference from documentation alone
- Architecture: HIGH — patterns derived from actual SDK source code (dist/index.js, event-queue.js) + existing codebase patterns
- Wire format: HIGH for SDK path; MEDIUM for REST path (endpoint confirmed from SDK, specific field behavior for MiniMax flat-rate events unverified)
- Pitfalls: HIGH — derived from reading actual constructor behavior, shutdown handler, double-count risk from evaluation doc

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (SDK at v0.2.0, pre-production vendor — re-verify if new version released)
