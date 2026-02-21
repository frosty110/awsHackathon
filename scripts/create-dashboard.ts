// IMPORTANT: Run this script AFTER generating real trace data in Datadog.
// The trace_stream widget requires at least one span from the service to have been emitted
// before the dashboard will show live data. Run the 3-turn demo flow first, then run this script.
//
// Usage: DD_API_KEY=<api-key> DD_APP_KEY=<app-key> npm run create-dashboard
// DD_APP_KEY is a Datadog Application Key — create one at:
//   Datadog > Organization Settings > Application Keys > New Key

import { client as ddClient, v1 } from '@datadog/datadog-api-client';

async function main(): Promise<void> {
  // createConfiguration() reads DD_API_KEY and DD_APP_KEY from environment automatically
  const configuration = ddClient.createConfiguration();
  const dashApi = new v1.DashboardsApi(configuration);

  const dashboard: v1.Dashboard = {
    title: '[Hackathon] AI Dungeon Master - LLM Observability',
    layoutType: 'ordered',
    templateVariables: [
      { name: 'env', defaults: ['development'] },
      { name: 'service', defaults: ['server'] },
    ],
    widgets: [
      // Widget 1: Bedrock Token Usage (timeseries, bars)
      // Note: The exact metric name for Bedrock ConverseStream token counts may differ.
      // After the smoke test, check Datadog Metrics Explorer for `aws.bedrockruntime` or
      // `trace.aws.bedrockruntime` and update this query with the confirmed metric name.
      {
        definition: {
          type: 'timeseries',
          title: 'Bedrock Token Usage',
          requests: [
            {
              displayType: 'bars',
              queries: [
                {
                  name: 'q1',
                  dataSource: 'metrics',
                  query:
                    'sum:trace.aws.bedrockruntime.converse_stream{service:$service,env:$env}.as_count()',
                },
              ],
              responseFormat: 'timeseries',
            },
          ],
        },
      },
      // Widget 2: Chat Request Latency p95 (timeseries, line)
      {
        definition: {
          type: 'timeseries',
          title: 'Chat Request Latency p95',
          requests: [
            {
              displayType: 'line',
              queries: [
                {
                  name: 'q1',
                  dataSource: 'metrics',
                  query:
                    'p95:trace.express.request{service:$service,env:$env,resource_name:POST_/chat}',
                },
              ],
              responseFormat: 'timeseries',
            },
          ],
        },
      },
      // Widget 3: Live Traces (list_stream)
      {
        definition: {
          type: 'list_stream',
          title: 'Live Traces',
          requests: [
            {
              responseFormat: 'event_list',
              query: {
                dataSource: 'trace_stream',
                queryString: 'service:$service env:$env',
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
  };

  const result = await dashApi.createDashboard({ body: dashboard });
  console.log('Dashboard created:', result.url);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('403')) {
    console.error(
      '403 Forbidden — ensure DD_APP_KEY is set (Application Key, not API Key).\n' +
        'Create one at: Datadog > Organization Settings > Application Keys > New Key'
    );
  } else {
    console.error('Dashboard creation failed:', message);
  }
  process.exit(1);
});
