/**
 * MCP Orchestrator API Client
 *
 * Provides integration with mcp-orchestrator v2.0 HTTP API
 * Includes agent registry monitoring, health checks, and metrics
 */

import { logger } from './logger';
import { retryWithBackoff } from '@mcp-bundle/resilience';

export interface OrchestratorHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    postgres?: { status: string; latency_ms?: number };
    redis?: { status: string; latency_ms?: number };
    keycloak?: { status: string; latency_ms?: number };
  };
}

export interface AgentRegistration {
  agentId: string;
  hostname: string;
  capabilities: string[];
  tools: string[];
  status: 'active' | 'inactive' | 'stale';
  lastHeartbeat: string;
  registeredAt: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestratorMetrics {
  agents: {
    total: number;
    active: number;
    inactive: number;
    stale: number;
  };
  commandQueue?: {
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  healthChecks: {
    lastCheck: string;
    successRate: number;
  };
}

export class OrchestratorClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config?: {
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
  }) {
    this.baseUrl = config?.baseUrl ?? process.env.ORCHESTRATOR_API_URL ?? 'http://localhost:9090';
    this.timeout = config?.timeout ?? 10000;
    this.maxRetries = config?.maxRetries ?? 3;
  }

  /**
   * Get orchestrator health status
   */
  async getHealth(): Promise<OrchestratorHealth> {
    return this.fetchWithRetry<OrchestratorHealth>('/health');
  }

  /**
   * Get all registered agents
   */
  async getAgents(): Promise<AgentRegistration[]> {
    // Note: This endpoint may not exist yet in orchestrator
    // We'll implement a fallback to health data
    try {
      return await this.fetchWithRetry<AgentRegistration[]>('/api/agents');
    } catch (error) {
      logger.warn('Agent registry endpoint not available, using fallback', { error });
      return [];
    }
  }

  /**
   * Get orchestrator metrics
   */
  async getMetrics(): Promise<OrchestratorMetrics> {
    try {
      return await this.fetchWithRetry<OrchestratorMetrics>('/api/metrics');
    } catch (error) {
      logger.warn('Metrics endpoint not available, using health data', { error });
      const health = await this.getHealth();

      // Fallback metrics from health data
      return {
        agents: {
          total: 0,
          active: 0,
          inactive: 0,
          stale: 0,
        },
        healthChecks: {
          lastCheck: health.timestamp,
          successRate: health.status === 'healthy' ? 1.0 : health.status === 'degraded' ? 0.5 : 0.0,
        },
      };
    }
  }

  /**
   * Generic fetch with retry logic
   */
  private async fetchWithRetry<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...options?.headers,
            },
          });

          if (!response.ok) {
            throw new Error(`Orchestrator API error: ${response.status} ${response.statusText}`);
          }

          return (await response.json()) as T;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxAttempts: this.maxRetries,
        initialDelayMs: 100,
        maxDelayMs: 2000,
        backoffMultiplier: 2,
      }
    );
  }
}

/**
 * Singleton instance for easy access
 */
export const orchestratorClient = new OrchestratorClient();
