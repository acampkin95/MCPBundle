/**
 * Unit tests for PostgresManagerService
 *
 * This test suite covers:
 * - Connection pooling
 * - Query execution
 * - Transaction management
 * - Error handling
 * - Health checks
 * - Active connections monitoring
 * - Replication lag metrics
 * - Table bloat detection
 * - Slow query analysis
 * - Index usage statistics
 * - VACUUM operations
 * - REINDEX operations
 * - Backup creation
 * - Graceful shutdown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostgresManagerService } from '../../../src/services/postgresManager.js';
import type { CommandRunner } from '../../../src/utils/commandRunner.js';
import pg from 'pg';

// Mock the logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock pg module
vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn(),
    },
  };
});

// Mock validators with default implementations
vi.mock('../../../src/utils/validators.js', () => ({
  validateDatabaseName: vi.fn(() => true), // Default to valid
  sanitizeShellArg: vi.fn((arg) => arg),
}));

describe('PostgresManagerService', () => {
  let postgresManager: PostgresManagerService;
  let mockPool: any;
  let mockRunner: CommandRunner;
  const PoolMock = vi.mocked(pg.Pool);

  beforeEach(async () => {
    // Create mock pool instance
    mockPool = {
      options: {
        host: 'localhost',
        database: 'mcp_ecosystem',
      },
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
    };

    // Mock the Pool constructor
    PoolMock.mockReturnValue(mockPool as any);

    // Create mock command runner
    mockRunner = {
      run: vi.fn(),
    } as any;

    // Reset validator mocks to default (valid)
    const { validateDatabaseName, sanitizeShellArg } = await import(
      '../../../src/utils/validators.js'
    );
    vi.mocked(validateDatabaseName).mockReturnValue(true);
    vi.mocked(sanitizeShellArg).mockImplementation((arg) => arg);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default configuration from environment', () => {
      process.env.POSTGRES_HOST = 'test-host';
      process.env.POSTGRES_PORT = '5433';
      process.env.POSTGRES_USER = 'test_user';
      process.env.POSTGRES_PASSWORD = 'test_password';
      process.env.POSTGRES_DB = 'test_db';
      process.env.POSTGRES_MAX_CONNECTIONS = '50';

      postgresManager = new PostgresManagerService(mockRunner);

      expect(PoolMock).toHaveBeenCalledWith({
        host: 'test-host',
        port: 5433,
        user: 'test_user',
        password: 'test_password',
        database: 'test_db',
        max: 50,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    });

    it('should create instance with custom configuration', () => {
      const customConfig = {
        host: 'custom-host',
        port: 7000,
        user: 'custom_user',
        password: 'custom_pass',
        database: 'custom_db',
        max: 100,
      };

      postgresManager = new PostgresManagerService(mockRunner, customConfig);

      expect(PoolMock).toHaveBeenCalledWith(customConfig);
    });

    it('should use defaults when environment variables are missing', () => {
      const oldHost = process.env.POSTGRES_HOST;
      const oldPort = process.env.POSTGRES_PORT;
      const oldUser = process.env.POSTGRES_USER;
      const oldPassword = process.env.POSTGRES_PASSWORD;
      const oldDb = process.env.POSTGRES_DB;
      const oldMax = process.env.POSTGRES_MAX_CONNECTIONS;

      delete process.env.POSTGRES_HOST;
      delete process.env.POSTGRES_PORT;
      delete process.env.POSTGRES_USER;
      delete process.env.POSTGRES_PASSWORD;
      delete process.env.POSTGRES_DB;
      delete process.env.POSTGRES_MAX_CONNECTIONS;

      postgresManager = new PostgresManagerService(mockRunner);

      expect(PoolMock).toHaveBeenCalledWith({
        host: 'localhost',
        port: 5432,
        user: 'mcp_admin',
        password: undefined,
        database: 'mcp_ecosystem',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Restore env vars
      if (oldHost !== undefined) process.env.POSTGRES_HOST = oldHost;
      if (oldPort !== undefined) process.env.POSTGRES_PORT = oldPort;
      if (oldUser !== undefined) process.env.POSTGRES_USER = oldUser;
      if (oldPassword !== undefined) process.env.POSTGRES_PASSWORD = oldPassword;
      if (oldDb !== undefined) process.env.POSTGRES_DB = oldDb;
      if (oldMax !== undefined) process.env.POSTGRES_MAX_CONNECTIONS = oldMax;
    });
  });

  describe('getActiveConnections', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should return connection statistics', async () => {
      const mockRows = [
        { state: 'active', count: '5' },
        { state: 'idle', count: '3' },
        { state: 'idle in transaction', count: '2' },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getActiveConnections();

      expect(result).toEqual({
        total: 10,
        byState: {
          active: 5,
          idle: 3,
          'idle in transaction': 2,
        },
        idle: 3,
        active: 5,
        waiting: 2,
      });
    });

    it('should handle null state values', async () => {
      const mockRows = [
        { state: null, count: '2' },
        { state: 'active', count: '3' },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getActiveConnections();

      expect(result.byState).toHaveProperty('null', 2);
      expect(result.total).toBe(5);
    });

    it('should aggregate waiting states correctly', async () => {
      const mockRows = [
        { state: 'idle in transaction', count: '2' },
        { state: 'idle in transaction (aborted)', count: '1' },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getActiveConnections();

      expect(result.waiting).toBe(3);
    });
  });

  describe('getReplicationLag', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should return isReplica false for primary server', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ in_recovery: false }],
      });

      const result = await postgresManager.getReplicationLag();

      expect(result).toEqual({
        isReplica: false,
      });
    });

    it('should return replication metrics for replica', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ in_recovery: true }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              replication_state: 'streaming',
              primary_host: 'primary.example.com',
              lag_bytes: 1024,
              lag_seconds: 5.5,
              last_wal_receive: '0/3000000',
              last_wal_replay: '0/2FF0000',
            },
          ],
        });

      const result = await postgresManager.getReplicationLag();

      expect(result).toEqual({
        isReplica: true,
        replicationState: 'streaming',
        primaryHost: 'primary.example.com',
        lagBytes: 1024,
        lagSeconds: 5.5,
        lastWalReceive: '0/3000000',
        lastWalReplay: '0/2FF0000',
      });
    });

    it('should handle replica with no replication data', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ in_recovery: true }],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      const result = await postgresManager.getReplicationLag();

      expect(result).toEqual({
        isReplica: true,
      });
    });

    it('should handle null lag values', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ in_recovery: true }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              replication_state: 'streaming',
              primary_host: 'primary.example.com',
              lag_bytes: null,
              lag_seconds: null,
              last_wal_receive: '0/3000000',
              last_wal_replay: '0/3000000',
            },
          ],
        });

      const result = await postgresManager.getReplicationLag();

      expect(result.lagBytes).toBeUndefined();
      expect(result.lagSeconds).toBeUndefined();
    });
  });

  describe('getTableBloat', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should return table bloat statistics', async () => {
      const mockRows = [
        {
          schema_name: 'public',
          table_name: 'users',
          real_size_mb: 100.5,
          extra_size_mb: 25.3,
          bloat_pct: 25.15,
          dead_tuples: 5000,
        },
        {
          schema_name: 'public',
          table_name: 'orders',
          real_size_mb: 200.75,
          extra_size_mb: 50.2,
          bloat_pct: 25.02,
          dead_tuples: 10000,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getTableBloat();

      expect(result).toEqual([
        {
          schemaName: 'public',
          tableName: 'users',
          realSizeMB: 100.5,
          extraSizeMB: 25.3,
          bloatPct: 25.15,
          deadTuples: 5000,
        },
        {
          schemaName: 'public',
          tableName: 'orders',
          realSizeMB: 200.75,
          extraSizeMB: 50.2,
          bloatPct: 25.02,
          deadTuples: 10000,
        },
      ]);
    });

    it('should handle empty result set', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await postgresManager.getTableBloat();

      expect(result).toEqual([]);
    });
  });

  describe('getSlowQueries', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should return slow query statistics', async () => {
      const mockRows = [
        {
          query: 'SELECT * FROM users WHERE email = $1',
          calls: 1000,
          total_time_ms: 50000.5,
          mean_time_ms: 50.001,
          max_time_ms: 250.5,
          rows: 5000,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getSlowQueries(100);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM pg_stat_statements'),
        [100]
      );
      expect(result).toEqual([
        {
          query: 'SELECT * FROM users WHERE email = $1',
          calls: 1000,
          totalTimeMs: 50000.5,
          meanTimeMs: 50.0,
          maxTimeMs: 250.5,
          rows: 5000,
        },
      ]);
    });

    it('should truncate long queries', async () => {
      const longQuery = 'SELECT * FROM users WHERE ' + 'a '.repeat(200);
      const mockRows = [
        {
          query: longQuery,
          calls: 100,
          total_time_ms: 5000,
          mean_time_ms: 50,
          max_time_ms: 100,
          rows: 500,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getSlowQueries();

      expect(result[0].query.length).toBeLessThanOrEqual(200);
    });

    it('should handle pg_stat_statements extension not available', async () => {
      mockPool.query.mockRejectedValue(new Error('relation "pg_stat_statements" does not exist'));

      const result = await postgresManager.getSlowQueries();

      expect(result).toEqual([]);
    });
  });

  describe('getIndexUsage', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should return index usage statistics', async () => {
      const mockRows = [
        {
          schema_name: 'public',
          table_name: 'users',
          index_name: 'users_email_idx',
          index_size_mb: 15.5,
          scans: 1000,
          tuples_read: 5000,
          tuples_fetched: 4500,
        },
        {
          schema_name: 'public',
          table_name: 'orders',
          index_name: 'orders_user_id_idx',
          index_size_mb: 0.5,
          scans: 0,
          tuples_read: 0,
          tuples_fetched: 0,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getIndexUsage();

      expect(result).toEqual([
        {
          schemaName: 'public',
          tableName: 'users',
          indexName: 'users_email_idx',
          indexSizeMB: 15.5,
          scans: 1000,
          tuplesRead: 5000,
          tuplesFetched: 4500,
          isUnused: false,
        },
        {
          schemaName: 'public',
          tableName: 'orders',
          indexName: 'orders_user_id_idx',
          indexSizeMB: 0.5,
          scans: 0,
          tuplesRead: 0,
          tuplesFetched: 0,
          isUnused: false, // Not unused because size < 10MB
        },
      ]);
    });

    it('should mark large unused indexes as unused', async () => {
      const mockRows = [
        {
          schema_name: 'public',
          table_name: 'legacy',
          index_name: 'legacy_unused_idx',
          index_size_mb: 50.0,
          scans: 0,
          tuples_read: 0,
          tuples_fetched: 0,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      const result = await postgresManager.getIndexUsage();

      expect(result[0].isUnused).toBe(true);
    });
  });

  describe('runVacuum', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should run VACUUM ANALYZE successfully', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };

      mockPool.connect.mockResolvedValue(mockClient);

      const result = await postgresManager.runVacuum('test_db', true);

      expect(mockClient.query).toHaveBeenCalledWith('VACUUM ANALYZE VERBOSE');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.database).toBe('test_db');
      expect(result.analyze).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should run VACUUM without ANALYZE', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };

      mockPool.connect.mockResolvedValue(mockClient);

      const result = await postgresManager.runVacuum('test_db', false);

      expect(mockClient.query).toHaveBeenCalledWith('VACUUM VERBOSE');
      expect(result.analyze).toBe(false);
    });

    it('should handle VACUUM failure', async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error('VACUUM failed')),
        release: vi.fn(),
      };

      mockPool.connect.mockResolvedValue(mockClient);

      const result = await postgresManager.runVacuum('test_db', true);

      expect(result.success).toBe(false);
      expect(result.output).toContain('VACUUM failed');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even on error', async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error('Database error')),
        release: vi.fn(),
      };

      mockPool.connect.mockResolvedValue(mockClient);

      await postgresManager.runVacuum('test_db');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('reindexDatabase', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should reindex database successfully', async () => {
      mockRunner.run = vi.fn().mockResolvedValue({
        stdout: 'REINDEX\nREINDEX\nREINDEX\n',
        stderr: '',
      });

      const result = await postgresManager.reindexDatabase('test_db');

      expect(mockRunner.run).toHaveBeenCalledWith(
        'psql -d test_db -c "REINDEX DATABASE test_db"',
        {
          requiresSudo: false,
          timeoutMs: 300000,
        }
      );
      expect(result.success).toBe(true);
      expect(result.database).toBe('test_db');
      expect(result.tablesReindexed).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid database names', async () => {
      const { validateDatabaseName } = await import('../../../src/utils/validators.js');
      vi.mocked(validateDatabaseName).mockReturnValue(false);

      await expect(postgresManager.reindexDatabase('invalid-db-name')).rejects.toThrow(
        'Invalid database name'
      );
    });

    it('should handle reindex failure', async () => {
      mockRunner.run = vi.fn().mockRejectedValue(new Error('psql command failed'));

      const result = await postgresManager.reindexDatabase('test_db');

      expect(result.success).toBe(false);
      expect(result.tablesReindexed).toBe(0);
      expect(result.output).toContain('psql command failed');
    });

    it('should count reindex operations correctly', async () => {
      mockRunner.run = vi.fn().mockResolvedValue({
        stdout: 'REINDEX\nREINDEX\n',
        stderr: '',
      });

      const result = await postgresManager.reindexDatabase('test_db');

      expect(result.tablesReindexed).toBe(2);
    });
  });

  describe('createBackup', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should create backup successfully', async () => {
      mockRunner.run = vi
        .fn()
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '1048576',
          stderr: '',
        });

      const result = await postgresManager.createBackup('test_db', '/backups');

      expect(mockRunner.run).toHaveBeenCalledWith(
        expect.stringContaining('pg_dump -d test_db'),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.database).toBe('test_db');
      expect(result.sizeBytes).toBe(1048576);
      expect(result.backupPath).toMatch(/^\/backups\/postgres_test_db_/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid database names', async () => {
      const { validateDatabaseName } = await import('../../../src/utils/validators.js');
      vi.mocked(validateDatabaseName).mockReturnValue(false);

      await expect(postgresManager.createBackup('invalid-db', '/backups')).rejects.toThrow(
        'Invalid database name'
      );
    });

    it('should handle backup failure', async () => {
      mockRunner.run = vi.fn().mockRejectedValue(new Error('pg_dump failed'));

      await expect(postgresManager.createBackup('test_db', '/backups')).rejects.toThrow(
        'pg_dump failed'
      );
    });

    it('should sanitize shell arguments', async () => {
      const { sanitizeShellArg } = await import('../../../src/utils/validators.js');

      mockRunner.run = vi
        .fn()
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '0', stderr: '' });

      await postgresManager.createBackup('test_db', '/backups');

      expect(sanitizeShellArg).toHaveBeenCalledWith('test_db');
      expect(sanitizeShellArg).toHaveBeenCalledWith(expect.stringContaining('/backups/postgres_'));
    });

    it('should use correct timeout for backup', async () => {
      mockRunner.run = vi
        .fn()
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '0', stderr: '' });

      await postgresManager.createBackup('test_db', '/backups');

      expect(mockRunner.run).toHaveBeenCalledWith(expect.any(String), {
        requiresSudo: false,
        timeoutMs: 600000, // 10 minutes
      });
    });
  });

  describe('close', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should close connection pool gracefully', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await postgresManager.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockPool.end.mockRejectedValue(new Error('Close failed'));

      await expect(postgresManager.close()).rejects.toThrow('Close failed');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should handle query errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection timeout'));

      await expect(postgresManager.getActiveConnections()).rejects.toThrow('Connection timeout');
    });

    it('should handle connection errors in vacuum', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection refused'));

      const result = await postgresManager.runVacuum('test_db');

      expect(result.success).toBe(false);
      expect(result.output).toContain('Connection refused');
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      postgresManager = new PostgresManagerService(mockRunner);
    });

    it('should handle multiple concurrent queries', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const promises = [
        postgresManager.getActiveConnections(),
        postgresManager.getTableBloat(),
        postgresManager.getIndexUsage(),
      ];

      await Promise.all(promises);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('should maintain correct query parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await postgresManager.getSlowQueries(150);

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [150]);
    });
  });
});
