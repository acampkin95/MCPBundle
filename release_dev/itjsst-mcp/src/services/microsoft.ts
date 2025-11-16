import { CommandExecutionError, CommandRunner } from '../utils/commandRunner.js';
import { shellQuote } from '../utils/shell.js';

export interface M365CommandResult<T = unknown> {
  readonly command: string;
  readonly rawOutput: string;
  readonly parsed?: T;
}

export class MicrosoftService {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly binary: string = process.env.M365_CLI_PATH ?? 'm365'
  ) {}

  public async listUsers(): Promise<M365CommandResult> {
    return this.runM365(['aad', 'user', 'list', '--output', 'json']);
  }

  public async listGroups(): Promise<M365CommandResult> {
    return this.runM365(['aad', 'o365group', 'list', '--output', 'json']);
  }

  public async listIntuneDevices(): Promise<M365CommandResult> {
    return this.runM365(['intune', 'device', 'list', '--output', 'json']);
  }

  public async getServiceHealth(): Promise<M365CommandResult> {
    return this.runM365(['status', 'service', 'list', '--output', 'json']);
  }

  public async getCliVersion(): Promise<M365CommandResult> {
    return this.runM365(['version'], false);
  }

  private async runM365(
    args: string[],
    attemptJsonParse: boolean = true
  ): Promise<M365CommandResult> {
    const command = this.buildCommand(args);

    try {
      const result = await this.runner.run(command);

      let parsed: unknown;
      if (attemptJsonParse) {
        try {
          parsed = JSON.parse(result.stdout || '[]');
        } catch {
          parsed = undefined;
        }
      }

      return {
        command,
        rawOutput: result.stdout.trim(),
        parsed,
      };
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        throw new CommandExecutionError(
          `${command} failed. Ensure the Microsoft 365 CLI is installed and you are logged in (m365 login).`,
          error.result
        );
      }

      throw error;
    }
  }

  private buildCommand(args: string[]): string {
    const parts = [this.binary, ...args];

    return parts
      .map((part, index) => {
        if (index === 0 && !/[\s'"]/.test(part)) {
          return part;
        }

        return shellQuote(part);
      })
      .join(' ');
  }
}
