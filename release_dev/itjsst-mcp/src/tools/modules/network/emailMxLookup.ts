/**
 * email-mx-lookup Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const EmailMxLookupModule: ToolModule = {
  name: 'email-mx-lookup',
  description: 'email-mx-lookup tool',
  category: 'network',
  tools: [
    {
      name: 'email-mx-lookup',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'email-mx-lookup',
    {
      description: 'Retrieves MX records for a domain using dig, sorted by priority.',
      inputSchema: {
        domain: z.string().min(1, 'Domain is required'),
      },
    },
    async ({ domain }) => {
      try {
        const mxResult = await deps.email.lookupMx(domain);
        const recordsText =
          mxResult.records.length === 0
            ? 'No MX records found.'
            : mxResult.records.map((record) => `${record.priority}\t${record.exchange}`).join('\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('MX Records', {
                Domain: domain,
                Command: mxResult.command,
                Records: recordsText,
              }),
            },
          ],
          structuredContent: {
            domain,
            command: mxResult.command,
            records: mxResult.records,
            rawOutput: mxResult.result.stdout.trim(),
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
