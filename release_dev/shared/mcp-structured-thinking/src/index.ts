/**
 * Structured Thinking Library - Main Entry Point
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { StructuredThinkingService, type ThoughtEntry } from '@mcp-bundle/structured-thinking';
 *
 * // Create service with planner
 * const service = new StructuredThinkingService(planner, {
 *   enableCache: true,
 *   cacheTTL: 60000,
 *   maxCacheSize: 1000
 * });
 *
 * // Track thoughts
 * const result = service.trackThoughts([
 *   { stage: 'problem_definition', thought: 'Define the problem...' }
 * ]);
 * ```
 */

// ============================================================================
// Main Service Export
// ============================================================================
export { StructuredThinkingService } from './StructuredThinkingService.js';

// ============================================================================
// Type Exports
// ============================================================================

// Core types
export type {
  CognitiveStage,
  StageDescriptor,
  FrameworkOptions,
  ThoughtEntry,
  ThoughtRecord,
  ThoughtMetadata,
  ThoughtTrackingResult,
  ThoughtFilterOptions,
  ThoughtUpdatePayload,
} from './types.js';

// Diagnostic types
export type {
  StructuredDiagnostics,
  DiagnosticsOptions,
  StructuredReport,
  StructuredReportOptions,
  SourceSummary,
} from './types.js';

// Export/Import types
export type { ExportOptions, ImportPayload } from './types.js';

// Analysis types
export type {
  RelatedThoughtGroup,
  ProgressSnapshot,
  BranchInsight,
  FeedbackSignal,
  BranchHealth,
  FeedbackSeverity,
  FeedbackSignalType,
} from './types.js';

// Configuration types
export type {
  StageTransition,
  StageFrameworkConfig,
  StageFrameworkHeuristics,
  ServiceConfig,
  ISQLitePlannerService,
} from './types.js';

// ============================================================================
// Utility Exports
// ============================================================================

export {
  DEFAULT_STAGES,
  REPETITION_NORMALISATION_REGEX,
  normalizeThought,
  previewThought,
  generateThoughtId,
  validateThoughtRecord,
  sanitizeThought,
  deepClone,
  isTimelineSorted,
  mergeMetadata,
  calculatePercentage,
  formatTimestamp,
  parseTimestamp,
  isStale,
  unique,
  groupBy,
  sortObjectKeys,
} from './utils.js';

// Export type utilities (if consumers need them)
export type { Mutable, MutableThoughtRecord } from './utils.js';

// ============================================================================
// Cache Exports (for advanced usage)
// ============================================================================

export { LRUCache, CacheKeyGenerator, BatchProcessor } from './cache.js';

// ============================================================================
// Re-export everything for convenience
// ============================================================================

export * from './types.js';
export * from './utils.js';
export * from './cache.js';
