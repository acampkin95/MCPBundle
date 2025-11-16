/**
 * Unit tests for MeshRegistryStore
 *
 * NOTE: These tests require a running PostgreSQL database.
 * Set TEST_DB_URL environment variable to run these tests.
 * Example: TEST_DB_URL="postgresql://postgres:postgres@localhost:5432/cloudflare_mcp_test" npm test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MeshRegistryStore } from '../../../src/services/meshRegistry.js';
import { Pool } from 'pg';

// Skip all tests if TEST_DB_URL is not set
const shouldSkipTests = !process.env.TEST_DB_URL;

describe.skipIf(shouldSkipTests)('MeshRegistryStore', () => {
  let store: MeshRegistryStore;
  const testDbUrl = process.env.TEST_DB_URL || 'postgresql://postgres:postgres@localhost:5432/cloudflare_mcp_test';

  beforeEach(async () => {
    store = new MeshRegistryStore({
      connectionString: testDbUrl,
      sslMode: 'disable',
    });

    await store.initialize();

    // Clean up test data
    const pool = (store as any).pool as Pool;
    await pool.query('DELETE FROM mesh_agent_events');
    await pool.query('DELETE FROM mesh_agents');
  });

  afterEach(async () => {
    await store.close();
  });

  describe('initialize', () => {
    it('should create tables if they do not exist', async () => {
      const pool = (store as any).pool as Pool;
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('mesh_agents', 'mesh_agent_events')"
      );
      expect(result.rows.length).toBe(2);
    });

    it('should be idempotent', async () => {
      await store.initialize();
      await store.initialize();
      // Should not throw
    });
  });

  describe('recordHeartbeat', () => {
    it('should register new agent', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
        hostname: 'test-host',
        serviceRole: 'worker',
        dnsLabel: 'test-label',
        heartbeatIntervalMs: 60000,
        metadata: { env: 'test' },
      };

      const result = await store.recordHeartbeat(payload);

      expect(result.state).toBe('registered');
      expect(result.allowDnsUpdate).toBe(true);
      expect(result.ipChanged).toBe(true);
      expect(result.record.agentName).toBe('test-agent');
      expect(result.record.macAddress).toBe('aa:bb:cc:dd:ee:ff');
      expect(result.record.ipAddress).toBe('192.168.1.100');
      expect(result.record.status).toBe('active');
    });

    it('should update existing agent heartbeat', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      };

      // First heartbeat
      await store.recordHeartbeat(payload);

      // Second heartbeat
      const result = await store.recordHeartbeat(payload);

      expect(result.state).toBe('updated');
      expect(result.allowDnsUpdate).toBe(true);
      expect(result.ipChanged).toBe(false);
    });

    it('should detect IP change', async () => {
      const payload1 = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      };

      const payload2 = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.101',
      };

      await store.recordHeartbeat(payload1);
      const result = await store.recordHeartbeat(payload2);

      expect(result.ipChanged).toBe(true);
      expect(result.record.ipAddress).toBe('192.168.1.101');
    });

    it('should require MAC verification on MAC change', async () => {
      const payload1 = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      };

      const payload2 = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:00',
        ipAddress: '192.168.1.100',
      };

      await store.recordHeartbeat(payload1);
      const result = await store.recordHeartbeat(payload2);

      expect(result.state).toBe('mac_verification_required');
      expect(result.allowDnsUpdate).toBe(false);
      expect(result.record.status).toBe('mac_verification_required');
      expect(result.record.macAddress).toBe('aa:bb:cc:dd:ee:ff'); // Original MAC
      expect(result.record.pendingMac).toBe('aa:bb:cc:dd:ee:00'); // New MAC
    });

    it('should reactivate inactive agent', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      };

      // Register agent
      await store.recordHeartbeat(payload);

      // Mark inactive
      await store.markAgentInactive('test-agent');

      // Send heartbeat
      const result = await store.recordHeartbeat(payload);

      expect(result.state).toBe('updated');
      expect(result.record.status).toBe('active');
    });
  });

  describe('authorizePendingMac', () => {
    it('should authorize pending MAC change', async () => {
      // Register agent
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      // Trigger MAC change
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:00',
        ipAddress: '192.168.1.100',
      });

      // Authorize
      const result = await store.authorizePendingMac('test-agent');

      expect(result).toBeDefined();
      expect(result!.macAddress).toBe('aa:bb:cc:dd:ee:00');
      expect(result!.pendingMac).toBeUndefined();
      expect(result!.status).toBe('active');
    });

    it('should return undefined if no pending MAC', async () => {
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      const result = await store.authorizePendingMac('test-agent');

      expect(result).toBeUndefined();
    });
  });

  describe('markDnsUpdate', () => {
    it('should update last DNS update timestamp', async () => {
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      await store.markDnsUpdate('test-agent');

      const agent = await store.getAgent('test-agent');
      expect(agent?.lastDnsUpdate).toBeDefined();
    });
  });

  describe('listAgents', () => {
    it('should return empty list when no agents', async () => {
      const agents = await store.listAgents();
      expect(agents).toEqual([]);
    });

    it('should list all agents', async () => {
      await store.recordHeartbeat({
        agentName: 'agent-1',
        macAddress: 'aa:bb:cc:dd:ee:01',
        ipAddress: '192.168.1.101',
      });

      await store.recordHeartbeat({
        agentName: 'agent-2',
        macAddress: 'aa:bb:cc:dd:ee:02',
        ipAddress: '192.168.1.102',
      });

      const agents = await store.listAgents();
      expect(agents.length).toBe(2);
      expect(agents[0].agentName).toBe('agent-1');
      expect(agents[1].agentName).toBe('agent-2');
    });
  });

  describe('getAgent', () => {
    it('should return agent by name', async () => {
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      const agent = await store.getAgent('test-agent');

      expect(agent).toBeDefined();
      expect(agent!.agentName).toBe('test-agent');
      expect(agent!.macAddress).toBe('aa:bb:cc:dd:ee:ff');
    });

    it('should return undefined for non-existent agent', async () => {
      const agent = await store.getAgent('non-existent');
      expect(agent).toBeUndefined();
    });
  });

  describe('findStaleAgents', () => {
    it('should find agents with old heartbeats', async () => {
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      // Agent heartbeat is recent, so threshold of 0ms should find it
      const staleAgents = await store.findStaleAgents(0);
      expect(staleAgents.length).toBe(0);

      // Threshold of 1 hour should not find it
      const staleAgents2 = await store.findStaleAgents(3600000);
      expect(staleAgents2.length).toBe(0);
    });

    it('should not include inactive agents', async () => {
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      await store.markAgentInactive('test-agent');

      const staleAgents = await store.findStaleAgents(0);
      expect(staleAgents.length).toBe(0);
    });
  });

  describe('markAgentInactive', () => {
    it('should mark agent as inactive', async () => {
      await store.recordHeartbeat({
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
      });

      const result = await store.markAgentInactive('test-agent');

      expect(result).toBeDefined();
      expect(result!.status).toBe('inactive');
    });

    it('should return undefined for non-existent agent', async () => {
      const result = await store.markAgentInactive('non-existent');
      expect(result).toBeUndefined();
    });
  });
});
