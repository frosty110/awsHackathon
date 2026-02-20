# Pitfalls Research

**Domain:** AI Chat App — AWS Bedrock + Datadog LLM Observability + Neo4j AuraDB + MiniMax TTS
**Researched:** 2026-02-20
**Confidence:** MEDIUM — Core findings verified against official docs and multiple sources. MiniMax-specific findings are MEDIUM/LOW due to limited official documentation coverage.

---

## Critical Pitfalls

### Pitfall 1: Datadog dd-trace Loaded After Other Modules

**What goes wrong:**
`dd-trace` uses monkey-patching to instrument Node.js modules (http, express, etc.). If any instrumented module loads before `dd-trace` initializes, that module's patches don't apply. You get a running app with zero traces in Datadog — the dashboard is empty during the live judge demo.

**Why it happens:**
Developers write `require('dd-trace').init()` somewhere inside `app.js` or `server.js` after importing express, which defeats the entire instrumentation system. The mistake is also common when switching from CommonJS to ES modules, where import order is not always obvious.

**How to avoid:**
Use the `NODE_OPTIONS` environment variable approach so the tracer loads before any application code runs:
```bash
NODE_OPTIONS='--require dd-trace/init' node server.js
```
Or for ESM:
```bash
NODE_OPTIONS='--import dd-trace/initialize.mjs' node server.js
```
Set these env vars in `.env` and your `package.json` start script. Never rely on in-code require order.

Required environment variables (all must be set before the process starts):
- `DD_LLMOBS_ENABLED=1`
- `DD_LLMOBS_ML_APP=<app-name>`
- `DD_API_KEY=<your-key>`
- `DD_LLMOBS_AGENTLESS_ENABLED=1` (required if not running Datadog Agent locally — which you won't be in a hackathon)
- `DD_SITE=datadoghq.com`

**Warning signs:**
- No traces appear in Datadog LLM Observability after 2+ minutes of requests
- APM service map shows no services
- `DD_LLMOBS_AGENTLESS_ENABLED` missing when no local Agent is running causes silent failure

**Phase to address:**
Environment setup / Phase 1 (foundation). Wire up and validate Datadog with a smoke-test request before building features. Do not defer observability to "after the app works."

---

### Pitfall 2: AWS Bedrock Model Access Not Enabled for the Region

**What goes wrong:**
Calling `InvokeModelCommand` returns `AccessDeniedException` or `ValidationException` even with correct IAM credentials. The model exists but hasn't been explicitly enabled for the account/region combination. For Anthropic Claude models specifically, a one-time use-case submission is required through the Bedrock Model Catalog.

**Why it happens:**
AWS Bedrock requires per-model, per-region access enablement. IAM `AmazonBedrockFullAccess` is necessary but not sufficient — you also need the model access grant. Hackathon teams burn 30-60 minutes diagnosing this as a credentials issue.

**How to avoid:**
Do this on Day 0 (before the hackathon starts):
1. Log into the AWS Console
2. Navigate to Amazon Bedrock → Model Catalog
3. Find your target Claude model (e.g., `claude-3-5-sonnet-20241022-v2:0`)
4. Click "Request access" and complete the use case form
5. Access is granted immediately after submission (as of 2025)
6. Verify with: `aws bedrock list-foundation-models --region us-east-1`

Also confirm the model ID format exactly. The correct format for SDK calls uses inference profiles for on-demand usage, not bare model IDs. Wrong: `anthropic.claude-3-sonnet`. Right: `anthropic.claude-3-5-sonnet-20241022-v2:0`.

**Warning signs:**
- `AccessDeniedException: You don't have access to the model with the specified model ID`
- `ResourceNotFoundException` when calling InvokeModel
- Model listed in console but "Access status: Available to request" rather than "Access granted"

**Phase to address:**
Pre-hackathon checklist. This cannot be fixed during build time if AWS takes any unexpected time. Verify access with a one-line test script before the clock starts.

---

### Pitfall 3: Neo4j AuraDB Wrong Connection URI Scheme

**What goes wrong:**
Using `neo4j://` or `bolt://` instead of `neo4j+s://` for AuraDB connections causes SSL handshake failures or silent connection errors. The driver connects but queries fail, or the driver refuses to connect at all.

**Why it happens:**
Local Neo4j development uses `bolt://localhost:7687` (no encryption). AuraDB is cloud-hosted and requires TLS — the `+s` suffix enables SSL. Developers copy connection patterns from local development guides and apply them to AuraDB.

**How to avoid:**
Always use `neo4j+s://` for AuraDB:
```javascript
const driver = neo4j.driver(
  'neo4j+s://xxxxxx.databases.neo4j.io',
  neo4j.auth.basic(USER, PASSWORD)
)
await driver.verifyConnectivity()  // Fail fast — don't wait for first query
```

Use the Dotenv file that AuraDB provides on instance creation — it contains the exact correct URI format. Call `verifyConnectivity()` immediately after driver creation, not before the first query.

Create exactly ONE driver instance for the lifetime of the app. The driver is expensive to instantiate and is thread-safe — recreating it per request will exhaust connections.

**Warning signs:**
- `ServiceUnavailable: Could not perform discovery` during startup
- SSL certificate errors in logs
- Connection works locally against a local Neo4j instance but fails against AuraDB

**Phase to address:**
Phase 1 (database setup). The connection string and `verifyConnectivity()` call should be validated as the very first database integration test.

---

### Pitfall 4: MiniMax TTS Non-Streaming API Blocks for Full Audio Duration

**What goes wrong:**
The non-streaming MiniMax TTS endpoint waits until the entire audio file is generated before returning a response. For a DM narrating 3-4 sentences, this can be 3-6+ seconds of blocking time. The user sees nothing happening and assumes the app is broken.

**Why it happens:**
The MiniMax API's basic `/v1/audio/synthesis` endpoint is synchronous and returns the complete audio as a hex-encoded string in the response body. Developers assume it will start streaming chunks immediately, but it does not.

**How to avoid:**
Use the streaming endpoint variant which uses Server-Sent Events (SSE). Be aware that even with streaming, "the TTS API would not start responding until the entire audio is generated" for the first chunk — so streaming reduces perceived latency but does not eliminate it.

Mitigation strategy for the hackathon:
1. Show a typing indicator / "The Dungeon Master is speaking..." UI state immediately on LLM response
2. Generate TTS in parallel with streaming the text back to the client
3. Keep DM narration segments short (1-2 sentences per TTS call) to reduce generation time
4. Cache audio for repeated phrases (e.g., "Roll for initiative")

Audio response is hex-encoded — you must decode it:
```javascript
const audioBuffer = Buffer.from(response.data.audio, 'hex')
```
Forgetting this step produces unplayable audio.

**Warning signs:**
- Frontend hangs for 3-8 seconds after receiving LLM text before audio plays
- Judges see the game "pause" after every interaction
- Console shows the TTS call taking >3000ms

**Phase to address:**
Phase 2 (feature integration). Architect the TTS call as non-blocking from the start — don't build it synchronously and plan to "fix it later."

---

### Pitfall 5: Datadog LLM Observability Dashboard Empty at Demo Time

**What goes wrong:**
Judges want to see a live Datadog dashboard with real traces, latency metrics, and LLM span data. The team opens the dashboard and it shows "No Data." This kills the observability demonstration entirely.

**Why it happens:**
Multiple independent failure modes converge:
1. `DD_LLMOBS_AGENTLESS_ENABLED` not set (no local Datadog Agent running in hackathon env)
2. `DD_SITE` set to wrong region (e.g., `datadoghq.eu` instead of `datadoghq.com`)
3. LLM spans are created but exceed the 1MB payload limit — silently dropped
4. Dashboard was built before any data existed — widget queries reference metrics that never populated
5. Time range on dashboard set to "Last 1 hour" but demo only ran 5 minutes ago

**How to avoid:**
- Set all five required env vars (see Pitfall 1) and test them with a real request 30+ minutes before the demo
- Build Datadog dashboards AFTER generating real trace data, not before
- Use "Last 15 minutes" as the default time range for demo dashboards
- Keep LLM spans small — if you're logging full conversation history as span metadata, it will exceed 1MB for long sessions
- Save and screenshot the dashboard showing real data during development as a backup

**Warning signs:**
- Datadog console shows agent connectivity issues
- No services visible in APM Service Map after 5+ minutes of traffic
- LLM Observability tab shows "No traces found" despite requests completing

**Phase to address:**
Phase 1 (foundation). Validate observability with a "hello world" LLM call that shows up in Datadog before writing any game logic.

---

### Pitfall 6: Neo4j Session Not Closed — Connection Pool Exhaustion

**What goes wrong:**
Neo4j driver sessions are opened but not closed after use. The driver has a fixed connection pool. Under sustained use during a demo, the pool exhausts and new queries hang indefinitely waiting for a connection.

**Why it happens:**
JavaScript's async/await makes it easy to forget cleanup in error paths. If a Cypher query throws, the session's `.close()` call in a `finally` block is often missing.

**How to avoid:**
Always use try/finally:
```javascript
const session = driver.session()
try {
  const result = await session.run(query, params)
  return result
} finally {
  await session.close()  // Always runs, even on error
}
```
Or use `driver.executeRead()` / `driver.executeWrite()` which handle session lifecycle automatically (preferred in neo4j-driver v5+). The deprecated `.readTransaction()` / `.writeTransaction()` were removed in v5 — using them causes runtime errors.

**Warning signs:**
- Queries start timing out after 10-15 minutes of demo use
- Log shows "No connections available in the pool"
- App works fine under light testing but hangs under demo pressure

**Phase to address:**
Phase 1 (database layer). Establish the session management pattern in the first query and never deviate from it.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded AWS region in code | No env var setup | Breaks if deployed to different region | Never — use env var, 30-second fix |
| No error handling on Bedrock calls | Faster to write | LLM failures crash the entire request | Never — wrap in try/catch from day one |
| Single Neo4j session for all queries | Simpler code | Session state bleeds between requests | Never — use session-per-request pattern |
| Synchronous TTS call blocking response | Works correctly | 3-8s UI freeze on every DM message | MVP only — add async wrapper before demo |
| No conversation turn limit in graph | No design needed | AuraDB free tier hits storage/node limits | Acceptable for hackathon — add `LIMIT 20` to history queries |
| Storing full raw LLM responses in Datadog spans | Full context for debugging | 1MB payload limit silently drops spans | Acceptable to truncate to 500 chars for demo |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AWS Bedrock | Using bare model ID without checking on-demand vs. provisioned availability | Use inference profile IDs for on-demand; test with `aws bedrock list-foundation-models` before writing code |
| AWS Bedrock | Sending `body` as a plain JS object | `body` must be `JSON.stringify(payload)` — the SDK does NOT auto-serialize it |
| Datadog dd-trace | `require('dd-trace').init()` inside app.js after other imports | Use `NODE_OPTIONS='--require dd-trace/init'` in the start command |
| Datadog LLM Obs | Missing `DD_LLMOBS_AGENTLESS_ENABLED=1` when no local Agent | Required env var for hackathon local dev — without it, no LLM spans reach Datadog |
| Neo4j AuraDB | Using `bolt://` or `neo4j://` URI scheme | AuraDB requires `neo4j+s://` for TLS — the connection string from the AuraDB console is correct, don't modify it |
| Neo4j AuraDB | Creating multiple driver instances | Create one driver at app startup, reuse it; creating per-request is extremely expensive |
| MiniMax TTS | Treating hex-encoded audio response as a string | Response `.data.audio` is hex — must decode with `Buffer.from(hex, 'hex')` before sending to client |
| MiniMax TTS | Using deprecated or wrong model name | Verify current model name (e.g., `speech-02-hd`) in MiniMax docs — model names change between releases |
| Express + SSE | Missing `X-Accel-Buffering: no` header | If behind nginx/proxy, streaming chunks get buffered — set this header to force immediate flushing |
| React + SSE | Using `fetch()` instead of `EventSource` for SSE | `fetch()` doesn't natively handle SSE reconnection — use `EventSource` or `@microsoft/fetch-event-source` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential LLM + TTS calls | 5-12 second total response time per turn | Fire TTS after LLM text arrives, stream LLM text to UI in parallel | Every single interaction in the demo |
| No conversation context pruning in graph | Cypher queries slow as session grows | Add `LIMIT 20` on history retrieval queries | After ~30 turns in a single session |
| Fetching full graph traversal for context | 500ms+ Neo4j query latency | Only retrieve last N turns + active entity nodes | After 10+ connected entities in the graph |
| Awaiting every Datadog span flush | Adds 50-200ms per request | dd-trace flushes async — don't block on it | At scale, but also visible in demo |
| MiniMax TTS request for every LLM token | API rate limit exceeded quickly | Buffer complete DM response before sending TTS | After ~5 rapid interactions |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| AWS credentials in source code or git | Credential leak — account compromise | Use environment variables only; add `.env` to `.gitignore` immediately |
| Neo4j password hardcoded in connection string | Database exposure | Load from `process.env.NEO4J_PASSWORD` |
| MiniMax API key exposed in client-side code | API abuse charges | All MiniMax calls must go through the Express backend — never from the React frontend |
| Cypher injection via unsanitized user input | Data exfiltration or graph corruption | Always use parameterized Cypher: `session.run('MATCH (n) WHERE n.name = $name', { name: userInput })` |
| Datadog API key in frontend bundle | Monitoring data manipulation | API key is backend-only — set via env var on the server process |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state during LLM generation | User thinks app crashed during 2-4s wait | Show "The Dungeon Master is thinking..." immediately on submit |
| No loading state during TTS generation | Silent 3-6s pause before audio plays | Show audio waveform animation or "Speaking..." indicator |
| Streaming LLM text disappears when TTS plays | Confusing dual-channel experience | Keep text visible permanently as the session log |
| TTS auto-plays on every message without toggle | Judges/users can't mute if demo goes wrong | Add a visible audio toggle — default ON but easy to kill |
| No error message when Bedrock/TTS fails | App appears frozen | Display "The DM encountered an issue, please try again" with retry |

---

## "Looks Done But Isn't" Checklist

- [ ] **Datadog observability:** Dashboard shows data from a LIVE request, not just sample data. Verify LLM spans appear under LLM Observability → Traces — not just APM traces.
- [ ] **Bedrock integration:** Model access shows "Access granted" in AWS Console, not "Available to request." Test with actual Claude invocation — not just credential validation.
- [ ] **Neo4j session:** Every code path that opens a session has a `finally { await session.close() }` — including error paths. Verify the pool doesn't exhaust after 20 rapid requests.
- [ ] **MiniMax TTS audio:** Audio plays correctly in the browser — not just that the API returned 200. Hex decoding bugs produce a 200 response with unplayable audio.
- [ ] **SSE streaming:** LLM text streams token-by-token in the UI, visible during generation — not appearing all at once after the full response completes.
- [ ] **Environment variables:** All env vars load correctly in production-equivalent mode (not just hardcoded in dev). Run `npm start` from a clean shell with only `.env` to verify.
- [ ] **Graph persistence:** Neo4j data actually persists between server restarts — confirm AuraDB is being used, not an in-memory fallback.
- [ ] **CORS:** Frontend can reach Express API from the browser — not just from Postman. Test in the actual browser with the actual port combination.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bedrock model access not enabled | HIGH (blocks all LLM features) | Switch to direct Anthropic API (`@anthropic-ai/sdk`) as fallback — same API interface, just different client |
| Datadog dashboard empty at demo | MEDIUM | Pre-generate screenshots of working traces from dev session; explain you can show live after a request |
| Neo4j AuraDB connection failure | HIGH (blocks graph features) | Fall back to in-memory JS Map for session history — loses persistence but keeps demo functional |
| MiniMax TTS down/slow | LOW (graceful degrade) | Disable TTS, show text-only — DM without voice is still a functional demo |
| dd-trace import order wrong | MEDIUM (30-min fix) | Add `NODE_OPTIONS` to `.env` and package.json start script; restart app; verify traces appear |
| SSE streaming not working | MEDIUM | Fall back to polling every 500ms; delivers same content, worse UX but demo survives |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| dd-trace import order | Phase 1: Foundation Setup | `curl localhost:3000/health` appears as trace in Datadog LLM Obs within 60 seconds |
| Bedrock model access | Pre-hackathon (Day 0) | `aws bedrock invoke-model` CLI call returns valid Claude response |
| Neo4j AuraDB URI scheme | Phase 1: Database Setup | `driver.verifyConnectivity()` resolves without error at startup |
| Neo4j session leaks | Phase 1: Database layer | 50 rapid requests complete without connection pool errors |
| MiniMax TTS blocking | Phase 2: Feature Integration | TTS is triggered after LLM text starts streaming, not before |
| MiniMax hex decoding | Phase 2: Feature Integration | Audio plays correctly in browser — `<audio>` element has non-zero duration |
| Datadog empty at demo | Phase 1 + Demo prep | Screenshot of real traces saved as backup; dashboard pre-configured for 15-min window |
| Cypher injection | Phase 1: Database layer | All Cypher queries use parameterized `$variable` syntax — grep codebase for string concatenation |
| CORS for SSE streaming | Phase 2: Frontend integration | Browser DevTools Network tab shows SSE stream with correct `Content-Type: text/event-stream` |
| Credentials in source | Phase 1: Project setup | `.gitignore` includes `.env`; `git log --all -S "AWS_ACCESS"` returns no results |

---

## Sources

- Datadog LLM Observability Quickstart: https://docs.datadoghq.com/llm_observability/quickstart/ (MEDIUM confidence — official docs, page content partially unloadable)
- Datadog dd-trace Node.js tracing: https://docs.datadoghq.com/tracing/trace_collection/dd_libraries/nodejs/ (HIGH confidence — official docs)
- Datadog dd-trace GitHub (agentless mode issue): https://github.com/DataDog/dd-trace-js/issues/5441 (MEDIUM confidence — known bug report)
- Datadog LLM Obs >1MB payload bug: https://github.com/DataDog/dd-trace-py/issues/13260 (MEDIUM confidence — confirmed bug, applies to JS SDK pattern)
- Neo4j JavaScript Driver Manual — Connect: https://neo4j.com/docs/javascript-manual/current/connect/ (HIGH confidence — official docs, directly fetched)
- Neo4j Driver Best Practices: https://neo4j.com/blog/developer/neo4j-driver-best-practices/ (MEDIUM confidence — official blog, content confirmed via community)
- AWS Bedrock Model Access: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html (HIGH confidence — official docs)
- AWS Bedrock Troubleshooting API Errors: https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html (HIGH confidence — official docs)
- MiniMax TTS API handling (streaming, hex decode): https://blog.williamchong.cloud/code/2025/06/21/handling-minimax-tts-api-basic-and-streaming.html (MEDIUM confidence — single source, but technically specific and detailed)
- MiniMax Rate Limits: https://platform.minimax.io/docs/guides/rate-limits (MEDIUM confidence — official docs page, content partially confirmed)
- GenAI Hackathon lessons learned: https://towardsdatascience.com/things-i-learnt-by-participating-in-genai-hackathons-over-the-past-6-months/ (LOW confidence — editorial, not technical docs)
- Hackathon pitfalls: https://klaviyo.tech/how-to-win-an-ai-hackathon-build-a-solution-that-actually-matters-aab49307587e (LOW confidence — editorial)

---
*Pitfalls research for: AI Dungeon Master — AWS Bedrock + Datadog + Neo4j AuraDB + MiniMax TTS*
*Researched: 2026-02-20*
