/**
 * Core type definitions for Structural Thinking Manager extension
 */
export type CognitiveStage = 'problem_definition' | 'research' | 'analysis' | 'synthesis' | 'conclusion' | 'reflection' | 'implementation' | 'validation';
export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';
export type DatabaseMode = 'sqlite' | 'postgresql' | 'auto';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
/**
 * Thought metadata structure matching PostgreSQL schema
 */
export interface ThoughtMetadata {
    readonly source?: string;
    readonly tags?: readonly string[];
    readonly importance?: ImportanceLevel;
    readonly externalRefs?: readonly string[];
    readonly thoughtNumber?: number;
    readonly totalThoughts?: number;
    readonly nextThoughtNeeded?: boolean;
    readonly needsMoreThoughts?: boolean;
    readonly isRevision?: boolean;
    readonly revisesThought?: number;
    readonly branchFromThought?: number;
    readonly branchId?: string;
    readonly qualityScore?: number;
    readonly stageLabel?: string;
    readonly devOpsCategory?: string;
    readonly debugLayer?: string;
    readonly schemaEntities?: readonly string[];
    readonly runtimeStack?: readonly string[];
}
/**
 * Structured thought from database
 */
export interface StructuredThought {
    readonly thoughtId: string;
    readonly sessionId: string;
    readonly projectId?: string;
    readonly stage: CognitiveStage;
    readonly content: string;
    readonly metadata?: ThoughtMetadata;
    readonly qualityScore?: number;
    readonly parentThoughtId?: string;
    readonly createdAt: Date;
    readonly updatedAt?: Date;
}
/**
 * Thought session information
 */
export interface ThoughtSession {
    readonly sessionId: string;
    readonly projectId?: string;
    readonly projectName?: string;
    readonly origin: string;
    readonly createdAt: Date;
    readonly lastActiveAt: Date;
    readonly thoughtCount: number;
}
/**
 * Database configuration
 */
export interface DatabaseConfig {
    readonly mode: DatabaseMode;
    readonly postgresql?: PostgreSQLConfig;
    readonly sqlite?: SQLiteConfig;
}
export interface PostgreSQLConfig {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly username: string;
    readonly password: string;
    readonly poolSize: number;
    readonly connectionTimeout?: number;
    readonly idleTimeout?: number;
}
export interface SQLiteConfig {
    readonly databasePath: string;
    readonly enableWAL?: boolean;
}
/**
 * MCP Client configuration
 */
export interface MCPConfig {
    readonly remoteMode: boolean;
    readonly ssh?: SSHConfig;
    readonly servers: MCPServerConfig[];
}
export interface SSHConfig {
    readonly host: string;
    readonly port?: number;
    readonly username: string;
    readonly password?: string;
    readonly privateKeyPath?: string;
}
export interface MCPServerConfig {
    readonly name: string;
    readonly displayName: string;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly remotePath?: string;
    readonly enabled: boolean;
}
/**
 * MCP Tool invocation result
 */
export interface MCPToolResult<T = unknown> {
    readonly content: readonly MCPContent[];
    readonly structuredContent?: T;
    readonly isError?: boolean;
}
export interface MCPContent {
    readonly type: 'text' | 'image' | 'resource';
    readonly text?: string;
    readonly data?: string;
    readonly mimeType?: string;
}
/**
 * Tree view item types
 */
export type TreeItemType = 'session' | 'thought' | 'stage' | 'project';
export interface ThinkingTreeItem {
    readonly type: TreeItemType;
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly tooltip?: string;
    readonly contextValue?: string;
    readonly children?: ThinkingTreeItem[];
    readonly metadata?: Record<string, unknown>;
}
/**
 * Extension configuration
 */
export interface ExtensionConfig {
    readonly database: DatabaseConfig;
    readonly mcp: MCPConfig;
    readonly treeView: TreeViewConfig;
    readonly logging: LoggingConfig;
}
export interface TreeViewConfig {
    readonly refreshInterval: number;
    readonly maxThoughtsPerSession: number;
}
export interface LoggingConfig {
    readonly level: LogLevel;
    readonly outputChannel?: string;
}
/**
 * Error types
 */
export declare class DatabaseConnectionError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
export declare class MCPConnectionError extends Error {
    readonly serverName: string;
    readonly cause?: unknown | undefined;
    constructor(message: string, serverName: string, cause?: unknown | undefined);
}
export declare class CredentialError extends Error {
    readonly credentialKey: string;
    constructor(message: string, credentialKey: string);
}
/**
 * Health status types
 */
export interface HealthStatus {
    readonly healthy: boolean;
    readonly status: 'healthy' | 'degraded' | 'unhealthy';
    readonly checks: HealthCheck[];
    readonly timestamp: Date;
}
export interface HealthCheck {
    readonly name: string;
    readonly status: 'pass' | 'fail' | 'warn';
    readonly message?: string;
    readonly latencyMs?: number;
}
/**
 * Research query types
 */
export interface ResearchQuery {
    readonly queryId: string;
    readonly queryText: string;
    readonly context?: string;
    readonly sessionId?: string;
    readonly createdAt: Date;
}
export interface ResearchResult {
    readonly queryId: string;
    readonly response: string;
    readonly sources?: readonly string[];
    readonly cached: boolean;
    readonly timestamp: Date;
}
//# sourceMappingURL=index.d.ts.map