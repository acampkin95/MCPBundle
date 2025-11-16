/**
 * database-diagnostics Tool Module
 * Category: database
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const DatabaseDiagnosticsModule: ToolModule = {
  name: 'database-diagnostics',
  description: 'database-diagnostics tool',
  category: 'database',
  tools: [
    {
      name: 'database-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'database',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'database-diagnostics',
    {
      description:
        'Runs deep diagnostics against database-hosting Linux servers (PostgreSQL, Redis, Nginx, Keycloak, firewall, system).',
      inputSchema: {
        mode: z.enum(['local', 'remote']).default('remote'),
        suites: z.array(z.enum(DATABASE_SUITES)).default(DEFAULT_DATABASE_SUITES),
        host: z.string().optional(),
        username: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
        extraOptions: z.record(z.string()).optional(),
      },
    },
    async ({
      mode,
      suites,
      host,
      username,
      port,
      identityFile,
      knownHostsFile,
      allocateTty,
      timeoutSeconds,
      extraOptions,
    }) => {
      const capability = mode === 'local' ? 'local-sudo' : 'ssh-linux';
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        const response = await deps.remoteAgent.dispatch({
          tool: 'database-diagnostics',
          capability,
          payload: {
            mode,
            suites,
            host,
            username,
          },
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Database Diagnostics', {
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
        const results =
          mode === 'local'
            ? await deps.databaseDiagnostics.runLocal(suites as DatabaseDiagnosticSuite[])
            : await deps.databaseDiagnostics.runRemote({
                host:
                  host ??
                  (() => {
                    throw new Error("Remote diagnostics require 'host'.");
                  })(),
                username:
                  username ??
                  (() => {
                    throw new Error("Remote diagnostics require 'username'.");
                  })(),
                suites: suites as DatabaseDiagnosticSuite[],
                port,
                identityFile,
                knownHostsFile,
                allocateTty,
                timeoutSeconds,
                extraOptions: extraOptions ?? undefined,
              });

        const sections: Record<string, string> = {};
        for (const item of results) {
          sections[item.label] = item.stdout.trim() || item.stderr.trim() || '<no output>';
        }

        safeCaptureReport(deps.reportingHub, {
          tool: 'database-diagnostics',
          summary: `${mode === 'local' ? 'Local' : `Remote ${host ?? 'unknown'}`} database diagnostics for suites ${Array.from(new Set(suites)).join(', ')}`,
          sections,
          tags: ['database', 'postgres', mode === 'local' ? 'local' : 'remote'],
          importance: 'high',
          devOpsCategory: 'infrastructure',
          executionContext: mode === 'remote' ? `host=${host}, user=${username}` : 'local',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Database Diagnostics', sections),
            },
          ],
          structuredContent: {
            mode,
            suites,
            results,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
