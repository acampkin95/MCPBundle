import type { CommandRunner } from '../utils/commandRunner.js';
import { readFile } from 'node:fs/promises';
import { logger } from '../utils/logger.js';
import {
  validateFilePath,
  validateNumericRange,
  sanitizeShellArg,
  ALLOWED_LOG_DIRS,
} from '../utils/validators.js';

export interface AccessStats {
  readonly totalRequests: number;
  readonly byStatusCode: Record<string, number>;
  readonly byMethod: Record<string, number>;
  readonly topPaths: Array<{ path: string; count: number }>;
  readonly topIPs: Array<{ ip: string; count: number }>;
  readonly avgResponseSize: number;
}

export interface ErrorEntry {
  readonly timestamp: string;
  readonly level: string;
  readonly message: string;
  readonly client?: string;
}

export interface ConfigTestResult {
  readonly success: boolean;
  readonly output: string;
  readonly errors: string[];
}

export interface UpstreamStatus {
  readonly name: string;
  readonly status: 'up' | 'down' | 'unknown';
  readonly lastCheck: string;
}

export class NginxMonitoringService {
  public constructor(private readonly runner: CommandRunner) {}

  public async getAccessLogStats(
    logPath?: string,
    lastMinutes?: number,
    maxLines?: number
  ): Promise<AccessStats> {
    const accessLog = logPath ?? process.env.NGINX_ACCESS_LOG ?? '/var/log/nginx/access.log';

    // Validate log path to prevent path traversal
    if (!validateFilePath(accessLog, ALLOWED_LOG_DIRS)) {
      throw new Error(`Invalid log path: ${accessLog}. Must be in allowed directories.`);
    }

    if (typeof maxLines === 'number') {
      if (!validateNumericRange(maxLines, 1, 50000, 'maxLines')) {
        throw new Error(`Invalid maxLines parameter: ${maxLines}. Must be between 1 and 50000.`);
      }
    }

    try {
      const content = await readFile(accessLog, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());
      const boundedLines = typeof maxLines === 'number' ? lines.slice(-maxLines) : lines;

      // Filter by time if requested
      let filteredLines = boundedLines;
      if (lastMinutes) {
        const cutoffTime = Date.now() - lastMinutes * 60 * 1000;
        filteredLines = boundedLines.filter((line) => {
          const timeMatch = line.match(/\[([^\]]+)\]/);
          if (!timeMatch) {
            return false;
          }

          const timestamp = new Date(timeMatch[1].replace(':', ' ')).getTime();
          return timestamp >= cutoffTime;
        });
      }

      const byStatusCode: Record<string, number> = {};
      const byMethod: Record<string, number> = {};
      const pathCounts = new Map<string, number>();
      const ipCounts = new Map<string, number>();
      let totalResponseSize = 0;

      for (const line of filteredLines) {
        // Parse NGINX combined log format
        // Example: 192.168.1.1 - - [01/Nov/2025:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
        const parts = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) (\d+)/);
        if (!parts) {
          continue;
        }

        const [, ip, , method, path, statusCode, responseSize] = parts;

        // Count by status code
        byStatusCode[statusCode] = (byStatusCode[statusCode] ?? 0) + 1;

        // Count by method
        byMethod[method] = (byMethod[method] ?? 0) + 1;

        // Count paths
        pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);

        // Count IPs
        ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);

        // Sum response sizes
        totalResponseSize += Number(responseSize) || 0;
      }

      const topPaths = Array.from(pathCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path, count }));

      const topIPs = Array.from(ipCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }));

      return {
        totalRequests: filteredLines.length,
        byStatusCode,
        byMethod,
        topPaths,
        topIPs,
        avgResponseSize:
          filteredLines.length > 0 ? Math.round(totalResponseSize / filteredLines.length) : 0,
      };
    } catch (error) {
      logger.error('Failed to parse access log', { logPath: accessLog, error });
      throw error;
    }
  }

  public async getErrorLogRecent(logPath?: string, lines: number = 100): Promise<ErrorEntry[]> {
    const errorLog = logPath ?? process.env.NGINX_ERROR_LOG ?? '/var/log/nginx/error.log';

    // Validate log path to prevent path traversal
    if (!validateFilePath(errorLog, ALLOWED_LOG_DIRS)) {
      throw new Error(`Invalid log path: ${errorLog}. Must be in allowed directories.`);
    }

    // Validate lines parameter
    if (!validateNumericRange(lines, 1, 10000, 'lines')) {
      throw new Error(`Invalid lines parameter: ${lines}. Must be between 1 and 10000.`);
    }

    try {
      // Sanitize parameters for shell command
      const safeLines = sanitizeShellArg(String(lines));
      const safeErrorLog = sanitizeShellArg(errorLog);

      const result = await this.runner.run(`tail -n ${safeLines} ${safeErrorLog}`, {
        requiresSudo: false,
        timeoutMs: 10000,
      });

      const entries: ErrorEntry[] = [];
      const logLines = result.stdout.split('\n').filter((line) => line.trim());

      for (const line of logLines) {
        // Parse NGINX error log format
        // Example: 2025/11/01 10:30:00 [error] 12345#0: *1 connect() failed (111: Connection refused)
        const match = line.match(
          /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] \d+#\d+: (.+)$/
        );
        if (!match) {
          continue;
        }

        const [, timestamp, level, message] = match;

        // Extract client IP if present
        const clientMatch = message.match(/client: ([^,]+)/);

        entries.push({
          timestamp,
          level,
          message: message.trim(),
          client: clientMatch ? clientMatch[1] : undefined,
        });
      }

      return entries;
    } catch (error) {
      logger.error('Failed to read error log', { logPath: errorLog, error });
      throw error;
    }
  }

  public async testConfiguration(): Promise<ConfigTestResult> {
    try {
      const result = await this.runner.run('nginx -t', {
        requiresSudo: true,
        timeoutMs: 10000,
      });

      const output = result.stderr + result.stdout;
      const errors: string[] = [];

      // Check for error markers
      if (output.includes('test failed')) {
        const errorLines = output.split('\n').filter((line) => line.includes('error'));
        errors.push(...errorLines);
      }

      return {
        success: output.includes('test is successful'),
        output,
        errors,
      };
    } catch (error) {
      logger.error('NGINX config test failed', { error });
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        errors: ['Configuration test failed to run'],
      };
    }
  }

  public async getUpstreamHealth(): Promise<UpstreamStatus[]> {
    // Note: This requires NGINX Plus or custom status module
    // For open-source NGINX, we can check if upstream hosts are reachable

    const configPath = process.env.NGINX_CONFIG_PATH ?? '/etc/nginx/nginx.conf';

    try {
      const content = await readFile(configPath, 'utf8');

      // Extract upstream definitions
      const upstreamBlocks = content.match(/upstream\s+(\w+)\s*\{[^}]+\}/g) || [];
      const upstreams: UpstreamStatus[] = [];

      for (const block of upstreamBlocks) {
        const nameMatch = block.match(/upstream\s+(\w+)/);
        if (!nameMatch) {
          continue;
        }

        const name = nameMatch[1];

        // For now, return unknown status (would need NGINX Plus API for real status)
        upstreams.push({
          name,
          status: 'unknown',
          lastCheck: new Date().toISOString(),
        });
      }

      return upstreams;
    } catch (error) {
      logger.warn('Failed to parse NGINX config for upstreams', { configPath, error });
      return [];
    }
  }

  public async parseAccessLog(logPath: string, maxLines: number = 1000): Promise<AccessStats> {
    return this.getAccessLogStats(logPath, undefined, maxLines);
  }

  public async reloadConfig(): Promise<boolean> {
    try {
      await this.runner.run('systemctl reload nginx', {
        requiresSudo: true,
        timeoutMs: 10000,
      });

      logger.info('NGINX config reloaded successfully');
      return true;
    } catch (error) {
      logger.error('Failed to reload NGINX', { error });
      return false;
    }
  }
}
