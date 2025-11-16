/**
 * ssh-exec Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const SshExecModule: ToolModule = {
  name: 'ssh-exec',
  description: 'ssh-exec tool',
  category: 'network',
  tools: [
    {
      name: 'ssh-exec',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'ssh-exec',
    {
      description:
        'Runs a remote command over SSH with optional identity, port, and extra options. Useful for ad-hoc administration tasks.',
      inputSchema: {
        host: z.string().min(1),
        username: z.string().optional(),
        command: z.string().min(1),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(600).optional(),
      },
    },
    wrapWithPolicy(
      'ssh-exec',
      'executeCommand',
      async ({
        host,
        username,
        command,
        port,
        identityFile,
        knownHostsFile,
        allocateTty,
        timeoutSeconds,
      }) => {
        try {
          const result = await deps.ssh.execute(
            {
              host,
              username,
              command,
            },
            {
              port,
              identityFile,
              knownHostsFile,
              allocateTty,
              timeoutSeconds,
            }
          );

          return {
            content: [
              {
                type: 'text' as const,
                text: toTextContent('SSH Execution', {
                  Target: `${username ? `${username}@` : ''}${host}${port ? `:${port}` : ''}`,
                  Command: result.command,
                  Output: result.stdout.trim() || '<no stdout>',
                  Stderr: result.stderr.trim() || '<no stderr>',
                }),
              },
            ],
            structuredContent: {
              commandResult: formatCommandResult(result),
            },
          };
        } catch (error) {
          return handleError(error);
        }
      },
      ['ssh-linux', 'remote-exec'] // Required capabilities for SSH execution
    )
  );
  },
};
