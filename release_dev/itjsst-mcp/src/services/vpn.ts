import {
  CommandExecutionError,
  CommandRunner,
  type CommandResult,
} from '../utils/commandRunner.js';

export interface VpnDiagnostics {
  readonly scutilList: CommandResult;
  readonly netInterfaces: CommandResult;
  readonly routes: CommandResult;
  readonly wifiInfo?: CommandResult;
  readonly runningProcesses: CommandResult;
}

export class VpnService {
  public constructor(private readonly runner: CommandRunner) {}

  public async collectDiagnostics(includeWifi: boolean = true): Promise<VpnDiagnostics> {
    const [scutilList, netInterfaces, routes, runningProcesses] = await Promise.all([
      this.runner.run('scutil --nc list'),
      this.runner.run('ifconfig'),
      this.runner.run('netstat -rn'),
      this.runner.run("pgrep -fl '(vpn|pppd|wireguard|openvpn|globalprotect|anyconnect)'"),
    ]);

    let wifiInfo: CommandResult | undefined;
    if (includeWifi) {
      try {
        wifiInfo = await this.runner.run('system_profiler SPAirPortDataType');
      } catch (error) {
        const fallback = error instanceof CommandExecutionError ? error.result : undefined;

        wifiInfo = fallback ?? {
          command: 'system_profiler SPAirPortDataType',
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          code: null,
        };
      }
    }

    return {
      scutilList,
      netInterfaces,
      routes,
      wifiInfo,
      runningProcesses,
    };
  }
}
