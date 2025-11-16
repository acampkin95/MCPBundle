/**
 * firewall-diagnostics Tool Module
 * Category: security
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const FirewallDiagnosticsModule: ToolModule = {
  name: 'firewall-diagnostics',
  description: 'firewall-diagnostics tool',
  category: 'security',
  tools: [
    {
      name: 'firewall-diagnostics',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'security',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'firewall-diagnostics',
    {
      description:
        'Runs vendor-neutral firewall checks using pfctl and the macOS application firewall settings.',
      inputSchema: {},
    },
    async () => {
      try {
        const diagnostics = await deps.networkDiagnostics.firewallDiagnostics();

        const sections: Record<string, string> = {};
        if (diagnostics.pfctl) {
          sections.pfctl =
            diagnostics.pfctl.stdout.trim() ||
            diagnostics.pfctl.stderr.trim() ||
            'pfctl returned no output.';
        }
        if (diagnostics.socketFilter) {
          sections.socketfilterfw =
            diagnostics.socketFilter.stdout.trim() || diagnostics.socketFilter.stderr.trim();
        }
        if (diagnostics.applicationFirewall) {
          sections['Application Firewall'] =
            diagnostics.applicationFirewall.stdout.trim() ||
            diagnostics.applicationFirewall.stderr.trim();
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Firewall Diagnostics', sections),
            },
          ],
          structuredContent: {
            diagnostics,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
