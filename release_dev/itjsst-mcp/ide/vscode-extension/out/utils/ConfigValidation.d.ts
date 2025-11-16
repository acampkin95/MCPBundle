/**
 * Configuration Validation with Zod
 * Ensures type-safe configuration with runtime validation
 */
import { z } from 'zod';
import type { ExtensionConfig } from '../types';
/**
 * PostgreSQL configuration schema
 */
declare const PostgreSQLConfigSchema: z.ZodObject<{
    host: z.ZodString;
    port: z.ZodNumber;
    database: z.ZodString;
    username: z.ZodString;
    password: z.ZodString;
    poolSize: z.ZodDefault<z.ZodNumber>;
    connectionTimeout: z.ZodDefault<z.ZodNumber>;
    idleTimeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    password: string;
    username: string;
    host: string;
    port: number;
    database: string;
    poolSize: number;
    connectionTimeout: number;
    idleTimeout: number;
}, {
    password: string;
    username: string;
    host: string;
    port: number;
    database: string;
    poolSize?: number | undefined;
    connectionTimeout?: number | undefined;
    idleTimeout?: number | undefined;
}>;
/**
 * SQLite configuration schema
 */
declare const SQLiteConfigSchema: z.ZodObject<{
    databasePath: z.ZodString;
    enableWAL: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    databasePath: string;
    enableWAL: boolean;
}, {
    databasePath: string;
    enableWAL?: boolean | undefined;
}>;
/**
 * MCP server configuration schema
 */
declare const MCPServerConfigSchema: z.ZodObject<{
    name: z.ZodString;
    displayName: z.ZodString;
    remotePath: z.ZodString;
    localPath: z.ZodOptional<z.ZodString>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    enabled: boolean;
    displayName: string;
    remotePath: string;
    localPath?: string | undefined;
}, {
    name: string;
    displayName: string;
    remotePath: string;
    enabled?: boolean | undefined;
    localPath?: string | undefined;
}>;
/**
 * Full extension configuration schema
 */
export declare const ExtensionConfigSchema: z.ZodObject<{
    database: z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["sqlite", "postgresql", "auto"]>>;
        postgresql: z.ZodOptional<z.ZodObject<{
            host: z.ZodString;
            port: z.ZodNumber;
            database: z.ZodString;
            username: z.ZodString;
            password: z.ZodString;
            poolSize: z.ZodDefault<z.ZodNumber>;
            connectionTimeout: z.ZodDefault<z.ZodNumber>;
            idleTimeout: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            password: string;
            username: string;
            host: string;
            port: number;
            database: string;
            poolSize: number;
            connectionTimeout: number;
            idleTimeout: number;
        }, {
            password: string;
            username: string;
            host: string;
            port: number;
            database: string;
            poolSize?: number | undefined;
            connectionTimeout?: number | undefined;
            idleTimeout?: number | undefined;
        }>>;
        sqlite: z.ZodObject<{
            databasePath: z.ZodString;
            enableWAL: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            databasePath: string;
            enableWAL: boolean;
        }, {
            databasePath: string;
            enableWAL?: boolean | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        sqlite: {
            databasePath: string;
            enableWAL: boolean;
        };
        mode: "sqlite" | "postgresql" | "auto";
        postgresql?: {
            password: string;
            username: string;
            host: string;
            port: number;
            database: string;
            poolSize: number;
            connectionTimeout: number;
            idleTimeout: number;
        } | undefined;
    }, {
        sqlite: {
            databasePath: string;
            enableWAL?: boolean | undefined;
        };
        postgresql?: {
            password: string;
            username: string;
            host: string;
            port: number;
            database: string;
            poolSize?: number | undefined;
            connectionTimeout?: number | undefined;
            idleTimeout?: number | undefined;
        } | undefined;
        mode?: "sqlite" | "postgresql" | "auto" | undefined;
    }>;
    mcp: z.ZodObject<{
        remoteMode: z.ZodDefault<z.ZodBoolean>;
        ssh: z.ZodOptional<z.ZodObject<{
            host: z.ZodString;
            port: z.ZodDefault<z.ZodNumber>;
            username: z.ZodString;
            privateKeyPath: z.ZodOptional<z.ZodString>;
            password: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            username: string;
            host: string;
            port: number;
            password?: string | undefined;
            privateKeyPath?: string | undefined;
        }, {
            username: string;
            host: string;
            password?: string | undefined;
            port?: number | undefined;
            privateKeyPath?: string | undefined;
        }>>;
        servers: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            displayName: z.ZodString;
            remotePath: z.ZodString;
            localPath: z.ZodOptional<z.ZodString>;
            enabled: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            enabled: boolean;
            displayName: string;
            remotePath: string;
            localPath?: string | undefined;
        }, {
            name: string;
            displayName: string;
            remotePath: string;
            enabled?: boolean | undefined;
            localPath?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        remoteMode: boolean;
        servers: {
            name: string;
            enabled: boolean;
            displayName: string;
            remotePath: string;
            localPath?: string | undefined;
        }[];
        ssh?: {
            username: string;
            host: string;
            port: number;
            password?: string | undefined;
            privateKeyPath?: string | undefined;
        } | undefined;
    }, {
        servers: {
            name: string;
            displayName: string;
            remotePath: string;
            enabled?: boolean | undefined;
            localPath?: string | undefined;
        }[];
        ssh?: {
            username: string;
            host: string;
            password?: string | undefined;
            port?: number | undefined;
            privateKeyPath?: string | undefined;
        } | undefined;
        remoteMode?: boolean | undefined;
    }>;
    treeView: z.ZodObject<{
        refreshInterval: z.ZodDefault<z.ZodNumber>;
        maxThoughtsPerSession: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        refreshInterval: number;
        maxThoughtsPerSession: number;
    }, {
        refreshInterval?: number | undefined;
        maxThoughtsPerSession?: number | undefined;
    }>;
    logging: z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<["error", "warn", "info", "debug"]>>;
        outputChannel: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        level: "error" | "warn" | "info" | "debug";
        outputChannel: string;
    }, {
        level?: "error" | "warn" | "info" | "debug" | undefined;
        outputChannel?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    database: {
        sqlite: {
            databasePath: string;
            enableWAL: boolean;
        };
        mode: "sqlite" | "postgresql" | "auto";
        postgresql?: {
            password: string;
            username: string;
            host: string;
            port: number;
            database: string;
            poolSize: number;
            connectionTimeout: number;
            idleTimeout: number;
        } | undefined;
    };
    mcp: {
        remoteMode: boolean;
        servers: {
            name: string;
            enabled: boolean;
            displayName: string;
            remotePath: string;
            localPath?: string | undefined;
        }[];
        ssh?: {
            username: string;
            host: string;
            port: number;
            password?: string | undefined;
            privateKeyPath?: string | undefined;
        } | undefined;
    };
    treeView: {
        refreshInterval: number;
        maxThoughtsPerSession: number;
    };
    logging: {
        level: "error" | "warn" | "info" | "debug";
        outputChannel: string;
    };
}, {
    database: {
        sqlite: {
            databasePath: string;
            enableWAL?: boolean | undefined;
        };
        postgresql?: {
            password: string;
            username: string;
            host: string;
            port: number;
            database: string;
            poolSize?: number | undefined;
            connectionTimeout?: number | undefined;
            idleTimeout?: number | undefined;
        } | undefined;
        mode?: "sqlite" | "postgresql" | "auto" | undefined;
    };
    mcp: {
        servers: {
            name: string;
            displayName: string;
            remotePath: string;
            enabled?: boolean | undefined;
            localPath?: string | undefined;
        }[];
        ssh?: {
            username: string;
            host: string;
            password?: string | undefined;
            port?: number | undefined;
            privateKeyPath?: string | undefined;
        } | undefined;
        remoteMode?: boolean | undefined;
    };
    treeView: {
        refreshInterval?: number | undefined;
        maxThoughtsPerSession?: number | undefined;
    };
    logging: {
        level?: "error" | "warn" | "info" | "debug" | undefined;
        outputChannel?: string | undefined;
    };
}>;
/**
 * Validate extension configuration
 */
export declare function validateConfig(config: unknown): ExtensionConfig;
/**
 * Validate extension configuration with safe parsing
 */
export declare function validateConfigSafe(config: unknown): {
    success: boolean;
    data?: ExtensionConfig;
    error?: z.ZodError;
};
/**
 * Get human-readable validation error messages
 */
export declare function formatValidationErrors(error: z.ZodError): string[];
/**
 * Validate PostgreSQL connection configuration
 */
export declare function validatePostgreSQLConfig(config: unknown): z.infer<typeof PostgreSQLConfigSchema>;
/**
 * Validate SQLite configuration
 */
export declare function validateSQLiteConfig(config: unknown): z.infer<typeof SQLiteConfigSchema>;
/**
 * Validate MCP server configuration
 */
export declare function validateMCPServerConfig(config: unknown): z.infer<typeof MCPServerConfigSchema>;
/**
 * Configuration presets for common scenarios
 */
export declare const ConfigPresets: {
    readonly development: {
        readonly database: {
            readonly mode: "sqlite";
            readonly sqlite: {
                readonly databasePath: "/tmp/mcp_dev.db";
                readonly enableWAL: true;
            };
        };
        readonly mcp: {
            readonly remoteMode: false;
            readonly servers: readonly [{
                readonly name: "itjsst-mcp";
                readonly displayName: "IT-MCP (Local)";
                readonly remotePath: "";
                readonly localPath: "./dist/index.js";
                readonly enabled: true;
            }];
        };
        readonly treeView: {
            readonly refreshInterval: 10000;
            readonly maxThoughtsPerSession: 50;
        };
        readonly logging: {
            readonly level: "debug";
            readonly outputChannel: "Structural Thinking";
        };
    };
    readonly production: {
        readonly database: {
            readonly mode: "postgresql";
            readonly postgresql: {
                readonly host: "46.250.243.123";
                readonly port: 5432;
                readonly database: "mcp_ecosystem";
                readonly username: "";
                readonly password: "";
                readonly poolSize: 10;
                readonly connectionTimeout: 10000;
                readonly idleTimeout: 30000;
            };
            readonly sqlite: {
                readonly databasePath: "~/.vscode/structural-thinking/mcp_plan.db";
                readonly enableWAL: true;
            };
        };
        readonly mcp: {
            readonly remoteMode: true;
            readonly ssh: {
                readonly host: "46.250.243.123";
                readonly port: 22;
                readonly username: "root";
            };
            readonly servers: readonly [{
                readonly name: "mcp-orchestrator";
                readonly displayName: "MCP Orchestrator";
                readonly remotePath: "/opt/mcp/services/mcp-orchestrator/dist/index.js";
                readonly enabled: true;
            }, {
                readonly name: "itjsst-mcp";
                readonly displayName: "IT-MCP Server";
                readonly remotePath: "/opt/mcp/services/itjsst-mcp/dist/index.js";
                readonly enabled: true;
            }, {
                readonly name: "perplexity-mcp";
                readonly displayName: "Perplexity Research";
                readonly remotePath: "/opt/mcp/services/perplexity-mcp/dist/index.js";
                readonly enabled: true;
            }];
        };
        readonly treeView: {
            readonly refreshInterval: 5000;
            readonly maxThoughtsPerSession: 100;
        };
        readonly logging: {
            readonly level: "info";
            readonly outputChannel: "Structural Thinking";
        };
    };
    readonly testing: {
        readonly database: {
            readonly mode: "sqlite";
            readonly sqlite: {
                readonly databasePath: ":memory:";
                readonly enableWAL: false;
            };
        };
        readonly mcp: {
            readonly remoteMode: false;
            readonly servers: readonly [];
        };
        readonly treeView: {
            readonly refreshInterval: 0;
            readonly maxThoughtsPerSession: 10;
        };
        readonly logging: {
            readonly level: "error";
            readonly outputChannel: "Structural Thinking Test";
        };
    };
};
export {};
//# sourceMappingURL=ConfigValidation.d.ts.map