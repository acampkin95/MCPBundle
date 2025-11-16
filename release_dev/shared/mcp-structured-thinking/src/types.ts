/**
 * Core type definitions for structured thinking
 * @packageDocumentation
 */

/**
 * Standard cognitive stages for structured problem-solving
 */
export type CognitiveStage =
  | 'problem_definition'
  | 'research'
  | 'analysis'
  | 'synthesis'
  | 'conclusion';

/**
 * Descriptor for a cognitive stage with guidance
 */
export interface StageDescriptor {
  readonly id: CognitiveStage | string;
  readonly title: string;
  readonly description: string;
  readonly guidingQuestions?: readonly string[];
  readonly exampleActivities?: readonly string[];
}

/**
 * Options for customizing the framework
 */
export interface FrameworkOptions {
  readonly includeExamples?: boolean;
  readonly customStages?: StageDescriptor[];
}

/**
 * Types of feedback signals for thought quality analysis
 */
export type FeedbackSignalType = 'stage_dwell' | 'quality_drop' | 'repetition' | 'branch_health';

/**
 * Severity levels for feedback signals
 */
export type FeedbackSeverity = 'info' | 'notice' | 'warning' | 'critical';

/**
 * Feedback signal for thought quality or progression issues
 */
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

/**
 * Health status for thought branches
 */
export type BranchHealth = 'healthy' | 'stagnant' | 'at_risk' | 'forming' | 'unknown';

/**
 * Insights about a thought branch
 */
export interface BranchInsight {
  readonly branchId: string;
  readonly rootThoughtId?: string;
  readonly thoughtCount: number;
  readonly maxDepth: number;
  readonly lastUpdated: string;
  readonly averageQuality?: number;
  readonly health: BranchHealth;
}

/**
 * Extended metadata for thoughts
 */
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

/**
 * Entry for adding a new thought
 */
export interface ThoughtEntry {
  readonly stage: string;
  readonly thought: string;
  readonly metadata?: ThoughtMetadata;
}

/**
 * Stored thought record with ID and timestamp
 */
export interface ThoughtRecord {
  readonly id: string;
  readonly stage: string;
  readonly order: number;
  readonly thought: string;
  readonly timestamp: string;
  readonly metadata?: ThoughtMetadata;
}

/**
 * Options for filtering thoughts
 */
export interface ThoughtFilterOptions {
  readonly stage?: string;
  readonly branchId?: string;
  readonly tags?: readonly string[];
  readonly importance?: ThoughtMetadata['importance'];
  readonly textIncludes?: string;
  readonly limit?: number;
  readonly sinceThoughtNumber?: number;
}

/**
 * Payload for updating an existing thought
 */
export interface ThoughtUpdatePayload {
  readonly stage?: string;
  readonly thought?: string;
  readonly metadata?: Partial<ThoughtMetadata>;
}

/**
 * Group of related thoughts
 */
export interface RelatedThoughtGroup {
  readonly tag?: string;
  readonly importance?: ThoughtMetadata['importance'];
  readonly stage?: string;
  readonly thoughts: ThoughtRecord[];
}

/**
 * Progress snapshot for thoughts
 */
export interface ProgressSnapshot {
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly percentage: number;
}

/**
 * Complete result from tracking thoughts
 */
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

/**
 * Summary of thoughts from a specific source
 */
export interface SourceSummary {
  readonly source: string;
  readonly count: number;
  readonly stages: readonly string[];
  readonly tags: readonly string[];
  readonly lastRecorded: string;
}

/**
 * Diagnostic information about the thought timeline
 */
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

/**
 * Options for diagnostics
 */
export interface DiagnosticsOptions {
  readonly staleHours?: number;
}

/**
 * Options for generating reports
 */
export interface StructuredReportOptions extends DiagnosticsOptions {
  readonly format: 'markdown' | 'json';
  readonly includeTimeline?: boolean;
  readonly maxEntries?: number;
}

/**
 * Generated report with diagnostics
 */
export interface StructuredReport {
  readonly format: 'markdown' | 'json';
  readonly content: string;
  readonly diagnostics: StructuredDiagnostics;
  readonly summary: ThoughtTrackingResult;
  readonly timeline?: ThoughtRecord[];
}

/**
 * Export format options
 */
export interface ExportOptions {
  readonly format: 'json' | 'jsonb' | 'markdown' | 'claude' | 'agents';
  readonly includeMetadata?: boolean;
}

/**
 * Import payload
 */
export interface ImportPayload {
  readonly format: ExportOptions['format'];
  readonly content: string;
}

/**
 * Stage transition definition
 */
export interface StageTransition {
  readonly from: string;
  readonly to: readonly string[];
  readonly prompt?: string;
}

/**
 * Configuration for stage framework
 */
export interface StageFrameworkConfig {
  readonly stages: StageDescriptor[];
  readonly transitions?: readonly StageTransition[];
  readonly heuristics?: StageFrameworkHeuristics;
}

/**
 * Heuristics for stage analysis
 */
export interface StageFrameworkHeuristics {
  readonly dwellThresholds?: Record<string, number>;
  readonly rollingWindow?: number;
  readonly repetitionWindow?: number;
  readonly repetitionThreshold?: number;
  readonly qualityDeltaThreshold?: number;
  readonly branchStalenessMinutes?: number;
  readonly branchLowQualityThreshold?: number;
}

/**
 * Configuration options for StructuredThinkingService
 */
export interface ServiceConfig {
  /** Database path for persistence */
  readonly databasePath: string;

  /** Custom stage framework configuration */
  readonly frameworkConfig?: StageFrameworkConfig;

  /** Enable caching for performance */
  readonly enableCache?: boolean;

  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  readonly cacheTTL?: number;

  /** Maximum cache size in number of entries (default: 1000) */
  readonly maxCacheSize?: number;
}

/**
 * SQLite Planner Service interface (peer dependency)
 */
export interface ISQLitePlannerService {
  getDatabasePath(): string;
  getTimeline(): ThoughtRecord[];
  replaceTimeline(timeline: ThoughtRecord[]): void;
  appendThought(record: ThoughtRecord): void;
  refreshMarkdownCache(): Promise<void>;
}
