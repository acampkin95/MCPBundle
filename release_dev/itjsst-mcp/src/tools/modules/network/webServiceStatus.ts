/**
 * web-service-status Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WebServiceStatusModule: ToolModule = {
  name: 'web-service-status',
  description: 'web-service-status tool',
  category: 'network',
  tools: [
    {
      name: 'web-service-status',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'web-service-status',
    {
      description:
        'Inspects common web server processes (nginx, Apache, Node) and optionally fetches response headers or runs a Lighthouse audit.',
      inputSchema: {
        url: z.string().url().optional().describe('Optional URL to evaluate.'),
        includeHeaders: z.boolean().default(true),
        includeLighthouse: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(60).default(10),
        lighthouseCategories: z
          .array(z.enum(['performance', 'accessibility', 'best-practices', 'seo']))
          .default(['performance']),
      },
    },
    async ({ url, includeHeaders, includeLighthouse, timeoutSeconds, lighthouseCategories }) => {
      try {
        const processes = await deps.webDiagnostics.checkProcesses();

        const sections: Record<string, string> = {
          'nginx processes': processes.nginx || '<none>',
          'Apache/httpd processes': processes.apache || '<none>',
          'Node-based servers': processes.node || '<none>',
        };

        let headersResult: CommandResult | undefined;
        if (url && includeHeaders) {
          headersResult = await deps.webDiagnostics.fetchHeaders(url, timeoutSeconds);
          sections.Headers =
            headersResult.stdout.trim() || headersResult.stderr.trim() || 'No headers returned.';
        }

        let lighthouse;
        if (url && includeLighthouse) {
          lighthouse = await deps.webDiagnostics.runLighthouse(url, lighthouseCategories);
          sections.Lighthouse = lighthouse.error
            ? `Error: ${lighthouse.error}`
            : lighthouse.scores
              ? Object.entries(lighthouse.scores)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\n')
              : 'No scores available.';
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Web Service Status', sections),
            },
          ],
          structuredContent: {
            processes,
            headers: headersResult
              ? {
                  command: headersResult.command,
                  stdout: headersResult.stdout,
                  stderr: headersResult.stderr,
                }
              : undefined,
            lighthouse,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
