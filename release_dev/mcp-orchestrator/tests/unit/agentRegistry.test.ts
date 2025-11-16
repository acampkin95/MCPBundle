/**
 * Agent Registry v2.0 Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRegistry, type AgentRegistrationRequest } from '../../src/services/agentRegistry.js';
import type { AgentConfig } from '../../src/config/orchestrator.config.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      heartbeatInterval: 1000,
      heartbeatTimeout: 5000,
      maxRetries: 3,
      staleConnectionTimeout: 10000,
    };
    registry = new AgentRegistry(config);
  });

  afterEach(() => {
    registry.stop();
    registry.clear();
  });

  describe('Agent Registration', () => {
    it('should register a new agent', () => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres', 'redis'],
      };

      const agent = registry.registerAgent(request);

      expect(agent.id).toBe('agent-1');
      expect(agent.name).toBe('Test Agent');
      expect(agent.type).toBe('mcp-server');
      expect(agent.status).toBe('online');
      expect(agent.capabilities).toEqual(['postgres', 'redis']);
    });

    it('should emit agent:registered event', () => {
      const handler = vi.fn();
      registry.on('agent:registered', handler);

      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };

      registry.registerAgent(request);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        id: 'agent-1',
        status: 'online',
      }));
    });

    it('should update existing agent on re-registration', () => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };

      registry.registerAgent(request);

      const updated = registry.registerAgent({
        ...request,
        version: '2.0.0',
      });

      expect(updated.version).toBe('2.0.0');
      expect(registry.getAllAgents().length).toBe(1);
    });
  });

  describe('Agent Unregistration', () => {
    it('should unregister an agent', () => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };

      registry.registerAgent(request);
      const success = registry.unregisterAgent('agent-1');

      expect(success).toBe(true);
      expect(registry.getAgent('agent-1')).toBeUndefined();
    });

    it('should emit agent:unregistered event', () => {
      const handler = vi.fn();
      registry.on('agent:unregistered', handler);

      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };

      registry.registerAgent(request);
      registry.unregisterAgent('agent-1', 'test_reason');

      expect(handler).toHaveBeenCalledWith('agent-1', 'test_reason');
    });

    it('should return false for non-existent agent', () => {
      const success = registry.unregisterAgent('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('Agent Status Management', () => {
    beforeEach(() => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };
      registry.registerAgent(request);
    });

    it('should update agent status', () => {
      const success = registry.updateAgentStatus('agent-1', 'degraded');

      expect(success).toBe(true);
      const agent = registry.getAgent('agent-1');
      expect(agent?.status).toBe('degraded');
    });

    it('should emit status_changed event', () => {
      const handler = vi.fn();
      registry.on('agent:status_changed', handler);

      registry.updateAgentStatus('agent-1', 'offline');

      expect(handler).toHaveBeenCalledWith('agent-1', 'online', 'offline');
    });

    it('should emit degraded event', () => {
      const handler = vi.fn();
      registry.on('agent:degraded', handler);

      registry.updateAgentStatus('agent-1', 'degraded', 'high_latency');

      expect(handler).toHaveBeenCalledWith('agent-1', 'high_latency');
    });

    it('should emit recovered event', () => {
      const handler = vi.fn();
      registry.on('agent:recovered', handler);

      registry.updateAgentStatus('agent-1', 'degraded');
      registry.updateAgentStatus('agent-1', 'online');

      expect(handler).toHaveBeenCalledWith('agent-1');
    });

    it('should not emit event if status unchanged', () => {
      const handler = vi.fn();
      registry.on('agent:status_changed', handler);

      registry.updateAgentStatus('agent-1', 'online');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Heartbeat Management', () => {
    beforeEach(() => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };
      registry.registerAgent(request);
    });

    it('should record heartbeat', () => {
      const agent = registry.getAgent('agent-1');
      const initialHeartbeat = agent!.lastHeartbeat;

      // Wait a bit
      setTimeout(() => {
        registry.recordHeartbeat('agent-1');
        const updated = registry.getAgent('agent-1');
        expect(updated!.lastHeartbeat.getTime()).toBeGreaterThan(initialHeartbeat.getTime());
      }, 10);
    });

    it('should recover from offline on heartbeat', () => {
      registry.updateAgentStatus('agent-1', 'offline');
      registry.recordHeartbeat('agent-1');

      const agent = registry.getAgent('agent-1');
      expect(agent?.status).toBe('online');
    });

    it('should return false for non-existent agent', () => {
      const success = registry.recordHeartbeat('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('Metrics Tracking', () => {
    beforeEach(() => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };
      registry.registerAgent(request);
    });

    it('should record request metrics', () => {
      registry.recordRequest('agent-1', 150, false);

      const agent = registry.getAgent('agent-1');
      expect(agent?.metrics.requestCount).toBe(1);
      expect(agent?.metrics.errorCount).toBe(0);
      expect(agent?.metrics.lastResponseTime).toBe(150);
      expect(agent?.metrics.avgResponseTime).toBe(150);
    });

    it('should record error metrics', () => {
      registry.recordRequest('agent-1', 200, true);

      const agent = registry.getAgent('agent-1');
      expect(agent?.metrics.requestCount).toBe(1);
      expect(agent?.metrics.errorCount).toBe(1);
    });

    it('should calculate average response time', () => {
      registry.recordRequest('agent-1', 100, false);
      registry.recordRequest('agent-1', 200, false);
      registry.recordRequest('agent-1', 300, false);

      const agent = registry.getAgent('agent-1');
      expect(agent?.metrics.avgResponseTime).toBe(200);
    });

    it('should calculate percentiles', () => {
      // Record 100 samples
      for (let i = 1; i <= 100; i++) {
        registry.recordRequest('agent-1', i, false);
      }

      const agent = registry.getAgent('agent-1');
      expect(agent?.metrics.p95ResponseTime).toBeGreaterThan(90);
      expect(agent?.metrics.p99ResponseTime).toBeGreaterThan(95);
    });
  });

  describe('Agent Queries', () => {
    beforeEach(() => {
      const agents: AgentRegistrationRequest[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          type: 'mcp-server',
          version: '1.0.0',
          capabilities: ['postgres', 'redis'],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          type: 'monitoring',
          version: '1.0.0',
          capabilities: ['prometheus'],
        },
        {
          id: 'agent-3',
          name: 'Agent 3',
          type: 'mcp-server',
          version: '1.0.0',
          capabilities: ['postgres'],
        },
      ];

      agents.forEach((agent) => registry.registerAgent(agent));
    });

    it('should get all agents', () => {
      const agents = registry.getAllAgents();
      expect(agents.length).toBe(3);
    });

    it('should get agents by type', () => {
      const mcpAgents = registry.getAgentsByType('mcp-server');
      expect(mcpAgents.length).toBe(2);

      const monitoringAgents = registry.getAgentsByType('monitoring');
      expect(monitoringAgents.length).toBe(1);
    });

    it('should get agents by status', () => {
      registry.updateAgentStatus('agent-1', 'offline');

      const online = registry.getAgentsByStatus('online');
      expect(online.length).toBe(2);

      const offline = registry.getAgentsByStatus('offline');
      expect(offline.length).toBe(1);
    });

    it('should get healthy agents', () => {
      registry.updateAgentStatus('agent-1', 'offline');
      registry.updateAgentStatus('agent-2', 'degraded');

      const healthy = registry.getHealthyAgents();
      expect(healthy.length).toBe(1);
      expect(healthy[0].id).toBe('agent-3');
    });

    it('should get agents by capability', () => {
      const postgresAgents = registry.getAgentsByCapability('postgres');
      expect(postgresAgents.length).toBe(2);

      const redisAgents = registry.getAgentsByCapability('redis');
      expect(redisAgents.length).toBe(1);
    });

    it('should find best agent for capability', () => {
      // Simulate load on agent-1
      for (let i = 0; i < 10; i++) {
        registry.recordRequest('agent-1', 100, false);
      }

      const best = registry.findBestAgent('postgres');
      expect(best?.id).toBe('agent-3'); // Less loaded
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const agents: AgentRegistrationRequest[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          type: 'mcp-server',
          version: '1.0.0',
          capabilities: ['postgres'],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          type: 'monitoring',
          version: '1.0.0',
          capabilities: ['prometheus'],
        },
      ];

      agents.forEach((agent) => registry.registerAgent(agent));
      registry.updateAgentStatus('agent-1', 'offline');
    });

    it('should return correct stats', () => {
      const stats = registry.getStats();

      expect(stats.totalAgents).toBe(2);
      expect(stats.online).toBe(1);
      expect(stats.offline).toBe(1);
      expect(stats.degraded).toBe(0);
      expect(stats.byType['mcp-server']).toBe(1);
      expect(stats.byType.monitoring).toBe(1);
    });

    it('should calculate aggregate metrics', () => {
      registry.recordRequest('agent-1', 100, false);
      registry.recordRequest('agent-2', 200, false);

      const stats = registry.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.avgResponseTime).toBe(150);
    });
  });

  describe('Agent Health', () => {
    beforeEach(() => {
      const request: AgentRegistrationRequest = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'mcp-server',
        version: '1.0.0',
        capabilities: ['postgres'],
      };
      registry.registerAgent(request);
    });

    it('should get agent health', () => {
      const health = registry.getAgentHealth('agent-1');

      expect(health).not.toBeNull();
      expect(health?.agentId).toBe('agent-1');
      expect(health?.status).toBe('online');
      expect(health?.metrics).toBeDefined();
    });

    it('should return null for non-existent agent', () => {
      const health = registry.getAgentHealth('non-existent');
      expect(health).toBeNull();
    });
  });
});
