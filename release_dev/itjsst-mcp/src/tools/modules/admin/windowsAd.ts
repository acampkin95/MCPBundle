/**
 * windows-ad Tool Module
 * Category: admin
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WindowsAdModule: ToolModule = {
  name: 'windows-ad',
  description: 'windows-ad tool',
  category: 'admin',
  tools: [
    {
      name: 'windows-ad',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'admin',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'windows-ad',
    {
      description:
        'Performs Active Directory operations including user, group, computer, OU, and GPO management. Supports both read and write operations with dry-run mode for safety.',
      inputSchema: {
        operation: z.enum(AD_OPERATIONS as unknown as [ADOperation, ...ADOperation[]]),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(['Default', 'Negotiate', 'Kerberos', 'Basic', 'Credssp']).optional(),
        ignoreCertErrors: z.boolean().optional(),
        // Common parameters
        identity: z.string().optional(),
        name: z.string().optional(),
        distinguishedName: z.string().optional(),
        searchBase: z.string().optional(),
        filter: z.string().optional(),
        // User-specific parameters
        givenName: z.string().optional(),
        surname: z.string().optional(),
        displayName: z.string().optional(),
        emailAddress: z.string().optional(),
        userPassword: z.string().optional(),
        mustChangePassword: z.boolean().optional(),
        passwordNeverExpires: z.boolean().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
        // Group-specific parameters
        groupScope: z.enum(['DomainLocal', 'Global', 'Universal']).optional(),
        groupCategory: z.enum(['Distribution', 'Security']).optional(),
        memberToAdd: z.string().optional(),
        memberToRemove: z.string().optional(),
        // OU-specific parameters
        path: z.string().optional(),
        targetPath: z.string().optional(),
        // GPO-specific parameters
        gpoName: z.string().optional(),
        linkTarget: z.string().optional(),
        linkEnabled: z.boolean().optional(),
        linkOrder: z.number().int().optional(),
      },
    },
    async (params) => {
      const capability = params.host ? 'winrm' : 'local-shell';
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        const response = await deps.remoteAgent.dispatch({
          tool: 'windows-ad',
          capability,
          payload: params,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Active Directory', {
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
        const options = {
          ...params,
          operation: params.operation,
          password: params.userPassword,
        };

        const result = await deps.windowsActiveDirectory.executeOperation(options);

        const sections: Record<string, string> = {};
        sections['Operation'] = result.operation;
        sections['Status'] = result.success ? '✓ Success' : '✗ Failed';
        if (result.message) {
          sections['Message'] = result.message;
        }
        if (result.data) {
          sections['Data'] =
            typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        }
        if (result.stderr && !result.success) {
          sections['Error'] = result.stderr;
        }

        safeCaptureReport(deps.reportingHub, {
          tool: 'windows-ad',
          summary: `Active Directory ${result.operation} ${params.dryRun ? '(dry-run)' : ''} - ${result.success ? 'success' : 'failed'}`,
          sections,
          tags: [
            'windows',
            'active-directory',
            result.operation,
            ...(params.dryRun ? ['dry-run'] : []),
          ],
          importance: params.dryRun ? 'medium' : 'high',
          devOpsCategory: 'security',
          executionContext: params.host
            ? `host=${params.host}, user=${params.username ?? 'unknown'}`
            : 'local',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Active Directory', sections),
            },
          ],
          structuredContent: {
            operation: result.operation,
            success: result.success,
            dryRun: params.dryRun,
            data: result.data,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
