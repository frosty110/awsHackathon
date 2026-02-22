import { rateLimit } from "express-rate-limit";
import { logEvent } from "../services/logger.js";

/**
 * rateLimits.ts — MemoryStore rate limiter for the music endpoint.
 *
 * Rate limiting architecture in this codebase:
 *
 *   rateLimits.ts  (this file)
 *     - musicLimiter: 20/min, keyed by IP
 *     - Uses MemoryStore (built into express-rate-limit)
 *     - Music uses GET requests, so body-based keying is nonsensical
 *
 *   rateLimiter.ts  (Phase 09, Redis-backed)
 *     - chatRateLimiter:   20/min, keyed by authenticated userId or IP
 *     - narrateRateLimiter: 10/min, keyed by authenticated userId or IP
 *     - Conditionally wires RedisStore for persistence across restarts/instances
 *     - Chat and narrate require authentication, enabling userId-keyed limits
 *
 * The two files are intentionally separate: music is unauthenticated (IP key,
 * MemoryStore acceptable); chat/narrate are authenticated (userId key, Redis-backed for
 * cross-instance consistency at 1000-user scale).
 */

/**
 * musicLimiter — 20 requests per minute per IP.
 * Applied to /api/music and /music. Music generation is moderately expensive.
 */
export const musicLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  handler: (req, res) => {
    logEvent("warn", "rate_limit.exceeded", {
      route: req.originalUrl,
      key: req.ip ?? "unknown",
      limiter: "music",
    });
    res.status(429).json({ error: "Rate limit exceeded. Slow down, adventurer." });
  },
});
