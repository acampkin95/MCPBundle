/**
 * web-performance-probe Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WebPerformanceProbeModule: ToolModule = {
  name: 'web-performance-probe',
  description: 'web-performance-probe tool',
  category: 'network',
  tools: [
    {
      name: 'web-performance-probe',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'web-performance-probe',
    {
      description:
        'Runs a curl performance probe against a URL, returning HTTP code and timing metrics.',
      inputSchema: {
        url: z.string().url(),
        method: z.string().default('GET'),
        headers: z
          .array(
            z.object({
              name: z.string().min(1),
              value: z.string().default(''),
            })
          )
          .default([]),
        body: z.string().optional(),
        timeoutSeconds: z.number().int().min(1).max(60).default(15),
      },
    },
    async ({ url, method, headers, body, timeoutSeconds }) => {
      try {
        const headerMap = Object.fromEntries(headers.map((header) => [header.name, header.value]));
        const metrics = await deps.webDiagnostics.testEndpoint(url, {
          method,
          headers: headerMap,
          body,
          timeoutSeconds,
        });

        const sections: Record<string, string> = {
          URL: url,
          Method: method,
          'HTTP code': metrics.httpCode?.toString() ?? 'Unknown',
          'Total time (s)': metrics.timeTotal?.toString() ?? 'n/a',
          'TTFB (s)': metrics.timeStartTransfer?.toString() ?? 'n/a',
          'Connect time (s)': metrics.timeConnect?.toString() ?? 'n/a',
          'Bytes downloaded': metrics.sizeDownload?.toString() ?? 'n/a',
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Web Performance Probe', sections),
            },
          ],
          structuredContent: {
            metrics,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
