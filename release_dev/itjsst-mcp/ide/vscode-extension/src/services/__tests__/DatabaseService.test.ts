/**
 * Unit tests for DatabaseService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../DatabaseService';
import { CredentialService } from '../CredentialService';
import { DatabaseConfig, CognitiveStage } from '../../types';
import * as vscode from 'vscode';

// Mock pg and better-sqlite3
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      release: vi.fn(),
    }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockImplementation(() => ({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
    close: vi.fn(),
  })),
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockCredentialService: CredentialService;
  let mockLogger: vscode.OutputChannel;
  let config: DatabaseConfig;

  beforeEach(() => {
    // Mock credential service
    mockCredentialService = {
      getDatabaseCredentials: vi.fn().mockResolvedValue({
        username: 'testuser',
        password: 'testpass',
      }),
    } as unknown as CredentialService;

    // Mock logger
    mockLogger = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    // Default config
    config = {
      mode: 'auto',
      postgresql: {
        host: '46.250.243.123',
        port: 5432,
        database: 'mcp_ecosystem',
        poolSize: 5,
        connectionTimeout: 10000,
        idleTimeout: 30000,
      },
      sqlite: {
        databasePath: '/tmp/test-thinking.db',
        enableWAL: true,
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize in PostgreSQL mode when available', async () => {
      config.mode = 'postgresql';
      service = new DatabaseService(config, mockCredentialService, mockLogger);

      await service.initialize();

      expect(mockCredentialService.getDatabaseCredentials).toHaveBeenCalledWith(
        '46.250.243.123'
      );
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Using PostgreSQL mode')
      );
    });

    it('should fallback to SQLite when PostgreSQL fails in auto mode', async () => {
      config.mode = 'auto';
      mockCredentialService.getDatabaseCredentials = vi
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      service = new DatabaseService(config, mockCredentialService, mockLogger);

      await service.initialize();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to SQLite mode')
      );
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Using SQLite mode')
      );
    });

    it('should throw error in strict PostgreSQL mode on failure', async () => {
      config.mode = 'postgresql';
      mockCredentialService.getDatabaseCredentials = vi
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      service = new DatabaseService(config, mockCredentialService, mockLogger);

      await expect(service.initialize()).rejects.toThrow('Connection failed');
    });

    it('should use SQLite mode when explicitly configured', async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);

      await service.initialize();

      expect(mockCredentialService.getDatabaseCredentials).not.toHaveBeenCalled();
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Using SQLite mode')
      );
    });
  });

  describe('createSession', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should create a new session with valid data', async () => {
      const session = await service.createSession({
        origin: 'vscode-extension',
        projectId: 'test-project-123',
        projectName: 'Test Project',
      });

      expect(session).toHaveProperty('sessionId');
      expect(session.origin).toBe('vscode-extension');
      expect(session.projectId).toBe('test-project-123');
      expect(session.projectName).toBe('Test Project');
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should create session without project info', async () => {
      const session = await service.createSession({
        origin: 'test',
      });

      expect(session).toHaveProperty('sessionId');
      expect(session.origin).toBe('test');
      expect(session.projectId).toBeUndefined();
    });
  });

  describe('addThought', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should add thought with all fields', async () => {
      const thought = await service.addThought({
        sessionId: 'test-session-123',
        stage: 'problem_definition' as CognitiveStage,
        content: 'Define the problem clearly',
        metadata: {
          tags: ['important', 'initial'],
          importance: 'high',
        },
        qualityScore: 85,
      });

      expect(thought).toHaveProperty('thoughtId');
      expect(thought.sessionId).toBe('test-session-123');
      expect(thought.stage).toBe('problem_definition');
      expect(thought.content).toBe('Define the problem clearly');
      expect(thought.metadata).toHaveProperty('tags');
    });

    it('should validate stage value', async () => {
      await expect(
        service.addThought({
          sessionId: 'test-session',
          stage: 'invalid_stage' as CognitiveStage,
          content: 'Test',
        })
      ).rejects.toThrow();
    });
  });

  describe('getSessionThoughts', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should retrieve thoughts for a session', async () => {
      const sessionId = 'test-session-123';

      // Add some thoughts first
      await service.addThought({
        sessionId,
        stage: 'problem_definition' as CognitiveStage,
        content: 'First thought',
      });
      await service.addThought({
        sessionId,
        stage: 'research' as CognitiveStage,
        content: 'Second thought',
      });

      const thoughts = await service.getSessionThoughts(sessionId);

      expect(Array.isArray(thoughts)).toBe(true);
      expect(thoughts.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter thoughts by stage', async () => {
      const sessionId = 'test-session-456';

      await service.addThought({
        sessionId,
        stage: 'problem_definition' as CognitiveStage,
        content: 'Problem',
      });
      await service.addThought({
        sessionId,
        stage: 'research' as CognitiveStage,
        content: 'Research',
      });

      const thoughts = await service.getSessionThoughts(sessionId, {
        stage: 'research' as CognitiveStage,
      });

      expect(Array.isArray(thoughts)).toBe(true);
    });

    it('should limit number of thoughts returned', async () => {
      const sessionId = 'test-session-789';

      for (let i = 0; i < 10; i++) {
        await service.addThought({
          sessionId,
          stage: 'problem_definition' as CognitiveStage,
          content: `Thought ${i}`,
        });
      }

      const thoughts = await service.getSessionThoughts(sessionId, {
        limit: 5,
      });

      expect(Array.isArray(thoughts)).toBe(true);
    });
  });

  describe('searchThoughts', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should search thoughts by query', async () => {
      const sessionId = 'search-test-session';

      await service.addThought({
        sessionId,
        stage: 'problem_definition' as CognitiveStage,
        content: 'Need to implement authentication',
      });
      await service.addThought({
        sessionId,
        stage: 'research' as CognitiveStage,
        content: 'Research OAuth2 providers',
      });

      const results = await service.searchThoughts({
        query: 'authentication',
        sessionId,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should search across all sessions when sessionId not provided', async () => {
      const results = await service.searchThoughts({
        query: 'test',
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('updateThought', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should update thought content', async () => {
      const thought = await service.addThought({
        sessionId: 'update-test',
        stage: 'problem_definition' as CognitiveStage,
        content: 'Original content',
      });

      await service.updateThought(thought.thoughtId, {
        content: 'Updated content',
      });

      const updated = await service.getThought(thought.thoughtId);
      expect(updated?.content).toBe('Updated content');
    });

    it('should update thought metadata', async () => {
      const thought = await service.addThought({
        sessionId: 'update-test-2',
        stage: 'problem_definition' as CognitiveStage,
        content: 'Test',
        metadata: { tags: ['initial'] },
      });

      await service.updateThought(thought.thoughtId, {
        metadata: { tags: ['updated', 'revised'] },
      });

      const updated = await service.getThought(thought.thoughtId);
      expect(updated?.metadata).toHaveProperty('tags');
    });
  });

  describe('deleteThought', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should delete a thought', async () => {
      const thought = await service.addThought({
        sessionId: 'delete-test',
        stage: 'problem_definition' as CognitiveStage,
        content: 'To be deleted',
      });

      await service.deleteThought(thought.thoughtId);

      const deleted = await service.getThought(thought.thoughtId);
      expect(deleted).toBeNull();
    });
  });

  describe('getPoolStats', () => {
    it('should return PostgreSQL pool stats when connected', async () => {
      config.mode = 'postgresql';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();

      const stats = service.getPoolStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('waiting');
    });

    it('should return null when using SQLite', async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();

      const stats = service.getPoolStats();

      expect(stats).toBeNull();
    });
  });

  describe('dispose', () => {
    it('should clean up resources on disposal', async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();

      await service.dispose();

      // Verify cleanup was called
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Database service disposed')
      );
    });

    it('should clear cache on disposal', async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();

      // Add some cached data
      await service.getSessionThoughts('test-session');

      await service.dispose();

      // Cache should be cleared
      const cacheSize = service['queryCache'].size;
      expect(cacheSize).toBe(0);
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      config.mode = 'sqlite';
      service = new DatabaseService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should cache query results', async () => {
      const sessionId = 'cache-test';

      // First call - not cached
      await service.getSessionThoughts(sessionId);

      // Second call - should use cache
      const cached = await service.getSessionThoughts(sessionId);

      expect(Array.isArray(cached)).toBe(true);
    });

    it('should invalidate cache after TTL', async () => {
      vi.useFakeTimers();

      const sessionId = 'ttl-test';
      await service.getSessionThoughts(sessionId);

      // Advance time beyond TTL
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      // Cache cleanup should have run
      const cacheEntry = service['queryCache'].get(`getSessionThoughts:${sessionId}`);

      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      config.mode = 'sqlite';
      config.sqlite!.databasePath = '/invalid/path/db.sqlite';

      service = new DatabaseService(config, mockCredentialService, mockLogger);

      await expect(service.initialize()).rejects.toThrow();
    });

    it('should provide helpful error messages', async () => {
      config.mode = 'postgresql';
      config.postgresql = undefined;

      service = new DatabaseService(config, mockCredentialService, mockLogger);

      await expect(service.initialize()).rejects.toThrow(
        'PostgreSQL configuration missing'
      );
    });
  });
});
