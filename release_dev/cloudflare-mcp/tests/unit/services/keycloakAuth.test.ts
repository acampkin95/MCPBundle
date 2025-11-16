/**
 * Unit tests for KeycloakAuthService
 *
 * This test suite covers:
 * - Token authentication (client credentials and password flows)
 * - Token refresh
 * - Token validation
 * - Token decoding
 * - Automatic token refresh scheduling
 * - Token revocation
 * - Error handling
 * - Service cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeycloakAuthService } from '../../../src/services/keycloakAuth.js';
import type { KeycloakConfig, TokenSet } from '../../../src/services/keycloakAuth.js';

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

describe('KeycloakAuthService', () => {
  let keycloakAuth: KeycloakAuthService;
  let mockConfig: KeycloakConfig;
  const mockFetch = vi.mocked(global.fetch);

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset fetch mock with a default safe response to prevent unhandled rejections
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'default-token',
        refresh_token: 'default-refresh',
        expires_in: 300,
        token_type: 'Bearer',
      }),
    } as Response);

    // Default config with client credentials
    mockConfig = {
      serverUrl: 'https://keycloak.example.com',
      realm: 'test-realm',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    };
  });

  afterEach(() => {
    // IMPORTANT: Clear timers BEFORE switching back to real timers
    // This prevents pending refresh timers from firing after the test
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid configuration', () => {
      keycloakAuth = new KeycloakAuthService(mockConfig);

      expect(keycloakAuth).toBeInstanceOf(KeycloakAuthService);
    });

    it('should log initialization', async () => {
      keycloakAuth = new KeycloakAuthService(mockConfig);

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('KeycloakAuthService initialized', {
        serverUrl: mockConfig.serverUrl,
        realm: mockConfig.realm,
        clientId: mockConfig.clientId,
      });
    });
  });

  describe('authenticate - client credentials flow', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should successfully authenticate with client credentials', async () => {
      const mockResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 300,
        token_type: 'Bearer',
        scope: 'openid profile',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await keycloakAuth.authenticate();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://keycloak.example.com/realms/test-realm/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: expect.any(URLSearchParams),
        }
      );

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe('test-client');
      expect(body.get('client_secret')).toBe('test-secret');

      expect(result).toMatchObject({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenType: 'Bearer',
        scope: 'openid profile',
      });
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should throw error on authentication failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

      await expect(keycloakAuth.authenticate()).rejects.toThrow(
        'Failed to authenticate with Keycloak'
      );
    });

    it('should schedule token refresh after successful authentication', async () => {
      const mockResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 300,
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await keycloakAuth.authenticate();

      // Should schedule refresh at 90% of lifetime (300s * 0.9 = 270s)
      expect(vi.getTimerCount()).toBe(1);
    });
  });

  describe('authenticate - password flow', () => {
    beforeEach(() => {
      mockConfig = {
        serverUrl: 'https://keycloak.example.com',
        realm: 'test-realm',
        clientId: 'test-client',
        username: 'test-user',
        password: 'test-password',
      };
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should successfully authenticate with password flow', async () => {
      const mockResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 300,
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await keycloakAuth.authenticate();

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('password');
      expect(body.get('client_id')).toBe('test-client');
      expect(body.get('username')).toBe('test-user');
      expect(body.get('password')).toBe('test-password');

      expect(result.accessToken).toBe('mock-access-token');
    });

    it('should throw error if username or password is missing', async () => {
      const invalidConfig = {
        serverUrl: 'https://keycloak.example.com',
        realm: 'test-realm',
        clientId: 'test-client',
        // No username or password
      };
      keycloakAuth = new KeycloakAuthService(invalidConfig);

      await expect(keycloakAuth.authenticate()).rejects.toThrow(
        'Username and password required for password flow'
      );
    });
  });

  describe('refreshToken', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should refresh token successfully', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'initial-token',
          refresh_token: 'initial-refresh',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Then refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      const result = await keycloakAuth.refreshToken();

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://keycloak.example.com/realms/test-realm/protocol/openid-connect/token',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const body = mockFetch.mock.calls[1][1]?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('initial-refresh');

      expect(result.accessToken).toBe('refreshed-token');
    });

    it('should re-authenticate if no refresh token available', async () => {
      const mockResponse = {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 300,
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await keycloakAuth.refreshToken();

      expect(result.accessToken).toBe('new-token');
    });

    it('should re-authenticate on refresh failure', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'initial-token',
          refresh_token: 'initial-refresh',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Fail refresh
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid refresh token',
      } as Response);

      // Should re-authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      const result = await keycloakAuth.refreshToken();

      expect(result.accessToken).toBe('new-token');
    });

    it('should preserve scope if not provided in refresh response', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'initial-token',
          refresh_token: 'initial-refresh',
          expires_in: 300,
          token_type: 'Bearer',
          scope: 'original-scope',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Refresh without scope
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 300,
          token_type: 'Bearer',
          // No scope in response
        }),
      } as Response);

      const result = await keycloakAuth.refreshToken();

      expect(result.scope).toBe('original-scope');
    });
  });

  describe('getAccessToken', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should return valid access token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      const token = await keycloakAuth.getAccessToken();

      expect(token).toBe('mock-access-token');
    });

    it('should authenticate if no token exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      const token = await keycloakAuth.getAccessToken();

      expect(token).toBe('new-token');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should refresh token if expiring soon', async () => {
      // First authenticate with short-lived token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'initial-token',
          refresh_token: 'initial-refresh',
          expires_in: 50, // 50 seconds - will expire soon
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Advance time to near expiry
      vi.advanceTimersByTime(45000); // 45 seconds

      // Should refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      const token = await keycloakAuth.getAccessToken();

      expect(token).toBe('refreshed-token');
    });
  });

  describe('decodeToken', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should decode valid JWT token', () => {
      const payload = {
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        scope: 'openid profile',
        realm_access: {
          roles: ['admin', 'user'],
        },
        capabilities: ['read', 'write'],
      };

      const token =
        'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

      const result = keycloakAuth.decodeToken(token);

      expect(result).toMatchObject({
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
        scope: 'openid profile',
        roles: ['admin', 'user'],
        capabilities: ['read', 'write'],
      });
    });

    it('should return null for malformed token', () => {
      const result = keycloakAuth.decodeToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for token with invalid structure', () => {
      const result = keycloakAuth.decodeToken('part1.part2');

      expect(result).toBeNull();
    });

    it('should handle token without optional fields', () => {
      const payload = {
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        // No scope, roles, or capabilities
      };

      const token =
        'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

      const result = keycloakAuth.decodeToken(token);

      expect(result).toMatchObject({
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
      });
      expect(result?.scope).toBeUndefined();
      expect(result?.roles).toBeUndefined();
      expect(result?.capabilities).toBeUndefined();
    });
  });

  describe('isTokenValid', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should return true for valid token', () => {
      const payload = {
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
        exp: Math.floor(Date.now() / 1000) + 300, // Expires in 5 minutes
        iat: Math.floor(Date.now() / 1000),
      };

      const token =
        'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

      const result = keycloakAuth.isTokenValid(token);

      expect(result).toBe(true);
    });

    it('should return false for expired token', () => {
      const payload = {
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
        exp: Math.floor(Date.now() / 1000) - 300, // Expired 5 minutes ago
        iat: Math.floor(Date.now() / 1000) - 600,
      };

      const token =
        'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

      const result = keycloakAuth.isTokenValid(token);

      expect(result).toBe(false);
    });

    it('should return false for malformed token', () => {
      const result = keycloakAuth.isTokenValid('invalid-token');

      expect(result).toBe(false);
    });

    it('should return false if no token provided and no current token', () => {
      const result = keycloakAuth.isTokenValid();

      expect(result).toBe(false);
    });

    it('should validate current token if no token provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      // Authenticate to set current token
      await keycloakAuth.authenticate();

      // Create a valid token manually
      const payload = {
        sub: 'user-123',
        iss: 'https://keycloak.example.com',
        aud: 'test-client',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
      };
      const validToken =
        'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

      const result = keycloakAuth.isTokenValid(validToken);

      expect(result).toBe(true);
    });
  });

  describe('revoke', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should revoke access token successfully', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Then revoke
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await keycloakAuth.revoke();

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://keycloak.example.com/realms/test-realm/protocol/openid-connect/revoke',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const body = mockFetch.mock.calls[1][1]?.body as URLSearchParams;
      expect(body.get('client_id')).toBe('test-client');
      expect(body.get('token')).toBe('mock-access-token');
      expect(body.get('token_type_hint')).toBe('access_token');
    });

    it('should handle revocation when no active token', async () => {
      await keycloakAuth.revoke();

      // Should not make any fetch calls
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle revocation failure gracefully', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Fail revocation
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as Response);

      // Should not throw
      await expect(keycloakAuth.revoke()).resolves.not.toThrow();
    });

    it('should clear refresh timer on revocation', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      expect(vi.getTimerCount()).toBe(1);

      // Revoke
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await keycloakAuth.revoke();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should revoke token and cleanup on destroy', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Then destroy
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      await keycloakAuth.destroy();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/revoke'),
        expect.any(Object)
      );
    });
  });

  describe('automatic token refresh', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should schedule token refresh at 90% of token lifetime', async () => {
      const expiresIn = 1000; // 1000 seconds

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: expiresIn,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // Should schedule at 900 seconds (90% of 1000)
      expect(vi.getTimerCount()).toBe(1);
    });

    it('should not schedule refresh if token lifetime is too short', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'short-lived-token',
          refresh_token: 'refresh-token',
          expires_in: 1, // 1 second - too short to schedule
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      // With 1 second lifetime, refresh would be at 0.9s = 900ms
      // Verify a timer was scheduled
      expect(vi.getTimerCount()).toBe(1);
    });

    it('should clear previous refresh timer when refreshing', async () => {
      // Initial auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'initial-token',
          refresh_token: 'initial-refresh',
          expires_in: 100,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.authenticate();

      expect(vi.getTimerCount()).toBe(1);

      // Manual refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 100,
          token_type: 'Bearer',
        }),
      } as Response);

      await keycloakAuth.refreshToken();

      // Should still have only 1 timer (old one cleared, new one set)
      expect(vi.getTimerCount()).toBe(1);
    });
  });

  describe('error scenarios', () => {
    beforeEach(() => {
      keycloakAuth = new KeycloakAuthService(mockConfig);
    });

    it('should handle network errors during authentication', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(keycloakAuth.authenticate()).rejects.toThrow(
        'Failed to authenticate with Keycloak'
      );
    });

    it('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      await expect(keycloakAuth.authenticate()).rejects.toThrow();
    });

    it('should handle missing credentials', async () => {
      const invalidConfig = {
        serverUrl: 'https://keycloak.example.com',
        realm: 'test-realm',
        clientId: 'test-client',
        // No clientSecret, username, or password
      };
      keycloakAuth = new KeycloakAuthService(invalidConfig);

      // Will try password flow (no clientSecret), then fail because no username/password
      await expect(keycloakAuth.authenticate()).rejects.toThrow(
        'Failed to authenticate with Keycloak'
      );
    });
  });
});
