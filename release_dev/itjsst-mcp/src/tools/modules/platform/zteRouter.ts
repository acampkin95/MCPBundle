/**
 * zte-router Tool Module
 * Category: platform
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ZteRouterModule: ToolModule = {
  name: 'zte-router',
  description: 'zte-router tool',
  category: 'platform',
  tools: [
    {
      name: 'zte-router',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'platform',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'zte-router',
    {
      description:
        'Manage ZTE routers (NH8091/Optus Ultra 5G, MF286, MC801A) via HTTP API - includes status, signal strength, WiFi config, SMS, data usage, APN settings, and band selection.',
      inputSchema: {
        operation: z.enum(ZTE_OPERATIONS as unknown as [ZteOperation, ...ZteOperation[]]),
        host: z.string().default('192.168.1.1'),
        username: z.string().optional(),
        password: z.string(),
        port: z.number().int().min(1).max(65535).optional(),
        protocol: z.enum(['http', 'https']).optional(),
        dryRun: z.boolean().default(false),
        // WiFi config parameters
        ssid: z.string().optional(),
        wifiPassword: z.string().optional(),
        // SMS parameters
        phoneNumber: z.string().optional(),
        smsMessage: z.string().optional(),
        // APN parameters
        apnName: z.string().optional(),
        apnUsername: z.string().optional(),
        apnPassword: z.string().optional(),
        // Band selection
        bandMode: z.string().optional(),
      },
    },
    async (params) => {
      try {
        const result = await deps.zteRouter.executeOperation(params);
        const sections: Record<string, string> = {
          Operation: result.operation,
          Status: result.success ? '✓ Success' : '✗ Failed',
        };
        if (result.message) sections['Message'] = result.message;
        if (result.data) {
          sections['Data'] = JSON.stringify(result.data, null, 2);
        }
        if (result.rawOutput && !result.data) {
          sections['Raw Output'] = result.rawOutput;
        }

        safeCaptureReport(deps.reportingHub, {
          tool: 'zte-router',
          summary: `ZTE Router ${result.operation} ${params.dryRun ? '(dry-run)' : ''} - ${result.success ? 'success' : 'failed'}`,
          sections,
          tags: [
            'network',
            'zte',
            'router',
            '5g',
            result.operation,
            ...(params.dryRun ? ['dry-run'] : []),
          ],
          importance: params.dryRun ? 'medium' : 'high',
          devOpsCategory: 'network',
          executionContext: `host=${params.host}`,
        });

        return {
          content: [{ type: 'text' as const, text: toTextContent('ZTE Router', sections) }],
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
