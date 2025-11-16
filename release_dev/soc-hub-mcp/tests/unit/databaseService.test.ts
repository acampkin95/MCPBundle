/**
 * Unit tests for DatabaseService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from '../../src/services/databaseService.js';

// Mock pg module
vi.mock('pg', () => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const mockConnect = vi.fn().mockResolvedValue({
    query: mockQuery,
    release: vi.fn(),
  });

  return {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockQuery,
      connect: mockConnect,
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    dbService = new DatabaseService({
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
      password: 'testpass',
    });
  });

  afterEach(async () => {
    await dbService.close();
  });

  describe('initialization', () => {
    it('should create a database service instance', () => {
      expect(dbService).toBeDefined();
    });

    it('should accept custom pool configuration', () => {
      const customDbService = new DatabaseService({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        max: 30,
        min: 5,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 15000,
      });

      expect(customDbService).toBeDefined();
    });

    it('should accept SSL configuration', () => {
      const sslDbService = new DatabaseService({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        ssl: true,
      });

      expect(sslDbService).toBeDefined();
    });
  });

  describe('query execution', () => {
    it('should execute a query successfully', async () => {
      const result = await dbService.query('SELECT 1');
      expect(result).toBeDefined();
    });

    it('should execute a query with parameters', async () => {
      const result = await dbService.query('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toBeDefined();
    });

    it('should track query metrics', async () => {
      await dbService.query('SELECT 1');
      await dbService.query('SELECT 2');

      const metrics = dbService.getQueryMetrics();
      expect(metrics.total).toBeGreaterThan(0);
      expect(metrics.successful).toBeGreaterThan(0);
    });

    it('should calculate average duration', async () => {
      await dbService.query('SELECT 1');
      await dbService.query('SELECT 2');
      await dbService.query('SELECT 3');

      const metrics = dbService.getQueryMetrics();
      expect(metrics.avgDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('prepared statements', () => {
    it('should execute prepared statement', async () => {
      const result = await dbService.queryPrepared(
        'get-user',
        'SELECT * FROM users WHERE id = $1',
        [1]
      );
      expect(result).toBeDefined();
    });

    it('should track prepared statement metrics', async () => {
      await dbService.queryPrepared('test-query', 'SELECT 1', []);

      const metrics = dbService.getQueryMetrics();
      expect(metrics.total).toBeGreaterThan(0);
    });
  });

  describe('pool statistics', () => {
    it('should return pool statistics', () => {
      const stats = dbService.getPoolStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('waiting');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.idle).toBe('number');
      expect(typeof stats.waiting).toBe('number');
    });
  });

  describe('query metrics', () => {
    it('should return query metrics with success rate', async () => {
      await dbService.query('SELECT 1');
      await dbService.query('SELECT 2');

      const metrics = dbService.getQueryMetrics();

      expect(metrics).toHaveProperty('total');
      expect(metrics).toHaveProperty('successful');
      expect(metrics).toHaveProperty('failed');
      expect(metrics).toHaveProperty('avgDurationMs');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
    });

    it('should reset metrics correctly', async () => {
      await dbService.query('SELECT 1');
      await dbService.query('SELECT 2');

      dbService.resetMetrics();

      const metrics = dbService.getQueryMetrics();
      expect(metrics.total).toBe(0);
      expect(metrics.successful).toBe(0);
      expect(metrics.failed).toBe(0);
      expect(metrics.avgDurationMs).toBe(0);
    });
  });

  describe('health check', () => {
    it('should perform health check', async () => {
      const health = await dbService.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(typeof health.healthy).toBe('boolean');
    });

    it('should return latency in health check', async () => {
      const health = await dbService.healthCheck();

      if (health.healthy) {
        expect(health).toHaveProperty('latency_ms');
        expect(typeof health.latency_ms).toBe('number');
      }
    });

    it('should return pool stats in health check', async () => {
      const health = await dbService.healthCheck();

      if (health.healthy) {
        expect(health).toHaveProperty('pool_stats');
        expect(health.pool_stats).toHaveProperty('total');
        expect(health.pool_stats).toHaveProperty('idle');
        expect(health.pool_stats).toHaveProperty('waiting');
      }
    });
  });

  describe('connection management', () => {
    it('should get a client from pool', async () => {
      const client = await dbService.getClient();
      expect(client).toBeDefined();
      expect(client.release).toBeDefined();
      client.release();
    });

    it('should close pool', async () => {
      await expect(dbService.close()).resolves.not.toThrow();
    });
  });

  describe('batch queries', () => {
    it('should execute batch queries', async () => {
      const queries = [
        { text: 'SELECT 1' },
        { text: 'SELECT 2' },
        { text: 'SELECT * FROM users WHERE id = $1', params: [1] },
      ];

      const results = await dbService.batchQuery(queries);
      expect(results).toHaveLength(3);
    });

    it('should execute empty batch', async () => {
      const results = await dbService.batchQuery([]);
      expect(results).toHaveLength(0);
    });
  });
});
