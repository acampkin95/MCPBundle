/**
 * thought-import Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ThoughtImportModule: ToolModule = {
  name: 'thought-import',
  description: 'thought-import tool',
  category: 'cognitive',
  tools: [
    {
      name: 'thought-import',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'thought-import',
    {
      description:
        'Imports thoughts from JSON or Markdown content into the workspace history file, optionally appending to existing entries.',
      inputSchema: {
        format: z.enum(['json', 'jsonb', 'markdown', 'claude', 'agents']),
        content: z.string().min(1),
        append: z.boolean().default(true),
        storagePath: z.string().optional(),
      },
    },
    async ({ format, content, append, storagePath }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let existingTimeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (existingTimeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          existingTimeline = bootstrapped;
        }
      }
      existingTimeline = deps.structuredThinking.normaliseTimeline(existingTimeline);
      const imported = deps.structuredThinking.importThoughts({ format, content });

      const combinedTimeline = append
        ? deps.structuredThinking.normaliseTimeline([...existingTimeline, ...imported.timeline])
        : deps.structuredThinking.normaliseTimeline(imported.timeline);

      await deps.structuredThinking.saveStoredTimeline(combinedTimeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(combinedTimeline);

      const sections: Record<string, string> = {
        'Import format': format,
        Mode: append ? 'appended' : 'replaced',
        'Timeline length': tracking.timeline.length.toString(),
        'Storage path': targetPath,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Thought Import', sections),
          },
        ],
        structuredContent: {
          tracking,
          storagePath: targetPath,
        },
      };
    }
  );
  },
};
