/**
 * software-maintenance Tool Module
 * Category: system
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const SoftwareMaintenanceModule: ToolModule = {
  name: 'software-maintenance',
  description: 'software-maintenance tool',
  category: 'system',
  tools: [
    {
      name: 'software-maintenance',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'system',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'software-maintenance',
    {
      description:
        'Surfaces package hygiene tasks: Homebrew outdated packages, optional cleanup, and application sizes.',
      inputSchema: {
        includeApplications: z.boolean().default(true),
        performCleanup: z
          .boolean()
          .default(false)
          .describe('When true, runs `brew cleanup` after listing outdated formulae.'),
      },
    },
    async ({ includeApplications, performCleanup }) => {
      try {
        const brewOutdated = await deps.software.listBrewOutdated();
        const resultSummary: Record<string, ReturnType<typeof formatCommandResult>> = {
          brewOutdated: formatCommandResult(brewOutdated),
        };

        if (performCleanup) {
          const cleanup = await deps.software.cleanupBrew();
          resultSummary.brewCleanup = formatCommandResult(cleanup);
        }

        if (includeApplications) {
          const apps = await deps.software.listApplicationsSortedBySize();
          resultSummary.applicationSizes = formatCommandResult(apps);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Software Maintenance', {
                'brew outdated': resultSummary.brewOutdated.stdout,
                ...(performCleanup && resultSummary.brewCleanup
                  ? { 'brew cleanup': resultSummary.brewCleanup.stdout }
                  : {}),
                ...(includeApplications && resultSummary.applicationSizes
                  ? { 'Application Sizes': resultSummary.applicationSizes.stdout }
                  : {}),
              }),
            },
          ],
          structuredContent: resultSummary,
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
