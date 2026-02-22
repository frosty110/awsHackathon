---
phase: quick-05
plan: 01
type: execute
wave: 3
depends_on: []
files_modified:
  # Wave 1 - Server Security
  - server/src/middleware/auth.ts
  - server/src/routes/auth.ts
  - server/src/routes/chat.ts
  - server/src/sockets/index.ts
  - server/src/sockets/roomHandlers.ts
  - server/src/sockets/chatHandlers.ts
  - server/src/sockets/turnHandlers.ts
  - server/src/routes/usage.ts
  # Wave 2 - Server Reliability & Cleanup
  - server/src/services/conversationStore.ts
  - server/src/services/usageTracker.ts
  - server/src/services/redis.ts
  - server/src/routes/sceneVideo.ts
  - server/src/middleware/rateLimits.ts
  - server/src/index.ts
  - server/vitest.config.ts
  # Wave 2 - Dead code deletion
  - server/src/services/system-prompt.ts
  - server/src/content/prompts.ts
  - server/src/config/pricing.ts
  - client/src/config/pricing.ts
  - server/src/content/entityAliases.ts
  - server/src/services/rag.ts
  # Wave 3 - Client Fixes
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
  - client/src/App.tsx
autonomous: true
must_haves:
  truths:
    - "Server fatally exits if JWT_SECRET is blank in production (no hardcoded fallback)"
    - "All user-facing text inputs are sanitized before reaching Bedrock or being stored"
    - "Socket.IO connections require valid JWT to proceed"
    - "XSS is prevented in all react-markdown rendered content"
    - "Conversation history is capped and cannot grow unbounded"
    - "Blob URLs are properly revoked to prevent memory leaks"
    - "Smart scroll only auto-scrolls when user is near bottom"
  artifacts:
    - path: "server/src/middleware/auth.ts"
      provides: "Production-safe JWT handling"
    - path: "server/src/sockets/index.ts"
      provides: "Socket.IO JWT auth middleware + rate limiting"
    - path: "client/src/components/MessageBubble.tsx"
      provides: "XSS-safe markdown rendering"
  key_links:
    - from: "server/src/middleware/auth.ts"
      to: "server/src/routes/auth.ts"
      via: "shared JWT_SECRET handling"
      pattern: "JWT_SECRET"
    - from: "server/src/sockets/index.ts"
      to: "server/src/middleware/auth.ts"
      via: "JWT verification in socket middleware"
      pattern: "jwt.verify"
---

<objective>
Fix all 34 code review issues across 4 severity levels (5 critical, 15 high, 12 medium, 7 low) in a single coordinated sweep.

Purpose: Close every security vulnerability, memory leak, reliability gap, and UX issue identified in code review. This makes the codebase production-ready for ~1000 concurrent users.

Output: All 34 issues resolved, TypeScript compiles clean, existing tests pass.
</objective>

<execution_context>
@/Users/blaisealbuquerque/.claude/get-shit-done/workflows/execute-plan.md
@/Users/blaisealbuquerque/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server Security Hardening (Wave 1) — C1-C4, H1-H2, H5-H6</name>
  <files>
    server/src/middleware/auth.ts
    server/src/routes/auth.ts
    server/src/routes/chat.ts
    server/src/sockets/index.ts
    server/src/sockets/roomHandlers.ts
    server/src/sockets/chatHandlers.ts
    server/src/sockets/turnHandlers.ts
    server/src/routes/usage.ts
  </files>
  <action>
**C1 — JWT hardcoded fallback removal:**
- In `server/src/middleware/auth.ts`: Remove the `DEV_SECRET` constant. Replace `config.JWT_SECRET || DEV_SECRET` with a function `getJwtSecret()` that:
  - Returns `config.JWT_SECRET` if non-empty
  - If `config.NODE_ENV === "production"`, throws a fatal error: `throw new Error("FATAL: JWT_SECRET must be set in production")`
  - Otherwise (dev mode only), returns `"dev-secret-do-not-use-in-production"` and logs a one-time warning
- Use `getJwtSecret()` in both `requireAuth` and `optionalAuth`
- Export `getJwtSecret` for use by auth routes
- In `server/src/routes/auth.ts` line 128: Import and use `getJwtSecret()` instead of the inline `config.JWT_SECRET || "dev-secret-do-not-use-in-production"` in `jwt.sign()`

**C2 — Chat input sanitization:**
- Create a `sanitizeUserInput(text: string, maxLength = 2000): string` function at the top of `server/src/routes/chat.ts` (or in a shared util):
  - Strip Bedrock/Claude template injection patterns: `{{`, `}}`, `<|`, `|>`, `\x00`-`\x08` control chars
  - Enforce max length with `.slice(0, maxLength)`
  - Trim whitespace
- Apply to `message` on line 27 of chat.ts BEFORE any processing

**C3 — Socket turn action sanitization:**
- In `server/src/sockets/turnHandlers.ts` line 46: Sanitize the `action` string using the same `sanitizeUserInput` function (import from shared location or inline). Cap at 500 chars. If empty after sanitization, return early (silently ignore).

**C4 — Socket room/chat field validation:**
- In `server/src/sockets/roomHandlers.ts`:
  - Lines 32 and 70: Validate `displayName` (string, 1-20 chars, regex `/^[\w\s\-']{1,20}$/`), `characterClass` (must be one of the valid class IDs: warrior, mage, rogue, cleric, ranger, bard), `gender` (must be one of: male, female, nonbinary)
  - If validation fails, emit `room:error` with descriptive message and return early
- In `server/src/sockets/chatHandlers.ts`:
  - Line 17: Already has `text` but no validation. Add: if `typeof text !== "string"` or empty after trim, return early. Cap text at 500 chars.

**H1 — Socket.IO JWT auth middleware:**
- In `server/src/sockets/index.ts`, add `io.use()` middleware BEFORE the `io.on("connection")` handler:
  ```
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      // Allow unauthenticated connections in dev (matches optionalAuth pattern)
      return next();
    }
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { userId: string; username: string };
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });
  ```
  - Import `jwt` from "jsonwebtoken" and `getJwtSecret` from auth middleware
  - Add `userId?: string` and `username?: string` to the `SocketData` type in `server/src/sockets/types.ts`

**H2 — Socket.IO rate limiting:**
- In `server/src/sockets/index.ts`, add a per-socket sliding window rate limiter inside the connection handler:
  ```
  const socketRateMap = new Map<string, number[]>();
  const SOCKET_RATE_LIMIT = 30; // max events per window
  const SOCKET_RATE_WINDOW_MS = 10_000; // 10 seconds
  ```
  - Create a `checkSocketRate(socketId: string): boolean` function that tracks timestamps per socket, evicts old ones, returns false if over limit
  - Wrap the event registrations: before each handler group registration, add a catch-all middleware using `socket.use((event, next) => { ... })` that calls `checkSocketRate` and disconnects if exceeded

**H5 — chat:send message length validation:**
- Already covered in C4 above (cap text at 500 chars in chatHandlers.ts)

**H6 — Usage endpoint auth:**
- In `server/src/routes/usage.ts` line 10: Import `optionalAuth` from auth middleware. Add `optionalAuth` as middleware on the route: `router.get("/api/usage", optionalAuth, (req, res) => { ... })`. This preserves backward compatibility (unauthenticated still works) while enabling per-user keying later.
  </action>
  <verify>
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx tsc --noEmit` — no TypeScript errors
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx vitest run` — all existing tests pass
  </verify>
  <done>
- JWT_SECRET has no hardcoded fallback in production; dev-mode fallback works for local development
- All user text inputs (chat messages, socket actions, displayNames, chat:send) are sanitized and length-capped
- Socket.IO verifies JWT on connection (optional auth pattern — matches HTTP middleware)
- Socket.IO has per-socket rate limiting (30 events per 10s window)
- Usage endpoint has optionalAuth middleware
  </done>
</task>

<task type="auto">
  <name>Task 2: Server Reliability, Cleanup & Dead Code (Wave 2) — H3-H4, H7, M1-M7, L1-L3, L6-L7</name>
  <files>
    server/src/services/conversationStore.ts
    server/src/services/usageTracker.ts
    server/src/services/redis.ts
    server/src/routes/chat.ts
    server/src/routes/sceneVideo.ts
    server/src/middleware/rateLimits.ts
    server/src/index.ts
    server/vitest.config.ts
    server/src/services/system-prompt.ts
    server/src/content/prompts.ts
    server/src/config/pricing.ts
    client/src/config/pricing.ts
    server/src/content/entityAliases.ts
    server/src/services/rag.ts
  </files>
  <action>
**H3 — Conversation history cap:**
- In `server/src/services/conversationStore.ts`, in the `appendMessage` method:
  - After `convo.history.push(message)` (both Redis and in-memory paths), add: `if (convo.history.length > 100) convo.history = convo.history.slice(-100);`
  - This caps at 100 messages per conversation. The windowed history already returns 12, but the full array was unbounded.

**H4 — Redis race condition:**
- In `server/src/services/conversationStore.ts`, add a per-conversation mutex using a simple Map of Promises:
  ```typescript
  private locks = new Map<string, Promise<void>>();

  private async withLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(conversationId) ?? Promise.resolve();
    let release: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    this.locks.set(conversationId, next);
    await existing;
    try {
      return await fn();
    } finally {
      release!();
      if (this.locks.get(conversationId) === next) this.locks.delete(conversationId);
    }
  }
  ```
  - Wrap the Redis branches in `appendMessage` and `getOrCreate` with `this.withLock(id, async () => { ... })`

**H7 — UsageTracker O(n) fix:**
- In `server/src/services/usageTracker.ts`, replace the `while (entries.length > 0 && entries[0].timestamp < cutoff) { entries.shift(); }` with:
  ```typescript
  let staleCount = 0;
  while (staleCount < entries.length && entries[staleCount].timestamp < cutoff) {
    staleCount++;
  }
  if (staleCount > 0) entries.splice(0, staleCount);
  ```
  - This replaces O(n^2) shift-in-a-loop with a single O(n) splice.

**M1 — Client disconnect during SSE:**
- In `server/src/routes/chat.ts`, after SSE headers are set (line 73), add:
  ```typescript
  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });
  ```
  - In the `streamBedrockResponse` `onChunk` callback (inside the detector), check `if (clientDisconnected) return;` before writing to res
  - After the streaming try/catch block, if `clientDisconnected`, skip the final writes (ttsText, usage, [DONE]) and just call `res.end()`

**M2 — Socket.IO maxHttpBufferSize:**
- In `server/src/sockets/index.ts`, add `maxHttpBufferSize: 16 * 1024` (16KB) to the Server options object (after cors and connectionStateRecovery)

**M3 — Neo4j graceful shutdown:**
- In `server/src/index.ts`, after `server.listen()`, add:
  ```typescript
  const shutdown = async (signal: string) => {
    console.log(`[shutdown] ${signal} received, closing gracefully...`);
    server.close();
    if (driver) await driver.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  ```

**M4 — conversationId UUID validation:**
- In `server/src/routes/chat.ts`, after extracting `body.conversationId`, validate:
  ```typescript
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (body.conversationId && !UUID_RE.test(body.conversationId)) {
    res.status(400).json({ error: "Invalid conversationId format" });
    return;
  }
  ```

**M5 — Internal error masking in sceneVideo:**
- In `server/src/routes/sceneVideo.ts` lines 56 and 74: Replace `res.status(500).json({ error: entry.error, terminal: true })` with `res.status(500).json({ error: "Video generation failed", terminal: true })`. Same for line 74: `res.status(500).json({ error: "Video generation failed" })`. Keep the internal error in the logEvent call only.

**M6 — Redis disconnect handler:**
- In `server/src/services/redis.ts`, add event handlers after the existing error handler:
  ```typescript
  redisClient.on("end", () => {
    console.warn("[redis] connection ended");
    redisEnabled = false;
  });
  redisClient.on("ready", () => {
    console.log("[redis] connection ready");
    redisEnabled = true;
  });
  ```

**M7 — musicLimiter body read on GET:**
- In `server/src/middleware/rateLimits.ts`, change the `keyGenerator` to use IP-only:
  ```typescript
  keyGenerator: (req) => req.ip ?? "unknown",
  ```
  - Remove the req.body reads from both keyGenerator and handler. Music route uses GET, reading req.body is nonsensical.
  - This also fixes L7 (dead keyGenerator code).

**L1 — Duplicate DM_SYSTEM_PROMPT:**
- The system-prompt.ts and content/prompts.ts files are dead (no imports reference them). Delete them in the dead code step below.

**L2 — Duplicate entity aliases:**
- In `server/src/services/rag.ts`, check if it has inline entity alias maps. If yes, replace with `import { ENTITY_ALIASES } from "../content/entityAliases.js"` and remove the inline map. If the content/entityAliases.ts shape differs, adapt the import. (Actually: content/entityAliases.ts is also dead — no imports. Both rag.ts inline map AND entityAliases.ts exist but only rag.ts is used. In this case, DELETE `server/src/content/entityAliases.ts` since rag.ts is the authoritative source.)

**L3 — Delete dead code files:**
- Delete: `server/src/services/system-prompt.ts`
- Delete: `server/src/content/prompts.ts`
- Delete: `server/src/config/pricing.ts`
- Delete: `client/src/config/pricing.ts`
- Verified: None of these files are imported anywhere (confirmed via grep).

**L6 — vitest globals:**
- In `server/vitest.config.ts`, remove `globals: true` from the test config. Then verify no test files use global `describe`/`it`/`expect` without imports — if they do, add `import { describe, it, expect } from 'vitest'` to each test file.

**L7 — musicLimiter dead code:**
- Already handled in M7 above (simplifying keyGenerator to IP-only removes the dead conversationId logic).
  </action>
  <verify>
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx tsc --noEmit` — no TypeScript errors
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx vitest run` — all existing tests pass
- Verify deleted files no longer exist: `ls server/src/services/system-prompt.ts server/src/content/prompts.ts server/src/config/pricing.ts client/src/config/pricing.ts` should all fail
  </verify>
  <done>
- Conversation history capped at 100 messages per conversation
- Redis GET-modify-SET protected by per-conversation mutex
- UsageTracker eviction is O(n) instead of O(n^2)
- Client disconnect aborts Bedrock stream writing
- Socket.IO maxHttpBufferSize set to 16KB
- Neo4j gracefully closes on SIGTERM/SIGINT
- conversationId validated as UUID format
- Internal errors masked in sceneVideo responses
- Redis disconnect/reconnect updates redisEnabled flag
- musicLimiter uses IP-only keying (no body reads on GET)
- 5 dead code files deleted
- vitest globals removed
  </done>
</task>

<task type="auto">
  <name>Task 3: Client Security, Memory Leaks & UX (Wave 3) — C5, H8-H15, M8-M12, L4-L5</name>
  <files>
    client/src/components/MessageBubble.tsx
    client/src/components/MultiplayerGame.tsx
    client/src/services/sceneVideo.ts
    client/src/services/backgroundMusic.ts
    client/src/services/audioController.ts
    client/src/components/SceneBackground.tsx
    client/src/components/MultiplayerLobby.tsx
    client/src/hooks/useSSEChat.ts
    client/src/hooks/useChatScroll.ts
    client/src/hooks/useMultiplayerRoom.ts
    client/src/components/MessageInput.tsx
    client/src/components/PlayerChat.tsx
    client/src/App.tsx
    client/package.json
  </files>
  <action>
**C5 — XSS via react-markdown:**
- Install rehype-sanitize: `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npm install rehype-sanitize`
- In `client/src/components/MessageBubble.tsx` line 31: Add `rehypePlugins={[rehypeSanitize]}` to the `<Markdown>` component. Import: `import rehypeSanitize from 'rehype-sanitize'`
- In `client/src/components/MultiplayerGame.tsx` lines 132 and 141: Same treatment — add `rehypePlugins={[rehypeSanitize]}` to both `<Markdown>` instances. Import `rehypeSanitize`.

**H8 — Scene video blob URL leak:**
- In `client/src/services/sceneVideo.ts`, in `resetScenes()` (line 135-142): Before `sceneBlobUrls` is implicitly abandoned, revoke all existing blob URLs:
  ```typescript
  export function resetScenes() {
    for (const url of sceneBlobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    sceneBlobUrls.clear();
    currentScene = null;
    currentVideoUrl = DEFAULT_VIDEO_URL;
    fetchingScenes.clear();
    pollCounts.clear();
    retryCounts.clear();
    notify();
  }
  ```

**H9 — Background music blob URL leak:**
- In `client/src/services/backgroundMusic.ts`, in `stopBackgroundMusic()` (line 351-378): After clearing state, revoke all mood blob URLs:
  ```typescript
  // Revoke all cached blob URLs to prevent memory leaks
  for (const url of moodBlobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  moodBlobUrls.clear();
  if (introBlobUrl) {
    URL.revokeObjectURL(introBlobUrl);
    introBlobUrl = null;
  }
  ```
  Add this BEFORE the `notify()` call at the end of `stopBackgroundMusic`.

**H10 — Audio controller URL leak:**
- In `client/src/services/audioController.ts`: Track the blob URL of the currently playing audio. Add `let currentUrl: string | null = null;` at module level.
- In `playAudio()`: Before setting `current`, if there's an existing `currentUrl`, revoke it: `if (currentUrl) URL.revokeObjectURL(currentUrl);`
- In `playFromResponse()`: Set `currentUrl = url` after creating the blob URL. Remove the `audio.addEventListener('ended', () => URL.revokeObjectURL(url))` since `stopAudio` and the next `playAudio` call will handle it.
- In `stopAudio()`: Add `if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }`

**H11 — ImageBitmap frame cap:**
- In `client/src/components/SceneBackground.tsx`, in the `usePingPong` hook, in the `captureLoop` function (line 42): Add a frame cap:
  ```typescript
  const MAX_FRAMES = 120;
  ```
  In the captureLoop, add `if (frames.length >= MAX_FRAMES) return;` before `createImageBitmap(video)`.

**H12 — Stale closure in SceneBackground crossfade:**
- In `client/src/components/SceneBackground.tsx` line 161-168, the `handleIncomingCanPlay` callback uses `incomingUrl` from closure which may be stale. Fix by using functional state update:
  ```typescript
  const handleIncomingCanPlay = useCallback(() => {
    setIncomingReady(true);
    setTimeout(() => {
      setIncomingUrl(prev => {
        if (prev) setActiveUrl(prev);
        return null;
      });
      setIncomingReady(false);
    }, CROSSFADE_MS);
  }, []); // No dependency on incomingUrl needed
  ```

**H13 — Side effect in state updater (MultiplayerLobby):**
- In `client/src/components/MultiplayerLobby.tsx` lines 88-92: The `onRoomStarted` handler calls `onGameStart(prev)` inside `setRoomState`. Fix by using a ref:
  ```typescript
  const roomStateRef = useRef<RoomState | null>(null);
  ```
  Keep `roomStateRef.current = roomState` synced via a separate statement wherever `setRoomState` is called (or use a useEffect). Then change `onRoomStarted`:
  ```typescript
  function onRoomStarted() {
    const current = roomStateRef.current;
    if (current) onGameStart(current);
  }
  ```
  Add `roomStateRef.current = roomState` synced in a useEffect: `useEffect(() => { roomStateRef.current = roomState; }, [roomState]);`

**H14 — Stale messages closure in useSSEChat:**
- In `client/src/hooks/useSSEChat.ts` lines 48-54: The `replayMessageAudio` callback depends on `messages` state which creates stale closures. Fix by using a ref:
  ```typescript
  const messagesRef = useRef<Message[]>([]);
  ```
  Keep in sync: add `messagesRef.current = messages;` after each `setMessages` call, or use a useEffect: `useEffect(() => { messagesRef.current = messages; }, [messages]);`
  Then change `replayMessageAudio`:
  ```typescript
  const replayMessageAudio = useCallback((messageId: string) => {
    const msg = messagesRef.current.find(m => m.id === messageId);
    if (!msg?.audioUrl) return;
    stopGlobalAudio();
    const audio = new Audio(msg.audioUrl);
    playAudio(audio, messageId);
  }, []); // No dependency on messages
  ```

**H15 — Non-null assertion on multiplayerRoomCode:**
- In `client/src/App.tsx` line 170: Replace `roomCode={multiplayerRoomCode!}` with a null guard:
  ```typescript
  ) : appState === 'multiplayerGame' && multiplayerRoomCode ? (
    <MultiplayerGame
      roomCode={multiplayerRoomCode}
      onLeave={handleMultiplayerLeave}
    />
  ```

**M8 — maxLength on input fields:**
- In `client/src/components/MessageInput.tsx` line 29: Add `maxLength={500}` to the input element
- In `client/src/components/MultiplayerGame.tsx` line 174: Add `maxLength={500}` to the action input element
- In `client/src/components/PlayerChat.tsx` line 200: Add `maxLength={500}` to the chat input element

**M9 — Scene video polling generation guard:**
- In `client/src/services/sceneVideo.ts`: Add a generation counter like backgroundMusic.ts:
  ```typescript
  let generation = 0;
  ```
  In `resetScenes()`, increment `generation++`.
  In `fetchSceneVideo()`, accept a `gen` parameter, check `if (gen !== generation) return null;` at the start and after each async operation (same pattern as backgroundMusic.ts `fetchMoodAudio`).
  In `changeScene()`, capture `const gen = generation;` and pass to `fetchSceneVideo(scene, gen)`.

**M10 — Missing aria-labels:**
- In `client/src/components/MessageBubble.tsx`: Add `aria-label="Stop audio"` and `aria-label="Play audio"` to the stop/play buttons (lines 36-49). They have `title` attributes but need `aria-label` for screen readers since the text content is just symbols.

**M11 — Smart scroll:**
- In `client/src/hooks/useChatScroll.ts`, replace the unconditional `scrollIntoView` with smart scroll that only scrolls if user is near the bottom:
  ```typescript
  export function useChatScroll(messages: Message[]) {
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        // Fallback: always scroll if no container ref
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const threshold = 150; // px from bottom
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      if (isNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, [messages]);

    return { bottomRef, containerRef };
  }
  ```
  Update consumers (ChatWindow) to use the new `containerRef` on the scrollable container div.

**M12 — Multiplayer error auto-clear:**
- In `client/src/hooks/useMultiplayerRoom.ts` line 114: After `setError(payload.message)`, add auto-clear:
  ```typescript
  function onRoomError(payload: { message: string }) {
    setError(payload.message);
    setTimeout(() => setError(prev => prev === payload.message ? null : prev), 8000);
  }
  ```
  Apply same pattern to `onDmError` as well.

**L4 — selectedClass/selectedPronouns as refs rendered in JSX:**
- In `client/src/App.tsx` lines 23-24: Replace `useRef` with `useState` for `selectedClass` and `selectedPronouns` since they're read in JSX (lines 137-139):
  ```typescript
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null);
  const [selectedPronouns, setSelectedPronouns] = useState<string>('They/Them');
  ```
  Update all `.current` references to direct value access. Update `handleClassSelected` to use `setSelectedClass(cls)` and `setSelectedPronouns(pronouns)`. Update `handleStart` to pass `selectedClass` directly. Update `handleReset` to use `setSelectedClass(null)` and `setSelectedPronouns('They/Them')`.

**L5 — MessageInput disabled hardcoded:**
- In `client/src/App.tsx` line 156: Change `disabled={false}` to `disabled={isLoading}` so the input is properly disabled while the DM is responding.
  </action>
  <verify>
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx tsc --noEmit` — no TypeScript errors
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx tsc --noEmit` — no TypeScript errors (server unchanged but verify)
- `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx vitest run` — all tests pass
  </verify>
  <done>
- rehype-sanitize installed and applied to all 3 Markdown instances (MessageBubble x1, MultiplayerGame x2)
- All blob URLs properly revoked on reset/stop (sceneVideo, backgroundMusic, audioController)
- ImageBitmap frames capped at 120
- Stale closures fixed in SceneBackground, MultiplayerLobby, useSSEChat
- Non-null assertion replaced with null guard in App.tsx
- maxLength=500 on all player input fields
- Scene video has generation guard for stale polling
- Icon buttons have aria-label attributes
- Smart scroll only auto-scrolls when near bottom
- Multiplayer errors auto-clear after 8 seconds
- selectedClass/selectedPronouns use useState (re-render on change)
- MessageInput disabled during loading
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:
1. `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx tsc --noEmit` — clean
2. `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx tsc --noEmit` — clean
3. `cd /Users/blaisealbuquerque/Projects/awsHackathon/server && npx vitest run` — all tests pass
4. Dead files no longer exist on disk
5. `grep -r "dev-secret-do-not-use-in-production" server/src/` — only appears inside the guarded `getJwtSecret()` function, never as a raw fallback
6. `grep -r "rehypeSanitize" client/src/` — found in MessageBubble.tsx and MultiplayerGame.tsx
</verification>

<success_criteria>
All 34 code review issues resolved:
- 5 CRITICAL: JWT hardened, chat/socket inputs sanitized, XSS prevented
- 15 HIGH: Socket auth + rate limiting, memory caps, blob leaks fixed, stale closures fixed
- 12 MEDIUM: Client disconnect handling, maxHttpBufferSize, graceful shutdown, UUID validation, error masking, Redis events, smart scroll, error auto-clear, aria-labels, input limits, generation guard, rate limiter fix
- 7 LOW: Dead code deleted, vitest globals removed, refs-to-state, disabled prop, duplicate code
TypeScript compiles clean in both client and server.
All existing tests pass.
</success_criteria>

<output>
After completion, create `.planning/quick/5-fix-all-34-code-review-issues-critical-s/5-SUMMARY.md`
</output>
