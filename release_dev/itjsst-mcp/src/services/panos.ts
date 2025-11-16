import { SshService, type SshExecutionOptions } from './ssh.js';
import type { CommandResult } from '../utils/commandRunner.js';

export interface PanOsSshOptions extends SshExecutionOptions {
  readonly host: string;
  readonly username: string;
  readonly command?: string;
  readonly preset?: PanOsPreset;
}

export type PanOsPreset =
  | 'system-info'
  | 'session-summary'
  | 'routing'
  | 'interface-stats'
  | 'threat-log'
  | 'global-counters'
  | 'ha-status';

const PRESET_COMMANDS: Record<PanOsPreset, string> = {
  'system-info': 'show system info',
  'session-summary': 'show session info',
  routing: 'show routing route',
  'interface-stats': 'show interface ethernet1/1',
  'threat-log': 'show log threat direction equal backward count 20',
  'global-counters': 'show counter global filter delta yes severity drop',
  'ha-status': 'show high-availability state',
};

export class PanOsService {
  public constructor(private readonly ssh: SshService) {}

  public async execute(options: PanOsSshOptions): Promise<CommandResult> {
    const command =
      options.command ?? (options.preset ? PRESET_COMMANDS[options.preset] : undefined);
    if (!command) {
      throw new Error("Pan-OS execution requires either 'command' or 'preset'.");
    }

    return this.ssh.execute(
      {
        host: options.host,
        username: options.username,
        command,
      },
      options
    );
  }

  public listPresets(): Array<{ preset: PanOsPreset; description: string }> {
    return [
      { preset: 'system-info', description: 'Display firmware version, model, and uptime.' },
      { preset: 'session-summary', description: 'Summarise active sessions and utilisation.' },
      { preset: 'routing', description: 'Show routing table entries.' },
      {
        preset: 'interface-stats',
        description: 'Inspect interface statistics (adjust interface name as needed).',
      },
      { preset: 'threat-log', description: 'Retrieve the most recent threat log entries.' },
      { preset: 'global-counters', description: 'View packet drop counters and severity.' },
      { preset: 'ha-status', description: 'Check high-availability state and peer health.' },
    ];
  }
}
