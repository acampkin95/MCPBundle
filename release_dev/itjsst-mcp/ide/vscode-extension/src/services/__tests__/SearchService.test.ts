/**
 * Unit tests for SearchService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchService } from '../SearchService';
import { DatabaseService } from '../DatabaseService';
import { MCPClientService } from '../MCPClientService';
import { CognitiveStage } from '../../types';
import * as vscode from 'vscode';

describe('SearchService', () => {
  let service: SearchService;
  let mockDatabaseService: DatabaseService;
  let mockMCPClient: MCPClientService;
  let mockLogger: vscode.OutputChannel;

  beforeEach(() => {
    mockDatabaseService = {
      searchThoughts: vi.fn().mockResolvedValue([
        {
          thoughtId: 'thought-1',
          sessionId: 'session-1',
          stage: 'problem_definition' as CognitiveStage,
          content: 'PostgreSQL performance optimization strategies',
          relevanceScore: 0.95,
        },
        {
          thoughtId: 'thought-2',
          sessionId: 'session-2',
          stage: 'research' as CognitiveStage,
          content: 'Database indexing best practices',
          relevanceScore: 0.85,
        },
      ]),
      getSessionThoughts: vi.fn().mockResolvedValue([]),
    } as unknown as DatabaseService;

    mockMCPClient = {
      invokeTool: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Web search results...',
          },
        ],
      }),
    } as unknown as MCPClientService;

    mockLogger = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    service = new SearchService(
      mockDatabaseService,
      mockMCPClient,
      mockLogger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchLocal', () => {
    it('should search thoughts in local database', async () => {
      const results = await service.searchLocal({
        query: 'PostgreSQL performance',
      });

      expect(mockDatabaseService.searchThoughts).toHaveBeenCalledWith({
        query: 'PostgreSQL performance',
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('thoughtId');
      expect(results[0]).toHaveProperty('relevanceScore');
    });

    it('should filter by session ID', async () => {
      await service.searchLocal({
        query: 'test',
        sessionId: 'specific-session',
      });

      expect(mockDatabaseService.searchThoughts).toHaveBeenCalledWith({
        query: 'test',
        sessionId: 'specific-session',
      });
    });

    it('should filter by cognitive stage', async () => {
      await service.searchLocal({
        query: 'test',
        stage: 'research' as CognitiveStage,
      });

      expect(mockDatabaseService.searchThoughts).toHaveBeenCalledWith({
        query: 'test',
        stage: 'research',
      });
    });

    it('should limit number of results', async () => {
      await service.searchLocal({
        query: 'test',
        limit: 10,
      });

      expect(mockDatabaseService.searchThoughts).toHaveBeenCalledWith({
        query: 'test',
        limit: 10,
      });
    });

    it('should sort results by relevance score', async () => {
      const results = await service.searchLocal({ query: 'test' });

      expect(results[0].relevanceScore).toBeGreaterThanOrEqual(
        results[1].relevanceScore
      );
    });

    it('should handle empty query', async () => {
      await expect(service.searchLocal({ query: '' })).rejects.toThrow(
        'Query cannot be empty'
      );
    });
  });

  describe('searchWeb', () => {
    it('should search using web search provider', async () => {
      const results = await service.searchWeb({
        query: 'TypeScript best practices',
        provider: 'duckduckgo',
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith({
        serverName: expect.any(String),
        toolName: expect.stringContaining('search'),
        arguments: expect.objectContaining({
          query: 'TypeScript best practices',
        }),
      });

      expect(results).toHaveProperty('results');
      expect(results).toHaveProperty('provider');
    });

    it('should use Playwright provider for dynamic content', async () => {
      await service.searchWeb({
        query: 'JavaScript frameworks',
        provider: 'playwright',
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: expect.stringContaining('playwright'),
        })
      );
    });

    it('should use Context7 provider for documentation', async () => {
      await service.searchWeb({
        query: 'React hooks documentation',
        provider: 'context7',
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: expect.stringContaining('context7'),
        })
      );
    });

    it('should limit web search results', async () => {
      await service.searchWeb({
        query: 'test',
        provider: 'duckduckgo',
        maxResults: 5,
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: expect.objectContaining({
            maxResults: 5,
          }),
        })
      );
    });

    it('should handle web search errors', async () => {
      mockMCPClient.invokeTool = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await expect(
        service.searchWeb({ query: 'test', provider: 'duckduckgo' })
      ).rejects.toThrow('Web search failed');
    });
  });

  describe('searchUnified', () => {
    it('should combine local and web search results', async () => {
      const results = await service.searchUnified({
        query: 'PostgreSQL optimization',
        includeLocal: true,
        includeWeb: true,
        webProvider: 'duckduckgo',
      });

      expect(results).toHaveProperty('local');
      expect(results).toHaveProperty('web');
      expect(results.local).toHaveLength(2);
    });

    it('should only search locally when web disabled', async () => {
      const results = await service.searchUnified({
        query: 'test',
        includeLocal: true,
        includeWeb: false,
      });

      expect(results).toHaveProperty('local');
      expect(results.web).toBeUndefined();
      expect(mockMCPClient.invokeTool).not.toHaveBeenCalled();
    });

    it('should only search web when local disabled', async () => {
      const results = await service.searchUnified({
        query: 'test',
        includeLocal: false,
        includeWeb: true,
        webProvider: 'duckduckgo',
      });

      expect(results.local).toBeUndefined();
      expect(results).toHaveProperty('web');
      expect(mockDatabaseService.searchThoughts).not.toHaveBeenCalled();
    });

    it('should rank combined results by relevance', async () => {
      const results = await service.searchUnified({
        query: 'test',
        includeLocal: true,
        includeWeb: true,
        webProvider: 'duckduckgo',
        rankResults: true,
      });

      expect(results).toHaveProperty('ranked');
      if (results.ranked) {
        expect(Array.isArray(results.ranked)).toBe(true);
      }
    });
  });

  describe('indexSession', () => {
    it('should create search index for session', async () => {
      mockDatabaseService.getSessionThoughts = vi.fn().mockResolvedValue([
        {
          thoughtId: 'thought-1',
          content: 'First thought content',
          stage: 'problem_definition',
        },
        {
          thoughtId: 'thought-2',
          content: 'Second thought content',
          stage: 'research',
        },
      ]);

      await service.indexSession('session-123');

      expect(mockDatabaseService.getSessionThoughts).toHaveBeenCalledWith(
        'session-123'
      );
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Indexed session')
      );
    });

    it('should update existing index', async () => {
      await service.indexSession('session-123');
      await service.indexSession('session-123');

      // Should reindex without errors
      expect(mockLogger.appendLine).toHaveBeenCalled();
    });

    it('should handle empty sessions', async () => {
      mockDatabaseService.getSessionThoughts = vi.fn().mockResolvedValue([]);

      await service.indexSession('empty-session');

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('No thoughts to index')
      );
    });
  });

  describe('getSearchSuggestions', () => {
    it('should provide search suggestions based on history', async () => {
      await service.searchLocal({ query: 'PostgreSQL performance' });
      await service.searchLocal({ query: 'PostgreSQL indexing' });
      await service.searchLocal({ query: 'Database optimization' });

      const suggestions = service.getSearchSuggestions('Postgre');

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toContain('PostgreSQL');
    });

    it('should limit number of suggestions', () => {
      const suggestions = service.getSearchSuggestions('test', 3);

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for no matches', () => {
      const suggestions = service.getSearchSuggestions('xyzabc');

      expect(suggestions).toEqual([]);
    });
  });

  describe('getSearchHistory', () => {
    it('should return recent searches', async () => {
      await service.searchLocal({ query: 'First search' });
      await service.searchLocal({ query: 'Second search' });

      const history = service.getSearchHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(2);
      expect(history[0].query).toBe('Second search');
    });

    it('should limit history size', async () => {
      for (let i = 0; i < 150; i++) {
        await service.searchLocal({ query: `Query ${i}` });
      }

      const history = service.getSearchHistory();

      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should include timestamps', async () => {
      await service.searchLocal({ query: 'test' });

      const history = service.getSearchHistory();

      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('clearSearchHistory', () => {
    it('should clear all search history', async () => {
      await service.searchLocal({ query: 'test1' });
      await service.searchLocal({ query: 'test2' });

      service.clearSearchHistory();

      const history = service.getSearchHistory();
      expect(history).toEqual([]);
    });
  });

  describe('getSearchStats', () => {
    it('should return search statistics', async () => {
      await service.searchLocal({ query: 'test1' });
      await service.searchLocal({ query: 'test2' });
      await service.searchWeb({ query: 'test3', provider: 'duckduckgo' });

      const stats = service.getSearchStats();

      expect(stats).toHaveProperty('totalSearches');
      expect(stats).toHaveProperty('localSearches');
      expect(stats).toHaveProperty('webSearches');
      expect(stats.totalSearches).toBe(3);
      expect(stats.localSearches).toBe(2);
      expect(stats.webSearches).toBe(1);
    });

    it('should track average search time', async () => {
      await service.searchLocal({ query: 'test' });

      const stats = service.getSearchStats();

      expect(stats).toHaveProperty('averageSearchTime');
      expect(stats.averageSearchTime).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle database search errors', async () => {
      mockDatabaseService.searchThoughts = vi
        .fn()
        .mockRejectedValue(new Error('Database error'));

      await expect(service.searchLocal({ query: 'test' })).rejects.toThrow(
        'Local search failed'
      );
    });

    it('should validate search parameters', async () => {
      await expect(
        service.searchLocal({ query: '', sessionId: 'test' })
      ).rejects.toThrow('Query cannot be empty');

      await expect(
        service.searchLocal({ query: 'a'.repeat(2000) })
      ).rejects.toThrow('Query too long');
    });
  });

  describe('dispose', () => {
    it('should clean up resources on disposal', () => {
      service.dispose();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Search service disposed')
      );

      const history = service.getSearchHistory();
      expect(history).toEqual([]);
    });
  });
});
