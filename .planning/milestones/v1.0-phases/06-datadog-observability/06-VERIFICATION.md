---
phase: 06-datadog-observability
verified: 2026-02-21T00:11:23Z
status: gaps_found
score: 3/5 must-haves verified
gaps:
  - truth: "Three named custom spans are visible in the trace waterfall: neo4j.lore_query, minimax.tts, bedrock.dm_response"
    status: partial
    reason: "neo4j.lore_query span is defined in neo4j.ts but queryLore() is never imported or called from any route, service, or pipeline code. The span wrapper exists but will never fire during the demo. minimax.tts and bedrock.dm_response are correctly wired."
    artifacts:
      - path: "server/src/services/neo4j.ts"
        issue: "queryLore() is exported but never imported anywhere in the server codebase"
      - path: "server/src/routes/chat.ts"
        issue: "Does not import or call queryLore — no RAG pipeline integration"
    missing:
      - "Import queryLore in server/src/routes/chat.ts (or a dedicated RAG service)"
      - "Call queryLore with extracted entities before building Bedrock messages"
      - "Inject lore context into Bedrock prompt so the span actually fires during demo"
  - truth: "dd-trace auto-captures every Bedrock call — prompts, responses, token counts, and latency appear in Datadog LLM Observability without any manual span code"
    status: partial
    reason: "DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true is set in config and .env.example, and dd-trace bootstrap (NODE_OPTIONS) is in both dev and start scripts. However, the custom bedrock.dm_response span via tracer.llmobs.trace() DOES exist and will produce manual span data. Auto-instrumentation is configured correctly but cannot be verified programmatically without running the server against a live Datadog endpoint. Configuration is in place."
    artifacts: []
    missing:
      - "No code gap — this is a runtime/live verification item. See human_verification section."
human_verification:
  - test: "Start server with DD_API_KEY set, make a /api/chat POST, then check Datadog LLM Observability UI"
    expected: "bedrock.dm_response span appears in trace waterfall with inputTokens, outputTokens, and totalTokens populated"
    why_human: "Cannot verify live Datadog data ingestion programmatically"
  - test: "Check Datadog LLM Observability trace waterfall for neo4j.lore_query span"
    expected: "Will NOT appear until queryLore() is wired into the chat pipeline (gap above)"
    why_human: "Span will not fire — the gap must be fixed first"
  - test: "Run npm run create-dashboard with real DD_API_KEY and DD_APP_KEY, then open the returned URL"
    expected: "Dashboard at '[Hackathon] AI Dungeon Master - LLM Observability' loads with three widgets: Bedrock Token Usage, Chat Request Latency p95, Live Traces"
    why_human: "Cannot create a real Datadog dashboard without live API keys"
---

# Phase 6: Datadog Observability Verification Report

**Phase Goal:** Every Bedrock LLM call and pipeline stage is visible in a live Datadog dashboard during the demo
**Verified:** 2026-02-21T00:11:23Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | dd-trace auto-captures every Bedrock call — prompts, responses, token counts, latency in LLM Observability without manual span code | ? UNCERTAIN | DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true set in config.ts and .env.example; NODE_OPTIONS bootstrap in both dev/start scripts; custom bedrock.dm_response span also provides manual capture. Cannot verify live capture without running server. |
| 2 | Three named custom spans visible in trace waterfall: neo4j.lore_query, minimax.tts, bedrock.dm_response | PARTIAL | bedrock.dm_response: WIRED (tracer.llmobs.trace in bedrock.ts, called from chat.ts). minimax.tts: WIRED (tracer.llmobs.trace in tts.ts, called from narrate.ts). neo4j.lore_query: ORPHANED — span defined in neo4j.ts but queryLore() is never imported or called anywhere. |
| 3 | A Datadog dashboard is live and shows token usage timeseries, request latency, and trace waterfall for the past 15 minutes | ? UNCERTAIN | scripts/create-dashboard.ts exists and is substantive (108 lines); defines all three required widgets; script must be run with real API keys — cannot verify live dashboard programmatically. |
| 4 | Dashboard defined and managed programmatically via the Datadog API (not hand-configured in the UI) | VERIFIED | scripts/create-dashboard.ts uses @datadog/datadog-api-client v1.DashboardsApi.createDashboard(); npm run create-dashboard script in root package.json. |
| 5 | annotate() called BEFORE tracer.llmobs.trace() callback returns in every span | VERIFIED | bedrock.ts line 116, neo4j.ts line 43, tts.ts line 68 — all annotate calls precede the return statement inside the llmobs.trace() callback. |

**Score:** 3/5 truths verified (2 verified, 2 uncertain/needs human, 1 partial with gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/services/bedrock.ts` | bedrock.dm_response LLMObs span wrapping ConverseStream | VERIFIED | tracer.llmobs.trace({ kind: 'llm', name: 'bedrock.dm_response', modelName, modelProvider: 'aws' }) at line 80; annotate() at line 116 with inputData, outputData, metrics (inputTokens, outputTokens, totalTokens) |
| `server/src/services/neo4j.ts` | neo4j.lore_query LLMObs span wrapping lore queries | STUB/ORPHANED | tracer.llmobs.trace({ kind: 'tool', name: 'neo4j.lore_query' }) exists at line 22; real Cypher query inside callback; annotate() at line 43. However, queryLore() is NEVER imported or called from any other file. Span will never fire. |
| `server/src/services/tts.ts` | minimax.tts LLMObs span wrapping TTS call | VERIFIED | tracer.llmobs.trace({ kind: 'tool', name: 'minimax.tts' }) at line 11; full MiniMax API call inside callback; annotate() at line 68 |
| `.env.example` | DD_APP_KEY declaration | VERIFIED | Line 21: DD_APP_KEY= with comment "Application Key (NOT API Key) — required for scripts/create-dashboard.ts. Create in Datadog Org Settings > Application Keys." |
| `scripts/create-dashboard.ts` | Programmatic Datadog dashboard creation | VERIFIED | 108 lines; createDashboard() called; three widgets (timeseries x2, list_stream x1); template variables for env and service; 403 error hint; header comment about pre-demo run requirement |
| `server/package.json` | @datadog/datadog-api-client devDependency | VERIFIED | "@datadog/datadog-api-client": "^1.52.0" in devDependencies |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server/src/services/bedrock.ts | dd-trace LLMObs | tracer.llmobs.trace({ kind: 'llm', name: 'bedrock.dm_response' }) | WIRED | Pattern found at line 80; imported from chat.ts at line 2; called at line 49 of chat.ts |
| server/src/services/neo4j.ts | dd-trace LLMObs | tracer.llmobs.trace({ kind: 'tool', name: 'neo4j.lore_query' }) | ORPHANED | Pattern found at line 22 of neo4j.ts; queryLore exported but zero imports anywhere in server/src/ — not wired into any route or service |
| server/src/services/tts.ts | dd-trace LLMObs | tracer.llmobs.trace({ kind: 'tool', name: 'minimax.tts' }) | WIRED | Pattern found at line 11; imported in narrate.ts at line 2; called at line 16 of narrate.ts |
| scripts/create-dashboard.ts | @datadog/datadog-api-client | v1.DashboardsApi.createDashboard() | WIRED | createDashboard at line 93; client.createConfiguration() at line 13 |
| scripts/create-dashboard.ts | DD_API_KEY + DD_APP_KEY | createConfiguration() reads from env | WIRED | Line 13; ddClient.createConfiguration() reads both keys automatically from process.env |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DD-01: dd-trace auto-instrumentation bootstrap | SATISFIED | NODE_OPTIONS='--import dd-trace/initialize.mjs' in both dev and start scripts; DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true configured |
| DD-02: Three named custom spans (neo4j.lore_query, minimax.tts, bedrock.dm_response) | PARTIAL | bedrock.dm_response and minimax.tts are wired; neo4j.lore_query span exists but queryLore() is orphaned — never called |
| DD-03: Live dashboard with token usage timeseries, request latency, trace waterfall | NEEDS HUMAN | Script exists and is correct; must be run with real API keys against live Datadog |
| DD-04: Dashboard managed programmatically via Datadog API | SATISFIED | scripts/create-dashboard.ts uses @datadog/datadog-api-client, not hand-configured |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/src/services/neo4j.ts | 14-16 | TODO comment: "TODO (Phase 5 RAG): Replace the stub query with real entity extraction and Cypher traversal logic" | BLOCKER | The function is never called — not just incomplete but entirely unwired. The neo4j.lore_query span will not appear in the demo trace waterfall. |

### Human Verification Required

#### 1. Bedrock Span in Datadog LLM Observability

**Test:** Start the server with DD_API_KEY, DD_LLMOBS_ML_APP, and DD_LLMOBS_AGENTLESS_ENABLED=1 set. Send a POST to /api/chat. Open Datadog LLM Observability.
**Expected:** A bedrock.dm_response span appears in the trace waterfall with inputTokens, outputTokens, and totalTokens populated. The span kind is 'llm'. The Bedrock model name is visible.
**Why human:** Cannot verify live Datadog data ingestion without real API keys and a running server.

#### 2. Auto-instrumentation of ConverseStream (DD-01)

**Test:** In Datadog APM, look for traces from aws.bedrockruntime.converse_stream alongside the custom bedrock.dm_response span.
**Expected:** Both appear — the auto-instrumented AWS SDK span and the custom LLMObs span. Token counts are visible in LLM Observability.
**Why human:** Auto-instrumentation requires a live Datadog agent and real traffic.

#### 3. Dashboard Creation

**Test:** Run `DD_API_KEY=<key> DD_APP_KEY=<app-key> npm run create-dashboard` from the project root.
**Expected:** Terminal prints "Dashboard created: https://app.datadoghq.com/dashboard/..." and the URL opens a dashboard with three widgets: Bedrock Token Usage, Chat Request Latency p95, Live Traces.
**Why human:** Requires real Datadog credentials; cannot call the API programmatically without them.

## Gaps Summary

One gap blocks full goal achievement:

**neo4j.lore_query span is orphaned.** The span wrapper exists correctly in `server/src/services/neo4j.ts`, but the `queryLore()` function is never imported or called from any route, service, or middleware. The RAG pipeline (Phase 5) was supposed to wire this in, but `server/src/routes/chat.ts` calls `streamBedrockResponse()` directly with no entity extraction or lore injection step. The `app.ts` receives the Neo4j driver but passes it to `createApp()` which never routes it to the chat handler.

During a demo run, exactly two of three required custom spans will fire: `bedrock.dm_response` (via chat route) and `minimax.tts` (via narrate route). The `neo4j.lore_query` span will never appear in the trace waterfall, which directly contradicts success criterion 2: "Three named custom spans are visible in the trace waterfall."

The fix requires wiring: import `queryLore` in chat.ts (or a new RAG service), extract entities from the user message, call `queryLore(driver, entities)`, and inject the result into the Bedrock prompt. The driver is already available in `index.ts` but is not passed into the chat route handler.

---

_Verified: 2026-02-21T00:11:23Z_
_Verifier: Claude (gsd-verifier)_
