/**
 * cleanup-runbook Tool Module
 * Category: system
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const CleanupRunbookModule: ToolModule = {
  name: 'cleanup-runbook',
  description: 'cleanup-runbook tool',
  category: 'system',
  tools: [
    {
      name: 'cleanup-runbook',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'system',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'cleanup-runbook',
    {
      description:
        'Runs macOS hygiene tasks (caches, downloads, Time Machine thinning). Supports dry-run previews before executing.',
      inputSchema: {
        purgeUserCaches: z.boolean().default(true),
        purgeSystemCaches: z.boolean().default(false),
        purgeDownloadsOlderThanDays: z.number().int().min(1).max(365).default(60),
        downloadsPath: z
          .string()
          .default(`${process.env.HOME ?? '~'}/Downloads`)
          .describe('Directory to clean when purging old download files.'),
        thinTimeMachineSnapshotsGb: z.number().min(0).max(200).default(0),
        dryRun: z
          .boolean()
          .default(true)
          .describe('When true, show commands without executing them.'),
      },
    },
    async (options) => {
      try {
        const summaries: Record<string, ReturnType<typeof formatCommandResult>> = {};

        if (options.purgeUserCaches) {
          const result = await deps.cleanup.cleanUserCaches(options);
          summaries[result.name] = formatCommandResult(result.result);
        }

        if (options.purgeSystemCaches) {
          const result = await deps.cleanup.cleanSystemCaches(options);
          summaries[result.name] = formatCommandResult(result.result);
        }

        if (options.purgeDownloadsOlderThanDays > 0) {
          const result = await deps.cleanup.purgeDownloads({
            target: options.downloadsPath,
            olderThanDays: options.purgeDownloadsOlderThanDays,
            dryRun: options.dryRun,
          });
          summaries[result.name] = formatCommandResult(result.result);
        }

        if (options.thinTimeMachineSnapshotsGb > 0) {
          const result = await deps.cleanup.thinTimeMachineSnapshots(
            options.thinTimeMachineSnapshotsGb,
            options
          );
          summaries[result.name] = formatCommandResult(result.result);
        }

        const structuredContent = {
          dryRun: options.dryRun,
          tasks: summaries,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Cleanup Runbook', {
                Mode: options.dryRun ? 'Dry run (no changes applied)' : 'Executing cleanup tasks',
                Tasks: JSON.stringify(structuredContent.tasks, null, 2),
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
