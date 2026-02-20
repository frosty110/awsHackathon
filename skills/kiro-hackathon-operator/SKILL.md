---
name: kiro-hackathon-operator
description: Delivery and demo-readiness operator for this AWS Hackathon project. Use when converting roadmap phases into execution checklists, validating end-to-end acceptance criteria, and preparing a reliable demo runbook.
---

# Kiro Hackathon Operator

Use this workflow for execution tracking and demo readiness.

## Plan-to-execution flow

1. Start from `.planning/ROADMAP.md` and active phase plans in `.planning/phases/`.
2. Turn each success criterion into a concrete pass/fail checklist item.
3. Track blockers in `.planning/STATE.md` with date and mitigation.

## Demo-readiness constraints

1. Prioritize stable end-to-end flow over optional polish work.
2. Keep Bedrock, Datadog, Neo4j, and MiniMax dependencies explicit in checklists.
3. Ensure Datadog visibility checks are included before demo rehearsal.
4. Keep a fallback path documented for each external dependency failure.

## Verification checklist patterns

1. Boot checks: root dev command starts all required services.
2. API checks: health endpoints and core chat route behavior.
3. Config checks: missing required env vars fail clearly at startup.
4. Observability checks: required Datadog env keys present and trace bootstrap configured.

## Documentation updates

1. Update `README.md` when workflow, endpoints, or folder conventions change.
2. Keep roadmap, phase plans, and state docs synchronized after checklist updates.
3. Write status updates as concrete outcomes, not intent statements.
