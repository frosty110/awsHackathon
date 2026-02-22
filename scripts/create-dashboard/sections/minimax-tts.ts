import { LIVE_1H, llm } from '../helpers.js';

export const minimaxTts = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'MiniMax TTS — Narration',
    widgets: [
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
};
