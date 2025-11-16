/**
 * packet-capture Tool Module
 * Category: network
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const PacketCaptureModule: ToolModule = {
  name: 'packet-capture',
  description: 'packet-capture tool',
  category: 'network',
  tools: [
    {
      name: 'packet-capture',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'network',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'packet-capture',
    {
      description:
        'Runs a bounded tcpdump capture suitable for ad-hoc diagnostics. Requires sudo when executed.',
      inputSchema: {
        interface: z.string().default('en0'),
        durationSeconds: z.number().int().min(5).max(600).default(60),
        filterExpression: z.string().optional().describe("Optional BPF filter (e.g., 'port 443')."),
        outputDirectory: z
          .string()
          .optional()
          .describe('Directory to store capture files. Defaults to ./captures'),
      },
    },
    async ({ interface: iface, durationSeconds, filterExpression, outputDirectory }) => {
      try {
        const capture = await deps.packetCapture.capture({
          interface: iface,
          durationSeconds,
          filterExpression,
          outputDirectory,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                '# Packet Capture',
                `Command: ${capture.command}`,
                `Output file: ${capture.outputPath}`,
              ].join('\n'),
            },
          ],
          structuredContent: {
            command: capture.command,
            outputPath: capture.outputPath,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    }
  );
  },
};
