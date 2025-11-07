import { CommandExecutionError, CommandRunner } from "../utils/commandRunner.js";

export interface DockerContainerSummary {
  readonly name: string;
  readonly status: string;
}

export interface DockerDesktopStatus {
  readonly cliAvailable: boolean;
  readonly info?: Record<string, unknown>;
  readonly containers?: readonly DockerContainerSummary[];
  readonly error?: string;
}

export class DockerDesktopService {
  public constructor(private readonly runner: CommandRunner) {}

  public async getStatus(): Promise<DockerDesktopStatus> {
    const available = await this.hasDocker();
    if (!available) {
      return {
        cliAvailable: false,
        error: "Docker CLI not found in PATH",
      };
    }

    try {
      const infoRaw = await this.runner.run("docker info --format '{{json .}}'");
      const info = this.safeParse(infoRaw.stdout);
      const containers = await this.listContainers();

      return {
        cliAvailable: true,
        info,
        containers,
      };
    } catch (error) {
      return {
        cliAvailable: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async hasDocker(): Promise<boolean> {
    try {
      await this.runner.run("command -v docker");
      return true;
    } catch {
      return false;
    }
  }

  private async listContainers(): Promise<DockerContainerSummary[]> {
    try {
      const result = await this.runner.run("docker ps --format '{{.Names}}|{{.Status}}'");
      return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, status] = line.split("|");
          return {
            name: name ?? "unknown",
            status: status ?? "unknown",
          };
        });
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return [];
      }
      return [];
    }
  }

  private safeParse(payload: string): Record<string, unknown> | undefined {
    const trimmed = payload.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}
