import { CommandRunner, type CommandResult } from '../utils/commandRunner.js';
import { buildCommand, shellQuote } from '../utils/shell.js';

export interface CleanupOptions {
  readonly dryRun?: boolean;
}

export interface DirectoryCleanupOptions extends CleanupOptions {
  readonly target: string;
  readonly olderThanDays?: number;
}

export interface BatchCommandResult {
  readonly name: string;
  readonly command: string;
  readonly result: CommandResult;
}

export class CleanupService {
  public constructor(private readonly runner: CommandRunner) {}

  public async cleanUserCaches(options: CleanupOptions = {}): Promise<BatchCommandResult> {
    const userCache = `${process.env.HOME ?? '~'}/Library/Caches`;
    const command = buildCommand([
      'find',
      shellQuote(userCache),
      '-mindepth 1',
      '-maxdepth 1',
      '-print',
      '-exec',
      'rm -rf {} +',
    ]);

    const result = await this.runner.run(command, {
      dryRun: options.dryRun,
    });

    return {
      name: 'cleanUserCaches',
      command,
      result,
    };
  }

  public async cleanSystemCaches(options: CleanupOptions = {}): Promise<BatchCommandResult> {
    const command = buildCommand([
      'find',
      shellQuote('/Library/Caches'),
      '-mindepth 1',
      '-maxdepth 1',
      '-print',
      '-exec',
      'rm -rf {} +',
    ]);

    const result = await this.runner.run(command, {
      dryRun: options.dryRun,
      requiresSudo: true,
    });

    return {
      name: 'cleanSystemCaches',
      command,
      result,
    };
  }

  public async purgeDownloads(options: DirectoryCleanupOptions): Promise<BatchCommandResult> {
    const { target, olderThanDays = 30, dryRun } = options;

    const command = `find ${shellQuote(target)} -type f -mtime +${olderThanDays} -print -exec rm -f {} +`;

    const result = await this.runner.run(command, {
      dryRun,
    });

    return {
      name: 'purgeDownloads',
      command,
      result,
    };
  }

  public async emptyTrash(options: CleanupOptions = {}): Promise<BatchCommandResult> {
    const trashPath = `${process.env.HOME ?? '~'}/.Trash`;
    const command = `find ${shellQuote(trashPath)} -mindepth 1 -maxdepth 1 -print -exec rm -rf {} +`;

    const result = await this.runner.run(command, {
      dryRun: options.dryRun,
    });

    return {
      name: 'emptyTrash',
      command,
      result,
    };
  }

  public async thinTimeMachineSnapshots(
    gigabytesToFree: number,
    options: CleanupOptions = {}
  ): Promise<BatchCommandResult> {
    const bytes = Math.max(1, Math.round(gigabytesToFree * 1024 * 1024 * 1024));
    const command = buildCommand(['tmutil', 'thinlocalsnapshots', '/', String(bytes), '4']);

    const result = await this.runner.run(command, {
      requiresSudo: true,
      dryRun: options.dryRun,
    });

    return {
      name: 'thinTimeMachineSnapshots',
      command,
      result,
    };
  }
}
