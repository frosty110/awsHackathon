import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Response } from "express";
import { config, BEDROCK_MODEL_ID } from "./config.js";

const client = new BedrockRuntimeClient({ region: config.AWS_REGION || "us-east-1" });

const MODEL_ID = BEDROCK_MODEL_ID;

export const DM_SYSTEM_PROMPT = `You are an expert Dungeon Master running a fantasy RPG adventure set in a dark medieval world.

Be descriptive, dramatic, and immersive. Keep responses to 2-3 paragraphs.
Always end with an open question or prompt that invites the player to act.
React naturally to what the player does and move the story forward.

When a dice roll result is included in the player's message (e.g. "[Roll: d20 → 17]"):
- Acknowledge the exact number rolled
- Narrate the outcome based on this scale:
  - 1-5: Dramatic failure with consequences
  - 6-10: Failure, but not catastrophic
  - 11-15: Partial success
  - 16-19: Clear success
  - 20: Critical hit — legendary narration, something spectacular happens

Stay in character as the DM at all times.`;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function streamBedrockResponse(
  messages: ChatMessage[],
  res: Response
): Promise<string> {
  const command = new ConverseStreamCommand({
    modelId: MODEL_ID,
    system: [{ text: DM_SYSTEM_PROMPT }],
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const response = await client.send(command);

  let fullText = "";

  for await (const chunk of response.stream!) {
    const text = chunk.contentBlockDelta?.delta?.text;
    if (text) {
      fullText += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();

  return fullText;
}
