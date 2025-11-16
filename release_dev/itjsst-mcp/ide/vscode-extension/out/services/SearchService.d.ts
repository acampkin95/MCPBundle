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
export declare class SearchService {
    private readonly database;
    private readonly logger;
    private currentFilters;
    constructor(database: DatabaseService, logger: vscode.OutputChannel);
    /**
     * Search thoughts with filters
     */
    search(filters: SearchFilters): Promise<SearchResult>;
    /**
     * Get current filters
     */
    getCurrentFilters(): SearchFilters;
    /**
     * Clear all filters
     */
    clearFilters(): void;
    /**
     * Search with PostgreSQL full-text search
     */
    private searchPostgreSQL;
    /**
     * Search with SQLite FTS5 (requires FTS table creation)
     */
    private searchSQLite;
    /**
     * Check if FTS5 support is available
     */
    private checkFTS5Support;
    /**
     * Map SQLite rows to StructuredThought objects
     */
    private mapSQLiteRows;
    /**
     * Create FTS5 virtual table for SQLite (if not exists)
     */
    initializeFTS5(): Promise<void>;
}
//# sourceMappingURL=SearchService.d.ts.map