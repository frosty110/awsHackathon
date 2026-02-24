---
phase: 01-session-persistence-save-resume
plan: 02
subsystem: ui
tags: [react, saves, save-resume, class-select, sse-chat, tailwind]

# Dependency graph
requires:
  - phase: 01-session-persistence-save-resume
    plan: 01
    provides: /api/saves REST CRUD endpoints, saveStore service, auto-update hook in chat SSE

provides:
  - saves.ts: fetch wrappers for /api/saves CRUD (listSaves, createSave, deleteSave, renameSave) with authHeaders + 401 retry
  - SaveSlotList component: save slot list UI with resume/delete/inline-rename actions
  - resumeSession in useSSEChat: injects conversationId/class/pronouns for save resume
  - getConversationId in useSSEChat: exposes current conversationId for the Save button
  - CLASSES export from ClassSelect: enables full CharacterClass object lookup on resume (icon/description)
  - savedGames AppState: new state for the save list screen
  - App.tsx save/resume flow: handleSavedGames, handleResumeSave (CLASSES lookup + sendMessage), handleSaveGame
  - ModeSelect Saved Adventures button: third path into saved games screen
affects:
  - Future multiplayer save integration (mode field already tracked in SaveRecord)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 401 refresh retry pattern applied to all saves.ts fetch calls (same pattern as useSSEChat.ts)
    - CLASSES.find() lookup for full CharacterClass object on resume (avoids undefined icon/description)
    - sendMessage called immediately after resumeSession to trigger DM contextual response (avoids blank screen)
    - getConversationId callback via useRef accessor pattern (safe from stale closure)

key-files:
  created:
    - client/src/services/saves.ts
    - client/src/components/SaveSlotList.tsx
  modified:
    - client/src/hooks/useSSEChat.ts
    - client/src/types/chat.ts
    - client/src/components/ClassSelect.tsx
    - client/src/App.tsx
    - client/src/components/ModeSelect.tsx

key-decisions:
  - "resumeSession sets refs only — caller (App.tsx handleResumeSave) immediately calls sendMessage so DM generates contextual response without leaving blank screen"
  - "CLASSES.find() by name in handleResumeSave ensures full CharacterClass object (with icon, description, hitDie) is set — avoids showing 'undefined' in adventure header"
  - "getConversationId uses useCallback over ref read — safe ref accessor pattern that never creates stale closure"
  - "saves.ts uses 401-refresh-retry pattern matching useSSEChat.ts for consistent auth resilience across all API calls"

patterns-established:
  - "Pattern 1: Ref accessor callbacks (getConversationId) expose mutable refs to parent components without React state"
  - "Pattern 2: Class lookup via CLASSES.find(cls => cls.name === save.characterClass) is the canonical way to reconstitute full CharacterClass from a saved name string"

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 01 Plan 02: Client Save/Resume UI Summary

**React save/resume flow: saves API service with 401 retry, SaveSlotList component with inline rename, resumeSession + getConversationId in useSSEChat, and full App.tsx state machine wiring with DM contextual response on resume**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T05:52:38Z
- **Completed:** 2026-02-24T05:54:38Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- saves.ts: Complete /api/saves CRUD client with authHeaders + 401 token refresh retry on all 4 operations
- SaveSlotList.tsx: D&D-themed save list UI with resume/delete/inline-rename, empty state, relative time display, and loading spinner
- useSSEChat.ts: resumeSession (inject conversationId/class/pronouns) and getConversationId (ref accessor) added to return object
- App.tsx: Full save/resume state machine — handleSavedGames, handleResumeSave (CLASSES lookup + sendMessage for immediate DM response), handleSaveGame (prompt + createSave), Save button in adventure header
- ModeSelect.tsx: Third option "Saved Adventures" (sm:col-span-2 for balanced 2+1 layout), onSavedGames prop added

## Task Commits

Each task was committed atomically:

1. **Task 1: Create saves API service, SaveSlotList component, export CLASSES, and resumeSession in useSSEChat** - `8a7c1e0` (feat)
2. **Task 2: Wire save/resume flow into App.tsx and ModeSelect** - `ad40bb9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `client/src/services/saves.ts` - Fetch wrappers for /api/saves CRUD: listSaves, createSave, deleteSave, renameSave; all with authHeaders + 401 retry; graceful error returns (empty array / null / false)
- `client/src/components/SaveSlotList.tsx` - Save slot list UI; on-mount listSaves fetch; inline rename via input ref; delete with window.confirm; resume button calls onResume prop; empty state message; relative time formatting
- `client/src/hooks/useSSEChat.ts` - Added resumeSession callback (sets conversationId/characterClassRef/pronounsRef); getConversationId accessor; both added to return object
- `client/src/types/chat.ts` - Added 'savedGames' to AppState union
- `client/src/components/ClassSelect.tsx` - Changed `const CLASSES` to `export const CLASSES` for App.tsx import
- `client/src/App.tsx` - Imports SaveSlotList, createSave, SaveRecord, CLASSES; destructures resumeSession + getConversationId; adds handleSavedGames, handleResumeSave, handleSaveGame; Save button in header; SaveSlotList at savedGames state; ModeSelect with onSavedGames
- `client/src/components/ModeSelect.tsx` - Added onSavedGames prop; Saved Adventures button below Solo/Multiplayer grid with sm:col-span-2

## Decisions Made
- resumeSession sets refs only then immediately calls sendMessage from App.tsx — this ensures the DM always generates a contextual response on resume (player never sees a blank chat window)
- CLASSES.find() by name in handleResumeSave ensures the full CharacterClass object (with icon, description, hitDie, primaryAbility) is set in state — saves only store the class name string, so lookup is required to avoid "undefined" in the adventure header
- getConversationId uses useCallback over a ref read — safe ref accessor pattern that's stable across renders without creating a stale closure on conversationId.current
- saves.ts applies the same 401-refresh-retry pattern as useSSEChat.ts — provides consistent auth resilience across all API surface

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — TypeScript compiled cleanly on first attempt, no type errors or blocking issues.

## User Setup Required
None - no external service configuration required. Saves are backed by the /api/saves endpoints from plan 01-01.

## Next Phase Readiness
- Complete end-to-end save/resume flow: players can save, view, resume, rename, and delete adventures
- All client-side save/resume truths from the plan are implemented and TypeScript-verified
- Phase 01-03 (if any) can build on this complete save/resume UX foundation

---
*Phase: 01-session-persistence-save-resume*
*Completed: 2026-02-24*
