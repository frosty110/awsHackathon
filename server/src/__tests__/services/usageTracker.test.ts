import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordBedrockUsage,
  recordTtsUsage,
  recordMusicUsage,
  getGlobalUsage,
  getConversationUsage,
  evictStaleEntries,
  _testInternals,
} from '../../services/usageTracker.js';

// Reset module-level entries before each test for isolation
beforeEach(() => {
  _testInternals.reset();
});

describe('recordBedrockUsage', () => {
  it('adds an entry and returns the cost in USD', () => {
    const cost = recordBedrockUsage('conv-1', 'chat', 1000, 500);
    expect(typeof cost).toBe('number');
    expect(cost).toBeGreaterThan(0);
    expect(_testInternals.entries).toHaveLength(1);
    expect(_testInternals.entries[0].feature).toBe('chat');
    expect(_testInternals.entries[0].model).toBe('bedrock-haiku');
  });

  it('stores input and output token counts', () => {
    recordBedrockUsage('conv-1', 'chat', 200, 100);
    const entry = _testInternals.entries[0];
    expect(entry.inputTokens).toBe(200);
    expect(entry.outputTokens).toBe(100);
  });

  it('stores the conversationId', () => {
    recordBedrockUsage('my-conv', 'chat', 10, 10);
    expect(_testInternals.entries[0].conversationId).toBe('my-conv');
  });

  it('allows null conversationId for system calls', () => {
    recordBedrockUsage(null, 'system', 50, 50);
    expect(_testInternals.entries[0].conversationId).toBeNull();
  });
});

describe('recordTtsUsage', () => {
  it('adds an entry and returns the cost in USD', () => {
    const cost = recordTtsUsage('conv-2', 500);
    expect(typeof cost).toBe('number');
    expect(cost).toBeGreaterThan(0);
    expect(_testInternals.entries).toHaveLength(1);
    expect(_testInternals.entries[0].model).toBe('minimax-tts');
  });

  it('stores the character count', () => {
    recordTtsUsage('conv-2', 300);
    expect(_testInternals.entries[0].characters).toBe(300);
  });
});

describe('getGlobalUsage', () => {
  it('returns zeroed summary when no entries', () => {
    const summary = getGlobalUsage();
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.entries).toBe(0);
  });

  it('accumulates cost across multiple entries', () => {
    recordBedrockUsage('c1', 'chat', 100, 100);
    recordTtsUsage('c2', 200);
    const summary = getGlobalUsage();
    expect(summary.entries).toBe(2);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });

  it('breaks down usage by feature', () => {
    recordBedrockUsage('c1', 'chat', 100, 100);
    recordTtsUsage('c1', 200);
    const summary = getGlobalUsage();
    expect(summary.byFeature['chat']).toBeDefined();
    expect(summary.byFeature['tts']).toBeDefined();
    expect(summary.byFeature['chat'].count).toBe(1);
    expect(summary.byFeature['tts'].count).toBe(1);
  });

  it('breaks down usage by model', () => {
    recordBedrockUsage('c1', 'chat', 100, 100);
    recordMusicUsage();
    const summary = getGlobalUsage();
    expect(summary.byModel['bedrock-haiku']).toBeDefined();
    expect(summary.byModel['minimax-music-2.5']).toBeDefined();
  });
});

describe('getConversationUsage', () => {
  it('filters entries to only the specified conversationId', () => {
    recordBedrockUsage('conv-A', 'chat', 100, 100);
    recordBedrockUsage('conv-B', 'chat', 200, 200);
    const summary = getConversationUsage('conv-A');
    expect(summary.entries).toBe(1);
    expect(summary.byFeature['chat'].count).toBe(1);
  });
});

describe('evictStaleEntries', () => {
  it('removes entries older than 24 hours', () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oldTimestamp = Date.now() - oneDayMs - 1000; // 24h + 1s ago

    // Manually insert stale entries bypassing record functions
    _testInternals.entries.push(
      {
        timestamp: oldTimestamp,
        conversationId: 'old',
        feature: 'chat',
        model: 'bedrock-haiku',
        inputTokens: 10,
        outputTokens: 10,
        characters: 0,
        costUsd: 0.001,
      },
      {
        timestamp: oldTimestamp,
        conversationId: 'old2',
        feature: 'tts',
        model: 'minimax-tts',
        inputTokens: 0,
        outputTokens: 0,
        characters: 100,
        costUsd: 0.0001,
      }
    );

    expect(_testInternals.entries).toHaveLength(2);
    evictStaleEntries();
    expect(_testInternals.entries).toHaveLength(0);
  });

  it('preserves recent entries during eviction', () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oldTimestamp = Date.now() - oneDayMs - 1000;

    _testInternals.entries.push({
      timestamp: oldTimestamp,
      conversationId: 'old',
      feature: 'chat',
      model: 'bedrock-haiku',
      inputTokens: 10,
      outputTokens: 10,
      characters: 0,
      costUsd: 0.001,
    });

    // Recent entry added via record function
    recordBedrockUsage('new', 'chat', 50, 50);

    // Manual eviction
    evictStaleEntries();

    // Only the recent entry should remain
    expect(_testInternals.entries).toHaveLength(1);
    expect(_testInternals.entries[0].conversationId).toBe('new');
  });

  it('is called automatically on each record invocation', () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oldTimestamp = Date.now() - oneDayMs - 1000;

    _testInternals.entries.push({
      timestamp: oldTimestamp,
      conversationId: 'stale',
      feature: 'chat',
      model: 'bedrock-haiku',
      inputTokens: 0,
      outputTokens: 0,
      characters: 0,
      costUsd: 0,
    });

    // Recording a new entry should trigger eviction of stale entries
    recordTtsUsage('fresh', 100);

    // Stale entry should be gone; only the fresh one remains
    expect(_testInternals.entries).toHaveLength(1);
    expect(_testInternals.entries[0].conversationId).toBe('fresh');
  });
});
