// Pricing per model (USD)
const BEDROCK_HAIKU_INPUT_PER_TOKEN = 0.25 / 1_000_000;
const BEDROCK_HAIKU_OUTPUT_PER_TOKEN = 1.25 / 1_000_000;
const MINIMAX_TTS_PER_CHAR = 0.004 / 1_000;
const MINIMAX_MUSIC_PER_GENERATION = 0.10;

export interface UsageEntry {
  timestamp: number;
  conversationId: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  characters: number;
  costUsd: number;
}

export interface UsageSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCharacters: number;
  byFeature: Record<string, { costUsd: number; count: number }>;
  byModel: Record<string, { costUsd: number; count: number }>;
  entries: number;
}

const entries: UsageEntry[] = [];

export function recordBedrockUsage(
  conversationId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
) {
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
