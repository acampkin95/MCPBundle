/**
 * windows-iis Tool Module
 * Category: admin
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WindowsIisModule: ToolModule = {
  name: 'windows-iis',
  description: 'windows-iis tool',
  category: 'admin',
  tools: [
    {
      name: 'windows-iis',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'admin',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'windows-iis',
    {
      description:
        'Performs IIS operations including website, app pool, binding, SSL certificate, and virtual directory management.',
      inputSchema: {
        operation: z.enum(IIS_OPERATIONS as unknown as [IISOperation, ...IISOperation[]]),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(['Default', 'Negotiate', 'Kerberos', 'Basic', 'Credssp']).optional(),
        ignoreCertErrors: z.boolean().optional(),
        siteName: z.string().optional(),
        physicalPath: z.string().optional(),
        bindingInformation: z.string().optional(),
        protocol: z.enum(['http', 'https']).optional(),
        appPoolName: z.string().optional(),
        managedRuntimeVersion: z.enum(['v4.0', 'v2.0', 'No Managed Code']).optional(),
        managedPipelineMode: z.enum(['Integrated', 'Classic']).optional(),
        ipAddress: z.string().optional(),
        hostHeader: z.string().optional(),
        certificateHash: z.string().optional(),
        vdirPath: z.string().optional(),
        vdirPhysicalPath: z.string().optional(),
        anonymousAuth: z.boolean().optional(),
        windowsAuth: z.boolean().optional(),
        basicAuth: z.boolean().optional(),
        logPath: z.string().optional(),
        maxLogLines: z.number().int().optional(),
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
              text: toTextContent('IIS', { Result: 'Delegated to remote agent.' }),
            },
          ],
          structuredContent: {
            remoteAgent: await deps.remoteAgent.dispatch({
              tool: 'windows-iis',
              capability,
              payload: params,
            }),
          },
        };
      }

      try {
        const result = await deps.windowsIIS.executeOperation(params);
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
          tool: 'windows-iis',
          summary: `IIS ${result.operation} ${params.dryRun ? '(dry-run)' : ''} - ${result.success ? 'success' : 'failed'}`,
          sections,
          tags: ['windows', 'iis', result.operation, ...(params.dryRun ? ['dry-run'] : [])],
          importance: params.dryRun ? 'medium' : 'high',
          devOpsCategory: 'infrastructure',
          executionContext: params.host ? `host=${params.host}` : 'local',
        });

        return {
          content: [{ type: 'text' as const, text: toTextContent('IIS', sections) }],
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
