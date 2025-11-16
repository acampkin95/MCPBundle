"use strict";
/**
 * DatabaseService - Dual-mode database connectivity (PostgreSQL + SQLite)
 * Provides automatic fallback from PostgreSQL to SQLite for offline resilience
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const pg_1 = require("pg");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const types_1 = require("../types");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DatabaseService {
    config;
    credentialService;
    logger;
    pgPool;
    sqlite;
    currentMode = 'sqlite';
    isConnected = false;
    // Query result cache with TTL (5 minutes default)
    queryCache = new Map();
    cacheTTL = 5 * 60 * 1000; // 5 minutes
    cacheCleanupTimer;
    // Prepared statements cache for SQLite
    preparedStatements = new Map();
    constructor(config, credentialService, logger) {
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
    async initialize() {
        const mode = this.config.mode;
        try {
            if (mode === 'postgresql' || mode === 'auto') {
                await this.initializePostgreSQL();
                this.currentMode = 'postgresql';
                this.logger.appendLine('[DatabaseService] Using PostgreSQL mode');
            }
        }
        catch (error) {
            if (mode === 'postgresql') {
                // Strict PostgreSQL mode, don't fallback
                throw error;
            }
            this.logger.appendLine(`[DatabaseService] PostgreSQL unavailable: ${String(error)}`);
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
    async initializePostgreSQL() {
        if (!this.config.postgresql) {
            throw new types_1.DatabaseConnectionError('PostgreSQL configuration missing');
        }
        const pgConfig = this.config.postgresql;
        // Get credentials from secure storage
        const { username, password } = await this.credentialService.getDatabaseCredentials(pgConfig.host);
        this.pgPool = new pg_1.Pool({
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
            this.logger.appendLine(`[DatabaseService] PostgreSQL connected to ${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
        }
        finally {
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
    initializeSQLite() {
        if (!this.config.sqlite) {
            throw new types_1.DatabaseConnectionError('SQLite configuration missing');
        }
        const dbPath = this.config.sqlite.databasePath;
        // Ensure directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        this.sqlite = new better_sqlite3_1.default(dbPath);
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
    initializeSQLiteTables() {
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
    async getSessions(limit = 50) {
        if (this.currentMode === 'postgresql' && this.pgPool) {
            return this.getSessionsPostgreSQL(limit);
        }
        return this.getSessionsSQLite(limit);
    }
    async getSessionsPostgreSQL(limit) {
        if (!this.pgPool) {
            throw new types_1.DatabaseConnectionError('PostgreSQL not initialized');
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
    getSessionsSQLite(limit) {
        if (!this.sqlite) {
            throw new types_1.DatabaseConnectionError('SQLite not initialized');
        }
        // Try cache first
        const cacheKey = `sessions:${limit}`;
        const cached = this.getCachedQuery(cacheKey);
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
            throw new types_1.DatabaseConnectionError('Failed to prepare statement');
        }
        const rows = stmt.all(limit);
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
    async getThoughts(sessionId, limit = 100) {
        if (this.currentMode === 'postgresql' && this.pgPool) {
            return this.getThoughtsPostgreSQL(sessionId, limit);
        }
        return this.getThoughtsSQLite(sessionId, limit);
    }
    async getThoughtsPostgreSQL(sessionId, limit) {
        if (!this.pgPool) {
            throw new types_1.DatabaseConnectionError('PostgreSQL not initialized');
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
            stage: row.stage,
            content: row.content,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            qualityScore: row.quality_score ?? undefined,
            parentThoughtId: row.parent_thought_id ?? undefined,
            createdAt: new Date(row.created_at),
            updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        }));
    }
    getThoughtsSQLite(sessionId, limit) {
        if (!this.sqlite) {
            throw new types_1.DatabaseConnectionError('SQLite not initialized');
        }
        // Try cache first
        const cacheKey = `thoughts:${sessionId}:${limit}`;
        const cached = this.getCachedQuery(cacheKey);
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
            throw new types_1.DatabaseConnectionError('Failed to prepare statement');
        }
        const rows = stmt.all(sessionId, limit);
        const result = rows.map((row) => ({
            thoughtId: row.thought_id,
            sessionId: row.session_id,
            projectId: row.project_id ?? undefined,
            stage: row.stage,
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
    async createSession(sessionId, origin, projectId) {
        if (this.currentMode === 'postgresql' && this.pgPool) {
            return this.createSessionPostgreSQL(sessionId, origin, projectId);
        }
        return this.createSessionSQLite(sessionId, origin, projectId);
    }
    async createSessionPostgreSQL(sessionId, origin, projectId) {
        if (!this.pgPool) {
            throw new types_1.DatabaseConnectionError('PostgreSQL not initialized');
        }
        const query = `
      INSERT INTO thought_sessions (session_id, project_id, origin, created_at, last_active_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING session_id, project_id, origin, created_at, last_active_at
    `;
        const result = await this.pgPool.query(query, [sessionId, projectId ?? null, origin]);
        const row = result.rows[0];
        if (!row) {
            throw new types_1.DatabaseConnectionError('Failed to create session');
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
    createSessionSQLite(sessionId, origin, projectId) {
        if (!this.sqlite) {
            throw new types_1.DatabaseConnectionError('SQLite not initialized');
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
    async updateThought(thoughtId, updates) {
        if (this.currentMode === 'postgresql' && this.pgPool) {
            await this.updateThoughtPostgreSQL(thoughtId, updates);
        }
        else if (this.sqlite) {
            this.updateThoughtSQLite(thoughtId, updates);
        }
        this.logger.appendLine(`[DatabaseService] Updated thought: ${thoughtId}`);
    }
    async updateThoughtPostgreSQL(thoughtId, updates) {
        if (!this.pgPool) {
            throw new types_1.DatabaseConnectionError('PostgreSQL not initialized');
        }
        const setClauses = [];
        const values = [];
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
            const existing = await this.pgPool.query('SELECT metadata FROM structured_thoughts WHERE thought_id = $1', [thoughtId]);
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
    updateThoughtSQLite(thoughtId, updates) {
        if (!this.sqlite) {
            throw new types_1.DatabaseConnectionError('SQLite not initialized');
        }
        const setClauses = [];
        const values = [];
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
                .get(thoughtId);
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
    async deleteThought(thoughtId) {
        if (this.currentMode === 'postgresql' && this.pgPool) {
            await this.pgPool.query('DELETE FROM structured_thoughts WHERE thought_id = $1', [
                thoughtId,
            ]);
        }
        else if (this.sqlite) {
            this.sqlite.prepare('DELETE FROM structured_thoughts WHERE thought_id = ?').run(thoughtId);
        }
        this.logger.appendLine(`[DatabaseService] Deleted thought: ${thoughtId}`);
    }
    /**
     * Get current database mode
     */
    getMode() {
        return this.currentMode;
    }
    /**
     * Check connection status
     */
    isHealthy() {
        return this.isConnected;
    }
    /**
     * Get PostgreSQL connection pool statistics
     */
    getPoolStats() {
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
    clearCache() {
        this.queryCache.clear();
        this.logger.appendLine('[DatabaseService] Query cache cleared');
    }
    /**
     * Cleanup expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.queryCache.entries()) {
            if (now - entry.timestamp > this.cacheTTL) {
                this.queryCache.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            this.logger.appendLine(`[DatabaseService] Cleaned up ${removed} expired cache entries`);
        }
    }
    /**
     * Get or create prepared statement (SQLite only)
     */
    getPreparedStatement(sql) {
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
    getCachedQuery(cacheKey) {
        const cached = this.queryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        return null;
    }
    /**
     * Store query result in cache
     */
    setCachedQuery(cacheKey, data) {
        this.queryCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
        });
    }
    /**
     * Apply PostgreSQL migration for performance indexes
     */
    async applyPerformanceMigration() {
        if (this.currentMode !== 'postgresql' || !this.pgPool) {
            this.logger.appendLine('[DatabaseService] Skipping migration (not in PostgreSQL mode)');
            return;
        }
        try {
            const migrationPath = path.join(__dirname, '../database/migrations/001_add_performance_indexes.sql');
            if (!fs.existsSync(migrationPath)) {
                this.logger.appendLine('[DatabaseService] Migration file not found, skipping');
                return;
            }
            const migration = fs.readFileSync(migrationPath, 'utf8');
            await this.pgPool.query(migration);
            this.logger.appendLine('[DatabaseService] Performance migration applied successfully');
        }
        catch (error) {
            this.logger.appendLine(`[DatabaseService] Migration error: ${String(error)}`);
            // Don't throw - indexes may already exist
        }
    }
    /**
     * Close all connections
     */
    async dispose() {
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
    async query(sql, params = []) {
        if (this.currentMode === 'postgresql' && this.pgPool) {
            const result = await this.pgPool.query(sql, params);
            return result.rows;
        }
        if (this.sqlite) {
            const rows = this.sqlite.prepare(sql).all(...params);
            return rows;
        }
        throw new types_1.DatabaseConnectionError('No database connection available');
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=DatabaseService.js.map