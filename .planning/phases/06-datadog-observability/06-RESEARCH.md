# Phase 6: Datadog Observability - Research

**Researched:** 2026-02-20
**Domain:** Datadog dd-trace LLM Observability + Datadog Dashboard API
**Confidence:** MEDIUM — Core patterns verified via official dd-trace API docs and GitHub issues; dashboard API verified via TypeScript client docs; some Bedrock-specific token-count behavior inferred from community sources due to Datadog docs site rendering failures.

---

## Summary

Phase 6 wires Datadog LLM Observability into the already-running Express/Bedrock server. The bootstrap mechanism (`NODE_OPTIONS='--import dd-trace/initialize.mjs'`) is already present in the server `package.json` dev and start scripts, and all five required env vars are already declared in `.env.example` and validated in `config.ts`. The core work is therefore: (1) confirming the existing bootstrap is correct and all env vars are populated with real values, (2) adding three named custom spans wrapping neo4j, TTS, and bedrock calls using `tracer.llmobs.trace()`, and (3) scripting the Datadog dashboard via `@datadog/datadog-api-client`.

The most dangerous production pitfall in this phase is the agentless ECONNREFUSED noise: when `DD_LLMOBS_AGENTLESS_ENABLED=1` and no local Datadog Agent is running, dd-trace (v5.x) still attempts APM-layer connections to port 8126 and logs connection errors. These are cosmetic — LLM spans still reach Datadog — but they look alarming. The workaround is to not set `DD_TRACE_DEBUG=true`, which suppresses the verbose error log without dropping any telemetry.

A second critical constraint: the dashboard create-script requires a Datadog Application Key (`DD_APP_KEY`) in addition to the API key. This is a separate credential from `DD_API_KEY`. The `.env.example` does not currently include `DD_APP_KEY`. The script also must run *after* real trace data exists in Datadog, because the trace-stream widget requires a service that has already emitted at least one span.

**Primary recommendation:** Wire the three `tracer.llmobs.trace()` spans first (Plan 06-02), then confirm auto-captured Bedrock spans appear in the Datadog LLM Observability UI via smoke-test (Plan 06-01), then build the dashboard script (Plan 06-03) once real trace data exists.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dd-trace` | `^5.86.0` (already installed) | APM tracing + LLM Observability SDK | Only official Datadog Node.js tracer; required for `tracer.llmobs.*` API |
| `@datadog/datadog-api-client` | `^1.x` (needs install) | TypeScript client for Datadog REST API | Official Datadog SDK; handles auth, retry, rate limiting for Dashboard API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | already installed | Run the create-dashboard script | Script runs once; tsx avoids compile step |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@datadog/datadog-api-client` | Raw `fetch` to `https://api.datadoghq.com/api/v1/dashboard` | fetch avoids an extra dep but requires manual auth headers and error handling; use the client |
| `tracer.llmobs.trace()` callback | `tracer.startSpan()` try/finally | startSpan() is APM-only and does not appear in LLM Observability UI; llmobs.trace() is required for the demo's named LLMObs spans |

**Installation (dashboard script only):**
```bash
npm install --save-dev @datadog/datadog-api-client -w server
```

---

## Architecture Patterns

### Recommended Project Structure
```
server/src/
├── services/
│   ├── neo4j.ts          # wrap queries in tracer.llmobs.trace({ kind: 'tool', name: 'neo4j.lore_query' })
│   ├── tts.ts            # wrap MiniMax call in tracer.llmobs.trace({ kind: 'tool', name: 'minimax.tts' })
│   └── bedrock.ts        # bedrock.dm_response span: llmobs.trace wrapping the ConverseStreamCommand
scripts/
└── create-dashboard.ts   # one-shot script; runs after real trace data exists
```

### Pattern 1: tracer.llmobs.trace() — The Only Correct API for Named LLMObs Spans

**What:** `tracer.llmobs.trace(options, async (span) => { ... })` creates a named LLM Observability span. The callback receives the span. The span is automatically finished when the callback promise resolves or rejects.

**When to use:** Wrapping every pipeline stage that must appear in the LLM Observability trace waterfall: neo4j queries, TTS calls, and the Bedrock call itself.

**Span kinds available:** `'llm'`, `'tool'`, `'agent'`, `'workflow'`, `'retrieval'`, `'embedding'`

Use `'tool'` for neo4j and TTS (non-LLM external calls). Use `'llm'` for the bedrock.dm_response span if you want it to appear as an LLM span (though Bedrock is already auto-instrumented — see Pattern 2).

**Example:**
```typescript
// Source: https://datadoghq.dev/dd-trace-js/interfaces/llmobs.LLMObs.html
import tracer from 'dd-trace';

// neo4j.ts — wrap lore query
export async function queryLore(entities: string[]): Promise<LoreRecord[]> {
  return tracer.llmobs.trace(
    { kind: 'tool', name: 'neo4j.lore_query' },
    async (span) => {
      try {
        const records = await driver.executeQuery(/* ... */);
        tracer.llmobs.annotate(span, {
          inputData: JSON.stringify({ entities }),
          outputData: JSON.stringify({ recordCount: records.length }),
          tags: { 'db.system': 'neo4j' },
        });
        return records;
      } catch (err) {
        // span auto-finishes with error on promise rejection
        throw err;
      }
    }
  );
}

// tts.ts — wrap MiniMax call
export async function generateSpeechWav(text: string): Promise<Buffer> {
  return tracer.llmobs.trace(
    { kind: 'tool', name: 'minimax.tts' },
    async (span) => {
      const wav = await callMiniMax(text);
      tracer.llmobs.annotate(span, {
        inputData: text.slice(0, 200),  // truncate for safety
        outputData: JSON.stringify({ byteLength: wav.byteLength }),
        tags: { 'tts.provider': 'minimax' },
      });
      return wav;
    }
  );
}

// bedrock.ts — wrap ConverseStream
export async function streamBedrockResponse(messages: Message[], res: Response): Promise<string> {
  return tracer.llmobs.trace(
    { kind: 'llm', name: 'bedrock.dm_response', modelName: config.BEDROCK_MODEL_ID, modelProvider: 'aws' },
    async (span) => {
      const command = new ConverseStreamCommand({ modelId: config.BEDROCK_MODEL_ID, messages });
      const response = await client.send(command);
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of response.stream) {
        const delta = chunk.contentBlockDelta?.delta?.text;
        if (delta) { fullText += delta; res.write(`data: ${JSON.stringify({ text: delta })}\n\n`); }
        // ConverseStream emits token counts in messageStop event metadata
        if (chunk.metadata?.usage) {
          inputTokens = chunk.metadata.usage.inputTokens ?? 0;
          outputTokens = chunk.metadata.usage.outputTokens ?? 0;
        }
      }
      tracer.llmobs.annotate(span, {
        inputData: messages.map(m => ({ role: m.role, content: String(m.content) })),
        outputData: { role: 'assistant', content: fullText },
        metrics: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      });
      return fullText;
    }
  );
}
```

### Pattern 2: Bedrock Auto-Instrumentation — What It Does and Does Not Capture

**What:** `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true` causes dd-trace to monkey-patch `@aws-sdk/client-bedrock-runtime` and auto-create LLM spans for every Bedrock call. These spans capture model ID, latency, and token counts automatically.

**Limitation with ConverseStream:** Auto-instrumentation may not reliably extract token counts from streaming responses because token usage is emitted in a trailing `metadata` event at the end of the stream. Wrapping `ConverseStreamCommand` in an explicit `tracer.llmobs.trace()` span (as shown in Pattern 1) lets you extract token counts from the metadata event yourself and call `annotate()` with exact values.

**Implication:** You may see *two* LLM spans for Bedrock — one auto-instrumented and one from the manual `tracer.llmobs.trace()` wrapper. This is acceptable for the demo. If duplicate spans appear and are confusing, remove the manual Bedrock wrapper and rely on auto-instrumentation only; confirm token counts appear before the demo.

**Env vars that control auto-instrumentation:**
```bash
DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true  # enable Bedrock plugin
DD_LLMOBS_ENABLED=1                            # enable LLM Observability layer
DD_LLMOBS_ML_APP=ai-dm                         # ML app name (required)
DD_LLMOBS_AGENTLESS_ENABLED=1                  # send direct to Datadog (no local agent)
DD_API_KEY=<real key>                          # required for agentless mode
DD_SITE=datadoghq.com                          # target Datadog site
```

### Pattern 3: Programmatic Dashboard via @datadog/datadog-api-client

**What:** A one-shot TypeScript script that creates a Datadog dashboard with three widgets using the official Datadog TypeScript API client.

**Required credentials:**
- `DD_API_KEY` — already in env
- `DD_APP_KEY` — Application Key (NOT the same as API key); create in Datadog Organization Settings > API Keys

**Widget types to use:**
1. `timeseries` — token usage over time (LLM Observability metrics or APM trace metrics)
2. `timeseries` — request latency p95 (APM `trace.express.request` metrics)
3. `list_stream` with `data_source: 'trace_stream'` — trace waterfall feed

**Example:**
```typescript
// Source: https://github.com/DataDog/datadog-api-client-typescript/tree/master/examples/v1/dashboards
// scripts/create-dashboard.ts
import * as client from '@datadog/datadog-api-client';
import { v1 } from '@datadog/datadog-api-client';

const configuration = client.createConfiguration();  // reads DD_API_KEY, DD_APP_KEY from env
const api = new v1.DashboardsApi(configuration);

const dashboard: v1.Dashboard = {
  title: '[Hackathon] AI Dungeon Master - LLM Observability',
  layoutType: 'ordered',
  widgets: [
    {
      definition: {
        type: 'timeseries',
        title: 'Token Usage (input + output)',
        requests: [{
          displayType: 'bars',
          queries: [{
            name: 'input_tokens',
            dataSource: 'metrics',
            query: 'sum:trace.aws.bedrock.converse_stream{service:server,env:development}.as_count()',
          }],
          responseFormat: 'timeseries',
        }],
      },
    },
    {
      definition: {
        type: 'timeseries',
        title: 'Request Latency p95 (ms)',
        requests: [{
          displayType: 'line',
          queries: [{
            name: 'latency',
            dataSource: 'metrics',
            query: 'p95:trace.express.request{service:server,env:development}',
          }],
          responseFormat: 'timeseries',
        }],
      },
    },
    {
      definition: {
        type: 'list_stream',
        title: 'Live Traces',
        requests: [{
          responseFormat: 'event_list',
          query: {
            dataSource: 'trace_stream',
            queryString: 'service:server env:development',
          },
          columns: [
            { field: 'resource_name', width: 'auto' },
            { field: '@duration',     width: 'auto' },
          ],
        }],
      },
    },
  ],
};

const result = await api.createDashboard({ body: dashboard });
console.log('Dashboard URL:', result.url);
```

**Run the script:**
```bash
DD_API_KEY=<key> DD_APP_KEY=<app-key> npx tsx scripts/create-dashboard.ts
```

### Anti-Patterns to Avoid

- **Using `tracer.startSpan()` for LLMObs spans:** `startSpan()` creates APM spans that appear in the APM trace waterfall but NOT in the Datadog LLM Observability UI. You must use `tracer.llmobs.trace()` or `tracer.llmobs.wrap()`.
- **Setting `DD_TRACE_DEBUG=true` in agentless mode:** This causes floods of ECONNREFUSED log lines to stderr (APM layer still trying port 8126). LLM spans arrive at Datadog regardless; the errors are cosmetic noise. Remove this env var.
- **Running the dashboard create script before any traces exist:** The `trace_stream` widget will render empty or may fail to resolve the service. Run the 3-turn demo flow at least once to generate traces, then run the script.
- **Annotating spans inside the callback after the promise resolves:** `annotate()` must be called *before* the callback returns (the span is finished on return). Call `annotate()` synchronously in the callback after data is available.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sending spans to Datadog | Custom HTTP calls to Datadog intake | `dd-trace` with `NODE_OPTIONS` bootstrap | dd-trace handles sampling, batching, retry, W3C trace context, LLM schema |
| Creating dashboards | Clicking through Datadog UI | `@datadog/datadog-api-client` script | Dashboard JSON is reproducible; needed for judging |
| Capturing Bedrock token counts | Custom response interceptor | `tracer.llmobs.annotate(span, { metrics: { inputTokens, outputTokens } })` | Pattern already established; don't re-invent |
| Tagging spans with error info | Manual `span.setTag('error', ...)` | Throw inside `tracer.llmobs.trace()` callback | dd-trace auto-captures rejected promise as span error |

**Key insight:** dd-trace's LLMObs API handles the entire span lifecycle — no manual `span.finish()` calls are needed when using the callback form of `tracer.llmobs.trace()`.

---

## Common Pitfalls

### Pitfall 1: DD_APP_KEY Missing for Dashboard Script

**What goes wrong:** `@datadog/datadog-api-client` calls fail with 403 Forbidden when `DD_APP_KEY` is not set. The API key alone is insufficient for dashboard creation.

**Why it happens:** Datadog requires Application Keys (not API Keys) for management plane operations like creating dashboards. These are separate credentials.

**How to avoid:** Add `DD_APP_KEY=` to `.env.example` with a comment explaining it's required for the dashboard script. Create the Application Key in Datadog Organization Settings > Application Keys before running the script.

**Warning signs:** `403 Forbidden` or `{"errors":["Forbidden"]}` response from Datadog API.

### Pitfall 2: Agentless ECONNREFUSED Spam

**What goes wrong:** When `DD_LLMOBS_AGENTLESS_ENABLED=1` and no local Datadog Agent is on port 8126, the server logs repeat `Error: connect ECONNREFUSED 127.0.0.1:8126` at trace-send intervals.

**Why it happens:** `DD_LLMOBS_AGENTLESS_ENABLED` only makes the LLMObs layer send directly to Datadog cloud. The APM layer within dd-trace still attempts to send APM spans to the local agent. This is by design in dd-trace 5.x and may persist until a future architectural separation.

**How to avoid:** Do not set `DD_TRACE_DEBUG=true`. The ECONNREFUSED errors are logged only at debug level without it. LLM spans still arrive at Datadog correctly. Confirmed by Datadog team in GitHub issue #5441.

**Warning signs:** Flood of `Error sending payload to the agent` in stderr despite spans appearing in Datadog UI.

### Pitfall 3: Blank DD_API_KEY Causes Silent Agentless Failure

**What goes wrong:** If `DD_API_KEY` is an empty string (not undefined), agentless mode silently sends requests with an empty auth header. No error is thrown at startup. LLM spans never appear in Datadog.

**Why it happens:** dd-trace's agentless sender uses the API key as an HTTP header value. Empty string is truthy enough to pass JS checks but fails Datadog auth silently.

**How to avoid:** The config.ts `warnOnBlankConfig(['DD_API_KEY', 'DD_LLMOBS_ML_APP'], ...)` call already in `index.ts` warns on blank values. Treat this warning as a blocking issue before running the smoke test.

**Warning signs:** No spans appearing in Datadog LLM Observability despite server running and ECONNREFUSED absent.

### Pitfall 4: dd-trace Bootstrap Not Applied to dev Script

**What goes wrong:** If `NODE_OPTIONS` is dropped from the dev script, auto-instrumentation silently fails. The server starts, requests complete, but no spans appear.

**Why it happens:** dd-trace must initialize before any imports. Without `NODE_OPTIONS='--import dd-trace/initialize.mjs'`, the AWS SDK is imported first and patching never fires.

**How to avoid:** Verify the `package.json` dev script contains `NODE_OPTIONS='--import dd-trace/initialize.mjs'`. The project already has this — do not remove it when editing the start command.

**Warning signs:** No spans in Datadog APM after sending requests. No `[dd-trace] Initialized` startup message.

### Pitfall 5: tracer.llmobs.annotate() Called After Span Finishes

**What goes wrong:** `annotate()` called on a span that has already finished (e.g., after the async callback returned) silently drops the annotation. The span appears in Datadog with no input/output data.

**Why it happens:** `tracer.llmobs.trace()` finishes the span when the async callback's promise resolves. Any `annotate()` call after that point targets a finished span.

**How to avoid:** Call `annotate()` synchronously at the end of the callback body, before the final `return` statement.

**Warning signs:** Spans appear in LLM Observability but show no input data, output data, or token metrics.

### Pitfall 6: Duplicate Bedrock Spans (Auto + Manual)

**What goes wrong:** If you add a `tracer.llmobs.trace({ kind: 'llm', name: 'bedrock.dm_response' })` wrapper around the ConverseStreamCommand AND `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true` is set, two LLM spans appear for each Bedrock call.

**Why it happens:** Both the auto-instrumentation plugin and the manual wrapper create LLM spans independently.

**How to avoid:** Decide one approach. For the demo, the manual wrapper is preferred because it can explicitly capture token counts from the streaming `metadata` event. If token counts appear correctly in the auto-instrumented span, remove the manual wrapper.

**Warning signs:** Two LLM spans per chat turn in the trace waterfall, both named for Bedrock.

---

## Code Examples

### Full LLMObs Span Pattern (tool kind, for neo4j and TTS)

```typescript
// Source: https://datadoghq.dev/dd-trace-js/interfaces/llmobs.LLMObs.html
import tracer from 'dd-trace';

export async function queryLore(entities: string[]): Promise<LoreResult[]> {
  return tracer.llmobs.trace(
    { kind: 'tool', name: 'neo4j.lore_query' },
    async (span) => {
      const { records } = await driver.executeQuery(
        `MATCH (n WHERE n.name IN $entities)-[r*1..2]-(related) RETURN n, r, related LIMIT 10`,
        { entities }
      );
      tracer.llmobs.annotate(span, {
        inputData: JSON.stringify({ entities }),
        outputData: JSON.stringify({ recordCount: records.length }),
        tags: { 'db.system': 'neo4j' },
      });
      return mapRecords(records);
    }
  );
}
```

### Bedrock LLM Span with Explicit Token Metrics

```typescript
// Source: deepwiki.com/DataDog/dd-trace-js/3.6-aiml-instrumentation + AWS ConverseStream API docs
import tracer from 'dd-trace';

export async function streamBedrockResponse(messages: Message[], res: Response): Promise<string> {
  return tracer.llmobs.trace(
    {
      kind: 'llm',
      name: 'bedrock.dm_response',
      modelName: config.BEDROCK_MODEL_ID,
      modelProvider: 'aws',
    },
    async (span) => {
      const command = new ConverseStreamCommand({
        modelId: config.BEDROCK_MODEL_ID,
        messages,
        system: [{ text: DM_SYSTEM_PROMPT }],
      });
      const response = await client.send(command);
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of response.stream) {
        const delta = chunk.contentBlockDelta?.delta?.text;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
        }
        if (chunk.metadata?.usage) {
          inputTokens = chunk.metadata.usage.inputTokens ?? 0;
          outputTokens = chunk.metadata.usage.outputTokens ?? 0;
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();

      // Annotate BEFORE the callback returns (span finishes on return)
      tracer.llmobs.annotate(span, {
        inputData: messages.map(m => ({ role: m.role, content: String(m.content) })),
        outputData: { role: 'assistant', content: fullText },
        metrics: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      });

      return fullText;
    }
  );
}
```

### Dashboard Script Skeleton

```typescript
// Source: https://github.com/DataDog/datadog-api-client-typescript/tree/master/examples/v1/dashboards
// scripts/create-dashboard.ts
import * as ddClient from '@datadog/datadog-api-client';
import { v1 } from '@datadog/datadog-api-client';

// Reads DD_API_KEY and DD_APP_KEY from environment by default
const configuration = ddClient.createConfiguration();
const dashApi = new v1.DashboardsApi(configuration);

async function main() {
  const result = await dashApi.createDashboard({
    body: {
      title: '[Hackathon] AI Dungeon Master — LLM Observability',
      layoutType: 'ordered',
      templateVariables: [
        { name: 'env',     defaults: ['development'] },
        { name: 'service', defaults: ['server'] },
      ],
      widgets: [
        // Widget 1: token usage timeseries (APM metric — adjust name after confirming in Datadog)
        {
          definition: {
            type: 'timeseries',
            title: 'Bedrock Token Usage',
            requests: [{
              displayType: 'bars',
              queries: [{
                name: 'q1',
                dataSource: 'metrics',
                query: 'sum:trace.aws.bedrockruntime.converse_stream{service:$service,env:$env}.as_count()',
              }],
              responseFormat: 'timeseries',
            }],
          },
        },
        // Widget 2: request latency timeseries
        {
          definition: {
            type: 'timeseries',
            title: 'Chat Request Latency p95',
            requests: [{
              displayType: 'line',
              queries: [{
                name: 'q1',
                dataSource: 'metrics',
                query: 'p95:trace.express.request{service:$service,env:$env,resource_name:POST_/chat}',
              }],
              responseFormat: 'timeseries',
            }],
          },
        },
        // Widget 3: live trace waterfall
        {
          definition: {
            type: 'list_stream',
            title: 'Live Traces',
            requests: [{
              responseFormat: 'event_list',
              query: {
                dataSource: 'trace_stream',
                queryString: 'service:$service env:$env',
              },
              columns: [
                { field: 'resource_name', width: 'auto' },
                { field: '@duration',     width: 'auto' },
                { field: 'status',        width: 'auto' },
              ],
            }],
          },
        },
      ],
    },
  });
  console.log('Created dashboard:', result.url);
}

main().catch(err => { console.error(err); process.exit(1); });
```

### Smoke-Test Verification Steps

```bash
# 1. Start server with all DD_ env vars populated
npm run dev -w server

# 2. Send one chat request
curl -X POST http://localhost:3001/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "We arrive at the tavern."}'

# 3. Check Datadog LLM Observability UI
# https://app.datadoghq.com/llm/traces
# Expected: one LLM span for Bedrock, child spans for neo4j.lore_query
# Span should show model_id, input_tokens, output_tokens, latency

# 4. Check APM trace waterfall
# https://app.datadoghq.com/apm/traces
# Expected: trace with root HTTP span > child tool spans > LLM span
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import tracer from 'dd-trace'; tracer.init()` at top of index.ts | `NODE_OPTIONS='--import dd-trace/initialize.mjs'` | dd-trace 4.x+ | Import-order-independent; ESM-safe |
| Manual `span.finish()` in finally | `tracer.llmobs.trace(opts, async (span) => {})` callback | dd-trace 5.x | No manual finish needed; promise-aware |
| `tracer.llmobs.enable()` programmatic init | All config via env vars + bootstrap file | dd-trace 5.x | Simpler; no in-code init required |
| Clicking dashboards in Datadog UI | `@datadog/datadog-api-client` script | Ongoing | Reproducible; version-controlled |

**Deprecated/outdated:**
- `tracer.init({ llmobs: { mlApp, agentlessEnabled } })` in code: still supported but env var approach (`NODE_OPTIONS` + DD_ vars) is preferred for this project — avoids import-order issues in ESM.

---

## Open Questions

1. **Exact APM metric name for Bedrock ConverseStream token counts**
   - What we know: `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true` auto-instruments Bedrock; token counts are captured as span tags and emitted as DogStatsD metrics; the metric name pattern is likely `trace.aws.bedrockruntime.converse_stream`
   - What's unclear: The exact Datadog metric name that appears after the first real trace. The auto-instrumented metric name must be verified by checking Metrics Explorer after the smoke test.
   - Recommendation: After smoke test, navigate to Datadog Metrics Explorer and search `aws.bedrockruntime` or `trace.aws.bedrockruntime` to find the actual metric name. Update the dashboard script query before the demo.

2. **Duplicate span behavior: auto-instrumented + manual bedrock.dm_response**
   - What we know: Both auto-instrumentation and the manual `tracer.llmobs.trace()` wrapper will create LLM spans for the same Bedrock call.
   - What's unclear: Whether they appear as siblings or parent/child in the trace waterfall; which one surfaces in LLM Observability.
   - Recommendation: Run the smoke test, inspect the trace waterfall. If duplicates are confusing, remove the manual Bedrock wrapper and rely on auto-instrumentation; annotate token counts differently.

3. **DD_APP_KEY provisioning**
   - What we know: Required for `@datadog/datadog-api-client` dashboard creation; distinct from DD_API_KEY; created in Datadog Organization Settings.
   - What's unclear: Whether the hackathon team has one, or if one needs to be created.
   - Recommendation: Add `DD_APP_KEY=` to `.env.example` as part of Plan 06-03; require it to be set before running the dashboard script.

---

## Sources

### Primary (HIGH confidence)
- `https://datadoghq.dev/dd-trace-js/interfaces/llmobs.LLMObs.html` — LLMObs interface: trace(), annotate(), wrap(), exportSpan()
- `https://datadoghq.dev/dd-trace-js/interfaces/export_.llmobs.LLMObsNamedSpanOptions.html` — span kind and options
- `https://github.com/DataDog/datadog-api-client-typescript` — @datadog/datadog-api-client package, DashboardsApi usage pattern
- `https://github.com/DataDog/dd-trace-js/blob/master/docs/API.md` — tracer.startSpan(), scope.activate() patterns

### Secondary (MEDIUM confidence)
- `https://deepwiki.com/DataDog/dd-trace-js/3.6-aiml-instrumentation` — AI/ML instrumentation specifics: span kinds (tool, llm, workflow, agent, retrieval, embedding), Bedrock env vars, LLMObs.trace() callback pattern
- `https://github.com/DataDog/datadog-api-client-typescript/tree/master/examples/v1/dashboards` — 94 dashboard creation examples; DashboardsApi.createDashboard() pattern confirmed
- `https://github.com/DataDog/dd-trace-js/issues/5441` — Agentless ECONNREFUSED is cosmetic; LLM spans still arrive; workaround: don't use DD_TRACE_DEBUG=true
- `https://github.com/DataDog/dd-trace-js/issues/5208` — DD_LLMOBS_AGENTLESS_ENABLED controls only LLMObs layer; APM still routes to agent
- Datadog APM metrics search results — `trace.express.request` metric exists with `service`, `env`, `resource_name` tags; latency percentiles available

### Tertiary (LOW confidence)
- ConverseStream token count auto-capture behavior — inferred from deepwiki source and community search; the exact metric name and whether streaming fully captures token counts needs smoke-test verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dd-trace 5.86.0 already installed; @datadog/datadog-api-client installation confirmed via official GitHub
- Architecture (LLMObs spans): HIGH — tracer.llmobs.trace() API verified from official dd-trace API docs
- Bedrock auto-instrumentation token counts: MEDIUM — behavior documented in deepwiki (secondary); exact metric name needs smoke-test verification
- Dashboard API: MEDIUM — DashboardsApi.createDashboard() confirmed via official TypeScript client docs; exact widget JSON schema verified via search and list_stream issue
- Pitfalls (agentless ECONNREFUSED, annotate-after-finish): HIGH — verified via official GitHub issues

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (dd-trace is fast-moving; check GitHub releases if implementing > 30 days from now)
