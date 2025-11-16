/**
 * quality-trends Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const QualityTrendsModule: ToolModule = {
  name: 'quality-trends',
  description: 'quality-trends tool',
  category: 'cognitive',
  tools: [
    {
      name: 'quality-trends',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'quality-trends',
    {
      description:
        'Analyze quality trends across thought timeline to identify improving, declining, or stable dimensions',
      inputSchema: {
        dimensions: z
          .array(
            z.enum([
              'completeness',
              'specificity',
              'coherence',
              'novelty',
              'actionability',
              'evidenceBased',
            ])
          )
          .optional(),
        minAssessments: z.number().int().min(3).default(3),
        storagePath: z.string().optional(),
      },
    },
    async ({ dimensions, minAssessments, storagePath }) => {
      const { timeline } = await loadStructuredTimeline(deps, storagePath);

      if (timeline.length < minAssessments) {
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Quality Trends', {
                Status: `Insufficient thoughts (${timeline.length}/${minAssessments} required)`,
              }),
            },
          ],
          structuredContent: { trends: [] },
        };
      }

      const assessments = timeline.map((thought, index) => {
        const priorThoughts = timeline.slice(0, index);
        return deps.metacognitive.assessThought(thought, priorThoughts);
      });

      const allTrends = deps.metacognitive.analyzeTrends(assessments);
      const trends = dimensions
        ? allTrends.filter((t) =>
            dimensions.includes(
              t.dimension as
                | 'completeness'
                | 'specificity'
                | 'coherence'
                | 'novelty'
                | 'actionability'
                | 'evidenceBased'
            )
          )
        : allTrends;

      const sections: Record<string, string> = {};
      for (const trend of trends) {
        const arrow =
          trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
        sections[`${arrow} ${trend.dimension}`] = [
          `Direction: ${trend.direction}`,
          `Change Rate: ${(trend.changeRate * 100).toFixed(2)}% per thought`,
          `Recent Average (last 3): ${(trend.recentAverage * 100).toFixed(1)}%`,
          `Historical Average: ${(trend.historicalAverage * 100).toFixed(1)}%`,
        ].join('\n');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Quality Trends Analysis', sections),
          },
        ],
        structuredContent: { trends },
      };
    }
  );
  },
};
