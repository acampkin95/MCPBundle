/**
 * Performance benchmarks for critical operations
 * Targets: Database queries <100ms, Search <500ms, Export <2s
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';
import { DatabaseService } from '../../services/DatabaseService';
import { SearchService } from '../../services/SearchService';
import { ExportService } from '../../services/ExportService';
import { CredentialService } from '../../services/CredentialService';
import { MCPClientService } from '../../services/MCPClientService';
import { CognitiveStage } from '../../types';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

interface BenchmarkResult {
  operation: string;
  duration: number;
  target: number;
  passed: boolean;
}

describe('Performance Benchmarks', () => {
  let dbService: DatabaseService;
  let searchService: SearchService;
  let exportService: ExportService;
  let mockLogger: vscode.OutputChannel;
  let testDbPath: string;
  const benchmarkResults: BenchmarkResult[] = [];

  beforeEach(async () => {
    testDbPath = path.join(os.tmpdir(), `bench-thinking-${Date.now()}.db`);

    mockLogger = {
      appendLine: () => {},
      append: () => {},
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
    } as unknown as vscode.OutputChannel;

    const mockContext = {
      secrets: {
        get: async () => null,
        store: async () => {},
        delete: async () => {},
      },
      extensionPath: '/test/path',
    } as unknown as vscode.ExtensionContext;

    const credentialService = new CredentialService(mockContext, mockLogger);

    const dbConfig = {
      mode: 'sqlite' as const,
      sqlite: {
        databasePath: testDbPath,
        enableWAL: true,
      },
    };

    dbService = new DatabaseService(dbConfig, credentialService, mockLogger);
    await dbService.initialize();

    const mockMCPClient = {
      invokeTool: async () => ({ content: [] }),
    } as unknown as MCPClientService;

    searchService = new SearchService(dbService, mockMCPClient, mockLogger);
    exportService = new ExportService(dbService, mockLogger);
  });

  afterEach(async () => {
    await dbService.dispose();

    // Print benchmark summary
    console.log('\n=== Performance Benchmark Results ===');
    benchmarkResults.forEach((result) => {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(
        `${status} ${result.operation}: ${result.duration.toFixed(2)}ms (target: ${result.target}ms)`
      );
    });
    console.log('=====================================\n');

    benchmarkResults.length = 0;
  });

  function recordBenchmark(
    operation: string,
    duration: number,
    target: number
  ): void {
    const passed = duration <= target;
    benchmarkResults.push({ operation, duration, target, passed });
  }

  describe('Database Operations', () => {
    it('should create session in <100ms', async () => {
      const start = performance.now();

      await dbService.createSession({
        origin: 'benchmark',
        projectName: 'Benchmark Project',
      });

      const duration = performance.now() - start;
      recordBenchmark('Create Session', duration, 100);

      expect(duration).toBeLessThan(100);
    });

    it('should add thought in <100ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      const start = performance.now();

      await dbService.addThought({
        sessionId: session.sessionId,
        stage: 'problem_definition' as CognitiveStage,
        content: 'Benchmark thought content',
      });

      const duration = performance.now() - start;
      recordBenchmark('Add Thought', duration, 100);

      expect(duration).toBeLessThan(100);
    });

    it('should query session thoughts in <100ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      // Add 50 thoughts
      for (let i = 0; i < 50; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: 'research' as CognitiveStage,
          content: `Thought ${i}`,
        });
      }

      const start = performance.now();

      await dbService.getSessionThoughts(session.sessionId);

      const duration = performance.now() - start;
      recordBenchmark('Query 50 Thoughts', duration, 100);

      expect(duration).toBeLessThan(100);
    });

    it('should query session thoughts with limit in <50ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      // Add 100 thoughts
      for (let i = 0; i < 100; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: 'analysis' as CognitiveStage,
          content: `Analysis thought ${i}`,
        });
      }

      const start = performance.now();

      await dbService.getSessionThoughts(session.sessionId, { limit: 10 });

      const duration = performance.now() - start;
      recordBenchmark('Query 10 of 100 Thoughts', duration, 50);

      expect(duration).toBeLessThan(50);
    });

    it('should update thought in <100ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });
      const thought = await dbService.addThought({
        sessionId: session.sessionId,
        stage: 'problem_definition' as CognitiveStage,
        content: 'Original content',
      });

      const start = performance.now();

      await dbService.updateThought(thought.thoughtId, {
        content: 'Updated content',
      });

      const duration = performance.now() - start;
      recordBenchmark('Update Thought', duration, 100);

      expect(duration).toBeLessThan(100);
    });

    it('should delete thought in <100ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });
      const thought = await dbService.addThought({
        sessionId: session.sessionId,
        stage: 'conclusion' as CognitiveStage,
        content: 'To be deleted',
      });

      const start = performance.now();

      await dbService.deleteThought(thought.thoughtId);

      const duration = performance.now() - start;
      recordBenchmark('Delete Thought', duration, 100);

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Search Operations', () => {
    it('should search 1000 thoughts in <500ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      // Add 1000 thoughts with varied content
      const words = ['database', 'performance', 'optimization', 'query', 'index'];
      for (let i = 0; i < 1000; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: 'research' as CognitiveStage,
          content: `Thought about ${words[i % words.length]} number ${i}`,
        });
      }

      const start = performance.now();

      await searchService.searchLocal({
        query: 'database optimization',
      });

      const duration = performance.now() - start;
      recordBenchmark('Search 1000 Thoughts', duration, 500);

      expect(duration).toBeLessThan(500);
    });

    it('should search with filters in <300ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      for (let i = 0; i < 500; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: 'analysis' as CognitiveStage,
          content: `Analysis content ${i}`,
        });
      }

      const start = performance.now();

      await searchService.searchLocal({
        query: 'content',
        sessionId: session.sessionId,
        stage: 'analysis' as CognitiveStage,
        limit: 50,
      });

      const duration = performance.now() - start;
      recordBenchmark('Search with Filters', duration, 300);

      expect(duration).toBeLessThan(300);
    });
  });

  describe('Export Operations', () => {
    it('should export large session to JSON in <2s', async () => {
      const session = await dbService.createSession({
        origin: 'benchmark',
        projectName: 'Large Export Test',
      });

      // Add 500 thoughts
      for (let i = 0; i < 500; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: (['problem_definition', 'research', 'analysis', 'synthesis', 'conclusion'] as CognitiveStage[])[i % 5],
          content: `This is thought number ${i} with some substantial content to make it realistic`,
          metadata: {
            tags: ['benchmark', 'export', `tag-${i}`],
            importance: i % 2 === 0 ? 'high' : 'medium',
          },
        });
      }

      const start = performance.now();

      await exportService.exportToJSON(session.sessionId, {
        includeMetadata: true,
      });

      const duration = performance.now() - start;
      recordBenchmark('Export 500 Thoughts to JSON', duration, 2000);

      expect(duration).toBeLessThan(2000);
    });

    it('should export large session to Markdown in <2s', async () => {
      const session = await dbService.createSession({
        origin: 'benchmark',
        projectName: 'Large Markdown Export',
      });

      for (let i = 0; i < 500; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: (['problem_definition', 'research', 'analysis', 'synthesis', 'conclusion'] as CognitiveStage[])[i % 5],
          content: `Markdown thought ${i} with detailed content`,
        });
      }

      const start = performance.now();

      await exportService.exportToMarkdown(session.sessionId, {
        includeMetadata: true,
      });

      const duration = performance.now() - start;
      recordBenchmark('Export 500 Thoughts to Markdown', duration, 2000);

      expect(duration).toBeLessThan(2000);
    });

    it('should export small session in <100ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      for (let i = 0; i < 10; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: 'problem_definition' as CognitiveStage,
          content: `Small export thought ${i}`,
        });
      }

      const start = performance.now();

      await exportService.exportToJSON(session.sessionId, {
        includeMetadata: false,
      });

      const duration = performance.now() - start;
      recordBenchmark('Export 10 Thoughts to JSON', duration, 100);

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Bulk Operations', () => {
    it('should handle 100 concurrent thought additions in <5s', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      const start = performance.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        dbService.addThought({
          sessionId: session.sessionId,
          stage: 'research' as CognitiveStage,
          content: `Concurrent thought ${i}`,
        })
      );

      await Promise.all(promises);

      const duration = performance.now() - start;
      recordBenchmark('100 Concurrent Additions', duration, 5000);

      expect(duration).toBeLessThan(5000);
    });

    it('should handle multiple concurrent queries in <1s', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 5 }, () =>
          dbService.createSession({ origin: 'benchmark' })
        )
      );

      // Add thoughts to each session
      for (const session of sessions) {
        for (let i = 0; i < 20; i++) {
          await dbService.addThought({
            sessionId: session.sessionId,
            stage: 'analysis' as CognitiveStage,
            content: `Concurrent query thought ${i}`,
          });
        }
      }

      const start = performance.now();

      const queries = sessions.map((session) =>
        dbService.getSessionThoughts(session.sessionId)
      );

      await Promise.all(queries);

      const duration = performance.now() - start;
      recordBenchmark('5 Concurrent Queries', duration, 1000);

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Cache Performance', () => {
    it('should serve cached queries in <10ms', async () => {
      const session = await dbService.createSession({ origin: 'benchmark' });

      for (let i = 0; i < 50; i++) {
        await dbService.addThought({
          sessionId: session.sessionId,
          stage: 'research' as CognitiveStage,
          content: `Cache test thought ${i}`,
        });
      }

      // First query - not cached
      await dbService.getSessionThoughts(session.sessionId);

      // Second query - should be cached
      const start = performance.now();

      await dbService.getSessionThoughts(session.sessionId);

      const duration = performance.now() - start;
      recordBenchmark('Cached Query', duration, 10);

      expect(duration).toBeLessThan(10);
    });
  });
});
