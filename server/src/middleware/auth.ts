import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "../services/config.js";

let devSecretWarned = false;

/**
 * Get the JWT secret for signing/verifying tokens.
 * - In production: requires JWT_SECRET to be set, throws fatal error if missing.
 * - In development: falls back to a dev-only secret with a one-time warning.
 */
export function getJwtSecret(): string {
  if (config.JWT_SECRET) {
    return config.JWT_SECRET;
  }
  if (config.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET must be set in production");
  }
  if (!devSecretWarned) {
    console.warn("[auth] WARNING: Using dev-only JWT secret. Set JWT_SECRET for production.");
    devSecretWarned = true;
  }
  return "dev-secret-do-not-use-in-production";
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  username?: string;
}

/**
 * requireAuth middleware — enforces JWT authentication.
 * Rejects requests without a valid Bearer token with 401.
 * Use on routes that require authentication.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as {
      userId: string;
      username: string;
    };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: "Token invalid or expired" });
  }
}

/**
 * optionalAuth middleware — populates userId/username if JWT present, but does NOT reject unauthenticated requests.
 * Use globally to enable per-user rate limiting while keeping routes open to unauthenticated users.
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as {
      userId: string;
      username: string;
    };
    req.userId = payload.userId;
    req.username = payload.username;
  } catch {
    // Invalid/expired token in optionalAuth — ignore silently, treat as unauthenticated
  }
  next();
}
