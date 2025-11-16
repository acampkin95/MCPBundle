/**
 * vpn-diagnostics Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const VpnDiagnosticsModule: ToolModule = {
  name: 'vpn-diagnostics',
  description: 'vpn-diagnostics tool',
  category: 'network',
  tools: [
    {
      name: 'vpn-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'vpn-diagnostics',
    {
      description:
        'Collects macOS VPN diagnostics including scutil network connections, interfaces, routes, and common VPN process listings.',
      inputSchema: {
        includeWifi: z.boolean().default(true),
      },
    },
    async ({ includeWifi }) => {
      try {
        const diagnostics = await deps.vpn.collectDiagnostics(includeWifi);

        const sections: Record<string, string> = {
          'scutil --nc list':
            diagnostics.scutilList.stdout.trim() || diagnostics.scutilList.stderr.trim(),
          Interfaces: diagnostics.netInterfaces.stdout.trim(),
          Routes: diagnostics.routes.stdout.trim(),
          Processes:
            diagnostics.runningProcesses.stdout.trim() ||
            diagnostics.runningProcesses.stderr.trim() ||
            'No VPN-related processes detected.',
        };

        if (includeWifi && diagnostics.wifiInfo) {
          sections.WiFi = diagnostics.wifiInfo.stdout.trim() || diagnostics.wifiInfo.stderr.trim();
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('VPN Diagnostics', sections),
            },
          ],
          structuredContent: {
            scutil: formatCommandResult(diagnostics.scutilList),
            interfaces: formatCommandResult(diagnostics.netInterfaces),
            routes: formatCommandResult(diagnostics.routes),
            processes: formatCommandResult(diagnostics.runningProcesses),
            wifi: diagnostics.wifiInfo ? formatCommandResult(diagnostics.wifiInfo) : undefined,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
