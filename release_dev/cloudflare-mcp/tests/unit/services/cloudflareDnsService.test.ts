/**
 * Unit tests for CloudflareDnsService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudflareDnsService } from '../../../src/services/cloudflareDnsService.js';
import { CircuitState } from '@mcp-bundle/resilience';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('CloudflareDnsService', () => {
  let service: CloudflareDnsService;
  const mockOptions = {
    apiToken: 'test-token',
    accountId: 'test-account',
    zoneId: 'test-zone',
    baseHostname: 'mesh.acdev.host',
    defaultTtl: 60,
    proxied: true,
  };

  beforeEach(() => {
    service = new CloudflareDnsService(mockOptions);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct options', () => {
      expect(service).toBeDefined();
      expect(service.getCircuitBreakerStats().state).toBe(CircuitState.CLOSED);
    });

    it('should initialize circuit breaker', () => {
      const stats = service.getCircuitBreakerStats();
      expect(stats).toBeDefined();
      expect(stats.totalCalls).toBe(0);
      expect(stats.failedCalls).toBe(0);
    });
  });

  describe('ensureRecord', () => {
    it('should create a new DNS record when none exists', async () => {
      // Mock listRecords (no existing record)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [],
        }),
      });

      // Mock createRecord
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: 'record-123',
            name: 'test-agent.mesh.acdev.host',
            type: 'A',
            content: '192.168.1.100',
            ttl: 60,
            proxied: true,
          },
        }),
      });

      const result = await service.ensureRecord({
        macAddress: 'aa:bb:cc:dd:ee:ff',
        agentName: 'test-agent',
        ipAddress: '192.168.1.100',
      });

      expect(result).toEqual({
        hostname: 'test-agent.mesh.acdev.host',
        recordId: 'record-123',
        type: 'A',
        changed: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update existing DNS record when IP changes', async () => {
      // Mock listRecords (existing record with different IP)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: 'record-123',
              name: 'test-agent.mesh.acdev.host',
              type: 'A',
              content: '192.168.1.99', // Different IP
              ttl: 60,
              proxied: true,
            },
          ],
        }),
      });

      // Mock updateRecord
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: 'record-123',
            name: 'test-agent.mesh.acdev.host',
            type: 'A',
            content: '192.168.1.100',
            ttl: 60,
            proxied: true,
          },
        }),
      });

      const result = await service.ensureRecord({
        macAddress: 'aa:bb:cc:dd:ee:ff',
        agentName: 'test-agent',
        ipAddress: '192.168.1.100',
      });

      expect(result.changed).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not update when record is already up-to-date', async () => {
      // Mock listRecords (existing record with same IP)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: 'record-123',
              name: 'test-agent.mesh.acdev.host',
              type: 'A',
              content: '192.168.1.100', // Same IP
              ttl: 60,
              proxied: true,
            },
          ],
        }),
      });

      const result = await service.ensureRecord({
        macAddress: 'aa:bb:cc:dd:ee:ff',
        agentName: 'test-agent',
        ipAddress: '192.168.1.100',
      });

      expect(result.changed).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only list, no update
    });

    it('should handle IPv6 addresses correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: 'record-ipv6',
            name: 'test-agent.mesh.acdev.host',
            type: 'AAAA',
            content: '2001:db8::1',
            ttl: 60,
            proxied: true,
          },
        }),
      });

      const result = await service.ensureRecord({
        macAddress: 'aa:bb:cc:dd:ee:ff',
        agentName: 'test-agent',
        ipAddress: '2001:db8::1',
      });

      expect(result.type).toBe('AAAA');
    });

    it('should use custom DNS label when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: 'record-custom',
            name: 'custom-label.mesh.acdev.host',
            type: 'A',
            content: '192.168.1.100',
            ttl: 60,
            proxied: true,
          },
        }),
      });

      const result = await service.ensureRecord({
        macAddress: 'aa:bb:cc:dd:ee:ff',
        agentName: 'test-agent',
        dnsLabel: 'custom-label',
        ipAddress: '192.168.1.100',
      });

      expect(result.hostname).toBe('custom-label.mesh.acdev.host');
    });
  });

  describe('markOffline', () => {
    it('should set A record to 0.0.0.0', async () => {
      // Mock finding the record
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: 'record-123',
              name: 'test-agent.mesh.acdev.host',
              type: 'A',
              content: '192.168.1.100',
              ttl: 60,
              proxied: true,
            },
          ],
        }),
      });

      // Mock update to 0.0.0.0
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: 'record-123',
            name: 'test-agent.mesh.acdev.host',
            type: 'A',
            content: '0.0.0.0',
            ttl: 60,
            proxied: false,
          },
        }),
      });

      await service.markOffline('test-agent.mesh.acdev.host');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Verify the update call includes 0.0.0.0
      const updateCall = mockFetch.mock.calls[1];
      const updateBody = JSON.parse(updateCall?.[1]?.body as string);
      expect(updateBody.content).toBe('0.0.0.0');
    });

    it('should set AAAA record to ::', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: 'record-ipv6',
              name: 'test-agent.mesh.acdev.host',
              type: 'AAAA',
              content: '2001:db8::1',
              ttl: 60,
              proxied: true,
            },
          ],
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: 'record-ipv6',
            name: 'test-agent.mesh.acdev.host',
            type: 'AAAA',
            content: '::',
            ttl: 60,
            proxied: false,
          },
        }),
      });

      await service.markOffline('test-agent.mesh.acdev.host');

      const updateCall = mockFetch.mock.calls[2];
      const updateBody = JSON.parse(updateCall?.[1]?.body as string);
      expect(updateBody.content).toBe('::');
    });

    it('should do nothing when record does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, errors: [], messages: [], result: [] }),
      });

      await service.markOffline('nonexistent.mesh.acdev.host');

      expect(mockFetch).toHaveBeenCalledTimes(2); // Both A and AAAA lookups, no update
    });
  });

  describe('listRecords', () => {
    it('should list all records without filters', async () => {
      const mockRecords = [
        {
          id: 'rec-1',
          name: 'agent1.mesh.acdev.host',
          type: 'A',
          content: '192.168.1.1',
          ttl: 60,
          proxied: true,
        },
        {
          id: 'rec-2',
          name: 'agent2.mesh.acdev.host',
          type: 'A',
          content: '192.168.1.2',
          ttl: 60,
          proxied: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: mockRecords,
        }),
      });

      const records = await service.listRecords();

      expect(records).toEqual(mockRecords);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dns_records'),
        expect.any(Object)
      );
    });

    it('should filter records by name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: 'rec-1',
              name: 'specific-agent.mesh.acdev.host',
              type: 'A',
              content: '192.168.1.1',
              ttl: 60,
              proxied: true,
            },
          ],
        }),
      });

      await service.listRecords({ name: 'specific-agent.mesh.acdev.host' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('name=specific-agent.mesh.acdev.host'),
        expect.any(Object)
      );
    });

    it('should filter records by type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [],
        }),
      });

      await service.listRecords({ type: 'AAAA' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=AAAA'),
        expect.any(Object)
      );
    });
  });

  describe('deleteRecord', () => {
    it('should delete a record by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: { id: 'record-123' },
        }),
      });

      await service.deleteRecord('record-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dns_records/record-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('resolveHostname', () => {
    it('should build hostname from label', () => {
      const hostname = service.resolveHostname('test-agent');
      expect(hostname).toBe('test-agent.mesh.acdev.host');
    });

    it('should sanitize labels', () => {
      const hostname = service.resolveHostname('Test_Agent#123');
      expect(hostname).toBe('test-agent-123.mesh.acdev.host');
    });

    it('should handle multiple hyphens', () => {
      const hostname = service.resolveHostname('test---agent');
      expect(hostname).toBe('test-agent.mesh.acdev.host');
    });

    it('should trim leading and trailing hyphens', () => {
      const hostname = service.resolveHostname('-test-agent-');
      expect(hostname).toBe('test-agent.mesh.acdev.host');
    });
  });

  describe('error handling', () => {
    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          errors: [{ code: 1001, message: 'Invalid request' }],
          messages: [],
          result: null,
        }),
      });

      await expect(
        service.listRecords()
      ).rejects.toThrow('Cloudflare API error: 1001: Invalid request');
    });

    it('should handle network errors with circuit breaker', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.listRecords()).rejects.toThrow('ECONNREFUSED');

      const stats = service.getCircuitBreakerStats();
      expect(stats.failedCalls).toBeGreaterThan(0);
    });
  });

  describe('circuit breaker integration', () => {
    it('should track successful calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [],
        }),
      });

      await service.listRecords();

      const stats = service.getCircuitBreakerStats();
      expect(stats.successfulCalls).toBe(1);
      expect(stats.totalCalls).toBe(1);
    });

    it('should open circuit after threshold failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Attempt multiple requests to trip the circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await service.listRecords();
        } catch {
          // Expected to fail
        }
      }

      const stats = service.getCircuitBreakerStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });
  });

  describe('getCircuitBreakerStats', () => {
    it('should return current circuit breaker statistics', () => {
      const stats = service.getCircuitBreakerStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('totalCalls');
      expect(stats).toHaveProperty('successfulCalls');
      expect(stats).toHaveProperty('failedCalls');
      expect(stats).toHaveProperty('rejectedCalls');
      expect(stats).toHaveProperty('consecutiveFailures');
      expect(stats).toHaveProperty('consecutiveSuccesses');
    });
  });
});
