/**
 * Agent Registry v2.0
 *
 * Advanced agent lifecycle management with:
 * - Agent metadata tracking
 * - Health monitoring and heartbeat detection
 * - Status management (online/offline/degraded)
 * - Capability-based agent discovery
 * - Metrics collection per agent
 */

import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import type { AgentConfig } from '../config/orchestrator.config.js';

export type AgentStatus = 'online' | 'offline' | 'degraded';
export type AgentType = 'mcp-server' | 'monitoring' | 'automation' | 'orchestrator';

export interface AgentMetrics {
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastResponseTime?: number;
  p95ResponseTime?: number;
  p99ResponseTime?: number;
}

export interface AgentMetadata {
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly healthEndpoint?: string;
  status: AgentStatus;
  lastHeartbeat: Date;
  readonly registeredAt: Date;
  uptime: number;
  metrics: AgentMetrics;
  readonly tags?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentRegistrationRequest {
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly healthEndpoint?: string;
  readonly tags?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentHealthResponse {
  readonly agentId: string;
  readonly status: AgentStatus;
  readonly lastHeartbeat: Date;
  readonly uptime: number;
  readonly metrics: AgentMetrics;
}

/**
 * Agent Registry Events
 */
export interface AgentRegistryEvents {
  'agent:registered': (agent: AgentMetadata) => void;
  'agent:unregistered': (agentId: string, reason: string) => void;
  'agent:status_changed': (agentId: string, oldStatus: AgentStatus, newStatus: AgentStatus) => void;
  'agent:heartbeat_failed': (agentId: string, lastHeartbeat: Date) => void;
  'agent:degraded': (agentId: string, reason: string) => void;
  'agent:recovered': (agentId: string) => void;
}

/**
 * Advanced Agent Registry with lifecycle management
 */
export class AgentRegistry extends EventEmitter {
  private readonly agents = new Map<string, AgentMetadata>();
  private readonly config: AgentConfig;
  private heartbeatCheckInterval?: NodeJS.Timeout;
  private readonly responseTimeSamples = new Map<string, number[]>();
  private readonly maxSamples = 100;

  public constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.startHeartbeatMonitoring();
    logger.info('AgentRegistry v2.0 initialized', {
      heartbeatInterval: config.heartbeatInterval,
      heartbeatTimeout: config.heartbeatTimeout,
    });
  }

  /**
   * Register a new agent
   */
  public registerAgent(request: AgentRegistrationRequest): AgentMetadata {
    if (this.agents.has(request.id)) {
      logger.warn('Agent already registered, updating metadata', { agentId: request.id });
      return this.updateAgent(request.id, request);
    }

    const agent: AgentMetadata = {
      ...request,
      status: 'online',
      lastHeartbeat: new Date(),
      registeredAt: new Date(),
      uptime: 0,
      metrics: {
        requestCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
      },
    };

    this.agents.set(request.id, agent);
    this.emit('agent:registered', agent);

    logger.info('Agent registered', {
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      capabilities: agent.capabilities,
    });

    return agent;
  }

  /**
   * Unregister an agent
   */
  public unregisterAgent(agentId: string, reason = 'manual'): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn('Cannot unregister: agent not found', { agentId });
      return false;
    }

    this.agents.delete(agentId);
    this.responseTimeSamples.delete(agentId);
    this.emit('agent:unregistered', agentId, reason);

    logger.info('Agent unregistered', { agentId, reason });
    return true;
  }

  /**
   * Update agent status
   */
  public updateAgentStatus(agentId: string, status: AgentStatus, reason?: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn('Cannot update status: agent not found', { agentId });
      return false;
    }

    const oldStatus = agent.status;
    if (oldStatus === status) {
      return true; // No change
    }

    agent.status = status;
    this.emit('agent:status_changed', agentId, oldStatus, status);

    if (status === 'degraded') {
      this.emit('agent:degraded', agentId, reason ?? 'unknown');
    } else if (status === 'online' && oldStatus === 'degraded') {
      this.emit('agent:recovered', agentId);
    }

    logger.info('Agent status changed', { agentId, oldStatus, newStatus: status, reason });
    return true;
  }

  /**
   * Update agent heartbeat
   */
  public recordHeartbeat(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn('Cannot record heartbeat: agent not found', { agentId });
      return false;
    }

    const now = new Date();
    const wasOffline = agent.status === 'offline';

    agent.lastHeartbeat = now;
    agent.uptime = now.getTime() - agent.registeredAt.getTime();

    // Auto-recover from offline/degraded
    if (agent.status !== 'online') {
      this.updateAgentStatus(agentId, 'online', 'heartbeat_recovered');
    }

    logger.debug('Heartbeat recorded', {
      agentId,
      uptime: agent.uptime,
      wasOffline,
    });

    return true;
  }

  /**
   * Record request metrics for an agent
   */
  public recordRequest(agentId: string, responseTime: number, isError = false): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    agent.metrics.requestCount++;
    if (isError) {
      agent.metrics.errorCount++;
    }

    // Update response time tracking
    agent.metrics.lastResponseTime = responseTime;

    // Track samples for percentile calculation
    let samples = this.responseTimeSamples.get(agentId);
    if (!samples) {
      samples = [];
      this.responseTimeSamples.set(agentId, samples);
    }

    samples.push(responseTime);
    if (samples.length > this.maxSamples) {
      samples.shift(); // Remove oldest
    }

    // Calculate average
    const sum = samples.reduce((acc, val) => acc + val, 0);
    agent.metrics.avgResponseTime = sum / samples.length;

    // Calculate percentiles
    const sorted = [...samples].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    agent.metrics.p95ResponseTime = sorted[p95Index];
    agent.metrics.p99ResponseTime = sorted[p99Index];

    logger.debug('Request recorded', {
      agentId,
      responseTime,
      isError,
      avgResponseTime: agent.metrics.avgResponseTime,
    });
  }

  /**
   * Get agent by ID
   */
  public getAgent(agentId: string): AgentMetadata | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  public getAllAgents(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   */
  public getAgentsByType(type: AgentType): AgentMetadata[] {
    return this.getAllAgents().filter((agent) => agent.type === type);
  }

  /**
   * Get agents by status
   */
  public getAgentsByStatus(status: AgentStatus): AgentMetadata[] {
    return this.getAllAgents().filter((agent) => agent.status === status);
  }

  /**
   * Get healthy agents (online status)
   */
  public getHealthyAgents(): AgentMetadata[] {
    return this.getAgentsByStatus('online');
  }

  /**
   * Get agents by capability
   */
  public getAgentsByCapability(capability: string): AgentMetadata[] {
    return this.getAllAgents().filter((agent) => agent.capabilities.includes(capability));
  }

  /**
   * Get agent health status
   */
  public getAgentHealth(agentId: string): AgentHealthResponse | null {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return {
      agentId: agent.id,
      status: agent.status,
      lastHeartbeat: agent.lastHeartbeat,
      uptime: agent.uptime,
      metrics: agent.metrics,
    };
  }

  /**
   * Find best agent for capability (based on load and health)
   */
  public findBestAgent(capability: string): AgentMetadata | null {
    const candidates = this.getAgentsByCapability(capability).filter(
      (agent) => agent.status === 'online'
    );

    if (candidates.length === 0) {
      return null;
    }

    // Sort by request count (load) ascending
    candidates.sort((a, b) => a.metrics.requestCount - b.metrics.requestCount);

    return candidates[0];
  }

  /**
   * Get registry statistics
   */
  public getStats(): {
    totalAgents: number;
    online: number;
    offline: number;
    degraded: number;
    byType: Record<AgentType, number>;
    totalRequests: number;
    totalErrors: number;
    avgResponseTime: number;
  } {
    const agents = this.getAllAgents();

    const stats = {
      totalAgents: agents.length,
      online: 0,
      offline: 0,
      degraded: 0,
      byType: {
        'mcp-server': 0,
        monitoring: 0,
        automation: 0,
        orchestrator: 0,
      } as Record<AgentType, number>,
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
    };

    let totalResponseTime = 0;
    let agentsWithRequests = 0;

    for (const agent of agents) {
      // Count by status
      stats[agent.status]++;

      // Count by type
      stats.byType[agent.type]++;

      // Aggregate metrics
      stats.totalRequests += agent.metrics.requestCount;
      stats.totalErrors += agent.metrics.errorCount;

      if (agent.metrics.requestCount > 0) {
        totalResponseTime += agent.metrics.avgResponseTime;
        agentsWithRequests++;
      }
    }

    // Calculate average response time across all agents
    stats.avgResponseTime = agentsWithRequests > 0 ? totalResponseTime / agentsWithRequests : 0;

    return stats;
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatCheckInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.heartbeatInterval);

    logger.info('Heartbeat monitoring started', {
      interval: this.config.heartbeatInterval,
    });
  }

  /**
   * Check all agent heartbeats
   */
  private checkHeartbeats(): void {
    const now = new Date();
    const timeoutMs = this.config.heartbeatTimeout;

    for (const [agentId, agent] of this.agents.entries()) {
      const timeSinceHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > timeoutMs) {
        // Agent hasn't sent heartbeat in timeout period
        if (agent.status !== 'offline') {
          this.updateAgentStatus(agentId, 'offline', 'heartbeat_timeout');
          this.emit('agent:heartbeat_failed', agentId, agent.lastHeartbeat);

          logger.warn('Agent heartbeat timeout', {
            agentId,
            timeSinceHeartbeat,
            timeoutMs,
            lastHeartbeat: agent.lastHeartbeat,
          });
        }
      } else if (timeSinceHeartbeat > timeoutMs * 0.8 && agent.status === 'online') {
        // Agent is approaching timeout - mark as degraded
        this.updateAgentStatus(agentId, 'degraded', 'heartbeat_delayed');
      }
    }
  }

  /**
   * Update agent metadata
   */
  private updateAgent(
    agentId: string,
    updates: Partial<AgentRegistrationRequest>
  ): AgentMetadata {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Update mutable fields
    const updated: AgentMetadata = {
      ...agent,
      name: updates.name ?? agent.name,
      version: updates.version ?? agent.version,
      capabilities: updates.capabilities ?? agent.capabilities,
      healthEndpoint: updates.healthEndpoint ?? agent.healthEndpoint,
      tags: updates.tags ?? agent.tags,
      metadata: updates.metadata ?? agent.metadata,
    };

    this.agents.set(agentId, updated);

    logger.info('Agent metadata updated', { agentId });
    return updated;
  }

  /**
   * Stop heartbeat monitoring
   */
  public stop(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = undefined;
    }

    logger.info('AgentRegistry stopped');
  }

  /**
   * Clear all agents (for testing)
   */
  public clear(): void {
    this.agents.clear();
    this.responseTimeSamples.clear();
    logger.info('AgentRegistry cleared');
  }
}
