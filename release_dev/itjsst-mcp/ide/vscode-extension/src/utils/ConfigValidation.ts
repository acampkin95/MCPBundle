/**
 * Configuration Validation with Zod
 * Ensures type-safe configuration with runtime validation
 */

import { z } from 'zod';
import type { ExtensionConfig } from '../types';

/**
 * Database mode schema
 */
const DatabaseModeSchema = z.enum(['sqlite', 'postgresql', 'auto']);

/**
 * Log level schema
 */
const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);

/**
 * PostgreSQL configuration schema
 */
const PostgreSQLConfigSchema = z.object({
  host: z.string().min(1, 'PostgreSQL host is required'),
  port: z
    .number()
    .int('Port must be an integer')
    .min(1, 'Port must be at least 1')
    .max(65535, 'Port must be at most 65535'),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  poolSize: z
    .number()
    .int('Pool size must be an integer')
    .min(1, 'Pool size must be at least 1')
    .max(100, 'Pool size must be at most 100')
    .default(5),
  connectionTimeout: z
    .number()
    .int('Connection timeout must be an integer')
    .min(1000, 'Connection timeout must be at least 1000ms')
    .default(10000),
  idleTimeout: z
    .number()
    .int('Idle timeout must be an integer')
    .min(1000, 'Idle timeout must be at least 1000ms')
    .default(30000),
});

/**
 * SQLite configuration schema
 */
const SQLiteConfigSchema = z.object({
  databasePath: z.string().min(1, 'Database path is required'),
  enableWAL: z.boolean().default(true),
});

/**
 * Database configuration schema
 */
const DatabaseConfigSchema = z.object({
  mode: DatabaseModeSchema.default('auto'),
  postgresql: PostgreSQLConfigSchema.optional(),
  sqlite: SQLiteConfigSchema,
});

/**
 * SSH configuration schema
 */
const SSHConfigSchema = z.object({
  host: z.string().min(1, 'SSH host is required'),
  port: z
    .number()
    .int('SSH port must be an integer')
    .min(1, 'SSH port must be at least 1')
    .max(65535, 'SSH port must be at most 65535')
    .default(22),
  username: z.string().min(1, 'SSH username is required'),
  privateKeyPath: z.string().optional(),
  password: z.string().optional(),
});

/**
 * MCP server configuration schema
 */
const MCPServerConfigSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  displayName: z.string().min(1, 'Display name is required'),
  remotePath: z.string().min(1, 'Remote path is required'),
  localPath: z.string().optional(),
  enabled: z.boolean().default(true),
});

/**
 * MCP configuration schema
 */
const MCPConfigSchema = z.object({
  remoteMode: z.boolean().default(true),
  ssh: SSHConfigSchema.optional(),
  servers: z.array(MCPServerConfigSchema).min(1, 'At least one MCP server is required'),
});

/**
 * Tree view configuration schema
 */
const TreeViewConfigSchema = z.object({
  refreshInterval: z
    .number()
    .int('Refresh interval must be an integer')
    .min(0, 'Refresh interval must be at least 0 (0 to disable)')
    .max(60000, 'Refresh interval must be at most 60000ms')
    .default(5000),
  maxThoughtsPerSession: z
    .number()
    .int('Max thoughts must be an integer')
    .min(1, 'Max thoughts must be at least 1')
    .max(1000, 'Max thoughts must be at most 1000')
    .default(100),
});

/**
 * Logging configuration schema
 */
const LoggingConfigSchema = z.object({
  level: LogLevelSchema.default('info'),
  outputChannel: z.string().default('Structural Thinking'),
});

/**
 * Full extension configuration schema
 */
export const ExtensionConfigSchema = z.object({
  database: DatabaseConfigSchema,
  mcp: MCPConfigSchema,
  treeView: TreeViewConfigSchema,
  logging: LoggingConfigSchema,
});

/**
 * Validate extension configuration
 */
export function validateConfig(config: unknown): ExtensionConfig {
  return ExtensionConfigSchema.parse(config);
}

/**
 * Validate extension configuration with safe parsing
 */
export function validateConfigSafe(config: unknown): {
  success: boolean;
  data?: ExtensionConfig;
  error?: z.ZodError;
} {
  const result = ExtensionConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

/**
 * Get human-readable validation error messages
 */
export function formatValidationErrors(error: z.ZodError): string[] {
  return error.errors.map((err) => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });
}

/**
 * Validate PostgreSQL connection configuration
 */
export function validatePostgreSQLConfig(config: unknown): z.infer<typeof PostgreSQLConfigSchema> {
  return PostgreSQLConfigSchema.parse(config);
}

/**
 * Validate SQLite configuration
 */
export function validateSQLiteConfig(config: unknown): z.infer<typeof SQLiteConfigSchema> {
  return SQLiteConfigSchema.parse(config);
}

/**
 * Validate MCP server configuration
 */
export function validateMCPServerConfig(config: unknown): z.infer<typeof MCPServerConfigSchema> {
  return MCPServerConfigSchema.parse(config);
}

/**
 * Configuration presets for common scenarios
 */
export const ConfigPresets = {
  development: {
    database: {
      mode: 'sqlite' as const,
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
      level: 'debug' as const,
      outputChannel: 'Structural Thinking',
    },
  },

  production: {
    database: {
      mode: 'postgresql' as const,
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
      level: 'info' as const,
      outputChannel: 'Structural Thinking',
    },
  },

  testing: {
    database: {
      mode: 'sqlite' as const,
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
      level: 'error' as const,
      outputChannel: 'Structural Thinking Test',
    },
  },
} as const;
