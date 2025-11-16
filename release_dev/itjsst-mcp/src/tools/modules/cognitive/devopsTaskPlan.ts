/**
 * devops-task-plan Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const DevopsTaskPlanModule: ToolModule = {
  name: 'devops-task-plan',
  description: 'devops-task-plan tool',
  category: 'cognitive',
  tools: [
    {
      name: 'devops-task-plan',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'devops-task-plan',
    {
      description:
        'Generates a DevOps checklist, CI/CD pipeline, and debugging tracks from the stored thought history, ready for Linear/Notion export.',
      inputSchema: {
        goal: z.string().default('Structured thinking session'),
        context: z.string().optional(),
        assumptions: z.array(z.string()).default([]),
        constraints: z.array(z.string()).default([]),
        stages: z.array(z.string()).default([]),
        storagePath: z.string().optional(),
      },
    },
    async ({ goal, context, assumptions, constraints, stages, storagePath }) => {
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

      const decomposition = deps.taskDecomposition.buildDecomposition({
        goal,
        context,
        assumptions,
        constraints,
        stages: stages.length ? stages : undefined,
        thoughts: timeline,
      });

      const linearPayload = deps.taskDecomposition.prepareLinearPayload(decomposition.tasks);
      const notionPayload = deps.taskDecomposition.prepareNotionPayload(decomposition.tasks);

      const summarySections: Record<string, string> = {
        Goal: goal,
        'Critical path': decomposition.criticalPath.join(' -> '),
        'CI pipeline': decomposition.ciPipeline.map((stage) => stage.name).join(', '),
        'Debug tracks': decomposition.debugTracks.length
          ? decomposition.debugTracks.map((track) => `${track.id} (${track.status})`).join(', ')
          : 'None',
        Tasks: decomposition.tasks.length.toString(),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('DevOps Task Plan', summarySections),
          },
        ],
        structuredContent: {
          decomposition,
          linearPayload,
          notionPayload,
          storagePath: targetPath,
        },
      };
    }
  );
  },
};
