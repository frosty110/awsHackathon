import { LIVE_1H } from '../helpers.js';

export const cachePerformance = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Cache Performance — TTS / Lore / Music / Video',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'TTS Cache — Hits vs Misses vs API Calls',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:tts.cache_hit' }, indexes: ['*'] },
                { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:tts.cache_miss' }, indexes: ['*'] },
                { name: 'api_calls', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:tts.api_call_completed' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Lore Cache — Hits vs Misses',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:rag.cache_hit' }, indexes: ['*'] },
                { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:rag.cache_miss' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Music Cache — Hits vs Misses',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:music.cache_hit' }, indexes: ['*'] },
                { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:music.cache_miss' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Video Cache — Hits vs Misses',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'hits', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:video.cache_hit' }, indexes: ['*'] },
                { name: 'misses', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:video.cache_miss' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_table',
          title: 'Cache Hit Ratios',
          time: LIVE_1H,
          requests: [
            {
              queries: [
                { name: 'tts_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:$service (@event:tts.cache_hit OR @event:tts.cache_miss)' }, indexes: ['*'] },
                { name: 'rag_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:$service (@event:rag.cache_hit OR @event:rag.cache_miss)' }, indexes: ['*'] },
                { name: 'music_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:$service (@event:music.cache_hit OR @event:music.cache_miss)' }, indexes: ['*'] },
                { name: 'video_hits', data_source: 'logs', compute: { aggregation: 'count' }, group_by: [{ facet: '@event', limit: 10, sort: { order: 'desc', aggregation: 'count' } }], search: { query: 'service:$service (@event:video.cache_hit OR @event:video.cache_miss)' }, indexes: ['*'] },
              ],
              response_format: 'scalar',
              formulas: [
                { alias: 'TTS Events', formula: 'tts_hits' },
                { alias: 'Lore Events', formula: 'rag_hits' },
                { alias: 'Music Events', formula: 'music_hits' },
                { alias: 'Video Events', formula: 'video_hits' },
              ],
            },
          ],
        },
      },
    ],
  },
};
