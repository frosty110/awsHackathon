import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { createServer } from "node:http";
import neo4j from "neo4j-driver";

import { createApp } from "./app.js";
import { config, warnOnBlankConfig } from "./services/config.js";
import { connectRedis, redisClient, isRedisAvailable } from "./services/redis.js";
import { initSocketIO } from "./sockets/index.js";
import { initRag } from "./services/rag.js";
import { activeSSEStreams } from "./services/activeStreams.js";

async function main(): Promise<void> {
  warnOnBlankConfig(
    ["AWS_REGION"],
    "AWS Bedrock (needed in Phase 4)"
  );
  warnOnBlankConfig(
    ["DD_API_KEY", "DD_LLMOBS_ML_APP"],
    "Datadog LLM Observability (needed in Phase 6)"
  );
  warnOnBlankConfig(
    ["MINIMAX_API_KEY", "MINIMAX_GROUP_ID"],
    "MiniMax TTS (needed in Phase 7)"
  );
  if (config.NODE_ENV === "production") {
    warnOnBlankConfig(
      ["REDIS_URL"],
      "Redis (needed for Phase 9 persistence)"
    );
    warnOnBlankConfig(
      ["JWT_SECRET"],
      "JWT Auth (needed for Phase 9 authentication)"
    );
  }

  // Connect Redis before any routes or sockets that depend on it
  await connectRedis();

  const allowNeo4jSkip =
    config.SKIP_NEO4J_CONNECTIVITY_CHECK === "1" && config.NODE_ENV !== "production";
  const neo4jConfigKeys = ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"] as const;
  const hasNeo4jConfig = neo4jConfigKeys.every((key) => config[key].trim() !== "");

  let driver: neo4j.Driver | null = null;

  if (!hasNeo4jConfig) {
    warnOnBlankConfig(
      ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"],
      "Neo4j disabled (chat continues without lore)"
    );
  } else {
    driver = neo4j.driver(
      config.NEO4J_URI,
      neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
    );

    if (allowNeo4jSkip) {
      console.warn("[config] Neo4j connectivity check skipped via SKIP_NEO4J_CONNECTIVITY_CHECK=1");
    } else {
      try {
        await driver.verifyConnectivity();
        console.log("Neo4j connectivity verified");
      } catch (error) {
        console.error("Neo4j connectivity check failed, continuing without lore:", error);
        await driver.close();
        driver = null;
      }
    }
  }

  // Initialize RAG pipeline with Neo4j driver (graceful no-op if null)
  initRag(driver);

  const app = createApp();
  const server = createServer(app);

  // Attach Socket.IO to the http.Server (must be done before server.listen)
  const io = await initSocketIO(server);

  server.listen(config.PORT, () => {
    console.log(`Server listening on http://localhost:${config.PORT}`);
  });

  // M3: Graceful shutdown — close Socket.IO, HTTP server, Neo4j, and Redis in correct order
  const shutdown = async (signal: string) => {
    console.log(`[shutdown] ${signal} received, closing gracefully...`);
    // 0. Notify active SSE clients and drain streams before closing
    for (const stream of activeSSEStreams) {
      try {
        stream.write('data: {"error":"Server shutting down"}\n\n');
        stream.write('data: [DONE]\n\n');
        stream.end();
      } catch { /* stream already closed */ }
    }
    activeSSEStreams.clear();
    // 1. Close Socket.IO first — sends disconnect packets while HTTP is still up
    io.close();
    // 2. Stop accepting new HTTP connections
    server.close();
    // 3. Close Neo4j driver
    if (driver) await driver.close();
    // 4. Flush pending Redis commands and close TCP connection
    if (isRedisAvailable()) await redisClient.quit();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Fatal server startup error:", error);
  process.exit(1);
});
