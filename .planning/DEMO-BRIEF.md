# AI Dungeon Master — Fullstack Brief

## Concept Overview

A browser-based D&D chat interface. The player types messages to an AI Dungeon Master powered by AWS Bedrock (Claude). The backend is Node.js/Express. Every Bedrock call is traced in Datadog.

**Data flow:**

```
Player types → React UI → POST /api/chat → AWS Bedrock (Claude) → response rendered in chat
                                        ↕
                                   Neo4j (lore)    ← injected into system prompt
                                        ↕
                                   Datadog         ← traces every call
```

**Hackathon:** AWS x Anthropic x Datadog GenAI Hackathon, AWS Builder Loft, SF
**Team:** Aristarkh (Product/Prompt), Brandon (Backend/Bedrock), Blaise (Fullstack/UI)

---

## UI Layout

Single screen. No routing.

```
┌─────────────────────────────────────┐
│   ⚔️ AI Dungeon Master              │  ← header, Cinzel font
│─────────────────────────────────────│
│                                     │
│  [DM message bubble]                │  ← dark background image
│                                     │     (tavern/forest, royalty-free)
│       [Player message bubble]       │     with rgba(0,0,0,0.6) overlay
│                                     │
│  [DM message bubble]                │
│                                     │
│─────────────────────────────────────│
│  [_________________________] [Send] │  ← text input + Send button
│  [🎲 Roll Dice]                     │  ← dice button (see below)
└─────────────────────────────────────┘
```

**Background image:** One full-screen `background-image` on the chat area with a dark overlay so text stays readable. Any royalty-free dark fantasy tavern image works. Zero complexity, big visual impact.

**Theme:** Dark fantasy — parchment gold `#e0d0b0`, blood red accent, Cinzel/IM Fell English fonts.

---

## Roll Dice Button

**Keep the button. Don't replace it with typed text.**

Reasons:

1. **Zero extra backend complexity.** The button sends `"I roll the dice!"` as a regular chat message — identical to typing. No special API, no frontend RNG. The AI generates the d20 result and narrates the outcome.

2. **It's a demo moment.** Clicking a physical dice button during the live pitch is more theatrical than typing. Judges remember it.

3. **Implementation is ~5 lines:**

```tsx
const rollDice = () => sendMessage("I roll the dice!");
<button onClick={rollDice}>🎲 Roll Dice</button>
```

---

## Message Format

Frontend sends to `/api/chat`:

```json
{
  "messages": [
    { "role": "user", "content": "I look around the tavern." },
    { "role": "assistant", "content": "The tavern is dimly lit..." },
    { "role": "user", "content": "I roll the dice!" }
  ]
}
```

Frontend receives (SSE stream):

```json
{ "response": "You reach for your sword... [Roll: d20 → 17] A great success!" }
```

Always send full message history — this is how the LLM maintains context between turns.

---

## Architecture

```
client/                    server/
├── src/                   ├── src/
│   ├── App.tsx            │   ├── app.ts          (Express setup)
│   ├── hooks/             │   ├── index.ts        (entry point)
│   │   ├── useSSEChat.ts  │   ├── routes/
│   │   └── useChatScroll  │   │   ├── chat.ts     (POST /api/chat → Bedrock SSE)
│   ├── types/             │   │   └── narrate.ts   (POST /narrate → MiniMax TTS)
│   └── index.css          │   └── services/
│                          │       ├── bedrock.ts   (BedrockRuntimeClient)
│                          │       ├── rag.ts       (Neo4j entity extraction)
│                          │       └── tts.ts       (MiniMax T2A v2)
```

**Key architectural contracts:**

- Server is source of truth for conversation state
- Client sends `{ conversationId?, message }` (and optional dice data)
- Chat transport: `fetch` POST + `ReadableStream` SSE parsing on client
- `/narrate` returns `audio/wav` from MiniMax PCM response
- RAG: extract entities from latest user turn only → query Neo4j → inject lore into prompt
- Datadog: pre-init bootstrap via `NODE_OPTIONS='--import dd-trace/initialize.mjs'`

---

## Prize Targets

| Priority | Prize | Requirement |
|----------|-------|-------------|
| MUST | Main pool ($15K AWS credits + cash) | Bedrock + Datadog working end-to-end |
| MUST | Datadog Observability Award (Meta Glasses) | Rich LLM observability dashboard |
| HIGH | Neo4j Award (Bose headphones + credits) | Graph-powered RAG lore retrieval |
| HIGH | MiniMax cash prize ($12K pool) | Voice/audio for the DM |

**Emergency cut order (bottom first):** CSS polish → MiniMax voice → Neo4j RAG → Datadog → Bedrock chat (never cut)

---

## Build Phases

| # | Phase | Status | Owner Focus |
|---|-------|--------|-------------|
| 1 | Scaffold (monorepo, env validation, dev tooling) | Done | Blaise |
| 2 | Chat UI (dark fantasy theme, dice roll, mock hook) | Next | Blaise |
| 3 | Lore Graph Seed (Neo4j AuraDB, demo lore data) | Next | Blaise |
| 4 | Bedrock Chat Core (Claude SSE streaming, system prompt) | Hackathon day | Brandon |
| 5 | RAG Pipeline (entity extraction, lore injection) | Hackathon day | Brandon |
| 6 | Datadog Observability (traces, spans, dashboard) | Hackathon day | Brandon |
| 7 | Voice + Demo Polish (MiniMax TTS, rehearsal) | Hackathon day | All |

Phases 2 and 3 can run in parallel (both depend only on Phase 1).

---

---

# Demo Scenario Script (3 Turns)

## Purpose

Exact script for the live demo during science fair judging. Player inputs are fixed — type them word for word. AI responses will vary slightly but narrative rails stay the same.

## Before You Start

- [ ] Clear the chat history so it starts fresh
- [ ] Make sure the Datadog dashboard is open on the second screen
- [ ] If MiniMax voice is working: click "Start Adventure" to play the opening monologue
- [ ] If MiniMax is cut: the opening monologue auto-appears as the first DM message

---

### Turn 0 — Auto (Opening Monologue)

**Trigger:** Game loads automatically. No player input needed.

**Expected DM output (or MiniMax voice):**

> The door of the Shattered Crown Tavern swings shut behind you, cutting off the cold night wind. The common room is half-empty — a few hooded travellers nurse their ales, and a fire barely holds back the chill in the stone hearth. Behind the bar, a stocky dwarf with a braided beard and one ear too few wipes a tankard without looking up.
>
> Something feels wrong in this town. You can't place it yet.
>
> What do you do?

**Say to judges:** "The game starts with an atmospheric intro. The AI is already using our Neo4j knowledge graph to describe the tavern accurately."

---

### Turn 1 — Player Input

**Type exactly:**

> I look around the tavern and approach the barkeep.

**Expected AI behavior:**
- Describes the tavern interior (pulling from Neo4j lore about The Shattered Crown)
- Introduces Barkeep Gorm — gruff dwarf, missing ear, ex-soldier
- Drops a hint that something is wrong (the ring, the goblins, the town's fear)
- Ends with "What do you do?" or similar

**Say to judges while response loads:** "Watch the Datadog dashboard — you'll see a new trace appear as the request hits Bedrock."

---

### Turn 2 — Player Input

**Type exactly:**

> I ask the barkeep about the ring.

**Expected AI behavior:**
- Gorm reacts — guarded at first, then admits what he knows
- Reveals the quest: the Ring of Ashwick was stolen, goblins are suspected, the northern caves
- Creates urgency (the town is afraid, no one else will go)
- Ends with a hook and "What do you do?"

**Say to judges:** "The AI knows about the ring and the quest because Neo4j told it. This is RAG — retrieval-augmented generation with a knowledge graph instead of a vector database."

---

### Turn 3 — Player Input

**Type exactly:**

> A goblin bursts through the door! I draw my sword and attack!

**Expected AI behavior:**
- Sets the combat scene dramatically (goblin description, chaos in the tavern)
- Tells the player to roll for the attack

**At this point: click the 🎲 Roll Dice button**

After clicking, the AI resolves the roll:

| Roll | Outcome |
|------|---------|
| 1–5 | The goblin dodges, knocks over a table, and bolts into the night. Failure, but entertaining. |
| 6–10 | You swing and miss. The goblin snarls. |
| 11–15 | You land a solid hit. The goblin stumbles. |
| 16–19 | Clean strike — the goblin goes down, the tavern erupts in cheers. |
| 20 | Critical hit — legendary narration, something spectacular happens. |

**Say to judges:** "The dice roll is real — the AI generates a d20 result and narrates the outcome accordingly. The format is consistent because we defined it in the system prompt."

---

### Pitch Wrap-Up (30 seconds after Turn 3)

Point to the Datadog dashboard:

> "In those three turns, you can see three Bedrock calls logged here — with latency, token usage, and the full prompt-response trace. The whole pipeline is observable: user input → Neo4j lore retrieval → Bedrock LLM → response. That's the AI Dungeon Master."

---

## Fallback Plan

| Problem | Fix |
|---------|-----|
| AI goes off-script | Say "interesting choice by the DM" and steer back with your next input |
| Neo4j lore missing | The AI still works — lore is missing but it improvises |
| MiniMax voice broken | Skip it, proceed text-only |
| Bedrock timeout | Refresh, try again — if it persists, open the Bedrock Playground and run the demo there |
| Datadog has no data | Run 2–3 test messages before the judges arrive to pre-populate the dashboard |
