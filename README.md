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
