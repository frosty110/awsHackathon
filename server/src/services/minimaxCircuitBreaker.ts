/**
 * Simple circuit breaker for MiniMax API calls (TTS, music, video).
 * Opens after FAILURE_THRESHOLD consecutive failures, auto-resets after COOLDOWN_MS.
 */

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60_000;

export function isCircuitOpen(): boolean {
  if (consecutiveFailures < FAILURE_THRESHOLD) return false;
  if (Date.now() >= circuitOpenUntil) {
    // Cooldown expired — allow a single probe request (half-open)
    consecutiveFailures = FAILURE_THRESHOLD - 1;
    return false;
  }
  return true;
}

export function recordSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

export function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + COOLDOWN_MS;
  }
}
