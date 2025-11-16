"use strict";
/**
 * ThinkingProcessTreeProvider - Tree view for structured thinking processes
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
exports.ThinkingProcessTreeProvider = exports.ThinkingProcessTreeItem = void 0;
const vscode = __importStar(require("vscode"));
class ThinkingProcessTreeItem extends vscode.TreeItem {
    type;
    label;
    id;
    collapsibleState;
    metadata;
    constructor(type, label, id, collapsibleState, metadata) {
        super(label, collapsibleState);
        this.type = type;
        this.label = label;
        this.id = id;
        this.collapsibleState = collapsibleState;
        this.metadata = metadata;
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
exports.ThinkingProcessTreeItem = ThinkingProcessTreeItem;
class ThinkingProcessTreeProvider {
    logger;
    databaseService;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    refreshInterval;
    debounceTimer;
    maxThoughtsPerSession;
    // Pagination state (reserved for future virtual scrolling implementation)
    // private readonly _pageSize = 50;
    // private _currentPage = 0;
    constructor(databaseService, logger, config) {
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
    refresh() {
        this._onDidChangeTreeData.fire();
        this.logger.appendLine('[ThinkingProcessTreeProvider] Tree view refreshed');
    }
    /**
     * Debounced refresh to prevent excessive updates
     */
    debouncedRefresh(delay = 300) {
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
    getTreeItem(element) {
        return element;
    }
    /**
     * Get children for tree item
     */
    async getChildren(element) {
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
        }
        catch (error) {
            this.logger.appendLine(`[ThinkingProcessTreeProvider] Error getting children: ${String(error)}`);
            return [];
        }
    }
    /**
     * Get root sessions
     */
    async getRootSessions() {
        const sessions = await this.databaseService.getSessions(50);
        if (sessions.length === 0) {
            // Show placeholder
            const placeholder = new ThinkingProcessTreeItem('session', 'No thinking sessions found', 'placeholder', vscode.TreeItemCollapsibleState.None);
            placeholder.description = 'Create a new session to get started';
            return [placeholder];
        }
        return sessions.map((session) => {
            const item = new ThinkingProcessTreeItem('session', this.formatSessionLabel(session), `session-${session.sessionId}`, vscode.TreeItemCollapsibleState.Collapsed, session);
            item.description = this.formatSessionDescription(session);
            item.tooltip = this.formatSessionTooltip(session);
            return item;
        });
    }
    /**
     * Get stages for a session
     */
    async getSessionStages(sessionElement) {
        const session = sessionElement.metadata;
        // Get all thoughts for this session
        const thoughts = await this.databaseService.getThoughts(session.sessionId, this.maxThoughtsPerSession);
        if (thoughts.length === 0) {
            const placeholder = new ThinkingProcessTreeItem('thought', 'No thoughts in this session', `${sessionElement.id}-empty`, vscode.TreeItemCollapsibleState.None);
            return [placeholder];
        }
        // Group thoughts by stage
        const thoughtsByStage = this.groupThoughtsByStage(thoughts);
        // Create stage items
        const stageItems = [];
        for (const [stage, stageThoughts] of thoughtsByStage.entries()) {
            const item = new ThinkingProcessTreeItem('stage', this.formatStageLabel(stage, stageThoughts.length), `${sessionElement.id}-stage-${stage}`, vscode.TreeItemCollapsibleState.Collapsed, { stage, thoughts: stageThoughts, sessionId: session.sessionId });
            item.description = `${stageThoughts.length} thought${stageThoughts.length === 1 ? '' : 's'}`;
            // Color code by stage
            item.iconPath = new vscode.ThemeIcon('symbol-enum', this.getStageColor(stage));
            stageItems.push(item);
        }
        return stageItems;
    }
    /**
     * Get thoughts for a stage
     */
    async getStageThoughts(stageElement) {
        const metadata = stageElement.metadata;
        return metadata.thoughts.map((thought, index) => {
            const item = new ThinkingProcessTreeItem('thought', this.formatThoughtLabel(thought, index + 1), `thought-${thought.thoughtId}`, vscode.TreeItemCollapsibleState.None, thought);
            item.description = this.formatThoughtDescription(thought);
            item.tooltip = this.formatThoughtTooltip(thought);
            // Quality score coloring
            if (thought.qualityScore !== undefined) {
                item.iconPath = new vscode.ThemeIcon('comment', this.getQualityScoreColor(thought.qualityScore));
            }
            return item;
        });
    }
    /**
     * Group thoughts by cognitive stage
     */
    groupThoughtsByStage(thoughts) {
        const grouped = new Map();
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
    formatSessionLabel(session) {
        const projectPrefix = session.projectName ? `[${session.projectName}] ` : '';
        return `${projectPrefix}${session.origin}`;
    }
    /**
     * Format session description
     */
    formatSessionDescription(session) {
        const thoughtCount = `${session.thoughtCount} thought${session.thoughtCount === 1 ? '' : 's'}`;
        const timeAgo = this.formatTimeAgo(session.lastActiveAt);
        return `${thoughtCount} • ${timeAgo}`;
    }
    /**
     * Format session tooltip
     */
    formatSessionTooltip(session) {
        return [
            `Session ID: ${session.sessionId}`,
            `Origin: ${session.origin}`,
            session.projectName ? `Project: ${session.projectName}` : null,
            `Created: ${session.createdAt.toLocaleString()}`,
            `Last Active: ${session.lastActiveAt.toLocaleString()}`,
            `Thoughts: ${session.thoughtCount}`,
        ]
            .filter((line) => line !== null)
            .join('\n');
    }
    /**
     * Format stage label
     */
    formatStageLabel(stage, _count) {
        const stageNames = {
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
    formatThoughtLabel(thought, index) {
        const preview = thought.content.substring(0, 60);
        const truncated = thought.content.length > 60 ? '...' : '';
        return `${index}. ${preview}${truncated}`;
    }
    /**
     * Format thought description
     */
    formatThoughtDescription(thought) {
        const parts = [];
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
    formatThoughtTooltip(thought) {
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
            .filter((line) => line !== null)
            .join('\n');
    }
    /**
     * Get color for cognitive stage
     */
    getStageColor(stage) {
        const colors = {
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
    getQualityScoreColor(score) {
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
    formatTimeAgo(date) {
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
    dispose() {
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
exports.ThinkingProcessTreeProvider = ThinkingProcessTreeProvider;
//# sourceMappingURL=ThinkingProcessTreeProvider.js.map