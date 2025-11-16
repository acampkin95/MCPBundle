/**
 * scan_security_vulnerabilities Tool Module
 * Category: security
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const Scan_security_vulnerabilitiesModule: ToolModule = {
  name: 'scan_security_vulnerabilities',
  description: 'scan_security_vulnerabilities tool',
  category: 'security',
  tools: [
    {
      name: 'scan_security_vulnerabilities',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'security',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'scan_security_vulnerabilities',
    {
      description:
        'Installs and runs CodeQL and OpenVAS security scans. Requires local tooling (brew) and may prompt for sudo.',
      inputSchema: {
        installCodeql: z.boolean().default(false),
        installOpenvas: z.boolean().default(false),
        updateOpenvasFeeds: z.boolean().default(false),
        codeql: z
          .object({
            sourceRoot: z.string().optional(),
            language: z.string().default('javascript'),
            buildCommand: z.string().optional(),
            databasePath: z.string().optional(),
            querySuite: z.string().optional(),
            outputSarifPath: z.string().optional(),
          })
          .optional(),
        openvas: z
          .object({
            target: z.string().default('127.0.0.1'),
            portRange: z.string().optional(),
            profile: z.string().optional(),
            username: z.string().optional(),
            password: z.string().optional(),
          })
          .optional(),
      },
    },
    async ({ installCodeql, installOpenvas, updateOpenvasFeeds, codeql, openvas }) => {
      const actions: Record<string, unknown> = {};

      if (installCodeql) {
        actions.codeqlInstall = await deps.securityScanner.installCodeql();
      }

      if (installOpenvas) {
        actions.openvasInstall = await deps.securityScanner.installOpenvas();
      }

      if (updateOpenvasFeeds) {
        try {
          actions.openvasFeedUpdate = await deps.securityScanner.updateOpenvasFeeds();
        } catch (error) {
          actions.openvasFeedUpdateError = error instanceof Error ? error.message : String(error);
        }
      }

      if (codeql?.sourceRoot) {
        try {
          actions.codeqlScan = await deps.securityScanner.runCodeqlScan({
            sourceRoot: codeql.sourceRoot,
            language: codeql.language,
            buildCommand: codeql.buildCommand,
            databasePath: codeql.databasePath,
            querySuite: codeql.querySuite,
            outputSarifPath: codeql.outputSarifPath,
          });
        } catch (error) {
          actions.codeqlScanError = error instanceof Error ? error.message : String(error);
        }
      }

      if (openvas) {
        actions.openvasScan = await deps.securityScanner.runOpenvasScan({
          target: openvas.target,
          portRange: openvas.portRange,
          profile: openvas.profile,
          username: openvas.username,
          password: openvas.password,
        });
      }

      const sections: Record<string, string> = {};

      if (actions.codeqlInstall) {
        sections['CodeQL install'] =
          (actions.codeqlInstall as InstallationResult).exitCode === 0
            ? 'Installed via brew'
            : `Install failed: ${(actions.codeqlInstall as InstallationResult).stderr}`;
      }

      if (actions.openvasInstall) {
        sections['OpenVAS install'] =
          (actions.openvasInstall as InstallationResult).exitCode === 0
            ? 'Installed via brew'
            : `Install failed: ${(actions.openvasInstall as InstallationResult).stderr}`;
      }

      if (actions.codeqlScan) {
        const scan = actions.codeqlScan as { sarifPath: string; databasePath: string };
        sections['CodeQL SARIF'] = scan.sarifPath;
        sections['CodeQL DB'] = scan.databasePath;
      } else if (actions.codeqlScanError) {
        sections['CodeQL error'] = String(actions.codeqlScanError);
      }

      if (actions.openvasScan) {
        const scan = actions.openvasScan as {
          stderr: string;
          stdout: string;
          exitCode: number | null;
        };
        sections['OpenVAS status'] = `Exit code: ${scan.exitCode}`;
        if (scan.stderr) {
          sections['OpenVAS stderr'] = scan.stderr;
        }
      }

      if (Object.keys(sections).length === 0) {
        sections.Result = 'No actions requested.';
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Security Vulnerability Scan', sections),
          },
        ],
        structuredContent: actions,
      };
    }
  );
  },
};
