---
phase: 18-code-review-bug-fixes-wave-2
plan: 02
subsystem: api
tags: [security, prompt-injection, unicode, bcrypt, socket.io, input-validation]

requires:
  - phase: 17-code-review-bug-fixes-wave-1
    provides: inputSanitizer.ts with basic sanitization

provides:
  - Expanded inputSanitizer with XML role tag stripping, full unicode control range, invisible char removal
  - VALID_CHARACTER_CLASSES Set for allowlist validation
  - validateCharacterClass() and sanitizePronouns() helper exports
  - Socket.IO production auth rejection (NODE_ENV=production → reject unauthenticated connections)
  - Valid bcrypt dummy hash for constant-time username enumeration prevention

affects:
  - server/src/routes/chat.ts
  - server/src/routes/narrate.ts
  - server/src/routes/auth.ts
  - server/src/sockets/index.ts

tech-stack:
  added: []
  patterns:
    - "validateCharacterClass: allowlist pattern for enum-like string fields before Bedrock injection"
    - "sanitizePronouns: delegate to sanitizeUserInput with reduced max length (50 chars)"
    - "NODE_ENV production guard: dev permissive, production strict for Socket.IO auth"
    - "bcrypt dummy hash: valid pre-computed 60-char hash for constant-time user-not-found comparison"

key-files:
  created: []
  modified:
    - server/src/services/inputSanitizer.ts
    - server/src/routes/auth.ts
    - server/src/sockets/index.ts

key-decisions:
  - "VALID_CHARACTER_CLASSES is a Set (not array) for O(1) lookup; normalized lowercase before check"
  - "sanitizePronouns delegates to sanitizeUserInput(raw, 50) — reuses all existing sanitization"
  - "Socket.IO dev mode remains permissive to preserve local development workflow without JWT setup"
  - "bcrypt dummy hash uses $2b$ prefix (bcryptjs standard) not $2a$ — correct format for constant-time"

patterns-established:
  - "Enum allowlist pattern: validateCharacterClass() for any field with finite valid values"
  - "sanitizePronouns() as named wrapper for reuse in future input fields with 50-char cap"

duration: 7min
completed: 2026-02-23
---

# Phase 18 Plan 02: Prompt Injection Hardening Summary

**Expanded inputSanitizer with XML role tag stripping, full unicode control character coverage, and invisible char removal; added validateCharacterClass allowlist and sanitizePronouns helpers; fixed bcrypt dummy hash and Socket.IO production auth rejection**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T05:09:07Z
- **Completed:** 2026-02-23T05:16:35Z
- **Tasks:** 2
- **Files modified:** 3 (inputSanitizer.ts, auth.ts, sockets/index.ts)

## Accomplishments
- inputSanitizer strips XML role confusion tags (`<system>`, `<human>`, `<assistant>`, `<prompt>`, `<instruction>`, `<context>`), full unicode control range (0x00-0x1F excl tab/LF/CR, plus DEL 0x7F), and invisible/zero-width chars (U+00AD, U+200B-200F, U+2028-2029, U+FEFF, U+200C, U+200D)
- VALID_CHARACTER_CLASSES Set and validateCharacterClass() provide allowlist validation before characterClass reaches Bedrock prompts; sanitizePronouns() applies full sanitization with 50-char cap
- Socket.IO auth middleware now rejects unauthenticated connections in production (NODE_ENV=production); dev remains permissive
- bcrypt dummy hash replaced with valid 60-char $2b$12$ hash for correct constant-time comparison preventing username enumeration

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand inputSanitizer + characterClass/pronouns allowlist** - `5f787e6` (fix)
2. **Task 2: Socket.IO production auth + bcrypt dummy hash** - `567edb3` (fix)

**Plan metadata:** (see below)

## Files Created/Modified
- `server/src/services/inputSanitizer.ts` - Expanded sanitization patterns, VALID_CHARACTER_CLASSES, validateCharacterClass, sanitizePronouns exports
- `server/src/routes/auth.ts` - Valid pre-computed bcrypt dummy hash for timing-safe user-not-found path
- `server/src/sockets/index.ts` - Production auth rejection for unauthenticated Socket.IO connections

## Decisions Made
- VALID_CHARACTER_CLASSES uses lowercase values matching client ClassSelect IDs; normalize via `.toLowerCase().trim()` before check
- bcrypt $2b$12$ prefix is the correct bcryptjs format (vs $2a$ which was the invalid placeholder)
- Socket.IO dev mode stays permissive — forcing auth in dev would break local development without JWT infrastructure
- sanitizePronouns() caps at 50 chars (shorter than default 2000) since pronouns are short strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing TypeScript errors: sceneVideo.ts + videoGenerator.ts used removed `entry.video` property**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** Plan 18-03 refactored video cache to LRU but left `sceneVideo.ts` still accessing `entry.video` (removed field) and `videoGenerator.ts` still assigning to `entry.video`
- **Fix:** Updated `videoGenerator.ts` to store buffer in `videoBufferCache` LRU directly; exported `getVideoBuffer()` and `hasVideoBuffer()` helpers; updated `sceneVideo.ts` to use these helpers
- **Files modified:** `server/src/routes/sceneVideo.ts`, `server/src/services/videoGenerator.ts`
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** Part of prior commits (already at HEAD when stash was applied)

---

**Total deviations:** 1 auto-fixed (1 blocking pre-existing TypeScript error)
**Impact on plan:** TypeScript now compiles clean. No scope creep — the fix was a leftover from plan 18-03 that prevented tsc compilation.

## Issues Encountered
- Git stash occurred during verification, temporarily restoring original file versions. Stash was popped and changes verified to be correctly applied post-pop.
- Several plan changes (chat.ts, narrate.ts, sceneVideo.ts) were already committed by prior plans (18-01, 18-10) — only `inputSanitizer.ts` required new commits.

## Next Phase Readiness
- All prompt injection hardening complete: XML role tag stripping, unicode control/invisible char removal, characterClass allowlist, pronouns sanitization
- Socket.IO production auth enforcement ready for deployment
- Timing-safe login path secured with valid bcrypt dummy hash
- TypeScript clean, 53 tests pass

## Self-Check: PASSED

All files verified present. All commits verified in git history. All content checks passed:
- VALID_CHARACTER_CLASSES, INVISIBLE_CHARS, XML role tag patterns in inputSanitizer.ts
- Production check present in sockets/index.ts
- Invalid hash gone from auth.ts; valid bcrypt hash present
- TypeScript compiles clean (npx tsc --noEmit)
- 53 tests pass

---
*Phase: 18-code-review-bug-fixes-wave-2*
*Completed: 2026-02-23*
