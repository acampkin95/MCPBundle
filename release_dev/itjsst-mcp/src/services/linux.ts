import { CommandExecutionError } from '../utils/commandRunner.js';
import { SshService, type SshExecutionOptions } from './ssh.js';

export interface RemoteHostConfig extends SshExecutionOptions {
  readonly host: string;
  readonly username?: string;
  readonly port?: number;
  readonly identityFile?: string;
}

export interface RemoteCommandResult {
  readonly name: string;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface LinuxHealthReport {
  readonly target: {
    readonly host: string;
    readonly username?: string;
  };
  readonly checks: RemoteCommandResult[];
}

export class LinuxRemoteService {
  public constructor(private readonly ssh: SshService) {}

  public async collectUbuntuHealth(config: RemoteHostConfig): Promise<LinuxHealthReport> {
    return this.collectHealth(config, [
      {
        name: 'Distribution',
        command: 'lsb_release -a',
      },
      {
        name: 'Kernel',
        command: 'uname -a',
      },
      {
        name: 'Uptime',
        command: 'uptime',
      },
      {
        name: 'Disk Usage',
        command: 'df -h',
      },
      {
        name: 'Package Upgrades',
        command: 'apt list --upgradable',
      },
      {
        name: 'Services Failed',
        command: 'systemctl --failed',
      },
    ]);
  }

  public async collectDebianHealth(config: RemoteHostConfig): Promise<LinuxHealthReport> {
    return this.collectHealth(config, [
      {
        name: 'Distribution',
        command: 'cat /etc/debian_version',
      },
      {
        name: 'Kernel',
        command: 'uname -a',
      },
      {
        name: 'Uptime',
        command: 'uptime',
      },
      {
        name: 'Disk Usage',
        command: 'df -h',
      },
      {
        name: 'APT Pending Upgrades',
        command: 'apt list --upgradable',
      },
      {
        name: 'Services Failed',
        command: 'systemctl --failed',
      },
    ]);
  }

  private async collectHealth(
    config: RemoteHostConfig,
    commands: Array<{ name: string; command: string }>
  ): Promise<LinuxHealthReport> {
    const options: SshExecutionOptions = {
      port: config.port,
      identityFile: config.identityFile,
      knownHostsFile: config.knownHostsFile,
      extraOptions: config.extraOptions,
      allocateTty: false,
      timeoutSeconds: config.timeoutSeconds,
      env: config.env,
    };

    const checks: RemoteCommandResult[] = [];

    for (const item of commands) {
      try {
        const result = await this.ssh.execute(
          {
            host: config.host,
            username: config.username,
            command: item.command,
          },
          options
        );

        checks.push({
          name: item.name,
          command: result.command,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
          exitCode: result.code,
        });
      } catch (error) {
        if (error instanceof CommandExecutionError) {
          checks.push({
            name: item.name,
            command: error.result.command,
            stdout: error.result.stdout.trim(),
            stderr: error.result.stderr.trim(),
            exitCode: error.result.code,
          });
        } else {
          checks.push({
            name: item.name,
            command: item.command,
            stdout: '',
            stderr: error instanceof Error ? error.message : String(error),
            exitCode: null,
          });
        }
      }
    }

    return {
      target: {
        host: config.host,
        username: config.username,
      },
      checks,
    };
  }
}
