import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Driver } from "neo4j-driver";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import narrateRouter from "./routes/narrate.js";
import musicRouter from "./routes/music.js";
import sceneVideoRouter from "./routes/sceneVideo.js";
import usageRouter from "./routes/usage.js";
import authRouter from "./routes/auth.js";
import { buildRequestId, logEvent } from "./services/logger.js";
import { optionalAuth } from "./middleware/auth.js";
import { chatRateLimiter, narrateRateLimiter } from "./middleware/rateLimiter.js";

interface AppDeps {
  driver: Driver | null;
}

export function createApp(_deps: AppDeps): Express {
  const app = express();

  // 1. Body parser
  app.use(express.json({ limit: "64kb" }));

  // 2. Populate req.userId/req.username on every request if JWT present (does NOT reject unauthenticated)
  app.use(optionalAuth);

  // 3. Health check — no auth, no rate limit
  app.use(healthRouter);

  // 4. Auth routes — no rate limit (login/register must always be accessible)
  app.use(authRouter);

  // 5. Rate limiters applied before their respective route handlers
  app.use("/api/chat", chatRateLimiter);
  app.use("/api/narrate", narrateRateLimiter);
  app.use("/narrate", narrateRateLimiter);

  // 6. Route handlers
  app.use(chatRouter);
  app.use(narrateRouter);
  app.use(musicRouter);
  app.use(sceneVideoRouter);
  app.use(usageRouter);

  // 7. Global error handler
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
