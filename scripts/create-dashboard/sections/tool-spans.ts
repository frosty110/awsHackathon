import { LIVE_1H, llm } from '../helpers.js';

export const toolSpans = {
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
};
