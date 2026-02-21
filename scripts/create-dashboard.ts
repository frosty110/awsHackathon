// IMPORTANT: Run this script AFTER generating real trace data in Datadog.
// The trace_stream widget requires at least one span from the service to have been emitted
// before the dashboard will show live data. Run the 3-turn demo flow first, then run this script.
//
// Usage: DD_API_KEY=<api-key> DD_APP_KEY=<app-key> npm run create-dashboard
// DD_APP_KEY is a Datadog Application Key — create one at:
//   Datadog > Organization Settings > Application Keys > New Key

import { client as ddClient, v1 } from '@datadog/datadog-api-client';

// Shorthand helpers to reduce widget boilerplate
const LIVE_1H = { type: 'live' as const, unit: 'hour' as const, value: 1 };
const SVC_ENV = '{service:$service,env:$env}';
const LLMOBS_SEARCH = (extra = '') =>
  `@ml_app:ai-dm @event_type:span${extra ? ' ' + extra : ''}`;

async function main(): Promise<void> {
  const configuration = ddClient.createConfiguration();
  const dashApi = new v1.DashboardsApi(configuration);

  const dashboard: v1.Dashboard = {
    title: '[Hackathon] AI Dungeon Master - LLM Observability',
    description:
      'AI Dungeon Master full-stack observability for AWS x Anthropic x Datadog Hackathon. ' +
      'Covers API reliability, LLM cost/latency, Bedrock, Neo4j RAG, MiniMax TTS, and runtime health.',
    layoutType: 'ordered',
    templateVariables: [
      { name: 'env', defaults: ['hackathon'] },
      { name: 'service', defaults: ['ai-dungeon-master'] },
    ],
    widgets: [
      // ── Section 1: API Reliability ────────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'API Reliability — /chat & /narrate',
          widgets: [
            // Request rate by resource
            {
              definition: {
                type: 'timeseries',
                title: 'Request Rate by Endpoint',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'bars',
                    queries: [
                      {
                        name: 'hits',
                        dataSource: 'metrics',
                        query: `sum:trace.express.request.hits${SVC_ENV} by {resource_name}.as_count()`,
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
            // Error rate by resource
            {
              definition: {
                type: 'timeseries',
                title: 'Error Rate by Endpoint',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'bars',
                    queries: [
                      {
                        name: 'errors',
                        dataSource: 'metrics',
                        query: `sum:trace.express.request.errors${SVC_ENV} by {resource_name}.as_count()`,
                      },
                    ],
                    responseFormat: 'timeseries',
                    style: { palette: 'warm' },
                  },
                ],
              },
            },
            // p95 latency by resource
            {
              definition: {
                type: 'timeseries',
                title: 'p95 Latency by Endpoint',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'line',
                    queries: [
                      {
                        name: 'p95',
                        dataSource: 'metrics',
                        query: `p95:trace.express.request${SVC_ENV} by {resource_name}`,
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 2: LLM Pipeline Latency ──────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'LLM Pipeline — End-to-End Latency',
          widgets: [
            // Root span latency percentiles
            {
              definition: {
                type: 'timeseries',
                title: 'Root Span Latency Percentiles',
                time: LIVE_1H,
                showLegend: true,
                legendLayout: 'auto',
                requests: [
                  {
                    displayType: 'line',
                    formulas: [
                      { alias: 'avg', formula: 'avg' },
                      { alias: 'p75', formula: 'pc75' },
                      { alias: 'p90', formula: 'pc90' },
                      { alias: 'p95', formula: 'pc95' },
                    ],
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'avg',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'avg', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:undefined') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'pc75',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'pc75', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:undefined') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'pc90',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'pc90', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:undefined') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'pc95',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'pc95', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:undefined') },
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 3: LLM Cost ──────────────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'LLM Cost — Token Spend',
          widgets: [
            // Cost by model provider / model name
            {
              definition: {
                type: 'toplist',
                title: 'Total Cost by Model',
                time: LIVE_1H,
                requests: [
                  {
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'cost',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'sum', metric: '@metrics.estimated_total_cost' },
                        groupBy: [
                          { facet: '@meta.model_provider', limit: 10, shouldExcludeMissing: false },
                          { facet: '@meta.model_name', limit: 10, shouldExcludeMissing: false },
                        ],
                        search: { query: LLMOBS_SEARCH('@parent_id:*') },
                      },
                    ],
                    responseFormat: 'scalar',
                    formulas: [
                      {
                        alias: 'Total Cost',
                        formula: 'cost / 1000000000',
                        numberFormat: { unit: { type: 'canonical_unit', unitName: 'dollar' } },
                      },
                    ],
                    sort: { count: 10, orderBy: [{ type: 'formula', index: 0, order: 'desc' }] },
                  },
                ],
                style: { display: { type: 'stacked', legend: 'inline' }, palette: 'classic', scaling: 'absolute' },
              },
            },
            // Cost breakdown over time
            {
              definition: {
                type: 'timeseries',
                title: 'Cost Breakdown Over Time',
                time: LIVE_1H,
                showLegend: true,
                legendLayout: 'auto',
                requests: [
                  {
                    displayType: 'bars',
                    formulas: [
                      { alias: 'Non-cached Input', formula: 'm1', numberFormat: { unit: { type: 'canonical_unit', unitName: 'nanodollar' } } },
                      { alias: 'Cache Read Input', formula: 'm2', numberFormat: { unit: { type: 'canonical_unit', unitName: 'nanodollar' } } },
                      { alias: 'Cache Write Input', formula: 'm3', numberFormat: { unit: { type: 'canonical_unit', unitName: 'nanodollar' } } },
                      { alias: 'Output', formula: 'm4', numberFormat: { unit: { type: 'canonical_unit', unitName: 'nanodollar' } } },
                    ],
                    queries: [
                      { dataSource: 'llm_observability', name: 'm1', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_non_cached_input_cost' }, search: { query: LLMOBS_SEARCH('@parent_id:*') } },
                      { dataSource: 'llm_observability', name: 'm2', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_cache_read_input_cost' }, search: { query: LLMOBS_SEARCH('@parent_id:*') } },
                      { dataSource: 'llm_observability', name: 'm3', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_cache_write_input_cost' }, search: { query: LLMOBS_SEARCH('@parent_id:*') } },
                      { dataSource: 'llm_observability', name: 'm4', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_output_cost' }, search: { query: LLMOBS_SEARCH('@parent_id:*') } },
                    ],
                    responseFormat: 'timeseries',
                    style: { palette: 'classic' },
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 4: Bedrock Reliability ───────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'Bedrock Reliability',
          widgets: [
            // Bedrock call latency
            {
              definition: {
                type: 'timeseries',
                title: 'Bedrock Call Latency (avg / p95)',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'line',
                    queries: [
                      {
                        name: 'avg',
                        dataSource: 'metrics',
                        query: `avg:trace.aws.bedrockruntime.command${SVC_ENV}`,
                      },
                      {
                        name: 'p95',
                        dataSource: 'metrics',
                        query: `p95:trace.aws.bedrockruntime.command${SVC_ENV}`,
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
            // Bedrock errors / timeouts
            {
              definition: {
                type: 'timeseries',
                title: 'Bedrock Errors & Timeouts',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'bars',
                    queries: [
                      {
                        name: 'errors',
                        dataSource: 'metrics',
                        query: `sum:trace.aws.bedrockruntime.command.errors${SVC_ENV}.as_count()`,
                      },
                    ],
                    responseFormat: 'timeseries',
                    style: { palette: 'warm' },
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 5: Neo4j RAG Reliability ─────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'Neo4j RAG — Lore Retrieval',
          widgets: [
            // Neo4j query latency (LLMObs tool span)
            {
              definition: {
                type: 'timeseries',
                title: 'Lore Query Latency (avg / p95)',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'line',
                    formulas: [
                      { alias: 'avg', formula: 'avg_dur' },
                      { alias: 'p95', formula: 'p95_dur' },
                    ],
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'avg_dur',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'avg', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:neo4j.lore_query') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'p95_dur',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'pc95', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:neo4j.lore_query') },
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
            // Neo4j call count and error count
            {
              definition: {
                type: 'query_value',
                title: 'Lore Queries',
                time: LIVE_1H,
                requests: [
                  {
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'cnt',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'count' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:neo4j.lore_query') },
                      },
                    ],
                    responseFormat: 'scalar',
                    formulas: [{ formula: 'cnt' }],
                  },
                ],
              },
            },
            // Neo4j errors
            {
              definition: {
                type: 'query_value',
                title: 'Lore Query Failures',
                time: LIVE_1H,
                requests: [
                  {
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'errs',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'count' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:neo4j.lore_query @status:error') },
                      },
                    ],
                    responseFormat: 'scalar',
                    formulas: [{ formula: 'errs' }],
                    conditionalFormats: [
                      { comparator: '>', value: 0, palette: 'white_on_red' },
                      { comparator: '<=', value: 0, palette: 'white_on_green' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 6: TTS Reliability ───────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'MiniMax TTS — Narration',
          widgets: [
            // TTS latency
            {
              definition: {
                type: 'timeseries',
                title: 'TTS Narration Latency (avg / p95)',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'line',
                    formulas: [
                      { alias: 'avg', formula: 'avg_tts' },
                      { alias: 'p95', formula: 'p95_tts' },
                    ],
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'avg_tts',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'avg', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:minimax.tts') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'p95_tts',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'pc95', metric: '@duration' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:minimax.tts') },
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
            // TTS failures
            {
              definition: {
                type: 'query_value',
                title: 'TTS Failures',
                time: LIVE_1H,
                requests: [
                  {
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'tts_err',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'count' },
                        search: { query: LLMOBS_SEARCH('@parent_id:* @name:minimax.tts @status:error') },
                      },
                    ],
                    responseFormat: 'scalar',
                    formulas: [{ formula: 'tts_err' }],
                    conditionalFormats: [
                      { comparator: '>', value: 0, palette: 'white_on_red' },
                      { comparator: '<=', value: 0, palette: 'white_on_green' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 7: Stream Reliability ────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'Stream Reliability — SSE',
          widgets: [
            // Streams started vs completed (APM spans for /api/chat)
            {
              definition: {
                type: 'timeseries',
                title: 'Chat Streams Started vs Completed',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'bars',
                    queries: [
                      {
                        name: 'started',
                        dataSource: 'metrics',
                        query: `sum:trace.express.request.hits{service:$service,env:$env,resource_name:post_/api/chat}.as_count()`,
                      },
                      {
                        name: 'errors',
                        dataSource: 'metrics',
                        query: `sum:trace.express.request.errors{service:$service,env:$env,resource_name:post_/api/chat}.as_count()`,
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 8: Tool Usage ────────────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'Tool Spans — Usage & Errors',
          widgets: [
            {
              definition: {
                type: 'query_table',
                title: 'Tool Span Summary',
                time: LIVE_1H,
                requests: [
                  {
                    queries: [
                      {
                        dataSource: 'llm_observability',
                        name: 'q1',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'count' },
                        groupBy: [{ facet: '@name', limit: 30, sort: { order: 'desc', aggregation: 'count' } }],
                        search: { query: LLMOBS_SEARCH('@parent_id:* @meta.span.kind:tool') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'q2',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'avg', metric: '@duration' },
                        groupBy: [{ facet: '@name', limit: 30, sort: { order: 'desc', aggregation: 'count' } }],
                        search: { query: LLMOBS_SEARCH('@parent_id:* @meta.span.kind:tool') },
                      },
                      {
                        dataSource: 'llm_observability',
                        name: 'q3',
                        indexes: ['llmobs'],
                        compute: { aggregation: 'count' },
                        groupBy: [{ facet: '@name', limit: 30, sort: { order: 'desc', aggregation: 'count' } }],
                        search: { query: LLMOBS_SEARCH('@parent_id:* @meta.span.kind:tool @status:error') },
                      },
                    ],
                    responseFormat: 'scalar',
                    sort: { count: 90, orderBy: [{ type: 'formula', index: 0, order: 'desc' }] },
                    formulas: [
                      { cellDisplayMode: 'bar', alias: 'Usage Count', numberFormat: { unit: { type: 'custom_unit_label', label: 'calls' } }, formula: 'q1' },
                      { cellDisplayMode: 'trend', alias: 'Avg Duration', formula: 'q2' },
                      {
                        cellDisplayMode: 'bar',
                        alias: 'Errors',
                        formula: 'q3',
                        conditionalFormats: [
                          { comparator: '>', value: 0, palette: 'white_on_red' },
                          { comparator: '<=', value: 0, palette: 'white_on_green' },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 9: LLM Span Detail ──────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'LLM Span Detail — Prompts & Tokens',
          widgets: [
            {
              definition: {
                type: 'list_stream',
                title: 'LLM & Embedding Spans (by cost)',
                time: LIVE_1H,
                requests: [
                  {
                    responseFormat: 'event_list',
                    query: {
                      dataSource: 'llm_observability_stream',
                      queryString: '@ml_app:ai-dm @event_type:span @parent_id:* (@meta.span.kind:llm OR @meta.span.kind:embedding)',
                      indexes: ['llmobs'],
                      sort: { column: '@metrics.estimated_total_cost', order: 'desc' },
                    },
                    columns: [
                      { field: '@status', width: 'auto' },
                      { field: 'timestamp', width: 'auto' },
                      { field: '@meta.model_name', width: 'auto' },
                      { field: '@meta.input.value', width: 'auto' },
                      { field: '@metrics.input_tokens', width: 'auto' },
                      { field: '@metrics.output_tokens', width: 'auto' },
                      { field: '@metrics.total_tokens', width: 'auto' },
                      { field: '@metrics.estimated_total_cost', width: 'auto' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },

      // ── Section 10: Runtime Health ───────────────────────────────
      {
        definition: {
          type: 'group',
          layoutType: 'ordered',
          title: 'Runtime Health',
          widgets: [
            // Health check latency
            {
              definition: {
                type: 'timeseries',
                title: 'Health Check Latency',
                time: LIVE_1H,
                requests: [
                  {
                    displayType: 'line',
                    queries: [
                      {
                        name: 'health',
                        dataSource: 'metrics',
                        query: `avg:trace.express.request{service:$service,env:$env,resource_name:get_/health}`,
                      },
                    ],
                    responseFormat: 'timeseries',
                  },
                ],
              },
            },
            // Live APM traces
            {
              definition: {
                type: 'list_stream',
                title: 'Live APM Traces',
                time: LIVE_1H,
                requests: [
                  {
                    responseFormat: 'event_list',
                    query: {
                      dataSource: 'trace_stream',
                      queryString: 'service:$service env:$env',
                    },
                    columns: [
                      { field: 'resource_name', width: 'auto' },
                      { field: '@duration', width: 'auto' },
                      { field: 'status', width: 'auto' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };

  // Update existing dashboard if ID is provided, otherwise create new
  const dashboardId = process.env.DD_DASHBOARD_ID;
  if (dashboardId) {
    const result = await dashApi.updateDashboard({ dashboardId, body: dashboard });
    console.log('Dashboard updated:', result.url);
  } else {
    const result = await dashApi.createDashboard({ body: dashboard });
    console.log('Dashboard created:', result.url);
    console.log('To update this dashboard later, set DD_DASHBOARD_ID=' + result.id);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('403')) {
    console.error(
      '403 Forbidden — ensure DD_APP_KEY is set (Application Key, not API Key).\n' +
        'Create one at: Datadog > Organization Settings > Application Keys > New Key'
    );
  } else {
    console.error('Dashboard creation failed:', message);
  }
  process.exit(1);
});
