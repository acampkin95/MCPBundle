/**
 * SearchService - Advanced filtering and full-text search for thoughts
 * Supports PostgreSQL tsvector and SQLite FTS5 for efficient search
 */

import * as vscode from 'vscode';
import { DatabaseService } from './DatabaseService';
import { StructuredThought, CognitiveStage, ImportanceLevel } from '../types';

export interface SearchFilters {
  readonly query?: string;
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly stage?: CognitiveStage;
  readonly importance?: ImportanceLevel;
  readonly tags?: readonly string[];
  readonly qualityScoreMin?: number;
  readonly qualityScoreMax?: number;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly hasParent?: boolean;
  readonly limit?: number;
}

export interface SearchResult {
  readonly thoughts: StructuredThought[];
  readonly totalCount: number;
  readonly executionTime: number;
}

/**
 * Service for searching and filtering thoughts
 */
export class SearchService {
  private readonly database: DatabaseService;
  private readonly logger: vscode.OutputChannel;

  // Cached filter state
  private currentFilters: SearchFilters = {};

  constructor(database: DatabaseService, logger: vscode.OutputChannel) {
    this.database = database;
    this.logger = logger;
  }

  /**
   * Search thoughts with filters
   */
  public async search(filters: SearchFilters): Promise<SearchResult> {
    const startTime = Date.now();

    this.logger.appendLine(
      `[SearchService] Searching with filters: ${JSON.stringify(filters)}`
    );

    try {
      const mode = this.database.getMode();

      const thoughts =
        mode === 'postgresql'
          ? await this.searchPostgreSQL(filters)
          : await this.searchSQLite(filters);

      const executionTime = Date.now() - startTime;

      this.logger.appendLine(
        `[SearchService] Found ${thoughts.length} results in ${executionTime}ms`
      );

      // Update cached filters
      this.currentFilters = filters;

      return {
        thoughts,
        totalCount: thoughts.length,
        executionTime,
      };
    } catch (error) {
      this.logger.appendLine(`[SearchService] Search failed: ${String(error)}`);
      throw new Error(`Search failed: ${String(error)}`);
    }
  }

  /**
   * Get current filters
   */
  public getCurrentFilters(): SearchFilters {
    return this.currentFilters;
  }

  /**
   * Clear all filters
   */
  public clearFilters(): void {
    this.currentFilters = {};
    this.logger.appendLine('[SearchService] Filters cleared');
  }

  /**
   * Search with PostgreSQL full-text search
   */
  private async searchPostgreSQL(filters: SearchFilters): Promise<StructuredThought[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Full-text search on content
    if (filters.query) {
      conditions.push(
        `to_tsvector('english', content) @@ plainto_tsquery('english', $${paramIndex++})`
      );
      params.push(filters.query);
    }

    // Session filter
    if (filters.sessionId) {
      conditions.push(`session_id = $${paramIndex++}`);
      params.push(filters.sessionId);
    }

    // Project filter
    if (filters.projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(filters.projectId);
    }

    // Stage filter
    if (filters.stage) {
      conditions.push(`stage = $${paramIndex++}`);
      params.push(filters.stage);
    }

    // Quality score range
    if (filters.qualityScoreMin !== undefined) {
      conditions.push(`quality_score >= $${paramIndex++}`);
      params.push(filters.qualityScoreMin);
    }

    if (filters.qualityScoreMax !== undefined) {
      conditions.push(`quality_score <= $${paramIndex++}`);
      params.push(filters.qualityScoreMax);
    }

    // Date range
    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.dateTo.toISOString());
    }

    // Parent thought filter
    if (filters.hasParent !== undefined) {
      conditions.push(
        filters.hasParent ? 'parent_thought_id IS NOT NULL' : 'parent_thought_id IS NULL'
      );
    }

    // Metadata filters (importance, tags)
    if (filters.importance) {
      conditions.push(`metadata->>'importance' = $${paramIndex++}`);
      params.push(filters.importance);
    }

    if (filters.tags && filters.tags.length > 0) {
      // Check if any tag matches
      conditions.push(`metadata->'tags' ?| $${paramIndex++}`);
      params.push(filters.tags);
    }

    // Build query
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100';

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
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause}
    `;

    const rows = await this.database.query<{
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
    }>(query, params);

    return rows.map((row) => ({
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

  /**
   * Search with SQLite FTS5 (requires FTS table creation)
   */
  private async searchSQLite(filters: SearchFilters): Promise<StructuredThought[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // For full-text search, we need to check if FTS5 table exists
    // If not, fall back to LIKE queries
    const useFTS = filters.query ? await this.checkFTS5Support() : false;

    if (useFTS && filters.query) {
      // Use FTS5 for full-text search
      const ftsQuery = `
        SELECT
          st.thought_id,
          st.session_id,
          st.project_id,
          st.stage,
          st.content,
          st.metadata,
          st.quality_score,
          st.parent_thought_id,
          st.created_at,
          st.updated_at
        FROM structured_thoughts st
        INNER JOIN thoughts_fts ON thoughts_fts.rowid = st.rowid
        WHERE thoughts_fts MATCH ?
        ORDER BY st.created_at DESC
        LIMIT ?
      `;

      const rows = await this.database.query<{
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
      }>(ftsQuery, [filters.query, filters.limit ?? 100]);

      return this.mapSQLiteRows(rows);
    }

    // Standard SQL filters
    if (filters.query) {
      conditions.push(`content LIKE ?`);
      params.push(`%${filters.query}%`);
    }

    if (filters.sessionId) {
      conditions.push(`session_id = ?`);
      params.push(filters.sessionId);
    }

    if (filters.projectId) {
      conditions.push(`project_id = ?`);
      params.push(filters.projectId);
    }

    if (filters.stage) {
      conditions.push(`stage = ?`);
      params.push(filters.stage);
    }

    if (filters.qualityScoreMin !== undefined) {
      conditions.push(`quality_score >= ?`);
      params.push(filters.qualityScoreMin);
    }

    if (filters.qualityScoreMax !== undefined) {
      conditions.push(`quality_score <= ?`);
      params.push(filters.qualityScoreMax);
    }

    if (filters.dateFrom) {
      conditions.push(`created_at >= ?`);
      params.push(filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= ?`);
      params.push(filters.dateTo.toISOString());
    }

    if (filters.hasParent !== undefined) {
      conditions.push(
        filters.hasParent ? 'parent_thought_id IS NOT NULL' : 'parent_thought_id IS NULL'
      );
    }

    // Metadata filters (JSON operations in SQLite)
    if (filters.importance) {
      conditions.push(`json_extract(metadata, '$.importance') = ?`);
      params.push(filters.importance);
    }

    if (filters.tags && filters.tags.length > 0) {
      // Check if any tag exists in the JSON array
      const tagConditions = filters.tags.map(() => `json_extract(metadata, '$.tags') LIKE ?`);
      conditions.push(`(${tagConditions.join(' OR ')})`);
      for (const tag of filters.tags) {
        params.push(`%"${tag}"%`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    params.push(filters.limit ?? 100);

    const rows = await this.database.query<{
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
    }>(query, params);

    return this.mapSQLiteRows(rows);
  }

  /**
   * Check if FTS5 support is available
   */
  private async checkFTS5Support(): Promise<boolean> {
    try {
      const result = await this.database.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='thoughts_fts'`,
        []
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Map SQLite rows to StructuredThought objects
   */
  private mapSQLiteRows(
    rows: Array<{
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
    }>
  ): StructuredThought[] {
    return rows.map((row) => ({
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

  /**
   * Create FTS5 virtual table for SQLite (if not exists)
   */
  public async initializeFTS5(): Promise<void> {
    if (this.database.getMode() !== 'sqlite') {
      return;
    }

    try {
      await this.database.query(
        `CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts
         USING fts5(content, content='structured_thoughts', content_rowid='rowid')`,
        []
      );

      // Create triggers to keep FTS in sync
      await this.database.query(
        `CREATE TRIGGER IF NOT EXISTS thoughts_ai AFTER INSERT ON structured_thoughts BEGIN
           INSERT INTO thoughts_fts(rowid, content) VALUES (new.rowid, new.content);
         END`,
        []
      );

      await this.database.query(
        `CREATE TRIGGER IF NOT EXISTS thoughts_ad AFTER DELETE ON structured_thoughts BEGIN
           INSERT INTO thoughts_fts(thoughts_fts, rowid, content) VALUES('delete', old.rowid, old.content);
         END`,
        []
      );

      await this.database.query(
        `CREATE TRIGGER IF NOT EXISTS thoughts_au AFTER UPDATE ON structured_thoughts BEGIN
           INSERT INTO thoughts_fts(thoughts_fts, rowid, content) VALUES('delete', old.rowid, old.content);
           INSERT INTO thoughts_fts(rowid, content) VALUES (new.rowid, new.content);
         END`,
        []
      );

      this.logger.appendLine('[SearchService] FTS5 initialized for SQLite');
    } catch (error) {
      this.logger.appendLine(`[SearchService] FTS5 initialization failed: ${String(error)}`);
    }
  }
}
