import "dotenv/config";

import { createServer } from "node:http";
import neo4j from "neo4j-driver";

import { createApp } from "./app.js";
import { config } from "./services/config.js";

async function main(): Promise<void> {
  const driver = neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
  );

  const allowNeo4jSkip =
    config.SKIP_NEO4J_CONNECTIVITY_CHECK === "1" && config.NODE_ENV !== "production";

  try {
    await driver.verifyConnectivity();
    console.log("Neo4j connectivity verified");
  } catch (error) {
    if (allowNeo4jSkip) {
      console.warn("Neo4j connectivity check skipped in non-production:", error);
    } else {
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
