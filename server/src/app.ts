import express, { type Express } from "express";
import type { Driver } from "neo4j-driver";

import healthRouter from "./routes/health.js";
import narrateRouter from "./routes/narrate.js";

interface AppDeps {
  driver: Driver | null;
}

export function createApp(_deps: AppDeps): Express {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);
  app.use(narrateRouter);

  return app;
}
