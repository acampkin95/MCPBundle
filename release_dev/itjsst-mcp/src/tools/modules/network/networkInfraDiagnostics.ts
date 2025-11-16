/**
 * network-infra-diagnostics Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const NetworkInfraDiagnosticsModule: ToolModule = {
  name: 'network-infra-diagnostics',
  description: 'network-infra-diagnostics tool',
  category: 'network',
  tools: [
    {
      name: 'network-infra-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'network-infra-diagnostics',
    {
      description:
        'Generates network troubleshooting plans (trace path, firewall validation, dual-stack checks) using provided symptoms and topology data.',
      inputSchema: {
        source: z.string().default('10.0.0.1'),
        destination: z.string().default('10.0.0.2'),
        includeFirewallAnalysis: z.boolean().default(true),
        includeNatLookup: z.boolean().default(false),
        includeCaptureCommands: z.boolean().default(false),
        firewallDevice: z.string().default('PaloAlto-Cluster'),
        firewallPolicy: z.array(z.string()).default([]),
        performDualStackCheck: z.boolean().default(true),
        topologyNodes: z
          .array(
            z.object({
              id: z.string(),
              type: z.enum([
                'firewall',
                'switch',
                'router',
                'server',
                'vpn',
                'dns',
                'dhcp',
                'other',
              ]),
              name: z.string(),
              metadata: z.record(z.unknown()).optional(),
            })
          )
          .default([]),
        topologyLinks: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              linkType: z.enum(['ethernet', 'lag', 'vlan', 'vpn', 'wireless', 'virtual']),
              description: z.string().optional(),
            })
          )
          .default([]),
      },
    },
    async ({
      source,
      destination,
      includeFirewallAnalysis,
      includeNatLookup,
      includeCaptureCommands,
      firewallDevice,
      firewallPolicy,
      performDualStackCheck,
      topologyNodes,
      topologyLinks,
    }) => {
      const path = deps.networkInfra.tracePath(source, destination, {
        includeFirewallAnalysis,
        includeNatLookup,
        includeCaptureCommands,
      });

      const firewall = firewallPolicy.length
        ? deps.networkInfra.validateFirewallRules(firewallDevice, 'production', firewallPolicy)
        : undefined;

      const dualStack = performDualStackCheck
        ? deps.networkInfra.diagnoseDualStack(`${source}->${destination}`)
        : undefined;

      const topology =
        topologyNodes.length || topologyLinks.length
          ? deps.networkInfra.generateTopology(topologyNodes, topologyLinks)
          : undefined;

      const sections: Record<string, string> = {
        'Trace summary': `${source} -> ${destination} (${path.steps.length} checkpoints)`,
        'Suggested commands': path.steps
          .slice(0, 3)
          .map((step) => `* ${step.layer}: ${step.commands.join(', ')}`)
          .join('\n'),
      };

      if (firewall) {
        sections['Firewall findings'] = firewall.summary;
      }
      if (dualStack) {
        sections['Dual-stack status'] = `${dualStack.ipv4Status} / ${dualStack.ipv6Status}`;
      }

      safeCaptureReport(deps.reportingHub, {
        tool: 'network-infra-diagnostics',
        summary: `Analysed path ${source} -> ${destination} (${path.steps.length} checkpoints).`,
        sections,
        tags: ['network', 'firewall', includeFirewallAnalysis ? 'policy' : 'topology'],
        external_refs: dualStack ? dualStack.checkpoints : undefined,
        importance: includeFirewallAnalysis ? 'high' : 'medium',
        devOpsCategory: 'network',
        executionContext: `source=${source}, destination=${destination}`,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Network Infrastructure Diagnostics', sections),
          },
        ],
        structuredContent: {
          path,
          firewall,
          dualStack,
          topology,
        },
      };
    }
  );
  },
};
