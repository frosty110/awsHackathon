import crypto from "crypto";
import { redisClient, isRedisAvailable } from "./redis.js";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string;
  history: ChatMessage[];
  characterClass?: string;
  pronouns?: string;
};

// In-memory fallback store — used when Redis is unavailable
const store = new Map<string, Conversation>();

// Conversations expire after 7 days idle (refresh on every access)
const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;

function redisKey(conversationId: string): string {
  return `conv:${conversationId}`;
}

async function getFromRedis(conversationId: string): Promise<Conversation | null> {
  const raw = await redisClient.get(redisKey(conversationId));
  if (!raw) return null;
  // Refresh TTL on read
  await redisClient.expire(redisKey(conversationId), CONVERSATION_TTL_SECONDS);
  return JSON.parse(raw) as Conversation;
}

async function saveToRedis(convo: Conversation): Promise<void> {
  await redisClient.set(redisKey(convo.id), JSON.stringify(convo), {
    EX: CONVERSATION_TTL_SECONDS,
  });
}

export async function getOrCreate(
  conversationId?: string,
  characterClass?: string,
  pronouns?: string
): Promise<Conversation> {
  const id = conversationId ?? crypto.randomUUID();

  if (isRedisAvailable()) {
    let convo = await getFromRedis(id);
    if (!convo) {
      convo = { id, history: [], characterClass, pronouns };
    } else {
      if (characterClass && !convo.characterClass) {
        convo.characterClass = characterClass;
      }
      if (pronouns && !convo.pronouns) {
        convo.pronouns = pronouns;
      }
    }
    await saveToRedis(convo);
    return convo;
  }

  // In-memory fallback
  if (!store.has(id)) {
    store.set(id, { id, history: [], characterClass, pronouns });
  }
  const convo = store.get(id)!;
  if (characterClass && !convo.characterClass) {
    convo.characterClass = characterClass;
  }
  if (pronouns && !convo.pronouns) {
    convo.pronouns = pronouns;
  }
  return convo;
}

export async function getCharacterClass(conversationId: string): Promise<string | undefined> {
  if (isRedisAvailable()) {
    const convo = await getFromRedis(conversationId);
    return convo?.characterClass;
  }
  return store.get(conversationId)?.characterClass;
}

export async function getPronouns(conversationId: string): Promise<string | undefined> {
  if (isRedisAvailable()) {
    const convo = await getFromRedis(conversationId);
    return convo?.pronouns;
  }
  return store.get(conversationId)?.pronouns;
}

export async function appendMessage(conversationId: string, message: ChatMessage): Promise<void> {
  if (isRedisAvailable()) {
    const convo = await getFromRedis(conversationId);
    if (!convo) throw new Error(`Conversation ${conversationId} not found`);
    convo.history.push(message);
    await saveToRedis(convo);
    return;
  }

  // In-memory fallback
  const conversation = store.get(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
  conversation.history.push(message);
}

// Keep last N turns to stay within token budget
export async function getWindowedHistory(
  conversationId: string,
  maxTurns = 12
): Promise<ChatMessage[]> {
  if (isRedisAvailable()) {
    const convo = await getFromRedis(conversationId);
    if (!convo) return [];
    return convo.history.slice(-maxTurns);
  }

  // In-memory fallback
  const conversation = store.get(conversationId);
  if (!conversation) return [];
  return conversation.history.slice(-maxTurns);
}
