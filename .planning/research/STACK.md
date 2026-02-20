# Stack Research

**Domain:** AI-powered chat application — D&D Dungeon Master with LLM observability, graph RAG, and TTS
**Researched:** 2026-02-20
**Confidence:** MEDIUM (locked technologies verified via official docs; supporting library versions verified via npm; MiniMax has no official Node.js SDK — raw HTTP required)

---

## Critical Architectural Decision: Use `@aws-sdk/client-bedrock-runtime`, NOT `@anthropic-ai/bedrock-sdk`

Datadog dd-trace auto-instruments `@aws-sdk/client-bedrock-runtime` (BedrockRuntimeClient). It does NOT auto-instrument `@anthropic-ai/bedrock-sdk`. Using the wrong SDK means Datadog LLM Observability produces no traces — costing the Datadog prize category.

Source: [DeepWiki dd-trace-js AI/ML Instrumentation](https://deepwiki.com/DataDog/dd-trace-js/3.6-aiml-instrumentation) — HIGH confidence.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | Backend runtime | Hackathon-locked; 22 is current LTS; native async streams work well for SSE |
| Express.js | ^5.0 | HTTP server + REST API | Hackathon-locked; minimal ceremony for a 6-hour window; SSE streaming via `res.write()` is trivial |
| React | ^19.0 | Frontend SPA | Hackathon-locked; works with Vite for instant dev server startup |
| TypeScript | ^5.7 | Type safety across backend + frontend | Catches Neo4j Cypher result shape bugs and Bedrock response shape bugs at compile time; minimal overhead in a hackathon with a monorepo tsconfig |
| `@aws-sdk/client-bedrock-runtime` | ^3.x (latest) | Invoke Claude via AWS Bedrock | The ONLY SDK that Datadog dd-trace auto-instruments for Bedrock; exposes `InvokeModelWithResponseStreamCommand` for streaming |
| `dd-trace` | ^5.86 | LLM Observability + APM tracing | Required for Datadog prize; v5 is the recommended release line; auto-instruments Bedrock with zero code changes |
| `neo4j-driver` | ^6.0.1 | Neo4j AuraDB graph queries | Driver v6 is current; adds native Vector type (needed for embedding-based RAG); connects to AuraDB over Bolt |
| Vite | ^6.x | Frontend build + dev server | `npm create vite@latest` scaffolds React + TS in 10 seconds; HMR is critical in a 6-hour window |
| Tailwind CSS | ^4.x | Styling | v4 is current (March 2025+); CSS-first config; dark mode via class strategy enables the dark fantasy theme with zero runtime overhead |
| shadcn/ui | latest | UI component library | Built on Tailwind v4 + React 19; includes a chat-ready layout; copy-paste components mean no install fights |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@smithy/node-http-handler` | included with aws-sdk | HTTP handler for Bedrock streaming | Comes bundled with `@aws-sdk/client-bedrock-runtime`; no separate install needed |
| `dotenv` | ^16.x | Environment variable loading | Load `DD_API_KEY`, `NEO4J_URI`, `MINIMAX_API_KEY`, etc. from `.env` at startup |
| `cors` | ^2.8 | CORS middleware for Express | Needed immediately when React dev server (port 5173) calls Express (port 3000) |
| `zod` | ^3.x | Runtime schema validation | Validate Neo4j query results and Bedrock response shapes; catches shape mismatches before they hit the UI |
| `uuid` | ^11.x | Session/trace ID generation | Generate per-session IDs for Datadog trace correlation and Neo4j session nodes |
| `@types/node` | ^22.x | Node.js TypeScript types | Required if using TypeScript on the backend |
| `@types/express` | ^5.x | Express TypeScript types | Required if using TypeScript on the backend |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | Run TypeScript Node.js files directly | `npx tsx src/index.ts` — no compilation step in development; faster than `ts-node` in 2025 |
| `nodemon` | Restart backend on file changes | Pair with `tsx` via `nodemon --exec tsx src/index.ts`; eliminates restart friction |
| `vite` | Frontend dev server + bundler | Start with `npm create vite@latest frontend -- --template react-ts` |
| AWS CLI | Configure credentials for Bedrock | `aws configure` or set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` in `.env` |

---

## Installation

```bash
# Backend (in /backend)
npm init -y
npm install express @aws-sdk/client-bedrock-runtime dd-trace neo4j-driver dotenv cors zod uuid
npm install -D typescript tsx nodemon @types/node @types/express

# Frontend (in /frontend)
npm create vite@latest . -- --template react-ts
npm install
npx shadcn@latest init
npm install tailwindcss @tailwindcss/vite

# Note: MiniMax TTS uses raw HTTP (no SDK). See MiniMax section below.
# Note: dd-trace must be initialized FIRST — before any other imports.
```

---

## How to Use Each Locked Technology

### AWS Bedrock (Claude) via `@aws-sdk/client-bedrock-runtime`

```typescript
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

const command = new InvokeModelWithResponseStreamCommand({
  modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  contentType: 'application/json',
  accept: 'application/json',
  body: JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userMessage }],
    system: systemPrompt,
  }),
});

const response = await client.send(command);
// Stream chunks via response.body async iterator
```

Model ID to use: `anthropic.claude-3-5-sonnet-20241022-v2:0` (Claude 3.5 Sonnet v2 on Bedrock — confirmed in Bedrock demo code).

### Datadog LLM Observability via `dd-trace`

```typescript
// MUST be the very first line of your entry file (src/index.ts)
// before Express, Bedrock, Neo4j, or any other import
import 'dd-trace/init';

// All subsequent imports are auto-instrumented
import express from 'express';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
// ...
```

Required environment variables:
```bash
DD_SITE=datadoghq.com          # or your Datadog site
DD_API_KEY=<your_api_key>
DD_LLMOBS_ENABLED=1
DD_LLMOBS_ML_APP=dnd-dungeon-master
DD_LLMOBS_AGENTLESS_ENABLED=1  # Set to 1 if not running a Datadog Agent locally
```

Datadog auto-captures: latency, token usage, input/output messages, errors — for every `BedrockRuntimeClient` call, zero manual instrumentation required.

### Neo4j AuraDB via `neo4j-driver`

```typescript
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI!,      // bolt+s://xxxx.databases.neo4j.io
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
);

async function queryLore(entityName: string) {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (e:Entity {name: $name})-[r]->(related)
       RETURN e, r, related LIMIT 20`,
      { name: entityName }
    );
    return result.records.map(r => r.toObject());
  } finally {
    await session.close();
  }
}
```

Use `driver.session()` per request, not per application. Close sessions in `finally`. Driver v6 adds native Vector type for embedding-based similarity search.

### MiniMax TTS — Raw HTTP (No SDK)

MiniMax provides no official Node.js SDK. Use native `fetch` (available in Node.js 22 without import):

```typescript
async function synthesizeSpeech(text: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${process.env.MINIMAX_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text,
        voice_setting: {
          voice_id: 'Wise_Woman',  // deep narrator voice; see alternatives below
          speed: 0.9,
          pitch: -2,
          emotion: 'neutral',
        },
      }),
    }
  );

  const data = await response.json() as { data: { audio: string } };
  return Buffer.from(data.data.audio, 'hex');
}
```

Endpoint options:
- Global: `https://api.minimax.io/v1/t2a_v2`
- US West: `https://api-uw.minimax.io/v1/t2a_v2`
- Mainland China: `https://api.minimaxi.chat/v1/t2a_v2`

Available models: `speech-02-hd` (high quality, recommended), `speech-02-turbo` (faster, lower latency), `speech-2.6-hd` (latest, 40+ languages).

Voice Design feature: POST to `/v1/voice_design` with a text prompt like "A deep, gravelly male voice like a centuries-old wizard narrating ancient prophecies" to generate a custom `voice_id`.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@aws-sdk/client-bedrock-runtime` | `@anthropic-ai/bedrock-sdk` | If Datadog observability is NOT a requirement — the Anthropic SDK has a friendlier API surface |
| SSE (Server-Sent Events) via `res.write()` | `socket.io` | If bidirectional real-time events are needed (dice roll acknowledgements, multi-player); SSE is sufficient for single-user streaming and has zero setup friction |
| Tailwind CSS + shadcn/ui | styled-components, Emotion | If the team is more comfortable with CSS-in-JS; shadcn/ui saves 30+ minutes of component scaffolding in a hackathon |
| `tsx` (dev) | `ts-node` | `ts-node` is slower to start and has ESM quirks; `tsx` uses esbuild internally and starts in milliseconds |
| `neo4j-driver` v6 | v5.x | v5 is still supported but lacks native Vector type; use v5 if AuraDB instance is pinned to an older Neo4j version |
| Raw `fetch` for MiniMax | `axios` | Only if the team prefers axios's interceptor API; Node.js 22 native fetch has no install cost |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@anthropic-ai/bedrock-sdk` as primary Bedrock client | Datadog dd-trace does NOT auto-instrument it; you lose all LLM Observability traces — fails the Datadog prize requirement | `@aws-sdk/client-bedrock-runtime` |
| `langchain` or `langgraph` | Adds 5+ MB of dependencies, opaque abstractions, and debugging overhead that burns hackathon time; Neo4j integration requires extra configuration | Direct Bedrock + Neo4j driver calls |
| `socket.io` for streaming | SSE is simpler for unidirectional token streaming; WebSocket adds protocol negotiation overhead with no benefit for this use case | `res.write()` SSE on Express |
| `graphql` for the API | Adds schema definition overhead; REST + JSON is sufficient for a demo built in 6 hours | Express REST endpoints |
| `next.js` | Hackathon stack is locked to Express + React; Next.js would replace Express and change the deployment model | Vite (frontend) + Express (backend) |
| `mongoose` or `prisma` | No SQL/document database in this stack; Neo4j is the only database | `neo4j-driver` directly |
| OpenAI SDK | Not the required stack; no Bedrock + Datadog integration | `@aws-sdk/client-bedrock-runtime` |

---

## Stack Patterns by Variant

**If streaming Claude responses to the browser:**
- Use Express SSE: set `Content-Type: text/event-stream`, stream Bedrock `InvokeModelWithResponseStreamCommand` chunks as `data: {...}\n\n`
- Parse on the frontend with `EventSource` or `fetch` + `ReadableStream`
- Do NOT buffer the full response; that kills the live typing effect

**If Neo4j query returns too much lore context:**
- Limit with `LIMIT 10` in Cypher and summarize with a pre-pass Claude call
- Better: use vector similarity search (`db.index.vector.queryNodes`) seeded by an embedding of the player's input

**If MiniMax TTS latency is too high (>3s):**
- Switch from `speech-02-hd` to `speech-02-turbo` — 40-60% faster at the cost of audio quality
- Make TTS optional / background (fire-and-forget after text response delivered)
- Only synthesize the first 2 sentences of each DM response

**If Datadog traces are not appearing:**
- Confirm `import 'dd-trace/init'` is the literal first line of `src/index.ts`
- Confirm `DD_LLMOBS_AGENTLESS_ENABLED=1` is set (agentless mode skips local Agent requirement)
- Confirm using `@aws-sdk/client-bedrock-runtime`, not the Anthropic wrapper

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `dd-trace@^5.86` | Node.js 18, 20, 22 | v5 is recommended for new projects per Datadog docs |
| `neo4j-driver@^6.0.1` | Neo4j AuraDB 5.x, 2025.x | v6 requires Node.js 18+; patch 6.0.1 fixes TypeScript exports |
| `@aws-sdk/client-bedrock-runtime@^3.x` | Node.js 18+ | Part of the AWS SDK v3 monorepo; always install latest 3.x |
| React 19 | shadcn/ui (latest) | shadcn/ui updated all components for React 19 in March 2025 |
| Tailwind CSS v4 | shadcn/ui (latest) | shadcn/ui updated for Tailwind v4 in March 2025 |
| `tsx@latest` | TypeScript 5.7, Node.js 22 | Uses esbuild; fully compatible with ESM and CommonJS |

---

## Sources

- [DeepWiki dd-trace-js AI/ML Instrumentation](https://deepwiki.com/DataDog/dd-trace-js/3.6-aiml-instrumentation) — confirmed which Bedrock SDK Datadog instruments (HIGH confidence)
- [Datadog Auto Instrumentation docs](https://docs.datadoghq.com/llm_observability/instrumentation/auto_instrumentation/) — environment variables, setup (MEDIUM confidence — page rendered navigation-only in fetch)
- [AWS blog: Monitor Bedrock agents with Datadog](https://aws.amazon.com/blogs/machine-learning/monitor-agents-built-on-amazon-bedrock-with-datadog-llm-observability/) — confirmed `DD_LLMOBS_ENABLED`, `DD_LLMOBS_ML_APP` vars (MEDIUM confidence)
- [Anthropic Bedrock SDK demo.ts on GitHub](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/packages/bedrock-sdk/examples/demo.ts) — confirmed `AnthropicBedrock` client API shape (HIGH confidence)
- [neo4j-driver GitHub releases](https://github.com/neo4j/neo4j-javascript-driver/releases) — confirmed v6.0.1 is latest stable, released Oct 31 2024 (HIGH confidence)
- [Neo4j JavaScript Manual](https://neo4j.com/docs/javascript-manual/current/) — confirmed v6 current, Node.js LTS required (HIGH confidence)
- [MiniMax TTS API handling blog (Jun 2025)](https://blog.williamchong.cloud/code/2025/06/21/handling-minimax-tts-api-basic-and-streaming.html) — confirmed no SDK, raw HTTP, hex audio response format (MEDIUM confidence)
- [MiniMax Speech-02-series announcement](https://www.minimax.io/news/speech-02-series) — confirmed model names, voice capabilities (MEDIUM confidence)
- [dd-trace npm](https://www.npmjs.com/package/dd-trace) — confirmed v5.86.0 is latest (HIGH confidence)
- [socket.io npm](https://www.npmjs.com/package/socket.io) — confirmed v4.8.3 is latest (HIGH confidence, noted as alternative)
- [@anthropic-ai/bedrock-sdk npm](https://www.npmjs.com/package/@anthropic-ai/bedrock-sdk) — confirmed v0.26.3 (HIGH confidence, noted as what NOT to use)

---

*Stack research for: AI D&D Dungeon Master — AWS x Anthropic x Datadog GenAI Hackathon*
*Researched: 2026-02-20*
