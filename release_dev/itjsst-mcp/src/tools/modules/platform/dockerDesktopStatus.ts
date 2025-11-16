/**
 * docker-desktop-status Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const DockerDesktopStatusModule: ToolModule = {
  name: 'docker-desktop-status',
  description: 'docker-desktop-status tool',
  category: 'platform',
  tools: [
    {
      name: 'docker-desktop-status',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'docker-desktop-status',
    {
      description:
        'Summarizes Docker Desktop CLI availability, engine status, and running containers on macOS.',
      inputSchema: {},
    },
    async () => {
      try {
        const status = await deps.dockerDesktop.getStatus();
        const sections: Record<string, string> = {
          Availability: status.cliAvailable
            ? 'Docker CLI detected'
            : (status.error ?? 'CLI not found'),
          Containers:
            status.containers && status.containers.length
              ? status.containers
                  .map((container) => `- ${container.name}: ${container.status}`)
                  .join('\n')
              : '<no running containers>',
        };

        if (status.info) {
          const infoRecord = status.info as Record<string, unknown>;
          const server =
            infoRecord.Server && typeof infoRecord.Server === 'object'
              ? (infoRecord.Server as Record<string, unknown>)
              : undefined;
          const client =
            infoRecord.Client && typeof infoRecord.Client === 'object'
              ? (infoRecord.Client as Record<string, unknown>)
              : undefined;
          const serverVersion = typeof server?.Version === 'string' ? server.Version : undefined;
          const clientVersion = typeof client?.Version === 'string' ? client.Version : undefined;

          const engineLines = [
            serverVersion ? `Server: ${serverVersion}` : undefined,
            clientVersion ? `Client: ${clientVersion}` : undefined,
          ].filter((line): line is string => Boolean(line));

          if (engineLines.length) {
            sections['Engine'] = engineLines.join('\n');
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: 'docker-desktop-status',
          summary: status.cliAvailable
            ? `Docker CLI available • containers=${status.containers?.length ?? 0}`
            : (status.error ?? 'Docker CLI unavailable'),
          sections,
          stage: 'analysis',
          tags: ['docker', 'macos'],
          importance: 'medium',
          devOpsCategory: 'developer-experience',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Docker Desktop Status', sections),
            },
          ],
          structuredContent: {
            status,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
