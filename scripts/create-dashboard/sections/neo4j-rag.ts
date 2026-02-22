import { LIVE_1H, llm } from '../helpers.js';

export const neo4jRag = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Neo4j RAG — Lore Retrieval',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Lore Query Latency (avg / p95)',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'line',
              formulas: [
                { alias: 'avg', formula: 'avg_lore' },
                { alias: 'p95', formula: 'p95_lore' },
              ],
              queries: [
                { data_source: 'llm_observability', name: 'avg_lore', indexes: ['llmobs'], compute: { aggregation: 'avg', metric: '@duration' }, search: { query: llm('@parent_id:* @name:neo4j.lore_query') } },
                { data_source: 'llm_observability', name: 'p95_lore', indexes: ['llmobs'], compute: { aggregation: 'pc95', metric: '@duration' }, search: { query: llm('@parent_id:* @name:neo4j.lore_query') } },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Lore Queries (total)',
          time: LIVE_1H,
          requests: [
            {
              queries: [
                { data_source: 'llm_observability', name: 'cnt', indexes: ['llmobs'], compute: { aggregation: 'count' }, search: { query: llm('@parent_id:* @name:neo4j.lore_query') } },
              ],
              response_format: 'scalar',
              formulas: [{ formula: 'cnt' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Lore Query Failures',
          time: LIVE_1H,
          requests: [
            {
              queries: [
                { data_source: 'llm_observability', name: 'errs', indexes: ['llmobs'], compute: { aggregation: 'count' }, search: { query: llm('@parent_id:* @name:neo4j.lore_query @status:error') } },
              ],
              response_format: 'scalar',
              formulas: [{ formula: 'errs' }],
              conditional_formats: [
                { comparator: '>', value: 0, palette: 'white_on_red' },
                { comparator: '<=', value: 0, palette: 'white_on_green' },
              ],
            },
          ],
        },
      },
    ],
  },
};
