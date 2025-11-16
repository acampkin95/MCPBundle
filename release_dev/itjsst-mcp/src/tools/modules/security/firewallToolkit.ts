/**
 * firewall-toolkit Tool Module
 * Category: security
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const FirewallToolkitModule: ToolModule = {
  name: 'firewall-toolkit',
  description: 'firewall-toolkit tool',
  category: 'security',
  tools: [
    {
      name: 'firewall-toolkit',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'security',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'firewall-toolkit',
    {
      description:
        'Produces vendor-aware firewall troubleshooting playbooks (Palo Alto, Cisco ASA, Fortinet, Check Point, pfSense).',
      inputSchema: {
        vendor: z.enum(FIREWALL_VENDORS),
        scenario: z.enum(FIREWALL_SCENARIOS),
        context: z.string().optional(),
      },
    },
    async ({ vendor, scenario, context }) => {
      try {
        const playbook = deps.firewallToolkit.generatePlaybook({ vendor, scenario, context });

        const formatSteps = (steps: typeof playbook.preChecks) =>
          steps
            .map((step) =>
              [
                `${step.title} — ${step.description}`,
                step.commands.map((cmd) => `- ${cmd}`).join('\n'),
              ]
                .filter(Boolean)
                .join('\n')
            )
            .join('\n\n');

        const sections: Record<string, string> = {
          Summary: playbook.summary,
        };

        if (playbook.preChecks.length) {
          sections['Pre-checks'] = formatSteps(playbook.preChecks);
        }

        if (playbook.diagnosticCommands.length) {
          sections['Diagnostics'] = formatSteps(playbook.diagnosticCommands);
        }

        if (playbook.remediationHints.length) {
          sections['Remediation hints'] = playbook.remediationHints
            .map((hint) => `- ${hint}`)
            .join('\n');
        }

        safeCaptureReport(deps.reportingHub, {
          tool: 'firewall-toolkit',
          summary: `${vendor} ${scenario} playbook generated`,
          sections,
          tags: ['firewall', vendor, scenario],
          devOpsCategory: 'network-security',
          importance: 'medium',
          executionContext: reportContextLabel(vendor, scenario, context),
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Firewall Troubleshooting', sections),
            },
          ],
          structuredContent: {
            playbook,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
