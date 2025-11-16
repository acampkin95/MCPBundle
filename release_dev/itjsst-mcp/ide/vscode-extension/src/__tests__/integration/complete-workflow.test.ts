/**
 * Integration tests for complete thinking session workflows
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../services/DatabaseService';
import { ExportService } from '../../services/ExportService';
import { SearchService } from '../../services/SearchService';
import { CredentialService } from '../../services/CredentialService';
import { MCPClientService } from '../../services/MCPClientService';
import { CognitiveStage } from '../../types';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

describe('Complete Thinking Session Workflow', () => {
  let dbService: DatabaseService;
  let exportService: ExportService;
  let searchService: SearchService;
  let credentialService: CredentialService;
  let mockLogger: vscode.OutputChannel;
  let testDbPath: string;

  beforeEach(() => {
    // Create temporary database for integration tests
    testDbPath = path.join(os.tmpdir(), `test-thinking-${Date.now()}.db`);

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

    credentialService = new CredentialService(mockContext, mockLogger);

    const dbConfig = {
      mode: 'sqlite' as const,
      sqlite: {
        databasePath: testDbPath,
        enableWAL: true,
      },
    };

    dbService = new DatabaseService(dbConfig, credentialService, mockLogger);
  });

  afterEach(async () => {
    await dbService.dispose();
  });

  it('should complete full session lifecycle: create → add thoughts → search → export', async () => {
    // Initialize database
    await dbService.initialize();

    // 1. Create a new thinking session
    const session = await dbService.createSession({
      origin: 'integration-test',
      projectName: 'Test Project',
      projectId: 'test-project-123',
    });

    expect(session).toHaveProperty('sessionId');
    expect(session.projectName).toBe('Test Project');

    // 2. Add thoughts across all cognitive stages
    const stages: CognitiveStage[] = [
      'problem_definition',
      'research',
      'analysis',
      'synthesis',
      'conclusion',
    ];

    const thoughts = [];
    for (const stage of stages) {
      const thought = await dbService.addThought({
        sessionId: session.sessionId,
        stage,
        content: `This is a ${stage} thought with important content`,
        metadata: {
          tags: [stage, 'test'],
          importance: 'high',
        },
        qualityScore: 85,
      });
      thoughts.push(thought);
    }

    expect(thoughts).toHaveLength(5);

    // 3. Retrieve all session thoughts
    const sessionThoughts = await dbService.getSessionThoughts(session.sessionId);
    expect(sessionThoughts.length).toBeGreaterThanOrEqual(5);

    // 4. Search for specific content
    const mockMCPClient = {
      invokeTool: async () => ({ content: [] }),
    } as unknown as MCPClientService;

    searchService = new SearchService(dbService, mockMCPClient, mockLogger);

    const searchResults = await searchService.searchLocal({
      query: 'important content',
      sessionId: session.sessionId,
    });

    expect(searchResults.length).toBeGreaterThan(0);

    // 5. Export session to JSON
    exportService = new ExportService(dbService, mockLogger);

    const jsonExport = await exportService.exportToJSON(session.sessionId, {
      includeMetadata: true,
    });

    const parsed = JSON.parse(jsonExport);
    expect(parsed.session.sessionId).toBe(session.sessionId);
    expect(parsed.thoughts.length).toBeGreaterThanOrEqual(5);

    // 6. Export session to Markdown
    const markdownExport = await exportService.exportToMarkdown(
      session.sessionId,
      {
        includeMetadata: true,
      }
    );

    expect(markdownExport).toContain('# Thinking Session');
    expect(markdownExport).toContain('Problem Definition');
    expect(markdownExport).toContain('Research');

    // 7. Update a thought
    await dbService.updateThought(thoughts[0].thoughtId, {
      content: 'Updated problem definition',
      metadata: {
        tags: ['updated', 'revised'],
        importance: 'critical',
      },
    });

    const updatedThought = await dbService.getThought(thoughts[0].thoughtId);
    expect(updatedThought?.content).toBe('Updated problem definition');

    // 8. Delete a thought
    await dbService.deleteThought(thoughts[4].thoughtId);

    const deletedThought = await dbService.getThought(thoughts[4].thoughtId);
    expect(deletedThought).toBeNull();

    // Verify final state
    const finalThoughts = await dbService.getSessionThoughts(session.sessionId);
    expect(finalThoughts.length).toBe(4); // 5 - 1 deleted
  });

  it('should handle concurrent sessions without conflicts', async () => {
    await dbService.initialize();

    // Create multiple sessions concurrently
    const sessionPromises = Array.from({ length: 5 }, (_, i) =>
      dbService.createSession({
        origin: 'concurrent-test',
        projectName: `Project ${i}`,
      })
    );

    const sessions = await Promise.all(sessionPromises);
    expect(sessions).toHaveLength(5);

    // Add thoughts to each session concurrently
    const thoughtPromises = sessions.flatMap((session) =>
      Array.from({ length: 3 }, (_, i) =>
        dbService.addThought({
          sessionId: session.sessionId,
          stage: 'problem_definition' as CognitiveStage,
          content: `Thought ${i} in session ${session.sessionId}`,
        })
      )
    );

    const thoughts = await Promise.all(thoughtPromises);
    expect(thoughts).toHaveLength(15); // 5 sessions * 3 thoughts

    // Verify each session has exactly 3 thoughts
    for (const session of sessions) {
      const sessionThoughts = await dbService.getSessionThoughts(session.sessionId);
      expect(sessionThoughts).toHaveLength(3);
    }
  });

  it('should maintain data integrity during search and export operations', async () => {
    await dbService.initialize();

    const session = await dbService.createSession({
      origin: 'integrity-test',
    });

    // Add varied content
    const thoughtContents = [
      'PostgreSQL database optimization strategies',
      'Implementing JWT authentication in Node.js',
      'React hooks best practices',
      'TypeScript generics advanced patterns',
      'Docker container orchestration',
    ];

    for (const content of thoughtContents) {
      await dbService.addThought({
        sessionId: session.sessionId,
        stage: 'research' as CognitiveStage,
        content,
      });
    }

    // Search for specific terms
    const mockMCPClient = {} as MCPClientService;
    searchService = new SearchService(dbService, mockMCPClient, mockLogger);
    exportService = new ExportService(dbService, mockLogger);

    const postgresResults = await searchService.searchLocal({
      query: 'PostgreSQL',
    });
    expect(postgresResults.length).toBeGreaterThan(0);

    const typescriptResults = await searchService.searchLocal({
      query: 'TypeScript',
    });
    expect(typescriptResults.length).toBeGreaterThan(0);

    // Export and verify all content is preserved
    const exported = await exportService.exportToJSON(session.sessionId, {
      includeMetadata: false,
    });

    const parsed = JSON.parse(exported);
    expect(parsed.thoughts).toHaveLength(5);

    for (const originalContent of thoughtContents) {
      const found = parsed.thoughts.some((t: any) => t.content === originalContent);
      expect(found).toBe(true);
    }
  });

  it('should handle error recovery during workflow', async () => {
    await dbService.initialize();

    const session = await dbService.createSession({
      origin: 'error-recovery-test',
    });

    // Add valid thought
    const validThought = await dbService.addThought({
      sessionId: session.sessionId,
      stage: 'problem_definition' as CognitiveStage,
      content: 'Valid thought',
    });

    expect(validThought).toHaveProperty('thoughtId');

    // Attempt invalid operations
    await expect(
      dbService.addThought({
        sessionId: session.sessionId,
        stage: 'invalid_stage' as CognitiveStage,
        content: 'Invalid stage',
      })
    ).rejects.toThrow();

    // Verify session is still functional
    const thoughts = await dbService.getSessionThoughts(session.sessionId);
    expect(thoughts).toHaveLength(1);

    // Can still add more thoughts
    const anotherThought = await dbService.addThought({
      sessionId: session.sessionId,
      stage: 'research' as CognitiveStage,
      content: 'Another valid thought',
    });

    expect(anotherThought).toHaveProperty('thoughtId');

    const finalThoughts = await dbService.getSessionThoughts(session.sessionId);
    expect(finalThoughts).toHaveLength(2);
  });

  it('should support import/export round-trip', async () => {
    await dbService.initialize();
    exportService = new ExportService(dbService, mockLogger);

    // Create original session
    const originalSession = await dbService.createSession({
      origin: 'round-trip-test',
      projectName: 'Original Project',
    });

    await dbService.addThought({
      sessionId: originalSession.sessionId,
      stage: 'problem_definition' as CognitiveStage,
      content: 'Original thought content',
      metadata: { tags: ['important'] },
    });

    // Export to JSON
    const exportedJSON = await exportService.exportToJSON(
      originalSession.sessionId,
      {
        includeMetadata: true,
      }
    );

    // Import from JSON
    const importedSession = await exportService.importFromJSON(exportedJSON);

    // Verify imported session matches original
    const importedThoughts = await dbService.getSessionThoughts(
      importedSession.sessionId
    );

    expect(importedThoughts).toHaveLength(1);
    expect(importedThoughts[0].content).toBe('Original thought content');
    expect(importedThoughts[0].metadata).toHaveProperty('tags');
  });
});
