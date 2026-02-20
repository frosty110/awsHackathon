import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { createServer } from "node:http";
import neo4j from "neo4j-driver";

import { createApp } from "./app.js";
import { config, warnOnBlankConfig, requireConfigValues } from "./services/config.js";

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

  const allowNeo4jSkip =
    config.SKIP_NEO4J_CONNECTIVITY_CHECK === "1" && config.NODE_ENV !== "production";

  let driver: neo4j.Driver | null = null;

  if (allowNeo4jSkip) {
    warnOnBlankConfig(
      ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"],
      "Neo4j (skipping connectivity check)"
    );
  } else {
    requireConfigValues(
      ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"],
      "Neo4j connectivity check"
    );
    driver = neo4j.driver(
      config.NEO4J_URI,
      neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
    );
    try {
      await driver.verifyConnectivity();
      console.log("Neo4j connectivity verified");
    } catch (error) {
      console.error("Neo4j connectivity check failed:", error);
      await driver.close();
      process.exit(1);
    }
  }

  const app = createApp({ driver });
  const server = createServer(app);

  server.listen(config.PORT, () => {
    console.log(`Server listening on http://localhost:${config.PORT}`);
  });
}

main().catch((error) => {
  console.error("Fatal server startup error:", error);
  process.exit(1);
});
