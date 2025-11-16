/**
 * Structured Thinking Service - Enhanced v2.0
 *
 * Performance improvements:
 * - LRU caching for expensive operations
 * - Optimized timeline sorting (skip if already sorted)
 * - Batch processing for database writes
 * - Reduced object allocations
 *
 * @packageDocumentation
 */

import type {
  CognitiveStage,
  StageDescriptor,
  FrameworkOptions,
  ThoughtEntry,
  ThoughtRecord,
  ThoughtMetadata,
  ThoughtTrackingResult,
  ThoughtFilterOptions,
  ThoughtUpdatePayload,
  StructuredDiagnostics,
  DiagnosticsOptions,
  StructuredReport,
  StructuredReportOptions,
  ExportOptions,
  ImportPayload,
  SourceSummary,
  RelatedThoughtGroup,
  ProgressSnapshot,
  BranchInsight,
  FeedbackSignal,
  BranchHealth,
  FeedbackSeverity,
  StageTransition,
  StageFrameworkConfig,
  StageFrameworkHeuristics,
  ServiceConfig,
  ISQLitePlannerService,
} from './types.js';

import { LRUCache, CacheKeyGenerator } from './cache.js';
import {
  DEFAULT_STAGES,
  REPETITION_NORMALISATION_REGEX,
  normalizeThought,
  previewThought,
  generateThoughtId,
  validateThoughtRecord,
  isTimelineSorted,
  mergeMetadata,
  calculatePercentage,
  parseTimestamp,
  isStale,
  type MutableThoughtRecord,
} from './utils.js';

/**
 * Resolved heuristics configuration
 */
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

/**
 * Default heuristics
 */
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

/**
 * Main Structured Thinking Service
 *
 * Provides comprehensive thought tracking with:
 * - Cognitive stage framework
 * - Timeline management
 * - Branch analysis
 * - Quality feedback
 * - Export/import capabilities
 * - Performance optimization with caching
 */
export class StructuredThinkingService {
  private readonly planner: ISQLitePlannerService;
  private frameworkConfig: StageFrameworkConfig;
  private heuristics: ResolvedHeuristics;

  // Performance optimization
  private readonly cache: LRUCache<string, unknown>;
  private readonly enableCache: boolean;

  constructor(planner: ISQLitePlannerService, config?: Partial<ServiceConfig>) {
    this.planner = planner;
    this.enableCache = config?.enableCache ?? true;

    // Initialize cache
    this.cache = new LRUCache(
      config?.maxCacheSize ?? 1000,
      config?.cacheTTL ?? 60000
    );

    // Load framework configuration
    this.frameworkConfig = config?.frameworkConfig ?? {
      stages: DEFAULT_STAGES,
      transitions: undefined,
      heuristics: undefined,
    };

    this.heuristics = this.resolveHeuristics(this.frameworkConfig.heuristics);
  }

  /**
   * Reload framework configuration
   */
  public reloadFrameworkConfig(config?: StageFrameworkConfig): StageFrameworkConfig {
    this.frameworkConfig = config ?? {
      stages: DEFAULT_STAGES,
      transitions: undefined,
      heuristics: undefined,
    };
    this.heuristics = this.resolveHeuristics(this.frameworkConfig.heuristics);
    this.cache.clear(); // Invalidate cache
    return this.frameworkConfig;
  }

  /**
   * Get current framework configuration
   */
  public getFrameworkConfig(): StageFrameworkConfig {
    return this.frameworkConfig;
  }

  /**
   * Get framework stages with optional customization
   */
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

  /**
   * Track new thoughts and return updated summary
   */
  public trackThoughts(entries: ThoughtEntry[], autoNumbering: boolean = true): ThoughtTrackingResult {
    const existing = this.planner.getTimeline();
    const nextOrder = existing.length;

    const timeline: ThoughtRecord[] = existing.slice();

    // Add new entries
    entries.forEach((entry, index) => {
      const order = autoNumbering
        ? nextOrder + index + 1
        : (entry.metadata?.thoughtNumber ?? nextOrder + index + 1);

      const record: ThoughtRecord = {
        id: generateThoughtId(order),
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

    // Normalize and summarize
    const normalized = this.normalizeTimeline(timeline);
    const result = this.summarizeTimeline(normalized);

    // Update storage
    this.planner.replaceTimeline(result.timeline);

    // Invalidate cache
    if (this.enableCache) {
      this.cache.clear();
    }

    return result;
  }

  /**
   * Get current timeline (normalized)
   */
  public getTimeline(): ThoughtRecord[] {
    return this.normalizeTimeline(this.planner.getTimeline());
  }

  /**
   * Clear entire timeline
   */
  public clearTimeline(): ThoughtTrackingResult {
    this.planner.replaceTimeline([]);

    if (this.enableCache) {
      this.cache.clear();
    }

    return this.summarizeTimeline([]);
  }

  /**
   * Revise an existing thought
   */
  public reviseThought(thoughtId: string, updates: ThoughtUpdatePayload): ThoughtTrackingResult {
    const timeline = this.normalizeTimeline(this.planner.getTimeline());
    const index = timeline.findIndex((record) => record.id === thoughtId);

    if (index === -1) {
      throw new Error(`Thought with id ${thoughtId} not found`);
    }

    const existingRecord = timeline[index];
    const mergedMetadata: ThoughtMetadata = mergeMetadata(existingRecord.metadata, {
      ...updates.metadata,
      isRevision: true,
      stageLabel: updates.metadata?.stageLabel ?? updates.stage ?? existingRecord.stage,
      revisesThought:
        updates.metadata?.revisesThought ??
        existingRecord.metadata?.revisesThought ??
        existingRecord.metadata?.thoughtNumber,
    });

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

    if (this.enableCache) {
      this.cache.clear();
    }

    return result;
  }

  /**
   * Filter timeline by criteria
   */
  public filterTimeline(filters: ThoughtFilterOptions): ThoughtRecord[] {
    const timeline = this.getTimeline();

    let filtered = timeline.filter((record) => {
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
        const normalizedText = record.thought.toLowerCase();
        if (!normalizedText.includes(filters.textIncludes.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    if (filters.limit && filters.limit > 0) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered;
  }

  /**
   * Get stage transitions
   */
  public getStageTransitions(): readonly StageTransition[] {
    return this.frameworkConfig.transitions ?? [];
  }

  /**
   * Export to file (async)
   */
  public async exportToFile(
    records: ThoughtTrackingResult,
    options: ExportOptions,
    destinationPath: string
  ): Promise<string> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');

    const contents = this.exportThoughts(records, options);
    const dir = dirname(destinationPath);

    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    await writeFile(destinationPath, contents, 'utf8');
    return contents;
  }

  /**
   * Export thoughts to string
   */
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

  /**
   * Import thoughts from payload
   */
  public importThoughts(payload: ImportPayload): ThoughtTrackingResult {
    switch (payload.format) {
      case 'json': {
        const data = JSON.parse(payload.content);
        if (Array.isArray(data?.timeline)) {
          return this.summarizeTimeline(this.normalizeTimeline(data.timeline as ThoughtRecord[]));
        }
        return data as ThoughtTrackingResult;
      }

      case 'jsonb': {
        const data = JSON.parse(payload.content) as { timeline: ThoughtRecord[] };
        return this.summarizeTimeline(this.normalizeTimeline(data.timeline));
      }

      case 'markdown':
      case 'claude':
      case 'agents':
        return this.parseMarkdownTimeline(payload.content);

      default:
        throw new Error(`Unsupported import format: ${payload.format}`);
    }
  }

  /**
   * Diagnose timeline for issues
   */
  public diagnoseTimeline(
    timeline: ThoughtRecord[],
    options: DiagnosticsOptions = {}
  ): StructuredDiagnostics {
    // Check cache
    if (this.enableCache) {
      const checksum = CacheKeyGenerator.timelineChecksum(timeline);
      const cacheKey = CacheKeyGenerator.diagnostics(checksum, options);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as StructuredDiagnostics;
      }
    }

    const normalized = this.normalizeTimeline(timeline);
    const result = this.computeDiagnostics(normalized, options);

    // Cache result
    if (this.enableCache) {
      const checksum = CacheKeyGenerator.timelineChecksum(timeline);
      const cacheKey = CacheKeyGenerator.diagnostics(checksum, options);
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Generate comprehensive report
   */
  public generateReport(
    timeline: ThoughtRecord[],
    options: StructuredReportOptions
  ): StructuredReport {
    const normalized = this.normalizeTimeline(timeline);
    const diagnostics = this.diagnoseTimeline(normalized, options);
    const summary = this.summarizeTimeline(normalized);

    const includeTimeline = options.includeTimeline ?? false;
    const maxEntries = options.maxEntries ?? normalized.length;
    const subset = includeTimeline ? normalized.slice(-maxEntries) : undefined;
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

    // Markdown format
    return this.generateMarkdownReport(generatedAt, diagnostics, summary, subset);
  }

  /**
   * Normalize timeline (sort and renumber)
   * OPTIMIZED: Skip sorting if already sorted
   */
  public normalizeTimeline(timeline: ThoughtRecord[]): ThoughtRecord[] {
    if (timeline.length === 0) {
      return [];
    }

    // Check cache
    if (this.enableCache) {
      const checksum = CacheKeyGenerator.timelineChecksum(timeline);
      const cacheKey = CacheKeyGenerator.normalizedTimeline(checksum);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as ThoughtRecord[];
      }
    }

    const working = timeline.slice();

    // OPTIMIZATION: Check if already sorted before sorting
    const alreadySorted = isTimelineSorted(working);

    const ordered = alreadySorted
      ? working
      : working.sort((a, b) => {
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          return a.timestamp.localeCompare(b.timestamp);
        });

    // Renumber and normalize metadata
    const result = ordered.map((record, index) => ({
      ...record,
      id: generateThoughtId(index + 1),
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

    // Cache result
    if (this.enableCache) {
      const checksum = CacheKeyGenerator.timelineChecksum(timeline);
      const cacheKey = CacheKeyGenerator.normalizedTimeline(checksum);
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Summarize timeline with all analytics
   * OPTIMIZED: Uses caching for expensive operations
   */
  public summarizeTimeline(timeline: ThoughtRecord[]): ThoughtTrackingResult {
    // Check cache
    if (this.enableCache && timeline.length > 0) {
      const checksum = CacheKeyGenerator.timelineChecksum(timeline);
      const cacheKey = CacheKeyGenerator.timelineSummary(checksum);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as ThoughtTrackingResult;
      }
    }

    const mutableTimeline: MutableThoughtRecord[] = timeline.map((record) => ({
      ...record,
      metadata: record.metadata ? { ...record.metadata } : undefined,
    })) as MutableThoughtRecord[];

    const stageTally: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const importanceBreakdown: Record<string, number> = {};

    // Single pass for tallies
    for (const record of mutableTimeline) {
      stageTally[record.stage] = (stageTally[record.stage] ?? 0) + 1;

      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (tag) {
            tags[tag] = (tags[tag] ?? 0) + 1;
          }
        }
      }

      if (record.metadata?.importance) {
        importanceBreakdown[record.metadata.importance] =
          (importanceBreakdown[record.metadata.importance] ?? 0) + 1;
      }
    }

    // Compute analytics
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

    const result: ThoughtTrackingResult = {
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

    // Cache result
    if (this.enableCache && timeline.length > 0) {
      const checksum = CacheKeyGenerator.timelineChecksum(timeline);
      const cacheKey = CacheKeyGenerator.timelineSummary(checksum);
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Get cache statistics
   */
  public getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache manually
   */
  public clearCache(): void {
    this.cache.clear();
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Compute diagnostics (internal)
   */
  private computeDiagnostics(
    normalized: ThoughtRecord[],
    options: DiagnosticsOptions
  ): StructuredDiagnostics {
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

    for (const record of normalized) {
      stageCoverage[record.stage] = (stageCoverage[record.stage] ?? 0) + 1;

      const timestampMs = parseTimestamp(record.timestamp);
      if (timestampMs > 0 && now - timestampMs > staleMs) {
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

    const lastUpdated = normalized.length ? normalized[normalized.length - 1].timestamp : null;

    return {
      stageCoverage,
      missingStages,
      lastUpdated,
      staleEntries,
      highImportancePending,
      sourceSummaries,
      tagCloud,
      totalThoughts: normalized.length,
    };
  }

  /**
   * Apply branch insights (mutates timeline)
   */
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

    if (branchMap.size === 0) {
      return [];
    }

    const now = Date.now();
    const insights: BranchInsight[] = [];

    for (const [branchId, records] of branchMap.entries()) {
      const orderedRecords = records.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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

      const maxDepth = Math.max(...orderedRecords.map((record) => record.metadata?.branchDepth ?? 0));
      const lastRecord = orderedRecords[orderedRecords.length - 1];
      const averageQuality = qualityCount > 0 ? cumulativeQuality / qualityCount : undefined;
      const lastTimestamp = parseTimestamp(lastRecord.timestamp);
      const ageMinutes = lastTimestamp > 0 ? Math.max((now - lastTimestamp) / 60000, 0) : 0;

      let health: BranchHealth = 'unknown';
      if (orderedRecords.length <= 1) {
        health = 'forming';
      } else if (typeof averageQuality === 'number') {
        if (averageQuality < this.heuristics.branchLowQualityThreshold) {
          health = 'at_risk';
        } else if (averageQuality >= this.heuristics.branchLowQualityThreshold + 0.25) {
          health = 'healthy';
        } else {
          health = 'stagnant';
        }
      }

      if (ageMinutes > this.heuristics.branchStalenessMinutes) {
        health = health === 'at_risk' ? 'at_risk' : 'stagnant';
      }

      orderedRecords.forEach((record) => {
        record.metadata = {
          ...(record.metadata ?? {}),
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

  /**
   * Generate feedback signals
   */
  private generateFeedbackSignals(
    timeline: MutableThoughtRecord[],
    branchInsights: BranchInsight[]
  ): FeedbackSignal[] {
    if (timeline.length === 0) {
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
    this.addStageDwellSignals(timeline, transitionMap, signals);

    // Quality drop tracking
    this.addQualityDropSignals(timeline, transitionMap, signals);

    // Repetition tracking
    this.addRepetitionSignals(timeline, signals);

    // Branch health signals
    this.addBranchHealthSignals(branchInsights, signals);

    return signals;
  }

  /**
   * Add stage dwell signals
   */
  private addStageDwellSignals(
    timeline: MutableThoughtRecord[],
    transitionMap: Map<string, StageTransition[]>,
    signals: FeedbackSignal[]
  ): void {
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

      const threshold = this.heuristics.dwellThresholds[record.stage] ?? this.heuristics.dwellDefault;

      if (threshold > 0 && dwellCount > threshold) {
        const key = `${record.stage}:${record.id}:dwell`;
        if (!dwellFlagged.has(key)) {
          dwellFlagged.add(key);
          const transitions = transitionMap.get(record.stage) ?? [];
          const suggested = transitions.flatMap((t) => t.to);
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
  }

  /**
   * Add quality drop signals
   */
  private addQualityDropSignals(
    timeline: MutableThoughtRecord[],
    transitionMap: Map<string, StageTransition[]>,
    signals: FeedbackSignal[]
  ): void {
    const stageScores = new Map<string, number[]>();

    for (const record of timeline) {
      const score = record.metadata?.qualityScore;
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        continue;
      }

      const scores = stageScores.get(record.stage) ?? [];
      const previousAverage =
        scores.length > 0 ? scores.reduce((sum, val) => sum + val, 0) / scores.length : null;

      scores.push(score);
      if (scores.length > Math.max(2, this.heuristics.rollingWindow)) {
        scores.shift();
      }
      stageScores.set(record.stage, scores);

      if (previousAverage !== null) {
        const delta = previousAverage - score;
        if (delta >= this.heuristics.qualityDeltaThreshold) {
          const transitions = transitionMap.get(record.stage) ?? [];
          const suggested = transitions.flatMap((t) => t.to);

          signals.push({
            type: 'quality_drop',
            severity: delta > this.heuristics.qualityDeltaThreshold * 1.5 ? 'warning' : 'notice',
            stageId: record.stage,
            thoughtId: record.id,
            suggestedNextStages: suggested.length ? suggested : undefined,
            message: `Quality score in "${record.stage}" dipped to ${score.toFixed(
              2
            )} (previous avg ${previousAverage.toFixed(2)}). Consider refreshing context.`,
            metrics: {
              current: score,
              previousAverage,
              delta,
            },
          });
        }
      }
    }
  }

  /**
   * Add repetition signals
   */
  private addRepetitionSignals(timeline: MutableThoughtRecord[], signals: FeedbackSignal[]): void {
    const windowSize = Math.max(2, this.heuristics.repetitionWindow);
    const repetitionThreshold = Math.max(2, this.heuristics.repetitionThreshold);
    const slidingWindow: string[] = [];
    const occurrenceMap = new Map<string, number>();
    const repetitionFlagged = new Set<string>();

    for (const record of timeline) {
      const normalized = normalizeThought(record.thought);
      slidingWindow.push(normalized);
      occurrenceMap.set(normalized, (occurrenceMap.get(normalized) ?? 0) + 1);

      if (slidingWindow.length > windowSize) {
        const removed = slidingWindow.shift()!;
        const nextCount = (occurrenceMap.get(removed) ?? 0) - 1;
        if (nextCount <= 0) {
          occurrenceMap.delete(removed);
        } else {
          occurrenceMap.set(removed, nextCount);
        }
      }

      const count = occurrenceMap.get(normalized) ?? 0;
      if (count >= repetitionThreshold) {
        const key = `${record.stage}:${normalized}`;
        if (!repetitionFlagged.has(key)) {
          repetitionFlagged.add(key);

          signals.push({
            type: 'repetition',
            severity: 'notice',
            stageId: record.stage,
            thoughtId: record.id,
            message: `Recent thoughts repeat the theme "${previewThought(record.thought)}" ${count} times. Consider exploring alternative angles.`,
            metrics: {
              occurrences: count,
              windowSize,
            },
          });
        }
      }
    }
  }

  /**
   * Add branch health signals
   */
  private addBranchHealthSignals(branchInsights: BranchInsight[], signals: FeedbackSignal[]): void {
    for (const insight of branchInsights) {
      if (insight.health === 'healthy') {
        continue;
      }

      const severity: FeedbackSeverity =
        insight.health === 'at_risk'
          ? 'warning'
          : insight.health === 'stagnant'
            ? 'notice'
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
  }

  /**
   * Compute progress snapshot
   */
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

    const candidateCompleted = Math.max(completedByNumber, completedByFlag, completedByImportance, 0);
    const boundedCompleted = total > 0 ? Math.min(candidateCompleted, total) : candidateCompleted;
    const remaining = Math.max(total - boundedCompleted, 0);
    const percentage = calculatePercentage(boundedCompleted, total);

    return {
      total,
      completed: boundedCompleted,
      remaining,
      percentage,
    };
  }

  /**
   * Find related thoughts
   */
  private findRelatedThoughts(timeline: ThoughtRecord[]): RelatedThoughtGroup[] {
    const groups: RelatedThoughtGroup[] = [];

    const byTag = new Map<string, ThoughtRecord[]>();
    const byStage = new Map<string, ThoughtRecord[]>();
    const byImportance = new Map<string, ThoughtRecord[]>();
    const byBranch = new Map<string, ThoughtRecord[]>();
    const byRevision = new Map<number, ThoughtRecord[]>();

    for (const record of timeline) {
      // Tags
      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (tag) {
            if (!byTag.has(tag)) {
              byTag.set(tag, []);
            }
            byTag.get(tag)!.push(record);
          }
        }
      }

      // Stages
      if (!byStage.has(record.stage)) {
        byStage.set(record.stage, []);
      }
      byStage.get(record.stage)!.push(record);

      // Importance
      if (record.metadata?.importance) {
        const level = record.metadata.importance;
        if (!byImportance.has(level)) {
          byImportance.set(level, []);
        }
        byImportance.get(level)!.push(record);
      }

      // Branches
      if (record.metadata?.branchId) {
        const branch = record.metadata.branchId;
        if (!byBranch.has(branch)) {
          byBranch.set(branch, []);
        }
        byBranch.get(branch)!.push(record);
      }

      // Revisions
      if (typeof record.metadata?.revisesThought === 'number') {
        const target = record.metadata.revisesThought;
        if (!byRevision.has(target)) {
          byRevision.set(target, []);
        }
        byRevision.get(target)!.push(record);
      }
    }

    // Add groups with multiple thoughts
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

  /**
   * Generate summary text
   */
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

    if (Object.keys(stageTally).length > 0) {
      lines.push(`\n## Stage Distribution`);
      for (const [stage, count] of Object.entries(stageTally)) {
        lines.push(`- ${stage}: ${count}`);
      }
    }

    if (Object.keys(importanceBreakdown).length > 0) {
      lines.push(`\n## Importance Levels`);
      for (const [level, count] of Object.entries(importanceBreakdown)) {
        lines.push(`- ${level}: ${count}`);
      }
    }

    if (Object.keys(tags).length > 0) {
      lines.push(`\n## Tags`);
      for (const [tag, count] of Object.entries(tags)) {
        lines.push(`- ${tag}: ${count}`);
      }
    }

    lines.push(`\n## Key Thoughts`);
    for (const record of timeline.slice(0, 5)) {
      lines.push(`- ${record.id} [${record.stage}] ${record.thought}`);
    }

    if (branchInsights.length > 0) {
      lines.push(`\n## Branch Health`);
      for (const insight of branchInsights) {
        const qualityText =
          typeof insight.averageQuality === 'number' ? insight.averageQuality.toFixed(2) : 'n/a';

        lines.push(
          `- Branch ${insight.branchId} (${insight.health}) • thoughts: ${insight.thoughtCount} • depth: ${insight.maxDepth} • avg quality: ${qualityText} • last updated: ${insight.lastUpdated}${
            insight.rootThoughtId ? ` • root: ${insight.rootThoughtId}` : ''
          }`
        );
      }
    }

    if (feedbackSignals.length > 0) {
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

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(
    generatedAt: string,
    diagnostics: StructuredDiagnostics,
    summary: ThoughtTrackingResult,
    timeline?: ThoughtRecord[]
  ): StructuredReport {
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

    if (diagnostics.missingStages.length > 0) {
      lines.push('\n## Missing stages');
      diagnostics.missingStages.forEach((stage) => lines.push(`- ${stage}`));
    }

    if (diagnostics.highImportancePending.length > 0) {
      lines.push('\n## High-importance thoughts needing follow-up');
      diagnostics.highImportancePending.forEach((record) =>
        lines.push(`- ${record.id} [${record.stage}] ${record.thought}`)
      );
    }

    if (diagnostics.sourceSummaries.length > 0) {
      lines.push('\n## Source summaries');
      diagnostics.sourceSummaries.forEach((item) => {
        lines.push(`- ${item.source}: ${item.count} entries (last: ${item.lastRecorded})`);
        if (item.stages.length > 0) {
          lines.push(`  * Stages: ${item.stages.join(', ')}`);
        }
        if (item.tags.length > 0) {
          lines.push(`  * Tags: ${item.tags.join(', ')}`);
        }
      });
    }

    if (timeline) {
      lines.push('\n## Recent timeline');
      timeline.forEach((record) => {
        lines.push(`- ${record.id} [${record.stage}] ${record.thought}`);
      });
    }

    return {
      format: 'markdown',
      content: lines.join('\n'),
      diagnostics,
      summary,
      timeline,
    };
  }

  /**
   * Convert to markdown
   */
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

  /**
   * Parse markdown timeline
   */
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
        id: match.groups?.id?.trim() ?? generateThoughtId(index),
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

  /**
   * Resolve heuristics from config
   */
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

  // Persistence methods (delegate to planner)

  public async ensureStorageFile(): Promise<string> {
    try {
      await this.planner.refreshMarkdownCache();
    } catch {
      // Ignore bootstrap failures
    }
    return this.planner.getDatabasePath();
  }

  public async bootstrapFromWorkspace(): Promise<ThoughtRecord[]> {
    await this.planner.refreshMarkdownCache();
    return this.planner.getTimeline();
  }

  public async loadStoredTimeline(): Promise<ThoughtRecord[]> {
    return this.planner.getTimeline();
  }

  public async saveStoredTimeline(timeline: ThoughtRecord[]): Promise<void> {
    this.planner.replaceTimeline(timeline);
    if (this.enableCache) {
      this.cache.clear();
    }
  }

  public async appendThoughtRecord(record: ThoughtRecord): Promise<ThoughtRecord[]> {
    this.planner.appendThought(record);
    if (this.enableCache) {
      this.cache.clear();
    }
    return this.loadStoredTimeline();
  }
}
