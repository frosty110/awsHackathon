import tracer from "dd-trace";
import type { Driver } from "neo4j-driver";

export interface LoreRecord {
  name: string;
  description: string;
  relationship?: string;
  relatedName?: string;
}

/**
 * Query Neo4j for lore records related to the given entities.
 * Wrapped in a tracer.llmobs.trace() span so it appears in Datadog LLM Observability.
 *
 * TODO (Phase 5 RAG): Replace the stub query with real entity extraction
 * and Cypher traversal logic. The span wrapper is already in place.
 */
export async function queryLore(
  driver: Driver,
  entities: string[]
): Promise<LoreRecord[]> {
  return tracer.llmobs.trace(
    { kind: "tool", name: "neo4j.lore_query" },
    async (span) => {
      const { records } = await driver.executeQuery(
        `MATCH (n)
         WHERE n.name IN $entities
         OPTIONAL MATCH (n)-[r]->(related)
         RETURN n.name AS name, n.description AS description,
                type(r) AS relationship, related.name AS relatedName
         LIMIT 10`,
        { entities }
      );

      const results: LoreRecord[] = records.map((record) => ({
        name: record.get("name") as string,
        description: record.get("description") as string,
        relationship: record.get("relationship") as string | undefined,
        relatedName: record.get("relatedName") as string | undefined,
      }));

      // Annotate BEFORE callback returns — span finishes on return
      tracer.llmobs.annotate(span, {
        inputData: JSON.stringify({ entities }),
        outputData: JSON.stringify({ recordCount: results.length }),
        tags: { "db.system": "neo4j" },
      });

      return results;
    }
  );
}
