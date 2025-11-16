/**
 * metacognitive-report Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const MetacognitiveReportModule: ToolModule = {
  name: 'metacognitive-report',
  description: 'metacognitive-report tool',
  category: 'cognitive',
  tools: [
    {
      name: 'metacognitive-report',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'metacognitive-report',
    {
      description:
        'Generate comprehensive quality report for structured thinking session with quality trends, stage-specific analysis, and improvement recommendations',
      inputSchema: {
        minThoughts: z.number().int().min(1).default(1),
        storagePath: z.string().optional(),
      },
    },
    async ({ minThoughts, storagePath }) => {
      const { timeline } = await loadStructuredTimeline(deps, storagePath);

      if (timeline.length < minThoughts) {
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Metacognitive Report', {
                Status: `Insufficient thoughts (${timeline.length}/${minThoughts} required)`,
              }),
            },
          ],
          structuredContent: { error: 'Insufficient thoughts' },
        };
      }

      const report = deps.metacognitive.generateReport(timeline);

      const trendsText = report.trends
        .map(
          (trend: {
            readonly dimension: string;
            readonly direction: string;
            readonly changeRate: number;
            readonly recentAverage: number;
          }) => {
            const arrow =
              trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
            return `  ${arrow} ${trend.dimension}: ${trend.direction} (${(trend.changeRate * 100).toFixed(1)}%/thought, recent avg: ${(trend.recentAverage * 100).toFixed(0)}%)`;
          }
        )
        .join('\n');

      const stageQualityText = Object.entries(report.stageQuality)
        .map(([stage, score]) => `  - ${stage}: ${(score * 100).toFixed(0)}%`)
        .join('\n');

      const issuesText = report.criticalIssues.length
        ? report.criticalIssues.map((issue) => `  - ${issue}`).join('\n')
        : '  None';

      const recommendationsText = report.recommendations.length
        ? report.recommendations.map((rec) => `  - ${rec}`).join('\n')
        : '  None';

      const sections: Record<string, string> = {
        'Overall Quality': `${(report.overallQuality * 100).toFixed(1)}%`,
        'Total Assessments': report.assessments.length.toString(),
        'Quality Trends': trendsText || '  No trends detected',
        'Stage Quality': stageQualityText || '  No stage data',
        'Critical Issues': issuesText,
        Recommendations: recommendationsText,
        'Needs Follow-up': report.needsFollowUp ? 'Yes' : 'No',
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Metacognitive Report', sections),
          },
        ],
        structuredContent: { report },
      };
    }
  );
  },
};
