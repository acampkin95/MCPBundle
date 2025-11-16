/**
 * mac-permissions-audit Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const MacPermissionsAuditModule: ToolModule = {
  name: 'mac-permissions-audit',
  description: 'mac-permissions-audit tool',
  category: 'platform',
  tools: [
    {
      name: 'mac-permissions-audit',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'mac-permissions-audit',
    {
      description:
        'Runs a structured permissions audit for macOS endpoints, highlighting compliance issues and remediation guidance.',
      inputSchema: {
        captureReport: z.boolean().default(true),
      },
    },
    async ({ captureReport }) => {
      try {
        const audit = await deps.macPermissions.auditPermissions();
        const findingsText = audit.findings.length
          ? audit.findings
              .map(
                (finding, index) =>
                  `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.message}${finding.remediation ? `\n   Remediation: ${finding.remediation}` : ''}`
              )
              .join('\n')
          : 'No permission issues detected.';

        const sections: Record<string, string> = {
          'Risk score': audit.riskScore.toUpperCase(),
          'Admin group': audit.overview.adminGroup.members.join(', ') || '<none>',
          'Secure tokens':
            audit.overview.secureTokens.tokens.map((entry) => entry.user).join(', ') || '<none>',
          FileVault:
            audit.overview.fileVault.details ||
            (audit.overview.fileVault.enabled ? 'Enabled' : 'Disabled'),
          Findings: findingsText,
        };

        if (captureReport) {
          safeCaptureReport(deps.reportingHub, {
            tool: 'mac-permissions-audit',
            summary: `Risk=${audit.riskScore.toUpperCase()} | Findings=${audit.findings.length}`,
            sections,
            stage: 'analysis',
            tags: ['macos', 'security', 'permissions'],
            importance:
              audit.riskScore === 'high' ? 'high' : audit.riskScore === 'medium' ? 'medium' : 'low',
            devOpsCategory: 'endpoint',
            debugLayer: 'permissions',
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('macOS Permissions Audit', sections),
            },
          ],
          structuredContent: {
            audit,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
