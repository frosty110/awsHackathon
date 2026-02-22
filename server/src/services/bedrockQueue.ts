import PQueue from "p-queue";

/**
 * Bedrock concurrency queue — limits simultaneous in-flight Bedrock streaming calls.
 *
 * Starting with concurrency: 20 (conservative, per research open question #3).
 * Tune upward based on Datadog throttle error monitoring. AWS Bedrock on-demand
 * quotas are per-account; check Service Quotas console for actual limits.
 */
// Explicit type avoids "inferred type cannot be named" TS2742 error with p-queue ESM package
export const bedrockQueue: InstanceType<typeof PQueue> = new PQueue({ concurrency: 20 });

/**
 * Wrap a Bedrock call in the concurrency queue.
 * Resolves when the queue has capacity and the call completes.
 */
export async function queueBedrockCall<T>(fn: () => Promise<T>): Promise<T> {
  return bedrockQueue.add(fn) as Promise<T>;
}

/**
 * Returns true when extreme backpressure is building up.
 * Routes can return 503 early before queuing additional calls
 * when this threshold is exceeded.
 */
export function isBedrockQueueOverloaded(): boolean {
  return bedrockQueue.pending > 50; // 2.5x concurrency — code review recommended 40-60
}
