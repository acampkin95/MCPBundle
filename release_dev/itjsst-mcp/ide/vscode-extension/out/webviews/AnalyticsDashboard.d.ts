/**
 * AnalyticsDashboard - Comprehensive metrics and visualization dashboard
 *
 * Features:
 * - Thinking sessions over time (time series chart)
 * - Quality score distribution by stage
 * - Tag cloud from thought metadata
 * - Time spent per stage analysis
 * - Completion rates and productivity metrics
 * - Research query frequency analysis
 */
import * as vscode from 'vscode';
import type { DatabaseService } from '../services/DatabaseService';
export declare class AnalyticsDashboard {
    private static currentPanel;
    private readonly panel;
    private readonly databaseService;
    private readonly outputChannel;
    private disposables;
    private refreshInterval?;
    private constructor();
    /**
     * Create or show analytics dashboard
     */
    static createOrShow(extensionUri: vscode.Uri, databaseService: DatabaseService, outputChannel: vscode.OutputChannel): Promise<void>;
    /**
     * Handle messages from webview
     */
    private handleMessage;
    /**
     * Update dashboard with latest metrics
     */
    private update;
    /**
     * Calculate analytics metrics from database
     */
    private calculateMetrics;
    /**
     * Export metrics to JSON file
     */
    private exportMetrics;
    /**
     * Generate HTML content for dashboard
     */
    private getHtmlContent;
    /**
     * Generate random nonce for CSP
     */
    private getNonce;
    /**
     * Dispose resources
     */
    dispose(): void;
}
//# sourceMappingURL=AnalyticsDashboard.d.ts.map