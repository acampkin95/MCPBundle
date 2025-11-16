/**
 * ResearchService - Integration with Perplexity MCP for deep research
 * Provides context-aware research capabilities with query history
 */

import * as vscode from 'vscode';
import { MCPClientService } from './MCPClientService';
import { DatabaseService } from './DatabaseService';
import { ResearchQuery, ResearchResult, MCPToolResult } from '../types';
import { LRUCache } from '../utils/LRUCache';
import { randomUUID } from 'crypto';

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

interface CachedQuery {
  readonly query: string;
  readonly result: ResearchResult;
}

/**
 * Service for managing research queries via Perplexity MCP
 */
export class ResearchService {
  private readonly mcpClient: MCPClientService;
  private readonly database: DatabaseService;
  private readonly logger: vscode.OutputChannel;

  // LRU cache for research results (10MB max, 1 hour TTL)
  private readonly queryCache: LRUCache<ResearchResult>;
  private readonly queryHistory: CachedQuery[] = [];
  private readonly favorites: Set<string> = new Set();

  constructor(
    mcpClient: MCPClientService,
    database: DatabaseService,
    logger: vscode.OutputChannel
  ) {
    this.mcpClient = mcpClient;
    this.database = database;
    this.logger = logger;

    // Initialize LRU cache
    this.queryCache = new LRUCache<ResearchResult>({
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 100,
      ttl: 60 * 60 * 1000, // 1 hour
      onEvict: (key) => {
        this.logger.appendLine(`[ResearchService] Evicted cache entry: ${key}`);
      },
    });
  }

  /**
   * Execute research query
   */
  public async research(
    query: string,
    options: ResearchOptions
  ): Promise<ResearchResult> {
    const queryId = randomUUID();
    const startTime = Date.now();

    this.logger.appendLine(`[ResearchService] Starting ${options.mode} research: ${query}`);

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(query, options);
      const cached = this.queryCache.get(cacheKey);
      if (cached) {
        this.logger.appendLine('[ResearchService] Returning cached result');
        return { ...cached, cached: true };
      }

      // Select appropriate MCP tool based on mode
      const toolName = this.getToolName(options.mode);
      const toolParams = this.buildToolParams(query, options);

      // Invoke Perplexity MCP server
      const mcpResult = await this.mcpClient.invokeTool<PerplexityResponse>({
        serverName: 'perplexity-mcp',
        toolName,
        arguments: toolParams,
      });

      // Parse response
      const parsedResult = this.parseResponse(mcpResult);

      const result: ResearchResult = {
        queryId,
        response: parsedResult.answer,
        sources: parsedResult.sources,
        cached: false,
        timestamp: new Date(),
      };

      // Cache result
      this.queryCache.set(cacheKey, result);

      // Add to history
      this.queryHistory.push({ query, result });

      // Optionally save to database
      if (options.saveToSession && options.sessionId) {
        await this.saveToDatabase(query, result, options.sessionId);
      }

      const duration = Date.now() - startTime;
      this.logger.appendLine(`[ResearchService] Research completed in ${duration}ms`);

      return result;
    } catch (error) {
      this.logger.appendLine(`[ResearchService] Research failed: ${String(error)}`);
      throw new Error(`Research failed: ${String(error)}`);
    }
  }

  /**
   * Get query history
   */
  public getHistory(limit = 20): ResearchQuery[] {
    return this.queryHistory
      .map((entry) => ({
        queryId: entry.result.queryId,
        queryText: entry.query,
        createdAt: entry.result.timestamp,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    readonly size: number;
    readonly entries: number;
    readonly utilizationPercent: number;
  } {
    return this.queryCache.stats();
  }

  /**
   * Add query to favorites
   */
  public addFavorite(queryId: string): void {
    this.favorites.add(queryId);
    this.logger.appendLine(`[ResearchService] Added favorite: ${queryId}`);
  }

  /**
   * Remove query from favorites
   */
  public removeFavorite(queryId: string): void {
    this.favorites.delete(queryId);
    this.logger.appendLine(`[ResearchService] Removed favorite: ${queryId}`);
  }

  /**
   * Get favorite queries
   */
  public getFavorites(): ResearchQuery[] {
    return this.getHistory(100).filter((query) => this.favorites.has(query.queryId));
  }

  /**
   * Clear query cache
   */
  public clearCache(): void {
    this.queryCache.clear();
    this.queryHistory.length = 0;
    this.logger.appendLine('[ResearchService] Cache cleared');
  }

  /**
   * Prune expired cache entries
   */
  public pruneCache(): number {
    const pruned = this.queryCache.prune();
    if (pruned > 0) {
      this.logger.appendLine(`[ResearchService] Pruned ${pruned} expired entries`);
    }
    return pruned;
  }

  /**
   * Extract context from active editor
   */
  public extractEditorContext(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    const document = editor.document;
    const selection = editor.selection;

    // If text is selected, use that as context
    if (!selection.isEmpty) {
      return document.getText(selection);
    }

    // Otherwise, use surrounding lines
    const currentLine = selection.active.line;
    const startLine = Math.max(0, currentLine - 5);
    const endLine = Math.min(document.lineCount - 1, currentLine + 5);
    const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);

    return document.getText(range);
  }

  /**
   * Get tool name based on research mode
   */
  private getToolName(mode: ResearchMode): string {
    switch (mode) {
      case 'quick':
        return 'research';
      case 'deep':
        return 'deep_research';
      case 'bi':
        return 'bi_research';
      default:
        return 'research';
    }
  }

  /**
   * Build tool parameters
   */
  private buildToolParams(query: string, options: ResearchOptions): Record<string, unknown> {
    const params: Record<string, unknown> = {
      query,
    };

    if (options.context) {
      params.context = options.context;
    }

    if (options.maxResults) {
      params.max_results = options.maxResults;
    }

    // Mode-specific parameters
    if (options.mode === 'deep') {
      params.focus = 'comprehensive';
      params.search_depth = 'extensive';
    } else if (options.mode === 'bi') {
      params.focus = 'business_intelligence';
      params.include_metrics = true;
    }

    return params;
  }

  /**
   * Parse MCP tool result
   */
  private parseResponse(mcpResult: MCPToolResult): PerplexityResponse {
    // Extract text content
    const textContent = mcpResult.content.find((c) => c.type === 'text')?.text ?? '';

    // Try to parse structured content
    const structured = mcpResult.structuredContent as
      | {
          answer?: string;
          sources?: string[];
          related_questions?: string[];
          confidence?: number;
        }
      | undefined;

    return {
      answer: structured?.answer ?? textContent,
      sources: structured?.sources,
      relatedQuestions: structured?.related_questions,
      confidence: structured?.confidence,
    };
  }

  /**
   * Generate cache key
   */
  private getCacheKey(query: string, options: ResearchOptions): string {
    const contextHash = options.context
      ? Buffer.from(options.context).toString('base64').substring(0, 16)
      : 'nocontext';
    return `${query}::${options.mode}::${contextHash}`;
  }

  /**
   * Save research result to database
   */
  private async saveToDatabase(
    query: string,
    result: ResearchResult,
    sessionId: string
  ): Promise<void> {
    try {
      // Save as a thought in the research stage
      const thoughtId = randomUUID();
      const content = `**Research Query**: ${query}\n\n**Answer**:\n${result.response}`;

      const metadata = {
        source: 'perplexity-mcp',
        tags: ['research', 'perplexity'],
        externalRefs: result.sources ?? [],
        queryId: result.queryId,
      };

      // Insert into database
      await this.database.query(
        `INSERT INTO structured_thoughts
         (thought_id, session_id, stage, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [thoughtId, sessionId, 'research', content, JSON.stringify(metadata)]
      );

      this.logger.appendLine(
        `[ResearchService] Saved research to database (session: ${sessionId})`
      );
    } catch (error) {
      // Non-critical error, log but don't throw
      this.logger.appendLine(
        `[ResearchService] Failed to save to database: ${String(error)}`
      );
    }
  }
}
