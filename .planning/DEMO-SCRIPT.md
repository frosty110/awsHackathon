# AI Dungeon Master — Demo Scenario Script (3 Turns)

## Purpose

This is your exact script for the live demo during science fair judging. Player inputs are fixed — type them word for word. AI responses will vary slightly, but the narrative rails stay the same.

## Before You Start

- [ ] Clear the chat history so it starts fresh
- [ ] Make sure the Datadog dashboard is open on the second screen
- [ ] If MiniMax voice is working: click "Start Adventure" to play the opening monologue
- [ ] If MiniMax is cut: the opening monologue auto-appears as the first DM message

---

## Turn 0 — Auto (Opening Monologue)

**Trigger:** Game loads automatically. No player input needed.

**Expected DM output (or MiniMax voice):**

> The door of the Shattered Crown Tavern swings shut behind you, cutting off the cold night wind. The common room is half-empty — a few hooded travellers nurse their ales, and a fire barely holds back the chill in the stone hearth. Behind the bar, a stocky dwarf with a braided beard and one ear too few wipes a tankard without looking up.
>
> Something feels wrong in this town. You can't place it yet.
>
> What do you do?

**What to say to the judges:** "The game starts with an atmospheric intro. The AI is already using our Neo4j knowledge graph to describe the tavern accurately."

---

## Turn 1 — Player Input

**Type exactly:**

```
I look around the tavern and approach the barkeep.
```

**Expected AI behavior:**
- Describes the tavern interior (pulling from Neo4j lore about The Shattered Crown)
- Introduces Barkeep Gorm — gruff dwarf, missing ear, ex-soldier
- Drops a hint that something is wrong (the ring, the goblins, the town's fear)
- Ends with "What do you do?" or similar

**What to say to the judges while the response loads:** "Watch the Datadog dashboard — you'll see a new trace appear as the request hits Bedrock."

---

## Turn 2 — Player Input

**Type exactly:**

```
I ask the barkeep about the ring.
```

**Expected AI behavior:**
- Gorm reacts — guarded at first, then admits what he knows
- Reveals the quest: the Ring of Ashwick was stolen, goblins are suspected, the northern caves
- Creates urgency (the town is afraid, no one else will go)
- Ends with a hook and "What do you do?"

**What to say to the judges:** "The AI knows about the ring and the quest because Neo4j told it. This is RAG — retrieval-augmented generation with a knowledge graph instead of a vector database."

---

## Turn 3 — Player Input

**Type exactly:**

```
A goblin bursts through the door! I draw my sword and attack!
```

**Expected AI behavior:**
- Sets the combat scene dramatically (goblin description, chaos in the tavern)
- Tells the player to roll for the attack
- At this point: click the dice Roll Dice button

**After clicking the dice, the AI resolves the roll:**

| Roll | Outcome |
|------|---------|
| 1–5 | The goblin dodges, knocks over a table, and bolts into the night. Failure, but entertaining. |
| 6–10 | You swing and miss. The goblin snarls. |
| 11–15 | You land a solid hit. The goblin stumbles. |
| 16–19 | Clean strike — the goblin goes down, the tavern erupts in cheers. |
| 20 | Critical hit — legendary narration, something spectacular happens. |

**What to say to the judges:** "The dice roll is real — the AI generates a d20 result and narrates the outcome accordingly. The format is consistent because we defined it in the system prompt."

---

## Pitch Wrap-Up (30 seconds after Turn 3)

Point to the Datadog dashboard:

> "In those three turns, you can see three Bedrock calls logged here — with latency, token usage, and the full prompt-response trace. The whole pipeline is observable: user input → Neo4j lore retrieval → Bedrock LLM → response. That's the AI Dungeon Master."

---

## Fallback Plan (if something breaks)

| Problem | Fix |
|---------|-----|
| AI goes off-script | Say "interesting choice by the DM" and steer back with your next input |
| Neo4j lore missing | The AI still works — lore is missing but it improvises |
| MiniMax voice broken | Skip it, proceed text-only |
| Bedrock timeout | Refresh, try again — if it persists, open the Bedrock Playground and run the demo there |
| Datadog has no data | Run 2–3 test messages before the judges arrive to pre-populate the dashboard |
