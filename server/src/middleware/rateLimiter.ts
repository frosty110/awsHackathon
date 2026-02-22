import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient, isRedisAvailable } from "../services/redis.js";
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
  // Default MemoryStore (in-process, resets on restart — acceptable for single-instance dev)
  return undefined;
}

/**
 * chatRateLimiter — 20 requests per minute per authenticated user (or IP for unauthenticated).
 * Applied to /api/chat.
 */
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as AuthenticatedRequest).userId ?? req.ip ?? "unknown",
  store: createStore("rl:chat:"),
  message: { error: "Too many chat requests, slow down" },
});

/**
 * narrateRateLimiter — 10 requests per minute per authenticated user (or IP for unauthenticated).
 * Applied to /api/narrate (TTS is expensive — stricter limit).
 */
export const narrateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as AuthenticatedRequest).userId ?? req.ip ?? "unknown",
  store: createStore("rl:narrate:"),
  message: { error: "Too many narrate requests, slow down" },
});

/**
 * registerLimiter — 3 requests per minute per IP.
 * Prevents registration spam and account farming.
 * Auth endpoints are IP-keyed (not userId-keyed) because auth hasn't happened yet.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: createStore("rl:register:"),
  message: { error: "Too many registration attempts, slow down" },
});

/**
 * loginLimiter — 10 requests per minute per IP.
 * Prevents credential stuffing attacks on the login endpoint.
 * Auth endpoints are IP-keyed (not userId-keyed) because auth hasn't happened yet.
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: createStore("rl:login:"),
  message: { error: "Too many login attempts, slow down" },
});
