---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/types/multiplayer.ts
  - client/src/components/PlayerChat.tsx
  - client/src/components/MultiplayerGame.tsx
  - client/src/hooks/useMultiplayerRoom.ts
autonomous: true
must_haves:
  truths:
    - "Each chat bubble has a visible border in the sender's class color"
    - "Each chat bubble has a subtle background tint matching the sender's class color"
    - "Player actions appear in the chat feed with the player's name and class-colored styling"
    - "Local player's own messages also show correct class-colored border and background"
  artifacts:
    - path: "client/src/types/multiplayer.ts"
      provides: "getClassBorderColor and getClassBgColor helper functions"
      exports: ["getClassBorderColor", "getClassBgColor"]
    - path: "client/src/components/PlayerChat.tsx"
      provides: "Class-colored chat bubbles with border and background tinting, action message rendering"
    - path: "client/src/components/MultiplayerGame.tsx"
      provides: "Passes localPlayer to PlayerChat, injects action messages into chat"
    - path: "client/src/hooks/useMultiplayerRoom.ts"
      provides: "Optimistic local messages use correct player class"
  key_links:
    - from: "client/src/components/PlayerChat.tsx"
      to: "client/src/types/multiplayer.ts"
      via: "getClassBorderColor, getClassBgColor imports"
      pattern: "getClass(Border|Bg)Color"
    - from: "client/src/components/MultiplayerGame.tsx"
      to: "client/src/components/PlayerChat.tsx"
      via: "localPlayer prop"
      pattern: "localPlayer"
---

<objective>
Style multiplayer chat bubbles with class-colored borders and subtle background tints, and surface player actions in the party chat.

Purpose: Make the chat visually expressive — each player's messages are instantly recognizable by their class color. Player actions (submitted to DM) also appear in chat so the party can see what everyone is doing.

Output: Updated PlayerChat with class-colored bubbles and action messages, plus helper functions for border/bg color mapping.
</objective>

<execution_context>
@/Users/blaisealbuquerque/.claude/get-shit-done/workflows/execute-plan.md
@/Users/blaisealbuquerque/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@client/src/types/multiplayer.ts
@client/src/components/PlayerChat.tsx
@client/src/components/MultiplayerGame.tsx
@client/src/hooks/useMultiplayerRoom.ts
@client/src/index.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add class color helpers and ChatMessage type variant for actions</name>
  <files>client/src/types/multiplayer.ts</files>
  <action>
Add two new helper functions next to the existing `getClassColor` and `getClassIcon`:

1. `getClassBorderColor(classId: CharacterClassId): string` — returns a Tailwind border color class mapping:
   - fighter: `border-red-400`
   - wizard: `border-blue-400`
   - rogue: `border-purple-400`
   - cleric: `border-yellow-300`
   - ranger: `border-green-400`
   - paladin: `border-pink-400`
   - fallback: `border-parchment/40`

2. `getClassBgColor(classId: CharacterClassId): string` — returns a very subtle Tailwind bg class (low opacity so the dark fantasy theme bleeds through):
   - fighter: `bg-red-400/10`
   - wizard: `bg-blue-400/10`
   - rogue: `bg-purple-400/10`
   - cleric: `bg-yellow-300/10`
   - ranger: `bg-green-400/10`
   - paladin: `bg-pink-400/10`
   - fallback: `bg-parchment/5`

3. Add an optional `type` field to the `ChatMessage` interface:
   ```typescript
   type?: 'chat' | 'action';
   ```
   This distinguishes regular chat messages from player action announcements. Default (undefined) treated as 'chat'.
  </action>
  <verify>TypeScript compiles: `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx tsc --noEmit`</verify>
  <done>Three new exports exist: getClassBorderColor, getClassBgColor, and ChatMessage has optional `type` field</done>
</task>

<task type="auto">
  <name>Task 2: Surface player actions in chat and fix local message class</name>
  <files>client/src/hooks/useMultiplayerRoom.ts, client/src/components/MultiplayerGame.tsx</files>
  <action>
Two changes:

**useMultiplayerRoom.ts — Fix local chat class and expose local player class:**

1. The `sendChat` callback currently hardcodes `fromClass: 'fighter'` for optimistic local messages. Fix this by:
   - Adding a `useRef` for the local player's class (or deriving from `players` state + `socket.id`).
   - In `sendChat`, find the local player from `players` to get the correct `characterClass` and `displayName`. Use a ref that updates when players change to avoid stale closures.
   - The local message should use the player's actual class and display name "You" (keep fromName as "You" since that's the convention for local messages).

2. Expose the local player object. Add to the return type and return value:
   ```typescript
   localPlayer: MultiplayerPlayer | undefined
   ```
   Compute as: `players.find(p => p.socketId === socket.id)`

**MultiplayerGame.tsx — Inject action messages into chat:**

When `submitAction` is called, also insert a ChatMessage into chat with `type: 'action'`:

1. Import `ChatMessage` and `CharacterClassId` types.
2. After calling `submitAction(trimmed)` in `handleSubmitAction`, also add an action message to chat. Since `chatMessages` lives in useMultiplayerRoom, the cleanest approach is:
   - Add a new function in useMultiplayerRoom: `addLocalActionMessage(actionText: string)` that creates a ChatMessage with `type: 'action'`, the local player's displayName, class, and the action text, and appends it to chatMessages.
   - Export this from useMultiplayerRoom.
   - Call it from MultiplayerGame after submitAction.
3. Pass `localPlayer` to PlayerChat as a new prop (needed for Task 3 to style local messages correctly).

Note: Action messages are local-only display — they do NOT go through the socket chat:send pathway. They are just visual indicators in the party chat so players can see what actions were submitted.
  </action>
  <verify>TypeScript compiles: `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx tsc --noEmit`</verify>
  <done>Local chat messages use correct player class. Submitted actions appear as 'action' type messages in the chat feed. localPlayer is passed to PlayerChat.</done>
</task>

<task type="auto">
  <name>Task 3: Style chat bubbles with class-colored borders, backgrounds, and action styling</name>
  <files>client/src/components/PlayerChat.tsx</files>
  <action>
Update PlayerChat to use class-colored styling on every message bubble and render action messages distinctively.

**Props update:**
Add `localPlayer?: MultiplayerPlayer` to PlayerChatProps. Import `getClassBorderColor`, `getClassBgColor`, `MultiplayerPlayer` from types.

**Message bubble styling (for ALL messages — local and remote):**

Replace the current static bubble classes. For each message:
- Get `borderClass = getClassBorderColor(msg.fromClass)`
- Get `bgClass = getClassBgColor(msg.fromClass)`
- Apply to the bubble button element:
  ```
  `max-w-[200px] px-3 py-2 rounded text-sm text-left leading-snug font-fell border ${borderClass} ${bgClass} text-parchment`
  ```
- Remove the old conditional `isLocal ? 'bg-blood/30 ... border-blood/40' : 'bg-dm-bubble/60 ... border-blood/20'` logic entirely. All bubbles now use their sender's class color for border and background.
- Keep the alignment logic: local messages right-aligned, remote left-aligned.

**Local messages — show correct class color:**
If `localPlayer` prop is provided, use `localPlayer.characterClass` to determine color for local messages (since `msg.fromClass` on optimistic local messages may have been set from the fixed sendChat).

**Sender name display:**
- Currently only shows name for non-local messages. Keep this behavior.
- For local messages, the class-colored border/bg already identifies the player.

**Action message styling (type === 'action'):**
When `msg.type === 'action'`, render with a distinct style:
- Use italic text and a slightly different visual treatment
- Prefix the text with the sender's class icon (use `getClassIcon(msg.fromClass)`)
- Format: `{icon} {fromName} {action text}` — e.g., "You cast a fireball at the dragon"
- Use `text-xs` font size, italic, with the same class border color but at even lower opacity
- Make these full-width (not max-w-[200px]) and center-aligned rather than left/right aligned
- Use a format like:
  ```
  <div className="w-full text-center">
    <span className={`text-xs font-fell italic ${colorClass} opacity-70`}>
      {icon} {fromName}: {msg.text}
    </span>
  </div>
  ```
- Action messages should NOT have the bubble button wrapper or reaction picker — they are informational only.

**Keep all existing functionality:** reaction picker, reaction counts, timestamps, emoji reactions bar, auto-scroll. Only modify the visual styling and add action message rendering.
  </action>
  <verify>
1. TypeScript compiles: `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx tsc --noEmit`
2. Dev server runs without errors: `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx vite build`
  </verify>
  <done>
- Chat bubbles show class-colored borders (red for fighter, blue for wizard, etc.)
- Chat bubbles have subtle class-colored background tint
- Player actions appear inline in chat as italic, icon-prefixed, centered text with class color
- Local messages use correct class color (not hardcoded fighter)
- All existing chat features (reactions, timestamps, emoji picker) still work
  </done>
</task>

</tasks>

<verification>
1. `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx tsc --noEmit` — zero type errors
2. `cd /Users/blaisealbuquerque/Projects/awsHackathon/client && npx vite build` — builds successfully
3. Visual: chat bubbles for different classes show visually distinct borders and subtle bg tints
4. Visual: submitting an action shows it as italic text in the party chat
</verification>

<success_criteria>
- Every chat bubble in PlayerChat is bordered with the sender's class color
- Every chat bubble has a subtle class-colored background tint
- Player action submissions appear in the party chat feed with class icon, name, and italic action text
- Local player messages use the correct class color (not hardcoded fighter red)
- All existing functionality preserved (reactions, timestamps, emoji picker, auto-scroll)
</success_criteria>

<output>
After completion, create `.planning/quick/2-style-multiplayer-chat-boxes-with-speake/2-SUMMARY.md`
</output>
