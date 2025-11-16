/**
 * Winston-based Logging System
 * Provides structured logging with multiple transports
 */

import * as vscode from 'vscode';
import * as winston from 'winston';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Log levels matching Winston and VSCode
 */
export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  readonly level: LogLevel;
  readonly enableFileLogging?: boolean;
  readonly logDirectory?: string;
  readonly maxFiles?: number;
  readonly maxFileSize?: number;
}

/**
 * Structured logger with Winston backend and VSCode output channel frontend
 */
export class Logger {
  private readonly winstonLogger: winston.Logger;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly config: Required<LoggerConfig>;

  constructor(outputChannel: vscode.OutputChannel, config: LoggerConfig) {
    this.outputChannel = outputChannel;
    this.config = {
      level: config.level,
      enableFileLogging: config.enableFileLogging ?? true,
      logDirectory: config.logDirectory ?? this.getDefaultLogDirectory(),
      maxFiles: config.maxFiles ?? 7, // Keep 7 days of logs
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB
    };

    this.winstonLogger = this.createWinstonLogger();
  }

  /**
   * Get default log directory
   */
  private getDefaultLogDirectory(): string {
    return path.join(
      os.homedir(),
      '.vscode',
      'structural-thinking',
      'logs'
    );
  }

  /**
   * Create Winston logger instance
   */
  private createWinstonLogger(): winston.Logger {
    // Ensure log directory exists
    if (this.config.enableFileLogging && !fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }

    const transports: winston.transport[] = [];

    // File transport for all logs
    if (this.config.enableFileLogging) {
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDirectory, 'combined.log'),
          level: this.config.level,
          maxsize: this.config.maxFileSize,
          maxFiles: this.config.maxFiles,
          tailable: true,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.json()
          ),
        })
      );

      // Separate file for errors
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDirectory, 'error.log'),
          level: 'error',
          maxsize: this.config.maxFileSize,
          maxFiles: this.config.maxFiles,
          tailable: true,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.json()
          ),
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      transports,
      exitOnError: false,
    });
  }

  /**
   * Log error message
   */
  public error(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, metadata);
  }

  /**
   * Log warning message
   */
  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.Warn, message, metadata);
  }

  /**
   * Log info message
   */
  public info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, metadata);
  }

  /**
   * Log debug message
   */
  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.Debug, message, metadata);
  }

  /**
   * Generic log method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();

    // Log to Winston (file)
    if (metadata) {
      this.winstonLogger.log(level, message, metadata);
    } else {
      this.winstonLogger.log(level, message);
    }

    // Log to VSCode output channel
    const formattedMessage = this.formatOutputMessage(level, timestamp, message, metadata);
    this.outputChannel.appendLine(formattedMessage);
  }

  /**
   * Format message for VSCode output channel
   */
  private formatOutputMessage(
    level: LogLevel,
    timestamp: string,
    message: string,
    metadata?: Record<string, unknown>
  ): string {
    const levelStr = level.toUpperCase().padEnd(5);
    let formatted = `[${timestamp}] [${levelStr}] ${message}`;

    if (metadata) {
      formatted += `\n${JSON.stringify(metadata, null, 2)}`;
    }

    return formatted;
  }

  /**
   * Log operation start
   */
  public startOperation(operation: string, metadata?: Record<string, unknown>): void {
    this.info(`Starting operation: ${operation}`, metadata);
  }

  /**
   * Log operation completion
   */
  public completeOperation(
    operation: string,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    this.info(`Completed operation: ${operation} (${durationMs}ms)`, metadata);
  }

  /**
   * Log operation failure
   */
  public failOperation(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>
  ): void {
    this.error(`Failed operation: ${operation} - ${error.message}`, {
      ...metadata,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }

  /**
   * Create timed operation logger
   */
  public createTimer(operation: string): OperationTimer {
    return new OperationTimer(this, operation);
  }

  /**
   * Show output channel
   */
  public show(): void {
    this.outputChannel.show();
  }

  /**
   * Clear output channel
   */
  public clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Get log directory path
   */
  public getLogDirectory(): string {
    return this.config.logDirectory;
  }

  /**
   * Open log directory in file explorer
   */
  public async openLogDirectory(): Promise<void> {
    const uri = vscode.Uri.file(this.config.logDirectory);
    await vscode.commands.executeCommand('revealFileInOS', uri);
  }

  /**
   * Get log file paths
   */
  public getLogFiles(): string[] {
    if (!this.config.enableFileLogging) {
      return [];
    }

    try {
      const files = fs.readdirSync(this.config.logDirectory);
      return files
        .filter((file) => file.endsWith('.log'))
        .map((file) => path.join(this.config.logDirectory, file));
    } catch {
      return [];
    }
  }

  /**
   * Rotate log files (force rotation)
   */
  public rotateLogFiles(): void {
    // Winston handles rotation automatically, but we can force close and reopen
    this.winstonLogger.close();
    Object.assign(this, { winstonLogger: this.createWinstonLogger() });
    this.info('Log files rotated');
  }

  /**
   * Dispose logger resources
   */
  public dispose(): void {
    this.winstonLogger.close();
  }
}

/**
 * Operation timer for measuring execution time
 */
export class OperationTimer {
  private readonly logger: Logger;
  private readonly operation: string;
  private readonly startTime: number;
  private metadata?: Record<string, unknown>;

  constructor(logger: Logger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();

    this.logger.startOperation(operation);
  }

  /**
   * Add metadata to operation
   */
  public addMetadata(metadata: Record<string, unknown>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  /**
   * Complete operation successfully
   */
  public complete(metadata?: Record<string, unknown>): void {
    const duration = Date.now() - this.startTime;
    const combinedMetadata = { ...this.metadata, ...metadata };

    this.logger.completeOperation(this.operation, duration, combinedMetadata);
  }

  /**
   * Mark operation as failed
   */
  public fail(error: Error, metadata?: Record<string, unknown>): void {
    const combinedMetadata = { ...this.metadata, ...metadata };
    this.logger.failOperation(this.operation, error, combinedMetadata);
  }

  /**
   * Get elapsed time in milliseconds
   */
  public elapsed(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Create logger instance from VSCode output channel
 */
export function createLogger(
  outputChannel: vscode.OutputChannel,
  config: LoggerConfig
): Logger {
  return new Logger(outputChannel, config);
}
