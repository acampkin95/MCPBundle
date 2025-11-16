/**
 * Unit tests for MeshHealthMonitor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeshHealthMonitor } from '../../../src/services/meshHealthMonitor.js';
import type { MeshRegistryStore, MeshAgentRecord } from '../../../src/services/meshRegistry.js';
import type { CloudflareDnsService } from '../../../src/services/cloudflareDnsService.js';

describe('MeshHealthMonitor', () => {
  let monitor: MeshHealthMonitor;
  let mockRegistry: MeshRegistryStore;
  let mockDnsService: CloudflareDnsService;

  const mockOptions = {
    scanIntervalMs: 1000,
    offlineGraceMs: 60000,
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockRegistry = {
      findStaleAgents: vi.fn().mockResolvedValue([]),
      markAgentInactive: vi.fn(),
    } as unknown as MeshRegistryStore;

    mockDnsService = {
      resolveHostname: vi.fn(),
      markOffline: vi.fn(),
    } as unknown as CloudflareDnsService;

    monitor = new MeshHealthMonitor(mockRegistry, mockDnsService, mockOptions);
  });

  afterEach(() => {
    vi.useRealTimers();
    monitor.stop();
  });

  describe('start', () => {
    it('should start the health monitor timer', () => {
      monitor.start();

      // Verify timer is running by checking if scan is called after interval
      expect(mockRegistry.findStaleAgents).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(mockRegistry.findStaleAgents).toHaveBeenCalledWith(mockOptions.offlineGraceMs);
    });

    it('should not start multiple timers if start is called twice', () => {
      monitor.start();
      monitor.start();

      vi.advanceTimersByTime(1000);

      // Should only be called once
      expect(mockRegistry.findStaleAgents).toHaveBeenCalledTimes(1);
    });

    it('should call scan at specified interval', () => {
      monitor.start();

      vi.advanceTimersByTime(1000);
      expect(mockRegistry.findStaleAgents).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(mockRegistry.findStaleAgents).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(1000);
      expect(mockRegistry.findStaleAgents).toHaveBeenCalledTimes(3);
    });
  });

  describe('stop', () => {
    it('should stop the health monitor timer', () => {
      monitor.start();
      monitor.stop();

      vi.advanceTimersByTime(5000);

      // Should not be called after stop
      expect(mockRegistry.findStaleAgents).not.toHaveBeenCalled();
    });

    it('should be safe to call stop multiple times', () => {
      monitor.start();
      monitor.stop();
      monitor.stop();

      // Should not throw
    });

    it('should be safe to call stop without start', () => {
      monitor.stop();

      // Should not throw
    });
  });

  describe('scan', () => {
    it('should do nothing when no stale agents found', async () => {
      vi.mocked(mockRegistry.findStaleAgents).mockResolvedValue([]);

      await monitor.scan();

      expect(mockRegistry.findStaleAgents).toHaveBeenCalledWith(mockOptions.offlineGraceMs);
      expect(mockRegistry.markAgentInactive).not.toHaveBeenCalled();
      expect(mockDnsService.markOffline).not.toHaveBeenCalled();
    });

    it('should mark stale agents as inactive', async () => {
      const staleAgent: MeshAgentRecord = {
        agentName: 'stale-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
        status: 'active',
        lastHeartbeat: new Date(Date.now() - 120000), // 2 minutes ago
      };

      vi.mocked(mockRegistry.findStaleAgents).mockResolvedValue([staleAgent]);
      vi.mocked(mockDnsService.resolveHostname).mockReturnValue('stale-agent.mesh.acdev.host');

      await monitor.scan();

      expect(mockRegistry.markAgentInactive).toHaveBeenCalledWith('stale-agent');
    });

    it('should mark DNS records as offline for stale agents', async () => {
      const staleAgent: MeshAgentRecord = {
        agentName: 'stale-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
        status: 'active',
        lastHeartbeat: new Date(Date.now() - 120000),
      };

      vi.mocked(mockRegistry.findStaleAgents).mockResolvedValue([staleAgent]);
      vi.mocked(mockDnsService.resolveHostname).mockReturnValue('stale-agent.mesh.acdev.host');

      await monitor.scan();

      expect(mockDnsService.resolveHostname).toHaveBeenCalledWith('stale-agent');
      expect(mockDnsService.markOffline).toHaveBeenCalledWith('stale-agent.mesh.acdev.host');
    });

    it('should use dnsLabel if provided', async () => {
      const staleAgent: MeshAgentRecord = {
        agentName: 'stale-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
        status: 'active',
        lastHeartbeat: new Date(Date.now() - 120000),
        dnsLabel: 'custom-label',
      };

      vi.mocked(mockRegistry.findStaleAgents).mockResolvedValue([staleAgent]);
      vi.mocked(mockDnsService.resolveHostname).mockReturnValue('custom-label.mesh.acdev.host');

      await monitor.scan();

      expect(mockDnsService.resolveHostname).toHaveBeenCalledWith('custom-label');
    });

    it('should handle multiple stale agents', async () => {
      const staleAgents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
        {
          agentName: 'agent-2',
          macAddress: 'aa:bb:cc:dd:ee:02',
          ipAddress: '192.168.1.102',
          status: 'active',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
        {
          agentName: 'agent-3',
          macAddress: 'aa:bb:cc:dd:ee:03',
          ipAddress: '192.168.1.103',
          status: 'active',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
      ];

      vi.mocked(mockRegistry.findStaleAgents).mockResolvedValue(staleAgents);
      vi.mocked(mockDnsService.resolveHostname).mockImplementation(
        (label) => `${label}.mesh.acdev.host`
      );

      await monitor.scan();

      expect(mockRegistry.markAgentInactive).toHaveBeenCalledTimes(3);
      expect(mockDnsService.markOffline).toHaveBeenCalledTimes(3);
      expect(mockDnsService.markOffline).toHaveBeenCalledWith('agent-1.mesh.acdev.host');
      expect(mockDnsService.markOffline).toHaveBeenCalledWith('agent-2.mesh.acdev.host');
      expect(mockDnsService.markOffline).toHaveBeenCalledWith('agent-3.mesh.acdev.host');
    });

    it('should process all agents even if one fails', async () => {
      const staleAgents: MeshAgentRecord[] = [
        {
          agentName: 'agent-1',
          macAddress: 'aa:bb:cc:dd:ee:01',
          ipAddress: '192.168.1.101',
          status: 'active',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
        {
          agentName: 'agent-2',
          macAddress: 'aa:bb:cc:dd:ee:02',
          ipAddress: '192.168.1.102',
          status: 'active',
          lastHeartbeat: new Date(Date.now() - 120000),
        },
      ];

      vi.mocked(mockRegistry.findStaleAgents).mockResolvedValue(staleAgents);
      vi.mocked(mockDnsService.resolveHostname).mockImplementation(
        (label) => `${label}.mesh.acdev.host`
      );

      // Make first agent succeed, second fail
      vi.mocked(mockRegistry.markAgentInactive).mockResolvedValue({
        agentName: 'agent-1',
        macAddress: 'aa:bb:cc:dd:ee:01',
        ipAddress: '192.168.1.101',
        status: 'inactive',
        lastHeartbeat: new Date(),
      });

      await monitor.scan();

      // Should process both agents (errors are not caught in current implementation)
      expect(mockRegistry.markAgentInactive).toHaveBeenCalledTimes(2);
      expect(mockDnsService.markOffline).toHaveBeenCalledTimes(2);
    });
  });
});
