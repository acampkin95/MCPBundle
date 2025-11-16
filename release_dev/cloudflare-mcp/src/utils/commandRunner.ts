import { type ExecException, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

export interface CommandOptions {
  readonly requiresSudo?: boolean;
  readonly timeoutMs?: number;
  readonly dryRun?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
}

export interface CommandResult {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

export class CommandExecutionError extends Error {
  public readonly result: CommandResult;

  public constructor(message: string, result: CommandResult) {
    super(message);
    this.name = 'CommandExecutionError';
    this.result = result;
  }
}

export class CommandRunner {
  public constructor(private readonly allowSudo: boolean = true) {}

  public async run(command: string, options: CommandOptions = {}): Promise<CommandResult> {
    const { requiresSudo = false, timeoutMs, dryRun = false, env, cwd } = options;

    const finalCommand = requiresSudo && this.allowSudo ? `sudo ${command}` : command;

    logger.debug('Executing command', {
      command: finalCommand,
      dryRun,
      requiresSudo,
      cwd,
    });

    if (dryRun) {
      logger.debug('Dry run completed', { command: finalCommand });
      return {
        command: finalCommand,
        stdout: '',
        stderr: '',
        code: null,
      };
    }

    try {
      const { stdout, stderr } = await execAsync(finalCommand, {
        timeout: timeoutMs,
        env,
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });

      logger.debug('Command succeeded', {
        command: finalCommand,
        stdoutPreview: stdout ? stdout.slice(0, 200) : undefined,
        stderrPreview: stderr ? stderr.slice(0, 200) : undefined,
      });

      return {
        command: finalCommand,
        stdout,
        stderr,
        code: 0,
      };
    } catch (error) {
      const execError = error as ExecException & {
        stdout?: string;
        stderr?: string;
      };

      const result: CommandResult = {
        command: finalCommand,
        stdout: execError.stdout ?? '',
        stderr: execError.stderr ?? execError.message,
        code: typeof execError.code === 'number' ? execError.code : null,
      };

      logger.error('Command failed', {
        command: finalCommand,
        exitCode: result.code,
        stderr: result.stderr ? result.stderr.slice(0, 2000) : undefined,
      });

      throw new CommandExecutionError(`Command failed: ${finalCommand}`, result);
    }
  }
}
