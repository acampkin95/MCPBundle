import { logger } from '../utils/logger.js';
import type { PostgresManagerService } from './postgresManager.js';
import type { RedisManagerService } from './redisManager.js';
import type { KeycloakManagerService } from './keycloakManager.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealth {
  readonly status: HealthStatus;
  readonly message?: string;
  readonly responseTimeMs?: number;
}

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly timestamp: string;
  readonly uptime: number;
  readonly lastHeartbeat?: string;
  readonly services: {
    readonly postgres: ServiceHealth;
    readonly redis: ServiceHealth;
    readonly keycloak: ServiceHealth;
    readonly nginx: ServiceHealth;
  };
  readonly system: {
    readonly memory: {
      readonly usedMB: number;
      readonly totalMB: number;
      readonly percentUsed: number;
    };
    readonly cpu: {
      readonly user: number;
      readonly system: number;
    };
  };
}

/**
 * HealthCheckService provides health status for monitoring
 */
export class HealthCheckService {
  private lastHeartbeat: Date | null = null;

  public constructor(
    private readonly postgresManager: PostgresManagerService | null,
    private readonly redisManager: RedisManagerService | null,
    private readonly keycloakManager: KeycloakManagerService | null
  ) {
    logger.info('HealthCheckService initialized');
  }

  /**
   * Update last heartbeat timestamp (called by AutoDiscoveryService)
   */
  public recordHeartbeat(): void {
    this.lastHeartbeat = new Date();
  }

  /**
   * Get comprehensive health status
   */
  public async getHealth(): Promise<HealthCheckResult> {
    const services = {
      postgres: await this.checkPostgres(),
      redis: await this.checkRedis(),
      keycloak: await this.checkKeycloak(),
      nginx: await this.checkNginx(),
    };

    // Determine overall status
    const serviceStatuses = Object.values(services).map((s) => s.status);
    let overallStatus: HealthStatus = 'healthy';

    if (serviceStatuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (serviceStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Get memory usage
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;

    // Get CPU usage
    const cpuUsage = process.cpuUsage();

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      lastHeartbeat: this.lastHeartbeat?.toISOString(),
      services,
      system: {
        memory: {
          usedMB: Math.round(usedMem / 1024 / 1024),
          totalMB: Math.round(totalMem / 1024 / 1024),
          percentUsed: Math.round((usedMem / totalMem) * 100),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
      },
    };
  }

  /**
   * Check PostgreSQL health
   */
  private async checkPostgres(): Promise<ServiceHealth> {
    if (!this.postgresManager) {
      return {
        status: 'degraded',
        message: 'PostgreSQL service not configured',
      };
    }

    const start = Date.now();
    try {
      // Try to get connection stats as a health check
      await this.postgresManager.getActiveConnections();
      return {
        status: 'healthy',
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      logger.error('PostgreSQL health check failed', { error });
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<ServiceHealth> {
    if (!this.redisManager) {
      return {
        status: 'degraded',
        message: 'Redis service not configured',
      };
    }

    const start = Date.now();
    try {
      // Try to ping Redis
      await this.redisManager.ping();
      return {
        status: 'healthy',
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  /**
   * Check Keycloak health
   */
  private async checkKeycloak(): Promise<ServiceHealth> {
    if (!this.keycloakManager) {
      return {
        status: 'degraded',
        message: 'Keycloak service not configured',
      };
    }

    const start = Date.now();
    try {
      // Try to get realm stats as a health check
      await this.keycloakManager.getRealmStats();
      return {
        status: 'healthy',
        responseTimeMs: Date.now() - start,
      };
    } catch (error) {
      logger.error('Keycloak health check failed', { error });
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      };
    }
  }

  /**
   * Check NGINX health (basic file check)
   */
  private async checkNginx(): Promise<ServiceHealth> {
    try {
      // Simple check - just verify NGINX config path exists
      const { accessSync, constants } = await import('node:fs');
      const configPath = process.env.NGINX_CONFIG_PATH ?? '/etc/nginx/nginx.conf';

      accessSync(configPath, constants.R_OK);

      return {
        status: 'healthy',
        message: 'NGINX config accessible',
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'NGINX config not accessible',
      };
    }
  }
}
