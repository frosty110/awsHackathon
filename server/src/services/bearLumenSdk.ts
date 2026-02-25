import { BearLumen, Provider } from '@bearlumen/node-sdk';
import type { ProviderId } from '@bearlumen/node-sdk';
import { config } from './config.js';
import type { UsageEntry } from '@dnd-adventures/shared-types';

/**
 * Bear Lumen SDK singleton — conditional initialization.
 * null when BEAR_LUMEN_API_KEY is empty (dev, CI, local).
 * IMPORTANT: new BearLumen({ apiKey: '' }) throws — always guard with key check.
 */
const bear = config.BEAR_LUMEN_API_KEY
  ? new BearLumen({
      apiKey: config.BEAR_LUMEN_API_KEY,
      onError: (error) => {
        if (config.NODE_ENV !== 'production') {
          console.warn('[bear-lumen] flush error (events dropped):', String(error));
        }
      },
    })
  : null;

/**
 * Track a usage event via Bear Lumen SDK.
 * Uses bear.track(null, {...}) for manual tracking (not stream wrapping).
 * Never throws, never blocks — SDK handles batching and background flush.
 */
export function trackBearLumen(entry: UsageEntry): void {
  if (!bear) return;
  try {
    bear.track(null, {
      model: entry.model,
      provider: resolveProvider(entry.model),
      feature: entry.feature,
      userId: entry.userId ?? undefined,
      units: buildUnits(entry),
    });
  } catch { /* never throws to caller */ }
}

function resolveProvider(model: string): ProviderId {
  if (model.startsWith('bedrock')) return Provider.BEDROCK;
  if (model.startsWith('minimax')) return Provider.MINIMAX;
  return 'unknown';
}

function buildUnits(entry: UsageEntry): Record<string, number> {
  const units: Record<string, number> = {};
  if (entry.inputTokens > 0) units.inputTokens = entry.inputTokens;
  if (entry.outputTokens > 0) units.outputTokens = entry.outputTokens;
  if (entry.characters > 0) units.characters = entry.characters;
  return units;
}

/**
 * Flush in-memory event queue before process exit.
 * Call in SIGTERM/SIGINT handler BEFORE Neo4j and Redis close.
 */
export async function shutdownBearLumen(): Promise<void> {
  if (!bear) return;
  try {
    await bear.shutdown();
  } catch { /* best-effort flush */ }
}
