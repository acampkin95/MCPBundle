/**
 * structured-diagnostics Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const StructuredDiagnosticsModule: ToolModule = {
  name: 'structured-diagnostics',
  description: 'structured-diagnostics tool',
  category: 'cognitive',
  tools: [
    {
      name: 'structured-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'structured-diagnostics',
    {
      description:
        'Analyzes the structured thinking timeline for coverage gaps, stale entries, and pending high-importance work.',
      inputSchema: {
        staleHours: z.number().int().min(1).max(168).default(24),
        storagePath: z.string().optional(),
      },
    },
    async ({ staleHours, storagePath }) => {
      const { timeline, storagePath: resolvedPath } = await loadStructuredTimeline(
        deps,
        storagePath
      );
      const diagnostics = deps.structuredThinking.diagnoseTimeline(timeline, { staleHours });

      const stageCoverageText = Object.entries(diagnostics.stageCoverage)
        .map(([stage, count]) => `- ${stage}: ${count}`)
        .join('\n');
      const missingText = diagnostics.missingStages.length
        ? diagnostics.missingStages.map((stage) => `- ${stage}`).join('\n')
        : '<none>';
      const pendingText = diagnostics.highImportancePending.length
        ? diagnostics.highImportancePending
            .map((record) => `- ${record.id} [${record.stage}] ${record.thought}`)
            .join('\n')
        : '<none>';
      const sourcesText = diagnostics.sourceSummaries.length
        ? diagnostics.sourceSummaries
            .map(
              (summary) => `- ${summary.source}: ${summary.count} (last: ${summary.lastRecorded})`
            )
            .join('\n')
        : '<none>';

      const sections: Record<string, string> = {
        'Total thoughts': diagnostics.totalThoughts.toString(),
        'Last updated': diagnostics.lastUpdated ?? 'unknown',
        'Stage coverage': stageCoverageText,
        'Missing stages': missingText,
        'High-importance pending': pendingText,
        'Source summary': sourcesText,
        'Storage path': resolvedPath,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Structured Thinking Diagnostics', sections),
          },
        ],
        structuredContent: {
          diagnostics,
          storagePath: resolvedPath,
        },
      };
    }
  );
  },
};
