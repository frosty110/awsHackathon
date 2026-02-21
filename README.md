# AWS Hackathon: AI Dungeon Master

Planning-first repository for the AWS x Anthropic x Datadog GenAI Hackathon project.

## Core docs

- `.planning/PROJECT.md` - project context, constraints, and goals
- `.planning/REQUIREMENTS.md` - traced requirements
- `.planning/ROADMAP.md` - phase plan and execution order
- `.planning/STATE.md` - current state and blockers
- `.planning/research/ARCHITECTURE.md` - target system architecture
- `.planning/phases/01-scaffold/` - executable Phase 1 plans and research

## Phase 1 alignment highlights

- Monorepo scaffold: `client/` + `server/` workspaces
- Fail-fast env validation with explicit Datadog LLMObs keys (`DD_*`)
- Health checks on both `/health` and `/api/health`
- Neo4j connectivity check runs on boot with explicit non-production skip flag
- `dd-trace` bootstrap in server scripts via `NODE_OPTIONS='--import dd-trace/initialize.mjs'`

## Datadog Observability

Live dashboards for the hackathon demo:

- [LLM Observability — Traces & Spans](https://app.datadoghq.com/llm/applications?query=%40ml_app%3Aai-dm&compareLens=inputs&fromUser=false&selectedTab=overview)
- [Hackathon Dashboard — AI Dungeon Master](https://app.datadoghq.com/dashboard/agm-v77-h47/hackathon-ai-dungeon-master---llm-observability)

The dashboard covers API reliability, LLM pipeline latency, token cost breakdown, Bedrock/Neo4j/TTS reliability, tool span usage, and runtime health.

### Creating / updating the dashboard

The dashboard is defined as code in `scripts/create-dashboard.ts`. To create or update it:

```bash
# Create a new dashboard
npm run create-dashboard

# Update an existing dashboard
DD_DASHBOARD_ID=agm-v77-h47 npm run create-dashboard
```

Required env vars (`DD_API_KEY`, `DD_APP_KEY`, `DD_SITE`) are read from `.env`. `DD_APP_KEY` is a Datadog **Application Key** — create one at Datadog > Organization Settings > Application Keys.

### Key tracing config

Tracing is bootstrapped via `NODE_OPTIONS='--import dd-trace/initialize.mjs'` with these env vars:

| Variable | Purpose |
|---|---|
| `DD_SERVICE` | Service name for APM (`ai-dungeon-master`) |
| `DD_ENV` | Environment tag (`hackathon`) |
| `DD_LLMOBS_ENABLED` | Enable LLM Observability |
| `DD_LLMOBS_ML_APP` | ML app name used to filter spans (`ai-dm`) |
| `DD_LLMOBS_AGENTLESS_ENABLED` | Send LLMObs data directly (no Agent) |
| `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED` | Auto-instrument Bedrock calls |

## Tooling skill files

Project-local skill files focused on core hackathon tools:

- `skills/datadog-dashboard-operator/SKILL.md`
- `skills/datadog-llmobs-operator/SKILL.md`
- `skills/bedrock-runtime-operator/SKILL.md`
- `skills/neo4j-rag-operator/SKILL.md`

## AI context symlinks

Shared AI context is managed from one canonical file:

- `CLAUDE.md` is the source file to edit.
- `AGENTS.md` is a symlink to `CLAUDE.md`.
- `agent.md` is a symlink to `CLAUDE.md`.
