/**
 * MCP Orchestrator Monitoring Dashboard
 *
 * Displays real-time health, agent registry, and metrics from mcp-orchestrator v2.0
 */

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../../authOptions';
import { UserMenu } from '../components/UserMenu';
import { Navigation } from '../components/Navigation';
import { orchestratorClient } from '../../lib/orchestratorClient';
import { MonitoringDashboard } from '../components/MonitoringDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MonitoringPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/monitoring');
  }

  // Fetch initial data server-side
  const [health, agents, metrics] = await Promise.allSettled([
    orchestratorClient.getHealth(),
    orchestratorClient.getAgents(),
    orchestratorClient.getMetrics(),
  ]);

  const initialData = {
    health: health.status === 'fulfilled' ? health.value : null,
    agents: agents.status === 'fulfilled' ? agents.value : [],
    metrics: metrics.status === 'fulfilled' ? metrics.value : null,
    errors: [
      health.status === 'rejected' ? 'Health check failed' : null,
      agents.status === 'rejected' ? 'Agent registry unavailable' : null,
      metrics.status === 'rejected' ? 'Metrics unavailable' : null,
    ].filter(Boolean) as string[],
  };

  return (
    <main>
      <header>
        <h1>MCP Orchestrator Monitoring</h1>
        <p>
          Real-time health monitoring, agent registry, and performance metrics for the MCP
          infrastructure
        </p>
        <UserMenu name={session.user?.name} email={session.user?.email} />
      </header>

      <Navigation />

      <MonitoringDashboard initialData={initialData} />
    </main>
  );
}
