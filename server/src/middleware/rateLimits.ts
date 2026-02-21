import { rateLimit } from "express-rate-limit";
import { logEvent } from "../services/logger.js";

/**
 * rateLimits.ts — per-route rate limiters for the AI DM server.
 *
 * Key generation strategy (CLAUDE.md: per-user, not just per-IP):
 *   1. req.body.conversationId — stable per-session identifier available before auth
 *   2. req.ip — fallback for unauthenticated requests without a conversationId
 *   3. "unknown" — last resort to avoid undefined key
 *
 * Uses MemoryStore (built into express-rate-limit).
 * For Redis-backed persistence across restarts/instances, use rateLimiter.ts which
 * conditionally wires RedisStore when Redis is available.
 */

/**
 * chatLimiter — 60 requests per minute per conversation (or IP).
 * Applied to /api/chat.
 */
export const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.body as Record<string, unknown>)?.conversationId as string | undefined ??
    req.ip ??
    "unknown",
  handler: (req, res) => {
    logEvent("warn", "rate_limit.exceeded", {
      route: req.originalUrl,
      key:
        (req.body as Record<string, unknown>)?.conversationId ??
        req.ip ??
        "unknown",
      limiter: "chat",
    });
    res.status(429).json({ error: "Rate limit exceeded. Slow down, adventurer." });
  },
});

/**
 * narrateLimiter — 10 requests per minute per conversation (or IP).
 * Applied to /api/narrate and /narrate. TTS is expensive — stricter limit.
 */
export const narrateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.body as Record<string, unknown>)?.conversationId as string | undefined ??
    req.ip ??
    "unknown",
  handler: (req, res) => {
    logEvent("warn", "rate_limit.exceeded", {
      route: req.originalUrl,
      key:
        (req.body as Record<string, unknown>)?.conversationId ??
        req.ip ??
        "unknown",
      limiter: "narrate",
    });
    res.status(429).json({ error: "Rate limit exceeded. Slow down, adventurer." });
  },
});

/**
 * musicLimiter — 20 requests per minute per conversation (or IP).
 * Applied to /api/music. Music generation is moderately expensive.
 */
export const musicLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.body as Record<string, unknown>)?.conversationId as string | undefined ??
    req.ip ??
    "unknown",
  handler: (req, res) => {
    logEvent("warn", "rate_limit.exceeded", {
      route: req.originalUrl,
      key:
        (req.body as Record<string, unknown>)?.conversationId ??
        req.ip ??
        "unknown",
      limiter: "music",
    });
    res.status(429).json({ error: "Rate limit exceeded. Slow down, adventurer." });
  },
});
