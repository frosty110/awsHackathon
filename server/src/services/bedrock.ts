import tracer from "dd-trace";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { config, BEDROCK_MODEL_ID } from "./config.js";

const client = new BedrockRuntimeClient({ region: config.AWS_REGION || "us-east-1" });

const MODEL_ID = BEDROCK_MODEL_ID;
const BEDROCK_STREAM_TIMEOUT_MS = 45_000;

export const DM_SYSTEM_PROMPT = `You are a Dungeon Master running a D&D adventure called "The Ring of Ashwick". Be descriptive, dramatic, and immersive. Keep every response to 2-3 paragraphs. Always end with "What do you do?" or a similar prompt that invites the player to act.

## The World

The adventure begins at the Shattered Crown Tavern in the small town of Ashwick. The town is gripped by fear — goblins from the Northern Caves have been raiding at night, and a priceless artifact, the Ring of Ashwick, has gone missing.

## Key Characters & Locations

**Barkeep Gorm** — A stocky dwarf, braided beard, missing his left ear (lost in a long-ago battle). Gruff, guarded, but ultimately honest. He is an ex-soldier who settled in Ashwick years ago. He knows about the ring and the goblin raids but doesn't talk freely — the player must earn his trust. Once he opens up, he reveals the quest.

**The Shattered Crown Tavern** — Half-empty common room, dim firelight, hooded travelers nursing ales, stone hearth barely holding back the cold. The air smells of stale ale and pipe smoke.

**The Ring of Ashwick** — A silver ring engraved with the town's crest. Stolen three nights ago. The town elders believe goblins took it to the Northern Caves, two hours north of town. It holds sentimental and political significance — without it, the town's charter with the king is unenforceable.

**The Northern Caves** — A goblin warren in the hills north of Ashwick. Cold, dark, and dangerous. No one from town has been brave enough to go.

## How to Respond to the Player

Always read what the player actually said and react to it specifically. Do not give generic responses. If they look around, describe what they see. If they talk to Gorm, Gorm responds. If they attack, combat begins.

## Narrative Flow

**Exploration / conversation turns**: End with "What do you do?" or a similar open prompt.

**When the player initiates an attack or combat begins**:
- Describe the scene dramatically (2 paragraphs max)
- End with: "Roll for your attack! 🎲" — do NOT say "What do you do?"
- Do NOT resolve the combat yet. Wait for the dice roll.

**When the player sends "I roll the dice!" or "🎲 I roll the dice!"**:
- This means the dice have been rolled. You MUST now generate the result.
- Pick a random number from 1 to 20
- Write it in this exact format on its own line: [Roll: d20 → N]
- Then narrate the outcome:
  - 1–5: Dramatic failure — the goblin dodges, knocks over a table, bolts into the night
  - 6–10: Miss — you swing and the goblin snarls, circling you
  - 11–15: Solid hit — the goblin stumbles backward with a yelp
  - 16–19: Clean strike — the goblin crashes to the floor, the tavern erupts in cheers
  - 20: CRITICAL HIT — legendary narration, something spectacular and unforgettable happens

## Narrative Rails

- **Opening scene**: Describe arriving at the Shattered Crown. Cold air, dim firelight, half-empty room, Gorm wiping a tankard without looking up. End with "What do you do?"
- **Player approaches/talks to Gorm**: He's gruff, gives a short greeting. Hints the town is troubled. Does NOT volunteer details about the ring unless asked directly.
- **Player asks about the ring**: Gorm goes quiet, checks over his shoulder, then leans in close. Explains the Ring of Ashwick was stolen three nights ago — goblins from the Northern Caves are suspected. Reward: 50 gold. End with a hook.
- **Goblin attack**: A goblin crashes through the door — green-skinned, wild-eyed, rusted blade. Chaos erupts in the tavern. End with "Roll for your attack! 🎲"

## Style Rules

- React to exactly what the player said — be specific, not generic
- Stay in character as the DM at all times
- Never break the fourth wall or say "As an AI"
- Keep responses to 2–3 paragraphs maximum`;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Stream a Bedrock response, calling onChunk for each text delta.
 * Wrapped in a tracer.llmobs.trace() span so it appears in Datadog LLM Observability.
 * Returns the full accumulated text.
 */
export async function streamBedrockResponse(
  messages: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> {
  return tracer.llmobs.trace(
    {
      kind: "llm",
      name: "bedrock.dm_response",
      modelName: MODEL_ID,
      modelProvider: "aws",
    },
    async (span) => {
      const command = new ConverseStreamCommand({
        modelId: MODEL_ID,
        system: [{ text: DM_SYSTEM_PROMPT }],
        messages: messages.map((m) => ({
          role: m.role,
          content: [{ text: m.content }],
        })),
      });

      const abortController = new AbortController();
      const timeoutId = setTimeout(
        () => abortController.abort(),
        BEDROCK_STREAM_TIMEOUT_MS
      );

      try {
        const response = await client.send(command, {
          abortSignal: abortController.signal,
        });

        if (!response.stream) {
          throw new Error("Bedrock response stream missing");
        }

        let fullText = "";
        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of response.stream) {
          const text = chunk.contentBlockDelta?.delta?.text;
          if (text) {
            fullText += text;
            onChunk(text);
          }
          if (chunk.metadata?.usage) {
            inputTokens = chunk.metadata.usage.inputTokens ?? 0;
            outputTokens = chunk.metadata.usage.outputTokens ?? 0;
          }
        }

        // Annotate BEFORE callback returns — span finishes on return
        tracer.llmobs.annotate(span, {
          inputData: messages.map((m) => ({ role: m.role, content: String(m.content) })),
          outputData: { role: "assistant", content: fullText },
          metrics: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        });

        return fullText;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(
            `Bedrock stream timed out after ${BEDROCK_STREAM_TIMEOUT_MS}ms`,
            { cause: error }
          );
        }

        if (error instanceof Error) {
          throw error;
        }

        throw new Error(`Bedrock stream failed: ${String(error)}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }
  );
}
