import { CommandRunner, type CommandResult } from '../utils/commandRunner.js';

export interface WirelessStatusOptions {
  readonly interfaceName?: string;
}

export interface WirelessScanOptions {
  readonly interfaceName?: string;
}

export interface WirelessLogOptions {
  readonly minutes?: number;
}

export interface WirelessPingOptions {
  readonly host: string;
  readonly count?: number;
  readonly intervalSeconds?: number;
}

export class WirelessDiagnosticsService {
  private static readonly AIRPORT_BINARY =
    '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';

  public constructor(private readonly runner: CommandRunner) {}

  public currentStatus(options: WirelessStatusOptions = {}): Promise<CommandResult> {
    const iface = options.interfaceName ? ` ${options.interfaceName}` : '';
    return this.runner.run(`${WirelessDiagnosticsService.AIRPORT_BINARY} -I${iface}`, {
      requiresSudo: true,
    });
  }

  public scanNetworks(options: WirelessScanOptions = {}): Promise<CommandResult> {
    const iface = options.interfaceName ? ` ${options.interfaceName}` : '';
    return this.runner.run(`${WirelessDiagnosticsService.AIRPORT_BINARY} -s${iface}`, {
      requiresSudo: true,
    });
  }

  public listPreferredNetworks(interfaceName: string): Promise<CommandResult> {
    return this.runner.run(`networksetup -listpreferredwirelessnetworks ${interfaceName}`);
  }

  public airportPreferences(): Promise<CommandResult> {
    return this.runner.run(
      'defaults read /Library/Preferences/SystemConfiguration/com.apple.airport.preferences'
    );
  }

  public environmentReport(): Promise<CommandResult> {
    return this.runner.run('system_profiler SPAirPortDataType');
  }

  public performanceSummary(): Promise<CommandResult> {
    return this.runner.run('networkQuality -s');
  }

  public wifiLogs(options: WirelessLogOptions = {}): Promise<CommandResult> {
    const minutes = Math.max(1, Math.min(1440, options.minutes ?? 10));
    const predicate = '\'subsystem == "com.apple.wifi"\'';
    return this.runner.run(`log show --style syslog --predicate ${predicate} --last ${minutes}m`, {
      requiresSudo: true,
    });
  }

  public pingHost(options: WirelessPingOptions): Promise<CommandResult> {
    const count = Math.max(1, Math.min(20, options.count ?? 5));
    const interval = Math.max(0.1, Math.min(5, options.intervalSeconds ?? 0.2));
    return this.runner.run(`ping -c ${count} -i ${interval} ${options.host}`);
  }
}
