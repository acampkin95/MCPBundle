/**
 * mac-permissions-overview Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const MacPermissionsOverviewModule: ToolModule = {
  name: 'mac-permissions-overview',
  description: 'mac-permissions-overview tool',
  category: 'platform',
  tools: [
    {
      name: 'mac-permissions-overview',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'mac-permissions-overview',
    {
      description:
        'Audits macOS admin membership, SecureToken presence, FileVault status, and TCC service counts.',
      inputSchema: {
        tccLimit: z.number().int().min(1).max(50).default(10),
        captureReport: z.boolean().default(true),
      },
    },
    async ({ tccLimit, captureReport }) => {
      try {
        const overview = await deps.macPermissions.collectOverview();
        const adminText = overview.adminGroup.members.length
          ? overview.adminGroup.members.join(', ')
          : '<no admin members>';

        const secureTokenText = overview.secureTokens.tokens.length
          ? overview.secureTokens.tokens.map((entry) => `${entry.user} (${entry.uuid})`).join('\n')
          : '<no secure token holders>';

        const tccTop = overview.tccSummary.services
          .slice(0, tccLimit)
          .map((svc) => `${svc.service}: ${svc.entries}`)
          .join('\n');

        const sections: Record<string, string> = {
          'Admin group': adminText,
          'Secure tokens': secureTokenText,
          FileVault:
            overview.fileVault.details || (overview.fileVault.enabled ? 'Enabled' : 'Disabled'),
          'TCC services': tccTop || '<no TCC entries>',
        };

        if (captureReport) {
          safeCaptureReport(deps.reportingHub, {
            tool: 'mac-permissions-overview',
            summary: `Admin accounts (${overview.adminGroup.members.length}), secure tokens (${overview.secureTokens.tokens.length}), FileVault ${overview.fileVault.enabled ? 'enabled' : 'disabled'}`,
            sections,
            stage: 'analysis',
            tags: ['macos', 'permissions', 'security'],
            importance: overview.fileVault.enabled ? 'medium' : 'high',
            devOpsCategory: 'endpoint',
            debugLayer: 'permissions',
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('macOS Permissions Overview', sections),
            },
          ],
          structuredContent: {
            overview,
            tccLimit,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
