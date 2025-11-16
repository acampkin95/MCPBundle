/**
 * Integration tests for StructuredThinkingService
 *
 * Tests real-world scenarios and workflows
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type {
  ThoughtEntry,
  ThoughtRecord,
  ISQLitePlannerService,
} from '../src/types.js';
import { StructuredThinkingService } from '../src/StructuredThinkingService.js';

// ============================================================================
// Mock SQLite Planner Service (same as service.test.ts)
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

  clearTimeline(): void {
    this.timeline = [];
  }
}

// ============================================================================
// Integration Tests: Complete Thinking Workflow
// ============================================================================

describe('Integration - Complete Thinking Workflow', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner, {
      enableCache: true,
      cacheTTL: 60000,
    });
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should handle complete problem-solving workflow', () => {
    // Stage 1: Problem Definition
    const problemDef = service.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought:
            'Need to improve API response times for analytics endpoints',
          metadata: { importance: 'high', tags: ['performance', 'api'] },
        },
        {
          stage: 'problem_definition',
          thought: 'Current p95 latency is 800ms, target is <100ms',
          metadata: { importance: 'high', tags: ['metrics', 'goal'] },
        },
      ],
      true
    );

    expect(problemDef.timeline).toHaveLength(2);

    // Stage 2: Research
    const research = service.trackThoughts(
      [
        {
          stage: 'research',
          thought: 'Database queries account for 70% of response time',
          metadata: { importance: 'high', tags: ['database', 'profiling'] },
        },
        {
          stage: 'research',
          thought: 'Most queries are scanning full tables without indexes',
          metadata: { importance: 'high', tags: ['database', 'indexes'] },
        },
        {
          stage: 'research',
          thought: 'Redis cache hit rate is only 20%',
          metadata: { importance: 'medium', tags: ['cache', 'redis'] },
        },
      ],
      true
    );

    expect(research.timeline).toHaveLength(5);

    // Stage 3: Analysis
    const analysis = service.trackThoughts(
      [
        {
          stage: 'analysis',
          thought: 'Adding indexes on frequently queried columns will help',
          metadata: { importance: 'high', tags: ['database', 'solution'] },
        },
        {
          stage: 'analysis',
          thought: 'Increasing cache TTL from 5s to 30s could improve hit rate',
          metadata: { importance: 'medium', tags: ['cache', 'solution'] },
        },
      ],
      true
    );

    expect(analysis.timeline).toHaveLength(7);

    // Stage 4: Synthesis
    const synthesis = service.trackThoughts(
      [
        {
          stage: 'synthesis',
          thought:
            'Implement database indexes first (quick win, low risk)',
          metadata: { importance: 'high', tags: ['plan', 'priority-1'] },
        },
        {
          stage: 'synthesis',
          thought: 'Then optimize cache strategy (requires more testing)',
          metadata: { importance: 'high', tags: ['plan', 'priority-2'] },
        },
      ],
      true
    );

    expect(synthesis.timeline).toHaveLength(9);

    // Stage 5: Conclusion
    const conclusion = service.trackThoughts(
      [
        {
          stage: 'conclusion',
          thought:
            'Expected improvement: 60-70% reduction in response time',
          metadata: { importance: 'high', tags: ['metrics', 'goal'] },
        },
        {
          stage: 'conclusion',
          thought:
            'Implementation timeline: 2 days for indexes, 3 days for cache optimization',
          metadata: { importance: 'medium', tags: ['timeline'] },
        },
      ],
      true
    );

    expect(conclusion.timeline).toHaveLength(11);

    // Verify all stages covered
    expect(conclusion.stageTally).toHaveProperty('problem_definition', 2);
    expect(conclusion.stageTally).toHaveProperty('research', 3);
    expect(conclusion.stageTally).toHaveProperty('analysis', 2);
    expect(conclusion.stageTally).toHaveProperty('synthesis', 2);
    expect(conclusion.stageTally).toHaveProperty('conclusion', 2);

    // Verify progress
    expect(conclusion.progress.total).toBe(11);
    expect(conclusion.progress.percentage).toBe(100);

    // Generate final report
    const timeline = service.getTimeline();
    const report = service.generateReport(timeline, {
      format: 'markdown',
      includeTimeline: true,
    });

    expect(report.content).toContain('problem_definition');
    expect(report.content).toContain('research');
    expect(report.content).toContain('analysis');
    expect(report.diagnostics.missingStages).toHaveLength(0);
  });
});

// ============================================================================
// Integration Tests: Branching Workflows
// ============================================================================

describe('Integration - Branching Workflows', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should handle multiple solution branches', () => {
    // Main problem
    service.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought: 'Need to reduce server costs',
          metadata: { branchId: 'main' },
        },
      ],
      true
    );

    // Branch 1: Database optimization
    service.trackThoughts(
      [
        {
          stage: 'research',
          thought: 'Database queries are expensive',
          metadata: { branchId: 'db-optimization', branchFromThought: 1 },
        },
        {
          stage: 'analysis',
          thought: 'Optimizing queries could save 30% on DB costs',
          metadata: {
            branchId: 'db-optimization',
            qualityScore: 0.85,
          },
        },
      ],
      true
    );

    // Branch 2: Caching strategy
    service.trackThoughts(
      [
        {
          stage: 'research',
          thought: 'Most data is read-heavy, rarely changes',
          metadata: { branchId: 'caching', branchFromThought: 1 },
        },
        {
          stage: 'analysis',
          thought: 'Aggressive caching could save 50% on compute',
          metadata: {
            branchId: 'caching',
            qualityScore: 0.9,
          },
        },
      ],
      true
    );

    const result = service.trackThoughts([], false);

    // Should have 2 branches
    const dbBranch = result.branchInsights.find(
      (b) => b.branchId === 'db-optimization'
    );
    const cacheBranch = result.branchInsights.find(
      (b) => b.branchId === 'caching'
    );

    expect(dbBranch).toBeDefined();
    expect(dbBranch?.thoughtCount).toBe(2);

    expect(cacheBranch).toBeDefined();
    expect(cacheBranch?.thoughtCount).toBe(2);
    expect(cacheBranch?.averageQuality).toBeGreaterThan(
      dbBranch?.averageQuality ?? 0
    );
  });
});

// ============================================================================
// Integration Tests: Export/Import Workflow
// ============================================================================

describe('Integration - Export/Import Workflow', () => {
  let planner1: MockSQLitePlannerService;
  let planner2: MockSQLitePlannerService;
  let service1: StructuredThinkingService;
  let service2: StructuredThinkingService;

  beforeEach(() => {
    planner1 = new MockSQLitePlannerService();
    planner2 = new MockSQLitePlannerService();
    service1 = new StructuredThinkingService(planner1);
    service2 = new StructuredThinkingService(planner2);
  });

  afterEach(() => {
    planner1.clearTimeline();
    planner2.clearTimeline();
  });

  it('should export and import between services', () => {
    // Create thoughts in service 1
    const result1 = service1.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought: 'Original thought',
          metadata: {
            importance: 'high',
            tags: ['export-test'],
            branchId: 'main',
          },
        },
        {
          stage: 'research',
          thought: 'Research finding',
          metadata: {
            importance: 'medium',
            tags: ['export-test', 'research'],
          },
        },
      ],
      true
    );

    // Export
    const exported = service1.exportThoughts(result1, {
      format: 'json',
      includeMetadata: true,
    });

    // Import into service 2
    const result2 = service2.importThoughts({
      format: 'json',
      content: exported,
    });

    expect(result2.timeline).toHaveLength(2);

    // Verify metadata preserved
    const firstThought = result2.timeline[0];
    expect(firstThought.metadata?.importance).toBe('high');
    expect(firstThought.metadata?.tags).toContain('export-test');
    expect(firstThought.metadata?.branchId).toBe('main');
  });

  it('should export to Markdown and maintain readability', () => {
    const result = service1.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought: 'Test problem',
        },
        {
          stage: 'conclusion',
          thought: 'Test conclusion',
        },
      ],
      true
    );

    const markdown = service1.exportThoughts(result, {
      format: 'markdown',
      includeMetadata: true,
    });

    expect(markdown).toContain('# Structured Thinking Timeline');
    expect(markdown).toContain('## problem_definition');
    expect(markdown).toContain('Test problem');
    expect(markdown).toContain('## conclusion');
    expect(markdown).toContain('Test conclusion');
  });
});

// ============================================================================
// Integration Tests: Revision Workflow
// ============================================================================

describe('Integration - Revision Workflow', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should handle thought revisions', () => {
    // Initial thought
    const initial = service.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought: 'Initial problem statement',
          metadata: { importance: 'medium' },
        },
      ],
      true
    );

    const originalId = initial.timeline[0].id;

    // Revise the thought
    const revised = service.reviseThought(originalId, {
      thought: 'Refined problem statement with more clarity',
      metadata: { importance: 'high', isRevision: true, revisesThought: 1 },
    });

    const revisedThought = revised.timeline.find((t) => t.id === originalId);

    expect(revisedThought?.thought).toBe(
      'Refined problem statement with more clarity'
    );
    expect(revisedThought?.metadata?.importance).toBe('high');
    expect(revisedThought?.metadata?.isRevision).toBe(true);
  });

  it('should maintain revision history', () => {
    // Create initial thoughts
    service.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought: 'Version 1',
          metadata: { thoughtNumber: 1 },
        },
        {
          stage: 'research',
          thought: 'Research finding',
          metadata: { thoughtNumber: 2 },
        },
      ],
      true
    );

    const timeline1 = service.getTimeline();
    const firstId = timeline1[0].id;

    // Revise first thought
    service.reviseThought(firstId, {
      thought: 'Version 2',
      metadata: { isRevision: true, revisesThought: 1 },
    });

    const timeline2 = service.getTimeline();

    // Timeline should still have 2 thoughts (revision replaces, doesn't add)
    expect(timeline2).toHaveLength(2);

    const revised = timeline2.find((t) => t.id === firstId);
    expect(revised?.thought).toBe('Version 2');
    expect(revised?.metadata?.isRevision).toBe(true);
  });
});

// ============================================================================
// Integration Tests: Filtering and Search
// ============================================================================

describe('Integration - Filtering and Search', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);

    // Create diverse set of thoughts
    service.trackThoughts(
      [
        {
          stage: 'problem_definition',
          thought: 'Performance issues in production',
          metadata: { importance: 'high', tags: ['performance', 'production'] },
        },
        {
          stage: 'research',
          thought: 'Database queries taking 500ms average',
          metadata: {
            importance: 'high',
            tags: ['database', 'metrics'],
            branchId: 'db-perf',
          },
        },
        {
          stage: 'research',
          thought: 'API endpoints timing out under load',
          metadata: {
            importance: 'medium',
            tags: ['api', 'performance'],
            branchId: 'api-perf',
          },
        },
        {
          stage: 'analysis',
          thought: 'Missing indexes on user_events table',
          metadata: {
            importance: 'high',
            tags: ['database', 'solution'],
            branchId: 'db-perf',
          },
        },
        {
          stage: 'synthesis',
          thought: 'Implement caching layer for API',
          metadata: {
            importance: 'medium',
            tags: ['api', 'solution'],
            branchId: 'api-perf',
          },
        },
      ],
      true
    );
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should filter by multiple criteria', () => {
    // Filter: high importance, database tag
    const filtered = service.filterTimeline({
      importance: 'high',
      tags: ['database'],
    });

    expect(filtered).toHaveLength(2);
    filtered.forEach((thought) => {
      expect(thought.metadata?.importance).toBe('high');
      expect(thought.metadata?.tags).toContain('database');
    });
  });

  it('should filter by branch', () => {
    const dbBranch = service.filterTimeline({ branchId: 'db-perf' });
    const apiBranch = service.filterTimeline({ branchId: 'api-perf' });

    expect(dbBranch).toHaveLength(2);
    expect(apiBranch).toHaveLength(2);

    dbBranch.forEach((thought) => {
      expect(thought.metadata?.branchId).toBe('db-perf');
    });
  });

  it('should search by text content', () => {
    const apiThoughts = service.filterTimeline({ textIncludes: 'api' });
    const dbThoughts = service.filterTimeline({ textIncludes: 'database' });

    expect(apiThoughts.length).toBeGreaterThan(0);
    expect(dbThoughts.length).toBeGreaterThan(0);

    apiThoughts.forEach((thought) => {
      expect(thought.thought.toLowerCase()).toContain('api');
    });
  });

  it('should paginate results', () => {
    const page1 = service.filterTimeline({ limit: 2, stage: undefined });
    const page2 = service.filterTimeline({
      limit: 2,
      sinceThoughtNumber: 2,
      stage: undefined,
    });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);

    // Pages should not overlap
    const page1Ids = page1.map((t) => t.id);
    const page2Ids = page2.map((t) => t.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));

    expect(overlap).toHaveLength(0);
  });
});

// ============================================================================
// Integration Tests: Performance with Caching
// ============================================================================

describe('Integration - Performance with Caching', () => {
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

  it('should cache expensive summary operations', () => {
    // Create large timeline
    const thoughts: ThoughtEntry[] = Array(100)
      .fill(null)
      .map((_, i) => ({
        stage: ['research', 'analysis', 'synthesis'][i % 3],
        thought: `Thought ${i}`,
        metadata: { thoughtNumber: i + 1 },
      }));

    service.trackThoughts(thoughts, true);

    const timeline = service.getTimeline();

    // First call - cache miss
    const start1 = Date.now();
    const summary1 = service.summarizeTimeline(timeline);
    const duration1 = Date.now() - start1;

    // Second call - cache hit
    const start2 = Date.now();
    const summary2 = service.summarizeTimeline(timeline);
    const duration2 = Date.now() - start2;

    // Cache hit should be faster (or at least not significantly slower)
    expect(duration2).toBeLessThanOrEqual(duration1 * 2);

    // Results should be identical
    expect(summary1.timeline.length).toBe(summary2.timeline.length);

    // Check cache stats
    const stats = service.getCacheStats();
    expect(stats.hits).toBeGreaterThan(0);
  });

  it('should invalidate cache on modifications', () => {
    service.trackThoughts(
      [{ stage: 'research', thought: 'Initial' }],
      true
    );

    const timeline1 = service.getTimeline();
    const summary1 = service.summarizeTimeline(timeline1);

    // Modify timeline
    service.trackThoughts(
      [{ stage: 'analysis', thought: 'Additional' }],
      true
    );

    const timeline2 = service.getTimeline();
    const summary2 = service.summarizeTimeline(timeline2);

    // Summaries should differ
    expect(summary1.timeline.length).toBe(1);
    expect(summary2.timeline.length).toBe(2);
  });
});
