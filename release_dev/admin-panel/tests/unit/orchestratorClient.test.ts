/**
 * Unit Tests for Orchestrator Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorClient } from '../../lib/orchestratorClient';

// Mock fetch globally
global.fetch = vi.fn();

describe('OrchestratorClient', () => {
  let client: OrchestratorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OrchestratorClient({
      baseUrl: 'http://test-orchestrator:9090',
      timeout: 5000,
      maxRetries: 2,
    });
  });

  describe('getHealth', () => {
    it('should fetch health status successfully', async () => {
      const mockHealth = {
        status: 'healthy' as const,
        timestamp: '2025-11-15T00:00:00.000Z',
        services: {
          postgres: { status: 'healthy', latency_ms: 5 },
          redis: { status: 'healthy', latency_ms: 2 },
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      });

      const health = await client.getHealth();

      expect(health).toEqual(mockHealth);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://test-orchestrator:9090/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle failed health check', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(client.getHealth()).rejects.toThrow('Orchestrator API error: 503');
    });

    it('should retry on timeout', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'healthy', timestamp: new Date().toISOString(), services: {} }),
        });

      const health = await client.getHealth();

      expect(health.status).toBe('healthy');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAgents', () => {
    it('should return empty array when endpoint unavailable', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Not found'));

      const agents = await client.getAgents();

      expect(agents).toEqual([]);
    });

    it('should fetch agents successfully', async () => {
      const mockAgents = [
        {
          agentId: 'agent-1',
          hostname: 'server-01',
          capabilities: ['postgres', 'redis'],
          tools: ['query', 'backup'],
          status: 'active' as const,
          lastHeartbeat: '2025-11-15T00:00:00.000Z',
          registeredAt: '2025-11-14T00:00:00.000Z',
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgents,
      });

      const agents = await client.getAgents();

      expect(agents).toEqual(mockAgents);
    });
  });

  describe('getMetrics', () => {
    it('should fetch metrics successfully', async () => {
      const mockMetrics = {
        agents: {
          total: 5,
          active: 4,
          inactive: 1,
          stale: 0,
        },
        healthChecks: {
          lastCheck: '2025-11-15T00:00:00.000Z',
          successRate: 0.98,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetrics,
      });

      const metrics = await client.getMetrics();

      expect(metrics).toEqual(mockMetrics);
    });

    it('should fallback to health data when metrics unavailable', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Metrics not available'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'healthy',
            timestamp: '2025-11-15T00:00:00.000Z',
            services: {},
          }),
        });

      const metrics = await client.getMetrics();

      expect(metrics.agents.total).toBe(0);
      expect(metrics.healthChecks.successRate).toBe(1.0);
    });
  });
});
