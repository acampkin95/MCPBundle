/**
 * list-launch-daemons Tool Module
 * Category: system
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ListLaunchDaemonsModule: ToolModule = {
  name: 'list-launch-daemons',
  description: 'list-launch-daemons tool',
  category: 'system',
  tools: [
    {
      name: 'list-launch-daemons',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'system',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'list-launch-daemons',
    {
      description:
        'Lists registered launchd services (daemons and agents) to help diagnose startup tasks.',
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe('Optional substring filter applied to the service label.'),
      },
    },
    async ({ filter }) => {
      try {
        const result = await deps.systemInfo.listLaunchDaemons();
        const stdout = filter
          ? result.stdout
              .split('\n')
              .filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
              .join('\n')
          : result.stdout;

        const structuredContent = {
          command: result.command,
          stdout: stdout.trim(),
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('launchctl list', {
                Command: result.command,
                Services: stdout.trim(),
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
