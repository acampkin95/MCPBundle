import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { logger } from '../../utils/logger.js';
import type { Capability } from '../../config/capabilities.js';

export interface ServerCapabilities {
  readonly serverId: string;
  readonly serverType: 'mcp-server';
  readonly hostname: string;
  readonly capabilities: readonly Capability[];
  readonly tools: readonly string[];
  readonly version: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RegistrationResponse {
  readonly registered: boolean;
  readonly serverId: string;
  readonly assignedCapabilities: readonly string[];
  readonly heartbeatIntervalMs: number;
  readonly registeredAt: string;
}

export interface HeartbeatResponse {
  readonly acknowledged: boolean;
  readonly nextHeartbeatMs: number;
  readonly commandsAvailable: number;
}

/**
 * AutoDiscoveryService handles MCP server registration and heartbeat
 * with central registry for distributed command routing.
 *
 * **Flow**:
 * 1. On startup: Register with central registry (POST /api/v1/servers/register)
 * 2. Receive server_id and heartbeat interval
 * 3. Start heartbeat worker (default every 30s)
 * 4. Central registry routes commands based on capability matching
 *
 * **Capabilities Advertised**:
 * - local-shell, local-sudo (always available)
 * - macos-wireless (if running on macOS)
 * - ssh-linux, ssh-mac (if SSH available)
 * - Tool-specific capabilities (network diagnostics, firewall, etc.)
 */
export class AutoDiscoveryService {
  private readonly serverId: string;
  private serverCapabilities: ServerCapabilities;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private registryEndpoint?: string;
  private heartbeatIntervalMs = 30000; // Default 30 seconds
  private isRegistered = false;

  public constructor(
    capabilities: readonly Capability[],
    tools: readonly string[],
    registryEndpoint?: string
  ) {
    this.serverId = process.env.IT_MCP_SERVER_ID ?? randomUUID();
    this.registryEndpoint = registryEndpoint ?? process.env.IT_MCP_REGISTRY_URL;

    this.serverCapabilities = {
      serverId: this.serverId,
      serverType: 'mcp-server',
      hostname: hostname(),
      capabilities,
      tools,
      version: this.getVersion(),
      metadata: {
        platform: process.platform,
        nodeVersion: process.version,
        startedAt: new Date().toISOString(),
      },
    };

    logger.info('AutoDiscoveryService initialized', {
      serverId: this.serverId,
      hostname: this.serverCapabilities.hostname,
      capabilities: capabilities.length,
      tools: tools.length,
    });
  }

  /**
   * Register with central registry on startup
   */
  public async register(): Promise<RegistrationResponse> {
    if (!this.registryEndpoint) {
      logger.warn('Registry endpoint not configured, skipping registration');
      return {
        registered: false,
        serverId: this.serverId,
        assignedCapabilities: [],
        heartbeatIntervalMs: 0,
        registeredAt: new Date().toISOString(),
      };
    }

    try {
      logger.info('Registering with central registry', {
        endpoint: this.registryEndpoint,
        serverId: this.serverId,
      });

      // TODO: Implement actual HTTP POST to registry
      // const response = await fetch(`${this.registryEndpoint}/api/v1/servers/register`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(this.serverCapabilities)
      // });
      //
      // const data = await response.json();
      // this.heartbeatIntervalMs = data.heartbeatIntervalMs;
      // this.isRegistered = true;

      // STUB: Return mock registration response
      logger.warn('Registration not yet implemented - using stub');
      const stubResponse: RegistrationResponse = {
        registered: false,
        serverId: this.serverId,
        assignedCapabilities: [...this.serverCapabilities.capabilities],
        heartbeatIntervalMs: 30000,
        registeredAt: new Date().toISOString(),
      };

      return stubResponse;
    } catch (error) {
      logger.error('Registration failed', { error });
      throw new Error(`Failed to register with registry: ${error}`);
    }
  }

  /**
   * Start heartbeat worker
   */
  public startHeartbeat(): void {
    if (this.heartbeatTimer) {
      logger.warn('Heartbeat already running');
      return;
    }

    if (!this.registryEndpoint) {
      logger.warn('Registry endpoint not configured, heartbeat disabled');
      return;
    }

    logger.info('Starting heartbeat', { intervalMs: this.heartbeatIntervalMs });

    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat worker
   */
  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('Heartbeat stopped');
    }
  }

  /**
   * Send heartbeat to registry
   */
  private async sendHeartbeat(): Promise<HeartbeatResponse> {
    if (!this.registryEndpoint) {
      return {
        acknowledged: false,
        nextHeartbeatMs: this.heartbeatIntervalMs,
        commandsAvailable: 0,
      };
    }

    try {
      // TODO: Implement actual HTTP POST to registry
      // const response = await fetch(`${this.registryEndpoint}/api/v1/servers/${this.serverId}/heartbeat`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     serverId: this.serverId,
      //     timestamp: new Date().toISOString(),
      //     status: 'healthy',
      //     load: process.cpuUsage(),
      //     memory: process.memoryUsage()
      //   })
      // });
      //
      // return await response.json();

      // STUB: Return mock heartbeat response
      logger.debug('Heartbeat sent (stub)', { serverId: this.serverId });
      return {
        acknowledged: true,
        nextHeartbeatMs: this.heartbeatIntervalMs,
        commandsAvailable: 0,
      };
    } catch (error) {
      logger.error('Heartbeat failed', { error });
      return {
        acknowledged: false,
        nextHeartbeatMs: this.heartbeatIntervalMs,
        commandsAvailable: 0,
      };
    }
  }

  /**
   * Get server capabilities for advertisement
   */
  public getCapabilities(): ServerCapabilities {
    return { ...this.serverCapabilities };
  }

  /**
   * Update capabilities dynamically (e.g., SSH becomes available)
   */
  public updateCapabilities(capabilities: readonly Capability[]): void {
    this.serverCapabilities = {
      ...this.serverCapabilities,
      capabilities,
    };

    logger.info('Capabilities updated', {
      capabilities: capabilities.length,
    });

    // TODO: Notify registry of capability changes
    // if (this.isRegistered && this.registryEndpoint) {
    //   void this.notifyCapabilityChange();
    // }
  }

  /**
   * Deregister from central registry on shutdown
   */
  public async deregister(): Promise<void> {
    if (!this.registryEndpoint || !this.isRegistered) {
      logger.info('Not registered, skipping deregistration');
      return;
    }

    try {
      logger.info('Deregistering from central registry');

      // TODO: Implement actual HTTP DELETE to registry
      // await fetch(`${this.registryEndpoint}/api/v1/servers/${this.serverId}`, {
      //   method: 'DELETE'
      // });

      this.isRegistered = false;
      logger.info('Deregistered successfully');
    } catch (error) {
      logger.error('Deregistration failed', { error });
    }
  }

  /**
   * Get version from package.json
   */
  private getVersion(): string {
    // TODO: Read from package.json
    return '0.1.0';
  }

  /**
   * Cleanup: stop heartbeat and deregister
   */
  public async destroy(): Promise<void> {
    this.stopHeartbeat();
    await this.deregister();
    logger.info('AutoDiscoveryService destroyed');
  }
}
