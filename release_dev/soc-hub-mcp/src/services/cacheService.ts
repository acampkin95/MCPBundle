/**
 * Redis Cache Service
 * Provides caching functionality with TTL and invalidation strategies
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  enabled?: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

export class CacheService {
  private client: RedisClientType | null = null;
  private enabled: boolean;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  public constructor(config: CacheConfig) {
    this.enabled = config.enabled ?? true;

    if (!this.enabled) {
      logger.info('Redis caching is disabled');
      return;
    }

    this.client = createClient({
      socket: {
        host: config.host,
        port: config.port,
      },
      password: config.password,
      database: config.db ?? 0,
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
      this.metrics.errors++;
    });

    this.client.on('connect', () => {
      logger.info(`Redis connected to ${config.host}:${config.port}`);
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.connect();
      logger.info('Redis cache service connected');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.metrics.errors++;
      // Don't throw - allow service to continue without cache
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.quit();
      logger.info('Redis cache service disconnected');
    } catch (error) {
      logger.error('Failed to disconnect from Redis:', error);
    }
  }

  /**
   * Get value from cache
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.client?.isOpen) {
      this.metrics.misses++;
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value) {
        this.metrics.hits++;
        return JSON.parse(value) as T;
      }
      this.metrics.misses++;
      return null;
    } catch (error) {
      logger.error(`Cache get failed for key: ${key}`, error);
      this.metrics.errors++;
      this.metrics.misses++;
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  public async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.enabled || !this.client?.isOpen) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      this.metrics.sets++;
    } catch (error) {
      logger.error(`Cache set failed for key: ${key}`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Delete key from cache
   */
  public async delete(key: string): Promise<void> {
    if (!this.enabled || !this.client?.isOpen) {
      return;
    }

    try {
      await this.client.del(key);
      this.metrics.deletes++;
    } catch (error) {
      logger.error(`Cache delete failed for key: ${key}`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Delete keys matching pattern
   */
  public async deletePattern(pattern: string): Promise<void> {
    if (!this.enabled || !this.client?.isOpen) {
      return;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        this.metrics.deletes += keys.length;
      }
    } catch (error) {
      logger.error(`Cache deletePattern failed for pattern: ${pattern}`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Check if key exists
   */
  public async exists(key: string): Promise<boolean> {
    if (!this.enabled || !this.client?.isOpen) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists check failed for key: ${key}`, error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  public async getTTL(key: string): Promise<number> {
    if (!this.enabled || !this.client?.isOpen) {
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Cache getTTL failed for key: ${key}`, error);
      this.metrics.errors++;
      return -1;
    }
  }

  /**
   * Flush all cache data
   */
  public async flush(): Promise<void> {
    if (!this.enabled || !this.client?.isOpen) {
      return;
    }

    try {
      await this.client.flushDb();
      logger.info('Cache flushed');
    } catch (error) {
      logger.error('Cache flush failed:', error);
      this.metrics.errors++;
    }
  }

  /**
   * Get cache metrics
   */
  public getMetrics(): CacheMetrics & { hitRate: number } {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? this.metrics.hits / total : 0;

    return {
      ...this.metrics,
      hitRate,
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ healthy: boolean; latency_ms?: number }> {
    if (!this.enabled || !this.client?.isOpen) {
      return { healthy: false };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency_ms = Date.now() - start;
      return { healthy: true, latency_ms };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return { healthy: false };
    }
  }
}
