import { createClient } from "redis";
import { config } from "./config.js";
import { logEvent } from "./logger.js";

// Module-level flag — tracks whether Redis connection was attempted and succeeded
let redisEnabled = false;

export const redisClient = createClient({
  url: config.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => {
  console.error("[redis] client error:", err);
});

/**
 * Connect to Redis before any dependent code runs.
 * Called once in server/src/index.ts main() before createApp() and initSocketIO().
 *
 * If REDIS_URL is blank, skips connection and logs a warning — graceful degradation.
 * node-redis requires explicit .connect() — it does NOT auto-connect on instantiation.
 */
export async function connectRedis(): Promise<void> {
  if (!config.REDIS_URL) {
    logEvent("info", "redis.skipped", {
      reason: "REDIS_URL not configured",
      fallback: "in-memory",
    });
    redisEnabled = false;
    return;
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("[redis] connected");
    redisEnabled = true;
  }
}

/**
 * Returns true if Redis is connected and available.
 * Used by other modules to gracefully degrade when Redis is unavailable.
 */
export function isRedisAvailable(): boolean {
  return redisEnabled && redisClient.isOpen;
}
