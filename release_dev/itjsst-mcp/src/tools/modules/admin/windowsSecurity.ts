/**
 * windows-security Tool Module
 * Category: admin
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WindowsSecurityModule: ToolModule = {
  name: 'windows-security',
  description: 'windows-security tool',
  category: 'admin',
  tools: [
    {
      name: 'windows-security',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'admin',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'windows-security',
    {
      description:
        'Performs Windows security operations including Windows Defender, BitLocker, firewall management, security event analysis, and baseline assessment.',
      inputSchema: {
        operation: z.enum(
          SECURITY_OPERATIONS as unknown as [SecurityOperation, ...SecurityOperation[]]
        ),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(['Default', 'Negotiate', 'Kerberos', 'Basic', 'Credssp']).optional(),
        ignoreCertErrors: z.boolean().optional(),
        scanPath: z.string().optional(),
        exclusionPath: z.string().optional(),
        exclusionExtension: z.string().optional(),
        exclusionProcess: z.string().optional(),
        driveLetter: z.string().optional(),
        encryptionMethod: z.enum(['Aes128', 'Aes256', 'XtsAes128', 'XtsAes256']).optional(),
        ruleName: z.string().optional(),
        ruleDirection: z.enum(['Inbound', 'Outbound']).optional(),
        ruleAction: z.enum(['Allow', 'Block']).optional(),
        ruleProtocol: z.enum(['TCP', 'UDP', 'Any']).optional(),
        ruleLocalPort: z.string().optional(),
        ruleRemotePort: z.string().optional(),
        ruleRemoteAddress: z.string().optional(),
        hoursBack: z.number().int().optional(),
        maxEvents: z.number().int().optional(),
      },
    },
    async (params) => {
      const capability = params.host ? 'winrm' : 'local-shell';
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== 'local') {
        return {
          content: [
            {
              type: 'text' as const,
              text: toTextContent('Windows Security', { Result: 'Delegated to remote agent.' }),
            },
          ],
          structuredContent: {
            remoteAgent: await deps.remoteAgent.dispatch({
              tool: 'windows-security',
              capability,
              payload: params,
            }),
          },
        };
      }

      try {
        const result = await deps.windowsSecurity.executeOperation(params);
        const sections: Record<string, string> = {
          Operation: result.operation,
          Status: result.success ? '✓ Success' : '✗ Failed',
        };
        if (result.message) sections['Message'] = result.message;
        if (result.data)
          sections['Data'] =
            typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        if (result.stderr && !result.success) sections['Error'] = result.stderr;

        safeCaptureReport(deps.reportingHub, {
          tool: 'windows-security',
          summary: `Windows Security ${result.operation} ${params.dryRun ? '(dry-run)' : ''} - ${result.success ? 'success' : 'failed'}`,
          sections,
          tags: ['windows', 'security', result.operation, ...(params.dryRun ? ['dry-run'] : [])],
          importance: params.dryRun ? 'medium' : 'high',
          devOpsCategory: 'security',
          executionContext: params.host ? `host=${params.host}` : 'local',
        });

        return {
          content: [{ type: 'text' as const, text: toTextContent('Windows Security', sections) }],
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
