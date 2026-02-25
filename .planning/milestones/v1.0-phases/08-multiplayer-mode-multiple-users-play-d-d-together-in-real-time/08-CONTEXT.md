# Phase 8: Multiplayer Mode - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Multiple users play D&D together in real-time within a shared session. Players join via room codes, submit actions in batched rounds with a timer, and the AI DM weaves all player actions into a single narrative response. Includes a private player-to-player chat the DM doesn't see. Single-player mode (Phases 1-7) remains intact; this adds multiplayer as a new game mode.

</domain>

<decisions>
## Implementation Decisions

### Session Joining
- Room codes: host creates a game, gets a short code, others enter it to join
- 2-4 players per session
- Host has no special powers — all players are equal once joined
- Players can join mid-game (standard D&D — DM narrates their arrival, e.g., "a stranger enters the tavern")
- Disconnected player's character stays in the story; DM treats them as silent; they can reconnect and resume
- Lobby screen before game starts: players see who's joined, names, and character classes

### Turn Structure
- Batch submission model: all players submit actions, then the DM creates one narrative from all actions
- DM has full creative authority — actions may succeed, fail, cancel each other out, or be ignored for story purposes
- 60-second timer per round for action submission
- If a player doesn't submit before timer expires, the DM auto-generates a reasonable default action (e.g., "follows the group")
- When dice rolls are called for, all involved players roll simultaneously; DM narrates all outcomes together
- DM response streams token-by-token to all players simultaneously

### Shared Visibility
- Side panel for private player-to-player chat alongside the main DM chat — the DM AI does not see this chat
- All dice rolls visible to all players in real-time
- Player chat supports text messages plus quick emoji reactions (thumbs up, skull, fire, etc.) for fast coordination
- Player status bar shows each player's name, connection status, and whether they've submitted their action this round

### Player Identity
- Players enter a display name and choose a character class when joining
- 6 character classes: Warrior, Mage, Rogue, Cleric, Ranger, Bard
- Class is narration flavor only — no mechanical dice bonuses; the DM weaves class into the story naturally
- Class-based colors for chat messages (e.g., Warrior=red, Mage=blue) — reinforces identity and makes messages scannable
- Duplicate classes allowed — multiple players can pick the same class

### Claude's Discretion
- Game start trigger (lobby → adventure transition timing)
- Room code display placement in the dark fantasy UI
- Whether player actions are hidden or visible before DM responds (surprise element vs transparency)
- Brief pause duration after DM narration before next round timer starts
- Specific emoji reactions available in player chat
- Auto-action phrasing style for timed-out players

</decisions>

<specifics>
## Specific Ideas

- The DM should create a "powerful captivating story" from all player actions — not just mechanically resolve each action sequentially
- DM has authorial control: sometimes actions cancel each other out, sometimes they don't happen, the DM chooses what serves the story
- Player chat is explicitly invisible to the DM — players should be able to strategize and coordinate without the AI knowing

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-multiplayer-mode*
*Context gathered: 2026-02-20*
