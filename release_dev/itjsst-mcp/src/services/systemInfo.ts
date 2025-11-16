import { CommandRunner, type CommandResult } from '../utils/commandRunner.js';

export interface SystemOverview {
  readonly uname: string;
  readonly uptime: string;
  readonly loadAverage: string;
  readonly memory: string;
  readonly topProcesses: string;
  readonly diskUsage: string;
}

export class SystemInfoService {
  public constructor(private readonly runner: CommandRunner) {}

  public async getSystemOverview(processCount: number = 10): Promise<SystemOverview> {
    const limit = Math.max(1, Math.min(processCount, 50));
    const [uname, uptime, top, vmStat, disk] = await Promise.all([
      this.runner.run('uname -a'),
      this.runner.run('uptime'),
      this.runner.run(`top -l 1 -n ${limit}`),
      this.runner.run('vm_stat'),
      this.runner.run('df -h'),
    ]);

    return {
      uname: uname.stdout.trim(),
      uptime: uptime.stdout.trim(),
      loadAverage: this.extractLoadAverage(uptime),
      memory: vmStat.stdout.trim(),
      topProcesses: top.stdout.trim(),
      diskUsage: disk.stdout.trim(),
    };
  }

  public async listLaunchDaemons(): Promise<CommandResult> {
    return this.runner.run('launchctl list');
  }

  private extractLoadAverage(uptime: CommandResult): string {
    const match = uptime.stdout.match(/load averages?:\s*(.*)$/i);
    return match ? match[1] : uptime.stdout.trim();
  }
}
