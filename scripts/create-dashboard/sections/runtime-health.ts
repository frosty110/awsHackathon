import { LIVE_1H } from '../helpers.js';

export const runtimeHealth = {
  definition: {
    type: 'group',
    layout_type: 'ordered',
    title: 'Runtime Health',
    widgets: [
      {
        definition: {
          type: 'timeseries',
          title: 'Health Check Latency',
          time: LIVE_1H,
          requests: [
            {
              display_type: 'line',
              queries: [
                { name: 'health', data_source: 'metrics', query: `avg:trace.express.request{service:$service,env:$env,resource_name:get_/health}` },
              ],
              response_format: 'timeseries',
            },
          ],
        },
      },
      {
        definition: {
          type: 'list_stream',
          title: 'Live APM Traces',
          time: LIVE_1H,
          requests: [
            {
              response_format: 'event_list',
              query: {
                data_source: 'trace_stream',
                query_string: 'service:$service env:$env',
              },
              columns: [
                { field: 'resource_name', width: 'auto' },
                { field: '@duration', width: 'auto' },
                { field: 'status', width: 'auto' },
              ],
            },
          ],
        },
      },
    ],
  },
};
