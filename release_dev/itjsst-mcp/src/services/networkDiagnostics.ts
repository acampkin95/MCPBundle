import { CommandExecutionError, CommandRunner } from "../utils/commandRunner.js";
import { shellQuote } from "../utils/shell.js";

export interface PortScanResult {
  readonly command: string;
  readonly host: string;
  readonly port: number;
  readonly protocol: "tcp" | "udp";
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface FirewallDiagnostics {
  readonly pfctl?: {
    readonly command: string;
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
  };
  readonly socketFilter?: {
    readonly command: string;
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
  };
  readonly applicationFirewall?: {
    readonly command: string;
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
  };
}

export class NetworkDiagnosticsService {
  public constructor(private readonly runner: CommandRunner) {}

  public async scanTcpPorts(
    host: string,
    ports: number[],
    timeoutSeconds: number = 3,
  ): Promise<PortScanResult[]> {
    return this.runNcScans(host, ports, timeoutSeconds, false);
  }

  public async scanUdpPorts(
    host: string,
    ports: number[],
    timeoutSeconds: number = 3,
  ): Promise<PortScanResult[]> {
    return this.runNcScans(host, ports, timeoutSeconds, true);
  }

  public async runNmap(
    host: string,
    ports: number[],
    protocol: "tcp" | "udp",
  ): Promise<PortScanResult | undefined> {
    const check = await this.hasBinary("nmap");
    if (!check) {
      return undefined;
    }

    const portList = ports.join(",");
    const args = protocol === "udp" ? "-sU" : "-sT";
    const command = ["nmap", args, "-p", portList, shellQuote(host)].join(" ");
    try {
      const result = await this.runner.run(command);
      return {
        command,
        host,
        port: 0,
        protocol,
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error) {
      const execution =
        error instanceof CommandExecutionError ? error.result : undefined;
      return execution
        ? {
            command,
            host,
            port: 0,
            protocol,
            success: false,
            stdout: execution.stdout,
            stderr: execution.stderr,
            exitCode: execution.code,
          }
        : undefined;
    }
  }

  public async firewallDiagnostics(): Promise<FirewallDiagnostics> {
    const pfctl = await this.safeCommand("pfctl -sr", true);
    const socketFilter = await this.safeCommand(
      "/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate",
      true,
    );
    const applicationFirewall = await this.safeCommand(
      "defaults read /Library/Preferences/com.apple.alf globalstate",
      true,
    );

    return {
      pfctl,
      socketFilter,
      applicationFirewall,
    };
  }

  private async runNcScans(
    host: string,
    ports: number[],
    timeoutSeconds: number,
    isUdp: boolean,
  ): Promise<PortScanResult[]> {
    const results: PortScanResult[] = [];
    for (const port of ports) {
      const parts: string[] = ["nc", "-zv", "-G", String(timeoutSeconds)];
      if (isUdp) {
        parts.push("-u");
      }
      parts.push(shellQuote(host), String(port));

      const command = parts.join(" ");
      try {
        const result = await this.runner.run(command);
        results.push({
          command,
          host,
          port,
          protocol: isUdp ? "udp" : "tcp",
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.code,
        });
      } catch (error) {
        const execution =
          error instanceof CommandExecutionError ? error.result : undefined;
        results.push({
          command,
          host,
          port,
          protocol: isUdp ? "udp" : "tcp",
          success: false,
          stdout: execution?.stdout ?? "",
          stderr: execution?.stderr ?? (error instanceof Error ? error.message : String(error)),
          exitCode: execution?.code ?? null,
        });
      }
    }

    return results;
  }

  private async hasBinary(binary: string): Promise<boolean> {
    try {
      await this.runner.run(`command -v ${shellQuote(binary)}`);
      return true;
    } catch {
      return false;
    }
  }

  private async safeCommand(command: string, requiresSudo: boolean): Promise<{
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }> {
    try {
      const result = await this.runner.run(command, { requiresSudo });
      return {
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
      };
    } catch (error) {
      const execution =
        error instanceof CommandExecutionError ? error.result : undefined;
      return {
        command,
        stdout: execution?.stdout ?? "",
        stderr: execution?.stderr ?? (error instanceof Error ? error.message : String(error)),
        exitCode: execution?.code ?? null,
      };
    }
  }
}
