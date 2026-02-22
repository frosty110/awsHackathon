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

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * POST /api/auth/register
 * Register a new user with username/password.
 * Returns 201 { message, userId, username } on success.
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
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
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

    logEvent("info", "auth.register_success", { username });
    res.status(201).json({ message: "registered", userId, username });
  } catch (err) {
    logEvent("error", "auth.register_error", { username }, err);
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /api/auth/login
 * Authenticate with username/password, returns JWT.
 * Returns 200 { token, userId, username } on success.
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
      // Constant-time delay to prevent username enumeration timing attacks
      await bcrypt.compare(password, "$2a$12$invalidhashfortimingnorm123456");
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
      { expiresIn: "7d" }
    );

    logEvent("info", "auth.login_success", { username });
    res.status(200).json({ token, userId: user.userId, username: user.username });
  } catch (err) {
    logEvent("error", "auth.login_error", { username }, err);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
