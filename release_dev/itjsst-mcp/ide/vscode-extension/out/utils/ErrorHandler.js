"use strict";
/**
 * Centralized Error Handling System
 * Provides consistent error handling across the extension
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerError = exports.DBError = exports.ErrorHandler = exports.ErrorSeverity = exports.ExportError = exports.ConfigurationError = exports.ResearchError = exports.MCPServerError = exports.DatabaseConnectionError = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Custom error types for better error classification
 */
class DatabaseConnectionError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'DatabaseConnectionError';
    }
}
exports.DatabaseConnectionError = DatabaseConnectionError;
exports.DBError = DatabaseConnectionError;
class MCPServerError extends Error {
    serverName;
    cause;
    constructor(message, serverName, cause) {
        super(message);
        this.serverName = serverName;
        this.cause = cause;
        this.name = 'MCPServerError';
    }
}
exports.MCPServerError = MCPServerError;
exports.ServerError = MCPServerError;
class ResearchError extends Error {
    queryId;
    cause;
    constructor(message, queryId, cause) {
        super(message);
        this.queryId = queryId;
        this.cause = cause;
        this.name = 'ResearchError';
    }
}
exports.ResearchError = ResearchError;
class ConfigurationError extends Error {
    configKey;
    cause;
    constructor(message, configKey, cause) {
        super(message);
        this.configKey = configKey;
        this.cause = cause;
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
class ExportError extends Error {
    sessionId;
    cause;
    constructor(message, sessionId, cause) {
        super(message);
        this.sessionId = sessionId;
        this.cause = cause;
        this.name = 'ExportError';
    }
}
exports.ExportError = ExportError;
/**
 * Error severity levels
 */
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["Critical"] = "critical";
    ErrorSeverity["Warning"] = "warning";
    ErrorSeverity["Info"] = "info";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
/**
 * Centralized error handler
 */
class ErrorHandler {
    logger;
    errorHistory = [];
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Handle error with context and user notification
     */
    handle(error, context) {
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
    logError(error, context) {
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
    notifyUser(error, context) {
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
    formatUserMessage(error, context) {
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
    normalizeError(error) {
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
    getErrorHistory(limit = 10) {
        return this.errorHistory.slice(-limit);
    }
    /**
     * Clear error history
     */
    clearHistory() {
        this.errorHistory.length = 0;
    }
    /**
     * Create error context helper
     */
    static createContext(component, operation, severity = ErrorSeverity.Critical, metadata) {
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
    async wrapAsync(operation, context) {
        try {
            return await operation();
        }
        catch (error) {
            this.handle(error, context);
            return undefined;
        }
    }
    /**
     * Sync operation wrapper with error handling
     */
    wrapSync(operation, context) {
        try {
            return operation();
        }
        catch (error) {
            this.handle(error, context);
            return undefined;
        }
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=ErrorHandler.js.map