import {
  BEDROCK_HAIKU_INPUT_PER_TOKEN,
  BEDROCK_HAIKU_OUTPUT_PER_TOKEN,
  MINIMAX_TTS_PER_CHAR,
  MINIMAX_MUSIC_PER_GENERATION,
  MINIMAX_VIDEO_PER_GENERATION,
  type UsageEntry,
  type UsageSummary,
} from "@ai-dm/shared-types";

export type { UsageEntry, UsageSummary };

const MAX_ENTRIES = 10_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const entries: UsageEntry[] = [];

/**
 * Lazy eviction: removes entries older than 24h from the front of the array
 * (entries are chronologically ordered), then hard-caps at MAX_ENTRIES.
 * Called at the start of every record* function — no timer needed.
 */
export function evictStaleEntries(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  // Remove entries older than 24h from the front (chronological order)
  // Count-then-splice: O(n) instead of O(n^2) shift-in-a-loop
  let staleCount = 0;
  while (staleCount < entries.length && entries[staleCount].timestamp < cutoff) {
    staleCount++;
  }
  if (staleCount > 0) entries.splice(0, staleCount);
  // Hard cap: if still over MAX_ENTRIES, remove oldest
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

export function recordBedrockUsage(
  conversationId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
) {
  evictStaleEntries();
  const costUsd =
    inputTokens * BEDROCK_HAIKU_INPUT_PER_TOKEN +
    outputTokens * BEDROCK_HAIKU_OUTPUT_PER_TOKEN;
  entries.push({
    timestamp: Date.now(),
    conversationId,
    feature,
    model: "bedrock-haiku",
    inputTokens,
    outputTokens,
    characters: 0,
    costUsd,
  });
  return costUsd;
}

export function recordTtsUsage(
  conversationId: string | null,
  characters: number,
) {
  evictStaleEntries();
  const costUsd = characters * MINIMAX_TTS_PER_CHAR;
  entries.push({
    timestamp: Date.now(),
    conversationId,
    feature: "tts",
    model: "minimax-tts",
    inputTokens: 0,
    outputTokens: 0,
    characters,
    costUsd,
  });
  return costUsd;
}

export function recordMusicUsage() {
  evictStaleEntries();
  entries.push({
    timestamp: Date.now(),
    conversationId: null,
    feature: "music",
    model: "minimax-music-2.5",
    inputTokens: 0,
    outputTokens: 0,
    characters: 0,
    costUsd: MINIMAX_MUSIC_PER_GENERATION,
  });
  return MINIMAX_MUSIC_PER_GENERATION;
}

export function recordVideoUsage() {
  evictStaleEntries();
  entries.push({
    timestamp: Date.now(),
    conversationId: null,
    feature: "video",
    model: "minimax-video-01",
    inputTokens: 0,
    outputTokens: 0,
    characters: 0,
    costUsd: MINIMAX_VIDEO_PER_GENERATION,
  });
  return MINIMAX_VIDEO_PER_GENERATION;
}

function summarize(subset: UsageEntry[]): UsageSummary {
  return subset.reduce<UsageSummary>(
    (acc, e) => {
      acc.totalCostUsd += e.costUsd;
      acc.totalInputTokens += e.inputTokens;
      acc.totalOutputTokens += e.outputTokens;
      acc.totalCharacters += e.characters;
      acc.entries += 1;

      const f = acc.byFeature[e.feature] ?? { costUsd: 0, count: 0 };
      f.costUsd += e.costUsd;
      f.count += 1;
      acc.byFeature[e.feature] = f;

      const m = acc.byModel[e.model] ?? { costUsd: 0, count: 0 };
      m.costUsd += e.costUsd;
      m.count += 1;
      acc.byModel[e.model] = m;

      return acc;
    },
    {
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCharacters: 0,
      byFeature: {},
      byModel: {},
      entries: 0,
    },
  );
}

export function getGlobalUsage(): UsageSummary {
  return summarize(entries);
}

export function getConversationUsage(conversationId: string): UsageSummary {
  return summarize(entries.filter((e) => e.conversationId === conversationId));
}

/**
 * Test internals — exposes module-level state for unit tests only.
 * Never call from production code.
 */
export const _testInternals = {
  entries,
  reset() {
    entries.splice(0, entries.length);
  },
};
