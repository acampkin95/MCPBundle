/**
 * system-overview Tool Module
 * Category: system
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const SystemOverviewModule: ToolModule = {
  name: 'system-overview',
  description: 'system-overview tool',
  category: 'system',
  tools: [
    {
      name: 'system-overview',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'system',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'system-overview',
    {
      description:
        'Collects a detailed snapshot of system health, resource usage, and running processes.',
      inputSchema: {
        topProcesses: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Number of processes to include from top.'),
      },
    },
    async ({ topProcesses }) => {
      try {
        const overview = await deps.systemInfo.getSystemOverview(topProcesses);

        const structuredContent = {
          uname: overview.uname,
          uptime: overview.uptime,
          loadAverage: overview.loadAverage,
          memory: overview.memory,
          topProcesses: overview.topProcesses,
          diskUsage: overview.diskUsage,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('System Overview', {
                'Kernel & Hardware': overview.uname,
                Uptime: `${overview.uptime}\nLoad Average: ${overview.loadAverage}`,
                Memory: overview.memory,
                'Top Processes': overview.topProcesses,
                'Disk Usage': overview.diskUsage,
              }),
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
