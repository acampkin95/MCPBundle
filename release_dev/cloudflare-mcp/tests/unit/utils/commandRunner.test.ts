/**
 * Unit tests for CommandRunner
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRunner, CommandExecutionError } from '../../../src/utils/commandRunner.js';
import { exec } from 'node:child_process';

// Mock node:child_process - include execFile for other services that use it
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

describe('CommandRunner', () => {
  let runner: CommandRunner;
  const mockExec = vi.mocked(exec);

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new CommandRunner(true); // allowSudo = true
  });

  describe('run', () => {
    it('should execute a simple command successfully', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'test output', stderr: '' });
      }) as any);

      const result = await runner.run('echo test');

      expect(result.command).toBe('echo test');
      expect(result.stdout).toBe('test output');
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    });

    it('should prepend sudo when requiresSudo is true and allowSudo is true', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'success', stderr: '' });
      }) as any);

      const result = await runner.run('systemctl status nginx', { requiresSudo: true });

      expect(result.command).toBe('sudo systemctl status nginx');
      expect(mockExec).toHaveBeenCalledWith(
        'sudo systemctl status nginx',
        expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 }),
        expect.any(Function)
      );
    });

    it('should not prepend sudo when allowSudo is false', async () => {
      const noSudoRunner = new CommandRunner(false);
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'output', stderr: '' });
      }) as any);

      const result = await noSudoRunner.run('systemctl status nginx', { requiresSudo: true });

      expect(result.command).toBe('systemctl status nginx');
    });

    it('should handle command with stderr output', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: '', stderr: 'warning message' });
      }) as any);

      const result = await runner.run('some-command');

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('warning message');
      expect(result.code).toBe(0);
    });

    it('should return empty output for dry run', async () => {
      const result = await runner.run('rm -rf /', { dryRun: true });

      expect(result.command).toBe('rm -rf /');
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.code).toBeNull();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should apply timeout option', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'output', stderr: '' });
      }) as any);

      await runner.run('long-running-command', { timeoutMs: 5000 });

      expect(mockExec).toHaveBeenCalledWith(
        'long-running-command',
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function)
      );
    });

    it('should apply custom environment variables', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'output', stderr: '' });
      }) as any);

      const customEnv = { PATH: '/custom/path', MY_VAR: 'test' };
      await runner.run('env', { env: customEnv });

      expect(mockExec).toHaveBeenCalledWith(
        'env',
        expect.objectContaining({ env: customEnv }),
        expect.any(Function)
      );
    });

    it('should apply custom working directory', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'output', stderr: '' });
      }) as any);

      await runner.run('ls', { cwd: '/tmp' });

      expect(mockExec).toHaveBeenCalledWith(
        'ls',
        expect.objectContaining({ cwd: '/tmp' }),
        expect.any(Function)
      );
    });

    it('should throw CommandExecutionError on command failure', async () => {
      const execError = new Error('Command failed') as any;
      execError.code = 1;
      execError.stdout = '';
      execError.stderr = 'command not found';

      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(execError);
      }) as any);

      await expect(runner.run('nonexistent-command')).rejects.toThrow(CommandExecutionError);
    });

    it('should include exit code in error result', async () => {
      const execError = new Error('Command failed') as any;
      execError.code = 127;
      execError.stdout = '';
      execError.stderr = 'command not found';

      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(execError);
      }) as any);

      try {
        await runner.run('bad-command');
        expect.fail('Should have thrown CommandExecutionError');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandExecutionError);
        const cmdError = error as CommandExecutionError;
        expect(cmdError.result.code).toBe(127);
        expect(cmdError.result.stderr).toBe('command not found');
      }
    });

    it('should handle errors with stdout and stderr', async () => {
      const execError = new Error('Command failed') as any;
      execError.code = 1;
      execError.stdout = 'partial output';
      execError.stderr = 'error details';

      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(execError);
      }) as any);

      try {
        await runner.run('failing-command');
        expect.fail('Should have thrown');
      } catch (error) {
        const cmdError = error as CommandExecutionError;
        expect(cmdError.result.stdout).toBe('partial output');
        expect(cmdError.result.stderr).toBe('error details');
      }
    });

    it('should handle errors without exit code', async () => {
      const execError = new Error('Timeout') as any;
      execError.stdout = '';
      // Don't set stderr - let it be undefined so implementation uses error.message

      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(execError);
      }) as any);

      try {
        await runner.run('timeout-command');
        expect.fail('Should have thrown');
      } catch (error) {
        const cmdError = error as CommandExecutionError;
        expect(cmdError.result.code).toBeNull();
        // When stderr is undefined, implementation uses error.message
        expect(cmdError.result.stderr).toBe('Timeout');
      }
    });

    it('should use maxBuffer of 10MB', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'output', stderr: '' });
      }) as any);

      await runner.run('command-with-large-output');

      expect(mockExec).toHaveBeenCalledWith(
        'command-with-large-output',
        expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 }),
        expect.any(Function)
      );
    });

    it('should combine sudo with custom environment and timeout', async () => {
      mockExec.mockImplementation(((command: string, options: any, callback: Function) => {
        callback(null, { stdout: 'output', stderr: '' });
      }) as any);

      const customEnv = { PATH: '/custom/path' };
      await runner.run('systemctl restart nginx', {
        requiresSudo: true,
        timeoutMs: 30000,
        env: customEnv,
        cwd: '/tmp',
      });

      expect(mockExec).toHaveBeenCalledWith(
        'sudo systemctl restart nginx',
        expect.objectContaining({
          timeout: 30000,
          env: customEnv,
          cwd: '/tmp',
          maxBuffer: 10 * 1024 * 1024,
        }),
        expect.any(Function)
      );
    });

    it('should handle dry run with sudo flag', async () => {
      const result = await runner.run('systemctl restart nginx', {
        requiresSudo: true,
        dryRun: true,
      });

      expect(result.command).toBe('sudo systemctl restart nginx');
      expect(result.code).toBeNull();
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('CommandExecutionError', () => {
    it('should store command result', () => {
      const result = {
        command: 'test command',
        stdout: 'output',
        stderr: 'error',
        code: 1,
      };

      const error = new CommandExecutionError('Test error', result);

      expect(error.name).toBe('CommandExecutionError');
      expect(error.message).toBe('Test error');
      expect(error.result).toEqual(result);
    });
  });
});
