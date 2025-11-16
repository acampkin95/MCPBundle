/**
 * Unit tests for HeartbeatService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatService } from '../../../src/services/heartbeatService.js';
import type { MeshRegistryStore, HeartbeatPersistenceResult } from '../../../src/services/meshRegistry.js';
import type { CloudflareDnsService } from '../../../src/services/cloudflareDnsService.js';

describe('HeartbeatService', () => {
  let service: HeartbeatService;
  let mockRegistry: MeshRegistryStore;
  let mockDnsService: CloudflareDnsService;

  const mockOptions = {
    sharedSecret: 'test-secret',
    defaultHeartbeatMs: 60000,
    adminToken: 'admin-token-123',
  };

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      recordHeartbeat: vi.fn(),
      markDnsUpdate: vi.fn(),
      authorizePendingMac: vi.fn(),
    } as unknown as MeshRegistryStore;

    // Create mock DNS service
    mockDnsService = {
      ensureRecord: vi.fn(),
    } as unknown as CloudflareDnsService;

    service = new HeartbeatService(mockRegistry, mockDnsService, mockOptions);
  });

  describe('verifySharedSecret', () => {
    it('should return true for correct secret', () => {
      expect(service.verifySharedSecret('test-secret')).toBe(true);
    });

    it('should return false for incorrect secret', () => {
      expect(service.verifySharedSecret('wrong-secret')).toBe(false);
    });

    it('should return false for undefined secret', () => {
      expect(service.verifySharedSecret(undefined)).toBe(false);
    });

    it('should return false for empty secret', () => {
      expect(service.verifySharedSecret('')).toBe(false);
    });
  });

  describe('handleHeartbeat', () => {
    it('should handle new agent registration', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'registered',
        allowDnsUpdate: true,
        ipChanged: true,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
          heartbeatIntervalMs: 60000,
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);
      vi.mocked(mockDnsService.ensureRecord).mockResolvedValue({
        hostname: 'test-agent.mesh.acdev.host',
        recordId: 'rec-123',
        type: 'A',
        changed: true,
      });

      const response = await service.handleHeartbeat(payload);

      expect(response.state).toBe('registered');
      expect(response.allowDnsUpdate).toBe(true);
      expect(response.ipChanged).toBe(true);
      expect(response.dnsHostname).toBe('test-agent.mesh.acdev.host');
      expect(response.dnsRecordId).toBe('rec-123');
      expect(response.dnsRecordType).toBe('A');
      expect(response.nextHeartbeatMs).toBe(60000);
      expect(mockRegistry.markDnsUpdate).toHaveBeenCalledWith('test-agent');
    });

    it('should normalize agent name and MAC to lowercase', async () => {
      const payload = {
        agentName: 'TEST-AGENT',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'updated',
        allowDnsUpdate: true,
        ipChanged: false,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);
      vi.mocked(mockDnsService.ensureRecord).mockResolvedValue({
        hostname: 'test-agent.mesh.acdev.host',
        recordId: 'rec-123',
        type: 'A',
        changed: false,
      });

      await service.handleHeartbeat(payload);

      expect(mockRegistry.recordHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
        })
      );
    });

    it('should use custom DNS label if provided', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
        dnsLabel: 'custom-label',
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'registered',
        allowDnsUpdate: true,
        ipChanged: true,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
          dnsLabel: 'custom-label',
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);
      vi.mocked(mockDnsService.ensureRecord).mockResolvedValue({
        hostname: 'custom-label.mesh.acdev.host',
        recordId: 'rec-123',
        type: 'A',
        changed: true,
      });

      await service.handleHeartbeat(payload);

      expect(mockDnsService.ensureRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          dnsLabel: 'custom-label',
        })
      );
    });

    it('should use agent name as DNS label if not provided', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'registered',
        allowDnsUpdate: true,
        ipChanged: true,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);
      vi.mocked(mockDnsService.ensureRecord).mockResolvedValue({
        hostname: 'test-agent.mesh.acdev.host',
        recordId: 'rec-123',
        type: 'A',
        changed: true,
      });

      await service.handleHeartbeat(payload);

      expect(mockRegistry.recordHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          dnsLabel: 'test-agent',
        })
      );
    });

    it('should skip DNS update when not allowed', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'mac_verification_required',
        allowDnsUpdate: false,
        ipChanged: true,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          pendingMac: 'aa:bb:cc:dd:ee:00',
          ipAddress: '192.168.1.100',
          status: 'mac_verification_required',
          lastHeartbeat: new Date(),
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);

      const response = await service.handleHeartbeat(payload);

      expect(response.state).toBe('mac_verification_required');
      expect(response.allowDnsUpdate).toBe(false);
      expect(response.reason).toContain('MAC address changed');
      expect(mockDnsService.ensureRecord).not.toHaveBeenCalled();
    });

    it('should handle DNS update failure gracefully', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'updated',
        allowDnsUpdate: true,
        ipChanged: true,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);
      vi.mocked(mockDnsService.ensureRecord).mockRejectedValue(new Error('DNS API error'));

      const response = await service.handleHeartbeat(payload);

      expect(response.allowDnsUpdate).toBe(false);
      expect(response.reason).toContain('DNS update error');
      expect(mockRegistry.markDnsUpdate).not.toHaveBeenCalled();
    });

    it('should use custom heartbeat interval if provided', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
        heartbeatIntervalMs: 30000,
      };

      const mockPersistenceResult: HeartbeatPersistenceResult = {
        state: 'registered',
        allowDnsUpdate: true,
        ipChanged: true,
        record: {
          agentName: 'test-agent',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          ipAddress: '192.168.1.100',
          status: 'active',
          lastHeartbeat: new Date(),
          heartbeatIntervalMs: 30000,
        },
      };

      vi.mocked(mockRegistry.recordHeartbeat).mockResolvedValue(mockPersistenceResult);
      vi.mocked(mockDnsService.ensureRecord).mockResolvedValue({
        hostname: 'test-agent.mesh.acdev.host',
        recordId: 'rec-123',
        type: 'A',
        changed: true,
      });

      const response = await service.handleHeartbeat(payload);

      expect(response.nextHeartbeatMs).toBe(30000);
    });

    it('should reject invalid MAC address', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'invalid-mac',
        ipAddress: '192.168.1.100',
      };

      await expect(service.handleHeartbeat(payload)).rejects.toThrow();
    });

    it('should reject invalid IP address', async () => {
      const payload = {
        agentName: 'test-agent',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: 'invalid-ip',
      };

      await expect(service.handleHeartbeat(payload)).rejects.toThrow();
    });

    it('should reject short agent name', async () => {
      const payload = {
        agentName: 'ab',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.1.100',
      };

      await expect(service.handleHeartbeat(payload)).rejects.toThrow();
    });
  });

  describe('authorizePendingMac', () => {
    it('should authorize pending MAC with valid admin token', async () => {
      const mockRecord = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
        status: 'active' as const,
        lastHeartbeat: new Date(),
      };

      vi.mocked(mockRegistry.authorizePendingMac).mockResolvedValue(mockRecord);

      const result = await service.authorizePendingMac('test-agent', 'admin-token-123');

      expect(result).toEqual(mockRecord);
      expect(mockRegistry.authorizePendingMac).toHaveBeenCalledWith('test-agent');
    });

    it('should reject invalid admin token', async () => {
      await expect(
        service.authorizePendingMac('test-agent', 'wrong-token')
      ).rejects.toThrow('Invalid admin token');
    });

    it('should reject undefined admin token', async () => {
      await expect(
        service.authorizePendingMac('test-agent', undefined)
      ).rejects.toThrow('Invalid admin token');
    });

    it('should reject when admin token not configured', async () => {
      const serviceWithoutToken = new HeartbeatService(mockRegistry, mockDnsService, {
        sharedSecret: 'test-secret',
        defaultHeartbeatMs: 60000,
      });

      await expect(
        serviceWithoutToken.authorizePendingMac('test-agent', 'any-token')
      ).rejects.toThrow('Admin token not configured');
    });

    it('should reject when no pending MAC exists', async () => {
      vi.mocked(mockRegistry.authorizePendingMac).mockResolvedValue(undefined);

      await expect(
        service.authorizePendingMac('test-agent', 'admin-token-123')
      ).rejects.toThrow('No pending MAC change for agent test-agent');
    });

    it('should normalize agent name to lowercase', async () => {
      const mockRecord = {
        agentName: 'test-agent',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        ipAddress: '192.168.1.100',
        status: 'active' as const,
        lastHeartbeat: new Date(),
      };

      vi.mocked(mockRegistry.authorizePendingMac).mockResolvedValue(mockRecord);

      await service.authorizePendingMac('TEST-AGENT', 'admin-token-123');

      expect(mockRegistry.authorizePendingMac).toHaveBeenCalledWith('test-agent');
    });
  });
});
