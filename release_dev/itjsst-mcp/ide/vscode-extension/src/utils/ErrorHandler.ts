/**
 * Centralized Error Handling System
 * Provides consistent error handling across the extension
 */

import * as vscode from 'vscode';

/**
 * Custom error types for better error classification
 */

export class DatabaseConnectionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class MCPServerError extends Error {
  constructor(
    message: string,
    public readonly serverName: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MCPServerError';
  }
}

export class ResearchError extends Error {
  constructor(
    message: string,
    public readonly queryId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ResearchError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public readonly configKey?: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ExportError extends Error {
  constructor(message: string, public readonly sessionId?: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ExportError';
  }
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  Critical = 'critical', // Requires user action, may break functionality
  Warning = 'warning', // Non-critical, functionality may be degraded
  Info = 'info', // Informational, no action required
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
export class ErrorHandler {
  private readonly logger: vscode.OutputChannel;
  private readonly errorHistory: Array<{
    error: Error;
    context: ErrorContext;
    timestamp: Date;
  }> = [];

  constructor(logger: vscode.OutputChannel) {
    this.logger = logger;
  }

  /**
   * Handle error with context and user notification
   */
  public handle(error: unknown, context: ErrorContext): void {
    const normalizedError = this.normalizeError(error);

    // Log error
    this.logError(normalizedError, context);

    // Store in history
    this.errorHistory.push({
      error: normalizedError,
      context,
      timestamp: new Date(),
    });

    // Trim history (keep last 100 errors)
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift();
    }

    // Notify user based on severity
    this.notifyUser(normalizedError, context);
  }

  /**
   * Log error to output channel
   */
  private logError(error: Error, context: ErrorContext): void {
    const timestamp = new Date().toISOString();
    const severity = context.severity.toUpperCase();

    this.logger.appendLine('');
    this.logger.appendLine(`[${timestamp}] [${severity}] ${context.component}.${context.operation}`);
    this.logger.appendLine(`Error: ${error.name}: ${error.message}`);

    if (error.stack) {
      this.logger.appendLine(`Stack: ${error.stack}`);
    }

    if (error.cause instanceof Error) {
      this.logger.appendLine(`Caused by: ${error.cause.name}: ${error.cause.message}`);
    }

    if (context.metadata) {
      this.logger.appendLine(`Metadata: ${JSON.stringify(context.metadata, null, 2)}`);
    }
  }

  /**
   * Notify user based on error severity
   */
  private notifyUser(error: Error, context: ErrorContext): void {
    const message = this.formatUserMessage(error, context);

    switch (context.severity) {
      case ErrorSeverity.Critical:
        void vscode.window.showErrorMessage(message, 'View Logs', 'Dismiss').then((action) => {
          if (action === 'View Logs') {
            this.logger.show();
          }
        });
        break;

      case ErrorSeverity.Warning:
        void vscode.window.showWarningMessage(message);
        break;

      case ErrorSeverity.Info:
        void vscode.window.showInformationMessage(message);
        break;
    }
  }

  /**
   * Format user-friendly error message
   */
  private formatUserMessage(error: Error, context: ErrorContext): string {
    const operation = context.operation.replace(/([A-Z])/g, ' $1').trim();
    const baseMessage = `${operation} failed`;

    // Customize message based on error type
    if (error instanceof DatabaseConnectionError) {
      return `${baseMessage}: Database connection error. Check your connection settings.`;
    }

    if (error instanceof MCPServerError) {
      return `${baseMessage}: MCP server "${error.serverName}" is not responding. Check server status.`;
    }

    if (error instanceof ResearchError) {
      return `${baseMessage}: Research query failed. ${error.message}`;
    }

    if (error instanceof ConfigurationError) {
      const configKey = error.configKey ? ` (${error.configKey})` : '';
      return `${baseMessage}: Configuration error${configKey}. ${error.message}`;
    }

    if (error instanceof ExportError) {
      return `${baseMessage}: Export failed. ${error.message}`;
    }

    // Generic error message
    return `${baseMessage}: ${error.message}`;
  }

  /**
   * Normalize unknown error to Error instance
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return new Error(String(error.message));
    }

    return new Error(String(error));
  }

  /**
   * Get error history
   */
  public getErrorHistory(limit = 10): Array<{
    error: Error;
    context: ErrorContext;
    timestamp: Date;
  }> {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Clear error history
   */
  public clearHistory(): void {
    this.errorHistory.length = 0;
  }

  /**
   * Create error context helper
   */
  public static createContext(
    component: string,
    operation: string,
    severity: ErrorSeverity = ErrorSeverity.Critical,
    metadata?: Record<string, unknown>
  ): ErrorContext {
    return {
      component,
      operation,
      severity,
      metadata,
    };
  }

  /**
   * Async operation wrapper with error handling
   */
  public async wrapAsync<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      this.handle(error, context);
      return undefined;
    }
  }

  /**
   * Sync operation wrapper with error handling
   */
  public wrapSync<T>(operation: () => T, context: ErrorContext): T | undefined {
    try {
      return operation();
    } catch (error) {
      this.handle(error, context);
      return undefined;
    }
  }
}

/**
 * Export custom error types
 */
export { DatabaseConnectionError as DBError, MCPServerError as ServerError };
