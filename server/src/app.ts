import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Driver } from "neo4j-driver";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import narrateRouter from "./routes/narrate.js";
<<<<<<< HEAD
import musicRouter from "./routes/music.js";
=======
import { buildRequestId, logEvent } from "./services/logger.js";
>>>>>>> 147404b45c3aa92e634bf1c885fdec2fbed50938

interface AppDeps {
  driver: Driver | null;
}

export function createApp(_deps: AppDeps): Express {
  const app = express();

  app.use(express.json({ limit: "64kb" }));
  app.use(healthRouter);
  app.use(chatRouter);
  app.use(narrateRouter);
<<<<<<< HEAD
  app.use(musicRouter);
=======
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const requestId = buildRequestId(req.get("x-request-id"));
    res.setHeader("x-request-id", requestId);

    const parseError = err as Error & { status?: number; type?: string };
    if (parseError.status === 400 && parseError.type === "entity.parse.failed") {
      logEvent(
        "warn",
        "http.invalid_json_body",
        {
          requestId,
          method: req.method,
          route: req.originalUrl,
          failureType: "terminal",
        },
        err
      );
      res.status(400).json({ error: "Invalid JSON body", requestId });
      return;
    }

    logEvent(
      "error",
      "http.unhandled_error",
      {
        requestId,
        method: req.method,
        route: req.originalUrl,
        failureType: "terminal",
      },
      err
    );

    if (res.headersSent) {
      next(err);
      return;
    }

    res.status(500).json({ error: "Internal server error", requestId });
  });
>>>>>>> 147404b45c3aa92e634bf1c885fdec2fbed50938

  return app;
}
