# Phase 2: Chat UI - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Dark fantasy chat interface with dice roll mechanic. Users can interact with the full chat UI before any backend exists. The frontend sends messages and displays responses — backend integration (Bedrock, streaming) is Phase 4. Voice/TTS is Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Chat visual style
- DM messages left-aligned, player messages right-aligned
- DM narration in IM Fell English (serif), player messages in a clean sans-serif — strong visual contrast between narrator and player
- Text only in bubbles — no timestamps, labels, or metadata
- Full-screen dark fantasy background image (royalty-free tavern/forest scene) with dark overlay (`rgba(0,0,0,0.6)`) for readability

### Dice roll experience
- Roll Dice button sends `"I roll the dice!"` as a regular chat message — no frontend dice generation, no animated d20 reveal
- The AI generates the d20 result and narrates the outcome
- Brief shake/glow animation on the dice button when clicked — small theatrical moment before message sends
- Button always visible, but glows/pulses when the DM's last message suggests a roll is needed
- Dice roll messages styled differently from regular player messages (dice emoji prefix, distinct visual treatment) to stand out as a game action
- Button positioned below the input row (text input + Send on first row, Roll Dice on second row)

### Page layout & composition
- Single screen, no routing
- Centered container (max-width ~700-800px) with dark borders/background on sides — focused, app-like
- Header: "AI Dungeon Master" in Cinzel font + subtle branding ("Powered by AWS Bedrock" or team name) for hackathon judging context
- Desktop-only — optimized for laptop/monitor display, no mobile responsiveness needed
- Simple reset button in header corner — clears chat and returns to Start Adventure state

### Interaction & states
- Initial state: "Start Adventure" button (Phase 7 will hook TTS to this) — no chat input visible until adventure starts
- Loading indicator: "The Dungeon Master is thinking..." in IM Fell English with subtle glow/pulse — stays in theme
- Text input disabled while DM is responding — prevents stacking messages, cleaner for demo
- Chat auto-scrolls to latest message

### Claude's Discretion
- Bubble color treatment (semi-transparent panels, specific color values)
- Background image extent (full page vs chat area only)
- Exact spacing, padding, and typography sizing
- Auto-scroll behavior details
- Error state handling

</decisions>

<specifics>
## Specific Ideas

- Background image: one full-screen `background-image` on the chat area with a dark overlay — "zero complexity, big visual impact"
- Roll Dice implementation is ~5 lines: `const rollDice = () => sendMessage("I roll the dice!")` — the button is just a shortcut for a preset message
- "During the live pitch, clicking a physical dice button is more theatrical than typing. Judges remember it."
- Chat should feel like a messaging app in structure (centered column, input at bottom) but with dark fantasy theming

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-chat-ui*
*Context gathered: 2026-02-20*
