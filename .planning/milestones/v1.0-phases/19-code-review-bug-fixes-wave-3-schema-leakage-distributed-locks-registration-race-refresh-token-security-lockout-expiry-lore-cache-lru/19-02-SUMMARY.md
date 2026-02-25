---
phase: 19-code-review-bug-fixes-wave-3
plan: 02
subsystem: api
tags: [zod, lru-cache, neo4j, socket.io, security, cleanup]

# Dependency graph
requires:
  - phase: 19-01
    provides: auth hardening, in-memory duplicate check in registration
provides:
  - Zod error sanitization — no field details in 400 HTTP responses
  - Socket.IO auth required in all non-development environments
  - LRUCache-based lore cache with TTL and max-size eviction
  - Neo4j Cypher query with label constraint for index eligibility
  - Dead AbortController removed from narrate.ts
  - Hourly backup cleanup timer in usageTracker.ts
  - Unused getCharacterClass/getPronouns free-function exports removed
  - SESSION_SECRET config deleted (dead config)
  - Client TTS fetch cancellable via abort signal
  - Socket rate limit constants centralized in config.ts
affects: [any future narrate.ts work, any future rag.ts cache work, socket auth hardening, config changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - LRUCache (lru-cache@11) for TTL+max-size bounded caches instead of Map with manual eviction
    - Zod validation errors logged server-side only — generic message in HTTP response (no field details)
    - Socket.IO auth default flip to non-dev (not production-only) so staging/test environments also enforce auth
    - Rate limit constants exported from config.ts for centralized configuration

key-files:
  created: []
  modified:
    - server/src/routes/chat.ts
    - server/src/routes/narrate.ts
    - server/src/sockets/index.ts
    - server/src/services/rag.ts
    - server/src/services/neo4j.ts
    - server/src/services/usageTracker.ts
    - server/src/services/config.ts
    - server/src/services/conversationStore.ts
    - client/src/hooks/useSSEChat.ts
    - .env.example

key-decisions:
  - "Zod field errors logged server-side via logEvent, not returned in HTTP 400 body — prevents schema leakage to attackers"
  - "Socket.IO auth condition changed from NODE_ENV === 'production' to !== 'development' — staging/test environments now also enforce JWT auth"
  - "LRUCache.get() returns undefined for expired entries, so manual TTL check removed from cache hit path"
  - "reason field in rag.cache_miss log simplified to not_found — distinction between expired and not_found is no longer observable with LRUCache"
  - "No socket test files exist — Socket.IO auth flip has no test impact"
  - "SESSION_SECRET was dead config — app uses JWT_SECRET exclusively; removed from envDefaults, envSchema, and .env.example"

patterns-established:
  - "LRUCache pattern: use lru-cache@11 LRUCache with max+ttl options instead of Map + manual eviction functions"
  - "Config centralization: rate limit constants belong in config.ts, imported in consumers — no duplicate local declarations"

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 19 Plan 02: Codebase Cleanup Summary

**10 surgical fixes across 9 files: Zod error sanitization, Socket.IO auth hardening, LRUCache lore cache, Neo4j label constraint, dead AbortController removal, usage tracker cleanup timer, dead export removal, SESSION_SECRET deletion, client TTS abort signal, socket rate config centralization**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T07:37:20Z
- **Completed:** 2026-02-23T07:43:20Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Zod validation errors now logged server-side only (no field details in 400 HTTP responses) — closes schema leakage vulnerability C-1
- Socket.IO authentication now required in all non-development environments (test, staging, production) — closes H-2
- Lore cache replaced with LRUCache (max:100, ttl:10min) eliminating manual eviction code — closes H-3
- Neo4j Cypher query now uses label constraint (any(l IN labels(n)...)) for index-eligible queries — closes M-4
- Dead AbortController and all clearTimeout(timeoutId) calls removed from narrate.ts — closes M-8
- Hourly backup cleanup timer added to usageTracker.ts with .unref() — closes M-3
- Unused getCharacterClass/getPronouns free-function exports deleted — closes L-1
- SESSION_SECRET removed from envDefaults, envSchema, and .env.example — closes L-3
- Socket rate limit constants centralized in config.ts, imported in sockets/index.ts — closes L-5
- Client TTS fetch passes signal: controller.signal for abort support; AbortError silenced — closes L-4
- TypeScript compiles clean (server + client), 53 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side fixes — Zod sanitization, Socket.IO flip, LRU cache, Neo4j labels, dead code removal, config cleanup** - `ae2931f` (fix)
2. **Task 2: Client TTS abort signal** - `2c9afd0` (fix)

## Files Created/Modified
- `server/src/routes/chat.ts` - Zod errors logged, no details in 400 response
- `server/src/routes/narrate.ts` - Zod errors logged, dead AbortController removed
- `server/src/sockets/index.ts` - Auth condition flipped to !== 'development'; constants imported from config
- `server/src/services/rag.ts` - LRUCache replaces Map; evictStaleLoreEntries function deleted
- `server/src/services/neo4j.ts` - Label constraint added to Cypher MATCH query
- `server/src/services/usageTracker.ts` - Hourly setInterval cleanup timer with .unref()
- `server/src/services/config.ts` - SESSION_SECRET deleted; SOCKET_RATE_LIMIT/SOCKET_RATE_WINDOW_MS exported
- `server/src/services/conversationStore.ts` - getCharacterClass/getPronouns free-function exports removed
- `client/src/hooks/useSSEChat.ts` - TTS fetch uses controller.signal; AbortError silenced in catch
- `.env.example` - SESSION_SECRET line removed

## Decisions Made
- Zod field errors logged server-side via logEvent, not returned in HTTP 400 body — prevents schema leakage
- Socket.IO auth condition changed from `=== 'production'` to `!== 'development'` — staging/test environments now also enforce JWT auth
- `reason` field in rag.cache_miss log simplified to `"not_found"` — LRUCache makes expired vs not_found indistinguishable
- SESSION_SECRET was dead config; app uses JWT_SECRET exclusively
- No socket test files exist — Socket.IO auth flip has no test impact

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all 10 findings fixed cleanly. The linter reverted intermediate edits in rag.ts and sockets/index.ts during sequential editing, requiring final Write operations for those files. All changes verified by TypeScript compiler and test suite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 10 code review findings in Plan 02 are fixed
- TypeScript compiles clean (server + client)
- 53 tests pass
- Phase 19 plans 01 and 02 both complete

---
*Phase: 19-code-review-bug-fixes-wave-3*
*Completed: 2026-02-23*
