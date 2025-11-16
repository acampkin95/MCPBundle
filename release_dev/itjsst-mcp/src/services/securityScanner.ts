import {
  CommandRunner,
  CommandExecutionError,
  type CommandResult,
} from '../utils/commandRunner.js';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

export interface CodeqlScanOptions {
  readonly sourceRoot: string;
  readonly language: 'javascript' | 'typescript' | 'python' | 'cpp' | 'csharp' | 'java' | string;
  readonly buildCommand?: string;
  readonly databasePath?: string;
  readonly querySuite?: string;
  readonly outputSarifPath?: string;
}

export interface CodeqlScanResult {
  readonly databasePath: string;
  readonly sarifPath: string;
  readonly commands: CommandResult[];
}

export interface OpenvasScanOptions {
  readonly target: string;
  readonly portRange?: string;
  readonly profile?: string;
  readonly username?: string;
  readonly password?: string;
}

export interface OpenvasScanResult {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface InstallationResult {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export class SecurityScannerService {
  public constructor(private readonly runner: CommandRunner) {}

  public async installCodeql(): Promise<InstallationResult> {
    const command = 'brew install codeql';
    return this.executeInstall(command, true);
  }

  public async installOpenvas(): Promise<InstallationResult> {
    const command = 'brew install gvm';
    return this.executeInstall(command, true);
  }

  public async runCodeqlScan(options: CodeqlScanOptions): Promise<CodeqlScanResult> {
    const sourceRoot = resolve(options.sourceRoot);
    const language = options.language;
    const databasePath = resolve(options.databasePath ?? join(tmpdir(), `codeql-db-${Date.now()}`));
    const sarifPath = resolve(
      options.outputSarifPath ?? join(tmpdir(), `codeql-results-${Date.now()}.sarif`)
    );
    const querySuite = options.querySuite ?? `codeql-suites/${language}-code-scanning.qls`;

    const commands: CommandResult[] = [];

    const databaseCreateCmd = [
      'codeql',
      'database',
      'create',
      databasePath,
      '--language',
      language,
      '--source-root',
      sourceRoot,
    ];

    if (options.buildCommand) {
      databaseCreateCmd.push('--command', options.buildCommand);
    }

    commands.push(await this.runner.run(databaseCreateCmd.join(' ')));

    const analyzeCmd = [
      'codeql',
      'database',
      'analyze',
      databasePath,
      querySuite,
      '--format=sarifv2.1.0',
      `--output=${sarifPath}`,
    ];

    commands.push(await this.runner.run(analyzeCmd.join(' ')));

    return {
      databasePath,
      sarifPath,
      commands,
    };
  }

  public async updateOpenvasFeeds(): Promise<CommandResult> {
    return this.runner.run('gvm-feed-update', { requiresSudo: true });
  }

  public async runOpenvasScan(options: OpenvasScanOptions): Promise<OpenvasScanResult> {
    const profile = options.profile ?? 'Full and fast';
    const commandParts = [
      'gvm-cli',
      '--gmp-username',
      options.username ?? 'admin',
      '--gmp-password',
      options.password ?? 'admin',
      'socket',
      '--xml',
      `'<?xml version="1.0"?><create_task><name>MCP Scan ${options.target}</name><comment>Generated via scan_security_vulnerabilities</comment><config id="${profile}"/><target id="${options.target}"/></create_task>'`,
    ];

    try {
      const result = await this.runner.run(commandParts.join(' '));
      return {
        command: commandParts.join(' '),
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error) {
      const failed = error instanceof CommandExecutionError ? error.result : undefined;
      return {
        command: commandParts.join(' '),
        stdout: failed?.stdout ?? '',
        stderr:
          failed?.stderr ??
          'OpenVAS execution failed. Ensure gvm service is running and credentials are configured.',
        exitCode: failed?.code ?? 1,
      };
    }
  }

  private async executeInstall(command: string, sudo: boolean): Promise<InstallationResult> {
    try {
      const result = await this.runner.run(command, { requiresSudo: sudo });
      return {
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error) {
      const failed = error instanceof CommandExecutionError ? error.result : undefined;
      return {
        command,
        stdout: failed?.stdout ?? '',
        stderr: failed?.stderr ?? (error as Error).message,
        exitCode: failed?.code ?? 1,
      };
    }
  }
}
