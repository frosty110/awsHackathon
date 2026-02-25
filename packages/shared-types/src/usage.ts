/** A single usage record for cost tracking. */
export interface UsageEntry {
  timestamp: number;
  conversationId: string | null;
  userId?: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  characters: number;
  costUsd: number;
}

/** Aggregated usage summary. */
export interface UsageSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCharacters: number;
  byFeature: Record<string, { costUsd: number; count: number }>;
  byModel: Record<string, { costUsd: number; count: number }>;
  entries: number;
}

/** Pricing constants — shared between client and server. */
export const BEDROCK_HAIKU_INPUT_PER_TOKEN = 0.25 / 1_000_000;
export const BEDROCK_HAIKU_OUTPUT_PER_TOKEN = 1.25 / 1_000_000;
export const MINIMAX_TTS_PER_CHAR = 0.004 / 1_000;
export const MINIMAX_MUSIC_PER_GENERATION = 0.10;
export const MINIMAX_VIDEO_PER_GENERATION = 0.25;
