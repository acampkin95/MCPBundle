/* eslint-disable no-console */
import { fetchPanelData } from '../lib/panelClient.js';

const baseUrl =
  process.env.PANEL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_PANEL_API_BASE_URL ??
  'http://localhost:3003';

async function main() {
  const snapshot = await fetchPanelData(baseUrl);
  console.log('# MCP Panel Snapshot');
  console.log('## Stats');
  for (const [key, value] of Object.entries(snapshot.overview.stats)) {
    console.log(`- ${key}: ${value}`);
  }
  console.log('\n## Credential Fingerprints');
  snapshot.overview.credentialPrintout.forEach((entry) => {
    console.log(`- ${entry.agentName} (${entry.hostname}) -> ${entry.fingerprint}`);
  });
  console.log('\n## Structured Thought Progress');
  console.log(JSON.stringify(snapshot.thoughts.summary.progress, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
