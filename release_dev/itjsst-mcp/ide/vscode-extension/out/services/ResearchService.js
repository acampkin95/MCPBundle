"use strict";
/**
 * ResearchService - Integration with Perplexity MCP for deep research
 * Provides context-aware research capabilities with query history
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchService = void 0;
const vscode = __importStar(require("vscode"));
const LRUCache_1 = require("../utils/LRUCache");
const crypto_1 = require("crypto");
/**
 * Service for managing research queries via Perplexity MCP
 */
class ResearchService {
    mcpClient;
    database;
    logger;
    // LRU cache for research results (10MB max, 1 hour TTL)
    queryCache;
    queryHistory = [];
    favorites = new Set();
    constructor(mcpClient, database, logger) {
        this.mcpClient = mcpClient;
        this.database = database;
        this.logger = logger;
        // Initialize LRU cache
        this.queryCache = new LRUCache_1.LRUCache({
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
    async research(query, options) {
        const queryId = (0, crypto_1.randomUUID)();
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
            const mcpResult = await this.mcpClient.invokeTool({
                serverName: 'perplexity-mcp',
                toolName,
                arguments: toolParams,
            });
            // Parse response
            const parsedResult = this.parseResponse(mcpResult);
            const result = {
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
        }
        catch (error) {
            this.logger.appendLine(`[ResearchService] Research failed: ${String(error)}`);
            throw new Error(`Research failed: ${String(error)}`);
        }
    }
    /**
     * Get query history
     */
    getHistory(limit = 20) {
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
    getCacheStats() {
        return this.queryCache.stats();
    }
    /**
     * Add query to favorites
     */
    addFavorite(queryId) {
        this.favorites.add(queryId);
        this.logger.appendLine(`[ResearchService] Added favorite: ${queryId}`);
    }
    /**
     * Remove query from favorites
     */
    removeFavorite(queryId) {
        this.favorites.delete(queryId);
        this.logger.appendLine(`[ResearchService] Removed favorite: ${queryId}`);
    }
    /**
     * Get favorite queries
     */
    getFavorites() {
        return this.getHistory(100).filter((query) => this.favorites.has(query.queryId));
    }
    /**
     * Clear query cache
     */
    clearCache() {
        this.queryCache.clear();
        this.queryHistory.length = 0;
        this.logger.appendLine('[ResearchService] Cache cleared');
    }
    /**
     * Prune expired cache entries
     */
    pruneCache() {
        const pruned = this.queryCache.prune();
        if (pruned > 0) {
            this.logger.appendLine(`[ResearchService] Pruned ${pruned} expired entries`);
        }
        return pruned;
    }
    /**
     * Extract context from active editor
     */
    extractEditorContext() {
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
    getToolName(mode) {
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
    buildToolParams(query, options) {
        const params = {
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
        }
        else if (options.mode === 'bi') {
            params.focus = 'business_intelligence';
            params.include_metrics = true;
        }
        return params;
    }
    /**
     * Parse MCP tool result
     */
    parseResponse(mcpResult) {
        // Extract text content
        const textContent = mcpResult.content.find((c) => c.type === 'text')?.text ?? '';
        // Try to parse structured content
        const structured = mcpResult.structuredContent;
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
    getCacheKey(query, options) {
        const contextHash = options.context
            ? Buffer.from(options.context).toString('base64').substring(0, 16)
            : 'nocontext';
        return `${query}::${options.mode}::${contextHash}`;
    }
    /**
     * Save research result to database
     */
    async saveToDatabase(query, result, sessionId) {
        try {
            // Save as a thought in the research stage
            const thoughtId = (0, crypto_1.randomUUID)();
            const content = `**Research Query**: ${query}\n\n**Answer**:\n${result.response}`;
            const metadata = {
                source: 'perplexity-mcp',
                tags: ['research', 'perplexity'],
                externalRefs: result.sources ?? [],
                queryId: result.queryId,
            };
            // Insert into database
            await this.database.query(`INSERT INTO structured_thoughts
         (thought_id, session_id, stage, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`, [thoughtId, sessionId, 'research', content, JSON.stringify(metadata)]);
            this.logger.appendLine(`[ResearchService] Saved research to database (session: ${sessionId})`);
        }
        catch (error) {
            // Non-critical error, log but don't throw
            this.logger.appendLine(`[ResearchService] Failed to save to database: ${String(error)}`);
        }
    }
}
exports.ResearchService = ResearchService;
//# sourceMappingURL=ResearchService.js.map