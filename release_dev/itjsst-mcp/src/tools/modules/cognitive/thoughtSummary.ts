/**
 * thought-summary Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ThoughtSummaryModule: ToolModule = {
  name: 'thought-summary',
  description: 'thought-summary tool',
  category: 'cognitive',
  tools: [
    {
      name: 'thought-summary',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'thought-summary',
    {
      description:
        'Builds a summary of the stored thought history, including progress metrics and related thought groupings.',
      inputSchema: {
        storagePath: z.string().optional(),
        topRelated: z.number().int().min(1).max(20).default(5),
      },
    },
    async ({ storagePath, topRelated }) => {
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

      const related = tracking.relatedThoughts.slice(0, topRelated);
      const relatedText = related.length
        ? related
            .map((group) => {
              const label = group.tag ?? group.stage ?? group.importance ?? 'related';
              const items = group.thoughts
                .map((thought) => `  - ${thought.id} [${thought.stage}] ${thought.thought}`)
                .join('\n');
              return `* ${label}\n${items}`;
            })
            .join('\n\n')
        : 'No related thoughts detected.';

      const sections: Record<string, string> = {
        Summary: tracking.summary,
        Progress: `${tracking.progress.completed}/${tracking.progress.total} (${tracking.progress.percentage}%)`,
        'Related thoughts': relatedText,
        'Storage path': targetPath,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Thought Summary', sections),
          },
        ],
        structuredContent: {
          tracking,
          related: related,
          storagePath: targetPath,
        },
      };
    }
  );
  },
};
