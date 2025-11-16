/**
 * Unit tests for DatabaseDiagnosticsService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseDiagnosticsService } from '../../../src/services/databaseDiagnostics.js';
import type { CommandRunner, CommandResult } from '../../../src/utils/commandRunner.js';

describe('DatabaseDiagnosticsService', () => {
  let service: DatabaseDiagnosticsService;
  let mockRunner: CommandRunner;

  beforeEach(() => {
    mockRunner = {
      run: vi.fn(),
    } as unknown as CommandRunner;

    service = new DatabaseDiagnosticsService(mockRunner);
  });

  describe('listSuites', () => {
    it('should return all available diagnostic suites', () => {
      const suites = service.listSuites();

      expect(suites).toContain('postgres');
      expect(suites).toContain('redis');
      expect(suites).toContain('nginx');
      expect(suites).toContain('keycloak');
      expect(suites).toContain('firewall');
      expect(suites).toContain('system');
      expect(suites.length).toBe(6);
    });
  });

  describe('runLocal', () => {
    it('should run postgres diagnostic suite', async () => {
      const mockResult: CommandResult = {
        command: 'systemctl status postgresql',
        stdout: '● postgresql.service - PostgreSQL RDBMS\n   Active: active (running)',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['postgres']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain('PostgreSQL');
      expect(results[0].stdout).toContain('Active: active');
      expect(results[0].exitCode).toBe(0);
    });

    it('should run redis diagnostic suite', async () => {
      const mockResult: CommandResult = {
        command: 'systemctl status redis-server',
        stdout: '● redis-server.service - Advanced key-value store\n   Active: active (running)',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['redis']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain('Redis');
    });

    it('should run nginx diagnostic suite', async () => {
      const mockResult: CommandResult = {
        command: 'systemctl status nginx',
        stdout: '● nginx.service - A high performance web server\n   Active: active (running)',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['nginx']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain('Nginx');
    });

    it('should run keycloak diagnostic suite', async () => {
      const mockResult: CommandResult = {
        command: 'docker ps --format table',
        stdout: 'NAMES\tSTATUS\tPORTS\nauth\tUp 5 hours\t8080->8080',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['keycloak']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain('Docker');
    });

    it('should run firewall diagnostic suite', async () => {
      const mockResult: CommandResult = {
        command: 'ufw status numbered',
        stdout: 'Status: active\n\n     To                         Action      From',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['firewall']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain('UFW');
    });

    it('should run system diagnostic suite', async () => {
      const mockResult: CommandResult = {
        command: 'uptime',
        stdout: ' 12:34:56 up 5 days,  3:21,  2 users,  load average: 0.15, 0.10, 0.08',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['system']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toContain('System');
    });

    it('should run multiple diagnostic suites', async () => {
      const mockResult: CommandResult = {
        command: 'test',
        stdout: 'test output',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['postgres', 'redis', 'system']);

      // postgres: 3 commands, redis: 2 commands, system: 3 commands = 8 total
      expect(results.length).toBeGreaterThanOrEqual(8);
    });

    it('should deduplicate suite names', async () => {
      const mockResult: CommandResult = {
        command: 'test',
        stdout: 'test output',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['system', 'system', 'system']);

      // Should only run system suite once (3 commands)
      expect(results.length).toBe(3);
    });

    it('should include command details in results', async () => {
      const mockResult: CommandResult = {
        command: 'uptime',
        stdout: 'uptime output',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['system']);

      const uptimeResult = results.find((r) => r.label === 'System load');
      expect(uptimeResult).toBeDefined();
      expect(uptimeResult!.command).toBe('uptime');
      expect(uptimeResult!.stdout).toBe('uptime output');
      expect(uptimeResult!.stderr).toBe('');
      expect(uptimeResult!.exitCode).toBe(0);
    });

    it('should handle command failures gracefully', async () => {
      const mockResult: CommandResult = {
        command: 'systemctl status postgresql',
        stdout: '',
        stderr: 'Unit postgresql.service could not be found.',
        code: 4,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      const results = await service.runLocal(['postgres']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].exitCode).toBe(4);
      expect(results[0].stderr).toContain('could not be found');
    });

    it('should pass requiresSudo flag to runner', async () => {
      const mockResult: CommandResult = {
        command: 'systemctl status postgresql',
        stdout: 'output',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      await service.runLocal(['postgres']);

      // PostgreSQL service command requires sudo
      expect(vi.mocked(mockRunner.run)).toHaveBeenCalledWith(
        expect.stringContaining('systemctl status postgresql'),
        expect.objectContaining({ requiresSudo: true })
      );
    });

    it('should run commands that do not require sudo', async () => {
      const mockResult: CommandResult = {
        command: 'uptime',
        stdout: 'uptime output',
        stderr: '',
        code: 0,
      };

      vi.mocked(mockRunner.run).mockResolvedValue(mockResult);

      await service.runLocal(['system']);

      // uptime command does not require sudo
      const uptimeCalls = vi
        .mocked(mockRunner.run)
        .mock.calls.filter((call) => call[0] === 'uptime');
      expect(uptimeCalls.length).toBe(1);
      expect(uptimeCalls[0][1]).toEqual({ requiresSudo: false });
    });

    it('should run all commands sequentially', async () => {
      let callCount = 0;
      vi.mocked(mockRunner.run).mockImplementation(async () => {
        callCount++;
        return {
          command: `command-${callCount}`,
          stdout: `output-${callCount}`,
          stderr: '',
          code: 0,
        };
      });

      const results = await service.runLocal(['system']);

      expect(results.length).toBe(3); // system has 3 commands
      expect(results[0].stdout).toBe('output-1');
      expect(results[1].stdout).toBe('output-2');
      expect(results[2].stdout).toBe('output-3');
    });

    it('should handle empty suite list', async () => {
      const results = await service.runLocal([]);

      expect(results).toEqual([]);
      expect(vi.mocked(mockRunner.run)).not.toHaveBeenCalled();
    });
  });
});
