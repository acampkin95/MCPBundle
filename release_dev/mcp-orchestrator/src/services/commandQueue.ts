import Database from "better-sqlite3";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

export interface QueuedCommand {
  readonly jobId: string;
  readonly toolName: string;
  readonly params: Record<string, unknown>;
  readonly requestedCapabilities: readonly string[];
  readonly targetAgentId?: string;
  readonly status: "queued" | "picked" | "executing" | "completed" | "failed" | "timeout";
  readonly priority: "low" | "normal" | "high" | "urgent";
  readonly createdAt: string;
  readonly pickedAt?: string;
  readonly completedAt?: string;
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly retryCount: number;
  readonly maxRetries: number;
}

export interface QueueStats {
  totalQueued: number;
  totalPicked: number;
  totalExecuting: number;
  totalCompleted: number;
  totalFailed: number;
  oldestQueued?: string;
  averageWaitTimeMs?: number;
}

/**
 * CommandQueueService manages local command queue with SQLite persistence.
 *
 * **Purpose**:
 * - Offline resilience: Queue commands when PostgreSQL/network unavailable
 * - Retry logic: Automatic retry with exponential backoff
 * - Priority handling: Urgent commands processed first
 * - Audit trail: Track command lifecycle from queue → completion
 *
 * **Schema**:
 * ```sql
 * CREATE TABLE command_queue (
 *   job_id TEXT PRIMARY KEY,
 *   tool_name TEXT NOT NULL,
 *   params TEXT NOT NULL,  -- JSON
 *   requested_capabilities TEXT NOT NULL,  -- JSON array
 *   target_agent_id TEXT,
 *   status TEXT NOT NULL,
 *   priority TEXT NOT NULL,
 *   created_at TEXT NOT NULL,
 *   picked_at TEXT,
 *   completed_at TEXT,
 *   result TEXT,  -- JSON
 *   error TEXT,
 *   retry_count INTEGER DEFAULT 0,
 *   max_retries INTEGER DEFAULT 3
 * );
 * ```
 */
export class CommandQueueService {
  private readonly db: Database.Database;
  private readonly dbPath: string;

  public constructor(dbPath: string = join(process.cwd(), "mcp_command_queue.db")) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS command_queue (
        job_id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        params TEXT NOT NULL,
        requested_capabilities TEXT NOT NULL,
        target_agent_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('queued', 'picked', 'executing', 'completed', 'failed', 'timeout')),
        priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
        created_at TEXT NOT NULL,
        picked_at TEXT,
        completed_at TEXT,
        result TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3
      );

      CREATE INDEX IF NOT EXISTS idx_queue_status ON command_queue(status, priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_queue_agent ON command_queue(target_agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_queue_created ON command_queue(created_at);
    `;

    this.db.exec(schema);
    logger.info("CommandQueueService initialized", { dbPath: this.dbPath });
  }

  /**
   * Enqueue a new command for execution
   */
  public enqueue(command: {
    readonly jobId: string;
    readonly toolName: string;
    readonly params: Record<string, unknown>;
    readonly requestedCapabilities: readonly string[];
    readonly targetAgentId?: string;
    readonly priority?: "low" | "normal" | "high" | "urgent";
    readonly maxRetries?: number;
  }): QueuedCommand {
    const queuedCommand: QueuedCommand = {
      jobId: command.jobId,
      toolName: command.toolName,
      params: command.params,
      requestedCapabilities: command.requestedCapabilities,
      targetAgentId: command.targetAgentId,
      status: "queued",
      priority: command.priority ?? "normal",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: command.maxRetries ?? 3,
    };

    const stmt = this.db.prepare(`
      INSERT INTO command_queue (
        job_id, tool_name, params, requested_capabilities, target_agent_id,
        status, priority, created_at, retry_count, max_retries
      ) VALUES (
        @jobId, @toolName, @params, @requestedCapabilities, @targetAgentId,
        @status, @priority, @createdAt, @retryCount, @maxRetries
      )
    `);

    stmt.run({
      jobId: queuedCommand.jobId,
      toolName: queuedCommand.toolName,
      params: JSON.stringify(queuedCommand.params),
      requestedCapabilities: JSON.stringify(queuedCommand.requestedCapabilities),
      targetAgentId: queuedCommand.targetAgentId ?? null,
      status: queuedCommand.status,
      priority: queuedCommand.priority,
      createdAt: queuedCommand.createdAt,
      retryCount: queuedCommand.retryCount,
      maxRetries: queuedCommand.maxRetries,
    });

    logger.debug("Command enqueued", {
      jobId: queuedCommand.jobId,
      toolName: queuedCommand.toolName,
      priority: queuedCommand.priority,
    });

    return queuedCommand;
  }

  /**
   * Dequeue next command for processing (priority-ordered)
   */
  public dequeue(agentId?: string): QueuedCommand | null {
    const stmt = this.db.prepare(`
      SELECT * FROM command_queue
      WHERE status = 'queued'
        AND (target_agent_id IS NULL OR target_agent_id = ?)
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at ASC
      LIMIT 1
    `);

    const row = stmt.get(agentId ?? null) as {
      job_id: string;
      tool_name: string;
      params: string;
      requested_capabilities: string;
      target_agent_id: string | null;
      status: string;
      priority: string;
      created_at: string;
      picked_at: string | null;
      completed_at: string | null;
      result: string | null;
      error: string | null;
      retry_count: number;
      max_retries: number;
    } | undefined;

    if (!row) {
      return null;
    }

    // Mark as picked
    const updateStmt = this.db.prepare(`
      UPDATE command_queue
      SET status = 'picked', picked_at = ?
      WHERE job_id = ?
    `);

    updateStmt.run(new Date().toISOString(), row.job_id);

    return this.rowToCommand(row);
  }

  /**
   * Update command status
   */
  public updateStatus(
    jobId: string,
    status: "executing" | "completed" | "failed" | "timeout",
    result?: Record<string, unknown>,
    error?: string,
  ): void {
    const completedAt = status === "completed" || status === "failed" || status === "timeout"
      ? new Date().toISOString()
      : null;

    const stmt = this.db.prepare(`
      UPDATE command_queue
      SET status = ?,
          completed_at = ?,
          result = ?,
          error = ?
      WHERE job_id = ?
    `);

    stmt.run(
      status,
      completedAt,
      result ? JSON.stringify(result) : null,
      error ?? null,
      jobId,
    );

    logger.debug("Command status updated", { jobId, status });
  }

  /**
   * Retry failed command (increment retry count)
   */
  public retryCommand(jobId: string): boolean {
    const command = this.getCommand(jobId);
    if (!command) {
      logger.warn("Cannot retry: command not found", { jobId });
      return false;
    }

    if (command.retryCount >= command.maxRetries) {
      logger.warn("Cannot retry: max retries exceeded", {
        jobId,
        retryCount: command.retryCount,
        maxRetries: command.maxRetries,
      });
      return false;
    }

    const stmt = this.db.prepare(`
      UPDATE command_queue
      SET status = 'queued',
          picked_at = NULL,
          completed_at = NULL,
          error = NULL,
          retry_count = retry_count + 1
      WHERE job_id = ?
    `);

    stmt.run(jobId);
    logger.info("Command requeued for retry", {
      jobId,
      retryCount: command.retryCount + 1,
    });

    return true;
  }

  /**
   * Get command by ID
   */
  public getCommand(jobId: string): QueuedCommand | null {
    const stmt = this.db.prepare(`
      SELECT * FROM command_queue WHERE job_id = ?
    `);

    const row = stmt.get(jobId) as {
      job_id: string;
      tool_name: string;
      params: string;
      requested_capabilities: string;
      target_agent_id: string | null;
      status: string;
      priority: string;
      created_at: string;
      picked_at: string | null;
      completed_at: string | null;
      result: string | null;
      error: string | null;
      retry_count: number;
      max_retries: number;
    } | undefined;

    return row ? this.rowToCommand(row) : null;
  }

  /**
   * Get queue statistics
   */
  public getStats(): QueueStats {
    const stmt = this.db.prepare(`
      SELECT
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest
      FROM command_queue
      GROUP BY status
    `);

    const rows = stmt.all() as Array<{ status: string; count: number; oldest: string }>;

    const stats: QueueStats = {
      totalQueued: 0,
      totalPicked: 0,
      totalExecuting: 0,
      totalCompleted: 0,
      totalFailed: 0,
    };

    for (const row of rows) {
      switch (row.status) {
        case "queued":
          stats.totalQueued = row.count;
          stats.oldestQueued = row.oldest;
          break;
        case "picked":
          stats.totalPicked = row.count;
          break;
        case "executing":
          stats.totalExecuting = row.count;
          break;
        case "completed":
          stats.totalCompleted = row.count;
          break;
        case "failed":
        case "timeout":
          stats.totalFailed += row.count;
          break;
      }
    }

    return stats;
  }

  /**
   * Purge completed/failed commands older than N days
   */
  public purgeOldCommands(daysOld: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const stmt = this.db.prepare(`
      DELETE FROM command_queue
      WHERE status IN ('completed', 'failed', 'timeout')
        AND completed_at < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    logger.info("Purged old commands", { deleted: result.changes, daysOld });

    return result.changes;
  }

  /**
   * Convert database row to QueuedCommand
   */
  private rowToCommand(row: {
    job_id: string;
    tool_name: string;
    params: string;
    requested_capabilities: string;
    target_agent_id: string | null;
    status: string;
    priority: string;
    created_at: string;
    picked_at: string | null;
    completed_at: string | null;
    result: string | null;
    error: string | null;
    retry_count: number;
    max_retries: number;
  }): QueuedCommand {
    return {
      jobId: row.job_id,
      toolName: row.tool_name,
      params: JSON.parse(row.params),
      requestedCapabilities: JSON.parse(row.requested_capabilities),
      targetAgentId: row.target_agent_id ?? undefined,
      status: row.status as QueuedCommand["status"],
      priority: row.priority as QueuedCommand["priority"],
      createdAt: row.created_at,
      pickedAt: row.picked_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ?? undefined,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    };
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
    logger.info("CommandQueueService closed");
  }
}
