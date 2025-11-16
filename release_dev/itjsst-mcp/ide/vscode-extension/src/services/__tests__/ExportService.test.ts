/**
 * Unit tests for ExportService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportService } from '../ExportService';
import { DatabaseService } from '../DatabaseService';
import { CognitiveStage } from '../../types';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('ExportService', () => {
  let service: ExportService;
  let mockDatabaseService: DatabaseService;
  let mockLogger: vscode.OutputChannel;

  beforeEach(() => {
    mockDatabaseService = {
      getSession: vi.fn().mockResolvedValue({
        sessionId: 'test-session-123',
        origin: 'vscode-extension',
        projectName: 'Test Project',
        createdAt: new Date('2025-01-01T10:00:00Z'),
        lastActiveAt: new Date('2025-01-01T12:00:00Z'),
      }),
      getSessionThoughts: vi.fn().mockResolvedValue([
        {
          thoughtId: 'thought-1',
          sessionId: 'test-session-123',
          stage: 'problem_definition' as CognitiveStage,
          content: 'Define the problem clearly',
          metadata: { tags: ['important'] },
          createdAt: new Date('2025-01-01T10:15:00Z'),
        },
        {
          thoughtId: 'thought-2',
          sessionId: 'test-session-123',
          stage: 'research' as CognitiveStage,
          content: 'Research existing solutions',
          metadata: { tags: ['research'] },
          createdAt: new Date('2025-01-01T11:00:00Z'),
        },
      ]),
    } as unknown as DatabaseService;

    mockLogger = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    service = new ExportService(mockDatabaseService, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('exportToJSON', () => {
    it('should export session to JSON format', async () => {
      const json = await service.exportToJSON('test-session-123', {
        includeMetadata: true,
      });

      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('session');
      expect(parsed).toHaveProperty('thoughts');
      expect(parsed.session.sessionId).toBe('test-session-123');
      expect(parsed.thoughts).toHaveLength(2);
    });

    it('should include metadata when requested', async () => {
      const json = await service.exportToJSON('test-session-123', {
        includeMetadata: true,
      });

      const parsed = JSON.parse(json);

      expect(parsed.thoughts[0]).toHaveProperty('metadata');
      expect(parsed.thoughts[0].metadata).toHaveProperty('tags');
    });

    it('should exclude metadata when not requested', async () => {
      const json = await service.exportToJSON('test-session-123', {
        includeMetadata: false,
      });

      const parsed = JSON.parse(json);

      expect(parsed.thoughts[0]).not.toHaveProperty('metadata');
    });

    it('should format timestamps as ISO strings', async () => {
      const json = await service.exportToJSON('test-session-123', {
        includeMetadata: true,
      });

      const parsed = JSON.parse(json);

      expect(parsed.session.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(parsed.thoughts[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should throw error if session not found', async () => {
      mockDatabaseService.getSession = vi.fn().mockResolvedValue(null);

      await expect(
        service.exportToJSON('nonexistent-session', {})
      ).rejects.toThrow('Session not found: nonexistent-session');
    });
  });

  describe('exportToMarkdown', () => {
    it('should export session to Markdown format', async () => {
      const markdown = await service.exportToMarkdown('test-session-123', {
        includeMetadata: true,
      });

      expect(markdown).toContain('# Thinking Session');
      expect(markdown).toContain('test-session-123');
      expect(markdown).toContain('## Problem Definition');
      expect(markdown).toContain('Define the problem clearly');
      expect(markdown).toContain('## Research');
    });

    it('should organize thoughts by cognitive stage', async () => {
      const markdown = await service.exportToMarkdown('test-session-123', {
        includeMetadata: false,
      });

      expect(markdown.indexOf('## Problem Definition')).toBeLessThan(
        markdown.indexOf('## Research')
      );
    });

    it('should include metadata as frontmatter when requested', async () => {
      const markdown = await service.exportToMarkdown('test-session-123', {
        includeMetadata: true,
      });

      expect(markdown).toContain('---');
      expect(markdown).toContain('sessionId:');
      expect(markdown).toContain('projectName:');
    });

    it('should format dates in human-readable format', async () => {
      const markdown = await service.exportToMarkdown('test-session-123', {
        includeMetadata: true,
      });

      expect(markdown).toContain('Created:');
      expect(markdown).toContain('2025');
    });

    it('should handle empty sessions', async () => {
      mockDatabaseService.getSessionThoughts = vi.fn().mockResolvedValue([]);

      const markdown = await service.exportToMarkdown('test-session-123', {
        includeMetadata: false,
      });

      expect(markdown).toContain('No thoughts recorded');
    });
  });

  describe('exportToFile', () => {
    beforeEach(() => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should save JSON export to file', async () => {
      await service.exportToFile('test-session-123', '/tmp/export.json', {
        format: 'json',
        includeMetadata: true,
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/export.json',
        expect.stringContaining('"sessionId"'),
        'utf-8'
      );
    });

    it('should save Markdown export to file', async () => {
      await service.exportToFile('test-session-123', '/tmp/export.md', {
        format: 'markdown',
        includeMetadata: true,
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/export.md',
        expect.stringContaining('# Thinking Session'),
        'utf-8'
      );
    });

    it('should create directory if it does not exist', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.exportToFile(
        'test-session-123',
        '/tmp/nested/dir/export.json',
        {
          format: 'json',
          includeMetadata: false,
        }
      );

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/nested/dir', {
        recursive: true,
      });
    });

    it('should handle file write errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(
        service.exportToFile('test-session-123', '/root/export.json', {
          format: 'json',
          includeMetadata: false,
        })
      ).rejects.toThrow('Failed to export to file');
    });

    it('should validate file extension matches format', async () => {
      await expect(
        service.exportToFile('test-session-123', '/tmp/export.json', {
          format: 'markdown',
          includeMetadata: false,
        })
      ).rejects.toThrow('File extension does not match format');
    });
  });

  describe('exportMultipleSessions', () => {
    it('should export multiple sessions to single file', async () => {
      const json = await service.exportMultipleSessions(
        ['session-1', 'session-2', 'session-3'],
        {
          format: 'json',
          includeMetadata: true,
        }
      );

      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('sessions');
      expect(Array.isArray(parsed.sessions)).toBe(true);
    });

    it('should combine sessions in Markdown format', async () => {
      const markdown = await service.exportMultipleSessions(
        ['session-1', 'session-2'],
        {
          format: 'markdown',
          includeMetadata: false,
        }
      );

      expect(markdown).toContain('# Session 1:');
      expect(markdown).toContain('# Session 2:');
    });

    it('should skip sessions that do not exist', async () => {
      mockDatabaseService.getSession = vi
        .fn()
        .mockResolvedValueOnce({ sessionId: 'session-1' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ sessionId: 'session-3' });

      const json = await service.exportMultipleSessions(
        ['session-1', 'nonexistent', 'session-3'],
        {
          format: 'json',
          includeMetadata: false,
        }
      );

      const parsed = JSON.parse(json);

      expect(parsed.sessions).toHaveLength(2);
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Session not found: nonexistent')
      );
    });
  });

  describe('importFromJSON', () => {
    it('should import session from JSON string', async () => {
      const jsonData = JSON.stringify({
        session: {
          sessionId: 'imported-session',
          origin: 'imported',
          projectName: 'Imported Project',
        },
        thoughts: [
          {
            thoughtId: 'imported-thought-1',
            sessionId: 'imported-session',
            stage: 'problem_definition',
            content: 'Imported thought',
          },
        ],
      });

      mockDatabaseService.createSession = vi
        .fn()
        .mockResolvedValue({ sessionId: 'new-session-id' });
      mockDatabaseService.addThought = vi.fn().mockResolvedValue({});

      const result = await service.importFromJSON(jsonData);

      expect(result).toHaveProperty('sessionId');
      expect(mockDatabaseService.createSession).toHaveBeenCalled();
      expect(mockDatabaseService.addThought).toHaveBeenCalled();
    });

    it('should validate JSON structure', async () => {
      const invalidJSON = '{"invalid": "structure"}';

      await expect(service.importFromJSON(invalidJSON)).rejects.toThrow(
        'Invalid export format'
      );
    });

    it('should handle malformed JSON', async () => {
      const malformedJSON = '{"session": invalid}';

      await expect(service.importFromJSON(malformedJSON)).rejects.toThrow(
        'Invalid JSON'
      );
    });
  });

  describe('getExportFormats', () => {
    it('should return list of supported export formats', () => {
      const formats = service.getExportFormats();

      expect(Array.isArray(formats)).toBe(true);
      expect(formats).toContain('json');
      expect(formats).toContain('markdown');
    });
  });

  describe('dispose', () => {
    it('should clean up resources on disposal', () => {
      service.dispose();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Export service disposed')
      );
    });
  });
});
