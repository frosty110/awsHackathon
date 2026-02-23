import express, { type Express, type NextFunction, type Request, type Response } from "express";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import narrateRouter from "./routes/narrate.js";
import musicRouter from "./routes/music.js";
import sceneVideoRouter from "./routes/sceneVideo.js";
import usageRouter from "./routes/usage.js";
import authRouter from "./routes/auth.js";
import { buildRequestId, logEvent } from "./services/logger.js";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import { chatRateLimiter, narrateRateLimiter, registerLimiter, loginLimiter, refreshLimiter } from "./middleware/rateLimiter.js";
import { helmetMiddleware, corsMiddleware } from "./middleware/security.js";
import { musicLimiter } from "./middleware/rateLimits.js";

export function createApp(): Express {
  const app = express();

  // Trust first proxy (ALB/nginx/CloudFront) so req.ip reflects real client IP for rate limiting
  app.set('trust proxy', 1);

  // 1. Security headers (helmet) and CORS — must come first before any route handling
  app.use(helmetMiddleware);
  app.use(corsMiddleware);

  // 2. Body parser
  app.use(express.json({ limit: "64kb" }));

  // 3. Populate req.userId/req.username on every request if JWT present (does NOT reject unauthenticated)
  app.use(optionalAuth);

  // 4. Health check — no auth, no rate limit
  app.use(healthRouter);

  // 5. Auth route rate limiting — IP-keyed to prevent spam/stuffing
  app.use("/api/auth/register", registerLimiter);
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/refresh", refreshLimiter);

  // 6. Auth routes
  app.use(authRouter);

  // 7. Auth enforcement + rate limiters applied before their respective route handlers
  app.use("/api/chat", requireAuth, chatRateLimiter);
  app.use("/api/narrate", requireAuth, narrateRateLimiter);
  app.use("/api/music", requireAuth, musicLimiter);
  app.use("/api/scene-video", requireAuth);
  app.use("/api/usage", requireAuth);

  // 8. Route handlers
  app.use(chatRouter);
  app.use(narrateRouter);
  app.use(musicRouter);
  app.use(sceneVideoRouter);
  app.use(usageRouter);

  // 9. Global error handler
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const requestId = buildRequestId(req.get("x-request-id"));
    res.setHeader("x-request-id", requestId);

    const parseError = err as Error & { status?: number; type?: string };
    if (parseError.status === 400 && parseError.type === "entity.parse.failed") {
      logEvent("warn", "http.invalid_json_body", { requestId, method: req.method, route: req.originalUrl, failureType: "terminal" }, err);
      res.status(400).json({ error: "Invalid JSON body", requestId });
      return;
    }

    logEvent("error", "http.unhandled_error", { requestId, method: req.method, route: req.originalUrl, failureType: "terminal" }, err);

    if (res.headersSent) { next(err); return; }

    res.status(500).json({ error: "Internal server error", requestId });
  });

  return app;
}
