/**
 * playbook-preview Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const PlaybookPreviewModule: ToolModule = {
  name: 'playbook-preview',
  description: 'playbook-preview tool',
  category: 'cognitive',
  tools: [
    {
      name: 'playbook-preview',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'playbook-preview',
    {
      description:
        'Validates and summarizes a sequence of tool executions (playbook) without running the underlying tools.',
      inputSchema: {
        name: z.string().default('mac-playbook'),
        captureReport: z.boolean().default(true),
        steps: z
          .array(
            z.object({
              id: z.string().default(() => randomUUID()),
              tool: z.string(),
              description: z.string().optional(),
              params: z.record(z.any()).default({}),
            })
          )
          .min(1),
      },
    },
    async ({ name, captureReport, steps }) => {
      const lines: string[] = [];
      const capabilitySet = new Set<string>();
      const missingMetadata: string[] = [];

      steps.forEach((step, index) => {
        const metadata = getToolMetadata(step.tool);
        if (metadata) {
          for (const capability of metadata.requiredCapabilities) {
            capabilitySet.add(capability);
          }
        } else {
          missingMetadata.push(step.tool);
        }
        lines.push(
          `${index + 1}. ${step.tool}${metadata ? ` (${metadata.estimatedDuration ?? 'unknown'})` : ''}`
        );
        if (step.description) {
          lines.push(`   • ${step.description}`);
        }
      });

      const sections: Record<string, string> = {
        Summary: `${steps.length} steps • ${capabilitySet.size} capability groups required`,
        Steps: lines.join('\n'),
        Capabilities: capabilitySet.size
          ? Array.from(capabilitySet.values()).sort().join(', ')
          : '<none>',
        'Metadata coverage': missingMetadata.length
          ? `Missing metadata for: ${missingMetadata.join(', ')}`
          : 'All steps have metadata',
      };

      if (captureReport) {
        safeCaptureReport(deps.reportingHub, {
          tool: 'playbook-preview',
          summary: `${name}: ${steps.length} steps planned`,
          sections,
          stage: 'planning',
          tags: ['playbook', 'planning'],
          importance: 'medium',
          devOpsCategory: 'endpoint',
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent(`Playbook Preview: ${name}`, sections),
          },
        ],
        structuredContent: {
          name,
          steps,
          requiredCapabilities: Array.from(capabilitySet.values()),
          missingMetadata,
        },
      };
    }
  );
  },
};
