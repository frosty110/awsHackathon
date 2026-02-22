import crypto from "crypto";
import { redisClient, isRedisAvailable } from "./redis.js";
import type { ChatMessage } from "@ai-dm/shared-types";

export type { ChatMessage };

export type Conversation = {
  id: string;
  history: ChatMessage[];
  characterClass?: string;
  pronouns?: string;
};

// Conversations expire after 7 days idle (refresh on every access)
const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;

function redisKey(conversationId: string): string {
  return `conv:${conversationId}`;
}

// ---------------------------------------------------------------------------
// Interface — callers program against this; swap to RedisConversationStore
// by replacing the singleton below.
// ---------------------------------------------------------------------------
export interface IConversationStore {
  getOrCreate(conversationId?: string, characterClass?: string, pronouns?: string): Promise<Conversation>;
  appendMessage(conversationId: string, message: ChatMessage): Promise<void>;
  getWindowedHistory(conversationId: string, maxTurns?: number): Promise<ChatMessage[]>;
  getCharacterClass(conversationId: string): Promise<string | undefined>;
  getPronouns(conversationId: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// InMemoryConversationStore — exported so tests can instantiate isolated
// instances; use the singleton (conversationStore) for production code.
// ---------------------------------------------------------------------------
export class InMemoryConversationStore implements IConversationStore {
  private store = new Map<string, Conversation>();

  async getOrCreate(
    conversationId?: string,
    characterClass?: string,
    pronouns?: string
  ): Promise<Conversation> {
    const id = conversationId ?? crypto.randomUUID();

    if (isRedisAvailable()) {
      try {
        let convo = await this._getFromRedis(id);
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
        await this._saveToRedis(convo);
        return convo;
      } catch (err) {
        console.error("[conversationStore] Redis error, falling back to in-memory:", err);
      }
    }

    // In-memory fallback
    if (!this.store.has(id)) {
      this.store.set(id, { id, history: [], characterClass, pronouns });
    }
    const convo = this.store.get(id)!;
    if (characterClass && !convo.characterClass) {
      convo.characterClass = characterClass;
    }
    if (pronouns && !convo.pronouns) {
      convo.pronouns = pronouns;
    }
    return convo;
  }

  async getCharacterClass(conversationId: string): Promise<string | undefined> {
    if (isRedisAvailable()) {
      try {
        const convo = await this._getFromRedis(conversationId);
        return convo?.characterClass;
      } catch (err) {
        console.error("[conversationStore] Redis error, falling back to in-memory:", err);
      }
    }
    return this.store.get(conversationId)?.characterClass;
  }

  async getPronouns(conversationId: string): Promise<string | undefined> {
    if (isRedisAvailable()) {
      try {
        const convo = await this._getFromRedis(conversationId);
        return convo?.pronouns;
      } catch (err) {
        console.error("[conversationStore] Redis error, falling back to in-memory:", err);
      }
    }
    return this.store.get(conversationId)?.pronouns;
  }

  async appendMessage(conversationId: string, message: ChatMessage): Promise<void> {
    if (isRedisAvailable()) {
      try {
        const convo = await this._getFromRedis(conversationId);
        if (!convo) throw new Error(`Conversation ${conversationId} not found`);
        convo.history.push(message);
        await this._saveToRedis(convo);
        return;
      } catch (err) {
        console.error("[conversationStore] Redis error, falling back to in-memory:", err);
      }
    }

    // In-memory fallback
    const conversation = this.store.get(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
    conversation.history.push(message);
  }

  // Keep last N turns to stay within token budget
  async getWindowedHistory(
    conversationId: string,
    maxTurns = 12
  ): Promise<ChatMessage[]> {
    if (isRedisAvailable()) {
      try {
        const convo = await this._getFromRedis(conversationId);
        if (!convo) return [];
        return convo.history.slice(-maxTurns);
      } catch (err) {
        console.error("[conversationStore] Redis error, falling back to in-memory:", err);
      }
    }

    // In-memory fallback
    const conversation = this.store.get(conversationId);
    if (!conversation) return [];
    return conversation.history.slice(-maxTurns);
  }

  // ---- private Redis helpers ----

  private async _getFromRedis(conversationId: string): Promise<Conversation | null> {
    const raw = await redisClient.get(redisKey(conversationId));
    if (!raw) return null;
    // Refresh TTL on read
    await redisClient.expire(redisKey(conversationId), CONVERSATION_TTL_SECONDS);
    return JSON.parse(raw) as Conversation;
  }

  private async _saveToRedis(convo: Conversation): Promise<void> {
    await redisClient.set(redisKey(convo.id), JSON.stringify(convo), {
      EX: CONVERSATION_TTL_SECONDS,
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton — production code uses these; swap implementation here for Redis.
// ---------------------------------------------------------------------------
const conversationStore: IConversationStore = new InMemoryConversationStore();
export { conversationStore };

// ---------------------------------------------------------------------------
// Backward-compatible free function exports — no callers need to change.
// ---------------------------------------------------------------------------
export const getOrCreate = conversationStore.getOrCreate.bind(conversationStore);
export const appendMessage = conversationStore.appendMessage.bind(conversationStore);
export const getWindowedHistory = conversationStore.getWindowedHistory.bind(conversationStore);
export const getCharacterClass = conversationStore.getCharacterClass.bind(conversationStore);
export const getPronouns = conversationStore.getPronouns.bind(conversationStore);
