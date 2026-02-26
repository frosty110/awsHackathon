import { createHash } from "node:crypto";

/**
 * SHA-256 hash truncated to 16 hex chars — used as a compact cache key.
 */
export function hashKey(preHashKey: string): string {
  return createHash("sha256").update(preHashKey).digest("hex").slice(0, 16);
}
