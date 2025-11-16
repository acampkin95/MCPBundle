/**
 * network-port-scan Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const NetworkPortScanModule: ToolModule = {
  name: 'network-port-scan',
  description: 'network-port-scan tool',
  category: 'network',
  tools: [
    {
      name: 'network-port-scan',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'network-port-scan',
    {
      description:
        'Performs TCP/UDP port scans using netcat. Optionally runs nmap when available for deeper inspection.',
      inputSchema: {
        host: z.string().min(1),
        ports: z
          .string()
          .default('80,443')
          .describe("Comma-separated list or ranges (e.g. '22,80,443,8000-8005')."),
        protocol: z.enum(['tcp', 'udp', 'both']).default('tcp'),
        timeoutSeconds: z.number().int().min(1).max(30).default(3),
        useNmap: z.boolean().default(false),
      },
    },
    async ({ host, ports, protocol, timeoutSeconds, useNmap }) => {
      try {
        const portList = parsePortList(ports);
        if (portList.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No valid ports provided.',
              },
            ],
            structuredContent: {
              error: 'No valid ports provided',
            },
          };
        }

        const tcpResults =
          protocol === 'tcp' || protocol === 'both'
            ? await deps.networkDiagnostics.scanTcpPorts(host, portList, timeoutSeconds)
            : undefined;
        const udpResults =
          protocol === 'udp' || protocol === 'both'
            ? await deps.networkDiagnostics.scanUdpPorts(host, portList, timeoutSeconds)
            : undefined;

        const nmapTcp =
          useNmap && (protocol === 'tcp' || protocol === 'both')
            ? await deps.networkDiagnostics.runNmap(host, portList, 'tcp')
            : undefined;
        const nmapUdp =
          useNmap && (protocol === 'udp' || protocol === 'both')
            ? await deps.networkDiagnostics.runNmap(host, portList, 'udp')
            : undefined;

        const describeScan = (
          scanResults: Awaited<ReturnType<typeof deps.networkDiagnostics.scanTcpPorts>> | undefined
        ): string => {
          if (!scanResults) {
            return '<not run>';
          }
          return scanResults
            .map((entry) => {
              const status = entry.success ? 'open' : 'closed';
              const detail = entry.stderr.trim() || entry.stdout.trim();
              return `${entry.protocol.toUpperCase()} ${entry.port}: ${status}${detail ? `\n${detail}` : ''}`;
            })
            .join('\n\n');
        };

        const sections: Record<string, string> = {
          Host: host,
          Ports: portList.join(', '),
        };

        if (tcpResults) {
          sections['TCP scan'] = describeScan(tcpResults);
        }
        if (udpResults) {
          sections['UDP scan'] = describeScan(udpResults);
        }
        if (useNmap) {
          sections.nmap =
            [nmapTcp?.stdout, nmapUdp?.stdout].filter(Boolean).join('\n\n') ||
            'nmap not available or produced no output.';
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Network Port Scan', sections),
            },
          ],
          structuredContent: {
            host,
            ports: portList,
            tcp: tcpResults,
            udp: udpResults,
            nmapTcp,
            nmapUdp,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
