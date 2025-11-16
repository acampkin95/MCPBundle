/**
 * Winston-based Logging System
 * Provides structured logging with multiple transports
 */
import * as vscode from 'vscode';
/**
 * Log levels matching Winston and VSCode
 */
export declare enum LogLevel {
    Error = "error",
    Warn = "warn",
    Info = "info",
    Debug = "debug"
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
export declare class Logger {
    private readonly winstonLogger;
    private readonly outputChannel;
    private readonly config;
    constructor(outputChannel: vscode.OutputChannel, config: LoggerConfig);
    /**
     * Get default log directory
     */
    private getDefaultLogDirectory;
    /**
     * Create Winston logger instance
     */
    private createWinstonLogger;
    /**
     * Log error message
     */
    error(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Log warning message
     */
    warn(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Log info message
     */
    info(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Log debug message
     */
    debug(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Generic log method
     */
    private log;
    /**
     * Format message for VSCode output channel
     */
    private formatOutputMessage;
    /**
     * Log operation start
     */
    startOperation(operation: string, metadata?: Record<string, unknown>): void;
    /**
     * Log operation completion
     */
    completeOperation(operation: string, durationMs: number, metadata?: Record<string, unknown>): void;
    /**
     * Log operation failure
     */
    failOperation(operation: string, error: Error, metadata?: Record<string, unknown>): void;
    /**
     * Create timed operation logger
     */
    createTimer(operation: string): OperationTimer;
    /**
     * Show output channel
     */
    show(): void;
    /**
     * Clear output channel
     */
    clear(): void;
    /**
     * Get log directory path
     */
    getLogDirectory(): string;
    /**
     * Open log directory in file explorer
     */
    openLogDirectory(): Promise<void>;
    /**
     * Get log file paths
     */
    getLogFiles(): string[];
    /**
     * Rotate log files (force rotation)
     */
    rotateLogFiles(): void;
    /**
     * Dispose logger resources
     */
    dispose(): void;
}
/**
 * Operation timer for measuring execution time
 */
export declare class OperationTimer {
    private readonly logger;
    private readonly operation;
    private readonly startTime;
    private metadata?;
    constructor(logger: Logger, operation: string);
    /**
     * Add metadata to operation
     */
    addMetadata(metadata: Record<string, unknown>): this;
    /**
     * Complete operation successfully
     */
    complete(metadata?: Record<string, unknown>): void;
    /**
     * Mark operation as failed
     */
    fail(error: Error, metadata?: Record<string, unknown>): void;
    /**
     * Get elapsed time in milliseconds
     */
    elapsed(): number;
}
/**
 * Create logger instance from VSCode output channel
 */
export declare function createLogger(outputChannel: vscode.OutputChannel, config: LoggerConfig): Logger;
export {};
//# sourceMappingURL=Logger.d.ts.map