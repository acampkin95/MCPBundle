/**
 * ExportService - Export thinking sessions to JSON/Markdown formats
 * Provides formatted exports with complete metadata and thought hierarchies
 */
import * as vscode from 'vscode';
import { DatabaseService } from './DatabaseService';
export type ExportFormat = 'json' | 'markdown';
export interface ExportOptions {
    readonly format: ExportFormat;
    readonly includeMetadata?: boolean;
    readonly includeTimestamps?: boolean;
    readonly groupByStage?: boolean;
    readonly prettify?: boolean;
}
export interface ExportResult {
    readonly content: string;
    readonly filename: string;
    readonly size: number;
}
/**
 * Service for exporting thinking sessions
 */
export declare class ExportService {
    private readonly database;
    private readonly logger;
    constructor(database: DatabaseService, logger: vscode.OutputChannel);
    /**
     * Export a complete thinking session
     */
    exportSession(sessionId: string, options: ExportOptions): Promise<ExportResult>;
    /**
     * Export single thought
     */
    exportThought(thoughtId: string, format: ExportFormat): Promise<ExportResult>;
    /**
     * Show save dialog and write export file
     */
    saveExport(result: ExportResult): Promise<boolean>;
    /**
     * Export to JSON format
     */
    private exportToJSON;
    /**
     * Export to Markdown format
     */
    private exportToMarkdown;
    /**
     * Format a single thought as Markdown
     */
    private formatThoughtMarkdown;
    /**
     * Group thoughts by cognitive stage
     */
    private groupByStage;
    /**
     * Format stage header with title
     */
    private formatStageHeader;
}
//# sourceMappingURL=ExportService.d.ts.map