/**
 * thought-export Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ThoughtExportModule: ToolModule = {
  name: 'thought-export',
  description: 'thought-export tool',
  category: 'cognitive',
  tools: [
    {
      name: 'thought-export',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'thought-export',
    {
      description:
        'Exports the stored thought history to JSON/Markdown formats within the workspace and returns the output string.',
      inputSchema: {
        format: z.enum(['json', 'jsonb', 'markdown', 'claude', 'agents']).default('json'),
        includeMetadata: z.boolean().default(true),
        destinationPath: z.string().optional(),
        storagePath: z.string().optional(),
      },
    },
    async ({ format, includeMetadata, destinationPath, storagePath }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let timeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (timeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          timeline = bootstrapped;
        }
      }
      timeline = deps.structuredThinking.normaliseTimeline(timeline);
      await deps.structuredThinking.saveStoredTimeline(timeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(timeline);

      const resolvedDestination = destinationPath
        ? pathResolve(destinationPath)
        : getDefaultExportPath(format as ThoughtExportFormat);

      const contents = await deps.structuredThinking.exportToFile(
        tracking,
        {
          format,
          includeMetadata,
        },
        resolvedDestination
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Thought Export', {
              Format: format,
              'Destination file': resolvedDestination,
              Bytes: Buffer.byteLength(contents, 'utf8').toString(),
            }),
          },
        ],
        structuredContent: {
          format,
          destination: resolvedDestination,
          output: contents,
        },
      };
    }
  );
  },
};
