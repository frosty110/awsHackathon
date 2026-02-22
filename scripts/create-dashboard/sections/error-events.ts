import { LIVE_1H } from '../helpers.js';

export const errorEvents = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Error & Capacity Events',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Bedrock Stream Failures',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'failures', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:chat.bedrock_stream_failed' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Queue Overload Events',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'overloads', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:chat.queue_overloaded' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Empty Assistant Responses',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'empty', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:chat.empty_assistant_response' }, indexes: ['*'] },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'query_table',
          title: 'TTS / Music / Video Failure Summary',
          time: LIVE_1H,
          requests: [
            {
              queries: [
                { name: 'tts_fail', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:narrate.tts_generation_failed' }, indexes: ['*'] },
                { name: 'music_fail', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:music.generation_failed' }, indexes: ['*'] },
                { name: 'video_fail', data_source: 'logs', compute: { aggregation: 'count' }, search: { query: 'service:$service @event:video.generation_failed' }, indexes: ['*'] },
              ],
              response_format: 'scalar',
              formulas: [
                { alias: 'TTS Failures', formula: 'tts_fail' },
                { alias: 'Music Failures', formula: 'music_fail' },
                { alias: 'Video Failures', formula: 'video_fail' },
              ],
            },
          ],
        },
      },
    ],
  },
};
