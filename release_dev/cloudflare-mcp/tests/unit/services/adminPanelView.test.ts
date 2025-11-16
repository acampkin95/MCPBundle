/**
 * Unit tests for AdminPanelView
 */

import { describe, it, expect } from 'vitest';
import { buildPanelOverview } from '../../../src/services/adminPanelView.js';
import type { MeshAgentRecord } from '../../../src/services/meshRegistry.js';

describe('AdminPanelView', () => {
  const mockOptions = {
    salt: 'test-salt-12345',
    staleThresholdMs: 60000, // 1 minute
    hostnameResolver: (agent: MeshAgentRecord) => `${agent.agentName}.mesh.acdev.host`,
  };

  describe('buildPanelOverview', () => {
    it('should build overview for empty agent list', () => {
      const agents: MeshAgentRecord[] = [];

      const overview = buildPanelOverview(agents, mockOptions);

      expect(overview.stats.total).toBe(0);
      expect(overview.stats.active).toBe(0);
      expect(overview.stats.inactive).toBe(0);
      expect(overview.stats.macVerificationRequired).toBe(0);
      expect(overview.stats.stale).toBe(0);
      expect(overview.agents).toEqual([]);
      expect(overview.credentialPrintout).toEqual([]);
    });

    it('should build overview for single active agent', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      const overview = buildPanelOverview(agents, mockOptions);

      expect(overview.stats.total).toBe(1);
      expect(overview.stats.active).toBe(1);
      expect(overview.stats.inactive).toBe(0);
      expect(overview.stats.macVerificationRequired).toBe(0);
      expect(overview.stats.stale).toBe(0);
      expect(overview.agents.length).toBe(1);
      expect(overview.credentialPrintout.length).toBe(1);
    });

    it('should correctly count agents by status', () => {
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
        {
          agentName: 'agent-4',
          macAddress: 'aa:bb:cc:dd:ee:04',
          ipAddress: '192.168.1.104',
          status: 'mac_verification_required',
          lastHeartbeat: new Date(),
          pendingMac: 'aa:bb:cc:dd:ee:00',
        },
      ];

      const overview = buildPanelOverview(agents, mockOptions);

      expect(overview.stats.total).toBe(4);
      expect(overview.stats.active).toBe(2);
      expect(overview.stats.inactive).toBe(1);
      expect(overview.stats.macVerificationRequired).toBe(1);
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

      const overview = buildPanelOverview(agents, mockOptions);

      expect(overview.stats.stale).toBe(1);
    });

    it('should generate credential printout with fingerprints', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      const overview = buildPanelOverview(agents, mockOptions);

      expect(overview.credentialPrintout.length).toBe(1);
      const entry = overview.credentialPrintout[0];
      expect(entry.agentName).toBe('agent-1');
      expect(entry.hostname).toBe('agent-1.mesh.acdev.host');
      expect(entry.macAddress).toBe('aa:bb:cc:dd:ee:ff');
      expect(entry.status).toBe('active');
      expect(entry.fingerprint).toBeDefined();
      expect(entry.fingerprint.length).toBe(24);
      expect(entry.lastHeartbeat).toBeDefined();
    });

    it('should include optional agent fields in credential printout', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
          lastDnsUpdate: new Date(),
          heartbeatIntervalMs: 60000,
          serviceRole: 'worker',
          metadata: { env: 'production', region: 'us-west' },
        },
      ];

      const overview = buildPanelOverview(agents, mockOptions);

      const entry = overview.credentialPrintout[0];
      expect(entry.lastDnsUpdate).toBeDefined();
      expect(entry.heartbeatIntervalMs).toBe(60000);
      expect(entry.serviceRole).toBe('worker');
      expect(entry.metadata).toEqual({ env: 'production', region: 'us-west' });
    });

    it('should generate consistent fingerprints with same salt', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      const overview1 = buildPanelOverview(agents, mockOptions);
      const overview2 = buildPanelOverview(agents, mockOptions);

      expect(overview1.credentialPrintout[0].fingerprint).toBe(
        overview2.credentialPrintout[0].fingerprint
      );
    });

    it('should generate different fingerprints with different salts', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      ];

      const overview1 = buildPanelOverview(agents, mockOptions);
      const overview2 = buildPanelOverview(agents, {
        ...mockOptions,
        salt: 'different-salt',
      });

      expect(overview1.credentialPrintout[0].fingerprint).not.toBe(
        overview2.credentialPrintout[0].fingerprint
      );
    });

    it('should use hostname resolver for credential printout', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
          dnsLabel: 'custom-label',
        },
      ];

      const customResolver = (agent: MeshAgentRecord) =>
        `${agent.dnsLabel ?? agent.agentName}.custom.domain`;

      const overview = buildPanelOverview(agents, {
        ...mockOptions,
        hostnameResolver: customResolver,
      });

      expect(overview.credentialPrintout[0].hostname).toBe('custom-label.custom.domain');
    });

    it('should handle multiple agents with varying configurations', () => {
      const agents: MeshAgentRecord[] = [
        {
          agentName: 'minimal-agent',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(),
        },
        {
          agentName: 'full-agent',
          macAddress: 'aa:bb:cc:dd:ee:02',
          ipAddress: '192.168.1.102',
          status: 'active',
          lastHeartbeat: new Date(),
          lastDnsUpdate: new Date(),
          heartbeatIntervalMs: 30000,
          serviceRole: 'coordinator',
          metadata: { datacenter: 'dc1' },
          dnsLabel: 'full-agent-custom',
        },
      ];

      const overview = buildPanelOverview(agents, mockOptions);

      expect(overview.credentialPrintout.length).toBe(2);
      expect(overview.credentialPrintout[0].serviceRole).toBeUndefined();
      expect(overview.credentialPrintout[1].serviceRole).toBe('coordinator');
    });
  });
});
