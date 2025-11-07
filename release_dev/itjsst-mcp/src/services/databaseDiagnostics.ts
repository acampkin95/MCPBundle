import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";
import { SshService, type SshExecutionOptions } from "./ssh.js";

export type DatabaseDiagnosticSuite =
  | "postgres"
  | "redis"
  | "nginx"
  | "keycloak"
  | "firewall"
  | "system";

export interface DiagnosticCommand {
  readonly label: string;
  readonly command: string;
  readonly requiresSudo?: boolean;
}

export interface DiagnosticResult {
  readonly label: string;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface RemoteDatabaseOptions extends SshExecutionOptions {
  readonly host: string;
  readonly username: string;
}

const SUITE_DEFINITIONS: Record<DatabaseDiagnosticSuite, DiagnosticCommand[]> = {
  postgres: [
    {
      label: "PostgreSQL service",
      command: "systemctl status postgresql",
      requiresSudo: true,
    },
    {
      label: "PostgreSQL activity",
      command:
        "sudo -u postgres psql -d postgres -c \"SELECT state, count(*) FROM pg_stat_activity GROUP BY state;\"",
      requiresSudo: true,
    },
    {
      label: "Replication status",
      command:
        "sudo -u postgres psql -d postgres -c \"SELECT application_name, state, sync_state, sent_lsn, write_lsn FROM pg_stat_replication;\"",
      requiresSudo: true,
    },
  ],
  redis: [
    {
      label: "Redis service",
      command: "systemctl status redis-server",
      requiresSudo: true,
    },
    {
      label: "Redis info",
      command: "redis-cli INFO replication | head -n 20",
    },
  ],
  nginx: [
    {
      label: "Nginx service",
      command: "systemctl status nginx",
      requiresSudo: true,
    },
    {
      label: "Nginx test config",
      command: "nginx -t",
      requiresSudo: true,
    },
  ],
  keycloak: [
    {
      label: "Docker containers",
      command: "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    },
    {
      label: "Keycloak log tail",
      command: "docker logs --tail 100 auth",
    },
  ],
  firewall: [
    {
      label: "UFW status",
      command: "ufw status numbered",
      requiresSudo: true,
    },
    {
      label: "Fail2Ban status",
      command: "fail2ban-client status",
      requiresSudo: true,
    },
  ],
  system: [
    {
      label: "System load",
      command: "uptime",
    },
    {
      label: "Disk usage",
      command: "df -h",
    },
    {
      label: "Memory usage",
      command: "free -h",
    },
  ],
};

export class DatabaseDiagnosticsService {
  public constructor(private readonly runner: CommandRunner, private readonly ssh: SshService) {}

  public listSuites(): DatabaseDiagnosticSuite[] {
    return Object.keys(SUITE_DEFINITIONS) as DatabaseDiagnosticSuite[];
  }

  public async runLocal(suites: DatabaseDiagnosticSuite[]): Promise<DiagnosticResult[]> {
    const uniqueSuites = new Set(suites);
    const commands = Array.from(uniqueSuites).flatMap((suite) => SUITE_DEFINITIONS[suite]);
    return this.runLocalCommands(commands);
  }

  public async runRemote(options: RemoteDatabaseOptions & { suites: DatabaseDiagnosticSuite[] }): Promise<DiagnosticResult[]> {
    const uniqueSuites = new Set(options.suites);
    const commands = Array.from(uniqueSuites).flatMap((suite) => SUITE_DEFINITIONS[suite]);
    return this.runRemoteCommands(options, commands);
  }

  private async runLocalCommands(commands: DiagnosticCommand[]): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];
    for (const command of commands) {
      const output = await this.runner.run(command.command, { requiresSudo: command.requiresSudo ?? false });
      results.push(this.format(command.label, output));
    }
    return results;
  }

  private async runRemoteCommands(options: RemoteDatabaseOptions, commands: DiagnosticCommand[]): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];
    const sshOptions: SshExecutionOptions = {
      port: options.port,
      identityFile: options.identityFile,
      knownHostsFile: options.knownHostsFile,
      extraOptions: options.extraOptions,
      allocateTty: options.allocateTty,
      timeoutSeconds: options.timeoutSeconds,
    };

    for (const command of commands) {
      const remoteCommand = command.requiresSudo ? `sudo ${command.command}` : command.command;
      const output = await this.ssh.execute(
        {
          host: options.host,
          username: options.username,
          command: remoteCommand,
        },
        sshOptions,
      );
      results.push(this.format(command.label, output));
    }
    return results;
  }

  private format(label: string, result: CommandResult): DiagnosticResult {
    return {
      label,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
    };
  }
}
