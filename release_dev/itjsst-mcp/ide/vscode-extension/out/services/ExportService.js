"use strict";
/**
 * ExportService - Export thinking sessions to JSON/Markdown formats
 * Provides formatted exports with complete metadata and thought hierarchies
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
exports.ExportService = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Service for exporting thinking sessions
 */
class ExportService {
    database;
    logger;
    constructor(database, logger) {
        this.database = database;
        this.logger = logger;
    }
    /**
     * Export a complete thinking session
     */
    async exportSession(sessionId, options) {
        this.logger.appendLine(`[ExportService] Exporting session ${sessionId} as ${options.format}`);
        try {
            // Fetch session and thoughts
            const sessions = await this.database.getSessions(1000);
            const session = sessions.find((s) => s.sessionId === sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }
            const thoughts = await this.database.getThoughts(sessionId, 1000);
            // Generate export content
            const content = options.format === 'json'
                ? this.exportToJSON(session, thoughts, options)
                : this.exportToMarkdown(session, thoughts, options);
            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const sanitizedOrigin = session.origin
                .replace(/[^a-zA-Z0-9]/g, '-')
                .substring(0, 50);
            const filename = `${sanitizedOrigin}-${timestamp}.${options.format}`;
            const result = {
                content,
                filename,
                size: Buffer.byteLength(content, 'utf8'),
            };
            this.logger.appendLine(`[ExportService] Export completed (${result.size} bytes, ${thoughts.length} thoughts)`);
            return result;
        }
        catch (error) {
            this.logger.appendLine(`[ExportService] Export failed: ${String(error)}`);
            throw new Error(`Export failed: ${String(error)}`);
        }
    }
    /**
     * Export single thought
     */
    async exportThought(thoughtId, format) {
        // Query for the specific thought
        const thoughts = await this.database.query(`SELECT thought_id, session_id, stage, content, metadata, quality_score, created_at
       FROM structured_thoughts
       WHERE thought_id = $1`, [thoughtId]);
        if (thoughts.length === 0) {
            throw new Error(`Thought not found: ${thoughtId}`);
        }
        const thought = {
            thoughtId: thoughts[0].thought_id,
            sessionId: thoughts[0].session_id,
            stage: thoughts[0].stage,
            content: thoughts[0].content,
            metadata: thoughts[0].metadata ? JSON.parse(thoughts[0].metadata) : undefined,
            qualityScore: thoughts[0].quality_score ?? undefined,
            createdAt: new Date(thoughts[0].created_at),
        };
        const content = format === 'json'
            ? JSON.stringify(thought, null, 2)
            : this.formatThoughtMarkdown(thought, { includeMetadata: true });
        return {
            content,
            filename: `thought-${thoughtId.substring(0, 8)}.${format}`,
            size: Buffer.byteLength(content, 'utf8'),
        };
    }
    /**
     * Show save dialog and write export file
     */
    async saveExport(result) {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(result.filename),
            filters: {
                'JSON Files': ['json'],
                'Markdown Files': ['md'],
                'All Files': ['*'],
            },
        });
        if (!uri) {
            return false;
        }
        try {
            const buffer = Buffer.from(result.content, 'utf8');
            await vscode.workspace.fs.writeFile(uri, buffer);
            this.logger.appendLine(`[ExportService] Saved export to ${uri.fsPath}`);
            void vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
            // Optionally open the file
            const openChoice = await vscode.window.showInformationMessage('Export saved. Open file?', 'Open', 'Close');
            if (openChoice === 'Open') {
                const document = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(document);
            }
            return true;
        }
        catch (error) {
            this.logger.appendLine(`[ExportService] Failed to save: ${String(error)}`);
            void vscode.window.showErrorMessage(`Failed to save export: ${String(error)}`);
            return false;
        }
    }
    /**
     * Export to JSON format
     */
    exportToJSON(session, thoughts, options) {
        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                exportVersion: '1.0.0',
                thoughtCount: thoughts.length,
            },
            session: {
                sessionId: session.sessionId,
                projectId: session.projectId,
                projectName: session.projectName,
                origin: session.origin,
                createdAt: session.createdAt.toISOString(),
                lastActiveAt: session.lastActiveAt.toISOString(),
            },
            thoughts: thoughts.map((t) => ({
                thoughtId: t.thoughtId,
                stage: t.stage,
                content: t.content,
                ...(options.includeMetadata && { metadata: t.metadata }),
                ...(t.qualityScore && { qualityScore: t.qualityScore }),
                ...(t.parentThoughtId && { parentThoughtId: t.parentThoughtId }),
                ...(options.includeTimestamps && {
                    createdAt: t.createdAt.toISOString(),
                    updatedAt: t.updatedAt?.toISOString(),
                }),
            })),
        };
        return options.prettify ?? true
            ? JSON.stringify(exportData, null, 2)
            : JSON.stringify(exportData);
    }
    /**
     * Export to Markdown format
     */
    exportToMarkdown(session, thoughts, options) {
        const lines = [];
        // Header
        lines.push(`# Thinking Session: ${session.origin}\n`);
        // Session metadata
        if (options.includeMetadata ?? true) {
            lines.push(`**Session ID**: ${session.sessionId}`);
            if (session.projectName) {
                lines.push(`**Project**: ${session.projectName}`);
            }
            lines.push(`**Created**: ${session.createdAt.toLocaleString()}`);
            lines.push(`**Last Active**: ${session.lastActiveAt.toLocaleString()}`);
            lines.push(`**Total Thoughts**: ${thoughts.length}\n`);
        }
        // Group by stage or chronological
        if (options.groupByStage ?? true) {
            const grouped = this.groupByStage(thoughts);
            for (const [stage, stageThoughts] of Object.entries(grouped)) {
                if (stageThoughts.length === 0) {
                    continue;
                }
                lines.push(`## ${this.formatStageHeader(stage)}\n`);
                for (const thought of stageThoughts) {
                    lines.push(this.formatThoughtMarkdown(thought, options));
                    lines.push('');
                }
            }
        }
        else {
            lines.push(`## Thoughts (Chronological)\n`);
            for (const thought of thoughts) {
                lines.push(this.formatThoughtMarkdown(thought, options));
                lines.push('');
            }
        }
        // Footer
        lines.push('---');
        lines.push(`\n*Exported from Structural Thinking Manager on ${new Date().toLocaleString()}*`);
        return lines.join('\n');
    }
    /**
     * Format a single thought as Markdown
     */
    formatThoughtMarkdown(thought, options) {
        const lines = [];
        // Thought header
        lines.push(`### ${this.formatStageHeader(thought.stage)}`);
        // Metadata
        if (options.includeMetadata && thought.metadata) {
            const meta = thought.metadata;
            if (meta.importance) {
                lines.push(`**Importance**: ${meta.importance}`);
            }
            if (meta.tags && meta.tags.length > 0) {
                lines.push(`**Tags**: ${meta.tags.join(', ')}`);
            }
            if (thought.qualityScore !== undefined) {
                lines.push(`**Quality Score**: ${thought.qualityScore}/100`);
            }
            if (meta.thoughtNumber !== undefined && meta.totalThoughts !== undefined) {
                lines.push(`**Progress**: Thought ${meta.thoughtNumber}/${meta.totalThoughts}`);
            }
        }
        if (options.includeTimestamps) {
            lines.push(`**Created**: ${thought.createdAt.toLocaleString()}`);
        }
        lines.push('');
        // Content
        lines.push(thought.content);
        // External references
        if (thought.metadata?.externalRefs && thought.metadata.externalRefs.length > 0) {
            lines.push('');
            lines.push('**References**:');
            for (const ref of thought.metadata.externalRefs) {
                lines.push(`- ${ref}`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Group thoughts by cognitive stage
     */
    groupByStage(thoughts) {
        const stages = [
            'problem_definition',
            'research',
            'analysis',
            'synthesis',
            'conclusion',
            'reflection',
            'implementation',
            'validation',
        ];
        const grouped = {};
        for (const stage of stages) {
            grouped[stage] = thoughts.filter((t) => t.stage === stage);
        }
        return grouped;
    }
    /**
     * Format stage header with title
     */
    formatStageHeader(stage) {
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
}
exports.ExportService = ExportService;
//# sourceMappingURL=ExportService.js.map