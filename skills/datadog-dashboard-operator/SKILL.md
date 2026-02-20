---
name: datadog-dashboard-operator
description: Build and maintain Datadog dashboards and monitors for the hackathon demo. Use when defining dashboard layout, tag conventions, monitor thresholds, and go/no-go signals for /chat, /narrate, Bedrock, Neo4j, and TTS.
---

# Datadog Dashboard Operator

Use this workflow when creating or updating Datadog dashboards and monitors.

## Load context

1. Read `CLAUDE.md` for architecture contracts and reliability requirements.
2. Read `.planning/ROADMAP.md` and the active phase plan for acceptance criteria.
3. Read `.planning/STATE.md` for active blockers that should be visible on dashboards.

## Dashboard conventions

1. Use unified tags consistently: `env`, `service`, `version`.
2. Keep dashboard names scoped: `[Hackathon] <area>`.
3. Add template variables for `env` and `service`.
4. Avoid high-cardinality grouping tags for dashboards (for example raw `conversationId`).

## Required dashboard sections

1. API reliability: request rate, error rate, and p95 latency for `/chat` and `/narrate`.
2. Stream reliability: started streams, completed streams, and recoverable stream errors.
3. Bedrock reliability: call latency, timeout count, and provider errors.
4. Neo4j reliability: query latency, query failures, and lore-hit indicators.
5. TTS reliability: narration latency and narration failures.
6. Runtime health: process restarts and health checks on `/health` and `/api/health`.

## Monitor conventions

1. Create one actionable monitor per failure mode.
2. Use explicit names: `[Hackathon][P1|P2] <signal>`.
3. Include runbook text in monitor messages:
   - first place to inspect
   - one mitigation action
   - demo fallback behavior
4. Use renotify only for high-impact alerts.

## Delivery checklist

1. All critical widgets are filterable by `env` and `service`.
2. Monitors are linked from dashboard notes or related widgets.
3. A single go/no-go dashboard exists for demo rehearsal and live run.
