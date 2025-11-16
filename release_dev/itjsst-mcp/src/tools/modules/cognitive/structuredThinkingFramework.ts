/**
 * structured-thinking-framework Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const StructuredThinkingFrameworkModule: ToolModule = {
  name: 'structured-thinking-framework',
  description: 'structured-thinking-framework tool',
  category: 'cognitive',
  tools: [
    {
      name: 'structured-thinking-framework',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'structured-thinking-framework',
    {
      description:
        'Provides the standard structured thinking stages and optional custom extensions with guiding questions.',
      inputSchema: {
        includeExamples: z.boolean().default(true),
        customStages: z
          .array(
            z.object({
              id: z.string().min(1),
              title: z.string().min(1),
              description: z.string().min(1),
              guidingQuestions: z.array(z.string()).default([]),
              exampleActivities: z.array(z.string()).default([]),
            })
          )
          .default([]),
      },
    },
    async ({ includeExamples, customStages }) => {
      await deps.structuredThinking.ensureStorageFile();
      const framework = deps.structuredThinking.getFramework({
        includeExamples,
        customStages: customStages.length ? customStages : undefined,
      });

      const sections: Record<string, string> = {};
      for (const stage of framework) {
        const lines = [stage.description];
        if (stage.guidingQuestions?.length) {
          lines.push(
            '\nGuiding questions:',
            ...stage.guidingQuestions.map((question) => `- ${question}`)
          );
        }
        if (includeExamples !== false && stage.exampleActivities?.length) {
          lines.push(
            '\nExample activities:',
            ...stage.exampleActivities.map((activity) => `- ${activity}`)
          );
        }
        sections[stage.title] = lines.join('\n');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Structured Thinking Framework', sections),
          },
        ],
        structuredContent: {
          stages: framework,
        },
      };
    }
  );
  },
};
