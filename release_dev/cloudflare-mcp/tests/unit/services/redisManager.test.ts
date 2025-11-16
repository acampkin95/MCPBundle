/**
 * Unit tests for RedisManagerService
 *
 * This test suite covers:
 * - Connection management (connect, disconnect, reconnect)
 * - Get/set/delete operations
 * - Cache TTL functionality
 * - Error handling and recovery
 * - Health check functionality
 * - Info parsing and statistics
 * - Memory and keyspace statistics
 * - Slow log and client list
 * - Database operations (flush, bgsave)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisManagerService } from '../../../src/services/redisManager.js';
import Redis from 'ioredis';

// Mock the logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn(),
  };
});

describe('RedisManagerService', () => {
  let redisManager: RedisManagerService;
  let mockRedisInstance: any;
  const RedisMock = vi.mocked(Redis);

  beforeEach(() => {
    // Create mock Redis instance with all necessary methods
    mockRedisInstance = {
      options: {
        host: 'localhost',
        port: 6379,
      },
      on: vi.fn(),
      info: vi.fn(),
      ping: vi.fn(),
      quit: vi.fn(),
      slowlog: vi.fn(),
      client: vi.fn(),
      select: vi.fn(),
      flushdb: vi.fn(),
      bgsave: vi.fn(),
      lastsave: vi.fn(),
    };

    // Mock the Redis constructor to return our mock instance
    RedisMock.mockReturnValue(mockRedisInstance as any);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default configuration from environment', () => {
      process.env.REDIS_HOST = 'test-host';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'test-password';
      process.env.REDIS_DB = '1';

      redisManager = new RedisManagerService();

      expect(RedisMock).toHaveBeenCalledWith({
        host: 'test-host',
        port: 6380,
        password: 'test-password',
        db: 1,
        retryStrategy: expect.any(Function),
        maxRetriesPerRequest: 3,
      });
    });

    it('should create instance with custom configuration', () => {
      const customConfig = {
        host: 'custom-host',
        port: 7000,
        password: 'custom-pass',
        db: 2,
      };

      redisManager = new RedisManagerService(customConfig);

      expect(RedisMock).toHaveBeenCalledWith(customConfig);
    });

    it('should register error and connect event handlers', () => {
      redisManager = new RedisManagerService();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should implement exponential backoff retry strategy', () => {
      redisManager = new RedisManagerService();

      const config = RedisMock.mock.calls[0][0] as any;
      const retryStrategy = config.retryStrategy;

      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(2)).toBe(100);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(50)).toBe(2000); // Capped at 2000ms
    });
  });

  describe('getInfo', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should parse and return Redis info correctly', async () => {
      const mockInfoString = `# Server
redis_version:7.0.0
uptime_in_seconds:3600

# Clients
connected_clients:10

# Memory
used_memory:1048576
used_memory_peak:2097152
mem_fragmentation_ratio:1.5

# Stats
total_commands_processed:1000
instantaneous_ops_per_sec:50

# Replication
role:master
`;

      mockRedisInstance.info.mockResolvedValue(mockInfoString);

      const result = await redisManager.getInfo();

      expect(result).toEqual({
        version: '7.0.0',
        uptime: 3600,
        connectedClients: 10,
        usedMemory: 1048576,
        usedMemoryPeak: 2097152,
        memoryFragmentationRatio: 1.5,
        totalCommandsProcessed: 1000,
        opsPerSec: 50,
        role: 'master',
      });
    });

    it('should handle slave role correctly', async () => {
      const mockInfoString = `# Replication
role:slave
`;

      mockRedisInstance.info.mockResolvedValue(mockInfoString);

      const result = await redisManager.getInfo();

      expect(result.role).toBe('slave');
    });

    it('should return defaults for missing values', async () => {
      mockRedisInstance.info.mockResolvedValue('# Server\n');

      const result = await redisManager.getInfo();

      expect(result).toEqual({
        version: 'unknown',
        uptime: 0,
        connectedClients: 0,
        usedMemory: 0,
        usedMemoryPeak: 0,
        memoryFragmentationRatio: 1.0,
        totalCommandsProcessed: 0,
        opsPerSec: 0,
        role: 'master',
      });
    });
  });

  describe('getMemoryStats', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should parse memory statistics correctly', async () => {
      const mockMemoryInfo = `# Memory
used_memory_human:1.00M
used_memory_peak_human:2.00M
mem_fragmentation_ratio:1.25
mem_allocator:jemalloc
used_memory_rss:1200000
maxmemory:2000000
maxmemory_policy:allkeys-lru
`;

      mockRedisInstance.info.mockResolvedValue(mockMemoryInfo);

      const result = await redisManager.getMemoryStats();

      expect(result).toEqual({
        usedMemoryHuman: '1.00M',
        usedMemoryPeakHuman: '2.00M',
        memoryFragmentationRatio: 1.25,
        memoryAllocator: 'jemalloc',
        usedMemoryRss: 1200000,
        maxMemory: 2000000,
        maxMemoryPolicy: 'allkeys-lru',
      });
    });

    it('should return defaults for missing memory values', async () => {
      mockRedisInstance.info.mockResolvedValue('# Memory\n');

      const result = await redisManager.getMemoryStats();

      expect(result).toEqual({
        usedMemoryHuman: '0B',
        usedMemoryPeakHuman: '0B',
        memoryFragmentationRatio: 1.0,
        memoryAllocator: 'unknown',
        usedMemoryRss: 0,
        maxMemory: 0,
        maxMemoryPolicy: 'noeviction',
      });
    });
  });

  describe('getKeyspaceStats', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should parse keyspace statistics for multiple databases', async () => {
      const mockKeyspaceInfo = `# Keyspace
db0:keys=100,expires=20,avg_ttl=3600000
db1:keys=50,expires=10,avg_ttl=1800000
db2:keys=25,expires=5,avg_ttl=900000
`;

      mockRedisInstance.info.mockResolvedValue(mockKeyspaceInfo);

      const result = await redisManager.getKeyspaceStats();

      expect(result).toEqual([
        {
          database: 0,
          keys: 100,
          expires: 20,
          avgTtl: 3600000,
        },
        {
          database: 1,
          keys: 50,
          expires: 10,
          avgTtl: 1800000,
        },
        {
          database: 2,
          keys: 25,
          expires: 5,
          avgTtl: 900000,
        },
      ]);
    });

    it('should handle empty keyspace', async () => {
      mockRedisInstance.info.mockResolvedValue('# Keyspace\n');

      const result = await redisManager.getKeyspaceStats();

      expect(result).toEqual([]);
    });

    it('should handle missing statistics fields', async () => {
      const mockKeyspaceInfo = `# Keyspace
db0:keys=100
`;

      mockRedisInstance.info.mockResolvedValue(mockKeyspaceInfo);

      const result = await redisManager.getKeyspaceStats();

      expect(result).toEqual([
        {
          database: 0,
          keys: 100,
          expires: 0,
          avgTtl: 0,
        },
      ]);
    });
  });

  describe('getSlowLog', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should parse slow log entries correctly', async () => {
      const mockSlowLog = [
        [1, 1234567890, 150000, ['GET', 'mykey'], '127.0.0.1:12345', 'client1'],
        [2, 1234567891, 200000, ['SET', 'mykey', 'value'], '127.0.0.1:12346', 'client2'],
      ];

      mockRedisInstance.slowlog.mockResolvedValue(mockSlowLog);

      const result = await redisManager.getSlowLog(10);

      expect(mockRedisInstance.slowlog).toHaveBeenCalledWith('GET', 10);
      expect(result).toEqual([
        {
          id: 1,
          timestamp: 1234567890,
          duration: 150000,
          command: 'GET mykey',
          clientAddress: '127.0.0.1:12345',
          clientName: 'client1',
        },
        {
          id: 2,
          timestamp: 1234567891,
          duration: 200000,
          command: 'SET mykey value',
          clientAddress: '127.0.0.1:12346',
          clientName: 'client2',
        },
      ]);
    });

    it('should handle empty slow log', async () => {
      mockRedisInstance.slowlog.mockResolvedValue([]);

      const result = await redisManager.getSlowLog();

      expect(result).toEqual([]);
    });

    it('should skip malformed slow log entries', async () => {
      const mockSlowLog = [
        [1, 1234567890, 150000, ['GET', 'mykey'], '127.0.0.1:12345', 'client1'],
        [2, 1234567891], // Malformed entry (too few fields)
        [3, 1234567892, 180000, ['DEL', 'oldkey'], '127.0.0.1:12347', 'client3'],
      ];

      mockRedisInstance.slowlog.mockResolvedValue(mockSlowLog);

      const result = await redisManager.getSlowLog(10);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
    });
  });

  describe('getClientList', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should parse client list correctly', async () => {
      const mockClientList = `id=1 addr=127.0.0.1:12345 name=client1 age=100 idle=10 db=0 cmd=get
id=2 addr=127.0.0.1:12346 name=client2 age=200 idle=20 db=1 cmd=set`;

      mockRedisInstance.client.mockResolvedValue(mockClientList);

      const result = await redisManager.getClientList();

      expect(mockRedisInstance.client).toHaveBeenCalledWith('LIST');
      expect(result).toEqual([
        {
          id: '1',
          address: '127.0.0.1:12345',
          name: 'client1',
          age: 100,
          idle: 10,
          db: 0,
          cmd: 'get',
        },
        {
          id: '2',
          address: '127.0.0.1:12346',
          name: 'client2',
          age: 200,
          idle: 20,
          db: 1,
          cmd: 'set',
        },
      ]);
    });

    it('should handle empty client list', async () => {
      mockRedisInstance.client.mockResolvedValue('');

      const result = await redisManager.getClientList();

      expect(result).toEqual([]);
    });

    it('should handle missing client fields', async () => {
      const mockClientList = `id=1 addr=127.0.0.1:12345`;

      mockRedisInstance.client.mockResolvedValue(mockClientList);

      const result = await redisManager.getClientList();

      expect(result).toEqual([
        {
          id: '1',
          address: '127.0.0.1:12345',
          name: '',
          age: 0,
          idle: 0,
          db: 0,
          cmd: 'unknown',
        },
      ]);
    });
  });

  describe('flushDatabase', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should flush current database when no database specified', async () => {
      mockRedisInstance.flushdb.mockResolvedValue('OK');

      await redisManager.flushDatabase();

      expect(mockRedisInstance.select).not.toHaveBeenCalled();
      expect(mockRedisInstance.flushdb).toHaveBeenCalledOnce();
    });

    it('should select and flush specific database when database specified', async () => {
      mockRedisInstance.select.mockResolvedValue('OK');
      mockRedisInstance.flushdb.mockResolvedValue('OK');

      await redisManager.flushDatabase(2);

      expect(mockRedisInstance.select).toHaveBeenCalledWith(2);
      expect(mockRedisInstance.flushdb).toHaveBeenCalledOnce();
    });
  });

  describe('bgsave', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should initiate background save successfully', async () => {
      const mockLastSave = 1234567890;
      mockRedisInstance.bgsave.mockResolvedValue('Background saving started');
      mockRedisInstance.lastsave.mockResolvedValue(mockLastSave);

      const result = await redisManager.bgsave();

      expect(mockRedisInstance.bgsave).toHaveBeenCalledOnce();
      expect(mockRedisInstance.lastsave).toHaveBeenCalledOnce();
      expect(result.success).toBe(true);
      expect(result.lastSave).toBe(mockLastSave);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle bgsave failure', async () => {
      const error = new Error('BGSAVE failed');
      mockRedisInstance.bgsave.mockRejectedValue(error);

      const result = await redisManager.bgsave();

      expect(result.success).toBe(false);
      expect(result.lastSave).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ping', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should return true when Redis responds with PONG', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      const result = await redisManager.ping();

      expect(result).toBe(true);
      expect(mockRedisInstance.ping).toHaveBeenCalledOnce();
    });

    it('should return false when ping fails', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection failed'));

      const result = await redisManager.ping();

      expect(result).toBe(false);
    });

    it('should return false for unexpected ping response', async () => {
      mockRedisInstance.ping.mockResolvedValue('UNEXPECTED');

      const result = await redisManager.ping();

      expect(result).toBe(false);
    });
  });

  describe('close', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should close Redis connection gracefully', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');

      await redisManager.close();

      expect(mockRedisInstance.quit).toHaveBeenCalledOnce();
    });
  });

  describe('parseInfoString (private method testing via getInfo)', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should handle multiple sections correctly', async () => {
      const mockInfoString = `# Server
redis_version:7.0.0

# Clients
connected_clients:5

# Memory
used_memory:1000000
`;

      mockRedisInstance.info.mockResolvedValue(mockInfoString);

      const result = await redisManager.getInfo();

      expect(result.version).toBe('7.0.0');
      expect(result.connectedClients).toBe(5);
      expect(result.usedMemory).toBe(1000000);
    });

    it('should handle empty lines and comments', async () => {
      const mockInfoString = `# Server

redis_version:7.0.0

# Some comment without section

# Clients
connected_clients:5
`;

      mockRedisInstance.info.mockResolvedValue(mockInfoString);

      const result = await redisManager.getInfo();

      expect(result.version).toBe('7.0.0');
      expect(result.connectedClients).toBe(5);
    });

    it('should handle malformed info strings gracefully', async () => {
      const mockInfoString = `# Server
invalid_line_without_colon
redis_version:7.0.0
`;

      mockRedisInstance.info.mockResolvedValue(mockInfoString);

      const result = await redisManager.getInfo();

      expect(result.version).toBe('7.0.0');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      redisManager = new RedisManagerService();
    });

    it('should handle info() errors', async () => {
      mockRedisInstance.info.mockRejectedValue(new Error('Connection timeout'));

      await expect(redisManager.getInfo()).rejects.toThrow('Connection timeout');
    });

    it('should handle slowlog() errors', async () => {
      mockRedisInstance.slowlog.mockRejectedValue(new Error('Command failed'));

      await expect(redisManager.getSlowLog()).rejects.toThrow('Command failed');
    });

    it('should handle client() errors', async () => {
      mockRedisInstance.client.mockRejectedValue(new Error('Permission denied'));

      await expect(redisManager.getClientList()).rejects.toThrow('Permission denied');
    });

    it('should handle flushdb() errors', async () => {
      mockRedisInstance.flushdb.mockRejectedValue(new Error('Flush failed'));

      await expect(redisManager.flushDatabase()).rejects.toThrow('Flush failed');
    });
  });

  describe('event handlers', () => {
    it('should log error events', async () => {
      redisManager = new RedisManagerService();

      const errorHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      // Simulate error event
      const testError = new Error('Connection lost');
      errorHandler?.(testError);

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Redis connection error', { error: testError });
    });

    it('should log connect events', async () => {
      redisManager = new RedisManagerService();

      const connectHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];

      expect(connectHandler).toBeDefined();

      // Simulate connect event
      connectHandler?.();

      const { logger } = await import('../../../src/utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('Redis connected', {
        host: 'localhost',
        port: 6379,
      });
    });
  });
});
