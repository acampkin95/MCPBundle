import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandRunner } from '../utils/commandRunner.js';
import { shellQuote } from '../utils/shell.js';

export interface PacketCaptureOptions {
  readonly interface?: string;
  readonly durationSeconds?: number;
  readonly filterExpression?: string;
  readonly outputDirectory?: string;
}

export interface PacketCaptureResult {
  readonly command: string;
  readonly outputPath: string;
}

export class PacketCaptureService {
  public constructor(private readonly runner: CommandRunner) {}

  public async capture(options: PacketCaptureOptions = {}): Promise<PacketCaptureResult> {
    const iface = options.interface ?? 'en0';
    const duration = Math.max(5, options.durationSeconds ?? 30);
    const filterExpression = options.filterExpression?.trim();

    const outputDirectory =
      options.outputDirectory ?? process.env.IT_MCP_CAPTURE_DIR ?? join(process.cwd(), 'captures');

    await mkdir(outputDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = join(outputDirectory, `capture-${iface}-${timestamp}.pcap`);

    const commandParts = [
      'tcpdump',
      '-i',
      shellQuote(iface),
      '-G',
      String(duration),
      '-W',
      '1',
      '-w',
      shellQuote(outputPath),
    ];

    if (filterExpression) {
      commandParts.push(filterExpression);
    }

    const command = commandParts.join(' ');

    await this.runner.run(command, { requiresSudo: true });

    return {
      command,
      outputPath,
    };
  }
}
