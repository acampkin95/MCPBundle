#!/usr/bin/env node
/*
 * Lightweight CLI wrapper for core IT-MCP services.
 *
 * Provides quick access to common diagnostics and permission audits without
 * spinning up the full MCP transport. Designed for local use or embedding in
 * other automation workflows.
 */

import process from 'node:process';
import { CommandRunner } from '../utils/commandRunner.js';
import { MacDiagnosticsService } from '../services/macDiagnostics.js';
import { MacPermissionsService } from '../services/macPermissions.js';
import { SshService } from '../services/ssh.js';
import { getToolMetadata, listToolMetadata } from '../config/toolMetadata.js';

interface CliOptions {
  readonly command: string | undefined;
  readonly subcommand: string | undefined;
  readonly flags: Record<string, string | boolean>;
}

const parseArgs = (argv: string[]): CliOptions => {
  const [, , ...rest] = argv;
  const [command, subcommand, ...flagTokens] = rest;
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < flagTokens.length; i += 1) {
    const token = flagTokens[i];
    if (!token.startsWith('-')) {
      continue;
    }

    const normalized = token.replace(/^--?/, '');
    const next = flagTokens[i + 1];
    if (next && !next.startsWith('-')) {
      flags[normalized] = next;
      i += 1;
    } else {
      flags[normalized] = true;
    }
  }

  return { command, subcommand, flags };
};

const printUsage = (): void => {
  console.log(
    [
      'Usage: it-mcp <command> [subcommand] [flags]',
      '',
      'Commands:',
      '  mac-permissions overview           Print admin membership, SecureToken holders, FileVault status',
      '  mac-permissions audit              Run a permissions risk audit',
      '  mac-diagnostics run --suite <suite> [--cache-ttl <seconds>] [--compare-baseline] [--update-baseline]',
      '  tool-metadata [toolId]             List tool metadata or show details for a specific tool',
      '',
      'Examples:',
      '  it-mcp mac-permissions overview',
      '  it-mcp tool-metadata mac-permissions-audit',
      '',
    ].join('\n')
  );
};

const main = async (): Promise<void> => {
  const { command, subcommand, flags } = parseArgs(process.argv);

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    printUsage();
    return;
  }

  const allowSudo = process.env.IT_MCP_ALLOW_SUDO !== 'false';
  const runner = new CommandRunner(allowSudo);
  const ssh = new SshService(runner);
  const macDiagnostics = new MacDiagnosticsService(runner, ssh);
  const macPermissions = new MacPermissionsService(runner);

  try {
    switch (command) {
      case 'mac-permissions': {
        const mode = subcommand ?? 'overview';
        if (mode === 'overview') {
          const overview = await macPermissions.collectOverview();
          console.log(JSON.stringify({ status: 'ok', overview }, null, 2));
        } else if (mode === 'audit') {
          const audit = await macPermissions.auditPermissions();
          console.log(JSON.stringify({ status: 'ok', audit }, null, 2));
        } else {
          console.error(`Unknown mac-permissions subcommand: ${mode}`);
          process.exitCode = 1;
        }
        break;
      }

      case 'mac-diagnostics': {
        const action = subcommand ?? 'run';
        if (action !== 'run') {
          console.error(`Unknown mac-diagnostics subcommand: ${action}`);
          process.exitCode = 1;
          break;
        }

        const suiteFlag = String(flags.suite ?? '');
        if (!suiteFlag) {
          console.error(
            'Missing required flag: --suite <hardware|performance|security|network|storage>'
          );
          process.exitCode = 1;
          break;
        }

        const cacheTtlSeconds = flags['cache-ttl'] ? Number(flags['cache-ttl']) : undefined;
        const compareBaseline = Boolean(flags['compare-baseline']);
        const updateBaseline = Boolean(flags['update-baseline']);
        const baselinePath =
          typeof flags['baseline-path'] === 'string'
            ? (flags['baseline-path'] as string)
            : undefined;

        const run = await macDiagnostics.runLocalDiagnosticsWithBaseline({
          suite: suiteFlag as Parameters<
            MacDiagnosticsService['runLocalDiagnosticsWithBaseline']
          >[0]['suite'],
          cacheTtlSeconds,
          compareBaseline,
          updateBaseline,
          baselinePath,
        });

        console.log(
          JSON.stringify(
            {
              status: 'ok',
              suite: suiteFlag,
              cacheHit: run.cacheHit,
              baselinePath: run.baselinePath,
              baselineUpdated: run.baselineUpdated,
              comparisons: run.comparisons,
              results: run.results,
            },
            null,
            2
          )
        );
        break;
      }

      case 'tool-metadata': {
        const targetId = subcommand && subcommand !== 'list' ? subcommand : undefined;
        if (targetId) {
          const metadata = getToolMetadata(targetId);
          if (!metadata) {
            console.error(
              JSON.stringify(
                {
                  status: 'error',
                  message: `No metadata found for tool '${targetId}'`,
                },
                null,
                2
              )
            );
            process.exitCode = 1;
            break;
          }

          console.log(
            JSON.stringify(
              {
                status: 'ok',
                metadata,
              },
              null,
              2
            )
          );
        } else {
          const metadata = listToolMetadata();
          console.log(
            JSON.stringify(
              {
                status: 'ok',
                metadata,
              },
              null,
              2
            )
          );
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
};

await main();
