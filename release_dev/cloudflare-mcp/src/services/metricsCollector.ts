import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';
import type { MeshAgentRecord } from './meshRegistry.js';

export class MeshMetricsCollector {
  private readonly registry: Registry;
  private readonly statusGauge: Gauge<'status'>;
  private readonly staleGauge: Gauge;
  private readonly heartbeatGauge: Gauge<'agent'>;

  public constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.statusGauge = new Gauge({
      name: 'cloudflare_mcp_agents_total',
      help: 'Number of agents grouped by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.staleGauge = new Gauge({
      name: 'cloudflare_mcp_agents_stale_total',
      help: 'Number of agents considered stale by the heartbeat monitor',
      registers: [this.registry],
    });

    this.heartbeatGauge = new Gauge({
      name: 'cloudflare_mcp_agent_last_heartbeat_seconds',
      help: 'Seconds since last heartbeat per agent',
      labelNames: ['agent'],
      registers: [this.registry],
    });
  }

  public updateAgents(agents: MeshAgentRecord[], staleThresholdMs: number): void {
    const now = Date.now();
    const statusCounts: Record<string, number> = {};
    let staleCount = 0;

    this.heartbeatGauge.reset();

    for (const agent of agents) {
      statusCounts[agent.status] = (statusCounts[agent.status] ?? 0) + 1;
      const ageSeconds = (now - agent.lastHeartbeat.getTime()) / 1000;
      this.heartbeatGauge.labels(agent.agentName).set(ageSeconds);
      if (ageSeconds * 1000 > staleThresholdMs) {
        staleCount += 1;
      }
    }

    for (const status of ['active', 'inactive', 'mac_verification_required']) {
      this.statusGauge.labels(status).set(statusCounts[status] ?? 0);
    }

    this.staleGauge.set(staleCount);
  }

  public async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  public get contentType(): string {
    return this.registry.contentType;
  }
}
