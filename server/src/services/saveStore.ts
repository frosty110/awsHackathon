import { redisClient, isRedisAvailable } from "./redis.js";
import { logEvent } from "./logger.js";

export interface SaveMeta {
  name: string;
  characterClass: string;
  pronouns: string;
  turnCount: number;
  savedAt: number;      // Unix ms
  lastPlayedAt: number; // Unix ms
  mode: 'single' | 'multi';
}

export interface SaveRecord extends SaveMeta {
  conversationId: string;
}

const MAX_SAVES = 10;
const SAVE_HASH_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// In-memory fallback: keyed by `${userId}:${conversationId}`
const inMemorySaves = new Map<string, SaveMeta>();

// In-memory index: keyed by userId, value is array of { conversationId, lastPlayedAt } sorted by lastPlayedAt desc
const inMemoryIndex = new Map<string, Array<{ conversationId: string; lastPlayedAt: number }>>();

function savesIndexKey(userId: string): string {
  return `saves:${userId}`;
}

function saveHashKey(userId: string, conversationId: string): string {
  return `save:${userId}:${conversationId}`;
}

/**
 * Upsert a save slot for a user.
 * - HSET the save hash fields.
 * - EXPIRE the hash with a 90-day TTL.
 * - ZADD to sorted set index with score = lastPlayedAt.
 * - Trim: if over MAX_SAVES, delete oldest entries.
 */
export async function upsertSave(
  userId: string,
  conversationId: string,
  meta: SaveMeta
): Promise<void> {
  if (isRedisAvailable()) {
    try {
      const hashKey = saveHashKey(userId, conversationId);
      const indexKey = savesIndexKey(userId);

      await redisClient.hSet(hashKey, {
        name: meta.name,
        characterClass: meta.characterClass,
        pronouns: meta.pronouns,
        turnCount: String(meta.turnCount),
        savedAt: String(meta.savedAt),
        lastPlayedAt: String(meta.lastPlayedAt),
        mode: meta.mode,
      });

      await redisClient.expire(hashKey, SAVE_HASH_TTL_SECONDS);

      await redisClient.zAdd(indexKey, {
        score: meta.lastPlayedAt,
        value: conversationId,
      });

      // Trim: if over MAX_SAVES, remove oldest entries
      const count = await redisClient.zCard(indexKey);
      if (count > MAX_SAVES) {
        const overflow = count - MAX_SAVES;
        const oldest = await redisClient.zRange(indexKey, 0, overflow - 1);
        for (const oldConvId of oldest) {
          await redisClient.del(saveHashKey(userId, oldConvId));
        }
        await redisClient.zRemRangeByRank(indexKey, 0, overflow - 1);
      }

      return;
    } catch (err) {
      logEvent("warn", "saveStore.upsert_redis_error", { userId, conversationId }, err);
    }
  }

  // In-memory fallback
  const key = `${userId}:${conversationId}`;
  inMemorySaves.set(key, meta);

  const index = inMemoryIndex.get(userId) ?? [];
  const existing = index.findIndex(e => e.conversationId === conversationId);
  if (existing >= 0) {
    index[existing].lastPlayedAt = meta.lastPlayedAt;
  } else {
    index.push({ conversationId, lastPlayedAt: meta.lastPlayedAt });
  }

  // Sort descending by lastPlayedAt, trim to MAX_SAVES
  index.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  const trimmed = index.splice(MAX_SAVES);
  for (const old of trimmed) {
    inMemorySaves.delete(`${userId}:${old.conversationId}`);
  }

  inMemoryIndex.set(userId, index);
}

/**
 * List all saves for a user, newest first (up to MAX_SAVES).
 */
export async function listSaves(userId: string): Promise<SaveRecord[]> {
  if (isRedisAvailable()) {
    try {
      const indexKey = savesIndexKey(userId);
      // REV:true — newest first (highest score first)
      const conversationIds = await redisClient.zRange(indexKey, 0, -1, { REV: true });

      const saves: SaveRecord[] = [];
      for (const conversationId of conversationIds) {
        const raw = await redisClient.hGetAll(saveHashKey(userId, conversationId));
        if (!raw || !raw.name) {
          // Orphaned index entry — skip
          continue;
        }
        saves.push({
          conversationId,
          name: raw.name,
          characterClass: raw.characterClass ?? '',
          pronouns: raw.pronouns ?? '',
          turnCount: parseInt(raw.turnCount ?? '0', 10),
          savedAt: parseInt(raw.savedAt ?? '0', 10),
          lastPlayedAt: parseInt(raw.lastPlayedAt ?? '0', 10),
          mode: (raw.mode === 'multi' ? 'multi' : 'single') as 'single' | 'multi',
        });
      }

      return saves;
    } catch (err) {
      logEvent("warn", "saveStore.list_redis_error", { userId }, err);
    }
  }

  // In-memory fallback
  const index = inMemoryIndex.get(userId) ?? [];
  const saves: SaveRecord[] = [];
  for (const entry of index) {
    const meta = inMemorySaves.get(`${userId}:${entry.conversationId}`);
    if (meta) {
      saves.push({ conversationId: entry.conversationId, ...meta });
    }
  }
  return saves;
}

/**
 * Delete a save slot.
 * Does NOT delete the conversation itself.
 */
export async function deleteSave(userId: string, conversationId: string): Promise<void> {
  if (isRedisAvailable()) {
    try {
      await redisClient.del(saveHashKey(userId, conversationId));
      await redisClient.zRem(savesIndexKey(userId), conversationId);
      return;
    } catch (err) {
      logEvent("warn", "saveStore.delete_redis_error", { userId, conversationId }, err);
    }
  }

  // In-memory fallback
  inMemorySaves.delete(`${userId}:${conversationId}`);
  const index = inMemoryIndex.get(userId);
  if (index) {
    inMemoryIndex.set(userId, index.filter(e => e.conversationId !== conversationId));
  }
}

/**
 * Rename a save slot.
 * Returns false if the save does not exist (caller should 404).
 */
export async function renameSave(
  userId: string,
  conversationId: string,
  newName: string
): Promise<boolean> {
  if (isRedisAvailable()) {
    try {
      const hashKey = saveHashKey(userId, conversationId);
      const exists = await redisClient.exists(hashKey);
      if (!exists) return false;
      await redisClient.hSet(hashKey, { name: newName });
      return true;
    } catch (err) {
      logEvent("warn", "saveStore.rename_redis_error", { userId, conversationId }, err);
    }
  }

  // In-memory fallback
  const key = `${userId}:${conversationId}`;
  const meta = inMemorySaves.get(key);
  if (!meta) return false;
  inMemorySaves.set(key, { ...meta, name: newName });
  return true;
}

/**
 * Find a save by conversationId for a specific user.
 * Used by chat.ts auto-update hook.
 */
export async function findByConversationId(
  userId: string,
  conversationId: string
): Promise<SaveMeta | null> {
  if (isRedisAvailable()) {
    try {
      const raw = await redisClient.hGetAll(saveHashKey(userId, conversationId));
      if (!raw || !raw.name) return null;
      return {
        name: raw.name,
        characterClass: raw.characterClass ?? '',
        pronouns: raw.pronouns ?? '',
        turnCount: parseInt(raw.turnCount ?? '0', 10),
        savedAt: parseInt(raw.savedAt ?? '0', 10),
        lastPlayedAt: parseInt(raw.lastPlayedAt ?? '0', 10),
        mode: (raw.mode === 'multi' ? 'multi' : 'single') as 'single' | 'multi',
      };
    } catch (err) {
      logEvent("warn", "saveStore.find_redis_error", { userId, conversationId }, err);
    }
  }

  // In-memory fallback
  return inMemorySaves.get(`${userId}:${conversationId}`) ?? null;
}
