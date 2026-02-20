---
name: claude-hackathon-operator
description: Planning and documentation operator for this AWS Hackathon project. Use when updating roadmap/phase plans, tightening acceptance criteria, aligning cross-file terminology, or resolving planning inconsistencies across .planning files.
---

# Claude Hackathon Operator

Use this workflow when changing planning artifacts.

## Load context

1. Read `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md`.
2. Read the target phase folder under `.planning/phases/`.
3. Read relevant research docs under `.planning/research/` only as needed.

## Apply project invariants

1. Keep `@aws-sdk/client-bedrock-runtime` as the Bedrock SDK in all planning docs.
2. Keep Datadog env keys canonical: `DD_API_KEY`, `DD_SITE`, `DD_LLMOBS_ENABLED`, `DD_LLMOBS_ML_APP`, `DD_LLMOBS_AGENTLESS_ENABLED`.
3. Keep health endpoint language consistent with both `/health` and `/api/health`.
4. Keep Neo4j connectivity behavior explicit: fail fast by default, optional non-production skip by flag.
5. Do not require generating `.env` files in repo automation steps.

## Edit style for phase plans

1. Preserve frontmatter shape and existing section structure.
2. Keep steps executable and testable with concrete verification commands.
3. Ensure success criteria are measurable and map back to roadmap requirements.
4. Update related docs in the same change when terminology or acceptance criteria move.

## Final check

1. Run `rg` to detect stale terms after edits (for example old env var names).
2. Confirm roadmap, phase plan, and research docs do not contradict each other.
3. Summarize the changes and list any remaining open questions.
