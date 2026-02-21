import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis module before importing conversationStore so isRedisAvailable()
// always returns false and the in-memory path is exercised exclusively.
vi.mock('../../services/redis.js', () => ({
  redisClient: {},
  isRedisAvailable: () => false,
  connectRedis: async () => {},
}));

import { InMemoryConversationStore } from '../../services/conversationStore.js';

describe('InMemoryConversationStore', () => {
  let store: InMemoryConversationStore;

  beforeEach(() => {
    // Fresh instance for each test — no shared state between tests
    store = new InMemoryConversationStore();
  });

  describe('getOrCreate', () => {
    it('creates a new conversation with a UUID when no ID is provided', async () => {
      const convo = await store.getOrCreate();
      expect(convo.id).toBeDefined();
      expect(convo.id.length).toBeGreaterThan(0);
      expect(convo.history).toEqual([]);
    });

    it('returns the same conversation on subsequent calls with the same ID', async () => {
      const first = await store.getOrCreate('test-id-123');
      const second = await store.getOrCreate('test-id-123');
      expect(first.id).toBe(second.id);
    });

    it('sets characterClass on first call when provided', async () => {
      const convo = await store.getOrCreate('cid-1', 'Warrior');
      expect(convo.characterClass).toBe('Warrior');
    });

    it('does not overwrite characterClass on subsequent calls', async () => {
      await store.getOrCreate('cid-2', 'Warrior');
      const convo = await store.getOrCreate('cid-2', 'Mage');
      expect(convo.characterClass).toBe('Warrior');
    });

    it('sets pronouns on first call when provided', async () => {
      const convo = await store.getOrCreate('cid-3', undefined, 'She/Her');
      expect(convo.pronouns).toBe('She/Her');
    });

    it('starts with empty message history', async () => {
      const convo = await store.getOrCreate('cid-4');
      expect(convo.history).toHaveLength(0);
    });
  });

  describe('appendMessage', () => {
    it('adds a message to an existing conversation', async () => {
      await store.getOrCreate('cid-5');
      await store.appendMessage('cid-5', { role: 'user', content: 'Hello!' });
      const history = await store.getWindowedHistory('cid-5');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello!');
    });

    it('preserves message order when multiple messages appended', async () => {
      await store.getOrCreate('cid-6');
      await store.appendMessage('cid-6', { role: 'user', content: 'First' });
      await store.appendMessage('cid-6', { role: 'assistant', content: 'Second' });
      const history = await store.getWindowedHistory('cid-6');
      expect(history[0].content).toBe('First');
      expect(history[1].content).toBe('Second');
    });

    it('throws an error when conversation does not exist', async () => {
      await expect(
        store.appendMessage('nonexistent-id', { role: 'user', content: 'Hi' })
      ).rejects.toThrow('nonexistent-id');
    });
  });

  describe('getWindowedHistory', () => {
    it('returns empty array for a nonexistent conversation ID', async () => {
      const history = await store.getWindowedHistory('no-such-id');
      expect(history).toEqual([]);
    });

    it('returns last N messages when history exceeds the window', async () => {
      await store.getOrCreate('cid-7');
      for (let i = 0; i < 15; i++) {
        await store.appendMessage('cid-7', {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }
      const history = await store.getWindowedHistory('cid-7', 5);
      expect(history).toHaveLength(5);
      expect(history[4].content).toBe('Message 14');
    });

    it('returns all messages when history is within window', async () => {
      await store.getOrCreate('cid-8');
      await store.appendMessage('cid-8', { role: 'user', content: 'A' });
      await store.appendMessage('cid-8', { role: 'assistant', content: 'B' });
      const history = await store.getWindowedHistory('cid-8', 12);
      expect(history).toHaveLength(2);
    });
  });

  describe('getCharacterClass', () => {
    it('returns the stored character class', async () => {
      await store.getOrCreate('cid-9', 'Rogue');
      const cls = await store.getCharacterClass('cid-9');
      expect(cls).toBe('Rogue');
    });

    it('returns undefined for unknown conversation', async () => {
      const cls = await store.getCharacterClass('unknown');
      expect(cls).toBeUndefined();
    });
  });

  describe('getPronouns', () => {
    it('returns the stored pronouns', async () => {
      await store.getOrCreate('cid-10', undefined, 'They/Them');
      const pronouns = await store.getPronouns('cid-10');
      expect(pronouns).toBe('They/Them');
    });

    it('returns undefined when no pronouns were set', async () => {
      await store.getOrCreate('cid-11', 'Mage');
      const pronouns = await store.getPronouns('cid-11');
      expect(pronouns).toBeUndefined();
    });
  });
});
