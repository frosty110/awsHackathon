import { LIVE_1H, llm } from '../helpers.js';

export const llmCost = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'LLM Cost — Token Spend',
    widgets: [
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
};
