/**
 * ThinkingProcessTreeProvider - Tree view for structured thinking processes
 */
import * as vscode from 'vscode';
import { DatabaseService } from '../services/DatabaseService';
import { TreeItemType } from '../types';
export declare class ThinkingProcessTreeItem extends vscode.TreeItem {
    readonly type: TreeItemType;
    readonly label: string;
    readonly id: string;
    readonly collapsibleState: vscode.TreeItemCollapsibleState;
    readonly metadata?: unknown | undefined;
    constructor(type: TreeItemType, label: string, id: string, collapsibleState: vscode.TreeItemCollapsibleState, metadata?: unknown | undefined);
}
export declare class ThinkingProcessTreeProvider implements vscode.TreeDataProvider<ThinkingProcessTreeItem> {
    private readonly logger;
    private readonly databaseService;
    private readonly _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | ThinkingProcessTreeItem | null | undefined>;
    private refreshInterval?;
    private debounceTimer?;
    private maxThoughtsPerSession;
    constructor(databaseService: DatabaseService, logger: vscode.OutputChannel, config: {
        refreshInterval: number;
        maxThoughtsPerSession: number;
    });
    /**
     * Refresh tree view immediately
     */
    refresh(): void;
    /**
     * Debounced refresh to prevent excessive updates
     */
    private debouncedRefresh;
    /**
     * Get tree item
     */
    getTreeItem(element: ThinkingProcessTreeItem): vscode.TreeItem;
    /**
     * Get children for tree item
     */
    getChildren(element?: ThinkingProcessTreeItem): Promise<ThinkingProcessTreeItem[]>;
    /**
     * Get root sessions
     */
    private getRootSessions;
    /**
     * Get stages for a session
     */
    private getSessionStages;
    /**
     * Get thoughts for a stage
     */
    private getStageThoughts;
    /**
     * Group thoughts by cognitive stage
     */
    private groupThoughtsByStage;
    /**
     * Format session label
     */
    private formatSessionLabel;
    /**
     * Format session description
     */
    private formatSessionDescription;
    /**
     * Format session tooltip
     */
    private formatSessionTooltip;
    /**
     * Format stage label
     */
    private formatStageLabel;
    /**
     * Format thought label
     */
    private formatThoughtLabel;
    /**
     * Format thought description
     */
    private formatThoughtDescription;
    /**
     * Format thought tooltip
     */
    private formatThoughtTooltip;
    /**
     * Get color for cognitive stage
     */
    private getStageColor;
    /**
     * Get color for quality score
     */
    private getQualityScoreColor;
    /**
     * Format time ago
     */
    private formatTimeAgo;
    /**
     * Dispose resources
     */
    dispose(): void;
}
//# sourceMappingURL=ThinkingProcessTreeProvider.d.ts.map