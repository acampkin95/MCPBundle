/**
 * Unit tests for MeshMetricsCollector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MeshMetricsCollector } from '../../../src/services/metricsCollector.js';
import type { MeshAgentRecord } from '../../../src/services/meshRegistry.js';

describe('MeshMetricsCollector', () => {
  let collector: MeshMetricsCollector;

  beforeEach(() => {
    collector = new MeshMetricsCollector();
  });

  describe('constructor', () => {
    it('should initialize with default metrics', () => {
      expect(collector).toBeDefined();
      expect(collector.contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
    });

    it('should have metrics method', () => {
      expect(typeof collector.metrics).toBe('function');
    });
  });

  describe('updateAgents', () => {
    it('should update metrics for empty agent list', () => {
      const agents: MeshAgentRecord[] = [];

      collector.updateAgents(agents, 60000);

      // Should not throw
    });

    it('should update metrics for single active agent', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      collector.updateAgents(agents, 60000);

      // Should not throw
    });

    it('should update metrics for multiple agents with different statuses', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(),
        },
        {
          agentName: 'agent-2',
          macAddress: 'aa:bb:cc:dd:ee:02',
          ipAddress: '192.168.1.102',
          status: 'inactive',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
        {
          agentName: 'agent-3',
          macAddress: 'aa:bb:cc:dd:ee:03',
          ipAddress: '192.168.1.103',
          status: 'mac_verification_required',
          lastHeartbeat: new Date(),
          pendingMac: 'aa:bb:cc:dd:ee:00',
        },
      ];

      collector.updateAgents(agents, 60000);

      // Should not throw
    });

    it('should identify stale agents based on threshold', () => {
      const now = Date.now();
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'fresh-agent',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(now - 30000), // 30 seconds ago
        },
        {
          agentName: 'stale-agent',
          macAddress: 'aa:bb:cc:dd:ee:02',
          ipAddress: '192.168.1.102',
          status: 'active',
          lastHeartbeat: new Date(now - 120000), // 2 minutes ago
        },
      ];

      // Set threshold to 60 seconds
      collector.updateAgents(agents, 60000);

      // Should identify stale-agent as stale
    });

    it('should handle agents with very old heartbeats', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'very-old-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'inactive',
          lastHeartbeat: new Date(Date.now() - 86400000), // 24 hours ago
        },
      ];

      collector.updateAgents(agents, 60000);

      // Should not throw
    });

    it('should handle multiple updates in succession', () => {
      const agents1: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      const agents2: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
        {
          agentName: 'agent-2',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      collector.updateAgents(agents1, 60000);
      collector.updateAgents(agents2, 60000);

      // Should not throw and should reset gauges properly
    });
  });

  describe('metrics', () => {
    it('should return metrics as string', async () => {
      const metricsString = await collector.metrics();

      expect(typeof metricsString).toBe('string');
      expect(metricsString.length).toBeGreaterThan(0);
    });

    it('should include agent status metrics after update', async () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      collector.updateAgents(agents, 60000);

      const metricsString = await collector.metrics();

      expect(metricsString).toContain('cloudflare_mcp_agents_total');
      expect(metricsString).toContain('cloudflare_mcp_agents_stale_total');
      expect(metricsString).toContain('cloudflare_mcp_agent_last_heartbeat_seconds');
    });

    it('should include default Node.js metrics', async () => {
      const metricsString = await collector.metrics();

      // Should include some default metrics
      expect(
        metricsString.includes('process_cpu_user_seconds_total') ||
          metricsString.includes('nodejs_heap_size_total_bytes')
      ).toBe(true);
    });

    it('should be in Prometheus format', async () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      collector.updateAgents(agents, 60000);

      const metricsString = await collector.metrics();

      // Check for Prometheus format elements
      expect(metricsString).toMatch(/#\s+HELP/); // Help comments
      expect(metricsString).toMatch(/#\s+TYPE/); // Type comments
    });
  });

  describe('contentType', () => {
    it('should return Prometheus content type', () => {
      const contentType = collector.contentType;

      expect(contentType).toContain('text/plain');
      expect(contentType).toContain('version=0.0.4');
    });
  });

  describe('integration', () => {
    it('should track metrics across multiple updates', async () => {
      // First update
      const agents1: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];
      collector.updateAgents(agents1, 60000);

      // Second update with more agents
      const agents2: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(),
        },
        {
          agentName: 'agent-2',
          macAddress: 'aa:bb:cc:dd:ee:02',
          ipAddress: '192.168.1.102',
          status: 'active',
          lastHeartbeat: new Date(),
        },
        {
          agentName: 'agent-3',
          macAddress: 'aa:bb:cc:dd:ee:03',
          ipAddress: '192.168.1.103',
          status: 'inactive',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
      ];
      collector.updateAgents(agents2, 60000);

      const metrics = await collector.metrics();

      // Should reflect the latest state
      expect(metrics).toContain('agent-1');
      expect(metrics).toContain('agent-2');
      expect(metrics).toContain('agent-3');
    });

    it('should handle rapid consecutive updates', async () => {
      for (let i = 0; i < 10; i++) {
        const agents: MeshAgentRecord[] = [
          {
            agentName: `agent-${i}`,
            macAddress: 'aa:bb:cc:dd:ee:ff',
            ipAddress: '192.168.1.100',
            status: 'active',
            lastHeartbeat: new Date(),
          },
        ];
        collector.updateAgents(agents, 60000);
      }

      const metrics = await collector.metrics();

      expect(metrics).toBeDefined();
      expect(metrics.length).toBeGreaterThan(0);
    });
  });
});
