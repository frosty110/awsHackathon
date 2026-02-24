import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient, isRedisAvailable } from "../services/redis.js";
import { logEvent } from "../services/logger.js";
import type { AuthenticatedRequest } from "./auth.js";

/**
 * Creates a rate limit store.
 * Uses Redis when available (persistent across restarts, supports multi-instance).
 * Falls back to MemoryStore (built into express-rate-limit) when Redis is unavailable.
 */
function createStore(prefix: string) {
  if (isRedisAvailable()) {
    return new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      prefix,
    });
  }
  return undefined;
}

// ── Factory ──────────────────────────────────────────────────────────────────

interface LimiterConfig {
  prefix: string;
  limit: number;
  windowMs?: number;
  keyType: "userId" | "ip";
  message: string;
}

function createLimiter({ prefix, limit, windowMs = 60_000, keyType, message }: LimiterConfig) {
  const limiterName = prefix.replace(/^rl:|:$/g, "");
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator:
      keyType === "userId"
        ? (req) => (req as AuthenticatedRequest).userId ?? ipKeyGenerator(req.ip ?? "unknown")
        : (req) => ipKeyGenerator(req.ip ?? "unknown"),
    store: createStore(prefix),
    handler: (req, res) => {
      logEvent("warn", "rate_limit.exceeded", {
        route: req.originalUrl,
        key:
          keyType === "userId"
            ? (req as AuthenticatedRequest).userId ?? req.ip ?? "unknown"
            : req.ip ?? "unknown",
        limiter: limiterName,
      });
      res.status(429).json({ error: message });
    },
  });
}

// ── Authenticated endpoint limiters (userId-keyed) ───────────────────────────

export const chatRateLimiter = createLimiter({
  prefix: "rl:chat:",
  limit: 20,
  keyType: "userId",
  message: "Too many chat requests, slow down",
});

export const narrateRateLimiter = createLimiter({
  prefix: "rl:narrate:",
  limit: 10,
  keyType: "userId",
  message: "Too many narrate requests, slow down",
});

export const musicLimiter = createLimiter({
  prefix: "rl:music:",
  limit: 20,
  keyType: "userId",
  message: "Rate limit exceeded. Slow down, adventurer.",
});

export const sceneVideoLimiter = createLimiter({
  prefix: "rl:scene-video:",
  limit: 20,
  keyType: "userId",
  message: "Too many scene video requests, slow down",
});

export const usageLimiter = createLimiter({
  prefix: "rl:usage:",
  limit: 30,
  keyType: "userId",
  message: "Too many usage requests, slow down",
});

export const savesLimiter = createLimiter({
  prefix: "rl:saves:",
  limit: 30,
  keyType: "userId",
  message: "Too many save requests, slow down",
});

// ── Auth endpoint limiters (IP-keyed) ────────────────────────────────────────

export const registerLimiter = createLimiter({
  prefix: "rl:register:",
  limit: 3,
  keyType: "ip",
  message: "Too many registration attempts, slow down",
});

export const loginLimiter = createLimiter({
  prefix: "rl:login:",
  limit: 10,
  keyType: "ip",
  message: "Too many login attempts, slow down",
});

export const refreshLimiter = createLimiter({
  prefix: "rl:refresh:",
  limit: 5,
  keyType: "ip",
  message: "Too many token refresh attempts, slow down",
});
