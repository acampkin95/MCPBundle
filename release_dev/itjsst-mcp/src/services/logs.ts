import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";
import { shellQuote } from "../utils/shell.js";

export interface LogQueryOptions {
  readonly lastMinutes?: number;
  readonly process?: string;
  readonly predicate?: string;
  readonly limit?: number;
}

export interface LogCollection {
  readonly command: string;
  readonly result: CommandResult;
}

export class LogService {
  public constructor(private readonly runner: CommandRunner) {}

  public async collectErrorEvents(
    options: LogQueryOptions = {},
  ): Promise<LogCollection> {
    const command = this.buildLogShowCommand({
      ...(options.lastMinutes ? { lastMinutes: options.lastMinutes } : {}),
      predicate:
        options.predicate ??
        'eventType == logEvent AND (eventMessage CONTAINS[c] "error" OR messageType == 16)',
      limit: options.limit ?? 200,
    });

    return this.runLogCommand(command);
  }

  public async reviewKernelPanics(): Promise<LogCollection> {
    const predicate = 'eventMessage CONTAINS[c] "Previous shutdown cause"';
    const command = this.buildLogShowCommand({
      predicate,
      lastMinutes: 60 * 24 * 14,
    });

    return this.runLogCommand(command);
  }

  public async inspectProcess(
    processName: string,
    options: LogQueryOptions = {},
  ): Promise<LogCollection> {
    const predicate =
      options.predicate ??
      `(process == ${shellQuote(processName)} OR senderImagePath CONTAINS ${shellQuote(processName)})`;

    const command = this.buildLogShowCommand({
      ...options,
      predicate,
      limit: options.limit ?? 200,
      lastMinutes: options.lastMinutes ?? 120,
    });

    return this.runLogCommand(command);
  }

  private async runLogCommand(command: string): Promise<LogCollection> {
    const result = await this.runner.run(command);
    return {
      command,
      result,
    };
  }

  private buildLogShowCommand(options: LogQueryOptions): string {
    const segments: string[] = ["log", "show", "--style", "json"];

    if (options.lastMinutes) {
      segments.push("--last", `${options.lastMinutes}m`);
    }

    if (options.predicate) {
      segments.push("--predicate", shellQuote(options.predicate));
    }

    const baseCommand = segments.join(" ");

    if (!options.limit) {
      return baseCommand;
    }

    const limit = Math.max(1, options.limit);
    return `${baseCommand} --info --debug --signpost | head -n ${limit}`;
  }
}
