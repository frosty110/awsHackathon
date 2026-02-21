export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  history: ChatMessage[];
  characterClass?: string;
};

const store = new Map<string, Conversation>();

export function getOrCreate(conversationId?: string, characterClass?: string): Conversation {
  const id = conversationId ?? crypto.randomUUID();
  if (!store.has(id)) {
    store.set(id, { id, history: [], characterClass });
  }
  const convo = store.get(id)!;
  if (characterClass && !convo.characterClass) {
    convo.characterClass = characterClass;
  }
  return convo;
}

export function getCharacterClass(conversationId: string): string | undefined {
  return store.get(conversationId)?.characterClass;
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
