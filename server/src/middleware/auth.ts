import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "../services/config.js";

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
    const payload = jwt.verify(token, config.JWT_SECRET) as {
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
    const payload = jwt.verify(token, config.JWT_SECRET) as {
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
