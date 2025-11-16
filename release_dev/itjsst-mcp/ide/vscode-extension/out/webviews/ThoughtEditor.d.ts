/**
 * ThoughtEditor - Advanced markdown editor with live preview
 *
 * Features:
 * - Split-pane editor (markdown left, preview right)
 * - Live preview with syntax highlighting
 * - Metadata editing (tags, importance, quality score)
 * - Auto-save with debouncing
 * - Theme support (VSCode theme integration)
 */
import * as vscode from 'vscode';
import type { StructuredThought } from '../types';
import type { DatabaseService } from '../services/DatabaseService';
export declare class ThoughtEditor {
    private static currentPanel;
    private readonly panel;
    private readonly thought;
    private readonly databaseService;
    private readonly outputChannel;
    private disposables;
    private autoSaveTimeout;
    private constructor();
    /**
     * Create or show thought editor
     */
    static createOrShow(extensionUri: vscode.Uri, thought: StructuredThought, databaseService: DatabaseService, outputChannel: vscode.OutputChannel): Promise<void>;
    /**
     * Update thought content in editor
     */
    private updateThought;
    /**
     * Handle messages from webview
     */
    private handleMessage;
    /**
     * Handle save operation
     */
    private handleSave;
    /**
     * Schedule auto-save (debounced)
     * Note: This method is available but auto-save is handled client-side in the webview
     */
    private scheduleAutoSave;
    /**
     * Generate HTML content for webview
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
//# sourceMappingURL=ThoughtEditor.d.ts.map