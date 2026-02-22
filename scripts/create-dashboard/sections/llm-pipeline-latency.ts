import { LIVE_1H, llm } from '../helpers.js';

export const llmPipelineLatency = {
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
};
