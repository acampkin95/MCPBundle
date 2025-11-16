/**
 * wireless-diagnostics Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WirelessDiagnosticsModule: ToolModule = {
  name: 'wireless-diagnostics',
  description: 'wireless-diagnostics tool',
  category: 'network',
  tools: [
    {
      name: 'wireless-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'wireless-diagnostics',
    {
      description:
        'Collects Wi-Fi status, nearby network scan results, performance samples, and recent wireless subsystem logs (macOS).',
      inputSchema: {
        interface: z.string().default('en0'),
        includeScan: z.boolean().default(true),
        includePreferredNetworks: z.boolean().default(false),
        includePerformance: z.boolean().default(true),
        includeEnvironmentReport: z.boolean().default(false),
        includeAirportPreferences: z.boolean().default(false),
        includeLogs: z.boolean().default(false),
        logMinutes: z.number().int().min(1).max(1440).default(10),
        pingHost: z.string().optional(),
        pingCount: z.number().int().min(1).max(20).default(5),
        pingIntervalSeconds: z.number().min(0.1).max(5).default(0.2),
      },
    },
    async ({
      interface: iface,
      includeScan,
      includePreferredNetworks,
      includePerformance,
      includeEnvironmentReport,
      includeAirportPreferences,
      includeLogs,
      logMinutes,
      pingHost,
      pingCount,
      pingIntervalSeconds,
    }) => {
      const capability = 'macos-wireless' as const;
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        const response = await deps.remoteAgent.dispatch({
          tool: 'wireless-diagnostics',
          capability,
          payload: { interface: iface, includeScan, includePerformance },
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Wireless Diagnostics', {
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
        const results: Record<string, ReturnType<typeof formatCommandResult>> = {};
        const sections: Record<string, string> = {};

        const status = await deps.wireless.currentStatus({ interfaceName: iface });
        results.status = formatCommandResult(status);
        sections.Status = results.status.stdout || results.status.stderr || '<no output>';

        if (includeScan) {
          const scan = await deps.wireless.scanNetworks({ interfaceName: iface });
          results.scan = formatCommandResult(scan);
          sections['Nearby Networks'] = results.scan.stdout || results.scan.stderr || '<no output>';
        }

        if (includePreferredNetworks) {
          const preferred = await deps.wireless.listPreferredNetworks(iface);
          results.preferredNetworks = formatCommandResult(preferred);
          sections['Preferred Networks'] =
            results.preferredNetworks.stdout || results.preferredNetworks.stderr || '<no output>';
        }

        if (includePerformance) {
          const performance = await deps.wireless.performanceSummary();
          results.performance = formatCommandResult(performance);
          sections['Network Quality'] =
            results.performance.stdout || results.performance.stderr || '<no output>';
        }

        if (includeEnvironmentReport) {
          const environment = await deps.wireless.environmentReport();
          results.environment = formatCommandResult(environment);
          sections['Environment Report'] = results.environment.stdout || '<environment data>';
        }

        if (includeAirportPreferences) {
          const prefs = await deps.wireless.airportPreferences();
          results.airportPreferences = formatCommandResult(prefs);
          sections['Airport Preferences'] =
            results.airportPreferences.stdout || results.airportPreferences.stderr || '<no output>';
        }

        if (includeLogs) {
          const logs = await deps.wireless.wifiLogs({ minutes: logMinutes });
          results.logs = formatCommandResult(logs);
          sections['Recent Wi-Fi Logs'] =
            results.logs.stdout || results.logs.stderr || '<no output>';
        }

        if (pingHost) {
          const latency = await deps.wireless.pingHost({
            host: pingHost,
            count: pingCount,
            intervalSeconds: pingIntervalSeconds,
          });
          results.ping = formatCommandResult(latency);
          sections[`Ping ${pingHost}`] =
            results.ping.stdout || results.ping.stderr || '<no output>';
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Wireless Diagnostics', sections),
            },
          ],
          structuredContent: results,
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
