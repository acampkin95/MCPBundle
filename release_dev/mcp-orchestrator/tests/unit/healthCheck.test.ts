/**
 * Unit tests for HealthCheckService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckService } from '@/services/healthCheck.js';
import type { PostgresManagerService } from '@/services/postgresManager.js';
import type { RedisManagerService } from '@/services/redisManager.js';
import type { KeycloakManagerService } from '@/services/keycloakManager.js';

describe('HealthCheckService', () => {
  let healthService: HealthCheckService;
  let mockPostgres: Partial<PostgresManagerService>;
  let mockRedis: Partial<RedisManagerService>;
  let mockKeycloak: Partial<KeycloakManagerService>;

  beforeEach(() => {
    // Create mock services
    mockPostgres = {
      getActiveConnections: vi.fn().mockResolvedValue({ total: 5, active: 2 }),
    };

    mockRedis = {
      ping: vi.fn().mockResolvedValue('PONG'),
    };

    mockKeycloak = {
      getRealmStats: vi.fn().mockResolvedValue({ users: 100, groups: 5 }),
    };

    healthService = new HealthCheckService(
      mockPostgres as PostgresManagerService,
      mockRedis as RedisManagerService,
      mockKeycloak as KeycloakManagerService
    );
  });

  describe('getHealth', () => {
    it('should return healthy status when all services are healthy', async () => {
      const health = await healthService.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.services.postgres.status).toBe('healthy');
      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.keycloak.status).toBe('healthy');
    });

    it('should return degraded status when a service is degraded', async () => {
      healthService = new HealthCheckService(null, mockRedis as RedisManagerService, mockKeycloak as KeycloakManagerService);

      const health = await healthService.getHealth();

      expect(health.status).toBe('degraded');
      expect(health.services.postgres.status).toBe('degraded');
      expect(health.services.postgres.message).toContain('not configured');
    });

    it('should return unhealthy status when a service is unhealthy', async () => {
      mockPostgres.getActiveConnections = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const health = await healthService.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.services.postgres.status).toBe('unhealthy');
      expect(health.services.postgres.message).toContain('Connection refused');
    });

    it('should include response time for services', async () => {
      const health = await healthService.getHealth();

      expect(health.services.postgres.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(health.services.redis.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(health.services.keycloak.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include system metrics', async () => {
      const health = await healthService.getHealth();

      expect(health.system.memory.usedMB).toBeGreaterThan(0);
      expect(health.system.memory.totalMB).toBeGreaterThan(0);
      expect(health.system.memory.percentUsed).toBeGreaterThanOrEqual(0);
      expect(health.system.memory.percentUsed).toBeLessThanOrEqual(100);
      expect(health.system.cpu.user).toBeGreaterThanOrEqual(0);
      expect(health.system.cpu.system).toBeGreaterThanOrEqual(0);
    });

    it('should include uptime', async () => {
      const health = await healthService.getHealth();

      expect(health.uptime).toBeGreaterThan(0);
      expect(typeof health.uptime).toBe('number');
    });

    it('should include timestamp', async () => {
      const health = await healthService.getHealth();

      // Verify it's a valid ISO string
      expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
      // Timestamp should be recent (within last second)
      const now = Date.now();
      const timestamp = new Date(health.timestamp).getTime();
      expect(now - timestamp).toBeLessThan(1000);
    });
  });

  describe('recordHeartbeat', () => {
    it('should update lastHeartbeat timestamp', async () => {
      const before = await healthService.getHealth();
      expect(before.lastHeartbeat).toBeUndefined();

      healthService.recordHeartbeat();

      const after = await healthService.getHealth();
      expect(after.lastHeartbeat).toBeDefined();
    });

    it('should update heartbeat on multiple calls', async () => {
      healthService.recordHeartbeat();
      const first = await healthService.getHealth();
      const firstHeartbeat = first.lastHeartbeat;

      await new Promise((resolve) => setTimeout(resolve, 10));

      healthService.recordHeartbeat();
      const second = await healthService.getHealth();
      const secondHeartbeat = second.lastHeartbeat;

      // Compare as dates since they're ISO strings
      expect(new Date(secondHeartbeat!).getTime()).toBeGreaterThan(new Date(firstHeartbeat!).getTime());
    });
  });

  describe('service checks', () => {
    it('should handle postgres check failure gracefully', async () => {
      mockPostgres.getActiveConnections = vi.fn().mockRejectedValue(new Error('DB timeout'));

      const health = await healthService.getHealth();

      expect(health.services.postgres.status).toBe('unhealthy');
      expect(health.services.postgres.message).toBe('DB timeout');
    });

    it('should handle redis check failure gracefully', async () => {
      mockRedis.ping = vi.fn().mockRejectedValue(new Error('Redis down'));

      const health = await healthService.getHealth();

      expect(health.services.redis.status).toBe('unhealthy');
      expect(health.services.redis.message).toBe('Redis down');
    });

    it('should handle keycloak check failure gracefully', async () => {
      mockKeycloak.getRealmStats = vi.fn().mockRejectedValue(new Error('Auth failed'));

      const health = await healthService.getHealth();

      expect(health.services.keycloak.status).toBe('unhealthy');
      expect(health.services.keycloak.message).toBe('Auth failed');
    });

    it('should handle nginx check with accessible config', async () => {
      const health = await healthService.getHealth();

      // NGINX check depends on file system, might be degraded
      expect(['healthy', 'degraded']).toContain(health.services.nginx.status);
    });
  });

  describe('status determination', () => {
    it('should prioritize unhealthy over degraded', async () => {
      mockPostgres.getActiveConnections = vi.fn().mockRejectedValue(new Error('DB down'));
      healthService = new HealthCheckService(
        mockPostgres as PostgresManagerService,
        null, // degraded
        mockKeycloak as KeycloakManagerService
      );

      const health = await healthService.getHealth();

      expect(health.status).toBe('unhealthy');
    });

    it('should show degraded when no unhealthy services', async () => {
      healthService = new HealthCheckService(null, null, null);

      const health = await healthService.getHealth();

      expect(health.status).toBe('degraded');
    });

    it('should show healthy when all configured services are healthy', async () => {
      const health = await healthService.getHealth();

      // All mocks return successful results, but nginx might be degraded
      // Overall should be healthy or degraded (not unhealthy)
      expect(['healthy', 'degraded']).toContain(health.status);
      expect(health.services.postgres.status).toBe('healthy');
      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.keycloak.status).toBe('healthy');
    });
  });

  describe('performance', () => {
    it('should complete health check in < 1 second', async () => {
      const start = Date.now();
      await healthService.getHealth();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent health checks', async () => {
      const checks = Array.from({ length: 10 }, () => healthService.getHealth());

      const results = await Promise.all(checks);

      expect(results).toHaveLength(10);
      results.forEach((health) => {
        expect(health.status).toBeDefined();
      });
    });

    it('should not leak memory on repeated checks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        await healthService.getHealth();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (< 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('edge cases', () => {
    it('should handle null services gracefully', async () => {
      healthService = new HealthCheckService(null, null, null);

      const health = await healthService.getHealth();

      expect(health.services.postgres.status).toBe('degraded');
      expect(health.services.redis.status).toBe('degraded');
      expect(health.services.keycloak.status).toBe('degraded');
    });

    it('should handle service throwing non-Error object', async () => {
      mockPostgres.getActiveConnections = vi.fn().mockRejectedValue('string error');

      const health = await healthService.getHealth();

      expect(health.services.postgres.status).toBe('unhealthy');
      expect(health.services.postgres.message).toBe('string error');
    });

    it('should handle very slow service check', async () => {
      mockRedis.ping = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('PONG'), 500);
          })
      );

      const start = Date.now();
      const health = await healthService.getHealth();
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(500);
      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.redis.responseTimeMs).toBeGreaterThanOrEqual(500);
    });
  });

  describe('service response times', () => {
    it('should track postgres response time accurately', async () => {
      let callTime = 0;
      mockPostgres.getActiveConnections = vi.fn().mockImplementation(() => {
        callTime = Date.now();
        return Promise.resolve({ total: 5, active: 2 });
      });

      const health = await healthService.getHealth();

      expect(health.services.postgres.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(callTime).toBeGreaterThan(0);
    });

    it('should include response time even on failure', async () => {
      mockPostgres.getActiveConnections = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 100);
          })
      );

      const health = await healthService.getHealth();

      expect(health.services.postgres.status).toBe('unhealthy');
      expect(health.services.postgres.responseTimeMs).toBeGreaterThanOrEqual(100);
    });
  });
});
