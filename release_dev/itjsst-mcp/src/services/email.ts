import {
  CommandExecutionError,
  CommandRunner,
  type CommandResult,
} from '../utils/commandRunner.js';
import { shellQuote } from '../utils/shell.js';

export interface MxRecord {
  readonly priority: number;
  readonly exchange: string;
  readonly raw: string;
}

export interface MxLookupResult {
  readonly command: string;
  readonly result: CommandResult;
  readonly records: MxRecord[];
}

export interface TxtLookupResult {
  readonly command: string;
  readonly result: CommandResult;
  readonly values: string[];
}

export interface ConnectivityTarget {
  readonly host: string;
  readonly port: number;
  readonly timeoutSeconds: number;
}

export interface ConnectivityResult {
  readonly success: boolean;
  readonly command: string;
  readonly result: CommandResult;
}

export interface MailboxUsageResult {
  readonly targetPath: string;
  readonly resolvedPath: string;
  readonly total: CommandResult;
  readonly breakdown?: CommandResult;
}

export class EmailService {
  public constructor(private readonly runner: CommandRunner) {}

  public async lookupMx(domain: string): Promise<MxLookupResult> {
    const command = `dig +short MX ${shellQuote(domain)}`;
    const result = await this.runner.run(command);
    const records = this.parseMxRecords(result.stdout);
    return { command, result, records };
  }

  public async lookupTxt(record: string): Promise<TxtLookupResult> {
    const command = `dig +short TXT ${shellQuote(record)}`;
    const result = await this.runner.run(command);
    const values = this.parseTxtRecords(result.stdout);
    return { command, result, values };
  }

  public async checkSpf(domain: string): Promise<TxtLookupResult> {
    return this.lookupTxt(domain);
  }

  public async checkDmarc(domain: string): Promise<TxtLookupResult> {
    return this.lookupTxt(`_dmarc.${domain}`);
  }

  public async checkDkim(domain: string, selector: string): Promise<TxtLookupResult> {
    return this.lookupTxt(`${selector}._domainkey.${domain}`);
  }

  public async testConnectivity(target: ConnectivityTarget): Promise<ConnectivityResult> {
    const timeout = Math.max(1, target.timeoutSeconds);
    const command = `nc -vz -G ${timeout} ${shellQuote(target.host)} ${target.port}`;

    try {
      const result = await this.runner.run(command);
      return { success: true, command, result };
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return { success: false, command, result: error.result };
      }
      throw error;
    }
  }

  public async checkMailboxUsage(
    targetPath: string,
    includeBreakdown: boolean
  ): Promise<MailboxUsageResult> {
    const resolvedPath = this.resolvePath(targetPath);
    const normalizedPath = resolvedPath.replace(/\/+$/, '');

    const totalCommand = `du -sh ${shellQuote(normalizedPath)}`;
    const total = await this.runner.run(totalCommand);

    let breakdown: CommandResult | undefined;
    if (includeBreakdown) {
      const breakdownCommand = `find ${shellQuote(normalizedPath)} -mindepth 1 -maxdepth 1 -type d -exec du -sh {} + | sort -h`;
      try {
        breakdown = await this.runner.run(breakdownCommand);
      } catch (error) {
        if (error instanceof CommandExecutionError) {
          breakdown = error.result;
        } else {
          throw error;
        }
      }
    }

    return {
      targetPath,
      resolvedPath: normalizedPath,
      total,
      breakdown,
    };
  }

  private parseMxRecords(output: string): MxRecord[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [priorityStr, ...exchangeParts] = line.split(/\s+/);
        const priority = Number(priorityStr);
        const exchange = exchangeParts.join(' ').replace(/\.$/, '');
        return {
          priority: Number.isFinite(priority) ? priority : 0,
          exchange,
          raw: line,
        };
      });
  }

  private parseTxtRecords(output: string): string[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^"|"$/g, '').replace(/" "/g, '').replace(/\s+/g, ' '));
  }

  private resolvePath(input: string): string {
    if (input.startsWith('~')) {
      const home = process.env.HOME;
      if (home) {
        return input.replace(/^~(?=$|\/)/, home);
      }
    }
    return input;
  }
}
