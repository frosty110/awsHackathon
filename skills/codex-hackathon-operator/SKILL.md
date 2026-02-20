---
name: codex-hackathon-operator
description: Implementation operator for this AWS Hackathon project. Use when scaffolding or coding client/server features from .planning, enforcing locked stack decisions, and validating runtime/startup behavior against phase acceptance criteria.
---

# Codex Hackathon Operator

Use this workflow for code execution aligned to plans.

## Load context

1. Read `.planning/ROADMAP.md` and the active plan file under `.planning/phases/`.
2. Read `.planning/research/ARCHITECTURE.md` when implementation details are needed.
3. Read `.planning/STATE.md` for active blockers before starting.

## Enforce non-negotiables

1. Use `@aws-sdk/client-bedrock-runtime` for Bedrock integration.
2. Bootstrap Datadog tracing with `NODE_OPTIONS='--import dd-trace/initialize.mjs'` in server scripts.
3. Use NodeNext-compatible `.js` extensions for local TypeScript imports in server code.
4. Validate env via typed config; do not read `process.env` directly in feature services.
5. Keep health checks available at `/health` and `/api/health`.
6. Keep `.env.example` as the documented source; do not auto-generate tracked `.env`.

## Verification baseline

1. Run `npx tsc --noEmit -p server` after server changes.
2. Run `npm run dev` from root to ensure workspaces boot together.
3. Verify health endpoints return 200 payloads.
4. Run targeted `rg` checks to confirm old env key names are not reintroduced.

## Change hygiene

1. Update planning docs when implementation behavior changes.
2. Keep edits minimal and directly mapped to acceptance criteria.
3. Call out any skipped checks and why.
