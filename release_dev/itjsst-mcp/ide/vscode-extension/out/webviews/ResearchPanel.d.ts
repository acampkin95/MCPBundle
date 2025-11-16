/**
 * ResearchPanel - Webview panel for Perplexity deep research
 * Provides rich UI for research queries with markdown rendering
 */
import * as vscode from 'vscode';
import { ResearchService } from '../services/ResearchService';
export declare class ResearchPanel {
    static currentPanel: ResearchPanel | undefined;
    private readonly panel;
    private readonly researchService;
    private readonly logger;
    private disposables;
    private sessionId?;
    private isResearching;
    static createOrShow(extensionUri: vscode.Uri, researchService: ResearchService, logger: vscode.OutputChannel, sessionId?: string): void;
    private constructor();
    dispose(): void;
    /**
     * Handle messages from webview
     */
    private handleMessage;
    /**
     * Perform research query
     */
    private performResearch;
    /**
     * Send editor context to webview
     */
    private sendEditorContext;
    /**
     * Send query history to webview
     */
    private sendHistory;
    /**
     * Send favorites to webview
     */
    private sendFavorites;
    /**
     * Update webview content
     */
    private update;
    /**
     * Generate HTML content for webview
     */
    private getHtmlContent;
    /**
     * Generate nonce for CSP
     */
    private getNonce;
}
//# sourceMappingURL=ResearchPanel.d.ts.map