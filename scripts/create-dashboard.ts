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
    description: 'AI Dungeon Master LLM pipeline observability for AWS x Anthropic x Datadog Hackathon',
    layoutType: 'ordered',
    templateVariables: [
      { name: 'env', defaults: ['hackathon'] },
      { name: 'service', defaults: ['ai-dungeon-master'] },
    ],
    widgets: [
      // Widget 1: Request Hits (timeseries, bars)
      {
        definition: {
          type: 'timeseries',
          title: 'Request Hits',
          requests: [
            {
              displayType: 'bars',
              queries: [
                {
                  name: 'q1',
                  dataSource: 'metrics',
                  query:
                    'sum:trace.express.request.hits{service:$service,env:$env}.as_count()',
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
                    'p95:trace.express.request{service:$service,env:$env}',
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
                queryString: 'service:$service env:$env @ml_app:ai-dm',
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

  // Update existing dashboard if ID is provided, otherwise create new
  const dashboardId = process.env.DD_DASHBOARD_ID;
  if (dashboardId) {
    const result = await dashApi.updateDashboard({ dashboardId, body: dashboard });
    console.log('Dashboard updated:', result.url);
  } else {
    const result = await dashApi.createDashboard({ body: dashboard });
    console.log('Dashboard created:', result.url);
    console.log('To update this dashboard later, set DD_DASHBOARD_ID=' + result.id);
  }
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
