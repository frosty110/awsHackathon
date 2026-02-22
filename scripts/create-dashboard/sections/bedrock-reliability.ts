import { LIVE_1H, SVC_ENV } from '../helpers.js';

export const bedrockReliability = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Bedrock Reliability',
    widgets: [
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
};
