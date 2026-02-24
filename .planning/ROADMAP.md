# Roadmap: AI Dungeon Master

## Milestones

- ✅ **v1.0 MVP** — Phases 1-19 (shipped 2026-02-23)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-19) — SHIPPED 2026-02-23</summary>

- [x] Phase 1: Scaffold (3/3 plans) — completed 2026-02-20
- [x] Phase 2: Chat UI (2/2 plans) — completed 2026-02-20
- [x] Phase 3: Lore Graph Seed (2/2 plans) — completed 2026-02-20
- [x] Phase 4: Bedrock Chat Core (2/2 plans) — completed 2026-02-20
- [x] Phase 5: RAG Pipeline (2/2 plans) — completed 2026-02-20
- [x] Phase 6: Datadog Observability (2/2 plans) — completed 2026-02-20
- [x] Phase 7: Voice + Demo Polish (3/3 plans) — completed 2026-02-20
- [x] Phase 8: Multiplayer Mode (5/5 plans) — completed 2026-02-21
- [x] Phase 9: Scale & Auth (3/3 plans) — completed 2026-02-21
- [x] Phase 10: S3 Audio Cache (1/1 plan) — completed 2026-02-21
- [x] Phase 11: Architecture Audit (6/6 plans) — completed 2026-02-21
- [x] Phase 12: Production Hardening (2/2 plans) — completed 2026-02-21
- [x] Phase 13: Dead Code Cleanup (1/1 plan) — completed 2026-02-21
- [x] Phase 14: Parallel TTS Processing (1/1 plan) — completed 2026-02-21
- [x] Phase 15: Client Polling Optimization (1/1 plan) — completed 2026-02-22
- [x] Phase 16: Generation Observability (1/1 plan) — completed 2026-02-22
- [x] Phase 17: Code Review Wave 1 (3/3 plans) — completed 2026-02-22
- [x] Phase 18: Code Review Wave 2 (10/10 plans) — completed 2026-02-22
- [x] Phase 19: Code Review Wave 3 (2/2 plans) — completed 2026-02-22

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Scaffold | v1.0 | 3/3 | Complete | 2026-02-20 |
| 2. Chat UI | v1.0 | 2/2 | Complete | 2026-02-20 |
| 3. Lore Graph Seed | v1.0 | 2/2 | Complete | 2026-02-20 |
| 4. Bedrock Chat Core | v1.0 | 2/2 | Complete | 2026-02-20 |
| 5. RAG Pipeline | v1.0 | 2/2 | Complete | 2026-02-20 |
| 6. Datadog Observability | v1.0 | 2/2 | Complete | 2026-02-20 |
| 7. Voice + Demo Polish | v1.0 | 3/3 | Complete | 2026-02-20 |
| 8. Multiplayer Mode | v1.0 | 5/5 | Complete | 2026-02-21 |
| 9. Scale & Auth | v1.0 | 3/3 | Complete | 2026-02-21 |
| 10. S3 Audio Cache | v1.0 | 1/1 | Complete | 2026-02-21 |
| 11. Architecture Audit | v1.0 | 6/6 | Complete | 2026-02-21 |
| 12. Production Hardening | v1.0 | 2/2 | Complete | 2026-02-21 |
| 13. Dead Code Cleanup | v1.0 | 1/1 | Complete | 2026-02-21 |
| 14. Parallel TTS | v1.0 | 1/1 | Complete | 2026-02-21 |
| 15. Client Polling | v1.0 | 1/1 | Complete | 2026-02-22 |
| 16. Gen Observability | v1.0 | 1/1 | Complete | 2026-02-22 |
| 17. Code Review W1 | v1.0 | 3/3 | Complete | 2026-02-22 |
| 18. Code Review W2 | v1.0 | 10/10 | Complete | 2026-02-22 |
| 19. Code Review W3 | v1.0 | 2/2 | Complete | 2026-02-22 |

### Phase 1: Session Persistence & Save/Resume

**Goal:** Enable players to save their D&D adventures and resume them later, with a user-visible save slot system backed by Redis sorted sets and REST endpoints.
**Depends on:** Phase 0
**Plans:** 2 plans — completed 2026-02-23

Plans:
- [x] 01-01-PLAN.md — Backend save system (saveStore service, REST endpoints, rate limiter, chat auto-update)
- [x] 01-02-PLAN.md — Client save/resume flow (API service, SaveSlotList UI, useSSEChat resume, App wiring)

### Phase 2: Add userId to usage tracking pipeline

**Goal:** Thread userId from JWT-authenticated request context through the usage tracking pipeline so every UsageEntry is attributed to a specific user, enabling per-user cost reporting and preparing for Phase 3 Bear Lumen integration.
**Depends on:** Phase 1
**Requirements:** [USAGE-01, USAGE-02, USAGE-03, USAGE-04, USAGE-05]
**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — UsageEntry type update, record function signatures, getUserUsage, tests
- [ ] 02-02-PLAN.md — Route call site threading (chat.ts, narrate.ts) + /api/usage per-user endpoint

### Phase 3: Persist usage data with Bear Lumen integration

**Goal:** [To be planned]
**Depends on:** Phase 2
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 3 to break down)
