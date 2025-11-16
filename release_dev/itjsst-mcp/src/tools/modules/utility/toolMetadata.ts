/**
 * tool-metadata Tool Module
 * Category: utility
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ToolMetadataModule: ToolModule = {
  name: 'tool-metadata',
  description: 'tool-metadata tool',
  category: 'utility',
  tools: [
    {
      name: 'tool-metadata',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'utility',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'tool-metadata',
    {
      description:
        'Returns catalog metadata for registered MCP tools including capabilities and runtime expectations.',
      inputSchema: {
        toolId: z.string().optional(),
      },
    },
    async ({ toolId }) => {
      const metadata = toolId ? getToolMetadata(toolId) : undefined;
      const list = metadata ? [metadata] : listToolMetadata();

      if (toolId && !metadata) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No metadata found for tool '${toolId}'.`,
            },
          ],
          structuredContent: {
            toolId,
            metadata: null,
          },
        };
      }

      const sections: Record<string, string> = {};
      for (const entry of list) {
        sections[entry.id] = [
          entry.description,
          `Capabilities: ${entry.requiredCapabilities.length ? entry.requiredCapabilities.join(', ') : 'none'}`,
          entry.estimatedDuration ? `Estimated duration: ${entry.estimatedDuration}` : undefined,
          entry.recommendedPrivileges ? `Privileges: ${entry.recommendedPrivileges}` : undefined,
          entry.supportsStreaming ? 'Supports streaming responses' : undefined,
        ]
          .filter(Boolean)
          .join('\n');
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Tool Metadata', sections),
          },
        ],
        structuredContent: {
          toolId: toolId ?? null,
          metadata: list,
        },
      };
    }
  );
  },
};
