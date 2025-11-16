/**
 * Orchestrator Status API Route
 *
 * Proxies requests to the mcp-orchestrator and returns aggregated status
 */

import { NextResponse } from 'next/server';
import { orchestratorClient } from '../../../../lib/orchestratorClient';
import { logger } from '../../../../lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [healthResult, agentsResult, metricsResult] = await Promise.allSettled([
      orchestratorClient.getHealth(),
      orchestratorClient.getAgents(),
      orchestratorClient.getMetrics(),
    ]);

    return NextResponse.json({
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      agents: agentsResult.status === 'fulfilled' ? agentsResult.value : [],
      metrics: metricsResult.status === 'fulfilled' ? metricsResult.value : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch orchestrator status', { error });

    return NextResponse.json(
      {
        error: 'Failed to fetch orchestrator status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
