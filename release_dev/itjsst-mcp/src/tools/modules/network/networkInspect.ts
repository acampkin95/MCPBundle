/**
 * network-inspect Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const NetworkInspectModule: ToolModule = {
  name: 'network-inspect',
  description: 'network-inspect tool',
  category: 'network',
  tools: [
    {
      name: 'network-inspect',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'network-inspect',
    {
      description:
        'Captures a point-in-time view of network activity, firewall status, and Wi-Fi environment.',
      inputSchema: {
        includeFirewall: z.boolean().default(true),
        includeWifiScan: z.boolean().default(false),
        bandwidthSampleSeconds: z.number().int().min(1).max(60).default(10),
      },
    },
    async ({ includeFirewall, includeWifiScan, bandwidthSampleSeconds }) => {
      try {
        const tasks: Record<string, ReturnType<typeof formatCommandResult>> = {};

        const connections = await deps.network.listActiveConnections();
        tasks.connections = formatCommandResult(connections);

        const listeners = await deps.network.listListeningSockets();
        tasks.listeners = formatCommandResult(listeners);

        if (includeFirewall) {
          const firewall = await deps.network.analyzeFirewall();
          tasks.firewall = formatCommandResult(firewall);
        }

        if (includeWifiScan) {
          const wifi = await deps.network.scanWirelessNetworks();
          tasks.wifiScan = formatCommandResult(wifi);
        }

        const bandwidth = await deps.network.sampleBandwidth(bandwidthSampleSeconds);
        tasks.bandwidth = formatCommandResult(bandwidth);

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Network Inspection', {
                Connections: tasks.connections.stdout,
                Listeners: tasks.listeners.stdout,
                ...(includeFirewall && tasks.firewall ? { Firewall: tasks.firewall.stdout } : {}),
                ...(includeWifiScan && tasks.wifiScan
                  ? { 'Wi-Fi Scan': tasks.wifiScan.stdout }
                  : {}),
                Bandwidth: tasks.bandwidth.stdout,
              }),
            },
          ],
          structuredContent: tasks,
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
