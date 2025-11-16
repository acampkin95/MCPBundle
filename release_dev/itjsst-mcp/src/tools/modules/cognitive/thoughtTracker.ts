/**
 * thought-tracker Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ThoughtTrackerModule: ToolModule = {
  name: 'thought-tracker',
  description: 'thought-tracker tool',
  category: 'cognitive',
  tools: [
    {
      name: 'thought-tracker',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'thought-tracker',
    {
      description:
        'Records sequential thoughts with stage metadata, tagging, and importance analysis.',
      inputSchema: {
        entries: z
          .array(
            z.object({
              stage: z.string().min(1),
              thought: z.string().min(1),
              metadata: z
                .object({
                  source: z.string().optional(),
                  tags: z.array(z.string()).default([]),
                  importance: z.enum(['low', 'medium', 'high']).optional(),
                  external_refs: z.array(z.string()).default([]),
                })
                .optional(),
            })
          )
          .min(1),
        autoNumbering: z.boolean().default(true),
      },
    },
    async ({ entries, autoNumbering }) => {
      await deps.structuredThinking.ensureStorageFile();
      const tracking = deps.structuredThinking.trackThoughts(entries, autoNumbering);

      const timelineText = tracking.timeline
        .map((record) => {
          const bits = [`${record.id} [${record.stage}] ${record.thought}`];
          if (record.metadata?.tags?.length) {
            bits.push(`Tags: ${record.metadata.tags.join(', ')}`);
          }
          if (record.metadata?.importance) {
            bits.push(`Importance: ${record.metadata.importance}`);
          }
          if (record.metadata?.source) {
            bits.push(`Source: ${record.metadata.source}`);
          }
          return bits.join('\n');
        })
        .join('\n\n');

      const summaryLines = ['Stage tally:']; // for final text
      for (const [stage, count] of Object.entries(tracking.stageTally)) {
        summaryLines.push(`- ${stage}: ${count}`);
      }

      if (Object.keys(tracking.importanceBreakdown).length) {
        summaryLines.push('\nImportance breakdown:');
        for (const [level, count] of Object.entries(tracking.importanceBreakdown)) {
          summaryLines.push(`- ${level}: ${count}`);
        }
      }

      if (Object.keys(tracking.tags).length) {
        summaryLines.push('\nTag counts:');
        for (const [tag, count] of Object.entries(tracking.tags)) {
          summaryLines.push(`- ${tag}: ${count}`);
        }
      }

      const sections = {
        Timeline: timelineText,
        Summary: summaryLines.join('\n'),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Thought Tracker', sections),
          },
        ],
        structuredContent: {
          tracking,
        },
      };
    }
  );
  },
};
