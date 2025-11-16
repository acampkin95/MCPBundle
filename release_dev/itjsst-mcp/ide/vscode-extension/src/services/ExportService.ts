/**
 * ExportService - Export thinking sessions to JSON/Markdown formats
 * Provides formatted exports with complete metadata and thought hierarchies
 */

import * as vscode from 'vscode';
import { DatabaseService } from './DatabaseService';
import { ThoughtSession, StructuredThought, CognitiveStage } from '../types';

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
export class ExportService {
  private readonly database: DatabaseService;
  private readonly logger: vscode.OutputChannel;

  constructor(database: DatabaseService, logger: vscode.OutputChannel) {
    this.database = database;
    this.logger = logger;
  }

  /**
   * Export a complete thinking session
   */
  public async exportSession(
    sessionId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
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
      const content =
        options.format === 'json'
          ? this.exportToJSON(session, thoughts, options)
          : this.exportToMarkdown(session, thoughts, options);

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const sanitizedOrigin = session.origin
        .replace(/[^a-zA-Z0-9]/g, '-')
        .substring(0, 50);
      const filename = `${sanitizedOrigin}-${timestamp}.${options.format}`;

      const result: ExportResult = {
        content,
        filename,
        size: Buffer.byteLength(content, 'utf8'),
      };

      this.logger.appendLine(
        `[ExportService] Export completed (${result.size} bytes, ${thoughts.length} thoughts)`
      );

      return result;
    } catch (error) {
      this.logger.appendLine(`[ExportService] Export failed: ${String(error)}`);
      throw new Error(`Export failed: ${String(error)}`);
    }
  }

  /**
   * Export single thought
   */
  public async exportThought(
    thoughtId: string,
    format: ExportFormat
  ): Promise<ExportResult> {
    // Query for the specific thought
    const thoughts = await this.database.query<{
      thought_id: string;
      session_id: string;
      stage: string;
      content: string;
      metadata: string | null;
      quality_score: number | null;
      created_at: string;
    }>(
      `SELECT thought_id, session_id, stage, content, metadata, quality_score, created_at
       FROM structured_thoughts
       WHERE thought_id = $1`,
      [thoughtId]
    );

    if (thoughts.length === 0) {
      throw new Error(`Thought not found: ${thoughtId}`);
    }

    const thought: StructuredThought = {
      thoughtId: thoughts[0]!.thought_id,
      sessionId: thoughts[0]!.session_id,
      stage: thoughts[0]!.stage as CognitiveStage,
      content: thoughts[0]!.content,
      metadata: thoughts[0]!.metadata ? JSON.parse(thoughts[0]!.metadata) : undefined,
      qualityScore: thoughts[0]!.quality_score ?? undefined,
      createdAt: new Date(thoughts[0]!.created_at),
    };

    const content =
      format === 'json'
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
  public async saveExport(result: ExportResult): Promise<boolean> {
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
      const openChoice = await vscode.window.showInformationMessage(
        'Export saved. Open file?',
        'Open',
        'Close'
      );

      if (openChoice === 'Open') {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      }

      return true;
    } catch (error) {
      this.logger.appendLine(`[ExportService] Failed to save: ${String(error)}`);
      void vscode.window.showErrorMessage(`Failed to save export: ${String(error)}`);
      return false;
    }
  }

  /**
   * Export to JSON format
   */
  private exportToJSON(
    session: ThoughtSession,
    thoughts: StructuredThought[],
    options: ExportOptions
  ): string {
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
  private exportToMarkdown(
    session: ThoughtSession,
    thoughts: StructuredThought[],
    options: ExportOptions
  ): string {
    const lines: string[] = [];

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

        lines.push(`## ${this.formatStageHeader(stage as CognitiveStage)}\n`);

        for (const thought of stageThoughts) {
          lines.push(this.formatThoughtMarkdown(thought, options));
          lines.push('');
        }
      }
    } else {
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
  private formatThoughtMarkdown(
    thought: StructuredThought,
    options: Partial<ExportOptions>
  ): string {
    const lines: string[] = [];

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
  private groupByStage(
    thoughts: StructuredThought[]
  ): Record<CognitiveStage, StructuredThought[]> {
    const stages: CognitiveStage[] = [
      'problem_definition',
      'research',
      'analysis',
      'synthesis',
      'conclusion',
      'reflection',
      'implementation',
      'validation',
    ];

    const grouped: Record<CognitiveStage, StructuredThought[]> = {} as Record<
      CognitiveStage,
      StructuredThought[]
    >;

    for (const stage of stages) {
      grouped[stage] = thoughts.filter((t) => t.stage === stage);
    }

    return grouped;
  }

  /**
   * Format stage header with title
   */
  private formatStageHeader(stage: CognitiveStage): string {
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
}
