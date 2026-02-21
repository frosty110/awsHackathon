import { client as ddClient, v1 } from '@datadog/datadog-api-client';

async function main() {
  const config = ddClient.createConfiguration();
  const api = new v1.MetricsApi(config);
  const res = await api.listActiveMetrics({ from: Math.floor(Date.now() / 1000) - 3600 });
  const matches = (res.metrics || []).filter(
    (m) => m.includes('bedrock') || m.includes('express') || m.includes('dungeon') || m.includes('ai-dungeon')
  );
  console.log(matches.length ? matches.join('\n') : 'No matching metrics found');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
