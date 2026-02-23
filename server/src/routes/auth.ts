import crypto from "crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { redisClient, isRedisAvailable } from "../services/redis.js";
import { logEvent } from "../services/logger.js";
import { getJwtSecret } from "../middleware/auth.js";

const router = Router();

// In-memory fallback when Redis is unavailable
const inMemoryUsers: Array<{
  userId: string;
  username: string;
  passwordHash: string;
}> = [];

// In-memory refresh token store (fallback when Redis is unavailable)
const inMemoryRefreshTokens = new Map<string, { userId: string; username: string; expiresAt: number }>();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** Issue a new refresh token and store it (Redis or in-memory fallback) */
async function issueRefreshToken(userId: string, username: string): Promise<string> {
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const refreshData = JSON.stringify({ userId, username });

  if (isRedisAvailable()) {
    await redisClient.set(`refresh:${refreshToken}`, refreshData, { EX: 7 * 24 * 60 * 60 }); // 7 days
  } else {
    inMemoryRefreshTokens.set(refreshToken, {
      userId,
      username,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  }

  return refreshToken;
}

/**
 * POST /api/auth/register
 * Register a new user with username/password.
 * Returns 201 { message, token, refreshToken, userId, username } on success.
 */
router.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body ?? {};

  // Input validation
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    res.status(400).json({
      error:
        "Username must be 3-20 characters, alphanumeric and underscores only",
    });
    return;
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: "Password must be 8-128 characters" });
    return;
  }

  try {
    // Check for existing username
    if (isRedisAvailable()) {
      const existing = await redisClient.hGetAll(`user:${username}`);
      if (existing && existing.userId) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }
    } else {
      const existing = inMemoryUsers.find((u) => u.username === username);
      if (existing) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    if (isRedisAvailable()) {
      await redisClient.hSet(`user:${username}`, {
        userId,
        username,
        passwordHash,
      });
    } else {
      logEvent("warn", "auth.redis_unavailable", {
        fallback: "in-memory",
        action: "register",
      });
      inMemoryUsers.push({ userId, username, passwordHash });
    }

    // Auto-login on registration: issue access + refresh tokens for immediate play
    const token = jwt.sign(
      { userId, username },
      getJwtSecret(),
      { algorithm: "HS256", expiresIn: "15m" }
    );
    const refreshToken = await issueRefreshToken(userId, username);

    logEvent("info", "auth.register_success", { username });
    res.status(201).json({ message: "registered", token, refreshToken, userId, username });
  } catch (err) {
    logEvent("error", "auth.register_error", { username }, err);
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /api/auth/login
 * Authenticate with username/password, returns JWT.
 * Returns 200 { token, refreshToken, userId, username } on success.
 * Returns 401 { error } without leaking which field was wrong.
 */
router.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  try {
    let user:
      | { userId: string; username: string; passwordHash: string }
      | undefined;

    if (isRedisAvailable()) {
      const data = await redisClient.hGetAll(`user:${username}`);
      if (data && data.userId) {
        user = {
          userId: data.userId,
          username: data.username,
          passwordHash: data.passwordHash,
        };
      }
    } else {
      user = inMemoryUsers.find((u) => u.username === username);
    }

    if (!user) {
      // Valid pre-computed hash for constant-time comparison (prevents username enumeration)
      await bcrypt.compare(password, "$2b$12$eImiTXuWVxfM37uY4JANjQ.GCQPekzNaZMbLLCe6ib7TRF7bBm4TK");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { userId: user.userId, username: user.username },
      getJwtSecret(),
      { algorithm: "HS256", expiresIn: "15m" }
    );
    const refreshToken = await issueRefreshToken(user.userId, user.username);

    logEvent("info", "auth.login_success", { username });
    res.status(200).json({ token, refreshToken, userId: user.userId, username: user.username });
  } catch (err) {
    logEvent("error", "auth.login_error", { username }, err);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token + rotated refresh token.
 * Returns 200 { token, refreshToken } on success.
 * Returns 401 if the refresh token is invalid or expired.
 */
router.post("/api/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken !== "string" || !refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }

  try {
    let userData: { userId: string; username: string } | null = null;

    if (isRedisAvailable()) {
      const raw = await redisClient.get(`refresh:${refreshToken}`);
      if (raw) {
        userData = JSON.parse(raw) as { userId: string; username: string };
        // Rotate: delete old refresh token
        await redisClient.del(`refresh:${refreshToken}`);
      }
    } else {
      const entry = inMemoryRefreshTokens.get(refreshToken);
      if (entry && entry.expiresAt > Date.now()) {
        userData = { userId: entry.userId, username: entry.username };
        inMemoryRefreshTokens.delete(refreshToken);
      }
    }

    if (!userData) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Issue new access token + new refresh token (rotation)
    const newAccessToken = jwt.sign(
      { userId: userData.userId, username: userData.username },
      getJwtSecret(),
      { algorithm: "HS256", expiresIn: "15m" }
    );
    const newRefreshToken = await issueRefreshToken(userData.userId, userData.username);

    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    logEvent("error", "auth.refresh_error", {}, err);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

export default router;
