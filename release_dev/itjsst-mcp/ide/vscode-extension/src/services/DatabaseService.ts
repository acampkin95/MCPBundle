/**
 * DatabaseService - Dual-mode database connectivity (PostgreSQL + SQLite)
 * Provides automatic fallback from PostgreSQL to SQLite for offline resilience
 */

import * as vscode from 'vscode';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import { CredentialService } from './CredentialService';
import {
  DatabaseConfig,
  DatabaseMode,
  DatabaseConnectionError,
  StructuredThought,
  ThoughtSession,
  CognitiveStage,
  ThoughtMetadata,
} from '../types';
import * as path from 'path';
import * as fs from 'fs';

interface PoolStats {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
}

interface QueryCacheEntry<T> {
  readonly data: T;
  readonly timestamp: number;
}

export class DatabaseService {
  private readonly config: DatabaseConfig;
  private readonly credentialService: CredentialService;
  private readonly logger: vscode.OutputChannel;

  private pgPool?: Pool;
  private sqlite?: Database.Database;
  private currentMode: DatabaseMode = 'sqlite';
  private isConnected = false;

  // Query result cache with TTL (5 minutes default)
  private readonly queryCache = new Map<string, QueryCacheEntry<unknown>>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private cacheCleanupTimer?: NodeJS.Timeout;

  // Prepared statements cache for SQLite
  private readonly preparedStatements = new Map<string, Database.Statement>();

  constructor(
    config: DatabaseConfig,
    credentialService: CredentialService,
    logger: vscode.OutputChannel
  ) {
    this.config = config;
    this.credentialService = credentialService;
    this.logger = logger;

    // Setup cache cleanup every minute
    this.cacheCleanupTimer = setInterval(() => {
      this.cleanupCache();
    }, 60 * 1000);
  }

  /**
   * Initialize database connection(s)
   */
  public async initialize(): Promise<void> {
    const mode = this.config.mode;

    try {
      if (mode === 'postgresql' || mode === 'auto') {
        await this.initializePostgreSQL();
        this.currentMode = 'postgresql';
        this.logger.appendLine('[DatabaseService] Using PostgreSQL mode');
      }
    } catch (error) {
      if (mode === 'postgresql') {
        // Strict PostgreSQL mode, don't fallback
        throw error;
      }

      this.logger.appendLine(
        `[DatabaseService] PostgreSQL unavailable: ${String(error)}`
      );
      this.logger.appendLine('[DatabaseService] Falling back to SQLite mode');
    }

    // Initialize SQLite (either as primary or fallback)
    if (this.currentMode === 'sqlite' || mode === 'auto') {
      this.initializeSQLite();
      this.currentMode = 'sqlite';
      this.logger.appendLine('[DatabaseService] Using SQLite mode');
    }

    this.isConnected = true;
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  private async initializePostgreSQL(): Promise<void> {
    if (!this.config.postgresql) {
      throw new DatabaseConnectionError('PostgreSQL configuration missing');
    }

    const pgConfig = this.config.postgresql;

    // Get credentials from secure storage
    const { username, password } = await this.credentialService.getDatabaseCredentials(
      pgConfig.host
    );

    this.pgPool = new Pool({
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      user: username,
      password: password,
      max: pgConfig.poolSize,
      connectionTimeoutMillis: pgConfig.connectionTimeout ?? 10000,
      idleTimeoutMillis: pgConfig.idleTimeout ?? 30000,
    });

    // Test connection
    const client = await this.pgPool.connect();
    try {
      await client.query('SELECT 1');
      this.logger.appendLine(
        `[DatabaseService] PostgreSQL connected to ${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`
      );
    } finally {
      client.release();
    }

    // Setup error handlers
    this.pgPool.on('error', (err) => {
      this.logger.appendLine(`[DatabaseService] PostgreSQL pool error: ${String(err)}`);
    });
  }

  /**
   * Initialize SQLite database
   */
  private initializeSQLite(): void {
    if (!this.config.sqlite) {
      throw new DatabaseConnectionError('SQLite configuration missing');
    }

    const dbPath = this.config.sqlite.databasePath;

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.sqlite = new Database(dbPath);

    if (this.config.sqlite.enableWAL ?? true) {
      this.sqlite.pragma('journal_mode = WAL');
    }

    // Create tables if they don't exist
    this.initializeSQLiteTables();

    this.logger.appendLine(`[DatabaseService] SQLite database at ${dbPath}`);
  }

  /**
   * Create SQLite tables matching PostgreSQL schema subset
   */
  private initializeSQLiteTables(): void {
    if (!this.sqlite) {
      return;
    }

    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS thought_sessions (
        session_id TEXT PRIMARY KEY,
        project_id TEXT,
        project_name TEXT,
        origin TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createThoughtsTable = `
      CREATE TABLE IF NOT EXISTS structured_thoughts (
        thought_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        project_id TEXT,
        stage TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        quality_score INTEGER,
        parent_thought_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY (session_id) REFERENCES thought_sessions(session_id)
      )
    `;

    // Enhanced indexes for performance
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_thoughts_session ON structured_thoughts(session_id);
      CREATE INDEX IF NOT EXISTS idx_thoughts_stage ON structured_thoughts(stage);
      CREATE INDEX IF NOT EXISTS idx_thoughts_created ON structured_thoughts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_thoughts_updated ON structured_thoughts(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_thoughts_quality ON structured_thoughts(quality_score DESC);
      CREATE INDEX IF NOT EXISTS idx_thoughts_session_stage ON structured_thoughts(session_id, stage);
      CREATE INDEX IF NOT EXISTS idx_thoughts_project ON structured_thoughts(project_id);
      CREATE INDEX IF NOT EXISTS idx_thoughts_parent ON structured_thoughts(parent_thought_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON thought_sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_active ON thought_sessions(last_active_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON thought_sessions(project_id);
    `;

    this.sqlite.exec([createSessionsTable, createThoughtsTable, createIndexes].join(';'));

    // Optimize SQLite performance
    this.sqlite.pragma('cache_size = -64000'); // 64MB cache
    this.sqlite.pragma('temp_store = MEMORY');
    this.sqlite.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O
    this.sqlite.pragma('optimize'); // Query optimizer
  }

  /**
   * Get all thought sessions
   */
  public async getSessions(limit = 50): Promise<ThoughtSession[]> {
    if (this.currentMode === 'postgresql' && this.pgPool) {
      return this.getSessionsPostgreSQL(limit);
    }

    return this.getSessionsSQLite(limit);
  }

  private async getSessionsPostgreSQL(limit: number): Promise<ThoughtSession[]> {
    if (!this.pgPool) {
      throw new DatabaseConnectionError('PostgreSQL not initialized');
    }

    const query = `
      SELECT
        ts.session_id,
        ts.project_id,
        p.project_name,
        ts.origin,
        ts.created_at,
        ts.last_active_at,
        COUNT(st.thought_id) as thought_count
      FROM thought_sessions ts
      LEFT JOIN projects p ON ts.project_id = p.project_id
      LEFT JOIN structured_thoughts st ON ts.session_id = st.session_id
      GROUP BY ts.session_id, ts.project_id, p.project_name, ts.origin, ts.created_at, ts.last_active_at
      ORDER BY ts.last_active_at DESC
      LIMIT $1
    `;

    const result = await this.pgPool.query(query, [limit]);

    return result.rows.map((row) => ({
      sessionId: row.session_id,
      projectId: row.project_id ?? undefined,
      projectName: row.project_name ?? undefined,
      origin: row.origin,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      thoughtCount: parseInt(row.thought_count, 10),
    }));
  }

  private getSessionsSQLite(limit: number): ThoughtSession[] {
    if (!this.sqlite) {
      throw new DatabaseConnectionError('SQLite not initialized');
    }

    // Try cache first
    const cacheKey = `sessions:${limit}`;
    const cached = this.getCachedQuery<ThoughtSession[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = `
      SELECT
        ts.session_id,
        ts.project_id,
        ts.project_name,
        ts.origin,
        ts.created_at,
        ts.last_active_at,
        COUNT(st.thought_id) as thought_count
      FROM thought_sessions ts
      LEFT JOIN structured_thoughts st ON ts.session_id = st.session_id
      GROUP BY ts.session_id, ts.project_id, ts.project_name, ts.origin, ts.created_at, ts.last_active_at
      ORDER BY ts.last_active_at DESC
      LIMIT ?
    `;

    // Use prepared statement
    const stmt = this.getPreparedStatement(query);
    if (!stmt) {
      throw new DatabaseConnectionError('Failed to prepare statement');
    }

    const rows = stmt.all(limit) as Array<{
      session_id: string;
      project_id: string | null;
      project_name: string | null;
      origin: string;
      created_at: string;
      last_active_at: string;
      thought_count: number;
    }>;

    const result = rows.map((row) => ({
      sessionId: row.session_id,
      projectId: row.project_id ?? undefined,
      projectName: row.project_name ?? undefined,
      origin: row.origin,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      thoughtCount: row.thought_count,
    }));

    // Cache the result
    this.setCachedQuery(cacheKey, result);

    return result;
  }

  /**
   * Get thoughts for a session
   */
  public async getThoughts(
    sessionId: string,
    limit = 100
  ): Promise<StructuredThought[]> {
    if (this.currentMode === 'postgresql' && this.pgPool) {
      return this.getThoughtsPostgreSQL(sessionId, limit);
    }

    return this.getThoughtsSQLite(sessionId, limit);
  }

  private async getThoughtsPostgreSQL(
    sessionId: string,
    limit: number
  ): Promise<StructuredThought[]> {
    if (!this.pgPool) {
      throw new DatabaseConnectionError('PostgreSQL not initialized');
    }

    const query = `
      SELECT
        thought_id,
        session_id,
        project_id,
        stage,
        content,
        metadata,
        quality_score,
        parent_thought_id,
        created_at,
        updated_at
      FROM structured_thoughts
      WHERE session_id = $1
      ORDER BY created_at ASC
      LIMIT $2
    `;

    const result = await this.pgPool.query(query, [sessionId, limit]);

    return result.rows.map((row) => ({
      thoughtId: row.thought_id,
      sessionId: row.session_id,
      projectId: row.project_id ?? undefined,
      stage: row.stage as CognitiveStage,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      qualityScore: row.quality_score ?? undefined,
      parentThoughtId: row.parent_thought_id ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    }));
  }

  private getThoughtsSQLite(sessionId: string, limit: number): StructuredThought[] {
    if (!this.sqlite) {
      throw new DatabaseConnectionError('SQLite not initialized');
    }

    // Try cache first
    const cacheKey = `thoughts:${sessionId}:${limit}`;
    const cached = this.getCachedQuery<StructuredThought[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = `
      SELECT
        thought_id,
        session_id,
        project_id,
        stage,
        content,
        metadata,
        quality_score,
        parent_thought_id,
        created_at,
        updated_at
      FROM structured_thoughts
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `;

    // Use prepared statement
    const stmt = this.getPreparedStatement(query);
    if (!stmt) {
      throw new DatabaseConnectionError('Failed to prepare statement');
    }

    const rows = stmt.all(sessionId, limit) as Array<{
      thought_id: string;
      session_id: string;
      project_id: string | null;
      stage: string;
      content: string;
      metadata: string | null;
      quality_score: number | null;
      parent_thought_id: string | null;
      created_at: string;
      updated_at: string | null;
    }>;

    const result = rows.map((row) => ({
      thoughtId: row.thought_id,
      sessionId: row.session_id,
      projectId: row.project_id ?? undefined,
      stage: row.stage as CognitiveStage,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      qualityScore: row.quality_score ?? undefined,
      parentThoughtId: row.parent_thought_id ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    }));

    // Cache the result
    this.setCachedQuery(cacheKey, result);

    return result;
  }

  /**
   * Create new thought session
   */
  public async createSession(
    sessionId: string,
    origin: string,
    projectId?: string
  ): Promise<ThoughtSession> {
    if (this.currentMode === 'postgresql' && this.pgPool) {
      return this.createSessionPostgreSQL(sessionId, origin, projectId);
    }

    return this.createSessionSQLite(sessionId, origin, projectId);
  }

  private async createSessionPostgreSQL(
    sessionId: string,
    origin: string,
    projectId?: string
  ): Promise<ThoughtSession> {
    if (!this.pgPool) {
      throw new DatabaseConnectionError('PostgreSQL not initialized');
    }

    const query = `
      INSERT INTO thought_sessions (session_id, project_id, origin, created_at, last_active_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING session_id, project_id, origin, created_at, last_active_at
    `;

    const result = await this.pgPool.query(query, [sessionId, projectId ?? null, origin]);
    const row = result.rows[0];

    if (!row) {
      throw new DatabaseConnectionError('Failed to create session');
    }

    return {
      sessionId: row.session_id,
      projectId: row.project_id ?? undefined,
      origin: row.origin,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      thoughtCount: 0,
    };
  }

  private createSessionSQLite(
    sessionId: string,
    origin: string,
    projectId?: string
  ): ThoughtSession {
    if (!this.sqlite) {
      throw new DatabaseConnectionError('SQLite not initialized');
    }

    const query = `
      INSERT INTO thought_sessions (session_id, project_id, origin, created_at, last_active_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `;

    this.sqlite.prepare(query).run(sessionId, projectId ?? null, origin);

    const now = new Date();

    return {
      sessionId,
      projectId,
      origin,
      createdAt: now,
      lastActiveAt: now,
      thoughtCount: 0,
    };
  }

  /**
   * Update thought content and metadata
   */
  public async updateThought(
    thoughtId: string,
    updates: {
      readonly content?: string;
      readonly metadata?: Partial<ThoughtMetadata>;
      readonly qualityScore?: number;
    }
  ): Promise<void> {
    if (this.currentMode === 'postgresql' && this.pgPool) {
      await this.updateThoughtPostgreSQL(thoughtId, updates);
    } else if (this.sqlite) {
      this.updateThoughtSQLite(thoughtId, updates);
    }

    this.logger.appendLine(`[DatabaseService] Updated thought: ${thoughtId}`);
  }

  private async updateThoughtPostgreSQL(
    thoughtId: string,
    updates: {
      readonly content?: string;
      readonly metadata?: Partial<ThoughtMetadata>;
      readonly qualityScore?: number;
    }
  ): Promise<void> {
    if (!this.pgPool) {
      throw new DatabaseConnectionError('PostgreSQL not initialized');
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.content !== undefined) {
      setClauses.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }

    if (updates.qualityScore !== undefined) {
      setClauses.push(`quality_score = $${paramIndex++}`);
      values.push(updates.qualityScore);
    }

    if (updates.metadata !== undefined) {
      // Fetch existing metadata and merge
      const existing = await this.pgPool.query(
        'SELECT metadata FROM structured_thoughts WHERE thought_id = $1',
        [thoughtId]
      );

      const currentMetadata = existing.rows[0]?.metadata || {};
      const mergedMetadata = { ...currentMetadata, ...updates.metadata };

      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(mergedMetadata));
    }

    if (setClauses.length === 0) {
      return; // Nothing to update
    }

    // Always update updated_at
    setClauses.push(`updated_at = NOW()`);
    values.push(thoughtId); // For WHERE clause

    const query = `
      UPDATE structured_thoughts
      SET ${setClauses.join(', ')}
      WHERE thought_id = $${paramIndex}
    `;

    await this.pgPool.query(query, values);
  }

  private updateThoughtSQLite(
    thoughtId: string,
    updates: {
      readonly content?: string;
      readonly metadata?: Partial<ThoughtMetadata>;
      readonly qualityScore?: number;
    }
  ): void {
    if (!this.sqlite) {
      throw new DatabaseConnectionError('SQLite not initialized');
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      values.push(updates.content);
    }

    if (updates.qualityScore !== undefined) {
      setClauses.push('quality_score = ?');
      values.push(updates.qualityScore);
    }

    if (updates.metadata !== undefined) {
      // Fetch existing metadata and merge
      const existing = this.sqlite
        .prepare('SELECT metadata FROM structured_thoughts WHERE thought_id = ?')
        .get(thoughtId) as { metadata: string | null } | undefined;

      const currentMetadata = existing?.metadata ? JSON.parse(existing.metadata) : {};
      const mergedMetadata = { ...currentMetadata, ...updates.metadata };

      setClauses.push('metadata = ?');
      values.push(JSON.stringify(mergedMetadata));
    }

    if (setClauses.length === 0) {
      return; // Nothing to update
    }

    // Always update updated_at
    setClauses.push(`updated_at = datetime('now')`);
    values.push(thoughtId); // For WHERE clause

    const query = `
      UPDATE structured_thoughts
      SET ${setClauses.join(', ')}
      WHERE thought_id = ?
    `;

    this.sqlite.prepare(query).run(...values);
  }

  /**
   * Delete thought
   */
  public async deleteThought(thoughtId: string): Promise<void> {
    if (this.currentMode === 'postgresql' && this.pgPool) {
      await this.pgPool.query('DELETE FROM structured_thoughts WHERE thought_id = $1', [
        thoughtId,
      ]);
    } else if (this.sqlite) {
      this.sqlite.prepare('DELETE FROM structured_thoughts WHERE thought_id = ?').run(thoughtId);
    }

    this.logger.appendLine(`[DatabaseService] Deleted thought: ${thoughtId}`);
  }

  /**
   * Get current database mode
   */
  public getMode(): DatabaseMode {
    return this.currentMode;
  }

  /**
   * Check connection status
   */
  public isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get PostgreSQL connection pool statistics
   */
  public getPoolStats(): PoolStats | null {
    if (!this.pgPool || this.currentMode !== 'postgresql') {
      return null;
    }

    return {
      total: this.pgPool.totalCount,
      idle: this.pgPool.idleCount,
      waiting: this.pgPool.waitingCount,
    };
  }

  /**
   * Clear query result cache
   */
  public clearCache(): void {
    this.queryCache.clear();
    this.logger.appendLine('[DatabaseService] Query cache cleared');
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.queryCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.appendLine(
        `[DatabaseService] Cleaned up ${removed} expired cache entries`
      );
    }
  }

  /**
   * Get or create prepared statement (SQLite only)
   */
  private getPreparedStatement(sql: string): Database.Statement | null {
    if (!this.sqlite) {
      return null;
    }

    let stmt = this.preparedStatements.get(sql);
    if (!stmt) {
      stmt = this.sqlite.prepare(sql);
      this.preparedStatements.set(sql, stmt);
    }

    return stmt;
  }

  /**
   * Execute query with caching (use for read-only queries)
   */
  private getCachedQuery<T>(cacheKey: string): T | null {
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * Store query result in cache
   */
  private setCachedQuery<T>(cacheKey: string, data: T): void {
    this.queryCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Apply PostgreSQL migration for performance indexes
   */
  public async applyPerformanceMigration(): Promise<void> {
    if (this.currentMode !== 'postgresql' || !this.pgPool) {
      this.logger.appendLine(
        '[DatabaseService] Skipping migration (not in PostgreSQL mode)'
      );
      return;
    }

    try {
      const migrationPath = path.join(
        __dirname,
        '../database/migrations/001_add_performance_indexes.sql'
      );

      if (!fs.existsSync(migrationPath)) {
        this.logger.appendLine(
          '[DatabaseService] Migration file not found, skipping'
        );
        return;
      }

      const migration = fs.readFileSync(migrationPath, 'utf8');
      await this.pgPool.query(migration);

      this.logger.appendLine(
        '[DatabaseService] Performance migration applied successfully'
      );
    } catch (error) {
      this.logger.appendLine(
        `[DatabaseService] Migration error: ${String(error)}`
      );
      // Don't throw - indexes may already exist
    }
  }

  /**
   * Close all connections
   */
  public async dispose(): Promise<void> {
    // Clear timers
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
    }

    // Close prepared statements (SQLite auto-closes on db.close())
    this.preparedStatements.clear();

    // Clear cache
    this.queryCache.clear();

    // Close database connections
    if (this.pgPool) {
      await this.pgPool.end();
      this.logger.appendLine('[DatabaseService] PostgreSQL pool closed');
    }

    if (this.sqlite) {
      this.sqlite.close();
      this.logger.appendLine('[DatabaseService] SQLite database closed');
    }

    this.isConnected = false;
  }

  /**
   * Execute raw query (use with caution)
   */
  public async query<T = unknown>(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<T[]> {
    if (this.currentMode === 'postgresql' && this.pgPool) {
      const result = await this.pgPool.query(sql, params as unknown[]);
      return result.rows as T[];
    }

    if (this.sqlite) {
      const rows = this.sqlite.prepare(sql).all(...params);
      return rows as T[];
    }

    throw new DatabaseConnectionError('No database connection available');
  }
}
