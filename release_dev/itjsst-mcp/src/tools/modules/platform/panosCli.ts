/**
 * panos-cli Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const PanosCliModule: ToolModule = {
  name: 'panos-cli',
  description: 'panos-cli tool',
  category: 'platform',
  tools: [
    {
      name: 'panos-cli',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'panos-cli',
    {
      description:
        'Executes operational CLI commands against Palo Alto Networks PAN-OS devices over SSH, with optional preset commands.',
      inputSchema: {
        listPresets: z.boolean().default(false),
        host: z.string().optional(),
        username: z.string().optional(),
        command: z.string().optional(),
        preset: z.enum(PANOS_PRESETS).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
        extraOptions: z.record(z.string()).optional(),
      },
    },
    async ({
      listPresets,
      host,
      username,
      command,
      preset,
      port,
      identityFile,
      knownHostsFile,
      allocateTty,
      timeoutSeconds,
      extraOptions,
    }) => {
      if (listPresets) {
        const presets = deps.panos.listPresets();
        const sections = {
          Presets: presets.map((item) => `${item.preset}: ${item.description}`).join('\n'),
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('PAN-OS Presets', sections),
            },
          ],
          structuredContent: {
            presets,
          },
        };
      }

      if (!host || !username) {
        throw new Error("PAN-OS CLI execution requires 'host' and 'username'.");
      }

      const capability = 'ssh-linux' as const;
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        const response = await deps.remoteAgent.dispatch({
          tool: 'panos-cli',
          capability,
          payload: {
            host,
            username,
            command,
            preset,
          },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('PAN-OS CLI', {
                Result:
                  response.status === 'accepted'
                    ? 'Delegated to remote agent.'
                    : `Remote agent unavailable: ${response.reason ?? 'unknown'}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const result = await deps.panos.execute({
          host,
          username,
          command: command ?? undefined,
          preset: preset as PanOsPreset | undefined,
          port,
          identityFile,
          knownHostsFile,
          allocateTty,
          timeoutSeconds,
          extraOptions: extraOptions ?? undefined,
        });

        const sections = {
          Command: result.command,
          Output: result.stdout.trim() || result.stderr.trim() || '<no output>',
        };

        safeCaptureReport(deps.reportingHub, {
          tool: 'panos-cli',
          summary: `PAN-OS command executed on ${host}`,
          sections,
          tags: ['firewall', 'pan-os', preset ?? 'custom'],
          devOpsCategory: 'network-security',
          executionContext: `host=${host}, preset=${preset ?? 'custom'}`,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('PAN-OS CLI', sections),
            },
          ],
          structuredContent: {
            command: result.command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.code,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
