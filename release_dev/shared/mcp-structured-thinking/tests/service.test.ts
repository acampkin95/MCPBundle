/**
 * Unit tests for StructuredThinkingService
 *
 * Tests cover:
 * - Basic thought tracking
 * - Timeline operations
 * - Branch insights
 * - Feedback signals
 * - Export/import
 * - Caching
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type {
  ThoughtEntry,
  ThoughtRecord,
  ISQLitePlannerService,
  ServiceConfig,
} from '../src/types.js';
import { StructuredThinkingService } from '../src/StructuredThinkingService.js';

// ============================================================================
// Mock SQLite Planner Service
// ============================================================================

class MockSQLitePlannerService implements ISQLitePlannerService {
  private timeline: ThoughtRecord[] = [];
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
  }

  getDatabasePath(): string {
    return this.dbPath;
  }

  getTimeline(): ThoughtRecord[] {
    return [...this.timeline];
  }

  replaceTimeline(timeline: ThoughtRecord[]): void {
    this.timeline = [...timeline];
  }

  appendThought(record: ThoughtRecord): void {
    this.timeline.push(record);
  }

  async refreshMarkdownCache(): Promise<void> {
    // Mock implementation
  }

  // Helper for tests
  clearTimeline(): void {
    this.timeline = [];
  }
}

// ============================================================================
// Test Data
// ============================================================================

const createTestThoughts = (): ThoughtEntry[] => [
  {
    stage: 'problem_definition',
    thought: 'Define the core problem we need to solve',
    metadata: { importance: 'high' as const, tags: ['core', 'planning'] },
  },
  {
    stage: 'research',
    thought: 'Gather information about existing solutions',
    metadata: { importance: 'medium' as const, tags: ['research'] },
  },
  {
    stage: 'analysis',
    thought: 'Analyze the gathered data and identify patterns',
    metadata: { importance: 'high' as const, tags: ['analysis'] },
  },
  {
    stage: 'synthesis',
    thought: 'Combine insights into actionable strategies',
    metadata: { importance: 'high' as const, tags: ['planning'] },
  },
  {
    stage: 'conclusion',
    thought: 'Summarize findings and next steps',
    metadata: { importance: 'medium' as const, tags: ['summary'] },
  },
];

// ============================================================================
// Tests: Basic Functionality
// ============================================================================

describe('StructuredThinkingService - Basic Functionality', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should initialize with default configuration', () => {
    expect(service).toBeInstanceOf(StructuredThinkingService);
  });

  it('should track thoughts with auto-numbering', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    expect(result.timeline).toHaveLength(5);
    expect(result.stageTally).toHaveProperty('problem_definition', 1);
    expect(result.stageTally).toHaveProperty('research', 1);
    expect(result.stageTally).toHaveProperty('analysis', 1);
    expect(result.stageTally).toHaveProperty('synthesis', 1);
    expect(result.stageTally).toHaveProperty('conclusion', 1);
  });

  it('should assign thought numbers correctly', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    result.timeline.forEach((thought, index) => {
      expect(thought.metadata?.thoughtNumber).toBe(index + 1);
      expect(thought.metadata?.totalThoughts).toBe(5);
    });
  });

  it('should track tags correctly', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    expect(result.tags).toHaveProperty('core', 1);
    expect(result.tags).toHaveProperty('planning', 2);
    expect(result.tags).toHaveProperty('research', 1);
    expect(result.tags).toHaveProperty('analysis', 1);
    expect(result.tags).toHaveProperty('summary', 1);
  });

  it('should track importance breakdown', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    expect(result.importanceBreakdown).toHaveProperty('high', 3);
    expect(result.importanceBreakdown).toHaveProperty('medium', 2);
  });

  it('should generate summary', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    expect(result.summary).toContain('Total Thoughts: 5');
    expect(result.summary).toContain('problem_definition: 1');
    expect(result.summary).toContain('research: 1');
  });

  it('should calculate progress correctly', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    expect(result.progress.total).toBe(5);
    expect(result.progress.completed).toBe(5);
    expect(result.progress.remaining).toBe(0);
    expect(result.progress.percentage).toBe(100);
  });
});

// ============================================================================
// Tests: Timeline Operations
// ============================================================================

describe('StructuredThinkingService - Timeline Operations', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should get timeline', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const timeline = service.getTimeline();
    expect(timeline).toHaveLength(5);
  });

  it('should clear timeline', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const result = service.clearTimeline();
    expect(result.timeline).toHaveLength(0);

    const timeline = service.getTimeline();
    expect(timeline).toHaveLength(0);
  });

  it('should filter timeline by stage', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const filtered = service.filterTimeline({ stage: 'research' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].stage).toBe('research');
  });

  it('should filter timeline by tags', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const filtered = service.filterTimeline({ tags: ['planning'] });
    expect(filtered).toHaveLength(2);
  });

  it('should filter timeline by importance', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const filtered = service.filterTimeline({ importance: 'high' });
    expect(filtered).toHaveLength(3);
  });

  it('should filter timeline by text content', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const filtered = service.filterTimeline({ textIncludes: 'data' });
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('should limit filtered results', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const filtered = service.filterTimeline({ limit: 2 });
    expect(filtered).toHaveLength(2);
  });

  it('should normalize timeline', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    // Manually mess up the order
    const timeline = service.getTimeline();
    timeline[0].order = 10;
    timeline[1].order = 5;
    planner.replaceTimeline(timeline);

    const normalized = service.normalizeTimeline(timeline);
    expect(normalized[0].order).toBe(0);
    expect(normalized[1].order).toBe(1);
    expect(normalized[2].order).toBe(2);
  });

  it('should revise thought', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const timeline = service.getTimeline();
    const firstId = timeline[0].id;

    const result = service.reviseThought(firstId, {
      thought: 'Revised problem definition',
    });

    const revised = result.timeline.find((t) => t.id === firstId);
    expect(revised?.thought).toBe('Revised problem definition');
  });
});

// ============================================================================
// Tests: Branch Insights
// ============================================================================

describe('StructuredThinkingService - Branch Insights', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should generate branch insights', () => {
    const entries: ThoughtEntry[] = [
      {
        stage: 'problem_definition',
        thought: 'Main problem',
        metadata: { branchId: 'branch-1' },
      },
      {
        stage: 'research',
        thought: 'Research for branch 1',
        metadata: { branchId: 'branch-1', branchFromThought: 1 },
      },
      {
        stage: 'problem_definition',
        thought: 'Alternative problem',
        metadata: { branchId: 'branch-2' },
      },
    ];

    const result = service.trackThoughts(entries, true);
    expect(result.branchInsights).toHaveLength(2);

    const branch1 = result.branchInsights.find((b) => b.branchId === 'branch-1');
    expect(branch1).toBeDefined();
    expect(branch1?.thoughtCount).toBe(2);
  });

  it('should calculate branch health', () => {
    const entries: ThoughtEntry[] = [
      {
        stage: 'problem_definition',
        thought: 'Main problem',
        metadata: { branchId: 'branch-1', qualityScore: 0.8 },
      },
      {
        stage: 'research',
        thought: 'Research',
        metadata: { branchId: 'branch-1', qualityScore: 0.85 },
      },
      {
        stage: 'analysis',
        thought: 'Analysis',
        metadata: { branchId: 'branch-1', qualityScore: 0.9 },
      },
    ];

    const result = service.trackThoughts(entries, true);
    const branch = result.branchInsights.find((b) => b.branchId === 'branch-1');

    expect(branch?.health).toBe('healthy');
    expect(branch?.averageQuality).toBeCloseTo(0.85, 1);
  });
});

// ============================================================================
// Tests: Feedback Signals
// ============================================================================

describe('StructuredThinkingService - Feedback Signals', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should detect stage dwelling', () => {
    // Create many thoughts in same stage
    const entries: ThoughtEntry[] = Array(10)
      .fill(null)
      .map(() => ({
        stage: 'research',
        thought: 'Still researching...',
      }));

    const result = service.trackThoughts(entries, true);
    const dwellSignal = result.feedbackSignals.find((s) => s.type === 'stage_dwell');

    expect(dwellSignal).toBeDefined();
    expect(dwellSignal?.stageId).toBe('research');
  });

  it('should detect repetition', () => {
    // Create repeated thoughts
    const entries: ThoughtEntry[] = [
      { stage: 'problem_definition', thought: 'The same thought repeated' },
      { stage: 'problem_definition', thought: 'The same thought repeated' },
      { stage: 'problem_definition', thought: 'The same thought repeated' },
    ];

    const result = service.trackThoughts(entries, true);
    const repSignal = result.feedbackSignals.find((s) => s.type === 'repetition');

    expect(repSignal).toBeDefined();
  });

  it('should detect quality drops', () => {
    const entries: ThoughtEntry[] = [
      {
        stage: 'problem_definition',
        thought: 'High quality thought',
        metadata: { qualityScore: 0.9 },
      },
      {
        stage: 'research',
        thought: 'Another good thought',
        metadata: { qualityScore: 0.85 },
      },
      {
        stage: 'analysis',
        thought: 'Low quality thought',
        metadata: { qualityScore: 0.3 },
      },
    ];

    const result = service.trackThoughts(entries, true);
    const qualitySignal = result.feedbackSignals.find((s) => s.type === 'quality_drop');

    expect(qualitySignal).toBeDefined();
  });
});

// ============================================================================
// Tests: Export/Import
// ============================================================================

describe('StructuredThinkingService - Export/Import', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should export as JSON', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    const exported = service.exportThoughts(result, { format: 'json' });
    expect(exported).toContain('"timeline"');
    expect(exported).toContain('"stageTally"');

    const parsed = JSON.parse(exported);
    expect(parsed.timeline).toHaveLength(5);
  });

  it('should export as Markdown', () => {
    const entries = createTestThoughts();
    const result = service.trackThoughts(entries, true);

    const exported = service.exportThoughts(result, { format: 'markdown' });
    expect(exported).toContain('# Structured Thinking Timeline');
    expect(exported).toContain('## problem_definition');
  });

  it('should import JSON', () => {
    const entries = createTestThoughts();
    const result1 = service.trackThoughts(entries, true);
    const exported = service.exportThoughts(result1, { format: 'json' });

    planner.clearTimeline();

    const result2 = service.importThoughts({
      format: 'json',
      content: exported,
    });

    expect(result2.timeline).toHaveLength(5);
  });

  it('should preserve metadata on export/import', () => {
    const entries = createTestThoughts();
    const result1 = service.trackThoughts(entries, true);
    const exported = service.exportThoughts(result1, {
      format: 'json',
      includeMetadata: true,
    });

    planner.clearTimeline();

    const result2 = service.importThoughts({
      format: 'json',
      content: exported,
    });

    const firstThought = result2.timeline[0];
    expect(firstThought.metadata?.tags).toContain('core');
    expect(firstThought.metadata?.importance).toBe('high');
  });
});

// ============================================================================
// Tests: Caching
// ============================================================================

describe('StructuredThinkingService - Caching', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner, {
      enableCache: true,
      cacheTTL: 60000,
      maxCacheSize: 100,
    });
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should cache timeline summaries', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    // First call - cache miss
    const timeline = service.getTimeline();
    const summary1 = service.summarizeTimeline(timeline);

    const stats1 = service.getCacheStats();
    expect(stats1.size).toBeGreaterThan(0);

    // Second call - cache hit
    const summary2 = service.summarizeTimeline(timeline);

    const stats2 = service.getCacheStats();
    expect(stats2.hits).toBeGreaterThan(0);

    expect(summary1.summary).toBe(summary2.summary);
  });

  it('should clear cache', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const timeline = service.getTimeline();
    service.summarizeTimeline(timeline);

    const stats1 = service.getCacheStats();
    expect(stats1.size).toBeGreaterThan(0);

    service.clearCache();

    const stats2 = service.getCacheStats();
    expect(stats2.size).toBe(0);
  });

  it('should invalidate cache on timeline changes', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const timeline1 = service.getTimeline();
    service.summarizeTimeline(timeline1);

    // Add new thought
    service.trackThoughts(
      [{ stage: 'conclusion', thought: 'Additional conclusion' }],
      true
    );

    const timeline2 = service.getTimeline();
    const summary = service.summarizeTimeline(timeline2);

    expect(summary.timeline).toHaveLength(6);
  });
});

// ============================================================================
// Tests: Diagnostics
// ============================================================================

describe('StructuredThinkingService - Diagnostics', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should generate diagnostics', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const timeline = service.getTimeline();
    const diagnostics = service.diagnoseTimeline(timeline);

    expect(diagnostics.totalThoughts).toBe(5);
    expect(diagnostics.stageCoverage).toHaveProperty('problem_definition');
    expect(diagnostics.missingStages).toHaveLength(0);
  });

  it('should detect missing stages', () => {
    const entries: ThoughtEntry[] = [
      { stage: 'problem_definition', thought: 'Define problem' },
      { stage: 'conclusion', thought: 'Conclude' },
    ];

    service.trackThoughts(entries, true);
    const timeline = service.getTimeline();
    const diagnostics = service.diagnoseTimeline(timeline);

    expect(diagnostics.missingStages).toContain('research');
    expect(diagnostics.missingStages).toContain('analysis');
    expect(diagnostics.missingStages).toContain('synthesis');
  });

  it('should generate reports', () => {
    const entries = createTestThoughts();
    service.trackThoughts(entries, true);

    const timeline = service.getTimeline();
    const report = service.generateReport(timeline, {
      format: 'markdown',
      includeTimeline: true,
    });

    expect(report.format).toBe('markdown');
    expect(report.content).toContain('# Structured Thinking Report');
    expect(report.diagnostics.totalThoughts).toBe(5);
  });
});

// ============================================================================
// Tests: Error Handling
// ============================================================================

describe('StructuredThinkingService - Error Handling', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should handle empty thought entries', () => {
    const result = service.trackThoughts([], true);
    expect(result.timeline).toHaveLength(0);
  });

  it('should handle invalid thought ID in revise', () => {
    expect(() => {
      service.reviseThought('invalid-id', { thought: 'Updated' });
    }).toThrow();
  });

  it('should handle invalid import format', () => {
    expect(() => {
      service.importThoughts({
        format: 'json',
        content: 'invalid json',
      });
    }).toThrow();
  });

  it('should handle timeline with invalid records', () => {
    const timeline = service.getTimeline();
    const invalidRecord = {
      id: '',
      stage: 'test',
      order: -1,
      thought: '',
      timestamp: 'invalid',
    };

    // This should not crash the service
    expect(() => {
      service.normalizeTimeline([invalidRecord as ThoughtRecord]);
    }).not.toThrow();
  });
});
