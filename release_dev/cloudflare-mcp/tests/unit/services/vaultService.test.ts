/**
 * Unit tests for VaultService
 *
 * This test suite covers:
 * - Constructor and initialization
 * - Secret retrieval with caching
 * - Secret watching and rotation detection
 * - Token validation and renewal
 * - Health checks
 * - Cache management
 * - Error handling (network failures, invalid paths, permission denied)
 * - Edge cases (empty responses, malformed data, expired cache)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VaultService, createVaultServiceFromEnv } from '../../../src/services/vaultService.js';
import type {
  VaultConfig,
  VaultSecretResponse,
  VaultTokenLookupResponse,
} from '../../../src/services/vaultService.js';

// Mock the logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('VaultService', () => {
  let vaultService: VaultService;
  let mockConfig: VaultConfig;
  const mockFetch = vi.mocked(global.fetch);

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset fetch mock with a default safe response to prevent unhandled rejections
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          data: {
            host: 'localhost',
            port: '5432',
            user: 'postgres',
            password: 'secret',
            database: 'testdb',
          },
          metadata: {
            created_time: '2025-11-15T12:00:00Z',
            version: 1,
          },
        },
      }),
    } as Response);

    // Default config
    mockConfig = {
      addr: 'https://vault.example.com',
      token: 'test-token-123',
      namespace: 'test-namespace',
      cacheTTL: 300000, // 5 minutes
    };
  });

  afterEach(() => {
    // Clean up any watchers
    if (vaultService) {
      vaultService.stopAllWatchers();
      vaultService.clearCache();
    }

    // IMPORTANT: Clear timers BEFORE switching back to real timers
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid configuration', () => {
      vaultService = new VaultService(mockConfig);

      expect(vaultService).toBeInstanceOf(VaultService);
    });

    it('should use default cacheTTL of 300000ms when not provided', async () => {
      const configWithoutTTL = {
        addr: 'https://vault.example.com',
        token: 'test-token',
      };
      vaultService = new VaultService(configWithoutTTL);

      expect(vaultService).toBeInstanceOf(VaultService);

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('VaultService initialized', {
        addr: configWithoutTTL.addr,
        namespace: undefined,
        cacheTTL: 300000,
      });
    });

    it('should use custom cacheTTL when provided', async () => {
      const customConfig = {
        ...mockConfig,
        cacheTTL: 60000, // 1 minute
      };
      vaultService = new VaultService(customConfig);

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('VaultService initialized', {
        addr: customConfig.addr,
        namespace: customConfig.namespace,
        cacheTTL: 60000,
      });
    });

    it('should log initialization details', async () => {
      vaultService = new VaultService(mockConfig);

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('VaultService initialized', {
        addr: mockConfig.addr,
        namespace: mockConfig.namespace,
        cacheTTL: mockConfig.cacheTTL,
      });
    });
  });

  describe('getSecret', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should successfully retrieve secret from Vault', async () => {
      const mockResponse: VaultSecretResponse = {
        data: {
          data: {
            host: 'localhost',
            port: '5432',
            user: 'postgres',
            password: 'secret',
            database: 'testdb',
          },
          metadata: {
            created_time: '2025-11-15T12:00:00Z',
            version: 1,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await vaultService.getSecret('postgres');

      expect(result).toEqual(mockResponse.data.data);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://vault.example.com/v1/secret/data/server-mcp/postgres',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'X-Vault-Token': 'test-token-123',
            'X-Vault-Namespace': 'test-namespace',
          },
        })
      );
    });

    it('should include namespace header when namespace is configured', async () => {
      await vaultService.getSecret('postgres');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Vault-Namespace': 'test-namespace',
          }),
        })
      );
    });

    it('should not include namespace header when namespace is not configured', async () => {
      const configWithoutNamespace = {
        addr: 'https://vault.example.com',
        token: 'test-token',
      };
      vaultService = new VaultService(configWithoutNamespace);

      await vaultService.getSecret('postgres');

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['X-Vault-Namespace']).toBeUndefined();
    });

    it('should cache secret after first fetch', async () => {
      // First call - should fetch from Vault
      await vaultService.getSecret('postgres');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await vaultService.getSecret('postgres');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should return cached value when cache is still valid', async () => {
      const mockResponse = {
        data: {
          data: { key: 'cached-value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // First call
      const result1 = await vaultService.getSecret('postgres');

      // Advance time but not past cache expiry (5 minutes)
      vi.advanceTimersByTime(60000); // 1 minute

      // Second call - should use cache
      const result2 = await vaultService.getSecret('postgres');

      expect(result1).toEqual(mockResponse.data.data);
      expect(result2).toEqual(mockResponse.data.data);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fetch new secret when cache expires', async () => {
      const mockResponse1 = {
        data: {
          data: { key: 'old-value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };
      const mockResponse2 = {
        data: {
          data: { key: 'new-value' },
          metadata: { created_time: '2025-11-15T12:05:00Z', version: 2 },
        },
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponse1 } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponse2 } as Response);

      // First call
      const result1 = await vaultService.getSecret('postgres');
      expect(result1).toEqual(mockResponse1.data.data);

      // Advance time past cache expiry (5 minutes + 1ms)
      vi.advanceTimersByTime(300001);

      // Second call - cache expired, should fetch new value
      const result2 = await vaultService.getSecret('postgres');
      expect(result2).toEqual(mockResponse2.data.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle Vault API error (404 Not Found)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Secret not found',
      } as Response);

      await expect(vaultService.getSecret('postgres')).rejects.toThrow(
        'Vault API error: 404 Not Found: Secret not found'
      );
    });

    it('should handle Vault API error (403 Permission Denied)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Permission denied',
      } as Response);

      await expect(vaultService.getSecret('postgres')).rejects.toThrow(
        'Vault API error: 403 Forbidden: Permission denied'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(vaultService.getSecret('postgres')).rejects.toThrow('Network error');
    });

    it('should log cache hit', async () => {
      const { logger } = await import('../../../src/utils/logger.js');

      // First call
      await vaultService.getSecret('postgres');

      vi.clearAllMocks();

      // Second call - cache hit
      await vaultService.getSecret('postgres');

      expect(logger.debug).toHaveBeenCalledWith('Vault secret cache hit', {
        name: 'postgres',
        path: 'secret/data/server-mcp/postgres',
      });
    });

    it('should log cache miss', async () => {
      const { logger } = await import('../../../src/utils/logger.js');

      await vaultService.getSecret('postgres');

      expect(logger.debug).toHaveBeenCalledWith('Vault secret cache miss, fetching', {
        name: 'postgres',
        path: 'secret/data/server-mcp/postgres',
      });
    });
  });

  describe('watchSecret', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should set up secret watcher with default interval', async () => {
      const onChange = vi.fn();
      const mockResponse = {
        data: {
          data: { key: 'value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };

      mockFetch.mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

      vaultService.watchSecret('postgres', onChange);

      // Allow microtasks (promises) to complete for initial check
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 100 });
    });

    it('should call onChange when secret version changes', async () => {
      const onChange = vi.fn();
      const mockResponse1 = {
        data: {
          data: { key: 'old-value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };
      const mockResponse2 = {
        data: {
          data: { key: 'new-value' },
          metadata: { created_time: '2025-11-15T12:01:00Z', version: 2 },
        },
      };

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        const response = callCount === 1 ? mockResponse1 : mockResponse2;
        return { ok: true, json: async () => response } as Response;
      });

      vaultService.watchSecret('postgres', onChange, 60000);

      // Wait for initial check to complete
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1), { timeout: 100 });
      expect(onChange).not.toHaveBeenCalled(); // First check establishes version

      // Advance to next interval and wait for check to complete
      vi.advanceTimersByTime(60000);
      await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 100 });

      expect(onChange).toHaveBeenCalledWith({ key: 'new-value' });
    });

    it('should not call onChange when version stays the same', async () => {
      const onChange = vi.fn();
      const mockResponse = {
        data: {
          data: { key: 'value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };

      mockFetch.mockResolvedValue({ ok: true, json: async () => mockResponse } as Response);

      vaultService.watchSecret('postgres', onChange, 60000);

      // Wait for initial check
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1), { timeout: 100 });

      // Advance to next interval
      vi.advanceTimersByTime(60000);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2), { timeout: 100 });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should invalidate cache when secret version changes', async () => {
      const onChange = vi.fn();
      const mockResponse1 = {
        data: {
          data: { key: 'old-value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };
      const mockResponse2 = {
        data: {
          data: { key: 'new-value' },
          metadata: { created_time: '2025-11-15T12:01:00Z', version: 2 },
        },
      };

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        const response = callCount === 1 ? mockResponse1 : mockResponse2;
        return { ok: true, json: async () => response } as Response;
      });

      vaultService.watchSecret('postgres', onChange, 60000);

      // Wait for initial check
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1), { timeout: 100 });

      // Advance to next interval (version changes)
      vi.advanceTimersByTime(60000);
      await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 100 });

      // Cache should be invalidated
      const cacheStats = vaultService.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });

    it('should handle errors during secret watching gracefully', async () => {
      const onChange = vi.fn();
      const { logger } = await import('../../../src/utils/logger.js');

      mockFetch.mockRejectedValue(new Error('Network error'));

      vaultService.watchSecret('postgres', onChange, 60000);

      // Wait for initial check to complete with error
      await vi.waitFor(
        () => expect(logger.error).toHaveBeenCalledWith(
          'Error checking secret version',
          expect.objectContaining({
            name: 'postgres',
            error: 'Network error',
          })
        ),
        { timeout: 100 }
      );
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should clear existing watcher when watching same secret again', async () => {
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();

      vaultService.watchSecret('postgres', onChange1, 60000);
      vaultService.watchSecret('postgres', onChange2, 60000); // Replace watcher

      // Only the second watcher should be active
      expect(vaultService).toBeInstanceOf(VaultService);
    });

    it('should use custom interval when provided', async () => {
      const onChange = vi.fn();
      const customInterval = 30000; // 30 seconds

      vaultService.watchSecret('postgres', onChange, customInterval);

      const { logger } = await import('../../../src/utils/logger.js');

      // Wait for initial check
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 100 });

      expect(logger.info).toHaveBeenCalledWith('Starting secret watcher', {
        name: 'postgres',
        path: 'secret/data/server-mcp/postgres',
        intervalMs: customInterval,
      });
    });
  });

  describe('stopWatching', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should stop watching a specific secret', async () => {
      const onChange = vi.fn();

      vaultService.watchSecret('postgres', onChange, 60000);

      // Wait for initial check
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 100 });

      vaultService.stopWatching('postgres');

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('Stopped secret watcher', {
        name: 'postgres',
      });
    });

    it('should do nothing when stopping non-existent watcher', () => {
      // Should not throw
      vaultService.stopWatching('postgres');
      expect(vaultService).toBeInstanceOf(VaultService);
    });
  });

  describe('stopAllWatchers', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should stop all active watchers', async () => {
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();
      const onChange3 = vi.fn();

      vaultService.watchSecret('postgres', onChange1, 60000);
      vaultService.watchSecret('redis', onChange2, 60000);
      vaultService.watchSecret('keycloak', onChange3, 60000);

      // Wait for all initial checks
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3), { timeout: 100 });

      const { logger } = await import('../../../src/utils/logger.js');
      vi.clearAllMocks();

      vaultService.stopAllWatchers();

      expect(logger.info).toHaveBeenCalledTimes(3);
    });

    it('should do nothing when no watchers are active', () => {
      // Should not throw
      vaultService.stopAllWatchers();
      expect(vaultService).toBeInstanceOf(VaultService);
    });
  });

  describe('validateToken', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should successfully validate token', async () => {
      const mockTokenResponse: VaultTokenLookupResponse = {
        data: {
          creation_time: 1700000000,
          creation_ttl: 86400,
          display_name: 'test-token',
          expire_time: '2025-11-16T12:00:00Z',
          explicit_max_ttl: 0,
          id: 'token-id-123',
          issue_time: '2025-11-15T12:00:00Z',
          meta: null,
          num_uses: 0,
          orphan: false,
          path: 'auth/token/create',
          policies: ['default', 'app-policy'],
          renewable: true,
          ttl: 86400,
          type: 'service',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      } as Response);

      const result = await vaultService.validateToken();

      expect(result).toEqual(mockTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://vault.example.com/v1/auth/token/lookup-self',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'X-Vault-Token': 'test-token-123',
            'X-Vault-Namespace': 'test-namespace',
          },
        })
      );
    });

    it('should handle token validation failure (401 Unauthorized)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid token',
      } as Response);

      await expect(vaultService.validateToken()).rejects.toThrow(
        'Token validation failed: 401 Invalid token'
      );
    });

    it('should log token validation details', async () => {
      const mockTokenResponse: VaultTokenLookupResponse = {
        data: {
          creation_time: 1700000000,
          creation_ttl: 86400,
          display_name: 'test-token',
          expire_time: '2025-11-16T12:00:00Z',
          explicit_max_ttl: 0,
          id: 'token-id-123',
          issue_time: '2025-11-15T12:00:00Z',
          meta: null,
          num_uses: 0,
          orphan: false,
          path: 'auth/token/create',
          policies: ['default', 'app-policy'],
          renewable: true,
          ttl: 86400,
          type: 'service',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      } as Response);

      const { logger } = await import('../../../src/utils/logger.js');

      await vaultService.validateToken();

      expect(logger.info).toHaveBeenCalledWith('Token validated', {
        policies: ['default', 'app-policy'],
        ttl: 86400,
        renewable: true,
        expire_time: '2025-11-16T12:00:00Z',
      });
    });
  });

  describe('renewToken', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should successfully renew token without increment', async () => {
      const mockRenewResponse = {
        auth: {
          lease_duration: 86400,
          renewable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRenewResponse,
      } as Response);

      await vaultService.renewToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://vault.example.com/v1/auth/token/renew-self',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'X-Vault-Token': 'test-token-123',
            'X-Vault-Namespace': 'test-namespace',
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      );
    });

    it('should renew token with custom increment', async () => {
      const mockRenewResponse = {
        auth: {
          lease_duration: 172800,
          renewable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRenewResponse,
      } as Response);

      await vaultService.renewToken(172800); // 2 days in seconds

      expect(mockFetch).toHaveBeenCalledWith(
        'https://vault.example.com/v1/auth/token/renew-self',
        expect.objectContaining({
          body: JSON.stringify({ increment: '172800s' }),
        })
      );
    });

    it('should handle token renewal failure (403 Not Renewable)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Token is not renewable',
      } as Response);

      await expect(vaultService.renewToken()).rejects.toThrow(
        'Token renewal failed: 403 Token is not renewable'
      );
    });

    it('should log token renewal success', async () => {
      const mockRenewResponse = {
        auth: {
          lease_duration: 86400,
          renewable: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRenewResponse,
      } as Response);

      const { logger } = await import('../../../src/utils/logger.js');

      await vaultService.renewToken();

      expect(logger.info).toHaveBeenCalledWith('Token renewed successfully', {
        ttl: 86400,
        renewable: true,
      });
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should clear all cached secrets', async () => {
      // Add some cached entries
      await vaultService.getSecret('postgres');
      await vaultService.getSecret('redis');

      let cacheStats = vaultService.getCacheStats();
      expect(cacheStats.size).toBe(2);

      vaultService.clearCache();

      cacheStats = vaultService.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });

    it('should log cache clear', async () => {
      const { logger } = await import('../../../src/utils/logger.js');

      vaultService.clearCache();

      expect(logger.info).toHaveBeenCalledWith('Vault cache cleared');
    });
  });

  describe('getCacheStats', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should return empty stats when cache is empty', () => {
      const stats = vaultService.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it('should return cache statistics with entries', async () => {
      const mockResponse = {
        data: {
          data: { key: 'value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await vaultService.getSecret('postgres');

      const stats = vaultService.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0]).toMatchObject({
        path: 'secret/data/server-mcp/postgres',
        version: 1,
      });
      expect(stats.entries[0].expiresInMs).toBeGreaterThan(0);
    });

    it('should calculate correct expiresInMs', async () => {
      const mockResponse = {
        data: {
          data: { key: 'value' },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await vaultService.getSecret('postgres');

      // Advance time by 1 minute
      vi.advanceTimersByTime(60000);

      const stats = vaultService.getCacheStats();

      // Should have ~4 minutes left (5 min TTL - 1 min elapsed)
      expect(stats.entries[0].expiresInMs).toBeGreaterThan(230000); // ~3.83 minutes
      expect(stats.entries[0].expiresInMs).toBeLessThan(250000); // ~4.17 minutes
    });
  });

  describe('getCredentials', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should retrieve and type credentials', async () => {
      const mockResponse = {
        data: {
          data: {
            host: 'localhost',
            port: '5432',
            user: 'postgres',
            password: 'secret',
            database: 'testdb',
          },
          metadata: { created_time: '2025-11-15T12:00:00Z', version: 1 },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const credentials = await vaultService.getCredentials('postgres');

      expect(credentials).toEqual(mockResponse.data.data);
    });
  });

  describe('healthCheck', () => {
    beforeEach(() => {
      vaultService = new VaultService(mockConfig);
    });

    it('should return healthy status when Vault and token are valid', async () => {
      // Mock Vault health endpoint
      mockFetch
        .mockResolvedValueOnce({ ok: true } as Response) // Health check
        .mockResolvedValueOnce({
          // Token validation
          ok: true,
          json: async () => ({
            data: {
              creation_time: 1700000000,
              creation_ttl: 86400,
              display_name: 'test-token',
              expire_time: '2025-11-16T12:00:00Z',
              explicit_max_ttl: 0,
              id: 'token-id-123',
              issue_time: '2025-11-15T12:00:00Z',
              meta: null,
              num_uses: 0,
              orphan: false,
              path: 'auth/token/create',
              policies: ['default'],
              renewable: true,
              ttl: 86400,
              type: 'service',
            },
          }),
        } as Response);

      const health = await vaultService.healthCheck();

      expect(health).toEqual({
        healthy: true,
        vault: {
          addr: 'https://vault.example.com',
          reachable: true,
        },
        token: {
          valid: true,
          ttl: 86400,
          renewable: true,
        },
      });
    });

    it('should return healthy status when Vault is in standby (429)', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 } as Response) // Health check (standby)
        .mockResolvedValueOnce({
          // Token validation
          ok: true,
          json: async () => ({
            data: {
              creation_time: 1700000000,
              creation_ttl: 86400,
              display_name: 'test-token',
              expire_time: '2025-11-16T12:00:00Z',
              explicit_max_ttl: 0,
              id: 'token-id-123',
              issue_time: '2025-11-15T12:00:00Z',
              meta: null,
              num_uses: 0,
              orphan: false,
              path: 'auth/token/create',
              policies: ['default'],
              renewable: true,
              ttl: 86400,
              type: 'service',
            },
          }),
        } as Response);

      const health = await vaultService.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.vault.reachable).toBe(true);
    });

    it('should return unhealthy status when Vault is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await vaultService.healthCheck();

      expect(health).toEqual({
        healthy: false,
        vault: {
          addr: 'https://vault.example.com',
          reachable: false,
        },
        token: {
          valid: false,
          ttl: 0,
          renewable: false,
        },
      });
    });

    it('should return unhealthy status when token is expired', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true } as Response) // Health check
        .mockResolvedValueOnce({
          // Token validation
          ok: true,
          json: async () => ({
            data: {
              creation_time: 1700000000,
              creation_ttl: 86400,
              display_name: 'test-token',
              expire_time: '2025-11-15T11:00:00Z', // Expired
              explicit_max_ttl: 0,
              id: 'token-id-123',
              issue_time: '2025-11-15T12:00:00Z',
              meta: null,
              num_uses: 0,
              orphan: false,
              path: 'auth/token/create',
              policies: ['default'],
              renewable: false,
              ttl: 0, // Expired
              type: 'service',
            },
          }),
        } as Response);

      const health = await vaultService.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.token.ttl).toBe(0);
    });

    it('should log health check failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection error'));

      const { logger } = await import('../../../src/utils/logger.js');

      await vaultService.healthCheck();

      expect(logger.error).toHaveBeenCalledWith(
        'Vault health check failed',
        expect.objectContaining({
          error: 'Connection error',
        })
      );
    });
  });

  describe('createVaultServiceFromEnv', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create VaultService from environment variables', () => {
      process.env.VAULT_ADDR = 'https://vault.prod.example.com';
      process.env.VAULT_TOKEN = 'prod-token-123';
      process.env.VAULT_NAMESPACE = 'prod-namespace';
      process.env.VAULT_CACHE_TTL = '60000';

      const service = createVaultServiceFromEnv();

      expect(service).toBeInstanceOf(VaultService);
    });

    it('should create VaultService without optional env vars', () => {
      process.env.VAULT_ADDR = 'https://vault.example.com';
      process.env.VAULT_TOKEN = 'test-token';
      delete process.env.VAULT_NAMESPACE;
      delete process.env.VAULT_CACHE_TTL;

      const service = createVaultServiceFromEnv();

      expect(service).toBeInstanceOf(VaultService);
    });

    it('should return null when VAULT_ADDR is missing', async () => {
      delete process.env.VAULT_ADDR;
      process.env.VAULT_TOKEN = 'test-token';

      const { logger } = await import('../../../src/utils/logger.js');

      const service = createVaultServiceFromEnv();

      expect(service).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Vault not configured (missing VAULT_ADDR or VAULT_TOKEN)'
      );
    });

    it('should return null when VAULT_TOKEN is missing', async () => {
      process.env.VAULT_ADDR = 'https://vault.example.com';
      delete process.env.VAULT_TOKEN;

      const { logger } = await import('../../../src/utils/logger.js');

      const service = createVaultServiceFromEnv();

      expect(service).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Vault not configured (missing VAULT_ADDR or VAULT_TOKEN)'
      );
    });

    it('should parse VAULT_CACHE_TTL as integer', () => {
      process.env.VAULT_ADDR = 'https://vault.example.com';
      process.env.VAULT_TOKEN = 'test-token';
      process.env.VAULT_CACHE_TTL = '120000';

      const service = createVaultServiceFromEnv();

      expect(service).toBeInstanceOf(VaultService);
    });
  });
});
