import { LIVE_1H, SVC_ENV } from '../helpers.js';

export const apiReliability = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'API Reliability — /chat & /narrate',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Request Rate by Endpoint',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                {
                  name: 'hits',
                  data_source: 'metrics',
                  query: `sum:trace.express.request.hits${SVC_ENV} by {resource_name}.as_count()`,
                },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'Error Rate by Endpoint',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'bars',
              queries: [
                {
                  name: 'errors',
                  data_source: 'metrics',
                  query: `sum:trace.express.request.errors${SVC_ENV} by {resource_name}.as_count()`,
                },
              ],
              response_format: 'timeseries',
              style: { palette: 'warm' },
            },
          ],
        },
      },
      {
        definition: {
          type: 'timeseries',
          title: 'p95 Latency by Endpoint',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'line',
              queries: [
                {
                  name: 'p95',
                  data_source: 'metrics',
                  query: `p95:trace.express.request${SVC_ENV} by {resource_name}`,
                },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
    ],
  },
};
