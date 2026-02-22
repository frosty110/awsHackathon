import { LIVE_1H } from '../helpers.js';

export const cacheMetrics = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Cache Metrics (DogStatsD) — Real-Time',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Cache Hit Rate by Type',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'hits', data_source: 'metrics', query: 'sum:cache.hit{*} by {cache_type}.as_count()' },
              ],
              response_format: 'timeseries',
              formulas: [{ formula: 'hits', alias: 'Hits' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Cache Miss Rate by Type',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'misses', data_source: 'metrics', query: 'sum:cache.miss{*} by {cache_type}.as_count()' },
              ],
              response_format: 'timeseries',
              formulas: [{ formula: 'misses', alias: 'Misses' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Hit Ratio — TTS',
          time: LIVE_1H,
          autoscale: false,
          precision: 1,
          requests: [
            {
              queries: [
                { name: 'tts_hits', data_source: 'metrics', query: 'sum:cache.hit{cache_type:tts}.as_count()' },
                { name: 'tts_misses', data_source: 'metrics', query: 'sum:cache.miss{cache_type:tts}.as_count()' },
              ],
              response_format: 'scalar',
              formulas: [{ formula: '(tts_hits / (tts_hits + tts_misses)) * 100', alias: 'TTS Hit %' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Hit Ratio — Lore',
          time: LIVE_1H,
          autoscale: false,
          precision: 1,
          requests: [
            {
              queries: [
                { name: 'lore_hits', data_source: 'metrics', query: 'sum:cache.hit{cache_type:lore}.as_count()' },
                { name: 'lore_misses', data_source: 'metrics', query: 'sum:cache.miss{cache_type:lore}.as_count()' },
              ],
              response_format: 'scalar',
              formulas: [{ formula: '(lore_hits / (lore_hits + lore_misses)) * 100', alias: 'Lore Hit %' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Hit Ratio — Music',
          time: LIVE_1H,
          autoscale: false,
          precision: 1,
          requests: [
            {
              queries: [
                { name: 'music_hits', data_source: 'metrics', query: 'sum:cache.hit{cache_type:music}.as_count()' },
                { name: 'music_misses', data_source: 'metrics', query: 'sum:cache.miss{cache_type:music}.as_count()' },
              ],
              response_format: 'scalar',
              formulas: [{ formula: '(music_hits / (music_hits + music_misses)) * 100', alias: 'Music Hit %' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_value',
          title: 'Hit Ratio — Video',
          time: LIVE_1H,
          autoscale: false,
          precision: 1,
          requests: [
            {
              queries: [
                { name: 'video_hits', data_source: 'metrics', query: 'sum:cache.hit{cache_type:video}.as_count()' },
                { name: 'video_misses', data_source: 'metrics', query: 'sum:cache.miss{cache_type:video}.as_count()' },
              ],
              response_format: 'scalar',
              formulas: [{ formula: '(video_hits / (video_hits + video_misses)) * 100', alias: 'Video Hit %' }],
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Cache Hits by Source (Memory vs S3)',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'by_source', data_source: 'metrics', query: 'sum:cache.hit{*} by {source}.as_count()' },
              ],
              response_format: 'timeseries',
              formulas: [{ formula: 'by_source', alias: 'Hits' }],
            },
          ],
        },
      },
    ],
  },
};
