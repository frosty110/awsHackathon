---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/components/ClassSelect.tsx
  - client/src/components/MultiplayerLobby.tsx
  - client/src/components/AudioPlayer.tsx
  - client/src/types/multiplayer.ts
  - client/src/hooks/useSSEChat.ts
  - client/src/App.tsx
  - server/src/services/bedrock.ts
  - server/src/services/roomStore.ts
  - server/src/services/conversationStore.ts
  - server/src/sockets/types.ts
  - server/src/sockets/roomHandlers.ts
  - server/src/sockets/turnHandlers.ts
  - server/src/routes/chat.ts
  - server/src/routes/narrate.ts
autonomous: true
must_haves:
  truths:
    - "Player can select pronouns (He/Him, She/Her, They/Them, or Custom text) during character creation in single-player"
    - "Player can select pronouns during character creation in multiplayer lobby"
    - "Default pronoun is They/Them when unset"
    - "DM narration uses the player's selected pronouns when referring to their character"
    - "Multiplayer DM narration uses correct pronouns for each player in the party roster"
  artifacts:
    - path: "client/src/components/ClassSelect.tsx"
      provides: "Pronoun picker UI with 3 presets + Custom text input"
      contains: "pronouns"
    - path: "client/src/components/MultiplayerLobby.tsx"
      provides: "Pronoun picker in multiplayer create/join form"
      contains: "pronouns"
    - path: "server/src/services/bedrock.ts"
      provides: "Pronoun injection into DM system prompt"
      contains: "pronouns"
  key_links:
    - from: "client/src/components/ClassSelect.tsx"
      to: "client/src/App.tsx"
      via: "onSelect callback now includes pronouns"
      pattern: "pronouns"
    - from: "client/src/App.tsx"
      to: "client/src/hooks/useSSEChat.ts"
      via: "startAdventure passes pronouns"
      pattern: "pronouns"
    - from: "client/src/hooks/useSSEChat.ts"
      to: "server/src/routes/chat.ts"
      via: "POST body includes pronouns field"
      pattern: "pronouns"
    - from: "client/src/components/MultiplayerLobby.tsx"
      to: "server/src/sockets/roomHandlers.ts"
      via: "socket emit room:create/room:join includes pronouns"
      pattern: "pronouns"
    - from: "server/src/sockets/turnHandlers.ts"
      to: "server/src/services/bedrock.ts"
      via: "buildMultiplayerSystemPrompt receives pronouns per player"
      pattern: "pronouns"
---

<objective>
Add a pronoun picker (He/Him, She/Her, They/Them, Custom text) to character creation in both single-player and multiplayer flows. Thread the selected pronouns through to the server so the Bedrock DM system prompt instructs the AI to use correct pronouns when narrating about each player's character.

Purpose: Inclusive character creation -- players can specify how the DM refers to their character.
Output: Pronoun picker UI in both flows, pronouns injected into DM system prompt for both single-player and multiplayer.
</objective>

<execution_context>
@/Users/blaisealbuquerque/.claude/get-shit-done/workflows/execute-plan.md
@/Users/blaisealbuquerque/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@client/src/components/ClassSelect.tsx
@client/src/components/MultiplayerLobby.tsx
@client/src/App.tsx
@client/src/hooks/useSSEChat.ts
@client/src/types/multiplayer.ts
@server/src/services/bedrock.ts
@server/src/services/roomStore.ts
@server/src/services/conversationStore.ts
@server/src/sockets/types.ts
@server/src/sockets/roomHandlers.ts
@server/src/sockets/turnHandlers.ts
@server/src/routes/chat.ts
@server/src/routes/narrate.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pronoun picker UI to ClassSelect and MultiplayerLobby</name>
  <files>
    client/src/components/ClassSelect.tsx
    client/src/components/MultiplayerLobby.tsx
    client/src/types/multiplayer.ts
  </files>
  <action>
**ClassSelect.tsx changes:**

1. Add `pronouns` state: `const [pronouns, setPronouns] = useState<string>('They/Them');` and `const [customPronouns, setCustomPronouns] = useState('');`

2. Update the `CharacterClass` export interface -- do NOT add pronouns to it. Instead, update the `ClassSelectProps.onSelect` callback signature to: `onSelect: (characterClass: CharacterClass, pronouns: string) => void`

3. Update `handleConfirm` to pass pronouns: `if (cls) onSelect(cls, pronouns === 'Custom' ? customPronouns.trim() || 'They/Them' : pronouns);`

4. Add a pronoun picker section BETWEEN the class detail panel and the "Begin Adventure" button. Use the same visual language as the class picker (border-blood/30, bg-surface, font-cinzel labels). Layout:
   - Label: "Pronouns" (same style as class grid label: `font-cinzel text-xs text-parchment/60 tracking-widest uppercase`)
   - Three preset buttons in a horizontal row: "He/Him", "She/Her", "They/Them" -- styled like the class buttons but smaller (px-4 py-2). Selected state uses `border-dm-gold bg-dm-gold/10 text-dm-gold`, unselected uses `border-blood/30 bg-surface text-parchment hover:border-blood-light`
   - A fourth "Custom" button in the same row
   - When "Custom" is selected, show a text input below (same style as multiplayer display name input: `bg-surface border border-blood/30 rounded px-3 py-2 font-fell text-parchment`) with placeholder "e.g. Ze/Zir" and maxLength 20

**multiplayer.ts changes:**

5. No type changes needed here -- pronouns will be a plain string field added to the socket payloads.

**MultiplayerLobby.tsx changes:**

6. Add pronouns state alongside existing characterClass state: `const [pronouns, setPronouns] = useState<string>('They/Them');` and `const [customPronouns, setCustomPronouns] = useState('');`

7. In the `handleSubmit` function, include pronouns in both `room:create` and `room:join` socket emissions:
   - `socket.emit('room:create', { displayName: displayName.trim(), characterClass, pronouns: resolvedPronouns })`
   - `socket.emit('room:join', { code: joinCode, displayName: displayName.trim(), characterClass, pronouns: resolvedPronouns })`
   Where `resolvedPronouns = pronouns === 'Custom' ? customPronouns.trim() || 'They/Them' : pronouns`

8. Add the same pronoun picker UI (from step 4) into the create/join form, placed AFTER the character class picker grid and BEFORE the "Enter the Fray" submit button. Reuse the same visual styling.

9. In the lobby player list rendering, show pronouns next to the class name if available. The player list currently shows `{player.displayName}` and class name below it. Add pronouns in parentheses after the class name: e.g. "Fighter (She/Her)". Access it via a new optional `pronouns` field on MultiplayerPlayer -- update the `MultiplayerPlayer` interface in `client/src/types/multiplayer.ts` to add `pronouns?: string`.

10. Update the `PlayerPayload` interface in `client/src/types/multiplayer.ts` (the MultiplayerPlayer interface already mirrors it) -- add `pronouns?: string` to both `MultiplayerPlayer` and the lobby display.
  </action>
  <verify>
    - `npx tsc --noEmit` in client/ passes
    - ClassSelect renders pronoun buttons below class detail panel
    - MultiplayerLobby create/join form renders pronoun buttons below class grid
  </verify>
  <done>
    Both ClassSelect and MultiplayerLobby show a pronoun picker with He/Him, She/Her, They/Them presets and Custom text input. Default is They/Them. Multiplayer lobby player list shows pronouns next to class name.
  </done>
</task>

<task type="auto">
  <name>Task 2: Thread pronouns through client-server data flow</name>
  <files>
    client/src/App.tsx
    client/src/hooks/useSSEChat.ts
    client/src/components/AudioPlayer.tsx
    server/src/routes/chat.ts
    server/src/routes/narrate.ts
    server/src/services/conversationStore.ts
    server/src/sockets/types.ts
    server/src/sockets/roomHandlers.ts
    server/src/services/roomStore.ts
  </files>
  <action>
**Single-player flow (client):**

1. **App.tsx**: Update `handleClassSelected` to accept pronouns: `function handleClassSelected(cls: CharacterClass, pronouns: string)`. Store pronouns alongside selectedClass in a new ref: `const selectedPronouns = useRef<string>('They/Them');`. Set it in handleClassSelected: `selectedPronouns.current = pronouns;`

2. **App.tsx**: Update `handleStart` to pass pronouns to startAdventure: `void startAdventure(narration, selectedClass.current ?? undefined, selectedPronouns.current);`

3. **App.tsx**: Update `handleReset` to reset pronouns: `selectedPronouns.current = 'They/Them';`

4. **App.tsx**: Update the "Playing as" display (in classSelect appState) to show pronouns: add `({selectedPronouns.current})` after the class name span.

5. **AudioPlayer.tsx**: Add `pronouns?: string` to the AudioPlayer props interface. Pass it through in the `/narrate` POST body alongside `characterClass`. Update the component in App.tsx to pass `pronouns={selectedPronouns.current}`.

6. **useSSEChat.ts**: Update `startAdventure` signature to accept pronouns: `async (narration?, characterClass?, pronouns?: string)`. Store in a new ref `pronounsRef = useRef<string | null>(null)`. Set `pronounsRef.current = pronouns ?? null` in startAdventure. In the `sendMessage` function's fetch body, add `...(pronounsRef.current ? { pronouns: pronounsRef.current } : {})` alongside characterClass. Reset pronounsRef in the reset function.

**Single-player flow (server):**

7. **server/src/routes/chat.ts**: Parse `pronouns` from body: `const pronouns = typeof body.pronouns === "string" ? body.pronouns.trim() : undefined;`. Pass it to `getOrCreate` and to `streamBedrockResponse` options: `{ characterClass: resolvedClass, pronouns, loreContext }`.

8. **server/src/routes/narrate.ts**: Parse `pronouns` from body same way. Pass to `buildOpeningPrompt(characterClass, pronouns)` -- update the function to accept pronouns and append to the prompt. Pass to `streamBedrockResponse` options and `getOrCreate`.

9. **server/src/services/conversationStore.ts**: Add `pronouns?: string` to the Conversation type. Update `getOrCreate` to accept and store pronouns. Add `getPronouns(conversationId)` export that returns the stored pronouns. In chat.ts, use `const resolvedPronouns = pronouns || getPronouns(conversation.id);` similar to the existing resolvedClass pattern.

**Multiplayer flow (server):**

10. **server/src/sockets/types.ts**: Add `pronouns?: string` to `PlayerPayload`. Add `pronouns?: string` to `SocketData`. Update `ClientToServerEvents` for `room:create` and `room:join` to include `pronouns?: string` in their data parameters.

11. **server/src/services/roomStore.ts**: Add `pronouns: string` to the `Player` type (default "They/Them"). Update `getRoomStatePayload` to include `pronouns: p.pronouns` in the PlayerPayload mapping.

12. **server/src/sockets/roomHandlers.ts**: In `room:create` handler, destructure `pronouns` from the payload (defaulting to "They/Them"): `const { displayName, characterClass, pronouns = 'They/Them' } = data;`. Add `pronouns` to the player object and to `socket.data.pronouns`. Do the same for `room:join` handler. Include `pronouns` in the `playerPayload` sent via `room:player-joined`.
  </action>
  <verify>
    - `npx tsc --noEmit` in both client/ and server/ passes
    - Grep for "pronouns" in chat.ts, narrate.ts, roomHandlers.ts confirms the field is parsed and forwarded
  </verify>
  <done>
    Pronouns flow from client UI through to server in both single-player (POST body) and multiplayer (socket payload) paths. Server stores pronouns per conversation and per player.
  </done>
</task>

<task type="auto">
  <name>Task 3: Inject pronouns into Bedrock DM system prompt</name>
  <files>
    server/src/services/bedrock.ts
    server/src/sockets/turnHandlers.ts
  </files>
  <action>
**Single-player prompt injection (bedrock.ts):**

1. Update `streamBedrockResponse` options type to include `pronouns?: string`.

2. In the system prompt construction (the `const systemPrompt = ...` ternary), update the single-player branch (the `options?.characterClass` case) to append pronoun instructions when pronouns are provided:

```typescript
const pronounClause = options?.pronouns
  ? `\n\nThe player uses ${options.pronouns} pronouns. ALWAYS use these pronouns (${options.pronouns}) when referring to the player's character. Never use other pronouns for the player character.`
  : '';

// In the characterClass branch:
`${DM_SYSTEM_PROMPT}\n\n## Player Character\nThe player is a ${options.characterClass}. Reference their class naturally in narration.${pronounClause}`
```

For the case where there's no characterClass but there IS pronouns (unlikely but handle it), append the pronoun clause to the base DM_SYSTEM_PROMPT.

**Multiplayer prompt injection (bedrock.ts):**

3. Update `buildMultiplayerSystemPrompt` signature to accept pronouns per player:
```typescript
export function buildMultiplayerSystemPrompt(
  players: Array<{ displayName: string; characterClass: string; pronouns?: string }>
): string
```

4. Update the roster line to include pronouns: `- ${p.displayName}: ${p.characterClass} (${p.pronouns || 'They/Them'})`.

5. Add a pronouns instruction after the roster section:
```
When referring to each player character, use their specified pronouns:\n
${players.map(p => `- ${p.displayName}: ${p.pronouns || 'They/Them'}`).join('\n')}
```

**Multiplayer turn handlers (turnHandlers.ts):**

6. In `triggerDMOpening` and `triggerDMResponse`, the players array is already spread from `room.players.values()`. Since the Player type now includes `pronouns`, no changes are needed to these functions -- `buildMultiplayerSystemPrompt(players)` will automatically receive the pronouns field from the Player objects. Verify this is the case by confirming the Player type in roomStore.ts has `pronouns`.

7. In `triggerDMResponse`, the action lines currently format as `[${p.displayName} the ${p.characterClass}]`. No change needed here -- pronouns are in the system prompt, not repeated per action.
  </action>
  <verify>
    - `npx tsc --noEmit` in server/ passes
    - Grep `server/src/services/bedrock.ts` for "pronouns" shows injection in both single-player and multiplayer prompt paths
    - The buildMultiplayerSystemPrompt function roster output includes pronouns per player
  </verify>
  <done>
    Single-player: DM system prompt includes "The player uses X pronouns. ALWAYS use these pronouns when referring to the player's character." when pronouns are set.
    Multiplayer: Party roster includes pronouns per player, plus explicit instruction to use specified pronouns for each character. Default They/Them applied when no pronouns specified.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in both client/ and server/
2. Single-player flow: ClassSelect shows pronoun picker -> selecting "She/Her" + Fighter -> server receives pronouns in /narrate and /chat -> DM prompt includes "The player uses She/Her pronouns"
3. Multiplayer flow: Lobby shows pronoun picker -> creating room with "He/Him" -> server Player object has pronouns: "He/Him" -> buildMultiplayerSystemPrompt roster shows "PlayerName: Fighter (He/Him)"
4. Default They/Them: Skipping pronoun selection -> server receives "They/Them" -> prompt uses They/Them
5. Custom pronouns: Selecting Custom and typing "Ze/Zir" -> flows through identically
</verification>

<success_criteria>
- Pronoun picker visible in both ClassSelect and MultiplayerLobby with He/Him, She/Her, They/Them, and Custom options
- Custom text input appears when Custom is selected
- Default is They/Them
- Pronouns appear in DM system prompt for single-player
- Pronouns appear in multiplayer party roster and pronoun instruction block
- TypeScript compiles cleanly in both client and server
- No changes to voices.ts (TTS voice selection is NPC-only, unrelated to player pronouns)
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-pronoun-picker-to-character-creation/3-SUMMARY.md`
</output>
