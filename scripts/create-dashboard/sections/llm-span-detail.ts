import { LIVE_1H } from '../helpers.js';

export const llmSpanDetail = {
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
};
