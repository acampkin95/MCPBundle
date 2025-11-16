import { createHash } from 'node:crypto';
import type { LogEntry, LogSummary } from './logIngestor.js';
import type { MeshAgentRecord } from './meshRegistry.js';

export interface CredentialPrintoutEntry {
  readonly agentName: string;
  readonly hostname: string;
  readonly macAddress: string;
  readonly status: MeshAgentRecord['status'];
  readonly fingerprint: string;
  readonly lastHeartbeat: string;
  readonly lastDnsUpdate?: string;
  readonly heartbeatIntervalMs?: number | null;
  readonly serviceRole?: string | null;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface PanelOverview {
  readonly stats: {
    readonly total: number;
    readonly active: number;
    readonly inactive: number;
    readonly macVerificationRequired: number;
    readonly stale: number;
  };
  readonly agents: MeshAgentRecord[];
  readonly credentialPrintout: CredentialPrintoutEntry[];
  readonly logSummary?: LogSummary;
  readonly securityEvents?: readonly LogEntry[];
}

interface PanelOverviewOptions {
  readonly salt: string;
  readonly staleThresholdMs: number;
  readonly hostnameResolver: (agent: MeshAgentRecord) => string;
}

export function buildPanelOverview(
  agents: MeshAgentRecord[],
  options: PanelOverviewOptions
): PanelOverview {
  const now = Date.now();
  const credentialPrintout = buildCredentialPrintout(agents, options);

  const stats = {
    total: agents.length,
    active: agents.filter((agent) => agent.status === 'active').length,
    inactive: agents.filter((agent) => agent.status === 'inactive').length,
    macVerificationRequired: agents.filter((agent) => agent.status === 'mac_verification_required')
      .length,
    stale: agents.filter((agent) => now - agent.lastHeartbeat.getTime() > options.staleThresholdMs)
      .length,
  };

  return {
    stats,
    agents,
    credentialPrintout,
  };
}

function buildCredentialPrintout(
  agents: MeshAgentRecord[],
  options: PanelOverviewOptions
): CredentialPrintoutEntry[] {
  return agents.map((agent) => {
    const hostname = options.hostnameResolver(agent);
    const fingerprint = createHash('sha256')
      .update(`${agent.macAddress}:${options.salt}`)
      .digest('hex')
      .slice(0, 24);

    return {
      agentName: agent.agentName,
      hostname,
      macAddress: agent.macAddress,
      status: agent.status,
      fingerprint,
      lastHeartbeat: agent.lastHeartbeat.toISOString(),
      lastDnsUpdate: agent.lastDnsUpdate?.toISOString(),
      heartbeatIntervalMs: agent.heartbeatIntervalMs,
      serviceRole: agent.serviceRole,
      metadata: agent.metadata ?? undefined,
    };
  });
}
