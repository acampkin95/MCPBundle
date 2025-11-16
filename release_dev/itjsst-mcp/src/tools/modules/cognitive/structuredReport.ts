/**
 * structured-report Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const StructuredReportModule: ToolModule = {
  name: 'structured-report',
  description: 'structured-report tool',
  category: 'cognitive',
  tools: [
    {
      name: 'structured-report',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'structured-report',
    {
      description:
        'Generates a comprehensive structured thinking report in Markdown or JSON, optionally including the recent timeline.',
      inputSchema: {
        format: z.enum(['markdown', 'json']).default('markdown'),
        includeTimeline: z.boolean().default(false),
        maxEntries: z.number().int().min(1).max(200).default(25),
        staleHours: z.number().int().min(1).max(168).default(24),
        storagePath: z.string().optional(),
      },
    },
    async ({ format, includeTimeline, maxEntries, staleHours, storagePath }) => {
      const { timeline, storagePath: resolvedPath } = await loadStructuredTimeline(
        deps,
        storagePath
      );
      const report = deps.structuredThinking.generateReport(timeline, {
        format,
        includeTimeline,
        maxEntries,
        staleHours,
      });

      const textContent =
        format === 'markdown' ? report.content : `Report (${format})\n\n${report.content}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: textContent,
          },
        ],
        structuredContent: {
          report,
          storagePath: resolvedPath,
        },
      };
    }
  );
  },
};
