---
phase: quick-05
plan: wave3
subsystem: client
tags: [security, memory-leaks, ux, xss, accessibility]
dependency-graph:
  requires: [wave1-server-security, wave2-server-reliability]
  provides: [xss-prevention, blob-url-cleanup, smart-scroll, input-validation]
  affects: [MessageBubble, MultiplayerGame, SceneBackground, App, ChatWindow, audioController, backgroundMusic, sceneVideo]
tech-stack:
  added: [rehype-sanitize]
  patterns: [generation-guard, functional-state-update, ref-based-closure, smart-scroll]
key-files:
  created: []
  modified:
    - client/src/components/MessageBubble.tsx
    - client/src/components/MultiplayerGame.tsx
    - client/src/services/sceneVideo.ts
    - client/src/services/backgroundMusic.ts
    - client/src/services/audioController.ts
    - client/src/components/SceneBackground.tsx
    - client/src/components/MultiplayerLobby.tsx
    - client/src/hooks/useSSEChat.ts
    - client/src/hooks/useChatScroll.ts
    - client/src/hooks/useMultiplayerRoom.ts
    - client/src/components/MessageInput.tsx
    - client/src/components/PlayerChat.tsx
    - client/src/components/ChatWindow.tsx
    - client/src/App.tsx
    - client/package.json
    - package-lock.json
decisions:
  - "rehype-sanitize default schema used for XSS prevention (covers script, iframe, event handlers)"
  - "Generation counter pattern reused from backgroundMusic for sceneVideo stale-polling guard"
  - "Smart scroll threshold set to 150px from bottom to avoid disrupting users reading history"
  - "Error auto-clear uses 8-second timeout with identity check to avoid clearing newer errors"
  - "currentUrl tracked at module level in audioController for proper blob URL lifecycle"
metrics:
  duration: 228s
  completed: "2026-02-22"
  tasks: 1
  files: 17
---

# Quick Task 5 Wave 3: Client Security, Memory Leaks & UX Summary

rehype-sanitize on all Markdown renderers, blob URL revocation across 3 audio/video services, stale closure fixes, smart scroll, and input hardening.

## What Was Done

### C5 - XSS Prevention via rehype-sanitize
- Installed `rehype-sanitize` package
- Added `rehypePlugins={[rehypeSanitize]}` to all 3 `<Markdown>` component instances:
  - `MessageBubble.tsx` (DM messages)
  - `MultiplayerGame.tsx` (completed DM messages + streaming text)
- Default sanitize schema strips `<script>`, `<iframe>`, `on*` event handlers, and other XSS vectors

### H8 - Scene Video Blob URL Leak
- In `sceneVideo.ts resetScenes()`: revoke all blob URLs from `sceneBlobUrls` map before clearing
- Added generation counter for stale-polling guard (M9)

### H9 - Background Music Blob URL Leak
- In `backgroundMusic.ts stopBackgroundMusic()`: revoke all blob URLs from `moodBlobUrls` map and `introBlobUrl` before clearing

### H10 - Audio Controller URL Leak
- Added module-level `currentUrl` tracking in `audioController.ts`
- `playAudio()` revokes previous URL before starting new audio
- `stopAudio()` revokes current URL on stop
- `playFromResponse()` sets `currentUrl` after creating blob URL (removed ended-listener revocation since lifecycle is now managed centrally)

### H11 - ImageBitmap Frame Cap
- Added `MAX_FRAMES = 120` constant in `usePingPong` hook
- Early return before `createImageBitmap` when frame limit reached

### H12 - Stale Closure in SceneBackground Crossfade
- `handleIncomingCanPlay` now uses functional state update: `setIncomingUrl(prev => ...)` instead of capturing `incomingUrl` in closure
- Dependencies array is now empty (no stale closure possible)

### H13 - Side Effect in MultiplayerLobby State Updater
- Added `roomStateRef` to track roomState via ref
- `onRoomStarted` reads `roomStateRef.current` directly instead of calling `onGameStart` inside `setRoomState`
- `useEffect` keeps ref in sync with state

### H14 - Stale Messages Closure in useSSEChat
- Added `messagesRef` to track messages via ref
- `replayMessageAudio` uses `messagesRef.current` instead of `messages` state
- Dependencies array is now empty (no stale closure possible)

### H15 - Non-null Assertion on multiplayerRoomCode
- Changed `appState === 'multiplayerGame' ?` to `appState === 'multiplayerGame' && multiplayerRoomCode ?`
- Removed `!` non-null assertion on `roomCode={multiplayerRoomCode}`

### M8 - maxLength on Input Fields
- Added `maxLength={500}` to:
  - `MessageInput.tsx` text input
  - `MultiplayerGame.tsx` action input
  - `PlayerChat.tsx` chat input

### M9 - Scene Video Generation Guard
- Added `generation` counter to `sceneVideo.ts`
- `resetScenes()` increments generation
- `fetchSceneVideo()` accepts `gen` parameter, checks staleness at start and after each async operation
- `changeScene()` captures generation and passes to fetch, checks after await

### M10 - Missing aria-labels
- Added `aria-label="Stop audio"` and `aria-label="Play audio"` to icon-only buttons in `MessageBubble.tsx`

### M11 - Smart Scroll
- Rewrote `useChatScroll.ts` to return `{ bottomRef, containerRef }`
- Only auto-scrolls when user is within 150px of the bottom
- `ChatWindow.tsx` attaches `containerRef` to the scrollable container div
- Fallback: always scrolls if no container ref (backward compatible)

### M12 - Error Auto-Clear
- In `useMultiplayerRoom.ts`: `onRoomError` and `onDmError` both auto-clear error after 8 seconds
- Uses identity check (`prev === payload.message ? null : prev`) to avoid clearing newer errors

### L4 - selectedClass/selectedPronouns as useState
- Changed from `useRef` to `useState` in `App.tsx`
- Updated all `.current` references to direct value access
- Components now re-render when class/pronouns change (previously stale in JSX)

### L5 - MessageInput disabled
- Changed `disabled={false}` to `disabled={isLoading}` in `App.tsx`
- Input is now properly disabled while the DM is responding

## Verification Results
- Client TypeScript: compiles clean (`npx tsc --noEmit`)
- Server TypeScript: compiles clean (`npx tsc --noEmit`)
- Server tests: pre-existing vitest SSR export error (not caused by this wave; all changes are client-only)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Commit | Message |
|--------|---------|
| 5ce3896 | fix(client): XSS prevention, memory leak fixes, UX improvements |

## Self-Check: PASSED

- All 14 modified files exist on disk
- Commit 5ce3896 exists in git log
- rehypeSanitize found in MessageBubble.tsx (1 instance) and MultiplayerGame.tsx (2 instances)
- Client TypeScript compiles clean
- Server TypeScript compiles clean
