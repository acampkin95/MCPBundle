/**
 * Unit tests for SystemMetricsService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemMetricsService } from '../../../src/services/systemMetrics.js';
import type { CommandRunner, CommandResult } from '../../../src/utils/commandRunner.js';

describe('SystemMetricsService', () => {
  let service: SystemMetricsService;
  let mockRunner: CommandRunner;

  beforeEach(() => {
    mockRunner = {
      run: vi.fn(),
    } as unknown as CommandRunner;

    service = new SystemMetricsService(mockRunner);
  });

  describe('getSystemOverview', () => {
    it('should return complete system statistics', async () => {
      vi.mocked(mockRunner.run).mockImplementation(async (command: string) => {
        const mockResults: Record<string, CommandResult> = {
          'uptime -p': {
            command: 'uptime -p',
            stdout: 'up 5 days, 3 hours',
            stderr: '',
            code: 0,
          },
          'cat /proc/loadavg': {
            command: 'cat /proc/loadavg',
            stdout: '0.15 0.10 0.08 2/345 12345',
            stderr: '',
            code: 0,
          },
          'free -b': {
            command: 'free -b',
            stdout:
              '               total        used        free      shared  buff/cache   available\n' +
              'Mem:    16777216000  8388608000  4194304000   104857600  4194304000  7340032000',
            stderr: '',
            code: 0,
          },
          'df -h': {
            command: 'df -h',
            stdout:
              'Filesystem      Size  Used Avail Use% Mounted on\n' +
              '/dev/sda1       100G   45G   50G  48% /\n' +
              '/dev/sdb1       500G  200G  280G  42% /data',
            stderr: '',
            code: 0,
          },
          lscpu: {
            command: 'lscpu',
            stdout: 'CPU(s):              8\nModel name:          Intel(R) Xeon(R) CPU @ 2.40GHz',
            stderr: '',
            code: 0,
          },
        };

        return (
          mockResults[command] || {
            command,
            stdout: '',
            stderr: '',
            code: 0,
          }
        );
      });

      const stats = await service.getSystemOverview();

      expect(stats.uptime).toBe('up 5 days, 3 hours');
      expect(stats.loadAverage.oneMin).toBe(0.15);
      expect(stats.loadAverage.fiveMin).toBe(0.1);
      expect(stats.loadAverage.fifteenMin).toBe(0.08);
      expect(stats.memory.total).toBe(16777216000);
      expect(stats.memory.used).toBe(8388608000);
      expect(stats.memory.free).toBe(4194304000);
      expect(stats.memory.available).toBe(7340032000);
      expect(stats.memory.percentUsed).toBe(50);
      expect(stats.disk.length).toBe(2);
      expect(stats.disk[0].filesystem).toBe('/dev/sda1');
      expect(stats.disk[0].percentUsed).toBe(48);
      expect(stats.cpu.cores).toBe(8);
      expect(stats.cpu.model).toContain('Intel');
    });

    it('should handle missing load average values', async () => {
      vi.mocked(mockRunner.run).mockImplementation(async (command: string) => {
        if (command === 'cat /proc/loadavg') {
          return {
            command,
            stdout: '',
            stderr: '',
            code: 0,
          };
        }
        return {
          command,
          stdout: '',
          stderr: '',
          code: 0,
        };
      });

      const stats = await service.getSystemOverview();

      expect(stats.loadAverage.oneMin).toBe(0);
      expect(stats.loadAverage.fiveMin).toBe(0);
      expect(stats.loadAverage.fifteenMin).toBe(0);
    });

    it('should handle missing memory data', async () => {
      vi.mocked(mockRunner.run).mockImplementation(async (command: string) => {
        if (command === 'free -b') {
          return {
            command,
            stdout: '\n',
            stderr: '',
            code: 0,
          };
        }
        return {
          command,
          stdout: '',
          stderr: '',
          code: 0,
        };
      });

      const stats = await service.getSystemOverview();

      expect(stats.memory.total).toBe(0);
      expect(stats.memory.used).toBe(0);
      expect(stats.memory.free).toBe(0);
      expect(stats.memory.percentUsed).toBe(0);
    });

    it('should parse disk usage for multiple filesystems', async () => {
      vi.mocked(mockRunner.run).mockImplementation(async (command: string) => {
        if (command === 'df -h') {
          return {
            command,
            stdout:
              'Filesystem      Size  Used Avail Use% Mounted on\n' +
              '/dev/sda1       100G   45G   50G  48% /\n' +
              '/dev/sdb1       500G  200G  280G  42% /data\n' +
              '/dev/sdc1      1.0T  500G  500G  50% /backup',
            stderr: '',
            code: 0,
          };
        }
        return { command, stdout: '', stderr: '', code: 0 };
      });

      const stats = await service.getSystemOverview();

      expect(stats.disk.length).toBe(3);
      expect(stats.disk[0].mountPoint).toBe('/');
      expect(stats.disk[1].mountPoint).toBe('/data');
      expect(stats.disk[2].mountPoint).toBe('/backup');
    });
  });

  describe('getProcessList', () => {
    it('should return list of top processes', async () => {
      const psOutput =
        'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' +
        'root      1234 25.5  5.2 123456 78900 ?        S    12:00   1:30 node server.js\n' +
        'www-data  5678 15.2  3.1 234567 45678 ?        S    13:00   0:45 nginx: worker';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'ps aux',
        stdout: psOutput,
        stderr: '',
        code: 0,
      });

      const processes = await service.getProcessList(20);

      expect(processes.length).toBe(2);
      expect(processes[0].pid).toBe(1234);
      expect(processes[0].user).toBe('root');
      expect(processes[0].cpu).toBe(25.5);
      expect(processes[0].mem).toBe(5.2);
      expect(processes[0].command).toContain('node server.js');
      expect(processes[1].pid).toBe(5678);
      expect(processes[1].command).toContain('nginx: worker');
    });

    it('should handle custom top N value', async () => {
      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'ps aux',
        stdout: 'USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND\n',
        stderr: '',
        code: 0,
      });

      await service.getProcessList(10);

      expect(vi.mocked(mockRunner.run)).toHaveBeenCalledWith(
        expect.stringContaining('head -n 11'),
        expect.anything()
      );
    });

    it('should handle malformed process lines', async () => {
      const psOutput =
        'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' +
        'malformed line\n' +
        'root      1234 25.5  5.2 123456 78900 ?        S    12:00   1:30 node server.js';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'ps aux',
        stdout: psOutput,
        stderr: '',
        code: 0,
      });

      const processes = await service.getProcessList();

      expect(processes.length).toBe(1);
      expect(processes[0].pid).toBe(1234);
    });
  });

  describe('getDiskIO', () => {
    it('should return disk I/O statistics', async () => {
      const iostatOutput =
        'Device            r/s     w/s     rkB/s     wkB/s\n' +
        'sda             10.5    20.2     512.0    1024.0\n' +
        'sdb              5.2     8.1     256.0     512.0';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'iostat',
        stdout: iostatOutput,
        stderr: '',
        code: 0,
      });

      const stats = await service.getDiskIO();

      expect(stats.length).toBe(2);
      expect(stats[0].device).toBe('sda');
      expect(stats[0].tps).toBe(10.5);
      expect(stats[1].device).toBe('sdb');
    });

    it('should return empty array when iostat not available', async () => {
      vi.mocked(mockRunner.run).mockRejectedValue(new Error('Command not found'));

      const stats = await service.getDiskIO();

      expect(stats).toEqual([]);
    });

    it('should filter out header lines', async () => {
      const iostatOutput =
        'Linux 5.15.0\n' +
        '\n' +
        'Device:         tps    kB_read/s    kB_wrtn/s    kB_read    kB_wrtn\n' +
        'sda             10.5         512.0       1024.0     123456     234567';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'iostat',
        stdout: iostatOutput,
        stderr: '',
        code: 0,
      });

      const stats = await service.getDiskIO();

      expect(stats.length).toBe(1);
      expect(stats[0].device).toBe('sda');
    });
  });

  describe('getNetworkStats', () => {
    it('should return network interface statistics', async () => {
      const netDevOutput =
        'Inter-|   Receive                                                |  Transmit\n' +
        ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
        '    lo: 1234567     890    0    0    0     0          0         0  1234567     890    0    0    0     0       0          0\n' +
        '  eth0: 9876543210  12345    0    0    0     0          0         0  8765432109  23456    0    0    0     0       0          0\n' +
        '  wlan0: 5432109876  6789    0    0    0     0          0         0  4321098765  7890    0    0    0     0       0          0';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'cat /proc/net/dev',
        stdout: netDevOutput,
        stderr: '',
        code: 0,
      });

      const stats = await service.getNetworkStats();

      // Should skip loopback (lo)
      expect(stats.length).toBe(2);
      expect(stats[0].interface).toBe('eth0');
      expect(stats[0].rxBytes).toBe(9876543210);
      expect(stats[0].txBytes).toBe(8765432109);
      expect(stats[1].interface).toBe('wlan0');
    });

    it('should skip loopback interface', async () => {
      const netDevOutput =
        'Inter-|   Receive                                                |  Transmit\n' +
        ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
        '    lo: 1234567     890    0    0    0     0          0         0  1234567     890    0    0    0     0       0          0';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'cat /proc/net/dev',
        stdout: netDevOutput,
        stderr: '',
        code: 0,
      });

      const stats = await service.getNetworkStats();

      expect(stats.length).toBe(0);
    });

    it('should handle malformed network data lines', async () => {
      const netDevOutput =
        'Inter-|   Receive                                                |  Transmit\n' +
        ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
        'malformed\n' +
        '  eth0: 9876543210  12345    0    0    0     0          0         0  8765432109  23456    0    0    0     0       0          0';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'cat /proc/net/dev',
        stdout: netDevOutput,
        stderr: '',
        code: 0,
      });

      const stats = await service.getNetworkStats();

      expect(stats.length).toBe(1);
      expect(stats[0].interface).toBe('eth0');
    });
  });

  describe('getJournalErrors', () => {
    it('should return journal error entries', async () => {
      const journalOutput =
        '{"MESSAGE":"Error occurred","PRIORITY":"3","_SYSTEMD_UNIT":"test.service","__REALTIME_TIMESTAMP":"1700000000000000"}\n' +
        '{"MESSAGE":"Critical failure","PRIORITY":"2","SYSLOG_IDENTIFIER":"kernel","__REALTIME_TIMESTAMP":"1700000001000000"}';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'journalctl',
        stdout: journalOutput,
        stderr: '',
        code: 0,
      });

      const entries = await service.getJournalErrors(60);

      expect(entries.length).toBe(2);
      expect(entries[0].message).toBe('Error occurred');
      expect(entries[0].unit).toBe('test.service');
      expect(entries[0].priority).toBe('3');
      expect(entries[1].message).toBe('Critical failure');
      expect(entries[1].unit).toBe('kernel');
    });

    it('should handle custom time range', async () => {
      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'journalctl',
        stdout: '',
        stderr: '',
        code: 0,
      });

      await service.getJournalErrors(120);

      expect(vi.mocked(mockRunner.run)).toHaveBeenCalledWith(
        expect.stringContaining('120 minutes ago'),
        expect.anything()
      );
    });

    it('should skip invalid JSON lines', async () => {
      const journalOutput =
        '{"MESSAGE":"Valid entry","PRIORITY":"3","__REALTIME_TIMESTAMP":"1700000000000000"}\n' +
        'invalid json line\n' +
        '{"MESSAGE":"Another valid entry","PRIORITY":"2","__REALTIME_TIMESTAMP":"1700000001000000"}';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'journalctl',
        stdout: journalOutput,
        stderr: '',
        code: 0,
      });

      const entries = await service.getJournalErrors();

      expect(entries.length).toBe(2);
      expect(entries[0].message).toBe('Valid entry');
      expect(entries[1].message).toBe('Another valid entry');
    });

    it('should return empty array when journalctl fails', async () => {
      vi.mocked(mockRunner.run).mockRejectedValue(new Error('journalctl not available'));

      const entries = await service.getJournalErrors();

      expect(entries).toEqual([]);
    });

    it('should use SYSLOG_IDENTIFIER when _SYSTEMD_UNIT not present', async () => {
      const journalOutput =
        '{"MESSAGE":"Log entry","PRIORITY":"3","SYSLOG_IDENTIFIER":"custom-app","__REALTIME_TIMESTAMP":"1700000000000000"}';

      vi.mocked(mockRunner.run).mockResolvedValue({
        command: 'journalctl',
        stdout: journalOutput,
        stderr: '',
        code: 0,
      });

      const entries = await service.getJournalErrors();

      expect(entries[0].unit).toBe('custom-app');
    });
  });

  describe('getServiceStatus', () => {
    it('should return service status when active and enabled', async () => {
      vi.mocked(mockRunner.run).mockImplementation(async (command: string) => {
        if (command.includes('is-active')) {
          return { command, stdout: 'active\n', stderr: '', code: 0 };
        }
        if (command.includes('is-enabled')) {
          return { command, stdout: 'enabled\n', stderr: '', code: 0 };
        }
        return {
          command,
          stdout: '● test.service - Test Service\n   Active: active (running)',
          stderr: '',
          code: 0,
        };
      });

      const status = await service.getServiceStatus('nginx');

      expect(status.active).toBe(true);
      expect(status.running).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.status).toContain('Active: active');
    });

    it('should return inactive status when service is stopped', async () => {
      vi.mocked(mockRunner.run).mockImplementation(async (command: string) => {
        if (command.includes('is-active')) {
          return { command, stdout: 'inactive\n', stderr: '', code: 3 };
        }
        if (command.includes('is-enabled')) {
          return { command, stdout: 'disabled\n', stderr: '', code: 1 };
        }
        return {
          command,
          stdout: '● test.service - Test Service\n   Active: inactive (dead)',
          stderr: '',
          code: 0,
        };
      });

      const status = await service.getServiceStatus('nginx');

      expect(status.active).toBe(false);
      expect(status.running).toBe(false);
      expect(status.enabled).toBe(false);
    });

    it('should reject invalid service names', async () => {
      await expect(service.getServiceStatus('../../../etc/passwd')).rejects.toThrow(
        'Invalid service name'
      );
    });

    it('should return unknown status on error', async () => {
      vi.mocked(mockRunner.run).mockRejectedValue(new Error('Command failed'));

      const status = await service.getServiceStatus('nginx');

      expect(status.active).toBe(false);
      expect(status.running).toBe(false);
      expect(status.enabled).toBe(false);
      expect(status.status).toBe('unknown');
    });
  });
});
