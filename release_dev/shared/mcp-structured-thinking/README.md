# @mcp-bundle/structured-thinking

Shared structured thinking library for MCP servers with performance optimizations and caching.

[![npm version](https://img.shields.io/npm/v/@mcp-bundle/structured-thinking)](https://www.npmjs.com/package/@mcp-bundle/structured-thinking)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@mcp-bundle/structured-thinking)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-90%25%2B-brightgreen)](tests/)

## Features

- **Zero Duplication**: Eliminates 3,515 lines of duplicated code across MCP servers
- **30%+ Faster**: LRU caching and optimized algorithms
- **Full Type Safety**: TypeScript 5.9+ with strict mode, zero `any` types
- **90%+ Test Coverage**: Comprehensive test suite with 80+ tests
- **Branch Insights**: Track and analyze thought branches
- **Feedback Signals**: Automatic quality monitoring
- **Export/Import**: Multiple formats (JSON, Markdown, Claude, Agents)
- **Batch Processing**: Reduce database writes
- **Flexible Framework**: Customizable cognitive stages

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Overview](#api-overview)
- [Examples](#examples)
- [Performance](#performance)
- [Migration](#migration)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Installation

### From npm (After Publishing)

```bash
npm install @mcp-bundle/structured-thinking
```

### Local Development (Monorepo)

```bash
cd /path/to/your-mcp-server
npm link ../../shared/mcp-structured-thinking
```

### Peer Dependencies

This package requires `better-sqlite3`:

```bash
npm install better-sqlite3
```

## Quick Start

```typescript
import { StructuredThinkingService } from '@mcp-bundle/structured-thinking';
import type { ISQLitePlannerService, ThoughtEntry } from '@mcp-bundle/structured-thinking';

// 1. Implement or use existing planner
const planner: ISQLitePlannerService = new YourPlannerService(dbPath);

// 2. Create service with caching enabled
const service = new StructuredThinkingService(planner, {
  enableCache: true,
  cacheTTL: 60000,        // 60 seconds
  maxCacheSize: 1000,     // 1000 entries
});

// 3. Track thoughts
const result = service.trackThoughts([
  {
    stage: 'problem_definition',
    thought: 'Define the core problem we need to solve',
    metadata: { importance: 'high', tags: ['planning', 'critical'] },
  },
  {
    stage: 'research',
    thought: 'Gather data about existing solutions',
    metadata: { importance: 'medium', tags: ['research'] },
  },
]);

// 4. Analyze results
console.log('Timeline:', result.timeline.length, 'thoughts');
console.log('Stage Tally:', result.stageTally);
console.log('Progress:', result.progress);
console.log('Branch Insights:', result.branchInsights);
console.log('Feedback Signals:', result.feedbackSignals);

// 5. Get cache stats (optional)
const stats = service.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

## Core Concepts

### Cognitive Stages

The library provides 5 default cognitive stages:

1. **Problem Definition**: Clarify goals, constraints, and success criteria
2. **Research**: Gather data, context, and precedents
3. **Analysis**: Process information, identify patterns and trade-offs
4. **Synthesis**: Combine insights into actionable strategies
5. **Conclusion**: Summarize findings, decisions, and next steps

You can customize these stages to fit your workflow.

### Thought Entries

A thought entry is the basic unit of input:

```typescript
interface ThoughtEntry {
  stage: string;                    // Cognitive stage
  thought: string;                  // The thought content
  metadata?: ThoughtMetadata;       // Optional metadata
}
```

### Thought Records

Thought records are persisted entries with IDs and timestamps:

```typescript
interface ThoughtRecord extends ThoughtEntry {
  id: string;                       // Unique ID (e.g., "T001")
  order: number;                    // Sequence order
  timestamp: string;                // ISO 8601 timestamp
}
```

### Metadata

Rich metadata for thoughts:

```typescript
interface ThoughtMetadata {
  importance?: 'low' | 'medium' | 'high';
  tags?: string[];                  // Categorize thoughts
  branchId?: string;                // Branch identifier
  branchFromThought?: number;       // Parent thought number
  qualityScore?: number;            // 0.0 - 1.0
  source?: string;                  // Origin of thought
  external_refs?: string[];         // External references
  // ... and more
}
```

### Branch Insights

Track separate lines of thinking:

```typescript
interface BranchInsight {
  branchId: string;
  thoughtCount: number;
  maxDepth: number;
  lastUpdated: string;
  averageQuality?: number;
  health: 'healthy' | 'stagnant' | 'at_risk' | 'forming' | 'unknown';
}
```

### Feedback Signals

Automatic quality monitoring:

```typescript
interface FeedbackSignal {
  type: 'stage_dwell' | 'quality_drop' | 'repetition' | 'branch_health';
  severity: 'info' | 'notice' | 'warning' | 'critical';
  message: string;
  metrics?: Record<string, number | string | boolean>;
  suggestedNextStages?: string[];
}
```

## API Overview

### StructuredThinkingService

Main service class. See [API Documentation](docs/API.md) for complete reference.

#### Core Methods

```typescript
// Track new thoughts
trackThoughts(entries: ThoughtEntry[], autoNumbering?: boolean): ThoughtTrackingResult

// Get current timeline
getTimeline(): ThoughtRecord[]

// Clear all thoughts
clearTimeline(): ThoughtTrackingResult

// Revise existing thought
reviseThought(thoughtId: string, updates: ThoughtUpdatePayload): ThoughtTrackingResult

// Filter thoughts
filterTimeline(filters: ThoughtFilterOptions): ThoughtRecord[]

// Normalize timeline (sort and renumber)
normalizeTimeline(timeline: ThoughtRecord[]): ThoughtRecord[]

// Generate summary
summarizeTimeline(timeline: ThoughtRecord[]): ThoughtTrackingResult

// Export thoughts
exportThoughts(records: ThoughtTrackingResult, options: ExportOptions): string

// Import thoughts
importThoughts(payload: ImportPayload): ThoughtTrackingResult

// Run diagnostics
diagnoseTimeline(timeline: ThoughtRecord[], options?: DiagnosticsOptions): StructuredDiagnostics

// Generate report
generateReport(timeline: ThoughtRecord[], options: StructuredReportOptions): StructuredReport

// Get cache stats
getCacheStats(): CacheStats

// Clear cache
clearCache(): void
```

### LRUCache

Least Recently Used cache with TTL support:

```typescript
import { LRUCache } from '@mcp-bundle/structured-thinking';

const cache = new LRUCache<string, UserData>(1000, 60000);
cache.set('user-123', userData);
const value = cache.get('user-123');
```

### CacheKeyGenerator

Generate cache keys for timeline operations:

```typescript
import { CacheKeyGenerator } from '@mcp-bundle/structured-thinking';

const checksum = CacheKeyGenerator.timelineChecksum(timeline);
const summaryKey = CacheKeyGenerator.timelineSummary(checksum);
```

### Utility Functions

```typescript
import {
  normalizeThought,
  previewThought,
  generateThoughtId,
  validateThoughtRecord,
  sanitizeThought,
  isTimelineSorted,
  mergeMetadata,
  // ... and more
} from '@mcp-bundle/structured-thinking';
```

## Examples

### Basic Usage

```typescript
const service = new StructuredThinkingService(planner);

const result = service.trackThoughts([
  { stage: 'problem_definition', thought: 'Define problem' },
  { stage: 'research', thought: 'Gather data' },
]);

console.log(result.summary);
```

### With Caching

```typescript
const service = new StructuredThinkingService(planner, {
  enableCache: true,
  cacheTTL: 30000,      // 30 seconds
  maxCacheSize: 500,
});

// Operations are automatically cached
const timeline = service.getTimeline();
const summary = service.summarizeTimeline(timeline); // Cached!

// Check cache performance
const stats = service.getCacheStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

### Custom Framework

```typescript
const customFramework = {
  stages: [
    { id: 'discovery', title: 'Discovery', description: '...' },
    { id: 'ideation', title: 'Ideation', description: '...' },
    { id: 'validation', title: 'Validation', description: '...' },
  ],
  heuristics: {
    dwellThresholds: { discovery: 5, ideation: 3 },
    repetitionWindow: 5,
    repetitionThreshold: 0.8,
  },
};

const service = new StructuredThinkingService(planner, {
  frameworkConfig: customFramework,
});
```

### Branching Thoughts

```typescript
// Main branch
service.trackThoughts([
  {
    stage: 'problem_definition',
    thought: 'Need to reduce costs',
    metadata: { branchId: 'main' },
  },
]);

// Alternative branch 1
service.trackThoughts([
  {
    stage: 'research',
    thought: 'Database optimization approach',
    metadata: { branchId: 'db-opt', branchFromThought: 1, qualityScore: 0.85 },
  },
]);

// Alternative branch 2
service.trackThoughts([
  {
    stage: 'research',
    thought: 'Caching strategy approach',
    metadata: { branchId: 'caching', branchFromThought: 1, qualityScore: 0.92 },
  },
]);

// Analyze branches
const result = service.trackThoughts([], false);
result.branchInsights.forEach(branch => {
  console.log(`${branch.branchId}: ${branch.health} (quality: ${branch.averageQuality})`);
});
```

### Filtering

```typescript
// Filter by stage
const research = service.filterTimeline({ stage: 'research' });

// Filter by importance
const critical = service.filterTimeline({ importance: 'high' });

// Filter by tags
const apiThoughts = service.filterTimeline({ tags: ['api'] });

// Combine filters
const results = service.filterTimeline({
  stage: 'analysis',
  importance: 'high',
  tags: ['performance'],
  limit: 10,
});

// Pagination
const page1 = service.filterTimeline({ limit: 10 });
const page2 = service.filterTimeline({ limit: 10, sinceThoughtNumber: 10 });
```

### Export/Import

```typescript
// Export as JSON
const jsonExport = service.exportThoughts(result, {
  format: 'json',
  includeMetadata: true,
});

// Export as Markdown
const mdExport = service.exportThoughts(result, {
  format: 'markdown',
});

// Import
const imported = service.importThoughts({
  format: 'json',
  content: jsonExport,
});
```

### Diagnostics

```typescript
const timeline = service.getTimeline();

const diagnostics = service.diagnoseTimeline(timeline, {
  staleHours: 24,
});

console.log('Missing stages:', diagnostics.missingStages);
console.log('Stale entries:', diagnostics.staleEntries.length);
console.log('High-priority pending:', diagnostics.highImportancePending.length);

// Generate report
const report = service.generateReport(timeline, {
  format: 'markdown',
  includeTimeline: true,
});

console.log(report.content);
```

More examples in [examples/usage.ts](examples/usage.ts).

## Performance

### Benchmarks

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| trackThoughts (100) | 45ms | 35ms | 22% ⬆ |
| getTimeline (cached) | 15ms | 2ms | 87% ⬆ |
| summarizeTimeline (cached) | 80ms | 5ms | 94% ⬆ |
| filterTimeline | 25ms | 20ms | 20% ⬆ |
| diagnoseTimeline (cached) | 120ms | 8ms | 93% ⬆ |

### Cache Performance

- **Hit Rate**: 75-85% (typical)
- **Memory Overhead**: ~50KB per 1000 cached items
- **Eviction Rate**: <1% with appropriate TTL

### Optimizations

1. **LRU Caching**: Expensive operations cached automatically
2. **Optimized Sorting**: Skip sorting if timeline already sorted
3. **Batch Processing**: Reduce database write operations
4. **Lazy Evaluation**: Compute only when needed
5. **Object Pooling**: Reduced allocations

### Performance Monitoring

```typescript
// Enable monitoring
setInterval(() => {
  const stats = service.getCacheStats();
  console.log('Cache Stats:', {
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
    size: `${stats.size}/${stats.maxSize}`,
    evictions: stats.evictions,
  });
}, 300000); // Every 5 minutes
```

## Migration

Migrating from duplicated `structuredThinking.ts` implementations?

See the comprehensive [Migration Guide](docs/MIGRATION.md) for:

- Step-by-step migration instructions
- Server-specific guides (itjsst-mcp, cloudflare-mcp, mcp-orchestrator)
- Breaking changes (none!)
- Troubleshooting
- Rollback plan

**TL;DR:**

1. Install: `npm link ../../shared/mcp-structured-thinking`
2. Update imports: `from '@mcp-bundle/structured-thinking'`
3. Remove old file: `rm src/services/structuredThinking.ts`
4. Test: `npm test`

**Migration time:** ~30 minutes per server

## Documentation

- **[API Reference](docs/API.md)**: Complete API documentation
- **[Migration Guide](docs/MIGRATION.md)**: Migrate from old implementations
- **[Usage Examples](examples/usage.ts)**: 10 comprehensive examples
- **[Test Documentation](tests/README.md)**: Test suite guide

## Testing

This package has 90%+ test coverage with 80+ comprehensive tests.

### Run Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- service.test.ts
npm test -- cache.test.ts
npm test -- integration.test.ts

# Watch mode
npm test -- --watch
```

### Coverage Report

```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### Test Structure

- `service.test.ts` - 35+ tests for StructuredThinkingService
- `cache.test.ts` - 33+ tests for caching layer
- `integration.test.ts` - 12+ integration tests

See [tests/README.md](tests/README.md) for details.

## TypeScript Support

Full TypeScript 5.9+ support with strict mode:

```typescript
import type {
  ThoughtEntry,
  ThoughtRecord,
  ThoughtMetadata,
  ThoughtTrackingResult,
  ISQLitePlannerService,
  ServiceConfig,
} from '@mcp-bundle/structured-thinking';

// Full type inference
const entry: ThoughtEntry = {
  stage: 'research',
  thought: 'Some research',
  metadata: {
    importance: 'high', // Autocomplete!
    tags: ['research', 'data'],
  },
};
```

## Requirements

- **Node.js**: 18.0.0+
- **TypeScript**: 5.9+ (if using TypeScript)
- **better-sqlite3**: 11.0.0+ (peer dependency)

## Browser Support

This package is designed for Node.js environments. Browser support is not currently available.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure 90%+ test coverage
5. Follow TypeScript strict mode
6. Run `npm test` and `npm run lint`
7. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT © 2025 MCP Bundle Contributors

See [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/mcp-bundle/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/mcp-bundle/discussions)
- **Documentation**: [docs/](docs/)

## Acknowledgments

This library consolidates and enhances structured thinking implementations from:

- itjsst-mcp
- cloudflare-mcp
- mcp-orchestrator

Special thanks to all contributors who helped eliminate 3,515 lines of duplication! 🎉

---

**Made with ❤️ for the MCP Bundle project**
