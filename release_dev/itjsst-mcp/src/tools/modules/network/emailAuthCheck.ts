/**
 * email-auth-check Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const EmailAuthCheckModule: ToolModule = {
  name: 'email-auth-check',
  description: 'email-auth-check tool',
  category: 'network',
  tools: [
    {
      name: 'email-auth-check',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'email-auth-check',
    {
      description:
        'Evaluates SPF, DKIM, and DMARC TXT records for a domain. Provide DKIM selectors to test specific keys.',
      inputSchema: {
        domain: z.string().min(1, 'Domain is required'),
        dkimSelectors: z
          .array(z.string().min(1))
          .default(['default'])
          .describe('DKIM selectors to query (selector._domainkey.domain).'),
      },
    },
    async ({ domain, dkimSelectors }) => {
      try {
        const [spf, dmarc] = await Promise.all([
          deps.email.checkSpf(domain),
          deps.email.checkDmarc(domain),
        ]);

        const dkimChecks = [];
        for (const selector of dkimSelectors) {
          const record = await deps.email.checkDkim(domain, selector);
          dkimChecks.push({
            selector,
            command: record.command,
            values: record.values,
            rawOutput: record.result.stdout.trim(),
          });
        }

        const summaryLines = [
          `# Email Authentication (${domain})`,
          '\n## SPF',
          spf.values.length ? spf.values.join('\n') : 'No SPF record detected.',
          '\n## DMARC',
          dmarc.values.length ? dmarc.values.join('\n') : 'No DMARC record detected.',
          '\n## DKIM',
          dkimChecks.length
            ? dkimChecks
                .map((check) => {
                  const values = check.values.length
                    ? check.values.join('\n')
                    : 'No record detected.';
                  return `Selector: ${check.selector}\n${values}`;
                })
                .join('\n\n')
            : 'No selectors evaluated.',
        ].join('\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: summaryLines,
            },
          ],
          structuredContent: {
            domain,
            spf: {
              command: spf.command,
              values: spf.values,
              rawOutput: spf.result.stdout.trim(),
            },
            dmarc: {
              command: dmarc.command,
              values: dmarc.values,
              rawOutput: dmarc.result.stdout.trim(),
            },
            dkim: dkimChecks,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
