import { LIVE_1H } from '../helpers.js';

export const streamReliability = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Stream Reliability — SSE',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Chat Streams: Started vs Errors',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                { name: 'started', data_source: 'metrics', query: `sum:trace.express.request.hits{service:$service,env:$env,resource_name:post_/api/chat}.as_count()` },
                { name: 'errs', data_source: 'metrics', query: `sum:trace.express.request.errors{service:$service,env:$env,resource_name:post_/api/chat}.as_count()` },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
    ],
  },
};
