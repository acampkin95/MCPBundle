/**
 * Centralized Error Handling System
 * Provides consistent error handling across the extension
 */
import * as vscode from 'vscode';
/**
 * Custom error types for better error classification
 */
export declare class DatabaseConnectionError extends Error {
    readonly cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
export declare class MCPServerError extends Error {
    readonly serverName: string;
    readonly cause?: Error | undefined;
    constructor(message: string, serverName: string, cause?: Error | undefined);
}
export declare class ResearchError extends Error {
    readonly queryId?: string | undefined;
    readonly cause?: Error | undefined;
    constructor(message: string, queryId?: string | undefined, cause?: Error | undefined);
}
export declare class ConfigurationError extends Error {
    readonly configKey?: string | undefined;
    readonly cause?: Error | undefined;
    constructor(message: string, configKey?: string | undefined, cause?: Error | undefined);
}
export declare class ExportError extends Error {
    readonly sessionId?: string | undefined;
    readonly cause?: Error | undefined;
    constructor(message: string, sessionId?: string | undefined, cause?: Error | undefined);
}
/**
 * Error severity levels
 */
export declare enum ErrorSeverity {
    Critical = "critical",// Requires user action, may break functionality
    Warning = "warning",// Non-critical, functionality may be degraded
    Info = "info"
}
/**
 * Error context for logging and debugging
 */
interface ErrorContext {
    readonly operation: string;
    readonly component: string;
    readonly metadata?: Record<string, unknown>;
    readonly severity: ErrorSeverity;
}
/**
 * Centralized error handler
 */
export declare class ErrorHandler {
    private readonly logger;
    private readonly errorHistory;
    constructor(logger: vscode.OutputChannel);
    /**
     * Handle error with context and user notification
     */
    handle(error: unknown, context: ErrorContext): void;
    /**
     * Log error to output channel
     */
    private logError;
    /**
     * Notify user based on error severity
     */
    private notifyUser;
    /**
     * Format user-friendly error message
     */
    private formatUserMessage;
    /**
     * Normalize unknown error to Error instance
     */
    private normalizeError;
    /**
     * Get error history
     */
    getErrorHistory(limit?: number): Array<{
        error: Error;
        context: ErrorContext;
        timestamp: Date;
    }>;
    /**
     * Clear error history
     */
    clearHistory(): void;
    /**
     * Create error context helper
     */
    static createContext(component: string, operation: string, severity?: ErrorSeverity, metadata?: Record<string, unknown>): ErrorContext;
    /**
     * Async operation wrapper with error handling
     */
    wrapAsync<T>(operation: () => Promise<T>, context: ErrorContext): Promise<T | undefined>;
    /**
     * Sync operation wrapper with error handling
     */
    wrapSync<T>(operation: () => T, context: ErrorContext): T | undefined;
}
/**
 * Export custom error types
 */
export { DatabaseConnectionError as DBError, MCPServerError as ServerError };
//# sourceMappingURL=ErrorHandler.d.ts.map