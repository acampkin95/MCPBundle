/**
 * PostgreSQL Database Service
 * Provides connection pooling, query optimization, and health monitoring
 */

import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { logger } from '../utils/logger.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  queryTimeout?: number;
  ssl?: boolean;
}

export interface QueryMetrics {
  total: number;
  successful: number;
  failed: number;
  avgDurationMs: number;
}

export class DatabaseService {
  private pool: Pool;
  private queryMetrics: QueryMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    avgDurationMs: 0,
  };
  private totalDuration: number = 0;

  public constructor(config: DatabaseConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max ?? 20, // Maximum pool size
      min: config.min ?? 2, // Minimum pool size
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000, // 30 seconds
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000, // 10 seconds
      query_timeout: config.queryTimeout ?? 30000, // 30 seconds
    };

    if (config.ssl) {
      poolConfig.ssl = {
        rejectUnauthorized: false,
      };
    }

    this.pool = new Pool(poolConfig);

    // Log pool events
    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    this.pool.on('acquire', () => {
      logger.debug('Database connection acquired from pool');
    });

    this.pool.on('remove', () => {
      logger.debug('Database connection removed from pool');
    });

    this.pool.on('error', (error) => {
      logger.error('Unexpected database pool error:', error);
    });

    logger.info(`Database pool created: ${config.host}:${config.port}/${config.database}`);
  }

  /**
   * Execute a query with automatic connection management
   */
  public async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    this.queryMetrics.total++;

    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      this.queryMetrics.successful++;
      this.totalDuration += duration;
      this.queryMetrics.avgDurationMs = this.totalDuration / this.queryMetrics.successful;

      logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 100)}...`);

      return result;
    } catch (error) {
      this.queryMetrics.failed++;
      logger.error('Database query failed:', { error, query: text.substring(0, 100) });
      throw error;
    }
  }

  /**
   * Execute a query with a prepared statement
   */
  public async queryPrepared<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    this.queryMetrics.total++;

    try {
      const result = await this.pool.query<T>({
        name,
        text,
        values: params,
      });

      const duration = Date.now() - start;
      this.queryMetrics.successful++;
      this.totalDuration += duration;
      this.queryMetrics.avgDurationMs = this.totalDuration / this.queryMetrics.successful;

      logger.debug(`Prepared query executed in ${duration}ms: ${name}`);

      return result;
    } catch (error) {
      this.queryMetrics.failed++;
      logger.error('Prepared query failed:', { error, name });
      throw error;
    }
  }

  /**
   * Get a connection from the pool for transactions
   */
  public async getClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      logger.error('Failed to get database client from pool:', error);
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result: T = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get connection pool statistics
   */
  public getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
  } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  /**
   * Get query metrics
   */
  public getQueryMetrics(): QueryMetrics & { successRate: number } {
    const successRate = this.queryMetrics.total > 0
      ? this.queryMetrics.successful / this.queryMetrics.total
      : 0;

    return {
      ...this.queryMetrics,
      successRate,
    };
  }

  /**
   * Reset query metrics
   */
  public resetMetrics(): void {
    this.queryMetrics = {
      total: 0,
      successful: 0,
      failed: 0,
      avgDurationMs: 0,
    };
    this.totalDuration = 0;
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    latency_ms?: number;
    pool_stats?: { total: number; idle: number; waiting: number };
  }> {
    try {
      const start = Date.now();
      await this.pool.query('SELECT 1');
      const latency_ms = Date.now() - start;

      return {
        healthy: true,
        latency_ms,
        pool_stats: this.getPoolStats(),
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return { healthy: false };
    }
  }

  /**
   * Close all connections in the pool
   */
  public async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Error closing database pool:', error);
      throw error;
    }
  }

  /**
   * Execute a batch of queries with connection reuse
   */
  public async batchQuery<T extends Record<string, unknown> = Record<string, unknown>>(
    queries: Array<{ text: string; params?: unknown[] }>
  ): Promise<Array<QueryResult<T>>> {
    const client = await this.getClient();
    const results: Array<QueryResult<T>> = [];

    try {
      for (const query of queries) {
        const result = await client.query<T>(query.text, query.params);
        results.push(result);
      }
      return results;
    } finally {
      client.release();
    }
  }
}
