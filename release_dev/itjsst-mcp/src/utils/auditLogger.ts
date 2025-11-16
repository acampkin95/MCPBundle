/**
 * AuditLogger Utility
 *
 * Immutable audit trail for all authorization decisions and tool executions.
 * Provides structured JSON logging with Winston integration and SQLite persistence.
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { logger } from './logger.js';
import type { AuthorizationContext, PolicyDecision, AuditLogEntry } from '../types/policy.js';

/**
 * Audit logger with dual persistence (Winston + SQLite)
 *
 * **Purpose**:
 * - Immutable audit trail for compliance
 * - Queryable history of authorization decisions
 * - Side effect tracking for incident response
 * - Structured JSON logs for SIEM integration
 *
 * **Schema**:
 * ```sql
 * CREATE TABLE audit_logs (
 *   id TEXT PRIMARY KEY,
 *   timestamp TEXT NOT NULL,
 *   caller_id TEXT NOT NULL,
 *   tool TEXT NOT NULL,
 *   operation TEXT NOT NULL,
 *   decision_action TEXT NOT NULL,
 *   decision_reason TEXT NOT NULL,
 *   risk_level TEXT NOT NULL,
 *   requires_approval BOOLEAN NOT NULL,
 *   execution_status TEXT,
 *   execution_duration_ms INTEGER,
 *   side_effects TEXT,  -- JSON array
 *   error TEXT,
 *   approver TEXT,
 *   approved_at TEXT,
 *   context TEXT NOT NULL,  -- Full JSON context
 *   decision TEXT NOT NULL   -- Full JSON decision
 * );
 * ```
 */
export class AuditLogger {
  private readonly db: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath: string = join(process.cwd(), 'mcp_audit.db')) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        caller_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        operation TEXT NOT NULL,
        decision_action TEXT NOT NULL CHECK(decision_action IN ('allow', 'deny', 'require_approval')),
        decision_reason TEXT NOT NULL,
        risk_level TEXT NOT NULL CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        requires_approval BOOLEAN NOT NULL,
        execution_status TEXT CHECK(execution_status IN ('success', 'failure', 'timeout')),
        execution_duration_ms INTEGER,
        side_effects TEXT,
        error TEXT,
        approver TEXT,
        approved_at TEXT,
        context TEXT NOT NULL,
        decision TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_caller ON audit_logs(caller_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_logs(tool, operation, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_risk ON audit_logs(risk_level, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_approval ON audit_logs(requires_approval, timestamp DESC);
    `;

    this.db.exec(schema);
    logger.info('AuditLogger initialized', { dbPath: this.dbPath });
  }

  /**
   * Log authorization decision
   *
   * @param context Authorization context (who, what, when)
   * @param decision Policy decision (allow/deny/require_approval)
   */
  logDecision(context: AuthorizationContext, decision: PolicyDecision): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      context,
      decision,
    };

    // Persist to SQLite
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, timestamp, caller_id, tool, operation,
        decision_action, decision_reason, risk_level, requires_approval,
        context, decision
      ) VALUES (
        @id, @timestamp, @callerId, @tool, @operation,
        @decisionAction, @decisionReason, @riskLevel, @requiresApproval,
        @context, @decision
      )
    `);

    stmt.run({
      id: entry.id,
      timestamp: entry.timestamp,
      callerId: context.callerId,
      tool: context.tool,
      operation: context.operation,
      decisionAction: decision.action,
      decisionReason: decision.reason,
      riskLevel: decision.riskLevel,
      requiresApproval: decision.requiresApproval ? 1 : 0,
      context: JSON.stringify(context),
      decision: JSON.stringify(decision),
    });

    // Also log to Winston for SIEM integration
    logger.info('Authorization decision', {
      auditId: entry.id,
      callerId: context.callerId,
      tool: context.tool,
      operation: context.operation,
      action: decision.action,
      riskLevel: decision.riskLevel,
      requiresApproval: decision.requiresApproval,
    });

    return entry;
  }

  /**
   * Log execution result (success/failure)
   *
   * @param auditId ID from logDecision()
   * @param status Execution outcome
   * @param durationMs Execution time in milliseconds
   * @param sideEffects List of side effects (files changed, services restarted, etc.)
   * @param error Error message if failed
   */
  logExecution(
    auditId: string,
    status: 'success' | 'failure' | 'timeout',
    durationMs: number,
    sideEffects: readonly string[],
    error?: string
  ): void {
    const stmt = this.db.prepare(`
      UPDATE audit_logs
      SET execution_status = ?,
          execution_duration_ms = ?,
          side_effects = ?,
          error = ?
      WHERE id = ?
    `);

    stmt.run(status, durationMs, JSON.stringify(sideEffects), error ?? null, auditId);

    logger.info('Execution result', {
      auditId,
      status,
      durationMs,
      sideEffects: sideEffects.length,
      error: error ?? undefined,
    });
  }

  /**
   * Log approval/rejection decision
   *
   * @param auditId ID from logDecision()
   * @param approvedBy User who approved/rejected
   * @param approved True if approved, false if rejected
   */
  logApproval(auditId: string, approvedBy: string, approved: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE audit_logs
      SET approver = ?,
          approved_at = ?
      WHERE id = ?
    `);

    stmt.run(approvedBy, new Date().toISOString(), auditId);

    logger.info('Approval decision', {
      auditId,
      approvedBy,
      approved,
    });
  }

  /**
   * Query audit logs with filters
   *
   * @param filters Query filters
   * @returns Matching audit log entries
   */
  query(filters: {
    callerId?: string;
    tool?: string;
    operation?: string;
    riskLevel?: string;
    requiresApproval?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: Record<string, string | number> = {};

    if (filters.callerId) {
      sql += ' AND caller_id = @callerId';
      params.callerId = filters.callerId;
    }

    if (filters.tool) {
      sql += ' AND tool = @tool';
      params.tool = filters.tool;
    }

    if (filters.operation) {
      sql += ' AND operation = @operation';
      params.operation = filters.operation;
    }

    if (filters.riskLevel) {
      sql += ' AND risk_level = @riskLevel';
      params.riskLevel = filters.riskLevel;
    }

    if (filters.requiresApproval !== undefined) {
      sql += ' AND requires_approval = @requiresApproval';
      params.requiresApproval = filters.requiresApproval ? 1 : 0;
    }

    if (filters.startDate) {
      sql += ' AND timestamp >= @startDate';
      params.startDate = filters.startDate;
    }

    if (filters.endDate) {
      sql += ' AND timestamp <= @endDate';
      params.endDate = filters.endDate;
    }

    sql += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      sql += ' LIMIT @limit';
      params.limit = filters.limit;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as Array<{
      id: string;
      timestamp: string;
      context: string;
      decision: string;
      execution_status: string | null;
      execution_duration_ms: number | null;
      side_effects: string | null;
      error: string | null;
      approver: string | null;
      approved_at: string | null;
    }>;

    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Get audit statistics
   *
   * @returns Summary statistics
   */
  getStats(): {
    totalDecisions: number;
    totalAllowed: number;
    totalDenied: number;
    totalApprovalRequired: number;
    totalExecutions: number;
    totalSuccesses: number;
    totalFailures: number;
    byRiskLevel: Record<string, number>;
    byTool: Record<string, number>;
  } {
    const decisionsStmt = this.db.prepare(`
      SELECT
        decision_action,
        COUNT(*) as count
      FROM audit_logs
      GROUP BY decision_action
    `);

    const decisionsRows = decisionsStmt.all() as Array<{
      decision_action: string;
      count: number;
    }>;

    const executionsStmt = this.db.prepare(`
      SELECT
        execution_status,
        COUNT(*) as count
      FROM audit_logs
      WHERE execution_status IS NOT NULL
      GROUP BY execution_status
    `);

    const executionsRows = executionsStmt.all() as Array<{
      execution_status: string;
      count: number;
    }>;

    const riskLevelStmt = this.db.prepare(`
      SELECT
        risk_level,
        COUNT(*) as count
      FROM audit_logs
      GROUP BY risk_level
    `);

    const riskLevelRows = riskLevelStmt.all() as Array<{
      risk_level: string;
      count: number;
    }>;

    const toolStmt = this.db.prepare(`
      SELECT
        tool,
        COUNT(*) as count
      FROM audit_logs
      GROUP BY tool
      ORDER BY count DESC
      LIMIT 20
    `);

    const toolRows = toolStmt.all() as Array<{
      tool: string;
      count: number;
    }>;

    const stats = {
      totalDecisions: 0,
      totalAllowed: 0,
      totalDenied: 0,
      totalApprovalRequired: 0,
      totalExecutions: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      byRiskLevel: {} as Record<string, number>,
      byTool: {} as Record<string, number>,
    };

    for (const row of decisionsRows) {
      stats.totalDecisions += row.count;
      switch (row.decision_action) {
        case 'allow':
          stats.totalAllowed = row.count;
          break;
        case 'deny':
          stats.totalDenied = row.count;
          break;
        case 'require_approval':
          stats.totalApprovalRequired = row.count;
          break;
      }
    }

    for (const row of executionsRows) {
      stats.totalExecutions += row.count;
      switch (row.execution_status) {
        case 'success':
          stats.totalSuccesses = row.count;
          break;
        case 'failure':
        case 'timeout':
          stats.totalFailures += row.count;
          break;
      }
    }

    for (const row of riskLevelRows) {
      stats.byRiskLevel[row.risk_level] = row.count;
    }

    for (const row of toolRows) {
      stats.byTool[row.tool] = row.count;
    }

    return stats;
  }

  /**
   * Purge audit logs older than N days
   *
   * @param daysOld Number of days to retain
   * @returns Number of entries deleted
   */
  purgeOldLogs(daysOld: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const stmt = this.db.prepare(`
      DELETE FROM audit_logs
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    logger.info('Purged old audit logs', {
      deleted: result.changes,
      daysOld,
    });

    return result.changes;
  }

  /**
   * Convert database row to AuditLogEntry
   */
  private rowToEntry(row: {
    id: string;
    timestamp: string;
    context: string;
    decision: string;
    execution_status: string | null;
    execution_duration_ms: number | null;
    side_effects: string | null;
    error: string | null;
    approver: string | null;
    approved_at: string | null;
  }): AuditLogEntry {
    const context = JSON.parse(row.context) as AuthorizationContext;
    const decision = JSON.parse(row.decision) as PolicyDecision;

    const baseEntry: AuditLogEntry = {
      id: row.id,
      timestamp: row.timestamp,
      context,
      decision,
    };

    if (row.execution_status) {
      return {
        ...baseEntry,
        execution: {
          status: row.execution_status as 'success' | 'failure' | 'timeout',
          duration_ms: row.execution_duration_ms ?? 0,
          sideEffects: row.side_effects ? JSON.parse(row.side_effects) : [],
          error: row.error ?? undefined,
        },
        approver: row.approver ?? undefined,
        approvedAt: row.approved_at ?? undefined,
      };
    }

    if (row.approver) {
      return {
        ...baseEntry,
        approver: row.approver,
        approvedAt: row.approved_at ?? undefined,
      };
    }

    return baseEntry;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('AuditLogger closed');
  }
}

/**
 * Singleton instance for global access
 */
let auditLoggerInstance: AuditLogger | null = null;

export function initializeAuditLogger(dbPath?: string): AuditLogger {
  auditLoggerInstance = new AuditLogger(dbPath);
  return auditLoggerInstance;
}

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    throw new Error('AuditLogger not initialized. Call initializeAuditLogger() first.');
  }
  return auditLoggerInstance;
}

/**
 * Helper function for direct audit logging (without AuditLogger instance)
 * Used by PolicyEnforcer when initialized with auditLogger callback
 */
export function createAuditLogCallback(
  auditLogger: AuditLogger
): (entry: Record<string, unknown>) => void {
  return (entry: Record<string, unknown>) => {
    // Log structured event to Winston
    logger.info(`Audit: ${entry.type}`, entry);

    // If this is a decision event, also persist to SQLite
    if (entry.type === 'approval_requested' && entry.context && entry.decision) {
      auditLogger.logDecision(
        entry.context as AuthorizationContext,
        entry.decision as PolicyDecision
      );
    }
  };
}
