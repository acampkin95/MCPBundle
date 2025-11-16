import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  type StructuredLogRecord,
  type InvestigationSnapshot,
  type SecurityEventSnapshot,
  type LogCategory,
  type LogLevel,
} from './autoInvestigationService.js';
export type { LogCategory, LogLevel } from './autoInvestigationService.js';
import { logger } from '../utils/logger.js';

const levelRank: Record<LogLevel, number> = {
  fatal: 5,
  error: 4,
  warn: 3,
  info: 2,
  debug: 1,
  trace: 0,
};

export interface LogIngestorOptions {
  readonly dbPath: string;
  readonly retentionDays: number;
  readonly maxEntries: number;
  readonly previewLength?: number;
  readonly compressionQuality?: number;
  readonly cleanupInterval?: number;
}

export interface LogIngestResult {
  readonly id: number;
  readonly deduplicated: boolean;
  readonly repeatCount: number;
}

export interface LogQueryFilters {
  readonly service?: string;
  readonly nodeId?: string;
  readonly level?: LogLevel;
  readonly category?: LogCategory;
  readonly tags?: readonly string[];
  readonly search?: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly since?: number;
  readonly until?: number;
  readonly includePayload?: boolean;
}

export interface LogEntry {
  readonly id: number;
  readonly service: string;
  readonly nodeId: string;
  readonly level: LogLevel;
  readonly category: LogCategory;
  readonly message: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly repeatCount: number;
  readonly tags: readonly string[];
  readonly investigationStatus: InvestigationSnapshot['status'];
  readonly investigation?: InvestigationSnapshot;
  readonly security?: SecurityEventSnapshot;
  readonly payloadSize: { readonly compressed: number; readonly raw: number };
  readonly correlationId?: string;
  readonly stack?: string;
  readonly metadata?: Record<string, unknown>;
  readonly metrics?: Record<string, number>;
  readonly pm2?: StructuredLogRecord['pm2'];
}

export interface LogQueryResponse {
  readonly entries: readonly LogEntry[];
  readonly nextCursor?: string;
}

export interface LogSummary {
  readonly totals: {
    readonly rows: number;
    readonly errors: number;
    readonly security: number;
    readonly storageBytes: number;
  };
  readonly perService: readonly {
    readonly service: string;
    readonly lastSeen: string | null;
    readonly errors: number;
    readonly total: number;
  }[];
}

interface LogRow {
  readonly id: number;
  readonly first_seen_ts: number;
  readonly last_seen_ts: number;
  readonly service: string;
  readonly node_id: string;
  readonly level: LogLevel;
  readonly level_rank: number;
  readonly category: LogCategory;
  readonly message_preview: string;
  readonly payload: Buffer;
  readonly payload_encoding: 'br' | 'raw';
  readonly compressed_bytes: number;
  readonly raw_bytes: number;
  readonly tags: string | null;
  readonly correlation_id?: string | null;
  readonly investigation_status: InvestigationSnapshot['status'];
  readonly repeat_count: number;
  readonly stack?: string | null;
  readonly pm2_process?: string | null;
  readonly pm2_instance?: string | null;
  readonly pm2_restart_count?: number | null;
}

const cursorEncode = (value: { ts: number; id: number }): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const cursorDecode = (value?: string | null): { ts: number; id: number } | null => {
  if (!value) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      ts: number;
      id: number;
    };
    if (Number.isFinite(decoded.ts) && Number.isFinite(decoded.id)) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
};

export class LogIngestorService {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement;
  private readonly insertFtsStmt: Database.Statement;
  private readonly bumpRepeatStmt: Database.Statement;
  private readonly fetchIdByChecksumStmt: Database.Statement;
  private readonly deleteBeforeStmt: Database.Statement;
  private readonly deleteBeforeFtsStmt: Database.Statement;
  private readonly totalCountStmt: Database.Statement;
  private readonly trimExcessStmt: Database.Statement;
  private readonly deleteByIdsStmt: Database.Statement;
  private readonly deleteByIdsFtsStmt: Database.Statement;
  private readonly queryStmtCache: Map<string, Database.Statement> = new Map();
  private readonly summaryStmt: Database.Statement;
  private readonly summaryByServiceStmt: Database.Statement;
  private ingestionCount = 0;
  private readonly cleanupInterval: number;
  private readonly previewLength: number;
  private readonly compressionQuality: number;

  public constructor(private readonly options: LogIngestorOptions) {
    const dbPath = path.resolve(options.dbPath);
    mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.previewLength = options.previewLength ?? 320;
    this.cleanupInterval = options.cleanupInterval ?? 250;
    this.compressionQuality = options.compressionQuality ?? 5;

    this.bootstrap();

    this.insertStmt = this.db.prepare(
      `INSERT OR IGNORE INTO mcp_logs (
        first_seen_ts,
        last_seen_ts,
        service,
        node_id,
        level,
        level_rank,
        category,
        message_preview,
        payload,
        payload_encoding,
        compressed_bytes,
        raw_bytes,
        tags,
        correlation_id,
        investigation_status,
        investigation_summary,
        repeat_count,
        checksum,
        stack,
        pm2_process,
        pm2_instance,
        pm2_restart_count
      ) VALUES (
        @first_seen_ts,
        @last_seen_ts,
        @service,
        @node_id,
        @level,
        @level_rank,
        @category,
        @message_preview,
        @payload,
        @payload_encoding,
        @compressed_bytes,
        @raw_bytes,
        @tags,
        @correlation_id,
        @investigation_status,
        @investigation_summary,
        1,
        @checksum,
        @stack,
        @pm2_process,
        @pm2_instance,
        @pm2_restart_count
      )`
    );

    this.insertFtsStmt = this.db.prepare(
      `INSERT OR IGNORE INTO mcp_logs_fts(rowid, message_preview, tags, service, node_id)
       VALUES (@rowid, @message_preview, @tags, @service, @node_id)`
    );

    this.bumpRepeatStmt = this.db.prepare(
      `UPDATE mcp_logs
         SET repeat_count = repeat_count + 1,
             last_seen_ts = @last_seen_ts,
             investigation_status = COALESCE(@investigation_status, investigation_status),
             investigation_summary = COALESCE(@investigation_summary, investigation_summary)
       WHERE checksum = @checksum`
    );

    this.fetchIdByChecksumStmt = this.db.prepare(
      `SELECT id FROM mcp_logs WHERE checksum = ? LIMIT 1`
    );
    this.deleteBeforeStmt = this.db.prepare(`DELETE FROM mcp_logs WHERE last_seen_ts < @cutoff_ts`);
    this.deleteBeforeFtsStmt = this.db.prepare(
      `DELETE FROM mcp_logs_fts WHERE rowid IN (
        SELECT id FROM mcp_logs WHERE last_seen_ts < @cutoff_ts
      )`
    );
    this.totalCountStmt = this.db.prepare(`SELECT COUNT(1) as cnt FROM mcp_logs`);
    this.trimExcessStmt = this.db.prepare(
      `SELECT id FROM mcp_logs ORDER BY last_seen_ts ASC LIMIT @excess`
    );
    this.deleteByIdsStmt = this.db.prepare(
      `DELETE FROM mcp_logs WHERE id IN (SELECT value FROM json_each(@ids))`
    );
    this.deleteByIdsFtsStmt = this.db.prepare(
      `DELETE FROM mcp_logs_fts WHERE rowid IN (SELECT value FROM json_each(@ids))`
    );

    this.summaryStmt = this.db.prepare(
      `SELECT
          COUNT(1) as total,
          SUM(level_rank >= ${levelRank.error}) as errors,
          SUM(category = @securityCategory) as security,
          SUM(compressed_bytes) as storage
        FROM mcp_logs`
    );

    this.summaryByServiceStmt = this.db.prepare(
      `SELECT service,
              MAX(last_seen_ts) as last_seen_ts,
              SUM(level_rank >= ${levelRank.error}) as errors,
              COUNT(1) as total
         FROM mcp_logs
        GROUP BY service
        ORDER BY last_seen_ts DESC`
    );
  }

  public ingest(record: StructuredLogRecord): LogIngestResult {
    const normalized = this.normalizeRecord(record);
    const payloadBuffer = Buffer.from(JSON.stringify(normalized.payload), 'utf8');
    const payload = brotliCompressSync(payloadBuffer, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: this.compressionQuality,
      },
    });
    const checksum = createHash('sha1')
      .update(normalized.service)
      .update(normalized.nodeId)
      .update(normalized.level)
      .update(normalized.category)
      .update(normalized.message)
      .update(normalized.stack ?? '')
      .update(normalized.tags.join('|'))
      .update(JSON.stringify(normalized.payload.metadata ?? {}))
      .update(JSON.stringify(normalized.payload.metrics ?? {}))
      .update(JSON.stringify(normalized.payload.investigation ?? {}))
      .update(JSON.stringify(normalized.payload.security ?? {}))
      .digest('hex');

    const insertResult = this.insertStmt.run({
      first_seen_ts: normalized.timestampMs,
      last_seen_ts: normalized.timestampMs,
      service: normalized.service,
      node_id: normalized.nodeId,
      level: normalized.level,
      level_rank: levelRank[normalized.level],
      category: normalized.category,
      message_preview: normalized.preview,
      payload,
      payload_encoding: 'br',
      compressed_bytes: payload.byteLength,
      raw_bytes: payloadBuffer.byteLength,
      tags: normalized.tags.length ? JSON.stringify(normalized.tags) : null,
      correlation_id: normalized.correlationId ?? null,
      investigation_status: normalized.investigationStatus,
      investigation_summary: normalized.payload.investigation?.notes ?? null,
      checksum,
      stack: normalized.stack ?? null,
      pm2_process: normalized.pm2?.name ?? null,
      pm2_instance: normalized.pm2?.instanceId ? String(normalized.pm2.instanceId) : null,
      pm2_restart_count: normalized.pm2?.restartCount ?? null,
    });

    let rowId = Number(insertResult.lastInsertRowid ?? 0);
    let deduplicated = false;
    let repeatCount = 1;

    if (insertResult.changes === 0) {
      const existing = this.fetchIdByChecksumStmt.get(checksum) as { id: number } | undefined;
      if (existing) {
        rowId = existing.id;
        deduplicated = true;
        this.bumpRepeatStmt.run({
          checksum,
          last_seen_ts: normalized.timestampMs,
          investigation_status: normalized.investigationStatus,
          investigation_summary: normalized.payload.investigation?.notes ?? null,
        });
        const updated = this.db
          .prepare(`SELECT repeat_count FROM mcp_logs WHERE id = ?`)
          .get(rowId) as {
          repeat_count: number;
        } | null;
        repeatCount = updated?.repeat_count ?? 1;
      }
    } else {
      this.insertFtsStmt.run({
        rowid: rowId,
        message_preview: normalized.preview,
        tags: normalized.tags.join(' '),
        service: normalized.service,
        node_id: normalized.nodeId,
      });
    }

    this.maybeCleanup();

    return { id: rowId, deduplicated, repeatCount };
  }

  public query(filters: LogQueryFilters = {}): LogQueryResponse {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const cursor = cursorDecode(filters.cursor);
    const params: Record<string, unknown> = { limit };
    const clauses: string[] = [];

    if (filters.service) {
      clauses.push('service = @service');
      params.service = filters.service;
    }
    if (filters.nodeId) {
      clauses.push('node_id = @node_id');
      params.node_id = filters.nodeId;
    }
    if (filters.category) {
      clauses.push('category = @category');
      params.category = filters.category;
    }
    if (filters.level) {
      clauses.push('level_rank >= @level_rank');
      params.level_rank = levelRank[filters.level];
    }
    if (filters.since) {
      clauses.push('last_seen_ts >= @since');
      params.since = filters.since;
    }
    if (filters.until) {
      clauses.push('first_seen_ts <= @until');
      params.until = filters.until;
    }
    if (filters.tags && filters.tags.length) {
      clauses.push(
        filters.tags
          .map((tag, index) => {
            const param = `tag_${index}`;
            params[param] = tag;
            return `EXISTS (
              SELECT 1 FROM json_each(mcp_logs.tags)
               WHERE value = @${param}
            )`;
          })
          .join(' AND ')
      );
    }
    if (filters.search) {
      clauses.push(
        `rowid IN (
          SELECT rowid FROM mcp_logs_fts
          WHERE mcp_logs_fts MATCH @search
        )`
      );
      params.search = filters.search;
    }
    if (cursor) {
      clauses.push(
        '(last_seen_ts < @cursor_ts OR (last_seen_ts = @cursor_ts AND id < @cursor_id))'
      );
      params.cursor_ts = cursor.ts;
      params.cursor_id = cursor.id;
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const cacheKey = `${whereClause}#${filters.includePayload ? 'full' : 'preview'}`;
    let stmt = this.queryStmtCache.get(cacheKey);
    if (!stmt) {
      stmt = this.db.prepare(
        `SELECT id,
                first_seen_ts,
                last_seen_ts,
                service,
                node_id,
                level,
                level_rank,
                category,
                message_preview,
                payload,
                payload_encoding,
                compressed_bytes,
                raw_bytes,
                tags,
                correlation_id,
                investigation_status,
                repeat_count,
                stack,
                pm2_process,
                pm2_instance,
                pm2_restart_count
           FROM mcp_logs
           ${whereClause}
           ORDER BY last_seen_ts DESC, id DESC
           LIMIT @limit`
      );
      this.queryStmtCache.set(cacheKey, stmt);
    }

    const rows = stmt.all(params) as LogRow[];
    const entries = rows.map((row) => this.mapRow(row, filters.includePayload));

    const last = rows.at(-1);
    return {
      entries,
      nextCursor: last ? cursorEncode({ ts: last.last_seen_ts, id: last.id }) : undefined,
    };
  }

  public summary(): LogSummary {
    const totals = this.summaryStmt.get({ securityCategory: 'security' }) as {
      total: number;
      errors: number;
      security: number;
      storage: number;
    };
    const perServiceRaw = this.summaryByServiceStmt.all() as {
      service: string;
      last_seen_ts: number | null;
      errors: number;
      total: number;
    }[];

    return {
      totals: {
        rows: totals?.total ?? 0,
        errors: totals?.errors ?? 0,
        security: totals?.security ?? 0,
        storageBytes: totals?.storage ?? 0,
      },
      perService: perServiceRaw.map((row) => ({
        service: row.service,
        errors: row.errors ?? 0,
        total: row.total ?? 0,
        lastSeen: row.last_seen_ts ? new Date(row.last_seen_ts).toISOString() : null,
      })),
    };
  }

  public recentSecurityEvents(limit = 50): LogEntry[] {
    const stmt = this.db.prepare(
      `SELECT id,
              first_seen_ts,
              last_seen_ts,
              service,
              node_id,
              level,
              level_rank,
              category,
              message_preview,
              payload,
              payload_encoding,
              compressed_bytes,
              raw_bytes,
              tags,
              correlation_id,
              investigation_status,
              repeat_count,
              stack,
              pm2_process,
              pm2_instance,
              pm2_restart_count
         FROM mcp_logs
        WHERE category = security
        ORDER BY last_seen_ts DESC
        LIMIT @limit`
    );

    const rows = stmt.all({ limit: Math.min(Math.max(limit, 1), 200) }) as LogRow[];
    return rows.map((row) => this.mapRow(row, true));
  }

  private normalizeRecord(record: StructuredLogRecord) {
    const parsedTs = record.timestamp ? Date.parse(record.timestamp) : NaN;
    const timestampMs = Number.isFinite(parsedTs) ? parsedTs : Date.now();
    const category = record.category ?? (record.security ? 'security' : 'application');
    const normalizedTags = Array.from(new Set((record.tags ?? []).map((tag) => String(tag))))
      .filter(Boolean)
      .slice(0, 16);
    const messageText =
      typeof record.message === 'string' ? record.message : JSON.stringify(record.message);
    const preview = messageText.slice(0, this.previewLength).replace(/\s+/g, ' ').trim();

    return {
      timestampMs,
      service: record.service,
      nodeId: record.nodeId,
      level: record.level,
      category,
      message: messageText,
      preview: preview || messageText,
      tags: normalizedTags,
      correlationId: record.correlationId,
      stack: record.stack,
      investigationStatus: record.investigation?.status ?? 'pending',
      pm2: record.pm2,
      payload: {
        schema: 'mcp.log/v1',
        ...record,
        message: messageText,
        category,
        timestamp: new Date(timestampMs).toISOString(),
        tags: normalizedTags,
      },
    };
  }

  private maybeCleanup(): void {
    this.ingestionCount += 1;
    if (this.ingestionCount % this.cleanupInterval !== 0) {
      return;
    }

    if (this.options.retentionDays > 0) {
      const cutoffMs = Date.now() - this.options.retentionDays * 86_400_000;
      this.deleteBeforeFtsStmt.run({ cutoff_ts: cutoffMs });
      this.deleteBeforeStmt.run({ cutoff_ts: cutoffMs });
    }

    const { cnt } = this.totalCountStmt.get() as { cnt: number };
    if (this.options.maxEntries > 0 && cnt > this.options.maxEntries) {
      const excess = cnt - this.options.maxEntries;
      const victims = this.trimExcessStmt.all({ excess }) as { id: number }[];
      if (victims.length) {
        const idsJson = JSON.stringify(victims.map((row) => row.id));
        this.deleteByIdsFtsStmt.run({ ids: idsJson });
        this.deleteByIdsStmt.run({ ids: idsJson });
      }
    }
  }

  private mapRow(row: LogRow, includePayload = false): LogEntry {
    let payload: StructuredLogRecord | null = null;
    if (includePayload) {
      try {
        const decompressed =
          row.payload_encoding === 'br' ? brotliDecompressSync(row.payload) : row.payload;
        payload = JSON.parse(decompressed.toString('utf8')) as StructuredLogRecord;
      } catch (error) {
        logger.warn('Failed to decode log payload', { id: row.id, error });
      }
    }

    const tags = row.tags ? (JSON.parse(row.tags) as string[]) : (payload?.tags ?? []);

    return {
      id: row.id,
      service: row.service,
      nodeId: row.node_id,
      level: row.level,
      category: row.category,
      message: payload?.message ?? row.message_preview,
      stack: includePayload ? (payload?.stack ?? row.stack ?? undefined) : undefined,
      correlationId: payload?.correlationId ?? row.correlation_id ?? undefined,
      firstSeen: new Date(row.first_seen_ts).toISOString(),
      lastSeen: new Date(row.last_seen_ts).toISOString(),
      repeatCount: row.repeat_count,
      tags,
      investigationStatus: (payload?.investigation?.status ??
        row.investigation_status) as InvestigationSnapshot['status'],
      investigation: includePayload ? payload?.investigation : undefined,
      security: includePayload ? payload?.security : undefined,
      payloadSize: { compressed: row.compressed_bytes, raw: row.raw_bytes },
      metadata: includePayload ? payload?.metadata : undefined,
      metrics: includePayload ? payload?.metrics : undefined,
      pm2: includePayload ? (payload?.pm2 ?? this.mapPm2(row)) : undefined,
    };
  }

  private mapPm2(row: LogRow): StructuredLogRecord['pm2'] | undefined {
    if (!row.pm2_process && !row.pm2_instance && !row.pm2_restart_count) {
      return undefined;
    }
    return {
      name: row.pm2_process ?? undefined,
      instanceId: row.pm2_instance ?? undefined,
      restartCount: row.pm2_restart_count ?? undefined,
    };
  }

  private bootstrap(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS mcp_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_seen_ts INTEGER NOT NULL,
        last_seen_ts INTEGER NOT NULL,
        service TEXT NOT NULL,
        node_id TEXT NOT NULL,
        level TEXT NOT NULL,
        level_rank INTEGER NOT NULL,
        category TEXT NOT NULL,
        message_preview TEXT NOT NULL,
        payload BLOB NOT NULL,
        payload_encoding TEXT NOT NULL,
        compressed_bytes INTEGER NOT NULL,
        raw_bytes INTEGER NOT NULL,
        tags TEXT NULL,
        correlation_id TEXT NULL,
        investigation_status TEXT NOT NULL,
        investigation_summary TEXT NULL,
        repeat_count INTEGER NOT NULL DEFAULT 1,
        checksum TEXT NOT NULL UNIQUE,
        stack TEXT NULL,
        pm2_process TEXT NULL,
        pm2_instance TEXT NULL,
        pm2_restart_count INTEGER NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_logs_service_ts ON mcp_logs(service, last_seen_ts DESC);
      CREATE INDEX IF NOT EXISTS idx_mcp_logs_level_rank ON mcp_logs(level_rank, last_seen_ts DESC);
      CREATE INDEX IF NOT EXISTS idx_mcp_logs_category ON mcp_logs(category, last_seen_ts DESC);
      CREATE INDEX IF NOT EXISTS idx_mcp_logs_node ON mcp_logs(node_id, last_seen_ts DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS mcp_logs_fts USING fts5(
        message_preview,
        tags,
        service,
        node_id,
        tokenize = "unicode61"
      );
    `
    );
  }
}
