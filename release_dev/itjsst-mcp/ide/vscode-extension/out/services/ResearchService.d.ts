/**
 * ResearchService - Integration with Perplexity MCP for deep research
 * Provides context-aware research capabilities with query history
 */
import * as vscode from 'vscode';
import { MCPClientService } from './MCPClientService';
import { DatabaseService } from './DatabaseService';
import { ResearchQuery, ResearchResult } from '../types';
export type ResearchMode = 'quick' | 'deep' | 'bi';
export interface ResearchOptions {
    readonly mode: ResearchMode;
    readonly context?: string;
    readonly sessionId?: string;
    readonly maxResults?: number;
    readonly saveToSession?: boolean;
}
export interface PerplexityResponse {
    readonly answer: string;
    readonly sources?: readonly string[];
    readonly relatedQuestions?: readonly string[];
    readonly confidence?: number;
}
/**
 * Service for managing research queries via Perplexity MCP
 */
export declare class ResearchService {
    private readonly mcpClient;
    private readonly database;
    private readonly logger;
    private readonly queryCache;
    private readonly queryHistory;
    private readonly favorites;
    constructor(mcpClient: MCPClientService, database: DatabaseService, logger: vscode.OutputChannel);
    /**
     * Execute research query
     */
    research(query: string, options: ResearchOptions): Promise<ResearchResult>;
    /**
     * Get query history
     */
    getHistory(limit?: number): ResearchQuery[];
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        readonly size: number;
        readonly entries: number;
        readonly utilizationPercent: number;
    };
    /**
     * Add query to favorites
     */
    addFavorite(queryId: string): void;
    /**
     * Remove query from favorites
     */
    removeFavorite(queryId: string): void;
    /**
     * Get favorite queries
     */
    getFavorites(): ResearchQuery[];
    /**
     * Clear query cache
     */
    clearCache(): void;
    /**
     * Prune expired cache entries
     */
    pruneCache(): number;
    /**
     * Extract context from active editor
     */
    extractEditorContext(): string | undefined;
    /**
     * Get tool name based on research mode
     */
    private getToolName;
    /**
     * Build tool parameters
     */
    private buildToolParams;
    /**
     * Parse MCP tool result
     */
    private parseResponse;
    /**
     * Generate cache key
     */
    private getCacheKey;
    /**
     * Save research result to database
     */
    private saveToDatabase;
}
//# sourceMappingURL=ResearchService.d.ts.map