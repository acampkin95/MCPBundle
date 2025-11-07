import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";
import { shellQuote } from "../utils/shell.js";

export interface SshExecutionOptions {
  readonly port?: number;
  readonly identityFile?: string;
  readonly knownHostsFile?: string;
  readonly extraOptions?: Record<string, string>;
  readonly allocateTty?: boolean;
  readonly env?: Record<string, string>;
  readonly timeoutSeconds?: number;
}

export interface SshExecutionRequest {
  readonly host: string;
  readonly username?: string;
  readonly command?: string;
}

export class SshService {
  public constructor(private readonly runner: CommandRunner) {}

  public async execute(
    request: SshExecutionRequest,
    options: SshExecutionOptions = {},
  ): Promise<CommandResult> {
    const command = this.buildCommand(request, options);
    const timeoutMs = options.timeoutSeconds ? options.timeoutSeconds * 1000 : undefined;
    const env = options.env
      ? {
          ...process.env,
          ...options.env,
        }
      : undefined;

    return this.runner.run(command, {
      timeoutMs,
      env,
    });
  }

  private buildCommand(request: SshExecutionRequest, options: SshExecutionOptions): string {
    const parts: string[] = ["ssh", "-o", "BatchMode=yes"];

    if (options.port) {
      parts.push("-p", String(options.port));
    }

    if (options.identityFile) {
      parts.push("-i", shellQuote(options.identityFile));
    }

    if (options.knownHostsFile) {
      parts.push("-o", `UserKnownHostsFile=${shellQuote(options.knownHostsFile)}`);
    }

    if (options.extraOptions) {
      for (const [key, value] of Object.entries(options.extraOptions)) {
        const pair = value ? `${key}=${value}` : key;
        parts.push("-o", pair);
      }
    }

    if (options.allocateTty) {
      parts.push("-t");
    }

    const destination = request.username
      ? `${request.username}@${request.host}`
      : request.host;

    parts.push(shellQuote(destination));

    if (request.command) {
      parts.push("--", shellQuote(request.command));
    }

    return parts.join(" ");
  }
}
