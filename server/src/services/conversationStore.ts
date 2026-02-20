export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  history: ChatMessage[];
};

const store = new Map<string, Conversation>();

export function getOrCreate(conversationId?: string): Conversation {
  const id = conversationId ?? crypto.randomUUID();
  if (!store.has(id)) {
    store.set(id, { id, history: [] });
  }
  return store.get(id)!;
}

export function appendMessage(conversationId: string, message: ChatMessage): void {
  const conversation = store.get(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
  conversation.history.push(message);
}

// Keep last N turns to stay within token budget
export function getWindowedHistory(conversationId: string, maxTurns = 12): ChatMessage[] {
  const conversation = store.get(conversationId);
  if (!conversation) return [];
  return conversation.history.slice(-maxTurns);
}
