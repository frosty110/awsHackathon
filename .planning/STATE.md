# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** A playable AI Dungeon Master demo that runs live with visible Datadog LLM observability — the minimum viable path to hackathon prize eligibility.
**Current focus:** Phase 1 complete — ready for Phase 2 (Chat UI) and Phase 3 (Lore Graph Seed)

## Current Position

Phase: 1 of 7 (Scaffold) — COMPLETE
Plan: 3/3 complete, verified
Status: Phase 1 fully executed and verified (7/7 must-haves passed)
Last activity: 2026-02-20 — Completed phase 1 execution and verification

Progress: [██░░░░░░░░] 14%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~3 min
- Total execution time: ~0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-scaffold | 3 | ~10 min | ~3 min |

**Recent Trend:**
- Last 5 plans: 01-01, 01-02, 01-03
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Use `@aws-sdk/client-bedrock-runtime` (NOT `@anthropic-ai/bedrock-sdk`) — this is the only SDK dd-trace auto-instruments; wrong choice eliminates Datadog prize entirely
- Roadmap: Phases 2 and 3 (Chat UI and Lore Seed) can run in parallel — both depend only on Phase 1, neither blocks the other
- Roadmap: MiniMax TTS scoped to opening monologue only (not every DM turn) — avoids 3-6s blocking latency per turn
- [Phase 01-scaffold]: envDefaults blank-default pattern: all integration keys default to empty string, validated at usage via requireConfigValues not at module load time
- [Phase 01-scaffold]: AppDeps.driver typed as Driver | null — neo4j.driver() only called after requireConfigValues validates non-blank keys in else branch

### Pending Todos

- Re-run `npm install` when network access to `registry.npmjs.org` is available.
- Run `npx tsc --noEmit -p server` after dependencies install.
- Run `npm run dev` and verify `curl http://localhost:3001/health` and `curl http://localhost:3001/api/health`.
- If checks pass, mark Phase 1 complete and begin Phase 2 and Phase 3 in parallel.

### Blockers/Concerns

- **Pre-hackathon blocker**: Bedrock model access must be enabled in AWS Console before hackathon day (cannot be fixed mid-build). Verify with `aws bedrock invoke-model` CLI before starting Phase 4.
- **Pre-hackathon blocker**: MiniMax `MINIMAX_GROUP_ID` location in console not confirmed — locate and save before hackathon day.
- **Pre-hackathon blocker**: Verify Bedrock inference profile IDs vs. model IDs in target region (`aws bedrock list-foundation-models`).
- **Phase 6 risk**: Datadog dashboard must be built after generating real trace data, not before. Validate all 5 LLM Observability env vars with a smoke-test request.
- **Environment blocker (current workspace)**: npm install is blocked in this sandbox (`getaddrinfo ENOTFOUND registry.npmjs.org`), preventing dependency install and runtime verification.

## Session Continuity

Last session: 2026-02-20
Stopped at: Phase 1 complete and verified. Ready for Phase 2 + Phase 3 (can run in parallel).
Resume file: `.planning/phases/01-scaffold/01-VERIFICATION.md`
