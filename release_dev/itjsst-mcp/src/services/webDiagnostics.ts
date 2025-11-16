import { CommandExecutionError, CommandRunner } from '../utils/commandRunner.js';
import { shellQuote } from '../utils/shell.js';

export interface EndpointMetrics {
  readonly httpCode: number | null;
  readonly timeTotal: number | null;
  readonly timeConnect: number | null;
  readonly timeStartTransfer: number | null;
  readonly sizeDownload: number | null;
  readonly rawOutput: string;
}

export interface CurlOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeoutSeconds?: number;
}

export interface LighthouseSummary {
  readonly command: string;
  readonly scores?: Record<string, number>;
  readonly rawJson?: string;
  readonly error?: string;
}

export class WebDiagnosticsService {
  public constructor(private readonly runner: CommandRunner) {}

  public async checkProcesses(): Promise<{
    readonly nginx: string;
    readonly apache: string;
    readonly node: string;
  }> {
    const [nginx, apache, node] = await Promise.all([
      this.runPgrep('nginx'),
      this.runPgrep('httpd|apache2'),
      this.runPgrep('node|next|nuxt'),
    ]);

    return {
      nginx,
      apache,
      node,
    };
  }

  public async fetchHeaders(url: string, timeoutSeconds?: number) {
    const command = [
      'curl',
      '-sI',
      '--max-time',
      String(timeoutSeconds ?? 10),
      shellQuote(url),
    ].join(' ');

    return this.runner.run(command);
  }

  public async testEndpoint(url: string, options: CurlOptions = {}): Promise<EndpointMetrics> {
    const { method = 'GET', headers = {}, body, timeoutSeconds } = options;
    const parts: string[] = [
      'curl',
      '-s',
      '-o',
      '/dev/null',
      '-w',
      shellQuote(
        'http_code:%{http_code}\\ntime_total:%{time_total}\\ntime_connect:%{time_connect}\\ntime_starttransfer:%{time_starttransfer}\\nsize_download:%{size_download}'
      ),
      '-X',
      shellQuote(method),
    ];

    if (timeoutSeconds) {
      parts.push('--max-time', String(timeoutSeconds));
    }

    for (const [key, value] of Object.entries(headers)) {
      parts.push('-H', shellQuote(`${key}: ${value}`));
    }

    if (body) {
      parts.push('--data', shellQuote(body));
    }

    parts.push(shellQuote(url));

    const command = parts.join(' ');
    const result = await this.runner.run(command);
    return this.parseCurlMetrics(result.stdout.trim());
  }

  public async runLighthouse(
    url: string,
    categories: string[] = ['performance']
  ): Promise<LighthouseSummary> {
    try {
      await this.runner.run('command -v lighthouse');
    } catch (error) {
      return {
        command: 'command -v lighthouse',
        error:
          'Lighthouse CLI not found. Install via `npm install -g lighthouse` or provide a path.',
      };
    }

    const categoryFlags = categories.flatMap((category) => [
      '--only-categories',
      shellQuote(category),
    ]);

    const command = [
      'lighthouse',
      shellQuote(url),
      '--quiet',
      '--chrome-flags="--headless"',
      '--output=json',
      '--output-path=-',
      ...categoryFlags,
    ].join(' ');

    try {
      const result = await this.runner.run(command);
      const raw = result.stdout.trim();
      const summary = this.extractLighthouseScores(raw);

      return {
        command,
        scores: summary,
        rawJson: raw,
      };
    } catch (error) {
      const commandError =
        error instanceof CommandExecutionError ? error.result.stderr : String(error);

      return {
        command,
        error: commandError || 'Lighthouse command failed.',
      };
    }
  }

  private async runPgrep(pattern: string): Promise<string> {
    const command = `pgrep -fl ${shellQuote(pattern)}`;
    try {
      const result = await this.runner.run(command);
      return result.stdout.trim();
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return error.result.stderr.trim() || '';
      }
      throw error;
    }
  }

  private parseCurlMetrics(output: string): EndpointMetrics {
    const metrics = Object.fromEntries(
      output.split('\n').map((line) => {
        const [key, value] = line.split(':');
        return [key, value];
      })
    );

    const parseNumber = (value: string | undefined): number | null => {
      if (!value) {
        return null;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    return {
      httpCode: parseNumber(metrics.http_code),
      timeTotal: parseNumber(metrics.time_total),
      timeConnect: parseNumber(metrics.time_connect),
      timeStartTransfer: parseNumber(metrics.time_starttransfer),
      sizeDownload: parseNumber(metrics.size_download),
      rawOutput: output,
    };
  }

  private extractLighthouseScores(rawJson: string): Record<string, number> | undefined {
    try {
      const data = JSON.parse(rawJson) as Record<string, unknown>;
      const categories = data['categories'];
      if (!categories || typeof categories !== 'object') {
        return undefined;
      }

      const summary: Record<string, number> = {};
      for (const [key, value] of Object.entries(categories)) {
        if (
          value &&
          typeof value === 'object' &&
          'score' in value &&
          typeof (value as { score: unknown }).score === 'number'
        ) {
          summary[key] = Number((value as { score: number }).score) * 100;
        }
      }

      return Object.keys(summary).length > 0 ? summary : undefined;
    } catch {
      return undefined;
    }
  }
}
