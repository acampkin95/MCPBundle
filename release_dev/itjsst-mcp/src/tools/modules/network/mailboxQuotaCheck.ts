/**
 * mailbox-quota-check Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const MailboxQuotaCheckModule: ToolModule = {
  name: 'mailbox-quota-check',
  description: 'mailbox-quota-check tool',
  category: 'network',
  tools: [
    {
      name: 'mailbox-quota-check',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'mailbox-quota-check',
    {
      description:
        'Calculates mailbox storage consumption using du. Useful for locating oversized accounts.',
      inputSchema: {
        path: z
          .string()
          .default(`${process.env.HOME ?? '~'}/Library/Mail`)
          .describe('Mailbox directory to measure.'),
        includeBreakdown: z
          .boolean()
          .default(true)
          .describe('When true, include per-subfolder usage.'),
      },
    },
    async ({ path, includeBreakdown }) => {
      try {
        const quota = await deps.email.checkMailboxUsage(path, includeBreakdown);
        const totalEntries = parseDuEntries(quota.total.stdout);
        const totalSummary = totalEntries[0] ?? {
          size: quota.total.stdout.trim(),
          path: quota.resolvedPath,
        };

        const breakdownEntries = quota.breakdown ? parseDuEntries(quota.breakdown.stdout) : [];

        const sections: Record<string, string> = {
          Path: `${quota.targetPath} (resolved: ${quota.resolvedPath})`,
          Total: `${totalSummary.size} ${totalSummary.path}`,
        };

        if (includeBreakdown) {
          sections.Breakdown =
            breakdownEntries.length === 0
              ? 'No subdirectories found or breakdown unavailable.'
              : breakdownEntries.map((entry) => `${entry.size}\t${entry.path}`).join('\n');
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Mailbox Quota', sections),
            },
          ],
          structuredContent: {
            targetPath: quota.targetPath,
            resolvedPath: quota.resolvedPath,
            total: {
              command: quota.total.command,
              size: totalSummary.size,
              path: totalSummary.path,
              rawOutput: quota.total.stdout.trim(),
            },
            breakdown:
              includeBreakdown && quota.breakdown
                ? {
                    command: quota.breakdown.command,
                    entries: breakdownEntries,
                    rawOutput: quota.breakdown.stdout.trim(),
                  }
                : includeBreakdown
                  ? null
                  : undefined,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
