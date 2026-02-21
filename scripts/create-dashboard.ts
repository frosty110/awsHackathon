// IMPORTANT: Run this script AFTER generating real trace data in Datadog.
// The trace_stream widget requires at least one span from the service to have been emitted
// before the dashboard will show live data. Run the 3-turn demo flow first, then run this script.
//
// Usage: DD_API_KEY=<api-key> DD_APP_KEY=<app-key> npm run create-dashboard
//        DD_DASHBOARD_ID=<id> to update an existing dashboard
// DD_APP_KEY is a Datadog Application Key — create one at:
//   Datadog > Organization Settings > Application Keys > New Key

const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;
const DD_DASHBOARD_ID = process.env.DD_DASHBOARD_ID;
const DD_SITE = process.env.DD_SITE || 'datadoghq.com';

if (!DD_API_KEY || !DD_APP_KEY) {
  console.error('DD_API_KEY and DD_APP_KEY are required.');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────
const LIVE_1H = { type: 'live', unit: 'hour', value: 1 };
const SVC_ENV = '{service:$service,env:$env}';
const llm = (extra = '') => `@ml_app:ai-dm @event_type:span${extra ? ' ' + extra : ''}`;

// ── Dashboard definition (raw JSON for the Datadog REST API) ──────
const dashboard = {
  title: '[Hackathon] AI Dungeon Master - LLM Observability',
  description:
    'Full-stack observability for the AI Dungeon Master hackathon demo. ' +
    'Covers API reliability, LLM cost/latency, Bedrock, Neo4j RAG, MiniMax TTS, and runtime health.',
  layout_type: 'ordered',
  template_variables: [
    { name: 'env', available_values: [], default: 'hackathon' },
    { name: 'service', available_values: [], default: 'ai-dungeon-master' },
  ],
  widgets: [
    // ═══════════════════════════════════════════════════════════════
    // Section 1: API Reliability
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'API Reliability — /chat & /narrate',
        widgets: [
          // Request rate by endpoint
          {
            definition: {
              type: 'timeseries',
              title: 'Request Rate by Endpoint',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    {
                      name: 'hits',
                      data_source: 'metrics',
                      query: `sum:trace.express.request.hits${SVC_ENV} by {resource_name}.as_count()`,
                    },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
          // Error rate by endpoint
          {
            definition: {
              type: 'timeseries',
              title: 'Error Rate by Endpoint',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    {
                      name: 'errors',
                      data_source: 'metrics',
                      query: `sum:trace.express.request.errors${SVC_ENV} by {resource_name}.as_count()`,
                    },
                  ],
                  response_format: 'timeseries',
                  style: { palette: 'warm' },
                },
              ],
            },
          },
          // p95 latency by endpoint
          {
            definition: {
              type: 'timeseries',
              title: 'p95 Latency by Endpoint',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'line',
                  queries: [
                    {
                      name: 'p95',
                      data_source: 'metrics',
                      query: `p95:trace.express.request${SVC_ENV} by {resource_name}`,
                    },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 2: LLM Pipeline Latency
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'LLM Pipeline — End-to-End Latency',
        widgets: [
          {
            definition: {
              type: 'timeseries',
              title: 'Root Span Latency Percentiles',
              title_size: '16',
              title_align: 'left',
              show_legend: true,
              legend_layout: 'auto',
              time: LIVE_1H,
              requests: [
                {
                  formulas: [
                    { alias: 'avg', formula: 'avg' },
                    { alias: 'p75', formula: 'pc75' },
                    { alias: 'p90', formula: 'pc90' },
                    { alias: 'p95', formula: 'pc95' },
                  ],
                  queries: [
                    { data_source: 'llm_observability', name: 'avg', indexes: ['llmobs'], compute: { aggregation: 'avg', metric: '@duration' }, search: { query: llm('@parent_id:undefined') } },
                    { data_source: 'llm_observability', name: 'pc75', indexes: ['llmobs'], compute: { aggregation: 'pc75', metric: '@duration' }, search: { query: llm('@parent_id:undefined') } },
                    { data_source: 'llm_observability', name: 'pc90', indexes: ['llmobs'], compute: { aggregation: 'pc90', metric: '@duration' }, search: { query: llm('@parent_id:undefined') } },
                    { data_source: 'llm_observability', name: 'pc95', indexes: ['llmobs'], compute: { aggregation: 'pc95', metric: '@duration' }, search: { query: llm('@parent_id:undefined') } },
                  ],
                  response_format: 'timeseries',
                  display_type: 'line',
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 3: LLM Cost
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'LLM Cost — Token Spend',
        widgets: [
          // Total cost by model
          {
            definition: {
              type: 'toplist',
              title: 'Total Cost by Model',
              title_size: '16',
              title_align: 'left',
              time: LIVE_1H,
              requests: [
                {
                  queries: [
                    {
                      data_source: 'llm_observability',
                      name: 'cost',
                      indexes: ['llmobs'],
                      compute: { aggregation: 'sum', metric: '@metrics.estimated_total_cost' },
                      group_by: [
                        { facet: '@meta.model_provider', limit: 10, should_exclude_missing: false },
                        { facet: '@meta.model_name', limit: 10, should_exclude_missing: false },
                      ],
                      search: { query: llm('@parent_id:*') },
                    },
                  ],
                  response_format: 'scalar',
                  formulas: [
                    {
                      alias: 'Total Cost',
                      formula: 'cost / 1000000000',
                      number_format: { unit: { type: 'canonical_unit', unit_name: 'dollar' } },
                    },
                  ],
                  sort: { count: 10, order_by: [{ type: 'formula', index: 0, order: 'desc' }] },
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
              title_size: '16',
              title_align: 'left',
              show_legend: true,
              legend_layout: 'auto',
              time: LIVE_1H,
              requests: [
                {
                  formulas: [
                    { alias: 'Non-cached Input', formula: 'm1', number_format: { unit: { type: 'canonical_unit', unit_name: 'nanodollar' } } },
                    { alias: 'Cache Read Input', formula: 'm2', number_format: { unit: { type: 'canonical_unit', unit_name: 'nanodollar' } } },
                    { alias: 'Cache Write Input', formula: 'm3', number_format: { unit: { type: 'canonical_unit', unit_name: 'nanodollar' } } },
                    { alias: 'Output', formula: 'm4', number_format: { unit: { type: 'canonical_unit', unit_name: 'nanodollar' } } },
                  ],
                  queries: [
                    { data_source: 'llm_observability', name: 'm1', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_non_cached_input_cost' }, search: { query: llm('@parent_id:*') } },
                    { data_source: 'llm_observability', name: 'm2', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_cache_read_input_cost' }, search: { query: llm('@parent_id:*') } },
                    { data_source: 'llm_observability', name: 'm3', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_cache_write_input_cost' }, search: { query: llm('@parent_id:*') } },
                    { data_source: 'llm_observability', name: 'm4', indexes: ['llmobs'], compute: { aggregation: 'sum', metric: '@metrics.estimated_output_cost' }, search: { query: llm('@parent_id:*') } },
                  ],
                  response_format: 'timeseries',
                  style: { palette: 'classic' },
                  display_type: 'bars',
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 4: Bedrock Reliability
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
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
                  display_type: 'line',
                  queries: [
                    { name: 'avg_br', data_source: 'metrics', query: `avg:trace.aws.bedrockruntime.command${SVC_ENV}` },
                    { name: 'p95_br', data_source: 'metrics', query: `p95:trace.aws.bedrockruntime.command${SVC_ENV}` },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
          // Bedrock errors
          {
            definition: {
              type: 'timeseries',
              title: 'Bedrock Errors',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    { name: 'errs', data_source: 'metrics', query: `sum:trace.aws.bedrockruntime.command.errors${SVC_ENV}.as_count()` },
                  ],
                  response_format: 'timeseries',
                  style: { palette: 'warm' },
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 5: Neo4j RAG Reliability
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'Neo4j RAG — Lore Retrieval',
        widgets: [
          // Lore query latency
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
          // Lore query count + error count side by side
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
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 6: MiniMax TTS Reliability
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
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
                  display_type: 'line',
                  formulas: [
                    { alias: 'avg', formula: 'avg_tts' },
                    { alias: 'p95', formula: 'p95_tts' },
                  ],
                  queries: [
                    { data_source: 'llm_observability', name: 'avg_tts', indexes: ['llmobs'], compute: { aggregation: 'avg', metric: '@duration' }, search: { query: llm('@parent_id:* @name:minimax.tts') } },
                    { data_source: 'llm_observability', name: 'p95_tts', indexes: ['llmobs'], compute: { aggregation: 'pc95', metric: '@duration' }, search: { query: llm('@parent_id:* @name:minimax.tts') } },
                  ],
                  response_format: 'timeseries',
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
                    { data_source: 'llm_observability', name: 'tts_err', indexes: ['llmobs'], compute: { aggregation: 'count' }, search: { query: llm('@parent_id:* @name:minimax.tts @status:error') } },
                  ],
                  response_format: 'scalar',
                  formulas: [{ formula: 'tts_err' }],
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
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 7: Stream Reliability
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'Stream Reliability — SSE',
        widgets: [
          {
            definition: {
              type: 'timeseries',
              title: 'Chat Streams: Started vs Errors',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    { name: 'started', data_source: 'metrics', query: `sum:trace.express.request.hits{service:$service,env:$env,resource_name:post_/api/chat}.as_count()` },
                    { name: 'errs', data_source: 'metrics', query: `sum:trace.express.request.errors{service:$service,env:$env,resource_name:post_/api/chat}.as_count()` },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 8: Tool Spans
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'Tool Spans — Usage & Errors',
        widgets: [
          {
            definition: {
              type: 'query_table',
              title: 'Tool Span Summary',
              title_size: '16',
              title_align: 'left',
              time: LIVE_1H,
              requests: [
                {
                  queries: [
                    { data_source: 'llm_observability', name: 'q1', indexes: ['llmobs'], compute: { aggregation: 'count' }, group_by: [{ facet: '@name', limit: 30, sort: { order: 'desc', aggregation: 'count' } }], search: { query: llm('@parent_id:* @meta.span.kind:tool') } },
                    { data_source: 'llm_observability', name: 'q2', indexes: ['llmobs'], compute: { aggregation: 'avg', metric: '@duration' }, group_by: [{ facet: '@name', limit: 30, sort: { order: 'desc', aggregation: 'count' } }], search: { query: llm('@parent_id:* @meta.span.kind:tool') } },
                    { data_source: 'llm_observability', name: 'q3', indexes: ['llmobs'], compute: { aggregation: 'count' }, group_by: [{ facet: '@name', limit: 30, sort: { order: 'desc', aggregation: 'count' } }], search: { query: llm('@parent_id:* @meta.span.kind:tool @status:error') } },
                  ],
                  response_format: 'scalar',
                  sort: { count: 90, order_by: [{ type: 'formula', index: 0, order: 'desc' }] },
                  formulas: [
                    { cell_display_mode: 'bar', alias: 'Usage Count', number_format: { unit: { type: 'custom_unit_label', label: 'calls' } }, formula: 'q1' },
                    { cell_display_mode: 'trend', alias: 'Avg Duration', formula: 'q2' },
                    { cell_display_mode: 'bar', alias: 'Errors', conditional_formats: [{ comparator: '>', value: 0, palette: 'white_on_red' }, { comparator: '<=', value: 0, palette: 'white_on_green' }], formula: 'q3' },
                  ],
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 9: LLM Span Detail
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'LLM Span Detail — Prompts & Tokens',
        widgets: [
          {
            definition: {
              type: 'list_stream',
              title: 'LLM & Embedding Spans (by cost)',
              title_size: '16',
              title_align: 'left',
              time: LIVE_1H,
              requests: [
                {
                  response_format: 'event_list',
                  query: {
                    data_source: 'llm_observability_stream',
                    query_string: '@ml_app:ai-dm @event_type:span @parent_id:* (@meta.span.kind:llm OR @meta.span.kind:embedding)',
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

    // ═══════════════════════════════════════════════════════════════
    // Section 10: Cache Performance
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
        title: 'Cache Performance — TTS / Lore / Music',
        widgets: [
          // TTS cache hit/miss over time
          {
            definition: {
              type: 'timeseries',
              title: 'TTS Cache — Hits vs Misses vs API Calls',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:tts.cache_hit' }, indexes: ['*'] },
                    { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:tts.cache_miss' }, indexes: ['*'] },
                    { name: 'api_calls', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:tts.api_call_completed' }, indexes: ['*'] },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
          // Lore cache hit/miss over time
          {
            definition: {
              type: 'timeseries',
              title: 'Lore Cache — Hits vs Misses',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:rag.cache_hit' }, indexes: ['*'] },
                    { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:rag.cache_miss' }, indexes: ['*'] },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
          // Music cache hit/miss over time
          {
            definition: {
              type: 'timeseries',
              title: 'Music Cache — Hits vs Misses',
              time: LIVE_1H,
              requests: [
                {
                  display_type: 'bars',
                  queries: [
                    { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:music.cache_hit' }, indexes: ['*'] },
                    { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:ai-dungeon-master @event:music.cache_miss' }, indexes: ['*'] },
                  ],
                  response_format: 'timeseries',
                },
              ],
            },
          },
          // Cache hit ratio summary
          {
            definition: {
              type: 'query_table',
              title: 'Cache Hit Ratios',
              time: LIVE_1H,
              requests: [
                {
                  queries: [
                    { name: 'tts_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:ai-dungeon-master (@event:tts.cache_hit OR @event:tts.cache_miss)' }, indexes: ['*'] },
                    { name: 'rag_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:ai-dungeon-master (@event:rag.cache_hit OR @event:rag.cache_miss)' }, indexes: ['*'] },
                    { name: 'music_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:ai-dungeon-master (@event:music.cache_hit OR @event:music.cache_miss)' }, indexes: ['*'] },
                  ],
                  response_format: 'scalar',
                  formulas: [
                    { alias: 'TTS Events', formula: 'tts_hits' },
                    { alias: 'Lore Events', formula: 'rag_hits' },
                    { alias: 'Music Events', formula: 'music_hits' },
                  ],
                },
              ],
            },
          },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 11: Runtime Health
    // ═══════════════════════════════════════════════════════════════
    {
      definition: {
        type: 'group',
        layout_type: 'ordered',
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
                  display_type: 'line',
                  queries: [
                    { name: 'health', data_source: 'metrics', query: `avg:trace.express.request{service:$service,env:$env,resource_name:get_/health}` },
                  ],
                  response_format: 'timeseries',
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
                  response_format: 'event_list',
                  query: {
                    data_source: 'trace_stream',
                    query_string: 'service:$service env:$env',
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
  notify_list: [],
  reflow_type: 'auto',
};

// ── API call ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  const base = `https://api.${DD_SITE}/api/v1/dashboard`;
  const headers = {
    'Content-Type': 'application/json',
    'DD-API-KEY': DD_API_KEY!,
    'DD-APPLICATION-KEY': DD_APP_KEY!,
  };

  if (DD_DASHBOARD_ID) {
    const res = await fetch(`${base}/${DD_DASHBOARD_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(dashboard),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error('Update failed:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
    console.log('Dashboard updated:', data.url);
  } else {
    const res = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(dashboard),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error('Create failed:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
    console.log('Dashboard created:', data.url);
    console.log('To update this dashboard later, set DD_DASHBOARD_ID=' + data.id);
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
