/**
 * email-connectivity-test Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const EmailConnectivityTestModule: ToolModule = {
  name: 'email-connectivity-test',
  description: 'email-connectivity-test tool',
  category: 'network',
  tools: [
    {
      name: 'email-connectivity-test',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'email-connectivity-test',
    {
      description:
        'Attempts TCP connections against SMTP/IMAP endpoints to verify reachability. Uses nc with configurable timeouts.',
      inputSchema: {
        checks: z
          .array(
            z.object({
              host: z.string().min(1),
              protocol: z
                .enum(['smtp', 'submission', 'smtps', 'imap', 'imaps', 'pop3', 'pop3s'])
                .default('smtp'),
              port: z.number().int().min(1).max(65535).optional(),
              timeoutSeconds: z.number().int().min(1).max(30).default(5),
            })
          )
          .min(1)
          .describe('Targets to probe for connectivity. Port defaults based on protocol.'),
      },
    },
    async ({ checks }) => {
      const defaultPorts: Record<string, number> = {
        smtp: 25,
        submission: 587,
        smtps: 465,
        imap: 143,
        imaps: 993,
        pop3: 110,
        pop3s: 995,
      };

      const resolvedChecks = checks.map((check) => ({
        ...check,
        port: check.port ?? defaultPorts[check.protocol],
      }));

      const results = [];
      for (const target of resolvedChecks) {
        const connectivity = await deps.email.testConnectivity({
          host: target.host,
          port: target.port,
          timeoutSeconds: target.timeoutSeconds,
        });

        results.push({
          host: target.host,
          protocol: target.protocol,
          port: target.port,
          timeoutSeconds: target.timeoutSeconds,
          success: connectivity.success,
          command: connectivity.command,
          stdout: connectivity.result.stdout.trim(),
          stderr: connectivity.result.stderr.trim(),
          exitCode: connectivity.result.code,
        });
      }

      const text = results
        .map((result) => {
          const status = result.success ? '✅ Success' : '❌ Failure';
          const message = result.success
            ? result.stdout || 'Connection established.'
            : result.stderr || result.stdout || 'No diagnostic output.';
          return [
            `Target: ${result.protocol.toUpperCase()} ${result.host}:${result.port}`,
            `Timeout: ${result.timeoutSeconds}s`,
            `Result: ${status}`,
            `Command: ${result.command}`,
            `Output: ${message}`,
          ].join('\n');
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `# Email Connectivity Test\n\n${text}`,
          },
        ],
        structuredContent: {
          checks: results,
        },
      };
    }
  );
  },
};
