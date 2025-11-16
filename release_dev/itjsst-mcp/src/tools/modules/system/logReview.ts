/**
 * log-review Tool Module
 * Category: system
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const LogReviewModule: ToolModule = {
  name: 'log-review',
  description: 'log-review tool',
  category: 'system',
  tools: [
    {
      name: 'log-review',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'system',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'log-review',
    {
      description:
        'Aggregates recent macOS log entries for quick triage. Filter by predicate or process name.',
      inputSchema: {
        lastMinutes: z.number().int().min(1).max(1440).default(120),
        predicate: z.string().optional().describe('Raw log predicate to pass to `log show`.'),
        process: z.string().optional().describe('Process or binary name to isolate.'),
        limit: z.number().int().min(1).max(1000).default(250),
      },
    },
    async ({ lastMinutes, predicate, process, limit }) => {
      try {
        const logResult = process
          ? await deps.logs.inspectProcess(process, { predicate, lastMinutes, limit })
          : await deps.logs.collectErrorEvents({ predicate, lastMinutes, limit });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Log Review', {
                Command: logResult.command,
                Output: logResult.result.stdout.trim(),
              }),
            },
          ],
          structuredContent: {
            command: logResult.command,
            stdout: logResult.result.stdout.trim(),
            stderr: logResult.result.stderr.trim(),
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
