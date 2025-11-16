import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SQLitePlannerService } from './sqlitePlanner.js';
import {
  loadStageFrameworkConfig,
  type StageFrameworkConfig,
  type StageFrameworkHeuristics,
  type StageTransition,
} from '../config/stageFramework.js';

export type CognitiveStage =
  | 'problem_definition'
  | 'research'
  | 'analysis'
  | 'synthesis'
  | 'conclusion';

export interface StageDescriptor {
  readonly id: CognitiveStage | string;
  readonly title: string;
  readonly description: string;
  readonly guidingQuestions?: readonly string[];
  readonly exampleActivities?: readonly string[];
}

export interface FrameworkOptions {
  readonly includeExamples?: boolean;
  readonly customStages?: StageDescriptor[];
}

export type FeedbackSignalType = 'stage_dwell' | 'quality_drop' | 'repetition' | 'branch_health';

export type FeedbackSeverity = 'info' | 'notice' | 'warning' | 'critical';

export interface FeedbackSignal {
  readonly stageId?: string;
  readonly branchId?: string;
  readonly thoughtId?: string;
  readonly type: FeedbackSignalType;
  readonly severity: FeedbackSeverity;
  readonly message: string;
  readonly metrics?: Record<string, number | string | boolean>;
  readonly suggestedNextStages?: readonly string[];
}

export type BranchHealth = 'healthy' | 'stagnant' | 'at_risk' | 'forming' | 'unknown';

export interface BranchInsight {
  readonly branchId: string;
  readonly rootThoughtId?: string;
  readonly thoughtCount: number;
  readonly maxDepth: number;
  readonly lastUpdated: string;
  readonly averageQuality?: number;
  readonly health: BranchHealth;
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type MutableThoughtRecord = Mutable<ThoughtRecord>;

interface ResolvedHeuristics {
  readonly dwellThresholds: Record<string, number>;
  readonly dwellDefault: number;
  readonly rollingWindow: number;
  readonly repetitionWindow: number;
  readonly repetitionThreshold: number;
  readonly qualityDeltaThreshold: number;
  readonly branchStalenessMinutes: number;
  readonly branchLowQualityThreshold: number;
}

const DEFAULT_RESOLVED_HEURISTICS: ResolvedHeuristics = {
  dwellThresholds: {},
  dwellDefault: 4,
  rollingWindow: 5,
  repetitionWindow: 6,
  repetitionThreshold: 3,
  qualityDeltaThreshold: 0.2,
  branchStalenessMinutes: 90,
  branchLowQualityThreshold: 0.4,
};

const REPETITION_NORMALISATION_REGEX = /[\s\n\r]+/g;

export interface ThoughtMetadata {
  readonly source?: string;
  readonly tags?: readonly string[];
  readonly importance?: 'low' | 'medium' | 'high';
  readonly external_refs?: readonly string[];
  readonly thoughtNumber?: number;
  readonly totalThoughts?: number;
  readonly nextThoughtNeeded?: boolean;
  readonly needsMoreThoughts?: boolean;
  readonly isRevision?: boolean;
  readonly revisesThought?: number;
  readonly branchFromThought?: number;
  readonly branchId?: string;
  readonly qualityScore?: number;
  readonly stageLabel?: string;
  readonly devOpsCategory?: string;
  readonly debugLayer?: string;
  readonly schemaEntities?: readonly string[];
  readonly runtimeStack?: readonly string[];
  readonly branchRootId?: string;
  readonly branchDepth?: number;
  readonly branchHealth?: BranchHealth;
}

export interface ThoughtEntry {
  readonly stage: string;
  readonly thought: string;
  readonly metadata?: ThoughtMetadata;
}

export interface ThoughtRecord {
  readonly id: string;
  readonly stage: string;
  readonly order: number;
  readonly thought: string;
  readonly timestamp: string;
  readonly metadata?: ThoughtMetadata;
}

export interface ThoughtFilterOptions {
  readonly stage?: string;
  readonly branchId?: string;
  readonly tags?: readonly string[];
  readonly importance?: ThoughtMetadata['importance'];
  readonly textIncludes?: string;
  readonly limit?: number;
  readonly sinceThoughtNumber?: number;
}

export interface ThoughtUpdatePayload {
  readonly stage?: string;
  readonly thought?: string;
  readonly metadata?: Partial<ThoughtMetadata>;
}

export interface ThoughtTrackingResult {
  readonly timeline: ThoughtRecord[];
  readonly stageTally: Record<string, number>;
  readonly tags: Record<string, number>;
  readonly importanceBreakdown: Record<string, number>;
  readonly progress: ProgressSnapshot;
  readonly relatedThoughts: RelatedThoughtGroup[];
  readonly summary: string;
  readonly branchInsights: BranchInsight[];
  readonly feedbackSignals: FeedbackSignal[];
}

export interface SourceSummary {
  readonly source: string;
  readonly count: number;
  readonly stages: readonly string[];
  readonly tags: readonly string[];
  readonly lastRecorded: string;
}

export interface StructuredDiagnostics {
  readonly stageCoverage: Record<string, number>;
  readonly missingStages: readonly string[];
  readonly lastUpdated: string | null;
  readonly staleEntries: ThoughtRecord[];
  readonly highImportancePending: ThoughtRecord[];
  readonly sourceSummaries: readonly SourceSummary[];
  readonly tagCloud: Record<string, number>;
  readonly totalThoughts: number;
}

export interface DiagnosticsOptions {
  readonly staleHours?: number;
}

export interface StructuredReportOptions extends DiagnosticsOptions {
  readonly format: 'markdown' | 'json';
  readonly includeTimeline?: boolean;
  readonly maxEntries?: number;
}

export interface StructuredReport {
  readonly format: 'markdown' | 'json';
  readonly content: string;
  readonly diagnostics: StructuredDiagnostics;
  readonly summary: ThoughtTrackingResult;
  readonly timeline?: ThoughtRecord[];
}

export interface RelatedThoughtGroup {
  readonly tag?: string;
  readonly importance?: ThoughtMetadata['importance'];
  readonly stage?: string;
  readonly thoughts: ThoughtRecord[];
}

export interface ProgressSnapshot {
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly percentage: number;
}

export interface ExportOptions {
  readonly format: 'json' | 'jsonb' | 'markdown' | 'claude' | 'agents';
  readonly includeMetadata?: boolean;
}

export interface ImportPayload {
  readonly format: ExportOptions['format'];
  readonly content: string;
}

export class StructuredThinkingService {
  private frameworkConfig: StageFrameworkConfig;
  private heuristics: ResolvedHeuristics;

  public constructor(private readonly planner: SQLitePlannerService) {
    this.frameworkConfig = loadStageFrameworkConfig();
    this.heuristics = this.resolveHeuristics(this.frameworkConfig.heuristics);
  }

  public reloadFrameworkConfig(): StageFrameworkConfig {
    this.frameworkConfig = loadStageFrameworkConfig();
    this.heuristics = this.resolveHeuristics(this.frameworkConfig.heuristics);
    return this.frameworkConfig;
  }

  public getFrameworkConfig(): StageFrameworkConfig {
    return this.frameworkConfig;
  }

  public getFramework(options: FrameworkOptions = {}): StageDescriptor[] {
    const stages = options.customStages?.length
      ? options.customStages
      : this.frameworkConfig.stages;
    if (options.includeExamples === false) {
      return stages.map((stage) => ({
        ...stage,
        exampleActivities: undefined,
      }));
    }
    return stages;
  }

  public trackThoughts(entries: ThoughtEntry[], autoNumbering: boolean): ThoughtTrackingResult {
    const existing = this.planner.getTimeline();
    const nextOrder = existing.length;

    const timeline: ThoughtRecord[] = existing.slice();
    entries.forEach((entry, index) => {
      const order = autoNumbering
        ? nextOrder + index + 1
        : (entry.metadata?.thoughtNumber ?? nextOrder + index + 1);
      const record: ThoughtRecord = {
        id: `T${String(order).padStart(3, '0')}`,
        stage: entry.stage,
        order,
        thought: entry.thought.trim(),
        timestamp: new Date(Date.now() + index).toISOString(),
        metadata: entry.metadata
          ? {
              ...entry.metadata,
              stageLabel: entry.metadata.stageLabel ?? entry.stage,
              thoughtNumber: order,
              totalThoughts: entry.metadata.totalThoughts ?? nextOrder + entries.length,
            }
          : {
              stageLabel: entry.stage,
              thoughtNumber: order,
              totalThoughts: nextOrder + entries.length,
            },
      };

      timeline.push(record);
    });

    const normalised = this.normaliseTimeline(timeline);
    const result = this.summarizeTimeline(normalised);
    this.planner.replaceTimeline(result.timeline);
    return result;
  }

  public async ensureStorageFile(_storagePath?: string): Promise<string> {
    try {
      await this.planner.refreshMarkdownCache();
    } catch {
      // ignore bootstrap failures; user may not have markdown yet
    }
    return this.planner.getDatabasePath();
  }

  public async bootstrapFromWorkspace(_storagePath?: string): Promise<ThoughtRecord[]> {
    await this.planner.refreshMarkdownCache();
    return this.planner.getTimeline();
  }

  public loadStoredTimeline(_storagePath?: string): Promise<ThoughtRecord[]> {
    return Promise.resolve(this.planner.getTimeline());
  }

  public saveStoredTimeline(timeline: ThoughtRecord[], _storagePath?: string): Promise<void> {
    this.planner.replaceTimeline(timeline);
    return Promise.resolve();
  }

  public appendThoughtRecord(
    record: ThoughtRecord,
    _storagePath?: string
  ): Promise<ThoughtRecord[]> {
    this.planner.appendThought(record);
    return this.loadStoredTimeline();
  }

  public getTimeline(): ThoughtRecord[] {
    return this.normaliseTimeline(this.planner.getTimeline());
  }

  public clearTimeline(): ThoughtTrackingResult {
    this.planner.replaceTimeline([]);
    return this.summarizeTimeline([]);
  }

  public reviseThought(thoughtId: string, updates: ThoughtUpdatePayload): ThoughtTrackingResult {
    const timeline = this.normaliseTimeline(this.planner.getTimeline());
    const index = timeline.findIndex((record) => record.id === thoughtId);
    if (index === -1) {
      throw new Error(`Thought with id ${thoughtId} not found`);
    }

    const existingRecord = timeline[index];
    const mergedMetadata: ThoughtMetadata = {
      ...existingRecord.metadata,
      ...(updates.metadata ?? {}),
      isRevision: true,
      stageLabel: updates.metadata?.stageLabel ?? updates.stage ?? existingRecord.stage,
      revisesThought:
        updates.metadata?.revisesThought ??
        existingRecord.metadata?.revisesThought ??
        existingRecord.metadata?.thoughtNumber,
    };

    const revised: ThoughtRecord = {
      ...existingRecord,
      stage: updates.stage ?? existingRecord.stage,
      thought: updates.thought ? updates.thought.trim() : existingRecord.thought,
      timestamp: new Date().toISOString(),
      metadata: mergedMetadata,
    };

    timeline[index] = revised;
    const result = this.summarizeTimeline(timeline);
    this.planner.replaceTimeline(result.timeline);
    return result;
  }

  public filterTimeline(filters: ThoughtFilterOptions): ThoughtRecord[] {
    const timeline = this.getTimeline();
    const limited = timeline.filter((record) => {
      if (filters.stage && record.stage !== filters.stage) {
        return false;
      }
      if (filters.branchId && record.metadata?.branchId !== filters.branchId) {
        return false;
      }
      if (filters.importance && record.metadata?.importance !== filters.importance) {
        return false;
      }
      if (
        typeof filters.sinceThoughtNumber === 'number' &&
        (record.metadata?.thoughtNumber ?? 0) <= filters.sinceThoughtNumber
      ) {
        return false;
      }
      if (filters.tags?.length) {
        const recordTags = record.metadata?.tags ?? [];
        const matches = filters.tags.some((tag) => recordTags.includes(tag));
        if (!matches) {
          return false;
        }
      }
      if (filters.textIncludes) {
        const normalisedText = record.thought.toLowerCase();
        if (!normalisedText.includes(filters.textIncludes.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    if (filters.limit && filters.limit > 0) {
      return limited.slice(-filters.limit);
    }

    return limited;
  }

  public getStageTransitions(): readonly StageTransition[] {
    return this.frameworkConfig.transitions ?? [];
  }

  public exportToFile(
    records: ThoughtTrackingResult,
    options: ExportOptions,
    destinationPath: string
  ): Promise<string> {
    const contents = this.exportThoughts(records, options);
    const dir = dirname(destinationPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(destinationPath, contents, 'utf8');
    return Promise.resolve(contents);
  }

  public exportThoughts(records: ThoughtTrackingResult, options: ExportOptions): string {
    const includeMetadata = options.includeMetadata !== false;
    switch (options.format) {
      case 'json':
        return JSON.stringify(includeMetadata ? records : { timeline: records.timeline }, null, 2);
      case 'jsonb':
        return JSON.stringify(
          {
            timeline: records.timeline,
            metadata: includeMetadata
              ? {
                  stageTally: records.stageTally,
                  tags: records.tags,
                  importanceBreakdown: records.importanceBreakdown,
                  progress: records.progress,
                  summary: records.summary,
                }
              : undefined,
          },
          null,
          2
        );
      case 'markdown':
        return this.toMarkdown(records, 'Standard');
      case 'claude':
        return this.toMarkdown(records, 'Claude');
      case 'agents':
        return this.toMarkdown(records, 'Agents');
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  public importThoughts(payload: ImportPayload): ThoughtTrackingResult {
    switch (payload.format) {
      case 'json': {
        const data = JSON.parse(payload.content);
        if (Array.isArray(data?.timeline)) {
          return this.summarizeTimeline(this.normaliseTimeline(data.timeline as ThoughtRecord[]));
        }
        return data as ThoughtTrackingResult;
      }
      case 'jsonb': {
        const data = JSON.parse(payload.content) as {
          timeline: ThoughtRecord[];
        };
        return this.summarizeTimeline(this.normaliseTimeline(data.timeline));
      }
      case 'markdown':
      case 'claude':
      case 'agents':
        return this.parseMarkdownTimeline(payload.content);
      default:
        throw new Error(`Unsupported import format: ${payload.format}`);
    }
  }

  public diagnoseTimeline(
    timeline: ThoughtRecord[],
    options: DiagnosticsOptions = {}
  ): StructuredDiagnostics {
    const normalised = this.normaliseTimeline(timeline);
    const stageCoverage: Record<string, number> = {};
    const tagCloud: Record<string, number> = {};
    const sourceMap = new Map<
      string,
      { count: number; stages: Set<string>; tags: Set<string>; lastRecorded: string }
    >();

    const staleMs = (options.staleHours ?? 24) * 60 * 60 * 1000;
    const now = Date.now();

    const staleEntries: ThoughtRecord[] = [];
    const highImportancePending: ThoughtRecord[] = [];

    for (const record of normalised) {
      stageCoverage[record.stage] = (stageCoverage[record.stage] ?? 0) + 1;

      const timestampMs = Date.parse(record.timestamp);
      if (!Number.isNaN(timestampMs) && now - timestampMs > staleMs) {
        staleEntries.push(record);
      }

      if (record.metadata?.importance === 'high' && record.metadata?.nextThoughtNeeded !== false) {
        highImportancePending.push(record);
      }

      const source = record.metadata?.source ?? 'unspecified';
      if (!sourceMap.has(source)) {
        sourceMap.set(source, {
          count: 0,
          stages: new Set<string>(),
          tags: new Set<string>(),
          lastRecorded: record.timestamp,
        });
      }
      const summary = sourceMap.get(source)!;
      summary.count += 1;
      summary.stages.add(record.stage);
      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (tag) {
            summary.tags.add(tag);
            tagCloud[tag] = (tagCloud[tag] ?? 0) + 1;
          }
        }
      }
      if (summary.lastRecorded < record.timestamp) {
        summary.lastRecorded = record.timestamp;
      }
    }

    const frameworkStages = this.getFramework().map((stage) => stage.id);
    const missingStages = frameworkStages.filter((stage) => !stageCoverage[stage]);

    const sourceSummaries: SourceSummary[] = Array.from(sourceMap.entries()).map(
      ([source, info]) => ({
        source,
        count: info.count,
        stages: Array.from(info.stages.values()),
        tags: Array.from(info.tags.values()),
        lastRecorded: info.lastRecorded,
      })
    );

    const lastUpdated = normalised.length ? normalised[normalised.length - 1].timestamp : null;

    return {
      stageCoverage,
      missingStages,
      lastUpdated,
      staleEntries,
      highImportancePending,
      sourceSummaries,
      tagCloud,
      totalThoughts: normalised.length,
    };
  }

  private applyBranchInsights(timeline: MutableThoughtRecord[]): BranchInsight[] {
    const branchMap = new Map<string, MutableThoughtRecord[]>();
    for (const record of timeline) {
      const branchId = record.metadata?.branchId;
      if (!branchId) {
        continue;
      }
      if (!branchMap.has(branchId)) {
        branchMap.set(branchId, []);
      }
      branchMap.get(branchId)!.push(record);
    }

    if (!branchMap.size) {
      return [];
    }

    const now = Date.now();
    const insights: BranchInsight[] = [];

    for (const [branchId, records] of branchMap.entries()) {
      const orderedRecords: MutableThoughtRecord[] = records
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const rootThoughtNumber = orderedRecords[0]?.metadata?.branchFromThought;
      const rootRecord =
        typeof rootThoughtNumber === 'number'
          ? timeline.find(
              (record) => (record.metadata?.thoughtNumber ?? record.order) === rootThoughtNumber
            )
          : orderedRecords[0];
      const rootThoughtId = rootRecord?.id;

      let cumulativeQuality = 0;
      let qualityCount = 0;

      orderedRecords.forEach((record, index) => {
        const quality = record.metadata?.qualityScore;
        if (typeof quality === 'number' && Number.isFinite(quality)) {
          cumulativeQuality += quality;
          qualityCount += 1;
        }

        record.metadata = {
          ...(record.metadata ?? {}),
          branchId,
          branchRootId: rootThoughtId,
          branchDepth: index,
        };
      });

      const maxDepth = Math.max(
        ...orderedRecords.map((record) => record.metadata?.branchDepth ?? 0)
      );
      const lastRecord = orderedRecords[orderedRecords.length - 1];
      const averageQuality = qualityCount ? cumulativeQuality / qualityCount : undefined;
      const lastTimestamp = Date.parse(lastRecord.timestamp);
      const ageMinutes = Number.isNaN(lastTimestamp)
        ? 0
        : Math.max((now - lastTimestamp) / 60000, 0);

      let health: BranchHealth = 'unknown';
      if (orderedRecords.length <= 1) {
        health = 'forming';
      }
      if (typeof averageQuality === 'number') {
        if (averageQuality < this.heuristics.branchLowQualityThreshold) {
          health = 'at_risk';
        } else if (averageQuality >= this.heuristics.branchLowQualityThreshold + 0.25) {
          health = 'healthy';
        } else if (health !== 'forming') {
          health = 'stagnant';
        }
      }
      if (ageMinutes > this.heuristics.branchStalenessMinutes) {
        health = health === 'at_risk' ? 'at_risk' : 'stagnant';
      }

      orderedRecords.forEach((record) => {
        record.metadata = {
          ...(record.metadata ?? {}),
          branchId,
          branchRootId: rootThoughtId,
          branchHealth: health,
        };
      });

      insights.push({
        branchId,
        rootThoughtId,
        thoughtCount: orderedRecords.length,
        maxDepth,
        lastUpdated: lastRecord.timestamp,
        averageQuality,
        health,
      });
    }

    return insights.sort((a, b) => a.branchId.localeCompare(b.branchId));
  }

  private generateFeedbackSignals(
    timeline: MutableThoughtRecord[],
    branchInsights: BranchInsight[]
  ): FeedbackSignal[] {
    if (!timeline.length) {
      return [];
    }

    const signals: FeedbackSignal[] = [];
    const transitionMap = new Map<string, StageTransition[]>();
    for (const transition of this.getStageTransitions()) {
      const existing = transitionMap.get(transition.from) ?? [];
      existing.push(transition);
      transitionMap.set(transition.from, existing);
    }

    // Stage dwell tracking
    let currentStage = '';
    let dwellCount = 0;
    const dwellFlagged = new Set<string>();
    for (const record of timeline) {
      if (record.stage === currentStage) {
        dwellCount += 1;
      } else {
        currentStage = record.stage;
        dwellCount = 1;
      }

      const threshold =
        this.heuristics.dwellThresholds[record.stage] ?? this.heuristics.dwellDefault;
      if (threshold > 0 && dwellCount > threshold) {
        const key = `${record.stage}:${record.id}:dwell`;
        if (!dwellFlagged.has(key)) {
          dwellFlagged.add(key);
          const transitions = transitionMap.get(record.stage) ?? [];
          const suggested = transitions.flatMap((transition) => transition.to);
          const prompt = transitions[0]?.prompt;
          signals.push({
            type: 'stage_dwell',
            severity: dwellCount > threshold + 1 ? 'warning' : 'notice',
            stageId: record.stage,
            thoughtId: record.id,
            suggestedNextStages: suggested.length ? suggested : undefined,
            message: `Stage "${record.stage}" has ${dwellCount} consecutive thoughts (threshold ${threshold}). ${
              prompt ?? 'Consider advancing to the next stage.'
            }`,
            metrics: {
              dwellCount,
              dwellThreshold: threshold,
            },
          });
        }
      }
    }

    // Quality drop tracking
    const stageScores = new Map<string, number[]>();
    for (const record of timeline) {
      const score = record.metadata?.qualityScore;
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        continue;
      }
      const scores = stageScores.get(record.stage) ?? [];
      const previousAverage =
        scores.length > 0
          ? scores.reduce((total, value) => total + value, 0) / scores.length
          : null;
      scores.push(score);
      if (scores.length > Math.max(2, this.heuristics.rollingWindow)) {
        scores.shift();
      }
      stageScores.set(record.stage, scores);

      if (previousAverage !== null) {
        const delta = previousAverage - score;
        if (delta >= this.heuristics.qualityDeltaThreshold) {
          const transitions = transitionMap.get(record.stage) ?? [];
          const suggested = transitions.flatMap((transition) => transition.to);
          signals.push({
            type: 'quality_drop',
            severity: delta > this.heuristics.qualityDeltaThreshold * 1.5 ? 'warning' : 'notice',
            stageId: record.stage,
            thoughtId: record.id,
            suggestedNextStages: suggested.length ? suggested : undefined,
            message: `Quality score in "${record.stage}" dipped to ${score.toFixed(
              2
            )} (previous avg ${previousAverage.toFixed(2)}). Consider refreshing context or changing stage.`,
            metrics: {
              current: score,
              previousAverage,
              delta,
            },
          });
        }
      }
    }

    // Repetition management
    const windowSize = Math.max(2, this.heuristics.repetitionWindow);
    const repetitionThreshold = Math.max(2, this.heuristics.repetitionThreshold);
    const slidingWindow: string[] = [];
    const occurrenceMap = new Map<string, number>();
    const repetitionFlagged = new Set<string>();

    for (const record of timeline) {
      const normalised = this.normaliseThought(record.thought);
      slidingWindow.push(normalised);
      occurrenceMap.set(normalised, (occurrenceMap.get(normalised) ?? 0) + 1);

      if (slidingWindow.length > windowSize) {
        const removed = slidingWindow.shift()!;
        const nextCount = (occurrenceMap.get(removed) ?? 0) - 1;
        if (nextCount <= 0) {
          occurrenceMap.delete(removed);
        } else {
          occurrenceMap.set(removed, nextCount);
        }
      }

      const count = occurrenceMap.get(normalised) ?? 0;
      if (count >= repetitionThreshold) {
        const key = `${record.stage}:${normalised}`;
        if (!repetitionFlagged.has(key)) {
          repetitionFlagged.add(key);
          signals.push({
            type: 'repetition',
            severity: 'notice',
            stageId: record.stage,
            thoughtId: record.id,
            message: `Recent thoughts repeat the theme "${this.previewThought(record.thought)}" ${count} times. Consider exploring alternative angles or branches.`,
            metrics: {
              occurrences: count,
              windowSize,
            },
          });
        }
      }
    }

    // Branch health signals
    for (const insight of branchInsights) {
      if (insight.health === 'healthy') {
        continue;
      }
      const severity: FeedbackSeverity =
        insight.health === 'at_risk'
          ? 'warning'
          : insight.health === 'stagnant'
            ? 'notice'
            : insight.health === 'forming'
              ? 'info'
              : 'info';
      signals.push({
        type: 'branch_health',
        severity,
        branchId: insight.branchId,
        message: `Branch ${insight.branchId} is ${insight.health}. Last update ${insight.lastUpdated}${
          typeof insight.averageQuality === 'number'
            ? `, average quality ${insight.averageQuality.toFixed(2)}`
            : ''
        }.`,
        metrics: {
          thoughtCount: insight.thoughtCount,
          maxDepth: insight.maxDepth,
          averageQuality: insight.averageQuality ?? 'n/a',
        },
      });
    }

    return signals;
  }

  public generateReport(
    timeline: ThoughtRecord[],
    options: StructuredReportOptions
  ): StructuredReport {
    const normalised = this.normaliseTimeline(timeline);
    const diagnostics = this.diagnoseTimeline(normalised, options);
    const summary = this.summarizeTimeline(normalised);

    const includeTimeline = options.includeTimeline ?? false;
    const maxEntries = options.maxEntries ?? normalised.length;
    const subset = includeTimeline ? normalised.slice(-maxEntries) : undefined;
    const generatedAt = new Date().toISOString();

    if (options.format === 'json') {
      const jsonPayload = {
        generatedAt,
        diagnostics,
        summary: {
          stageTally: summary.stageTally,
          progress: summary.progress,
          tags: summary.tags,
          importance: summary.importanceBreakdown,
          totalThoughts: summary.timeline.length,
        },
        timeline: subset,
      };
      return {
        format: 'json',
        content: JSON.stringify(jsonPayload, null, 2),
        diagnostics,
        summary,
        timeline: subset,
      };
    }

    const lines: string[] = [];
    lines.push(`# Structured Thinking Report`);
    lines.push(`Generated: ${generatedAt}`);
    lines.push('\n## Summary');
    lines.push(`- Total thoughts: ${summary.timeline.length}`);
    lines.push(
      `- Progress: ${summary.progress.completed}/${summary.progress.total} (${summary.progress.percentage}%)`
    );
    if (diagnostics.lastUpdated) {
      lines.push(`- Last updated: ${diagnostics.lastUpdated}`);
    }

    lines.push('\n## Stage coverage');
    for (const [stage, count] of Object.entries(diagnostics.stageCoverage)) {
      lines.push(`- ${stage}: ${count}`);
    }
    if (diagnostics.missingStages.length) {
      lines.push('\n## Missing stages');
      diagnostics.missingStages.forEach((stage) => lines.push(`- ${stage}`));
    }

    if (diagnostics.highImportancePending.length) {
      lines.push('\n## High-importance thoughts needing follow-up');
      diagnostics.highImportancePending.forEach((record) =>
        lines.push(`- ${record.id} [${record.stage}] ${record.thought}`)
      );
    }

    if (diagnostics.sourceSummaries.length) {
      lines.push('\n## Source summaries');
      diagnostics.sourceSummaries.forEach((summaryItem) => {
        lines.push(
          `- ${summaryItem.source}: ${summaryItem.count} entries (last: ${summaryItem.lastRecorded})`
        );
        if (summaryItem.stages.length) {
          lines.push(`  * Stages: ${summaryItem.stages.join(', ')}`);
        }
        if (summaryItem.tags.length) {
          lines.push(`  * Tags: ${summaryItem.tags.join(', ')}`);
        }
      });
    }

    if (subset) {
      lines.push('\n## Recent timeline');
      subset.forEach((record) => {
        lines.push(`- ${record.id} [${record.stage}] ${record.thought}`);
      });
    }

    return {
      format: 'markdown',
      content: lines.join('\n'),
      diagnostics,
      summary,
      timeline: subset,
    };
  }

  public normaliseTimeline(timeline: ThoughtRecord[]): ThoughtRecord[] {
    const working = timeline.slice();
    let sorted = true;
    for (let index = 1; index < working.length; index += 1) {
      const prev = working[index - 1];
      const current = working[index];
      if (current.order < prev.order) {
        sorted = false;
        break;
      }
      if (current.order === prev.order && current.timestamp.localeCompare(prev.timestamp) < 0) {
        sorted = false;
        break;
      }
    }

    const ordered = sorted
      ? working
      : working.sort((a, b) => {
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          return a.timestamp.localeCompare(b.timestamp);
        });

    return ordered.map((record, index) => ({
      ...record,
      id: `T${String(index + 1).padStart(3, '0')}`,
      order: index + 1,
      metadata: record.metadata
        ? {
            ...record.metadata,
            thoughtNumber: index + 1,
            totalThoughts: timeline.length,
          }
        : {
            thoughtNumber: index + 1,
            totalThoughts: timeline.length,
          },
    }));
  }

  public summarizeTimeline(timeline: ThoughtRecord[]): ThoughtTrackingResult {
    const mutableTimeline: MutableThoughtRecord[] = timeline.map((record) => ({
      ...record,
      metadata: record.metadata ? { ...record.metadata } : undefined,
    })) as MutableThoughtRecord[];

    const stageTally: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const importanceBreakdown: Record<string, number> = {};

    for (const record of mutableTimeline) {
      stageTally[record.stage] = (stageTally[record.stage] ?? 0) + 1;

      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (!tag) {
            continue;
          }
          tags[tag] = (tags[tag] ?? 0) + 1;
        }
      }

      if (record.metadata?.importance) {
        importanceBreakdown[record.metadata.importance] =
          (importanceBreakdown[record.metadata.importance] ?? 0) + 1;
      }
    }

    const branchInsights = this.applyBranchInsights(mutableTimeline);
    const progress = this.computeProgress(mutableTimeline);
    const relatedThoughts = this.findRelatedThoughts(mutableTimeline);
    const feedbackSignals = this.generateFeedbackSignals(mutableTimeline, branchInsights);
    const summary = this.generateSummary(
      mutableTimeline,
      stageTally,
      tags,
      importanceBreakdown,
      branchInsights,
      feedbackSignals
    );

    return {
      timeline: mutableTimeline,
      stageTally,
      tags,
      importanceBreakdown,
      progress,
      relatedThoughts,
      summary,
      branchInsights,
      feedbackSignals,
    };
  }

  private computeProgress(timeline: ThoughtRecord[]): ProgressSnapshot {
    const totalFromMetadata = timeline.reduce(
      (max, record) => Math.max(max, record.metadata?.totalThoughts ?? 0),
      0
    );
    const total = totalFromMetadata > 0 ? totalFromMetadata : timeline.length;

    const completedByNumber = timeline.reduce(
      (max, record) => Math.max(max, record.metadata?.thoughtNumber ?? 0),
      0
    );
    const completedByFlag = timeline.filter(
      (record) => record.metadata?.nextThoughtNeeded === false
    ).length;
    const completedByImportance = timeline.filter(
      (record) => record.metadata?.importance === 'high'
    ).length;

    const candidateCompleted = Math.max(
      completedByNumber,
      completedByFlag,
      completedByImportance,
      0
    );
    const boundedCompleted = total > 0 ? Math.min(candidateCompleted, total) : candidateCompleted;
    const remaining = Math.max(total - boundedCompleted, 0);
    const percentage = total === 0 ? 0 : Math.round((boundedCompleted / total) * 100);

    return {
      total,
      completed: boundedCompleted,
      remaining,
      percentage,
    };
  }

  private findRelatedThoughts(timeline: ThoughtRecord[]): RelatedThoughtGroup[] {
    const groups: RelatedThoughtGroup[] = [];

    const byTag = new Map<string, ThoughtRecord[]>();
    const byStage = new Map<string, ThoughtRecord[]>();
    const byImportance = new Map<string, ThoughtRecord[]>();
    const byBranch = new Map<string, ThoughtRecord[]>();
    const byRevision = new Map<number, ThoughtRecord[]>();

    for (const record of timeline) {
      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (!tag) {
            continue;
          }
          if (!byTag.has(tag)) {
            byTag.set(tag, []);
          }
          byTag.get(tag)?.push(record);
        }
      }

      if (!byStage.has(record.stage)) {
        byStage.set(record.stage, []);
      }
      byStage.get(record.stage)?.push(record);

      if (record.metadata?.importance) {
        const level = record.metadata.importance;
        if (!byImportance.has(level)) {
          byImportance.set(level, []);
        }
        byImportance.get(level)?.push(record);
      }

      if (record.metadata?.branchId) {
        const branch = record.metadata.branchId;
        if (!byBranch.has(branch)) {
          byBranch.set(branch, []);
        }
        byBranch.get(branch)?.push(record);
      }

      if (typeof record.metadata?.revisesThought === 'number') {
        const target = record.metadata.revisesThought;
        if (!byRevision.has(target)) {
          byRevision.set(target, []);
        }
        byRevision.get(target)?.push(record);
      }
    }

    for (const [tag, records] of byTag.entries()) {
      if (records.length > 1) {
        groups.push({ tag, thoughts: records });
      }
    }

    for (const [stage, records] of byStage.entries()) {
      if (records.length > 1) {
        groups.push({ stage, thoughts: records });
      }
    }

    for (const [importance, records] of byImportance.entries()) {
      if (records.length > 1) {
        groups.push({ importance: importance as ThoughtMetadata['importance'], thoughts: records });
      }
    }

    for (const [branchId, records] of byBranch.entries()) {
      if (records.length > 1) {
        groups.push({ tag: `branch:${branchId}`, thoughts: records });
      }
    }

    for (const [revised, records] of byRevision.entries()) {
      if (records.length > 1) {
        groups.push({ tag: `revises:${revised}`, thoughts: records });
      }
    }

    return groups;
  }

  private generateSummary(
    timeline: ThoughtRecord[],
    stageTally: Record<string, number>,
    tags: Record<string, number>,
    importanceBreakdown: Record<string, number>,
    branchInsights: BranchInsight[],
    feedbackSignals: FeedbackSignal[]
  ): string {
    const progress = this.computeProgress(timeline);

    const lines: string[] = [];
    lines.push(`# Structured Thinking Summary`);
    lines.push(`Total thoughts: ${timeline.length}`);
    lines.push(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`);

    if (Object.keys(stageTally).length) {
      lines.push(`\n## Stage Distribution`);
      for (const [stage, count] of Object.entries(stageTally)) {
        lines.push(`- ${stage}: ${count}`);
      }
    }

    if (Object.keys(importanceBreakdown).length) {
      lines.push(`\n## Importance Levels`);
      for (const [level, count] of Object.entries(importanceBreakdown)) {
        lines.push(`- ${level}: ${count}`);
      }
    }

    if (Object.keys(tags).length) {
      lines.push(`\n## Tags`);
      for (const [tag, count] of Object.entries(tags)) {
        lines.push(`- ${tag}: ${count}`);
      }
    }

    lines.push(`\n## Key Thoughts`);
    for (const record of timeline.slice(0, 5)) {
      lines.push(`- ${record.id} [${record.stage}] ${record.thought}`);
    }

    if (branchInsights.length) {
      lines.push(`\n## Branch Health`);
      for (const insight of branchInsights) {
        const qualityText =
          typeof insight.averageQuality === 'number' ? insight.averageQuality.toFixed(2) : 'n/a';
        const depthText = insight.maxDepth;
        lines.push(
          `- Branch ${insight.branchId} (${insight.health}) • thoughts: ${insight.thoughtCount} • depth: ${depthText} • avg quality: ${qualityText} • last updated: ${insight.lastUpdated}${
            insight.rootThoughtId ? ` • root: ${insight.rootThoughtId}` : ''
          }`
        );
      }
    }

    if (feedbackSignals.length) {
      lines.push(`\n## Feedback Signals`);
      for (const signal of feedbackSignals) {
        const scope = signal.branchId
          ? `branch ${signal.branchId}`
          : signal.stageId
            ? `stage ${signal.stageId}`
            : 'timeline';
        lines.push(`- (${signal.severity}) [${signal.type}] ${scope}: ${signal.message}`);
      }
    }

    return lines.join('\n');
  }

  private normaliseThought(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, ' ')
      .replace(REPETITION_NORMALISATION_REGEX, ' ')
      .trim();
  }

  private previewThought(content: string, length = 64): string {
    const trimmed = content.trim().replace(/\s+/g, ' ');
    if (trimmed.length <= length) {
      return trimmed;
    }
    return `${trimmed.slice(0, length - 1)}…`;
  }

  private resolveHeuristics(overrides?: StageFrameworkHeuristics): ResolvedHeuristics {
    const base = { ...DEFAULT_RESOLVED_HEURISTICS };
    const dwellThresholds: Record<string, number> = {};
    let dwellDefault: number | undefined;

    if (overrides?.dwellThresholds) {
      for (const [key, value] of Object.entries(overrides.dwellThresholds)) {
        if (['default', 'DEFAULT', '_default'].includes(key)) {
          if (typeof value === 'number' && value > 0) {
            dwellDefault = value;
          }
          continue;
        }
        if (typeof value === 'number' && value > 0) {
          dwellThresholds[key] = value;
        }
      }
    }

    return {
      dwellThresholds,
      dwellDefault: dwellDefault ?? base.dwellDefault,
      rollingWindow: overrides?.rollingWindow ?? base.rollingWindow,
      repetitionWindow: overrides?.repetitionWindow ?? base.repetitionWindow,
      repetitionThreshold: overrides?.repetitionThreshold ?? base.repetitionThreshold,
      qualityDeltaThreshold: overrides?.qualityDeltaThreshold ?? base.qualityDeltaThreshold,
      branchStalenessMinutes: overrides?.branchStalenessMinutes ?? base.branchStalenessMinutes,
      branchLowQualityThreshold:
        overrides?.branchLowQualityThreshold ?? base.branchLowQualityThreshold,
    };
  }

  private toMarkdown(
    records: ThoughtTrackingResult,
    style: 'Standard' | 'Claude' | 'Agents'
  ): string {
    const lines: string[] = [];
    lines.push(`# Thought Timeline (${style})`);
    for (const record of records.timeline) {
      lines.push(
        `- **${record.id}** [${record.stage}] ${record.thought}` +
          (record.metadata?.tags?.length ? ` _(tags: ${record.metadata.tags.join(', ')})_` : '')
      );
    }

    lines.push('\n## Summary');
    lines.push(records.summary);

    return lines.join('\n');
  }

  private parseMarkdownTimeline(content: string): ThoughtTrackingResult {
    const timeline: ThoughtRecord[] = [];
    const timelineRegex =
      /^- \*\*(?<id>[^*]+)\*\* \[(?<stage>[^\]]+)\] (?<thought>[^_]+)(?: _\(tags: (?<tags>[^)]+)\)_)?$/gm;
    let index = 0;
    let match: RegExpExecArray | null;
    while ((match = timelineRegex.exec(content)) !== null) {
      index += 1;
      const stage = match.groups?.stage ?? 'planning';
      const record: ThoughtRecord = {
        id: match.groups?.id?.trim() ?? `T${String(index).padStart(3, '0')}`,
        stage,
        order: index,
        thought: match.groups?.thought?.trim() ?? '',
        timestamp: new Date().toISOString(),
        metadata: match.groups?.tags
          ? {
              tags: match.groups.tags.split(/,\s*/g),
              stageLabel: stage,
              thoughtNumber: index,
            }
          : {
              stageLabel: stage,
              thoughtNumber: index,
            },
      };
      timeline.push(record);
    }

    return this.summarizeTimeline(timeline);
  }
}
