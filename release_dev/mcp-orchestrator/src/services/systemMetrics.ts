import type { CommandRunner } from '../utils/commandRunner.js';
import { logger } from '../utils/logger.js';
import { validateServiceName, sanitizeShellArg } from '../utils/validators.js';

export interface SystemStats {
  readonly uptime: string;
  readonly loadAverage: {
    readonly oneMin: number;
    readonly fiveMin: number;
    readonly fifteenMin: number;
  };
  readonly memory: {
    readonly total: number;
    readonly used: number;
    readonly free: number;
    readonly available: number;
    readonly percentUsed: number;
  };
  readonly disk: DiskUsage[];
  readonly cpu: {
    readonly cores: number;
    readonly model: string;
  };
}

export interface DiskUsage {
  readonly filesystem: string;
  readonly size: string;
  readonly used: string;
  readonly available: string;
  readonly percentUsed: number;
  readonly mountPoint: string;
}

export interface ProcessInfo {
  readonly pid: number;
  readonly user: string;
  readonly cpu: number;
  readonly mem: number;
  readonly command: string;
}

export interface IOStats {
  readonly device: string;
  readonly tps: number;
  readonly readPerSec: number;
  readonly writePerSec: number;
}

export interface NetworkStats {
  readonly interface: string;
  readonly rxBytes: number;
  readonly txBytes: number;
  readonly rxPackets: number;
  readonly txPackets: number;
}

export interface JournalEntry {
  readonly timestamp: string;
  readonly unit: string;
  readonly message: string;
  readonly priority: string;
}

export class SystemMetricsService {
  public constructor(private readonly runner: CommandRunner) {}

  public async getSystemOverview(): Promise<SystemStats> {
    const [uptime, loadavg, meminfo, df, cpuinfo] = await Promise.all([
      this.runner.run('uptime -p', { requiresSudo: false }),
      this.runner.run('cat /proc/loadavg', { requiresSudo: false }),
      this.runner.run('free -b', { requiresSudo: false }),
      this.runner.run('df -h', { requiresSudo: false }),
      this.runner.run('lscpu', { requiresSudo: false }),
    ]);

    // Parse load average
    const loadParts = loadavg.stdout.trim().split(/\s+/);
    const loadAverage = {
      oneMin: Number(loadParts[0]) || 0,
      fiveMin: Number(loadParts[1]) || 0,
      fifteenMin: Number(loadParts[2]) || 0,
    };

    // Parse memory
    const memLines = meminfo.stdout.split('\n');
    const memData = memLines[1]?.split(/\s+/); // Second line is Mem:
    const memory = {
      total: Number(memData?.[1]) || 0,
      used: Number(memData?.[2]) || 0,
      free: Number(memData?.[3]) || 0,
      available: Number(memData?.[6]) || 0,
      percentUsed: 0,
    };
    memory.percentUsed = memory.total > 0 ? Math.round((memory.used / memory.total) * 100) : 0;

    // Parse disk usage
    const diskLines = df.stdout.split('\n').slice(1); // Skip header
    const disk: DiskUsage[] = [];
    for (const line of diskLines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        disk.push({
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          percentUsed: Number(parts[4].replace(/%/g, '')) || 0,
          mountPoint: parts[5],
        });
      }
    }

    // Parse CPU info
    const cpuModel = cpuinfo.stdout.match(/Model name:\s*(.+)/)?.[1]?.trim() ?? 'unknown';
    const cpuCores = cpuinfo.stdout.match(/CPU\(s\):\s*(\d+)/)?.[1] ?? '1';

    return {
      uptime: uptime.stdout.trim(),
      loadAverage,
      memory,
      disk,
      cpu: {
        cores: Number(cpuCores),
        model: cpuModel,
      },
    };
  }

  public async getProcessList(topN: number = 20): Promise<ProcessInfo[]> {
    const result = await this.runner.run(`ps aux --sort=-%cpu | head -n ${topN + 1}`, {
      requiresSudo: false,
      timeoutMs: 10000,
    });

    const lines = result.stdout.split('\n').slice(1); // Skip header
    const processes: ProcessInfo[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 11) {
        processes.push({
          pid: Number(parts[1]) || 0,
          user: parts[0],
          cpu: Number(parts[2]) || 0,
          mem: Number(parts[3]) || 0,
          command: parts.slice(10).join(' '),
        });
      }
    }

    return processes;
  }

  public async getDiskIO(): Promise<IOStats[]> {
    try {
      const result = await this.runner.run('iostat -d -x 1 2 | tail -n +4', {
        requiresSudo: false,
        timeoutMs: 15000,
      });

      const lines = result.stdout
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('Device'));
      const stats: IOStats[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          stats.push({
            device: parts[0],
            tps: Number(parts[1]) || 0,
            readPerSec: Number(parts[2]) || 0,
            writePerSec: Number(parts[3]) || 0,
          });
        }
      }

      return stats;
    } catch (error) {
      logger.warn('iostat not available', { error });
      return [];
    }
  }

  public async getNetworkStats(): Promise<NetworkStats[]> {
    const result = await this.runner.run('cat /proc/net/dev', {
      requiresSudo: false,
    });

    const lines = result.stdout.split('\n').slice(2); // Skip header lines
    const stats: NetworkStats[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 17) {
        const iface = parts[0].replace(':', '');
        if (iface && iface !== 'lo') {
          // Skip loopback
          stats.push({
            interface: iface,
            rxBytes: Number(parts[1]) || 0,
            rxPackets: Number(parts[2]) || 0,
            txBytes: Number(parts[9]) || 0,
            txPackets: Number(parts[10]) || 0,
          });
        }
      }
    }

    return stats;
  }

  public async getJournalErrors(lastMinutes: number = 60): Promise<JournalEntry[]> {
    const since = `${lastMinutes} minutes ago`;

    try {
      const result = await this.runner.run(
        `journalctl --since="${since}" --priority=err --output=json --no-pager`,
        {
          requiresSudo: false,
          timeoutMs: 30000,
        }
      );

      const lines = result.stdout.split('\n').filter((line) => line.trim());
      const entries: JournalEntry[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          entries.push({
            timestamp: entry.__REALTIME_TIMESTAMP
              ? new Date(Number(entry.__REALTIME_TIMESTAMP) / 1000).toISOString()
              : 'unknown',
            unit: entry._SYSTEMD_UNIT ?? entry.SYSLOG_IDENTIFIER ?? 'unknown',
            message: entry.MESSAGE ?? '',
            priority: entry.PRIORITY ?? 'unknown',
          });
        } catch {
          // Skip invalid JSON lines
        }
      }

      return entries;
    } catch (error) {
      logger.warn('Failed to query journalctl', { error });
      return [];
    }
  }

  public async getServiceStatus(serviceName: string): Promise<{
    readonly active: boolean;
    readonly running: boolean;
    readonly enabled: boolean;
    readonly status: string;
  }> {
    // Validate service name to prevent command injection
    if (!validateServiceName(serviceName)) {
      throw new Error(`Invalid service name: ${serviceName}. Must be from allowed list.`);
    }

    try {
      // Sanitize service name for shell commands
      const safeServiceName = sanitizeShellArg(serviceName);

      const result = await this.runner.run(`systemctl is-active ${safeServiceName}`, {
        requiresSudo: false,
      });

      const activeResult = await this.runner.run(`systemctl is-enabled ${safeServiceName}`, {
        requiresSudo: false,
      });

      const statusResult = await this.runner.run(`systemctl status ${safeServiceName}`, {
        requiresSudo: false,
      });

      return {
        active: result.stdout.trim() === 'active',
        running: result.stdout.trim() === 'active',
        enabled: activeResult.stdout.trim() === 'enabled',
        status: statusResult.stdout,
      };
    } catch (error) {
      logger.warn('Failed to get service status', { serviceName, error });
      return {
        active: false,
        running: false,
        enabled: false,
        status: 'unknown',
      };
    }
  }
}
