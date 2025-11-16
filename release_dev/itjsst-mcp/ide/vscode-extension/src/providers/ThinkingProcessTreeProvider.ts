/**
 * ThinkingProcessTreeProvider - Tree view for structured thinking processes
 */

import * as vscode from 'vscode';
import { DatabaseService } from '../services/DatabaseService';
import {
  ThoughtSession,
  StructuredThought,
  CognitiveStage,
  TreeItemType,
} from '../types';

export class ThinkingProcessTreeItem extends vscode.TreeItem {
  constructor(
    public readonly type: TreeItemType,
    public readonly label: string,
    public readonly id: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly metadata?: unknown
  ) {
    super(label, collapsibleState);
    this.contextValue = type;
    this.id = id;

    // Set icons based on type
    switch (type) {
      case 'session':
        this.iconPath = new vscode.ThemeIcon('folder');
        break;
      case 'stage':
        this.iconPath = new vscode.ThemeIcon('symbol-enum');
        break;
      case 'thought':
        this.iconPath = new vscode.ThemeIcon('comment');
        break;
      case 'project':
        this.iconPath = new vscode.ThemeIcon('project');
        break;
    }
  }
}

export class ThinkingProcessTreeProvider
  implements vscode.TreeDataProvider<ThinkingProcessTreeItem>
{
  private readonly logger: vscode.OutputChannel;
  private readonly databaseService: DatabaseService;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ThinkingProcessTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private refreshInterval?: NodeJS.Timeout;
  private debounceTimer?: NodeJS.Timeout;
  private maxThoughtsPerSession: number;

  // Pagination state (reserved for future virtual scrolling implementation)
  // private readonly _pageSize = 50;
  // private _currentPage = 0;

  constructor(
    databaseService: DatabaseService,
    logger: vscode.OutputChannel,
    config: {
      refreshInterval: number;
      maxThoughtsPerSession: number;
    }
  ) {
    this.databaseService = databaseService;
    this.logger = logger;
    this.maxThoughtsPerSession = config.maxThoughtsPerSession;

    // Setup auto-refresh if enabled
    if (config.refreshInterval > 0) {
      this.refreshInterval = setInterval(() => {
        this.debouncedRefresh(1000); // Debounced auto-refresh
      }, config.refreshInterval);
    }
  }

  /**
   * Refresh tree view immediately
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
    this.logger.appendLine('[ThinkingProcessTreeProvider] Tree view refreshed');
  }

  /**
   * Debounced refresh to prevent excessive updates
   */
  private debouncedRefresh(delay = 300): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.refresh();
      this.debounceTimer = undefined;
    }, delay);
  }

  /**
   * Get tree item
   */
  public getTreeItem(element: ThinkingProcessTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for tree item
   */
  public async getChildren(
    element?: ThinkingProcessTreeItem
  ): Promise<ThinkingProcessTreeItem[]> {
    if (!this.databaseService.isHealthy()) {
      return [];
    }

    try {
      if (!element) {
        // Root level - show sessions
        return this.getRootSessions();
      }

      switch (element.type) {
        case 'session':
          return this.getSessionStages(element);
        case 'stage':
          return this.getStageThoughts(element);
        case 'thought':
          return []; // Thoughts have no children
        default:
          return [];
      }
    } catch (error) {
      this.logger.appendLine(
        `[ThinkingProcessTreeProvider] Error getting children: ${String(error)}`
      );
      return [];
    }
  }

  /**
   * Get root sessions
   */
  private async getRootSessions(): Promise<ThinkingProcessTreeItem[]> {
    const sessions = await this.databaseService.getSessions(50);

    if (sessions.length === 0) {
      // Show placeholder
      const placeholder = new ThinkingProcessTreeItem(
        'session',
        'No thinking sessions found',
        'placeholder',
        vscode.TreeItemCollapsibleState.None
      );
      placeholder.description = 'Create a new session to get started';
      return [placeholder];
    }

    return sessions.map((session) => {
      const item = new ThinkingProcessTreeItem(
        'session',
        this.formatSessionLabel(session),
        `session-${session.sessionId}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        session
      );

      item.description = this.formatSessionDescription(session);
      item.tooltip = this.formatSessionTooltip(session);

      return item;
    });
  }

  /**
   * Get stages for a session
   */
  private async getSessionStages(
    sessionElement: ThinkingProcessTreeItem
  ): Promise<ThinkingProcessTreeItem[]> {
    const session = sessionElement.metadata as ThoughtSession;

    // Get all thoughts for this session
    const thoughts = await this.databaseService.getThoughts(
      session.sessionId,
      this.maxThoughtsPerSession
    );

    if (thoughts.length === 0) {
      const placeholder = new ThinkingProcessTreeItem(
        'thought',
        'No thoughts in this session',
        `${sessionElement.id}-empty`,
        vscode.TreeItemCollapsibleState.None
      );
      return [placeholder];
    }

    // Group thoughts by stage
    const thoughtsByStage = this.groupThoughtsByStage(thoughts);

    // Create stage items
    const stageItems: ThinkingProcessTreeItem[] = [];

    for (const [stage, stageThoughts] of thoughtsByStage.entries()) {
      const item = new ThinkingProcessTreeItem(
        'stage',
        this.formatStageLabel(stage, stageThoughts.length),
        `${sessionElement.id}-stage-${stage}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        { stage, thoughts: stageThoughts, sessionId: session.sessionId }
      );

      item.description = `${stageThoughts.length} thought${stageThoughts.length === 1 ? '' : 's'}`;

      // Color code by stage
      item.iconPath = new vscode.ThemeIcon(
        'symbol-enum',
        this.getStageColor(stage)
      );

      stageItems.push(item);
    }

    return stageItems;
  }

  /**
   * Get thoughts for a stage
   */
  private async getStageThoughts(
    stageElement: ThinkingProcessTreeItem
  ): Promise<ThinkingProcessTreeItem[]> {
    const metadata = stageElement.metadata as {
      stage: CognitiveStage;
      thoughts: StructuredThought[];
      sessionId: string;
    };

    return metadata.thoughts.map((thought, index) => {
      const item = new ThinkingProcessTreeItem(
        'thought',
        this.formatThoughtLabel(thought, index + 1),
        `thought-${thought.thoughtId}`,
        vscode.TreeItemCollapsibleState.None,
        thought
      );

      item.description = this.formatThoughtDescription(thought);
      item.tooltip = this.formatThoughtTooltip(thought);

      // Quality score coloring
      if (thought.qualityScore !== undefined) {
        item.iconPath = new vscode.ThemeIcon(
          'comment',
          this.getQualityScoreColor(thought.qualityScore)
        );
      }

      return item;
    });
  }

  /**
   * Group thoughts by cognitive stage
   */
  private groupThoughtsByStage(
    thoughts: StructuredThought[]
  ): Map<CognitiveStage, StructuredThought[]> {
    const grouped = new Map<CognitiveStage, StructuredThought[]>();

    for (const thought of thoughts) {
      const existing = grouped.get(thought.stage) ?? [];
      existing.push(thought);
      grouped.set(thought.stage, existing);
    }

    return grouped;
  }

  /**
   * Format session label
   */
  private formatSessionLabel(session: ThoughtSession): string {
    const projectPrefix = session.projectName ? `[${session.projectName}] ` : '';
    return `${projectPrefix}${session.origin}`;
  }

  /**
   * Format session description
   */
  private formatSessionDescription(session: ThoughtSession): string {
    const thoughtCount = `${session.thoughtCount} thought${session.thoughtCount === 1 ? '' : 's'}`;
    const timeAgo = this.formatTimeAgo(session.lastActiveAt);
    return `${thoughtCount} • ${timeAgo}`;
  }

  /**
   * Format session tooltip
   */
  private formatSessionTooltip(session: ThoughtSession): string {
    return [
      `Session ID: ${session.sessionId}`,
      `Origin: ${session.origin}`,
      session.projectName ? `Project: ${session.projectName}` : null,
      `Created: ${session.createdAt.toLocaleString()}`,
      `Last Active: ${session.lastActiveAt.toLocaleString()}`,
      `Thoughts: ${session.thoughtCount}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  /**
   * Format stage label
   */
  private formatStageLabel(stage: CognitiveStage, _count: number): string {
    const stageNames: Record<CognitiveStage, string> = {
      problem_definition: 'Problem Definition',
      research: 'Research',
      analysis: 'Analysis',
      synthesis: 'Synthesis',
      conclusion: 'Conclusion',
      reflection: 'Reflection',
      implementation: 'Implementation',
      validation: 'Validation',
    };

    return stageNames[stage] ?? stage;
  }

  /**
   * Format thought label
   */
  private formatThoughtLabel(thought: StructuredThought, index: number): string {
    const preview = thought.content.substring(0, 60);
    const truncated = thought.content.length > 60 ? '...' : '';
    return `${index}. ${preview}${truncated}`;
  }

  /**
   * Format thought description
   */
  private formatThoughtDescription(thought: StructuredThought): string {
    const parts: string[] = [];

    if (thought.qualityScore !== undefined) {
      parts.push(`Q: ${thought.qualityScore}`);
    }

    if (thought.metadata?.importance) {
      parts.push(thought.metadata.importance.toUpperCase());
    }

    return parts.join(' • ');
  }

  /**
   * Format thought tooltip
   */
  private formatThoughtTooltip(thought: StructuredThought): string {
    return [
      `Thought ID: ${thought.thoughtId}`,
      `Stage: ${thought.stage}`,
      thought.qualityScore ? `Quality Score: ${thought.qualityScore}` : null,
      thought.metadata?.importance
        ? `Importance: ${thought.metadata.importance}`
        : null,
      thought.metadata?.tags?.length
        ? `Tags: ${thought.metadata.tags.join(', ')}`
        : null,
      `Created: ${thought.createdAt.toLocaleString()}`,
      '',
      `Content: ${thought.content}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  /**
   * Get color for cognitive stage
   */
  private getStageColor(stage: CognitiveStage): vscode.ThemeColor {
    const colors: Record<CognitiveStage, string> = {
      problem_definition: 'charts.red',
      research: 'charts.blue',
      analysis: 'charts.yellow',
      synthesis: 'charts.purple',
      conclusion: 'charts.green',
      reflection: 'charts.orange',
      implementation: 'charts.pink',
      validation: 'charts.foreground',
    };

    return new vscode.ThemeColor(colors[stage] ?? 'charts.foreground');
  }

  /**
   * Get color for quality score
   */
  private getQualityScoreColor(score: number): vscode.ThemeColor {
    if (score >= 80) {
      return new vscode.ThemeColor('charts.green');
    }
    if (score >= 60) {
      return new vscode.ThemeColor('charts.yellow');
    }
    if (score >= 40) {
      return new vscode.ThemeColor('charts.orange');
    }
    return new vscode.ThemeColor('charts.red');
  }

  /**
   * Format time ago
   */
  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return 'just now';
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return date.toLocaleDateString();
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    this._onDidChangeTreeData.dispose();
  }
}
