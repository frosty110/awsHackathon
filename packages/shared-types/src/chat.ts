/** Message in a conversation between player and DM (stored server-side). */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Result from an LLM streaming call. */
export type BedrockResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};
