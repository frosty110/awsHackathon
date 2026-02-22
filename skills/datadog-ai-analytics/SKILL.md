---
name: datadog-ai-analytics
description: Build AI product analytics — token economics, LLM cost dashboards, cache ROI, and budget alerting via DogStatsD metrics and Datadog monitors. Use when adding cost/spend visibility, optimizing token usage, or creating budget alerts.
---

# Datadog AI Analytics

Use this workflow when building token economics dashboards, cost monitors, cache ROI widgets, or budget alerting for the AI Dungeon Master.

## Scope boundary

This skill covers the **AI product analytics layer** — cost, tokens, cache savings, and queue pressure.

It does NOT duplicate:
- APM trace metrics (latency, error rates, health) — see `datadog-dashboard-operator`
- LLMObs bootstrap and span wiring — see `datadog-llmobs-operator`
- Existing cache hit/miss timeseries widgets — see `cache-performance.ts`, `cache-metrics.ts`
- Bedrock latency and error widgets — see `bedrock-reliability.ts`
- Semantic caching (intentionally excluded — D&D responses are too context-dependent)

## Load context

1. Read `CLAUDE.md` for architecture contracts and reliability requirements.
2. Read `scripts/create-dashboard/CLAUDE.md` for dashboard section conventions.
3. Read `server/src/services/usageTracker.ts` for the in-memory usage ledger.
4. Read `server/src/services/bedrock.ts` for token extraction and LLMObs annotation.

---

## Part 1 — DogStatsD Metrics to Emit

These metrics close gaps where data exists internally but is not exported to Datadog for dashboards and monitors.

### 1.1 Bedrock Token Metrics

**Source:** `server/src/services/bedrock.ts` — emit after the stream completes, alongside the existing `tracer.llmobs.annotate()` call (~line 108).

```
bedrock.input_tokens   — count — tags: feature, model
bedrock.output_tokens  — count — tags: feature, model
bedrock.total_tokens   — count — tags: feature, model
bedrock.cost_nanodollars — count — tags: feature, model
```

**Why:** Tokens currently exist only as LLMObs span annotations (`metrics.inputTokens`, etc.), which cannot drive DogStatsD-based monitors or dashboard widgets that use the `metrics` data source. Emitting via `tracer.dogstatsd.increment()` makes them queryable as standard metrics.

**Implementation note:** `streamBedrockResponse` does not currently receive a `feature` tag. The caller (chat route or turn handler) must pass it via options so the metric is tagged correctly. Use nanodollars (multiply `costUsd * 1e9`) to avoid floating-point precision issues in integer counters.

### 1.2 Bedrock Queue Depth Gauge

**Source:** `server/src/services/bedrockQueue.ts` — emit on a 10-second `setInterval`, reading from the exported `bedrockQueue` instance.

```
bedrock.queue.pending — gauge — tags: none
bedrock.queue.size    — gauge — tags: none
```

**Why:** `isBedrockQueueOverloaded()` checks `bedrockQueue.pending > 100` for 503 backpressure but never exports the value. A gauge lets dashboards show queue pressure over time and lets monitors alert before the 503 threshold is hit.

**Implementation note:** `bedrockQueue.pending` is the number of items waiting for a concurrency slot. `bedrockQueue.size` is pending + running. Use `tracer.dogstatsd.gauge()`. Clean up the interval on process `SIGTERM`/`SIGINT`.

### 1.3 Multiplayer Usage Gap

**Source:** `server/src/sockets/turnHandlers.ts` — calls `streamBedrockResponse` (~lines 164, 251) but never calls `recordBedrockUsage()` from `usageTracker.ts`.

**Impact:** Multiplayer Bedrock spend is invisible to the usage tracker and any downstream cost metrics.

**Fix:** After each `streamBedrockResponse` resolves in `turnHandlers.ts`, call:
```ts
import { recordBedrockUsage } from "../services/usageTracker.js";

const result = await streamBedrockResponse(messages, onChunk, options);
recordBedrockUsage(conversationId, "multiplayer", result.inputTokens, result.outputTokens);
```

Also emit the DogStatsD token metrics from Part 1.1 with `feature: "multiplayer"`.

### 1.4 Cache Cost-Savings Metric

**Source:** `server/src/services/tts.ts` — emit at the two cache-hit return sites (~lines 100, 128).

```
cache.cost_saved_nanodollars — count — tags: cache_type, source
```

**Why:** Existing `cache.hit` increments count hits but don't quantify dollar value. This metric lets dashboards show "spend avoided" and compute cache ROI ratios.

**Implementation note:** Estimate saved cost per TTS hit as `characters * MINIMAX_TTS_PER_CHAR * 1e9` nanodollars. The `characters` value may need to be stored alongside the cached audio buffer or estimated from the cache key. Apply the same pattern to lore cache hits in `server/src/services/rag.ts` (saves a Bedrock call with ~500 input tokens) and music cache hits in `server/src/services/musicService.ts`.

---

## Part 2 — Dashboard Sections to Add

Add these as new section files in `scripts/create-dashboard/sections/`. Follow the existing pattern: export a single object with a `definition` containing `type: 'group'`, `layout_type: 'ordered'`, `title`, and `widgets` array. Register each in `sections/index.ts` and append to the widgets array in `index.ts`.

### 2.1 `token-economics.ts`

**Title:** `Token Economics — Spend & Efficiency`

Widgets:
1. **Token Rate by Feature** — timeseries, `bedrock.total_tokens` grouped by `feature` tag. Shows chat vs narration vs lore-extraction vs multiplayer token consumption over time.
2. **Input vs Output Split** — timeseries stacked bars, `bedrock.input_tokens` and `bedrock.output_tokens`. Reveals prompt bloat (input-heavy) vs verbose responses (output-heavy).
3. **Cost Rate** — timeseries, `bedrock.cost_nanodollars` with nanodollar unit formatting. Shows spend velocity — the primary metric for budget monitors.
4. **Avg Tokens Per Turn** — query_value, `bedrock.total_tokens / trace.express.request.hits{resource_name:/chat}`. A single number showing average turn cost.
5. **Cumulative Cost (1h)** — query_value, cumulative sum of `bedrock.cost_nanodollars` over the 1h window with dollar formatting.

### 2.2 `cache-roi.ts`

**Title:** `Cache ROI — Cost Avoidance`

Widgets:
1. **Spend Avoided by Cache Type** — timeseries, `cache.cost_saved_nanodollars` grouped by `cache_type`. Shows dollar value of cache hits.
2. **TTS Cache ROI Ratio** — query_value, formula `cache.cost_saved_nanodollars{cache_type:tts} / bedrock.cost_nanodollars{feature:narration}`. Higher is better — shows multiplier effect of caching.
3. **Hit Rate vs Cost Correlation** — timeseries overlay, `cache.hit{cache_type:tts}.as_rate()` on left axis and `cache.cost_saved_nanodollars{cache_type:tts}` on right axis. Validates that hit rate improvements translate to real savings.
4. **L1 (Memory) vs L2 (S3) Distribution** — toplist, `cache.hit` grouped by `source` tag. Shows whether the hot cache (memory) is doing its job vs falling through to S3.

### 2.3 `bedrock-queue.ts`

**Title:** `Bedrock Queue — Backpressure`

Widgets:
1. **Queue Pending / Size** — timeseries, `bedrock.queue.pending` and `bedrock.queue.size` as lines. Shows queue pressure over time.
2. **Overload Events** — event overlay or timeseries, count of 503 responses from `/chat` (filter by `http.status_code:503`). Correlates with queue depth.
3. **503 Rate** — query_value, percentage of `/chat` requests returning 503 vs total. Alerting target: < 1%.

### Section registration

After creating the section files, add to `sections/index.ts`:
```ts
export { tokenEconomics } from './token-economics.js';
export { cacheRoi } from './cache-roi.js';
export { bedrockQueue } from './bedrock-queue.js';
```

And import + append them in the main `index.ts` widgets array.

---

## Part 3 — Bedrock Prompt Caching Readiness

When AWS Bedrock enables prompt caching for the model in use, the stream metadata will include `cacheReadInputTokens` and `cacheWriteInputTokens` fields alongside the existing `inputTokens` and `outputTokens`.

### Extraction stubs

In `server/src/services/bedrock.ts`, inside the `for await` loop where `chunk.metadata?.usage` is read (~line 97):

```ts
if (chunk.metadata?.usage) {
  inputTokens = chunk.metadata.usage.inputTokens ?? 0;
  outputTokens = chunk.metadata.usage.outputTokens ?? 0;
  // Prompt caching fields — zero until Bedrock enables caching for this model
  cacheReadInputTokens = (chunk.metadata.usage as any).cacheReadInputTokens ?? 0;
  cacheWriteInputTokens = (chunk.metadata.usage as any).cacheWriteInputTokens ?? 0;
}
```

### Metrics to emit

```
bedrock.cache_read_input_tokens  — count — tags: feature, model
bedrock.cache_write_input_tokens — count — tags: feature, model
```

These will emit zeros until prompt caching is enabled, but dashboards and the LLM Cost section (`llm-cost.ts`) already have "Cache Read Input" and "Cache Write Input" formulas that will activate automatically when non-zero data flows.

### LLMObs annotation update

Add to the existing `tracer.llmobs.annotate()` call:
```ts
metrics: {
  inputTokens,
  outputTokens,
  totalTokens: inputTokens + outputTokens,
  cacheReadInputTokens,
  cacheWriteInputTokens,
  costUsd,
},
```

---

## Part 4 — Monitor Conventions

All monitors follow the `[Hackathon][P1|P2] <signal>` naming from `datadog-dashboard-operator`. Each includes runbook text.

### 4.1 `[Hackathon][P2] Bedrock spend exceeding $5/hour`

- **Query:** `sum(last_1h):sum:bedrock.cost_nanodollars{*} > 5000000000`
- **Runbook:**
  - **Inspect:** Token Economics dashboard — Cost Rate widget. Check which `feature` tag is driving spend.
  - **Likely cause:** Prompt bloat (large lore context injection), runaway retries, or load spike.
  - **Mitigation:** Reduce max lore context length in `server/src/services/rag.ts`. Check for retry loops in chat route.
  - **Demo fallback:** Switch to shorter system prompt or disable lore injection temporarily.

### 4.2 `[Hackathon][P1] Avg tokens per turn exceeding 3000`

- **Query:** `avg(last_15m):avg:bedrock.total_tokens{feature:chat} > 3000`
- **Runbook:**
  - **Inspect:** Token Economics dashboard — Avg Tokens Per Turn widget. Check Input vs Output Split.
  - **Likely cause:** Conversation history growing unbounded (windowing not applied) or system prompt expansion.
  - **Mitigation:** Verify conversation windowing in `server/src/services/conversationStore.ts`. Check system prompt size in `server/src/services/promptBuilder.ts`.
  - **Demo fallback:** Reduce conversation window size to last 6 turns.

### 4.3 `[Hackathon][P2] TTS cache hit rate below 40%`

- **Query:** `avg(last_15m):sum:cache.hit{cache_type:tts} / (sum:cache.hit{cache_type:tts} + sum:cache.miss{cache_type:tts}) < 0.4`
- **Runbook:**
  - **Inspect:** Cache Performance dashboard — TTS Cache Hits vs Misses. Check Cache ROI dashboard for savings impact.
  - **Likely cause:** High variety of unique narration text (expected for diverse gameplay), or cache eviction too aggressive.
  - **Mitigation:** Increase TTS memory cache size in `server/src/services/tts.ts`. Check S3 cache TTL.
  - **Demo fallback:** Pre-warm cache with common opening narrations before demo.

### 4.4 `[Hackathon][P2] Lore cache hit rate below 30%`

- **Query:** `avg(last_15m):sum:cache.hit{cache_type:lore} / (sum:cache.hit{cache_type:lore} + sum:cache.miss{cache_type:lore}) < 0.3`
- **Runbook:**
  - **Inspect:** Cache Performance dashboard — Lore Cache Hits vs Misses.
  - **Likely cause:** Players exploring diverse topics (expected), or entity extraction producing inconsistent keys.
  - **Mitigation:** Review entity extraction in `server/src/services/rag.ts`. Consider broadening cache key normalization.
  - **Demo fallback:** Lore cache misses degrade gracefully (Neo4j query runs, slightly slower). No action needed unless Neo4j is also failing.

### 4.5 `[Hackathon][P1] Bedrock queue size exceeding 50 pending`

- **Query:** `avg(last_5m):avg:bedrock.queue.pending{*} > 50`
- **Runbook:**
  - **Inspect:** Bedrock Queue dashboard — Queue Pending/Size widget. Correlate with 503 Rate.
  - **Likely cause:** Load spike exceeding Bedrock concurrency quota (20 concurrent), or slow responses causing queue buildup.
  - **Mitigation:** Check AWS Service Quotas for Bedrock throttle errors. Increase concurrency in `server/src/services/bedrockQueue.ts` if quota allows. Consider reducing `BEDROCK_STREAM_TIMEOUT_MS` to fail faster.
  - **Demo fallback:** The 503 backpressure in chat route will shed load automatically. Alert is early warning before users see errors.

---

## Part 5 — Usage Tracker Durability

The in-memory usage ledger in `server/src/services/usageTracker.ts` resets on process restart. This is acceptable for the hackathon because:

1. **DogStatsD metrics persist independently** — once emitted via `tracer.dogstatsd.increment()` / `.gauge()`, data lives in Datadog regardless of server restarts. Dashboards and monitors are unaffected.
2. **The `/api/usage` endpoint** serves the in-memory ledger for the client-side cost tooltip. After restart it shows $0 until new usage accumulates — a known limitation.
3. **24h eviction** (`MAX_AGE_MS`) and **10K entry cap** (`MAX_ENTRIES`) keep memory bounded.

### Redis migration path (if persistence becomes a requirement)

If the `/api/usage` endpoint needs to survive restarts:
1. Replace the `entries` array with a Redis sorted set (score = timestamp).
2. Use `ZRANGEBYSCORE` for windowed queries and `ZREMRANGEBYSCORE` for eviction.
3. Keep `recordBedrockUsage()` / `recordTtsUsage()` signatures identical — only the storage backend changes.
4. DogStatsD emission remains unchanged (fire-and-forget, independent of storage).

---

## Delivery checklist

1. All new DogStatsD metrics use `tracer.dogstatsd.increment()` or `.gauge()` — never raw StatsD clients.
2. Metric names use dots as separators, lowercase, no high-cardinality tags (no `conversationId`).
3. New dashboard sections follow the group widget pattern in `scripts/create-dashboard/CLAUDE.md`.
4. Monitor names follow `[Hackathon][P1|P2] <signal>` convention.
5. Monitor messages include runbook text (inspect, likely cause, mitigation, demo fallback).
6. No collision with existing metrics: `cache.hit`, `cache.miss` are untouched.
7. Multiplayer usage gap is closed — `turnHandlers.ts` calls `recordBedrockUsage()`.
