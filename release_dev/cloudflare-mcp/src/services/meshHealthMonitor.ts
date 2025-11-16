import { logger } from '../utils/logger.js';
import type { CloudflareDnsService } from './cloudflareDnsService.js';
import type { MeshRegistryStore } from './meshRegistry.js';

export interface MeshHealthMonitorOptions {
  readonly scanIntervalMs: number;
  readonly offlineGraceMs: number;
}

export class MeshHealthMonitor {
  private timer?: NodeJS.Timeout;

  public constructor(
    private readonly registry: MeshRegistryStore,
    private readonly dnsService: CloudflareDnsService,
    private readonly options: MeshHealthMonitorOptions
  ) {}

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.scan();
    }, this.options.scanIntervalMs).unref();
    logger.info('Mesh health monitor started', {
      scanIntervalMs: this.options.scanIntervalMs,
      offlineGraceMs: this.options.offlineGraceMs,
    });
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public async scan(): Promise<void> {
    const staleAgents = await this.registry.findStaleAgents(this.options.offlineGraceMs);
    if (staleAgents.length === 0) {
      return;
    }

    for (const agent of staleAgents) {
      await this.registry.markAgentInactive(agent.agentName);
      const hostname = this.dnsService.resolveHostname(agent.dnsLabel ?? agent.agentName);
      await this.dnsService.markOffline(hostname);
      logger.warn('Agent marked inactive due to heartbeat timeout', {
        agent: agent.agentName,
        hostname,
        lastHeartbeat: agent.lastHeartbeat.toISOString(),
      });
    }
  }
}
