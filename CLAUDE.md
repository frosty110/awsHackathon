# AI Assistant Context (Claude, Codex, Kiro)

This is the canonical shared context file for AI coding agents in this repo.

Compatibility links:
- `CLAUDE.md` (Anthropic Claude Code)
- `AGENTS.md` (OpenAI Codex and Kiro)
- `agent.md` (local alias requested by team)

## Operating Mode

This is a hackathon project. Speed is the priority.

- Execute plans without flagging hypothetical concerns. If something breaks, fix it then.
- Don't preemptively optimize, add defensive code for unlikely scenarios, or suggest production-grade improvements.
- Don't review or critique plans unless asked. Just build.
- Skip verification steps that aren't in the plan (e.g., don't test `npm run build` if the plan only asks for `npm run dev`).
- Cosmetic warnings (dd-trace noise, deprecation notices) are not problems. Ignore them.

## Project Snapshot

- Name: AI Dungeon Master
- Goal: Deliver a reliable, immersive 5-minute hackathon demo with visible Datadog LLM observability.
- Stack: React frontend, Node.js/Express backend, AWS Bedrock (Claude), Neo4j, Datadog, MiniMax TTS.

## Current Demo Scope

- Single-player web demo (no authentication).
- 3-turn scripted flow:
  1. Tavern arrival
  2. Barkeep quest hook
  3. Goblin combat with dice outcome narration
- Opening monologue uses TTS; turn-by-turn gameplay is text-streamed.

## Architecture Contracts (Do Not Drift)

- Server is source of truth for conversation state.
  - Client sends: `{ conversationId?, message }` (and optional dice data when implemented).
  - Server creates and persists conversation history by `conversationId`.
- Chat transport uses `fetch` POST + `ReadableStream` SSE parsing on the client.
- `/narrate` returns `audio/wav` generated from MiniMax PCM response.
- RAG is lightweight and fast:
  - Extract entities from latest user turn only.
  - Query Neo4j for relevant lore.
  - Inject compact lore context into prompt.
- Datadog tracing uses pre-init bootstrap:
  - `NODE_OPTIONS='--import dd-trace/initialize.mjs'`
  - `DD_LLMOBS_ENABLED=1`
  - `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED=true`

## Reliability Requirements

- Bedrock calls must have timeout/cancellation handling.
- Neo4j failures must degrade gracefully (continue chat without lore).
- TTS failures must not block core chat experience.
- SSE streams should emit clear error payloads before completion when recoverable.

## Security Posture (Demo)

- No auth for the hackathon demo.
- Still required:
  - Strict CORS allowlist for demo origin(s)
  - Body size limits
  - Basic rate limiting on `/chat` and `/narrate`
  - Keep all secrets server-side only

## Team Workflow

- Prefer the roadmap/planning flow under `.planning/`.
- Keep changes small and shippable.
- Update relevant planning docs when architecture or scope decisions change.
- Prioritize demo reliability over feature breadth.

## Key References in Repo

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/research/ARCHITECTURE.md`

## Project Skill Files

- `skills/claude-hackathon-operator/SKILL.md` for planning and doc alignment work.
- `skills/codex-hackathon-operator/SKILL.md` for implementation and verification work.
- `skills/kiro-hackathon-operator/SKILL.md` for delivery checklists and demo readiness work.
