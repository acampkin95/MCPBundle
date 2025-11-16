/**
 * Unit tests for ResearchService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResearchService } from '../ResearchService';
import { MCPClientService } from '../MCPClientService';
import * as vscode from 'vscode';

describe('ResearchService', () => {
  let service: ResearchService;
  let mockMCPClient: MCPClientService;
  let mockLogger: vscode.OutputChannel;

  beforeEach(() => {
    mockMCPClient = {
      invokeTool: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Research result: TypeScript is a strongly typed programming language...',
          },
        ],
      }),
      getServers: vi.fn().mockReturnValue([
        { name: 'perplexity-mcp', connected: true },
      ]),
    } as unknown as MCPClientService;

    mockLogger = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    service = new ResearchService(mockMCPClient, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('search', () => {
    it('should perform research query via Perplexity MCP', async () => {
      const result = await service.search({
        query: 'What is TypeScript?',
        searchMode: 'quick',
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith({
        serverName: 'perplexity-mcp',
        toolName: expect.stringContaining('search'),
        arguments: expect.objectContaining({
          query: 'What is TypeScript?',
        }),
      });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('citations');
      expect(result).toHaveProperty('timestamp');
    });

    it('should use deep research mode when specified', async () => {
      await service.search({
        query: 'PostgreSQL performance optimization',
        searchMode: 'deep',
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: expect.objectContaining({
            searchMode: 'deep',
          }),
        })
      );
    });

    it('should include context in research query', async () => {
      await service.search({
        query: 'How to implement authentication?',
        context: 'Building a VSCode extension with Node.js',
      });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: expect.objectContaining({
            context: expect.stringContaining('VSCode extension'),
          }),
        })
      );
    });

    it('should throw error if Perplexity MCP not available', async () => {
      mockMCPClient.getServers = vi.fn().mockReturnValue([]);

      await expect(
        service.search({ query: 'test', searchMode: 'quick' })
      ).rejects.toThrow('Perplexity MCP server not available');
    });
  });

  describe('caching', () => {
    it('should cache research results', async () => {
      const query = 'What is PostgreSQL?';

      // First call - not cached
      await service.search({ query, searchMode: 'quick' });

      // Second call - should use cache
      await service.search({ query, searchMode: 'quick' });

      // Should only invoke tool once
      expect(mockMCPClient.invokeTool).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      vi.useFakeTimers();

      const query = 'Cache TTL test';
      await service.search({ query, searchMode: 'quick' });

      // Advance time beyond TTL (default 1 hour)
      vi.advanceTimersByTime(61 * 60 * 1000);

      await service.search({ query, searchMode: 'quick' });

      // Should invoke tool twice due to cache expiry
      expect(mockMCPClient.invokeTool).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should not cache failed requests', async () => {
      mockMCPClient.invokeTool = vi
        .fn()
        .mockRejectedValueOnce(new Error('Research failed'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Success' }],
        });

      try {
        await service.search({ query: 'test', searchMode: 'quick' });
      } catch {
        // Expected to fail
      }

      // Second attempt should invoke tool again
      await service.search({ query: 'test', searchMode: 'quick' });

      expect(mockMCPClient.invokeTool).toHaveBeenCalledTimes(2);
    });

    it('should provide cache statistics', () => {
      const stats = service.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should allow cache clearing', async () => {
      await service.search({ query: 'test', searchMode: 'quick' });

      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getHistory', () => {
    it('should return research history', async () => {
      await service.search({ query: 'First query', searchMode: 'quick' });
      await service.search({ query: 'Second query', searchMode: 'quick' });

      const history = service.getHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(2);
      expect(history[0]).toHaveProperty('query');
      expect(history[0]).toHaveProperty('timestamp');
    });

    it('should limit history size', async () => {
      // Add many searches
      for (let i = 0; i < 150; i++) {
        await service.search({ query: `Query ${i}`, searchMode: 'quick' });
      }

      const history = service.getHistory();

      // Should limit to max 100 entries
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should order history by most recent first', async () => {
      await service.search({ query: 'First', searchMode: 'quick' });
      await service.search({ query: 'Second', searchMode: 'quick' });
      await service.search({ query: 'Third', searchMode: 'quick' });

      const history = service.getHistory();

      expect(history[0].query).toBe('Third');
      expect(history[1].query).toBe('Second');
      expect(history[2].query).toBe('First');
    });
  });

  describe('exportResearch', () => {
    it('should export research to markdown format', async () => {
      const result = await service.search({
        query: 'Export test',
        searchMode: 'quick',
      });

      const markdown = service.exportResearch(result.id, 'markdown');

      expect(markdown).toContain('# Research Result');
      expect(markdown).toContain('Export test');
    });

    it('should export research to JSON format', async () => {
      const result = await service.search({
        query: 'JSON export test',
        searchMode: 'quick',
      });

      const json = service.exportResearch(result.id, 'json');

      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('query');
      expect(parsed).toHaveProperty('content');
      expect(parsed).toHaveProperty('timestamp');
    });

    it('should throw error for invalid research ID', () => {
      expect(() =>
        service.exportResearch('nonexistent-id', 'markdown')
      ).toThrow('Research result not found: nonexistent-id');
    });
  });

  describe('relatedResearch', () => {
    it('should suggest related research topics', async () => {
      await service.search({
        query: 'PostgreSQL indexing strategies',
        searchMode: 'quick',
      });

      const related = service.getRelatedTopics('PostgreSQL indexing strategies');

      expect(Array.isArray(related)).toBe(true);
      expect(related.length).toBeGreaterThan(0);
      expect(related).toContain('B-tree indexes');
      expect(related).toContain('Index maintenance');
    });
  });

  describe('error handling', () => {
    it('should handle MCP tool invocation errors', async () => {
      mockMCPClient.invokeTool = vi
        .fn()
        .mockRejectedValue(new Error('Tool invocation failed'));

      await expect(
        service.search({ query: 'test', searchMode: 'quick' })
      ).rejects.toThrow('Research failed');
    });

    it('should handle malformed responses', async () => {
      mockMCPClient.invokeTool = vi.fn().mockResolvedValue({
        content: [], // Empty content
      });

      await expect(
        service.search({ query: 'test', searchMode: 'quick' })
      ).rejects.toThrow('Empty research result');
    });

    it('should validate search parameters', async () => {
      await expect(
        service.search({ query: '', searchMode: 'quick' })
      ).rejects.toThrow('Query cannot be empty');

      await expect(
        service.search({ query: 'a'.repeat(2000), searchMode: 'quick' })
      ).rejects.toThrow('Query too long');
    });
  });

  describe('dispose', () => {
    it('should clean up resources on disposal', () => {
      service.dispose();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Research service disposed')
      );

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});
