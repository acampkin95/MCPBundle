/**
 * Usage Examples for @mcp-bundle/structured-thinking
 *
 * This file demonstrates common usage patterns and best practices.
 */

import { StructuredThinkingService } from '../src/index.js';
import type {
  ThoughtEntry,
  ISQLitePlannerService,
  ThoughtRecord,
  ServiceConfig,
} from '../src/index.js';

// ============================================================================
// Example 1: Basic Usage
// ============================================================================

function example1_basicUsage() {
  console.log('\n=== Example 1: Basic Usage ===\n');

  // Mock planner for demonstration
  const planner: ISQLitePlannerService = createMockPlanner();

  // Create service
  const service = new StructuredThinkingService(planner);

  // Track thoughts
  const result = service.trackThoughts([
    {
      stage: 'problem_definition',
      thought: 'Need to improve API response times',
      metadata: { importance: 'high', tags: ['performance', 'api'] },
    },
    {
      stage: 'research',
      thought: 'Current p95 latency is 800ms',
      metadata: { importance: 'high', tags: ['metrics'] },
    },
    {
      stage: 'analysis',
      thought: 'Database queries are the bottleneck',
      metadata: { importance: 'high', tags: ['database'] },
    },
  ]);

  console.log('Timeline:', result.timeline.length, 'thoughts');
  console.log('Stage Tally:', result.stageTally);
  console.log('Progress:', result.progress);
  console.log('\nSummary:\n', result.summary);
}

// ============================================================================
// Example 2: With Caching Enabled
// ============================================================================

function example2_withCaching() {
  console.log('\n=== Example 2: With Caching ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();

  // Enable caching for better performance
  const service = new StructuredThinkingService(planner, {
    enableCache: true,
    cacheTTL: 60000, // 60 seconds
    maxCacheSize: 1000,
  });

  // Track some thoughts
  service.trackThoughts([
    { stage: 'problem_definition', thought: 'Define problem' },
    { stage: 'research', thought: 'Gather data' },
  ]);

  const timeline = service.getTimeline();

  // First call - cache miss
  console.time('First summary');
  const summary1 = service.summarizeTimeline(timeline);
  console.timeEnd('First summary');

  // Second call - cache hit (much faster!)
  console.time('Second summary (cached)');
  const summary2 = service.summarizeTimeline(timeline);
  console.timeEnd('Second summary (cached)');

  // Check cache stats
  const stats = service.getCacheStats();
  console.log('\nCache Stats:');
  console.log('- Hit Rate:', `${(stats.hitRate * 100).toFixed(1)}%`);
  console.log('- Size:', `${stats.size}/${stats.maxCacheSize}`);
  console.log('- Hits:', stats.hits);
  console.log('- Misses:', stats.misses);
}

// ============================================================================
// Example 3: Custom Framework Configuration
// ============================================================================

function example3_customFramework() {
  console.log('\n=== Example 3: Custom Framework ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();

  // Define custom cognitive stages
  const customFramework = {
    stages: [
      {
        id: 'discovery',
        title: 'Discovery',
        description: 'Discover and explore the problem space',
        guidingQuestions: [
          'What are we trying to achieve?',
          'What constraints exist?',
        ],
      },
      {
        id: 'ideation',
        title: 'Ideation',
        description: 'Generate creative solutions',
        guidingQuestions: ['What are possible solutions?', 'What if we tried...?'],
      },
      {
        id: 'validation',
        title: 'Validation',
        description: 'Test and validate ideas',
        guidingQuestions: ['Does this solution work?', 'What are the risks?'],
      },
    ],
    heuristics: {
      dwellThresholds: {
        discovery: 5,
        ideation: 3,
        validation: 4,
      },
      rollingWindow: 3,
      repetitionWindow: 5,
      repetitionThreshold: 0.8,
    },
  };

  const service = new StructuredThinkingService(planner, {
    frameworkConfig: customFramework,
  });

  const result = service.trackThoughts([
    { stage: 'discovery', thought: 'Exploring the problem' },
    { stage: 'ideation', thought: 'Brainstorming solutions' },
    { stage: 'validation', thought: 'Testing approach' },
  ]);

  console.log('Custom stages:', Object.keys(result.stageTally));
}

// ============================================================================
// Example 4: Branching Thoughts
// ============================================================================

function example4_branchingThoughts() {
  console.log('\n=== Example 4: Branching Thoughts ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();
  const service = new StructuredThinkingService(planner);

  // Main problem
  service.trackThoughts([
    {
      stage: 'problem_definition',
      thought: 'Need to reduce server costs',
      metadata: { branchId: 'main' },
    },
  ]);

  // Branch 1: Database optimization
  service.trackThoughts([
    {
      stage: 'research',
      thought: 'Investigate database query optimization',
      metadata: {
        branchId: 'db-optimization',
        branchFromThought: 1,
        qualityScore: 0.85,
      },
    },
    {
      stage: 'analysis',
      thought: 'Adding indexes could save 30% on DB costs',
      metadata: {
        branchId: 'db-optimization',
        qualityScore: 0.9,
      },
    },
  ]);

  // Branch 2: Caching strategy
  service.trackThoughts([
    {
      stage: 'research',
      thought: 'Most data is read-heavy, rarely changes',
      metadata: {
        branchId: 'caching',
        branchFromThought: 1,
        qualityScore: 0.9,
      },
    },
    {
      stage: 'analysis',
      thought: 'Aggressive caching could save 50% on compute',
      metadata: {
        branchId: 'caching',
        qualityScore: 0.95,
      },
    },
  ]);

  const result = service.trackThoughts([], false);

  console.log('\nBranch Insights:');
  result.branchInsights.forEach((branch) => {
    console.log(`\n${branch.branchId}:`);
    console.log('  - Thoughts:', branch.thoughtCount);
    console.log('  - Health:', branch.health);
    console.log('  - Avg Quality:', branch.averageQuality?.toFixed(2));
  });

  console.log('\nFeedback Signals:');
  result.feedbackSignals.forEach((signal) => {
    console.log(`- [${signal.severity}] ${signal.type}: ${signal.message}`);
  });
}

// ============================================================================
// Example 5: Filtering and Searching
// ============================================================================

function example5_filteringAndSearching() {
  console.log('\n=== Example 5: Filtering and Searching ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();
  const service = new StructuredThinkingService(planner);

  // Create diverse set of thoughts
  service.trackThoughts([
    {
      stage: 'problem_definition',
      thought: 'Performance issues in production API',
      metadata: { importance: 'high', tags: ['performance', 'api'] },
    },
    {
      stage: 'research',
      thought: 'Database queries taking 500ms average',
      metadata: { importance: 'high', tags: ['database', 'metrics'] },
    },
    {
      stage: 'research',
      thought: 'API endpoints timing out under load',
      metadata: { importance: 'medium', tags: ['api', 'performance'] },
    },
    {
      stage: 'analysis',
      thought: 'Missing indexes on user_events table',
      metadata: { importance: 'high', tags: ['database', 'solution'] },
    },
  ]);

  // Filter by stage
  console.log('\nResearch thoughts:');
  const researchThoughts = service.filterTimeline({ stage: 'research' });
  researchThoughts.forEach((t) => console.log(`- ${t.thought}`));

  // Filter by importance
  console.log('\nHigh importance thoughts:');
  const highPriority = service.filterTimeline({ importance: 'high' });
  console.log(`Found ${highPriority.length} high-priority thoughts`);

  // Filter by tags
  console.log('\nDatabase-related thoughts:');
  const dbThoughts = service.filterTimeline({ tags: ['database'] });
  dbThoughts.forEach((t) => console.log(`- ${t.thought}`));

  // Search by text
  console.log('\nThoughts mentioning "API":');
  const apiThoughts = service.filterTimeline({ textIncludes: 'API' });
  apiThoughts.forEach((t) => console.log(`- ${t.thought}`));

  // Complex filter
  console.log('\nHigh-priority database solutions:');
  const solutions = service.filterTimeline({
    importance: 'high',
    tags: ['database', 'solution'],
  });
  solutions.forEach((t) => console.log(`- ${t.thought}`));

  // Pagination
  console.log('\nFirst 2 thoughts:');
  const page1 = service.filterTimeline({ limit: 2 });
  page1.forEach((t, i) => console.log(`${i + 1}. ${t.thought}`));
}

// ============================================================================
// Example 6: Export and Import
// ============================================================================

function example6_exportImport() {
  console.log('\n=== Example 6: Export and Import ===\n');

  const planner1: ISQLitePlannerService = createMockPlanner();
  const service1 = new StructuredThinkingService(planner1);

  // Create thoughts in service 1
  const result1 = service1.trackThoughts([
    {
      stage: 'problem_definition',
      thought: 'Original thought',
      metadata: { importance: 'high', tags: ['export-test'] },
    },
    {
      stage: 'research',
      thought: 'Research finding',
      metadata: { importance: 'medium', tags: ['research'] },
    },
  ]);

  // Export as JSON
  console.log('Exporting as JSON...');
  const jsonExport = service1.exportThoughts(result1, {
    format: 'json',
    includeMetadata: true,
  });
  console.log('JSON size:', jsonExport.length, 'bytes');

  // Export as Markdown
  console.log('\nExporting as Markdown...');
  const mdExport = service1.exportThoughts(result1, {
    format: 'markdown',
    includeMetadata: true,
  });
  console.log('\nMarkdown Preview:\n');
  console.log(mdExport.substring(0, 300) + '...');

  // Import into new service
  const planner2: ISQLitePlannerService = createMockPlanner();
  const service2 = new StructuredThinkingService(planner2);

  console.log('\n\nImporting into new service...');
  const result2 = service2.importThoughts({
    format: 'json',
    content: jsonExport,
  });

  console.log('Imported thoughts:', result2.timeline.length);
  console.log('Metadata preserved:', result2.timeline[0].metadata?.tags);
}

// ============================================================================
// Example 7: Diagnostics and Reports
// ============================================================================

function example7_diagnosticsAndReports() {
  console.log('\n=== Example 7: Diagnostics and Reports ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();
  const service = new StructuredThinkingService(planner);

  // Create incomplete timeline (skip some stages)
  service.trackThoughts([
    { stage: 'problem_definition', thought: 'Define problem' },
    { stage: 'conclusion', thought: 'Jump to conclusion' },
  ]);

  const timeline = service.getTimeline();

  // Run diagnostics
  const diagnostics = service.diagnoseTimeline(timeline, {
    staleHours: 24,
  });

  console.log('Total thoughts:', diagnostics.totalThoughts);
  console.log('Stage coverage:', diagnostics.stageCoverage);
  console.log('Missing stages:', diagnostics.missingStages);
  console.log('Tag cloud:', diagnostics.tagCloud);

  // Generate markdown report
  const report = service.generateReport(timeline, {
    format: 'markdown',
    includeTimeline: true,
    maxEntries: 50,
  });

  console.log('\nReport generated:', report.format);
  console.log('Report size:', report.content.length, 'chars');
  console.log('\nReport preview:\n');
  console.log(report.content.substring(0, 300) + '...');
}

// ============================================================================
// Example 8: Thought Revisions
// ============================================================================

function example8_thoughtRevisions() {
  console.log('\n=== Example 8: Thought Revisions ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();
  const service = new StructuredThinkingService(planner);

  // Create initial thought
  const initial = service.trackThoughts([
    {
      stage: 'problem_definition',
      thought: 'Initial problem statement',
      metadata: { importance: 'medium' },
    },
  ]);

  console.log('Original thought:');
  console.log(`- "${initial.timeline[0].thought}"`);
  console.log(`- Importance: ${initial.timeline[0].metadata?.importance}`);

  // Revise the thought
  const thoughtId = initial.timeline[0].id;
  const revised = service.reviseThought(thoughtId, {
    thought: 'Refined problem statement with more clarity',
    metadata: {
      importance: 'high',
      isRevision: true,
      revisesThought: 1,
    },
  });

  console.log('\nRevised thought:');
  const revisedThought = revised.timeline.find((t) => t.id === thoughtId);
  console.log(`- "${revisedThought?.thought}"`);
  console.log(`- Importance: ${revisedThought?.metadata?.importance}`);
  console.log(`- Is Revision: ${revisedThought?.metadata?.isRevision}`);
}

// ============================================================================
// Example 9: Multi-Planner Pattern (itjsst-mcp style)
// ============================================================================

function example9_multiPlannerPattern() {
  console.log('\n=== Example 9: Multi-Planner Pattern ===\n');

  class StructuredThinkingManager {
    private readonly services = new Map<string, StructuredThinkingService>();
    private readonly defaultDbPath: string;

    constructor(defaultDbPath: string) {
      this.defaultDbPath = defaultDbPath;
    }

    private getService(key: string): StructuredThinkingService {
      if (!this.services.has(key)) {
        const planner = createMockPlanner();
        const service = new StructuredThinkingService(planner, {
          enableCache: true,
          cacheTTL: 60000,
        });
        this.services.set(key, service);
      }
      return this.services.get(key)!;
    }

    trackThoughts(
      entries: ThoughtEntry[],
      plannerKey = 'default',
      autoNumbering = true
    ) {
      return this.getService(plannerKey).trackThoughts(entries, autoNumbering);
    }

    getTimeline(plannerKey = 'default') {
      return this.getService(plannerKey).getTimeline();
    }
  }

  // Usage
  const manager = new StructuredThinkingManager('/path/to/db');

  // Track thoughts in different planners
  manager.trackThoughts(
    [{ stage: 'research', thought: 'User context research' }],
    'user-123'
  );

  manager.trackThoughts(
    [{ stage: 'research', thought: 'Project context research' }],
    'project-456'
  );

  console.log('User timeline:', manager.getTimeline('user-123').length);
  console.log('Project timeline:', manager.getTimeline('project-456').length);
}

// ============================================================================
// Example 10: Performance Monitoring
// ============================================================================

function example10_performanceMonitoring() {
  console.log('\n=== Example 10: Performance Monitoring ===\n');

  const planner: ISQLitePlannerService = createMockPlanner();
  const service = new StructuredThinkingService(planner, {
    enableCache: true,
    cacheTTL: 60000,
    maxCacheSize: 1000,
  });

  // Track some thoughts
  service.trackThoughts([
    { stage: 'research', thought: 'Research item 1' },
    { stage: 'research', thought: 'Research item 2' },
    { stage: 'analysis', thought: 'Analysis item 1' },
  ]);

  // Simulate multiple operations
  const timeline = service.getTimeline();
  for (let i = 0; i < 10; i++) {
    service.summarizeTimeline(timeline);
  }

  // Check cache performance
  const stats = service.getCacheStats();

  console.log('Cache Performance:');
  console.log(`- Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`- Total Hits: ${stats.hits}`);
  console.log(`- Total Misses: ${stats.misses}`);
  console.log(`- Cache Size: ${stats.size}/${stats.maxSize}`);
  console.log(`- Evictions: ${stats.evictions}`);

  // Periodic monitoring (in real app)
  console.log('\nExample periodic monitoring:');
  console.log('setInterval(() => {');
  console.log('  const stats = service.getCacheStats();');
  console.log('  logger.info("Cache stats", stats);');
  console.log('}, 300000); // Every 5 minutes');
}

// ============================================================================
// Helper: Create Mock Planner
// ============================================================================

function createMockPlanner(): ISQLitePlannerService {
  const timeline: ThoughtRecord[] = [];

  return {
    getDatabasePath: () => ':memory:',
    getTimeline: () => [...timeline],
    replaceTimeline: (newTimeline) => {
      timeline.length = 0;
      timeline.push(...newTimeline);
    },
    appendThought: (record) => {
      timeline.push(record);
    },
    refreshMarkdownCache: async () => {
      // Mock implementation
    },
  };
}

// ============================================================================
// Run Examples
// ============================================================================

function runAllExamples() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  @mcp-bundle/structured-thinking Usage Examples       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  example1_basicUsage();
  example2_withCaching();
  example3_customFramework();
  example4_branchingThoughts();
  example5_filteringAndSearching();
  example6_exportImport();
  example7_diagnosticsAndReports();
  example8_thoughtRevisions();
  example9_multiPlannerPattern();
  example10_performanceMonitoring();

  console.log('\n\n✅ All examples completed!\n');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

// Export for use in other examples
export {
  example1_basicUsage,
  example2_withCaching,
  example3_customFramework,
  example4_branchingThoughts,
  example5_filteringAndSearching,
  example6_exportImport,
  example7_diagnosticsAndReports,
  example8_thoughtRevisions,
  example9_multiPlannerPattern,
  example10_performanceMonitoring,
  createMockPlanner,
};
