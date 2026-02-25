import { randomUUID } from 'node:crypto';
import type { UsageEntry } from '@dnd-adventures/shared-types';
import { config } from './config.js';

const BEAR_LUMEN_ENABLED = config.BEAR_LUMEN_API_KEY.length > 0;
const BEAR_LUMEN_ENDPOINT = 'https://api.bearlumen.com/usage/events/batch';

/**
 * Fire-and-forget: POST a usage event to Bear Lumen's REST API.
 * Never throws, never blocks, never delays game responses.
 * Silently no-ops when BEAR_LUMEN_API_KEY is not configured.
 */
export function pushToBearLumen(entry: UsageEntry): void {
  if (!BEAR_LUMEN_ENABLED) return;
  try {
    void fetch(BEAR_LUMEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.BEAR_LUMEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{
          sdk_event_id: randomUUID(),
          model: entry.model,
          input_tokens: entry.inputTokens,
          output_tokens: entry.outputTokens,
          event_invoked_at: new Date(entry.timestamp).toISOString(),
          user_id: entry.userId ?? undefined,
          metadata: {
            provider: resolveProvider(entry.model),
            feature: entry.feature,
            ...(entry.characters > 0 ? { units: { characters: entry.characters } } : {}),
          },
        }],
      }),
    }).catch(() => {});
  } catch { /* never throws */ }
}

function resolveProvider(model: string): string {
  if (model.startsWith('bedrock')) return 'bedrock';
  if (model.startsWith('minimax')) return 'minimax';
  return 'unknown';
}
