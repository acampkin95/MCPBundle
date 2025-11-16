"use strict";
/**
 * Winston-based Logging System
 * Provides structured logging with multiple transports
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
exports.OperationTimer = exports.Logger = exports.LogLevel = void 0;
exports.createLogger = createLogger;
const vscode = __importStar(require("vscode"));
const winston = __importStar(require("winston"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
/**
 * Log levels matching Winston and VSCode
 */
var LogLevel;
(function (LogLevel) {
    LogLevel["Error"] = "error";
    LogLevel["Warn"] = "warn";
    LogLevel["Info"] = "info";
    LogLevel["Debug"] = "debug";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Structured logger with Winston backend and VSCode output channel frontend
 */
class Logger {
    winstonLogger;
    outputChannel;
    config;
    constructor(outputChannel, config) {
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
    getDefaultLogDirectory() {
        return path.join(os.homedir(), '.vscode', 'structural-thinking', 'logs');
    }
    /**
     * Create Winston logger instance
     */
    createWinstonLogger() {
        // Ensure log directory exists
        if (this.config.enableFileLogging && !fs.existsSync(this.config.logDirectory)) {
            fs.mkdirSync(this.config.logDirectory, { recursive: true });
        }
        const transports = [];
        // File transport for all logs
        if (this.config.enableFileLogging) {
            transports.push(new winston.transports.File({
                filename: path.join(this.config.logDirectory, 'combined.log'),
                level: this.config.level,
                maxsize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                tailable: true,
                format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston.format.json()),
            }));
            // Separate file for errors
            transports.push(new winston.transports.File({
                filename: path.join(this.config.logDirectory, 'error.log'),
                level: 'error',
                maxsize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                tailable: true,
                format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston.format.json()),
            }));
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
    error(message, metadata) {
        this.log(LogLevel.Error, message, metadata);
    }
    /**
     * Log warning message
     */
    warn(message, metadata) {
        this.log(LogLevel.Warn, message, metadata);
    }
    /**
     * Log info message
     */
    info(message, metadata) {
        this.log(LogLevel.Info, message, metadata);
    }
    /**
     * Log debug message
     */
    debug(message, metadata) {
        this.log(LogLevel.Debug, message, metadata);
    }
    /**
     * Generic log method
     */
    log(level, message, metadata) {
        const timestamp = new Date().toISOString();
        // Log to Winston (file)
        if (metadata) {
            this.winstonLogger.log(level, message, metadata);
        }
        else {
            this.winstonLogger.log(level, message);
        }
        // Log to VSCode output channel
        const formattedMessage = this.formatOutputMessage(level, timestamp, message, metadata);
        this.outputChannel.appendLine(formattedMessage);
    }
    /**
     * Format message for VSCode output channel
     */
    formatOutputMessage(level, timestamp, message, metadata) {
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
    startOperation(operation, metadata) {
        this.info(`Starting operation: ${operation}`, metadata);
    }
    /**
     * Log operation completion
     */
    completeOperation(operation, durationMs, metadata) {
        this.info(`Completed operation: ${operation} (${durationMs}ms)`, metadata);
    }
    /**
     * Log operation failure
     */
    failOperation(operation, error, metadata) {
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
    createTimer(operation) {
        return new OperationTimer(this, operation);
    }
    /**
     * Show output channel
     */
    show() {
        this.outputChannel.show();
    }
    /**
     * Clear output channel
     */
    clear() {
        this.outputChannel.clear();
    }
    /**
     * Get log directory path
     */
    getLogDirectory() {
        return this.config.logDirectory;
    }
    /**
     * Open log directory in file explorer
     */
    async openLogDirectory() {
        const uri = vscode.Uri.file(this.config.logDirectory);
        await vscode.commands.executeCommand('revealFileInOS', uri);
    }
    /**
     * Get log file paths
     */
    getLogFiles() {
        if (!this.config.enableFileLogging) {
            return [];
        }
        try {
            const files = fs.readdirSync(this.config.logDirectory);
            return files
                .filter((file) => file.endsWith('.log'))
                .map((file) => path.join(this.config.logDirectory, file));
        }
        catch {
            return [];
        }
    }
    /**
     * Rotate log files (force rotation)
     */
    rotateLogFiles() {
        // Winston handles rotation automatically, but we can force close and reopen
        this.winstonLogger.close();
        Object.assign(this, { winstonLogger: this.createWinstonLogger() });
        this.info('Log files rotated');
    }
    /**
     * Dispose logger resources
     */
    dispose() {
        this.winstonLogger.close();
    }
}
exports.Logger = Logger;
/**
 * Operation timer for measuring execution time
 */
class OperationTimer {
    logger;
    operation;
    startTime;
    metadata;
    constructor(logger, operation) {
        this.logger = logger;
        this.operation = operation;
        this.startTime = Date.now();
        this.logger.startOperation(operation);
    }
    /**
     * Add metadata to operation
     */
    addMetadata(metadata) {
        this.metadata = { ...this.metadata, ...metadata };
        return this;
    }
    /**
     * Complete operation successfully
     */
    complete(metadata) {
        const duration = Date.now() - this.startTime;
        const combinedMetadata = { ...this.metadata, ...metadata };
        this.logger.completeOperation(this.operation, duration, combinedMetadata);
    }
    /**
     * Mark operation as failed
     */
    fail(error, metadata) {
        const combinedMetadata = { ...this.metadata, ...metadata };
        this.logger.failOperation(this.operation, error, combinedMetadata);
    }
    /**
     * Get elapsed time in milliseconds
     */
    elapsed() {
        return Date.now() - this.startTime;
    }
}
exports.OperationTimer = OperationTimer;
/**
 * Create logger instance from VSCode output channel
 */
function createLogger(outputChannel, config) {
    return new Logger(outputChannel, config);
}
//# sourceMappingURL=Logger.js.map