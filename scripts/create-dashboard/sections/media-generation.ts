import { LIVE_1H, llm } from '../helpers.js';

export const mediaGeneration = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Media Generation — Music & Video',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Music Generation Latency (avg / p95)',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'line',
              formulas: [
                { alias: 'avg', formula: 'avg_music' },
                { alias: 'p95', formula: 'p95_music' },
              ],
              queries: [
                { data_source: 'llm_observability', name: 'avg_music', indexes: ['llmobs'], compute: { aggregation: 'avg', metric: '@duration' }, search: { query: llm('@parent_id:* @name:minimax.music_generation') } },
                { data_source: 'llm_observability', name: 'p95_music', indexes: ['llmobs'], compute: { aggregation: 'pc95', metric: '@duration' }, search: { query: llm('@parent_id:* @name:minimax.music_generation') } },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Music Generation Failures',
          time: LIVE_1H,
          requests: [
            {
              queries: [
                { data_source: 'llm_observability', name: 'music_err', indexes: ['llmobs'], compute: { aggregation: 'count' }, search: { query: llm('@parent_id:* @name:minimax.music_generation @status:error') } },
              ],
              response_format: 'scalar',
              formulas: [{ formula: 'music_err' }],
              conditional_formats: [
                { comparator: '>', value: 0, palette: 'white_on_red' },
                { comparator: '<=', value: 0, palette: 'white_on_green' },
              ],
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Video Generation Latency (avg / p95)',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'line',
              formulas: [
                { alias: 'avg', formula: 'avg_video' },
                { alias: 'p95', formula: 'p95_video' },
              ],
              queries: [
                { data_source: 'llm_observability', name: 'avg_video', indexes: ['llmobs'], compute: { aggregation: 'avg', metric: '@duration' }, search: { query: llm('@parent_id:* @name:minimax.video_generation') } },
                { data_source: 'llm_observability', name: 'p95_video', indexes: ['llmobs'], compute: { aggregation: 'pc95', metric: '@duration' }, search: { query: llm('@parent_id:* @name:minimax.video_generation') } },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Video Generation Failures',
          time: LIVE_1H,
          requests: [
            {
              queries: [
                { data_source: 'llm_observability', name: 'video_err', indexes: ['llmobs'], compute: { aggregation: 'count' }, search: { query: llm('@parent_id:* @name:minimax.video_generation @status:error') } },
              ],
              response_format: 'scalar',
              formulas: [{ formula: 'video_err' }],
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
