---
phase: quick-04
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/types/multiplayer.ts
  - server/src/sockets/types.ts
  - server/src/services/roomStore.ts
  - server/src/sockets/roomHandlers.ts
  - server/src/sockets/chatHandlers.ts
  - server/src/services/bedrock.ts
  - client/src/components/MultiplayerLobby.tsx
  - client/src/hooks/useMultiplayerRoom.ts
  - client/src/components/PlayerStatusBar.tsx
  - client/src/components/PlayerChat.tsx
autonomous: true

must_haves:
  truths:
    - "Player can select Male, Female, or Non-binary gender during character creation"
    - "Gender selection is required before creating or joining a room"
    - "Gender appears in the lobby player list alongside class"
    - "Gender flows through to the DM system prompt party roster"
    - "Gender icon appears next to player name in PlayerStatusBar and PlayerChat"
  artifacts:
    - path: "client/src/types/multiplayer.ts"
      provides: "GenderId type, GENDERS constant array, helper functions"
      contains: "GenderId"
    - path: "server/src/sockets/types.ts"
      provides: "gender field in PlayerPayload, SocketData, ChatMessagePayload"
      contains: "gender"
    - path: "client/src/components/MultiplayerLobby.tsx"
      provides: "Gender selector UI in create/join form"
      contains: "gender"
  key_links:
    - from: "client/src/components/MultiplayerLobby.tsx"
      to: "server/src/sockets/roomHandlers.ts"
      via: "socket.emit room:create and room:join include gender field"
      pattern: "gender"
    - from: "server/src/sockets/roomHandlers.ts"
      to: "server/src/services/roomStore.ts"
      via: "Player object includes gender, stored in socket.data.gender"
      pattern: "gender"
    - from: "server/src/services/bedrock.ts"
      to: "DM AI prompt"
      via: "buildMultiplayerSystemPrompt includes gender in party roster"
      pattern: "gender"
---

<objective>
Add gender selection (Male/Female/Non-binary) to character creation and thread it end-to-end through the multiplayer system: types, socket events, server store, DM prompts, and display in player UI.

Purpose: Players should be able to express their character's gender identity, and the DM AI should use correct pronouns/descriptors when narrating.
Output: Gender selector in lobby, gender threaded through all multiplayer data structures, gender visible in player status bar and chat.
</objective>

<execution_context>
@/Users/blaisealbuquerque/.claude/get-shit-done/workflows/execute-plan.md
@/Users/blaisealbuquerque/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@client/src/types/multiplayer.ts
@server/src/sockets/types.ts
@server/src/services/roomStore.ts
@server/src/sockets/roomHandlers.ts
@server/src/sockets/chatHandlers.ts
@server/src/services/bedrock.ts
@client/src/components/MultiplayerLobby.tsx
@client/src/hooks/useMultiplayerRoom.ts
@client/src/components/PlayerStatusBar.tsx
@client/src/components/PlayerChat.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add gender type and thread through server-side types, store, handlers, and DM prompt</name>
  <files>
    client/src/types/multiplayer.ts
    server/src/sockets/types.ts
    server/src/services/roomStore.ts
    server/src/sockets/roomHandlers.ts
    server/src/sockets/chatHandlers.ts
    server/src/services/bedrock.ts
  </files>
  <action>
**client/src/types/multiplayer.ts:**
1. Add `GenderId` type: `export type GenderId = 'male' | 'female' | 'nonbinary';`
2. Add `GenderDef` interface: `{ id: GenderId; name: string; icon: string; }`
3. Add `GENDERS` constant array:
   - `{ id: 'male', name: 'Male', icon: '\u2642\uFE0F' }` (male sign)
   - `{ id: 'female', name: 'Female', icon: '\u2640\uFE0F' }` (female sign)
   - `{ id: 'nonbinary', name: 'Non-binary', icon: '\u26A7\uFE0F' }` (transgender symbol, commonly used for NB)
4. Add `gender: GenderId` field to `MultiplayerPlayer` interface.
5. Add `fromGender: GenderId` field to `ChatMessage` interface (optional field with `?` — backward compat).
6. Add `randomGender()` helper function (picks random from GENDERS array, returns GenderId).
7. Add `getGenderIcon(genderId: GenderId): string` helper that looks up icon from GENDERS array, fallback `'?'`.

**server/src/sockets/types.ts:**
1. Add `gender: string` to `PlayerPayload`.
2. Add `gender: string` to `SocketData`.
3. Add `fromGender?: string` to `ChatMessagePayload`.
4. Add `gender: string` param to the `room:create` event in `ClientToServerEvents`: `(data: { displayName: string; characterClass: string; gender: string }) => void`
5. Add `gender: string` param to the `room:join` event in `ClientToServerEvents`: `(data: { code: string; displayName: string; characterClass: string; gender: string }) => void`

**server/src/services/roomStore.ts:**
1. Add `gender: string` to the `Player` type.
2. In `getRoomStatePayload()`, include `gender: p.gender` in the mapped PlayerPayload.

**server/src/sockets/roomHandlers.ts:**
1. In `room:create` handler: destructure `gender` from the event data alongside `displayName` and `characterClass`. Add `gender` to the player object literal. Set `socket.data.gender = gender`.
2. In `room:join` handler: destructure `gender` from the event data. Add `gender` to the player object literal. Set `socket.data.gender = gender`. Add `gender` to `playerPayload` for the `room:player-joined` emit.

**server/src/sockets/chatHandlers.ts:**
1. In the `chat:send` handler, add `fromGender: socket.data.gender ?? 'nonbinary'` to the message object.

**server/src/services/bedrock.ts:**
1. Update `buildMultiplayerSystemPrompt` parameter type to include `gender?: string`.
2. Update the roster line from:
   `- ${p.displayName}: ${p.characterClass}`
   to:
   `- ${p.displayName}: ${p.characterClass} (${p.gender ?? 'nonbinary'})`
   This gives the DM AI enough info to use appropriate pronouns.
  </action>
  <verify>
Run `npx tsc --noEmit` from both `client/` and `server/` directories to confirm no type errors. Grep for `gender` across modified files to confirm all plumbing is in place.
  </verify>
  <done>
Gender type exists in shared types. Server types include gender in PlayerPayload, SocketData, ChatMessagePayload, and ClientToServerEvents. RoomStore Player type has gender field, and getRoomStatePayload passes it through. Room handlers accept gender from create/join events and store on socket.data. Chat handler includes fromGender in messages. DM system prompt roster includes gender for pronoun context.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add gender selector to lobby UI and display gender in PlayerStatusBar and PlayerChat</name>
  <files>
    client/src/components/MultiplayerLobby.tsx
    client/src/hooks/useMultiplayerRoom.ts
    client/src/components/PlayerStatusBar.tsx
    client/src/components/PlayerChat.tsx
  </files>
  <action>
**client/src/components/MultiplayerLobby.tsx:**
1. Import `GenderId`, `GENDERS`, `randomGender`, `getGenderIcon` from `../types/multiplayer`.
2. Add state: `const [gender, setGender] = useState<GenderId | null>(randomGender);` (pre-selected randomly like characterClass).
3. Add gender to `isValid` check: `gender !== null` in the condition.
4. In the create/join form (the `step === 'create' || step === 'join'` block), add a gender selector section BETWEEN the display name input and the character class picker. Use the same design pattern as the class picker:
   - Label: "Choose Your Identity" (font-cinzel, tracking-widest, uppercase, text-xs, text-parchment/60)
   - 3-column grid (`grid grid-cols-3 gap-2`)
   - Each button shows: gender icon (text-2xl) + gender name (font-cinzel text-xs)
   - Selected state: `border-current bg-current/10 text-parchment` (use a neutral highlight since genders don't have associated colors — use `text-dm-gold` for the selected gender button border and text)
   - Unselected state: same as class buttons (`border-blood/30 bg-surface text-parchment hover:border-blood-light`)
5. In `handleSubmit()`, include `gender: gender!` in both `socket.emit('room:create', {...})` and `socket.emit('room:join', {...})` calls.
6. In the lobby player list, add the gender icon after the class icon. Between the class icon `<span>` and the name `<div>`, add: `<span className="text-sm">{getGenderIcon(player.gender)}</span>` (import the type properly — `player.gender` will exist since `MultiplayerPlayer` now has it).

**client/src/hooks/useMultiplayerRoom.ts:**
1. Import `GenderId` from `../types/multiplayer`.
2. In the `sendChat` callback, add `fromGender` to the `localMsg` object: `fromGender: (me?.gender ?? 'nonbinary') as GenderId,`
3. In the `addLocalActionMessage` callback, add `fromGender` to the `actionMsg` object similarly.

**client/src/components/PlayerStatusBar.tsx:**
1. Import `getGenderIcon` from `../types/multiplayer`.
2. In the player card, add the gender icon next to the class icon in Row 1. After the class icon `<span>`, add: `<span className="text-xs opacity-60" title={player.gender}>{getGenderIcon(player.gender)}</span>`. Keep it subtle (text-xs, opacity-60) so it doesn't overwhelm the class icon.

**client/src/components/PlayerChat.tsx:**
1. Import `getGenderIcon` from `../types/multiplayer`.
2. In the sender name display (the `{!isLocal && (` block), append the gender icon after the name:
   Change from: `{msg.fromName}`
   To: `{msg.fromName} {msg.fromGender ? getGenderIcon(msg.fromGender) : ''}`
   Keep the gender icon inline, same font size as the name.
  </action>
  <verify>
Run `npx tsc --noEmit` from `client/` to confirm no type errors. Visually inspect the lobby form to confirm gender selector appears between name and class picker with 3 options (Male, Female, Non-binary). Confirm gender icon appears in lobby player list, PlayerStatusBar, and PlayerChat sender names.
  </verify>
  <done>
Gender selector with 3 options (Male/Female/Non-binary) appears in the character creation form between display name and class picker. Gender is emitted in room:create and room:join socket events. Gender icon displays next to player names in the lobby waiting room, the PlayerStatusBar during gameplay, and the PlayerChat sender labels. The DM AI receives gender info in the party roster for correct pronoun usage.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in both `client/` and `server/` directories (no type errors).
2. Gender selector renders in lobby with 3 options and matches the visual style of the class picker.
3. Creating/joining a room emits gender in the socket payload.
4. Gender appears in the lobby player list, PlayerStatusBar, and PlayerChat.
5. The DM system prompt roster includes gender for each player.
</verification>

<success_criteria>
- GenderId type ('male' | 'female' | 'nonbinary') defined and used end-to-end
- Gender selector UI in lobby form with Male/Female/Non-binary options
- Gender threaded through: socket events -> server store -> room state payload -> client display
- DM AI prompt includes gender in party roster for pronoun awareness
- Gender icon visible in lobby, status bar, and chat UI
- TypeScript compiles without errors in both client and server
</success_criteria>

<output>
After completion, create `.planning/quick/4-add-gender-selection-to-character-creati/4-SUMMARY.md`
</output>
