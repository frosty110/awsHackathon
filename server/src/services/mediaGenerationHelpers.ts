// Shared generation state machine for server-side media services (music, video).
// Extracts identical entry types, cache helpers, and start-guard logic.

export interface GenerationEntry {
  generating: boolean;
  error: string | null;
  lastFailedAt: number | null;
  retryCount: number;
  generationStartedAt: number | null;
}

export function createEntry(): GenerationEntry {
  return { generating: false, error: null, lastFailedAt: null, retryCount: 0, generationStartedAt: null };
}

export function getOrCreate<K>(cache: Map<K, GenerationEntry>, key: K): GenerationEntry {
  let entry = cache.get(key);
  if (!entry) {
    entry = createEntry();
    cache.set(key, entry);
  }
  return entry;
}

export interface StartGuardConfig {
  maxRetries: number;
  cooldownMs: number;
}

/**
 * Check if generation should start and update entry state accordingly.
 * Returns true if generation should proceed, false if it should be skipped.
 * When returning true for a retry, `entry.retryCount` is already incremented
 * and `entry.error` is cleared. Caller can check `entry.retryCount > 0` to detect retries.
 */
export function tryStartGeneration(
  entry: GenerationEntry,
  hasBuffer: boolean,
  config: StartGuardConfig,
): boolean {
  if (entry.generating || hasBuffer) return false;
  if (entry.retryCount >= config.maxRetries) return false;
  if (entry.error && entry.lastFailedAt && Date.now() - entry.lastFailedAt < config.cooldownMs) return false;
  if (entry.error) {
    entry.retryCount++;
    entry.error = null;
  }
  entry.generating = true;
  entry.generationStartedAt = Date.now();
  return true;
}

export function recordGenerationFailure(entry: GenerationEntry, error: string): void {
  entry.error = error;
  entry.lastFailedAt = Date.now();
}
