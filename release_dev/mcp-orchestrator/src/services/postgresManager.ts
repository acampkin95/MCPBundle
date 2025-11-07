import pg from "pg";
import { logger } from "../utils/logger.js";
import type { CommandRunner } from "../utils/commandRunner.js";
import { validateDatabaseName, sanitizeShellArg } from "../utils/validators.js";

const { Pool } = pg;

export interface ConnectionStats {
  readonly total: number;
  readonly byState: Record<string, number>;
  readonly idle: number;
  readonly active: number;
  readonly waiting: number;
}

export interface ReplicationMetrics {
  readonly isReplica: boolean;
  readonly replicationState?: string;
  readonly primaryHost?: string;
  readonly lagBytes?: number;
  readonly lagSeconds?: number;
  readonly lastWalReceive?: string;
  readonly lastWalReplay?: string;
}

export interface TableBloat {
  readonly schemaName: string;
  readonly tableName: string;
  readonly realSizeMB: number;
  readonly extraSizeMB: number;
  readonly bloatPct: number;
  readonly deadTuples: number;
}

export interface SlowQuery {
  readonly query: string;
  readonly calls: number;
  readonly totalTimeMs: number;
  readonly meanTimeMs: number;
  readonly maxTimeMs: number;
  readonly rows: number;
}

export interface IndexStats {
  readonly schemaName: string;
  readonly tableName: string;
  readonly indexName: string;
  readonly indexSizeMB: number;
  readonly scans: number;
  readonly tuplesRead: number;
  readonly tuplesFetched: number;
  readonly isUnused: boolean;
}

export interface VacuumResult {
  readonly database: string;
  readonly analyze: boolean;
  readonly durationMs: number;
  readonly success: boolean;
  readonly output: string;
}

export interface ReindexResult {
  readonly database: string;
  readonly tablesReindexed: number;
  readonly durationMs: number;
  readonly success: boolean;
  readonly output: string;
}

export interface BackupResult {
  readonly backupPath: string;
  readonly database: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly success: boolean;
}

export class PostgresManagerService {
  private readonly pool: pg.Pool;

  public constructor(
    private readonly runner: CommandRunner,
    connectionConfig?: pg.PoolConfig,
  ) {
    this.pool = new Pool(
      connectionConfig ?? {
        host: process.env.POSTGRES_HOST ?? "localhost",
        port: Number(process.env.POSTGRES_PORT ?? 5432),
        user: process.env.POSTGRES_USER ?? "postgres",
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB ?? "postgres",
        max: Number(process.env.POSTGRES_MAX_CONNECTIONS ?? 20),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      },
    );

    logger.info("PostgresManagerService initialized", {
      host: this.pool.options.host,
      database: this.pool.options.database,
    });
  }

  public async getActiveConnections(): Promise<ConnectionStats> {
    const query = `
      SELECT
        state,
        count(*) as count
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
      GROUP BY state
    `;

    const result = await this.pool.query<{ state: string | null; count: string }>(query);

    const byState: Record<string, number> = {};
    let idle = 0;
    let active = 0;
    let waiting = 0;

    for (const row of result.rows) {
      const state = row.state ?? "null";
      const count = Number(row.count);
      byState[state] = count;

      if (state === "idle") {
        idle = count;
      } else if (state === "active") {
        active = count;
      } else if (state === "idle in transaction" || state === "idle in transaction (aborted)") {
        waiting += count;
      }
    }

    const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);

    return {
      total,
      byState,
      idle,
      active,
      waiting,
    };
  }

  public async getReplicationLag(): Promise<ReplicationMetrics> {
    // Check if we're a replica
    const replicaCheck = await this.pool.query<{ in_recovery: boolean }>(
      "SELECT pg_is_in_recovery() as in_recovery",
    );
    const isReplica = replicaCheck.rows[0]?.in_recovery ?? false;

    if (!isReplica) {
      return { isReplica: false };
    }

    // Get replication metrics for replica
    const query = `
      SELECT
        status as replication_state,
        sender_host as primary_host,
        pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as lag_bytes,
        EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) as lag_seconds,
        pg_last_wal_receive_lsn()::text as last_wal_receive,
        pg_last_wal_replay_lsn()::text as last_wal_replay
      FROM pg_stat_wal_receiver
    `;

    const result = await this.pool.query<{
      replication_state: string;
      primary_host: string;
      lag_bytes: number | null;
      lag_seconds: number | null;
      last_wal_receive: string;
      last_wal_replay: string;
    }>(query);

    const row = result.rows[0];
    if (!row) {
      return { isReplica: true };
    }

    return {
      isReplica: true,
      replicationState: row.replication_state,
      primaryHost: row.primary_host,
      lagBytes: row.lag_bytes ?? undefined,
      lagSeconds: row.lag_seconds ?? undefined,
      lastWalReceive: row.last_wal_receive,
      lastWalReplay: row.last_wal_replay,
    };
  }

  public async getTableBloat(): Promise<TableBloat[]> {
    const query = `
      SELECT
        schemaname as schema_name,
        tablename as table_name,
        pg_total_relation_size(schemaname||'.'||tablename) / 1024 / 1024 as real_size_mb,
        (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) / 1024 / 1024 as extra_size_mb,
        CASE WHEN pg_relation_size(schemaname||'.'||tablename) > 0
          THEN round(100.0 * (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename))::numeric / pg_relation_size(schemaname||'.'||tablename)::numeric, 2)
          ELSE 0
        END as bloat_pct,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables
      WHERE n_dead_tup > 1000
      ORDER BY dead_tuples DESC
      LIMIT 50
    `;

    const result = await this.pool.query<{
      schema_name: string;
      table_name: string;
      real_size_mb: number;
      extra_size_mb: number;
      bloat_pct: number;
      dead_tuples: number;
    }>(query);

    return result.rows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
      realSizeMB: Math.round(row.real_size_mb * 100) / 100,
      extraSizeMB: Math.round(row.extra_size_mb * 100) / 100,
      bloatPct: row.bloat_pct,
      deadTuples: row.dead_tuples,
    }));
  }

  public async getSlowQueries(minDurationMs: number = 100): Promise<SlowQuery[]> {
    // Requires pg_stat_statements extension
    const query = `
      SELECT
        query,
        calls,
        total_exec_time as total_time_ms,
        mean_exec_time as mean_time_ms,
        max_exec_time as max_time_ms,
        rows
      FROM pg_stat_statements
      WHERE mean_exec_time > $1
      ORDER BY total_exec_time DESC
      LIMIT 50
    `;

    try {
      const result = await this.pool.query<{
        query: string;
        calls: number;
        total_time_ms: number;
        mean_time_ms: number;
        max_time_ms: number;
        rows: number;
      }>(query, [minDurationMs]);

      return result.rows.map((row) => ({
        query: row.query.trim().replace(/\s+/g, " ").slice(0, 200),
        calls: row.calls,
        totalTimeMs: Math.round(row.total_time_ms * 100) / 100,
        meanTimeMs: Math.round(row.mean_time_ms * 100) / 100,
        maxTimeMs: Math.round(row.max_time_ms * 100) / 100,
        rows: row.rows,
      }));
    } catch (error) {
      logger.warn("pg_stat_statements extension not available", { error });
      return [];
    }
  }

  public async getIndexUsage(): Promise<IndexStats[]> {
    const query = `
      SELECT
        schemaname as schema_name,
        tablename as table_name,
        indexname as index_name,
        pg_relation_size(indexrelid) / 1024 / 1024 as index_size_mb,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 100
    `;

    const result = await this.pool.query<{
      schema_name: string;
      table_name: string;
      index_name: string;
      index_size_mb: number;
      scans: number;
      tuples_read: number;
      tuples_fetched: number;
    }>(query);

    return result.rows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
      indexName: row.index_name,
      indexSizeMB: Math.round(row.index_size_mb * 100) / 100,
      scans: row.scans,
      tuplesRead: row.tuples_read,
      tuplesFetched: row.tuples_fetched,
      isUnused: row.scans === 0 && row.index_size_mb > 10, // Unused if no scans and > 10MB
    }));
  }

  public async runVacuum(database: string, analyze: boolean = true): Promise<VacuumResult> {
    const startTime = Date.now();
    const command = analyze ? "VACUUM ANALYZE" : "VACUUM";

    try {
      // Connect to specific database
      const client = await this.pool.connect();
      try {
        await client.query(`${command} VERBOSE`);
        const durationMs = Date.now() - startTime;

        logger.info("VACUUM completed", { database, analyze, durationMs });

        return {
          database,
          analyze,
          durationMs,
          success: true,
          output: `${command} completed successfully in ${durationMs}ms`,
        };
      } finally {
        client.release();
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("VACUUM failed", { database, analyze, error, durationMs });

      return {
        database,
        analyze,
        durationMs,
        success: false,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async reindexDatabase(database: string): Promise<ReindexResult> {
    const startTime = Date.now();

    // Validate database name to prevent SQL injection
    if (!validateDatabaseName(database)) {
      throw new Error(`Invalid database name: ${database}`);
    }

    try {
      // Sanitize database name for shell command
      const safeDatabase = sanitizeShellArg(database);
      const result = await this.runner.run(`psql -d ${safeDatabase} -c "REINDEX DATABASE ${safeDatabase}"`, {
        requiresSudo: false,
        timeoutMs: 300000, // 5 minutes
      });

      const durationMs = Date.now() - startTime;

      // Parse output to count tables
      const tablesReindexed = (result.stdout.match(/REINDEX/g) || []).length;

      logger.info("REINDEX completed", { database, tablesReindexed, durationMs });

      return {
        database,
        tablesReindexed,
        durationMs,
        success: true,
        output: result.stdout,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("REINDEX failed", { database, error, durationMs });

      return {
        database,
        tablesReindexed: 0,
        durationMs,
        success: false,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async createBackup(database: string, destination: string): Promise<BackupResult> {
    const startTime = Date.now();

    // Validate inputs to prevent command injection
    if (!validateDatabaseName(database)) {
      throw new Error(`Invalid database name: ${database}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupPath = `${destination}/postgres_${database}_${timestamp}.sql.gz`;

    try {
      // Sanitize inputs for shell commands
      const safeDatabase = sanitizeShellArg(database);
      const safeBackupPath = sanitizeShellArg(backupPath);

      // Use pg_dump with gzip compression
      await this.runner.run(
        `pg_dump -d ${safeDatabase} | gzip > ${safeBackupPath}`,
        {
          requiresSudo: false,
          timeoutMs: 600000, // 10 minutes
        },
      );

      const durationMs = Date.now() - startTime;

      // Get backup file size
      const sizeResult = await this.runner.run(`stat -f%z ${safeBackupPath}`, {
        requiresSudo: false,
      });
      const sizeBytes = Number(sizeResult.stdout.trim()) || 0;

      logger.info("PostgreSQL backup completed", {
        database,
        backupPath,
        sizeBytes,
        durationMs,
      });

      return {
        backupPath,
        database,
        sizeBytes,
        durationMs,
        success: true,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("PostgreSQL backup failed", { database, error, durationMs });

      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    logger.info("PostgreSQL connection pool closed");
  }
}
