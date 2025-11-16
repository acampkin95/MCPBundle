/**
 * assess-thought-quality Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const AssessThoughtQualityModule: ToolModule = {
  name: 'assess-thought-quality',
  description: 'assess-thought-quality tool',
  category: 'cognitive',
  tools: [
    {
      name: 'assess-thought-quality',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'assess-thought-quality',
    {
      description:
        'Assess the quality of one or more thoughts using multi-dimensional analysis (completeness, specificity, coherence, novelty, actionability, evidence-based scoring with confidence levels and actionable suggestions)',
      inputSchema: {
        thoughtIds: z.array(z.string()).min(1).optional(),
        recentCount: z.number().int().min(1).max(10).default(1),
        storagePath: z.string().optional(),
      },
    },
    async ({ thoughtIds, recentCount, storagePath }) => {
      const { timeline } = await loadStructuredTimeline(deps, storagePath);

      const thoughtsToAssess = thoughtIds
        ? timeline.filter((t) => thoughtIds.includes(t.id))
        : timeline.slice(-recentCount);

      if (thoughtsToAssess.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Thought Quality Assessment', {
                Status: 'No thoughts found to assess',
              }),
            },
          ],
          structuredContent: { assessments: [] },
        };
      }

      const assessments = thoughtsToAssess.map((thought) => {
        const thoughtIndex = timeline.indexOf(thought);
        const priorThoughts = timeline.slice(0, thoughtIndex);
        return deps.metacognitive.assessThought(thought, priorThoughts);
      });

      const sections: Record<string, string> = {};
      for (const assessment of assessments) {
        const dims = assessment.qualityDimensions;
        const flagsText = assessment.flags.length
          ? assessment.flags.map((f) => `[${f.type.toUpperCase()}] ${f.message}`).join('\n      ')
          : 'None';
        const suggestionsText = assessment.suggestions.length
          ? assessment.suggestions.map((s) => `  - ${s}`).join('\n    ')
          : 'None';

        sections[assessment.thoughtId] = [
          `Overall Score: ${(assessment.overallScore * 100).toFixed(1)}% (confidence: ${(assessment.confidence * 100).toFixed(1)}%)`,
          `Dimensions:`,
          `  - Completeness: ${(dims.completeness * 100).toFixed(0)}%`,
          `  - Specificity: ${(dims.specificity * 100).toFixed(0)}%`,
          `  - Coherence: ${(dims.coherence * 100).toFixed(0)}%`,
          `  - Novelty: ${(dims.novelty * 100).toFixed(0)}%`,
          `  - Actionability: ${(dims.actionability * 100).toFixed(0)}%`,
          `  - Evidence-Based: ${(dims.evidenceBased * 100).toFixed(0)}%`,
          `Flags: ${flagsText}`,
          `Suggestions:\n    ${suggestionsText}`,
        ].join('\n');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Thought Quality Assessment', sections),
          },
        ],
        structuredContent: { assessments },
      };
    }
  );
  },
};
