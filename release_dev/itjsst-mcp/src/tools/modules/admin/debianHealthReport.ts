/**
 * debian-health-report Tool Module
 * Category: admin
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const DebianHealthReportModule: ToolModule = {
  name: 'debian-health-report',
  description: 'debian-health-report tool',
  category: 'admin',
  tools: [
    {
      name: 'debian-health-report',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'admin',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'debian-health-report',
    {
      description:
        'Collects a remote Debian system health report via SSH (kernel, uptime, disk usage, apt upgrades, failed services).',
      inputSchema: {
        host: z.string().min(1),
        username: z.string().default('root'),
        port: z.number().int().min(1).max(65535).default(22),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        timeoutSeconds: z.number().int().min(1).max(600).optional(),
      },
    },
    async ({ host, username, port, identityFile, knownHostsFile, timeoutSeconds }) => {
      try {
        const report = await deps.linux.collectDebianHealth({
          host,
          username,
          port,
          identityFile,
          knownHostsFile,
          timeoutSeconds,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: formatRemoteChecks(`Debian Health (${username}@${host})`, report.checks),
            },
          ],
          structuredContent: {
            target: report.target,
            checks: report.checks,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
