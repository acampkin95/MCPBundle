/**
 * DatabaseService - Dual-mode database connectivity (PostgreSQL + SQLite)
 * Provides automatic fallback from PostgreSQL to SQLite for offline resilience
 */
import * as vscode from 'vscode';
import { CredentialService } from './CredentialService';
import { DatabaseConfig, DatabaseMode, StructuredThought, ThoughtSession, ThoughtMetadata } from '../types';
interface PoolStats {
    readonly total: number;
    readonly idle: number;
    readonly waiting: number;
}
export declare class DatabaseService {
    private readonly config;
    private readonly credentialService;
    private readonly logger;
    private pgPool?;
    private sqlite?;
    private currentMode;
    private isConnected;
    private readonly queryCache;
    private readonly cacheTTL;
    private cacheCleanupTimer?;
    private readonly preparedStatements;
    constructor(config: DatabaseConfig, credentialService: CredentialService, logger: vscode.OutputChannel);
    /**
     * Initialize database connection(s)
     */
    initialize(): Promise<void>;
    /**
     * Initialize PostgreSQL connection pool
     */
    private initializePostgreSQL;
    /**
     * Initialize SQLite database
     */
    private initializeSQLite;
    /**
     * Create SQLite tables matching PostgreSQL schema subset
     */
    private initializeSQLiteTables;
    /**
     * Get all thought sessions
     */
    getSessions(limit?: number): Promise<ThoughtSession[]>;
    private getSessionsPostgreSQL;
    private getSessionsSQLite;
    /**
     * Get thoughts for a session
     */
    getThoughts(sessionId: string, limit?: number): Promise<StructuredThought[]>;
    private getThoughtsPostgreSQL;
    private getThoughtsSQLite;
    /**
     * Create new thought session
     */
    createSession(sessionId: string, origin: string, projectId?: string): Promise<ThoughtSession>;
    private createSessionPostgreSQL;
    private createSessionSQLite;
    /**
     * Update thought content and metadata
     */
    updateThought(thoughtId: string, updates: {
        readonly content?: string;
        readonly metadata?: Partial<ThoughtMetadata>;
        readonly qualityScore?: number;
    }): Promise<void>;
    private updateThoughtPostgreSQL;
    private updateThoughtSQLite;
    /**
     * Delete thought
     */
    deleteThought(thoughtId: string): Promise<void>;
    /**
     * Get current database mode
     */
    getMode(): DatabaseMode;
    /**
     * Check connection status
     */
    isHealthy(): boolean;
    /**
     * Get PostgreSQL connection pool statistics
     */
    getPoolStats(): PoolStats | null;
    /**
     * Clear query result cache
     */
    clearCache(): void;
    /**
     * Cleanup expired cache entries
     */
    private cleanupCache;
    /**
     * Get or create prepared statement (SQLite only)
     */
    private getPreparedStatement;
    /**
     * Execute query with caching (use for read-only queries)
     */
    private getCachedQuery;
    /**
     * Store query result in cache
     */
    private setCachedQuery;
    /**
     * Apply PostgreSQL migration for performance indexes
     */
    applyPerformanceMigration(): Promise<void>;
    /**
     * Close all connections
     */
    dispose(): Promise<void>;
    /**
     * Execute raw query (use with caution)
     */
    query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}
export {};
//# sourceMappingURL=DatabaseService.d.ts.map