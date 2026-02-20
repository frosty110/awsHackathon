# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** A playable AI Dungeon Master demo that runs live with visible Datadog LLM observability — the minimum viable path to hackathon prize eligibility.
**Current focus:** Phase 2 complete — ready for Phase 3 (Lore Graph Seed) and Phase 4 (Bedrock Chat Core)

## Current Position

Phase: 2 of 7 (Chat UI) — COMPLETE
Plan: 2/2 complete (02-01 and 02-02 done)
Status: 02-02 executed — All four UI components + App.tsx wiring complete
Last activity: 2026-02-20 — Completed 02-02 (Chat UI components and App.tsx)

Progress: [████░░░░░░] 29%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: ~3 min
- Total execution time: ~0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-scaffold | 3 | ~10 min | ~3 min |
| 02-chat-ui | 2 (of 2) | ~4 min | ~2 min |

**Recent Trend:**
- Last 5 plans: 01-01, 01-02, 01-03, 02-01, 02-02
- Trend: Stable

*Updated after each plan completion*
| Phase 02-chat-ui P01 | 2 | 2 tasks | 6 files |
| Phase 02-chat-ui P02 | 2 | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Use `@aws-sdk/client-bedrock-runtime` (NOT `@anthropic-ai/bedrock-sdk`) — this is the only SDK dd-trace auto-instruments; wrong choice eliminates Datadog prize entirely
- Roadmap: Phases 2 and 3 (Chat UI and Lore Seed) can run in parallel — both depend only on Phase 1, neither blocks the other
- Roadmap: MiniMax TTS scoped to opening monologue only (not every DM turn) — avoids 3-6s blocking latency per turn
- [Phase 01-scaffold]: envDefaults blank-default pattern: all integration keys default to empty string, validated at usage via requireConfigValues not at module load time
- [Phase 01-scaffold]: AppDeps.driver typed as Driver | null — neo4j.driver() only called after requireConfigValues validates non-blank keys in else branch
- [Phase 02-01]: No tailwind.config.js created — Tailwind v4 CSS-only @theme is the correct modern approach
- [Phase 02-01]: useSSEChat interface locked as { messages, isLoading, sendMessage, reset } — stable contract for Phase 4 drop-in replacement
- [Phase 02-01]: import type used for Message imports in hooks — required by verbatimModuleSyntax tsconfig setting
- [Phase 02-chat-ui]: Tailwind v4 CSS-only @theme — no tailwind.config.js, no postcss.config.js; useSSEChat interface locked as { messages, isLoading, sendMessage, reset } for Phase 4 drop-in
- [Phase 02-02]: DiceRoller shake-then-callback: 400ms setTimeout before onRoll(), useRef cleanup on unmount prevents stale calls
- [Phase 02-02]: needsRoll one-liner regex (roll|dice|check|save|attack) on last DM message — fully derived from messages, no separate state
- [Phase 02-02]: Dark overlay via absolute div (bg-black/60) inside relative outer wrapper — stretches full viewport independently of surface container

### Pending Todos

- Run `npm run dev` in client/ and verify Tailwind v4 classes load correctly (text-parchment, font-cinzel, etc.)
- Add royalty-free dark tavern/forest image to client/public/tavern-bg.jpg (Unsplash free license) — CSS has gradient fallback if absent
- Re-run `npx tsc --noEmit -p server` after server dependencies install.
- Verify `curl http://localhost:3001/health` and `curl http://localhost:3001/api/health` once server runs.

### Blockers/Concerns

- **Pre-hackathon blocker**: Bedrock model access must be enabled in AWS Console before hackathon day (cannot be fixed mid-build). Verify with `aws bedrock invoke-model` CLI before starting Phase 4.
- **Pre-hackathon blocker**: MiniMax `MINIMAX_GROUP_ID` location in console not confirmed — locate and save before hackathon day.
- **Pre-hackathon blocker**: Verify Bedrock inference profile IDs vs. model IDs in target region (`aws bedrock list-foundation-models`).
- **Phase 6 risk**: Datadog dashboard must be built after generating real trace data, not before. Validate all 5 LLM Observability env vars with a smoke-test request.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 02-02-PLAN.md — All four UI components + App.tsx wiring. Phase 2 complete. Ready for Phase 3 (Lore Seed) or Phase 4 (Bedrock Streaming).
Resume file: `.planning/phases/02-chat-ui/02-02-SUMMARY.md`
