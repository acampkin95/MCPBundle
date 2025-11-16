"use strict";
/**
 * Configuration Validation with Zod
 * Ensures type-safe configuration with runtime validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigPresets = exports.ExtensionConfigSchema = void 0;
exports.validateConfig = validateConfig;
exports.validateConfigSafe = validateConfigSafe;
exports.formatValidationErrors = formatValidationErrors;
exports.validatePostgreSQLConfig = validatePostgreSQLConfig;
exports.validateSQLiteConfig = validateSQLiteConfig;
exports.validateMCPServerConfig = validateMCPServerConfig;
const zod_1 = require("zod");
/**
 * Database mode schema
 */
const DatabaseModeSchema = zod_1.z.enum(['sqlite', 'postgresql', 'auto']);
/**
 * Log level schema
 */
const LogLevelSchema = zod_1.z.enum(['error', 'warn', 'info', 'debug']);
/**
 * PostgreSQL configuration schema
 */
const PostgreSQLConfigSchema = zod_1.z.object({
    host: zod_1.z.string().min(1, 'PostgreSQL host is required'),
    port: zod_1.z
        .number()
        .int('Port must be an integer')
        .min(1, 'Port must be at least 1')
        .max(65535, 'Port must be at most 65535'),
    database: zod_1.z.string().min(1, 'Database name is required'),
    username: zod_1.z.string().min(1, 'Username is required'),
    password: zod_1.z.string().min(1, 'Password is required'),
    poolSize: zod_1.z
        .number()
        .int('Pool size must be an integer')
        .min(1, 'Pool size must be at least 1')
        .max(100, 'Pool size must be at most 100')
        .default(5),
    connectionTimeout: zod_1.z
        .number()
        .int('Connection timeout must be an integer')
        .min(1000, 'Connection timeout must be at least 1000ms')
        .default(10000),
    idleTimeout: zod_1.z
        .number()
        .int('Idle timeout must be an integer')
        .min(1000, 'Idle timeout must be at least 1000ms')
        .default(30000),
});
/**
 * SQLite configuration schema
 */
const SQLiteConfigSchema = zod_1.z.object({
    databasePath: zod_1.z.string().min(1, 'Database path is required'),
    enableWAL: zod_1.z.boolean().default(true),
});
/**
 * Database configuration schema
 */
const DatabaseConfigSchema = zod_1.z.object({
    mode: DatabaseModeSchema.default('auto'),
    postgresql: PostgreSQLConfigSchema.optional(),
    sqlite: SQLiteConfigSchema,
});
/**
 * SSH configuration schema
 */
const SSHConfigSchema = zod_1.z.object({
    host: zod_1.z.string().min(1, 'SSH host is required'),
    port: zod_1.z
        .number()
        .int('SSH port must be an integer')
        .min(1, 'SSH port must be at least 1')
        .max(65535, 'SSH port must be at most 65535')
        .default(22),
    username: zod_1.z.string().min(1, 'SSH username is required'),
    privateKeyPath: zod_1.z.string().optional(),
    password: zod_1.z.string().optional(),
});
/**
 * MCP server configuration schema
 */
const MCPServerConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Server name is required'),
    displayName: zod_1.z.string().min(1, 'Display name is required'),
    remotePath: zod_1.z.string().min(1, 'Remote path is required'),
    localPath: zod_1.z.string().optional(),
    enabled: zod_1.z.boolean().default(true),
});
/**
 * MCP configuration schema
 */
const MCPConfigSchema = zod_1.z.object({
    remoteMode: zod_1.z.boolean().default(true),
    ssh: SSHConfigSchema.optional(),
    servers: zod_1.z.array(MCPServerConfigSchema).min(1, 'At least one MCP server is required'),
});
/**
 * Tree view configuration schema
 */
const TreeViewConfigSchema = zod_1.z.object({
    refreshInterval: zod_1.z
        .number()
        .int('Refresh interval must be an integer')
        .min(0, 'Refresh interval must be at least 0 (0 to disable)')
        .max(60000, 'Refresh interval must be at most 60000ms')
        .default(5000),
    maxThoughtsPerSession: zod_1.z
        .number()
        .int('Max thoughts must be an integer')
        .min(1, 'Max thoughts must be at least 1')
        .max(1000, 'Max thoughts must be at most 1000')
        .default(100),
});
/**
 * Logging configuration schema
 */
const LoggingConfigSchema = zod_1.z.object({
    level: LogLevelSchema.default('info'),
    outputChannel: zod_1.z.string().default('Structural Thinking'),
});
/**
 * Full extension configuration schema
 */
exports.ExtensionConfigSchema = zod_1.z.object({
    database: DatabaseConfigSchema,
    mcp: MCPConfigSchema,
    treeView: TreeViewConfigSchema,
    logging: LoggingConfigSchema,
});
/**
 * Validate extension configuration
 */
function validateConfig(config) {
    return exports.ExtensionConfigSchema.parse(config);
}
/**
 * Validate extension configuration with safe parsing
 */
function validateConfigSafe(config) {
    const result = exports.ExtensionConfigSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
/**
 * Get human-readable validation error messages
 */
function formatValidationErrors(error) {
    return error.errors.map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
    });
}
/**
 * Validate PostgreSQL connection configuration
 */
function validatePostgreSQLConfig(config) {
    return PostgreSQLConfigSchema.parse(config);
}
/**
 * Validate SQLite configuration
 */
function validateSQLiteConfig(config) {
    return SQLiteConfigSchema.parse(config);
}
/**
 * Validate MCP server configuration
 */
function validateMCPServerConfig(config) {
    return MCPServerConfigSchema.parse(config);
}
/**
 * Configuration presets for common scenarios
 */
exports.ConfigPresets = {
    development: {
        database: {
            mode: 'sqlite',
            sqlite: {
                databasePath: '/tmp/mcp_dev.db',
                enableWAL: true,
            },
        },
        mcp: {
            remoteMode: false,
            servers: [
                {
                    name: 'itjsst-mcp',
                    displayName: 'IT-MCP (Local)',
                    remotePath: '',
                    localPath: './dist/index.js',
                    enabled: true,
                },
            ],
        },
        treeView: {
            refreshInterval: 10000,
            maxThoughtsPerSession: 50,
        },
        logging: {
            level: 'debug',
            outputChannel: 'Structural Thinking',
        },
    },
    production: {
        database: {
            mode: 'postgresql',
            postgresql: {
                host: '46.250.243.123',
                port: 5432,
                database: 'mcp_ecosystem',
                username: '',
                password: '',
                poolSize: 10,
                connectionTimeout: 10000,
                idleTimeout: 30000,
            },
            sqlite: {
                databasePath: '~/.vscode/structural-thinking/mcp_plan.db',
                enableWAL: true,
            },
        },
        mcp: {
            remoteMode: true,
            ssh: {
                host: '46.250.243.123',
                port: 22,
                username: 'root',
            },
            servers: [
                {
                    name: 'mcp-orchestrator',
                    displayName: 'MCP Orchestrator',
                    remotePath: '/opt/mcp/services/mcp-orchestrator/dist/index.js',
                    enabled: true,
                },
                {
                    name: 'itjsst-mcp',
                    displayName: 'IT-MCP Server',
                    remotePath: '/opt/mcp/services/itjsst-mcp/dist/index.js',
                    enabled: true,
                },
                {
                    name: 'perplexity-mcp',
                    displayName: 'Perplexity Research',
                    remotePath: '/opt/mcp/services/perplexity-mcp/dist/index.js',
                    enabled: true,
                },
            ],
        },
        treeView: {
            refreshInterval: 5000,
            maxThoughtsPerSession: 100,
        },
        logging: {
            level: 'info',
            outputChannel: 'Structural Thinking',
        },
    },
    testing: {
        database: {
            mode: 'sqlite',
            sqlite: {
                databasePath: ':memory:',
                enableWAL: false,
            },
        },
        mcp: {
            remoteMode: false,
            servers: [],
        },
        treeView: {
            refreshInterval: 0,
            maxThoughtsPerSession: 10,
        },
        logging: {
            level: 'error',
            outputChannel: 'Structural Thinking Test',
        },
    },
};
//# sourceMappingURL=ConfigValidation.js.map