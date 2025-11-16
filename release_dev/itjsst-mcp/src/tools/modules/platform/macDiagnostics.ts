/**
 * mac-diagnostics Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const MacDiagnosticsModule: ToolModule = {
  name: 'mac-diagnostics',
  description: 'mac-diagnostics tool',
  category: 'platform',
  tools: [
    {
      name: 'mac-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'mac-diagnostics',
    {
      description:
        'Performs deep macOS diagnostics and repair operations locally or via SSH (hardware, performance, security, network, storage).',
      inputSchema: {
        mode: z.enum(['local', 'remote']).default('local'),
        operation: z.enum(['diagnostics', 'repair']).default('diagnostics'),
        suite: z.enum(MAC_DIAGNOSTIC_SUITES).optional(),
        repairAction: z.enum(MAC_REPAIR_ACTIONS).optional(),
        baselinePath: z.string().optional(),
        compareBaseline: z.boolean().default(false),
        updateBaseline: z.boolean().default(false),
        cacheTtlSeconds: z.number().int().min(5).max(3600).optional(),
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
      operation,
      suite,
      repairAction,
      baselinePath,
      compareBaseline,
      updateBaseline,
      cacheTtlSeconds,
      host,
      username,
      port,
      identityFile,
      knownHostsFile,
      allocateTty,
      timeoutSeconds,
      extraOptions,
    }) => {
      const capability =
        mode === 'local' ? (operation === 'diagnostics' ? 'local-sudo' : 'local-sudo') : 'ssh-mac';
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        const response = await deps.remoteAgent.dispatch({
          tool: 'mac-diagnostics',
          capability,
          payload: {
            mode,
            operation,
            suite,
            repairAction,
            baselinePath,
            compareBaseline,
            updateBaseline,
            host,
            username,
          },
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('macOS Diagnostics', {
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
        const sshOptions =
          mode === 'remote'
            ? {
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
                port,
                identityFile,
                knownHostsFile,
                allocateTty,
                timeoutSeconds,
                extraOptions: extraOptions ?? undefined,
              }
            : undefined;

        let results;
        let baselineDetails: DiagnosticsRunOutput | undefined;
        if (operation === 'diagnostics') {
          if (!suite) {
            throw new Error("Diagnostics operation requires 'suite'.");
          }
          if (mode === 'local') {
            baselineDetails = await deps.macDiagnostics.runLocalDiagnosticsWithBaseline({
              suite,
              baselinePath,
              compareBaseline,
              updateBaseline,
              cacheTtlSeconds,
            });
            results = baselineDetails.results;
          } else {
            results = await deps.macDiagnostics.runRemoteDiagnostics({
              ...(sshOptions as NonNullable<typeof sshOptions>),
              suite,
            });
          }
        } else {
          if (!repairAction) {
            throw new Error("Repair operation requires 'repairAction'.");
          }
          results =
            mode === 'local'
              ? await deps.macDiagnostics.runLocalRepair(repairAction)
              : await deps.macDiagnostics.runRemoteRepair({
                  ...(sshOptions as NonNullable<typeof sshOptions>),
                  action: repairAction,
                });
        }

        const sections: Record<string, string> = {};
        for (const item of results) {
          sections[item.label] = item.stdout.trim() || item.stderr.trim() || '<no output>';
        }

        if (baselineDetails?.comparisons && baselineDetails.comparisons.length) {
          const comparisonSummary = baselineDetails.comparisons
            .map(
              (comparison) =>
                `- ${comparison.label}: ${comparison.changed ? 'changed' : 'no change'} (${comparison.currentHash})`
            )
            .join('\n');
          sections['Baseline comparison'] = comparisonSummary;
        }

        if (baselineDetails?.baselinePath) {
          const statusLabel = baselineDetails.baselineUpdated
            ? 'Updated'
            : updateBaseline
              ? 'Not updated'
              : compareBaseline
                ? 'Read'
                : 'Available';
          sections['Baseline path'] = `${baselineDetails.baselinePath} (${statusLabel})`;
        }

        if (mode === 'local' && cacheTtlSeconds) {
          const cacheLabel = baselineDetails?.cacheHit ? 'Hit' : 'Miss';
          sections['Cache status'] = `${cacheLabel} (TTL ${cacheTtlSeconds}s)`;
        }

        const changeTotals = baselineDetails?.comparisons
          ? {
              changed: baselineDetails.comparisons.filter((comparison) => comparison.changed)
                .length,
              total: baselineDetails.comparisons.length,
            }
          : undefined;

        const reportTags = ['macos', operation, mode === 'local' ? 'local' : 'remote'];
        if (changeTotals) {
          reportTags.push('baseline');
        }

        const changeSuffix = changeTotals
          ? ` (baseline changes: ${changeTotals.changed}/${changeTotals.total})`
          : '';

        safeCaptureReport(deps.reportingHub, {
          tool: 'mac-diagnostics',
          summary: `${mode === 'local' ? 'Local' : `Remote ${host ?? 'unknown'}`} macOS ${operation} (${operation === 'diagnostics' ? suite : repairAction}) completed${changeSuffix}`,
          sections,
          tags: reportTags,
          importance: operation === 'repair' ? 'high' : 'medium',
          devOpsCategory: 'endpoint',
          executionContext:
            mode === 'remote' && host ? `host=${host}, user=${username ?? 'unknown'}` : 'local',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('macOS Diagnostics', sections),
            },
          ],
          structuredContent: {
            mode,
            operation,
            results,
            baseline: baselineDetails
              ? {
                  comparisons: baselineDetails.comparisons,
                  baselinePath: baselineDetails.baselinePath,
                  baselineUpdated: baselineDetails.baselineUpdated,
                  cacheHit: baselineDetails.cacheHit,
                  cacheTtlSeconds,
                }
              : undefined,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
