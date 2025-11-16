/**
 * windows-diagnostics Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WindowsDiagnosticsModule: ToolModule = {
  name: 'windows-diagnostics',
  description: 'windows-diagnostics tool',
  category: 'platform',
  tools: [
    {
      name: 'windows-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'windows-diagnostics',
    {
      description:
        'Performs deep Windows diagnostics and repair operations locally or via WinRM (system, performance, security, network, storage, Active Directory, IIS, Hyper-V, updates, services).',
      inputSchema: {
        mode: z.enum(['local', 'remote']).default('local'),
        operation: z.enum(['diagnostics', 'repair']).default('diagnostics'),
        suite: z.enum(WINDOWS_DIAGNOSTIC_SUITES).optional(),
        repairAction: z.enum(WINDOWS_REPAIR_ACTIONS).optional(),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(['Default', 'Negotiate', 'Kerberos', 'Basic', 'Credssp']).optional(),
        ignoreCertErrors: z.boolean().optional(),
      },
    },
    async ({
      mode,
      operation,
      suite,
      repairAction,
      dryRun,
      host,
      username,
      password,
      passwordEnvVar,
      useSsl,
      port,
      authentication,
      ignoreCertErrors,
    }) => {
      const capability = mode === 'local' ? 'local-shell' : 'winrm';
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        const response = await deps.remoteAgent.dispatch({
          tool: 'windows-diagnostics',
          capability,
          payload: {
            mode,
            operation,
            suite,
            repairAction,
            dryRun,
            host,
            username,
          },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Windows Diagnostics', {
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
        const connectionOptions =
          mode === 'remote'
            ? {
                host:
                  host ??
                  (() => {
                    throw new Error("Remote diagnostics require 'host'.");
                  })(),
                username,
                password,
                passwordEnvVar,
                useSsl,
                port,
                authentication,
                ignoreCertErrors,
              }
            : undefined;

        let results;
        if (operation === 'diagnostics') {
          if (!suite) {
            throw new Error("Diagnostics operation requires 'suite'.");
          }
          results =
            mode === 'local'
              ? await deps.windowsDiagnostics.runLocalDiagnostics(suite)
              : await deps.windowsDiagnostics.runRemoteDiagnostics(
                  suite,
                  connectionOptions as NonNullable<typeof connectionOptions>
                );
        } else {
          if (!repairAction) {
            throw new Error("Repair operation requires 'repairAction'.");
          }
          results =
            mode === 'local'
              ? await deps.windowsDiagnostics.runLocalRepair(repairAction, dryRun)
              : await deps.windowsDiagnostics.runRemoteRepair(
                  repairAction,
                  connectionOptions as NonNullable<typeof connectionOptions>,
                  dryRun
                );
        }

        const sections: Record<string, string> = {};
        for (const item of results) {
          const output = item.json
            ? JSON.stringify(item.json, null, 2)
            : item.stdout.trim() || item.stderr.trim() || '<no output>';
          sections[item.label] = output;
        }

        safeCaptureReport(deps.reportingHub, {
          tool: 'windows-diagnostics',
          summary: `${mode === 'local' ? 'Local' : `Remote ${host ?? 'unknown'}`} Windows ${operation} (${operation === 'diagnostics' ? suite : repairAction}) ${operation === 'repair' && dryRun ? '(dry-run)' : 'completed'}`,
          sections,
          tags: [
            'windows',
            operation,
            mode === 'local' ? 'local' : 'remote',
            ...(dryRun && operation === 'repair' ? ['dry-run'] : []),
          ],
          importance: operation === 'repair' && !dryRun ? 'high' : 'medium',
          devOpsCategory: 'endpoint',
          executionContext:
            mode === 'remote' && host ? `host=${host}, user=${username ?? 'unknown'}` : 'local',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Windows Diagnostics', sections),
            },
          ],
          structuredContent: {
            mode,
            operation,
            dryRun: operation === 'repair' ? dryRun : undefined,
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
