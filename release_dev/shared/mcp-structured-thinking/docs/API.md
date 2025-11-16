# API Documentation

Complete API reference for `@mcp-bundle/structured-thinking` v2.0.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Classes](#core-classes)
  - [StructuredThinkingService](#structuredthinkingservice)
  - [LRUCache](#lrucache)
  - [CacheKeyGenerator](#cachekeygenerator)
  - [BatchProcessor](#batchprocessor)
- [Type Definitions](#type-definitions)
- [Utility Functions](#utility-functions)
- [Constants](#constants)

---

## Installation

```bash
npm install @mcp-bundle/structured-thinking
```

### Peer Dependencies

This package requires `better-sqlite3` as a peer dependency:

```bash
npm install better-sqlite3
```

---

## Quick Start

```typescript
import { StructuredThinkingService } from '@mcp-bundle/structured-thinking';
import type { ISQLitePlannerService } from '@mcp-bundle/structured-thinking';

// Your planner implementation
const planner: ISQLitePlannerService = new YourPlannerService();

// Create service
const service = new StructuredThinkingService(planner, {
  enableCache: true,
  cacheTTL: 60000, // 60 seconds
  maxCacheSize: 1000,
});

// Track thoughts
const result = service.trackThoughts([
  {
    stage: 'problem_definition',
    thought: 'Define the core problem',
    metadata: { importance: 'high', tags: ['planning'] },
  },
]);

console.log(result.summary);
```

---

## Core Classes

### StructuredThinkingService

The main service class for structured thinking operations.

#### Constructor

```typescript
constructor(
  planner: ISQLitePlannerService,
  config?: Partial<ServiceConfig>
)
```

**Parameters:**

- `planner` - Implementation of `ISQLitePlannerService` for persistence
- `config` - Optional configuration object

**Config Options:**

```typescript
interface ServiceConfig {
  databasePath: string;
  frameworkConfig?: StageFrameworkConfig;
  enableCache?: boolean;        // Default: false
  cacheTTL?: number;            // Default: 60000 (60s)
  maxCacheSize?: number;        // Default: 1000
}
```

**Example:**

```typescript
const service = new StructuredThinkingService(planner, {
  enableCache: true,
  cacheTTL: 30000, // 30 seconds
  maxCacheSize: 500,
  frameworkConfig: {
    stages: customStages,
    transitions: customTransitions,
    heuristics: customHeuristics,
  },
});
```

#### Methods

##### trackThoughts()

Track new thoughts and get comprehensive results.

```typescript
trackThoughts(
  entries: ThoughtEntry[],
  autoNumbering?: boolean
): ThoughtTrackingResult
```

**Parameters:**

- `entries` - Array of thoughts to track
- `autoNumbering` - Enable automatic thought numbering (default: `true`)

**Returns:** `ThoughtTrackingResult`

**Example:**

```typescript
const result = service.trackThoughts([
  {
    stage: 'problem_definition',
    thought: 'Identify performance bottleneck',
    metadata: {
      importance: 'high',
      tags: ['performance', 'critical'],
      branchId: 'perf-optimization',
    },
  },
  {
    stage: 'research',
    thought: 'Database queries account for 70% of response time',
    metadata: {
      importance: 'high',
      tags: ['database', 'metrics'],
      branchId: 'perf-optimization',
    },
  },
]);

console.log(result.timeline.length); // 2
console.log(result.stageTally); // { problem_definition: 1, research: 1 }
console.log(result.summary); // Formatted summary text
```

##### getTimeline()

Get the current thought timeline.

```typescript
getTimeline(): ThoughtRecord[]
```

**Returns:** Array of `ThoughtRecord`

**Example:**

```typescript
const timeline = service.getTimeline();
console.log(timeline.length);
```

##### clearTimeline()

Clear all thoughts from the timeline.

```typescript
clearTimeline(): ThoughtTrackingResult
```

**Returns:** Empty `ThoughtTrackingResult`

**Example:**

```typescript
const result = service.clearTimeline();
console.log(result.timeline.length); // 0
```

##### reviseThought()

Revise an existing thought.

```typescript
reviseThought(
  thoughtId: string,
  updates: ThoughtUpdatePayload
): ThoughtTrackingResult
```

**Parameters:**

- `thoughtId` - ID of the thought to revise
- `updates` - Updates to apply

**Returns:** Updated `ThoughtTrackingResult`

**Throws:** Error if thought ID not found

**Example:**

```typescript
const timeline = service.getTimeline();
const firstId = timeline[0].id;

const result = service.reviseThought(firstId, {
  thought: 'Revised problem statement with more clarity',
  metadata: {
    importance: 'critical',
    isRevision: true,
    revisesThought: 1,
  },
});
```

##### filterTimeline()

Filter thoughts by various criteria.

```typescript
filterTimeline(filters: ThoughtFilterOptions): ThoughtRecord[]
```

**Parameters:**

```typescript
interface ThoughtFilterOptions {
  stage?: string;
  branchId?: string;
  tags?: readonly string[];
  importance?: 'low' | 'medium' | 'high';
  textIncludes?: string;
  limit?: number;
  sinceThoughtNumber?: number;
}
```

**Returns:** Filtered array of `ThoughtRecord`

**Example:**

```typescript
// Filter by stage
const research = service.filterTimeline({ stage: 'research' });

// Filter by importance
const highPriority = service.filterTimeline({ importance: 'high' });

// Filter by tags
const dbThoughts = service.filterTimeline({ tags: ['database'] });

// Filter by text
const apiThoughts = service.filterTimeline({ textIncludes: 'API' });

// Combine filters
const filtered = service.filterTimeline({
  stage: 'analysis',
  importance: 'high',
  tags: ['performance'],
  limit: 10,
});

// Pagination
const page2 = service.filterTimeline({
  limit: 10,
  sinceThoughtNumber: 10,
});
```

##### normalizeTimeline()

Normalize a timeline (sort and renumber).

```typescript
normalizeTimeline(timeline: ThoughtRecord[]): ThoughtRecord[]
```

**Parameters:**

- `timeline` - Timeline to normalize

**Returns:** Normalized timeline

**Example:**

```typescript
const timeline = service.getTimeline();
const normalized = service.normalizeTimeline(timeline);
// Timeline is now sorted by order and timestamps
```

##### summarizeTimeline()

Generate comprehensive summary of a timeline.

```typescript
summarizeTimeline(timeline: ThoughtRecord[]): ThoughtTrackingResult
```

**Parameters:**

- `timeline` - Timeline to summarize

**Returns:** `ThoughtTrackingResult` with analytics

**Example:**

```typescript
const timeline = service.getTimeline();
const summary = service.summarizeTimeline(timeline);

console.log(summary.stageTally);
console.log(summary.tags);
console.log(summary.importanceBreakdown);
console.log(summary.progress);
console.log(summary.branchInsights);
console.log(summary.feedbackSignals);
```

##### exportThoughts()

Export thoughts to various formats.

```typescript
exportThoughts(
  records: ThoughtTrackingResult,
  options: ExportOptions
): string
```

**Parameters:**

```typescript
interface ExportOptions {
  format: 'json' | 'jsonb' | 'markdown' | 'claude' | 'agents';
  includeMetadata?: boolean;
}
```

**Returns:** Serialized string

**Example:**

```typescript
const result = service.trackThoughts(thoughts);

// Export as JSON
const json = service.exportThoughts(result, {
  format: 'json',
  includeMetadata: true,
});

// Export as Markdown
const markdown = service.exportThoughts(result, {
  format: 'markdown',
});

// Export as JSONB (binary JSON)
const jsonb = service.exportThoughts(result, {
  format: 'jsonb',
  includeMetadata: true,
});

// Export as Claude format
const claude = service.exportThoughts(result, {
  format: 'claude',
});

// Export as Agents format
const agents = service.exportThoughts(result, {
  format: 'agents',
});
```

##### importThoughts()

Import thoughts from exported data.

```typescript
importThoughts(payload: ImportPayload): ThoughtTrackingResult
```

**Parameters:**

```typescript
interface ImportPayload {
  format: 'json' | 'jsonb' | 'markdown' | 'claude' | 'agents';
  content: string;
}
```

**Returns:** `ThoughtTrackingResult`

**Throws:** Error if format invalid or parsing fails

**Example:**

```typescript
// Import from JSON
const result = service.importThoughts({
  format: 'json',
  content: jsonString,
});

// Import from Markdown
const result2 = service.importThoughts({
  format: 'markdown',
  content: markdownString,
});
```

##### diagnoseTimeline()

Run diagnostics on a timeline.

```typescript
diagnoseTimeline(
  timeline: ThoughtRecord[],
  options?: DiagnosticsOptions
): StructuredDiagnostics
```

**Parameters:**

```typescript
interface DiagnosticsOptions {
  staleHours?: number; // Default: 24
}
```

**Returns:** `StructuredDiagnostics`

**Example:**

```typescript
const timeline = service.getTimeline();
const diagnostics = service.diagnoseTimeline(timeline, {
  staleHours: 48,
});

console.log(diagnostics.stageCoverage);
console.log(diagnostics.missingStages);
console.log(diagnostics.staleEntries);
console.log(diagnostics.highImportancePending);
console.log(diagnostics.tagCloud);
```

##### generateReport()

Generate a comprehensive report.

```typescript
generateReport(
  timeline: ThoughtRecord[],
  options: StructuredReportOptions
): StructuredReport
```

**Parameters:**

```typescript
interface StructuredReportOptions {
  format: 'markdown' | 'json';
  includeTimeline?: boolean;
  maxEntries?: number;
  staleHours?: number;
}
```

**Returns:** `StructuredReport`

**Example:**

```typescript
const timeline = service.getTimeline();

// Markdown report
const report = service.generateReport(timeline, {
  format: 'markdown',
  includeTimeline: true,
  maxEntries: 100,
});

console.log(report.content); // Formatted markdown
console.log(report.diagnostics);

// JSON report
const jsonReport = service.generateReport(timeline, {
  format: 'json',
  includeTimeline: false,
});
```

##### getCacheStats()

Get cache statistics.

```typescript
getCacheStats(): {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}
```

**Returns:** Cache statistics object

**Example:**

```typescript
const stats = service.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
```

##### clearCache()

Clear all cache entries.

```typescript
clearCache(): void
```

**Example:**

```typescript
service.clearCache();
const stats = service.getCacheStats();
console.log(stats.size); // 0
```

---

### LRUCache

Least Recently Used cache with TTL support.

#### Constructor

```typescript
constructor(
  maxSize?: number,    // Default: 1000
  defaultTTL?: number  // Default: 60000 (60s)
)
```

**Example:**

```typescript
import { LRUCache } from '@mcp-bundle/structured-thinking';

const cache = new LRUCache<string, UserData>(500, 30000);
```

#### Methods

##### get()

Get value from cache.

```typescript
get(key: K): V | undefined
```

**Example:**

```typescript
const value = cache.get('user-123');
if (value) {
  console.log('Cache hit:', value);
} else {
  console.log('Cache miss');
}
```

##### set()

Set value in cache.

```typescript
set(key: K, value: V, ttl?: number): void
```

**Example:**

```typescript
// Use default TTL
cache.set('user-123', userData);

// Custom TTL (10 seconds)
cache.set('session-456', sessionData, 10000);
```

##### has()

Check if key exists (and not expired).

```typescript
has(key: K): boolean
```

**Example:**

```typescript
if (cache.has('user-123')) {
  console.log('Key exists');
}
```

##### delete()

Delete entry from cache.

```typescript
delete(key: K): boolean
```

**Example:**

```typescript
const deleted = cache.delete('user-123');
console.log(deleted); // true if existed, false otherwise
```

##### clear()

Clear all entries.

```typescript
clear(): void
```

##### cleanup()

Remove expired entries.

```typescript
cleanup(): number
```

**Returns:** Number of entries removed

**Example:**

```typescript
const removed = cache.cleanup();
console.log(`Removed ${removed} expired entries`);
```

##### getStats()

Get cache statistics.

```typescript
getStats(): {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}
```

##### resetStats()

Reset hit/miss/eviction counters.

```typescript
resetStats(): void
```

---

### CacheKeyGenerator

Static utility for generating cache keys.

#### Methods

##### timelineSummary()

```typescript
static timelineSummary(checksum: string): string
```

##### diagnostics()

```typescript
static diagnostics(
  checksum: string,
  options: { staleHours?: number }
): string
```

##### filteredTimeline()

```typescript
static filteredTimeline(
  checksum: string,
  filters: ThoughtFilterOptions
): string
```

##### normalizedTimeline()

```typescript
static normalizedTimeline(checksum: string): string
```

##### timelineChecksum()

```typescript
static timelineChecksum(
  timeline: readonly { id: string; timestamp: string }[]
): string
```

**Example:**

```typescript
import { CacheKeyGenerator } from '@mcp-bundle/structured-thinking';

const timeline = service.getTimeline();
const checksum = CacheKeyGenerator.timelineChecksum(timeline);
const summaryKey = CacheKeyGenerator.timelineSummary(checksum);

const cached = cache.get(summaryKey);
```

---

### BatchProcessor

Batch processor for reducing database writes.

#### Constructor

```typescript
constructor(
  processor: (batch: T[]) => Promise<void>,
  options?: {
    batchSize?: number;   // Default: 100
    batchDelay?: number;  // Default: 1000 (1s)
  }
)
```

**Example:**

```typescript
import { BatchProcessor } from '@mcp-bundle/structured-thinking';

const processor = new BatchProcessor<ThoughtRecord>(
  async (batch) => {
    await database.insertBatch(batch);
  },
  { batchSize: 50, batchDelay: 500 }
);
```

#### Methods

##### add()

Add item to batch queue.

```typescript
add(item: T): void
```

**Example:**

```typescript
processor.add(thoughtRecord);
```

##### flush()

Manually flush pending items.

```typescript
async flush(): Promise<void>
```

**Example:**

```typescript
await processor.flush();
```

##### getQueueSize()

Get current queue size.

```typescript
getQueueSize(): number
```

---

## Type Definitions

### Core Types

#### ThoughtEntry

```typescript
interface ThoughtEntry {
  readonly stage: string;
  readonly thought: string;
  readonly metadata?: ThoughtMetadata;
}
```

#### ThoughtRecord

```typescript
interface ThoughtRecord {
  readonly id: string;
  readonly stage: string;
  readonly order: number;
  readonly thought: string;
  readonly timestamp: string;
  readonly metadata?: ThoughtMetadata;
}
```

#### ThoughtMetadata

```typescript
interface ThoughtMetadata {
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
```

#### ThoughtTrackingResult

```typescript
interface ThoughtTrackingResult {
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
```

### Additional Types

See full type definitions in `src/types.ts`.

---

## Utility Functions

### normalizeThought()

Normalize thought text for comparison.

```typescript
function normalizeThought(content: string): string
```

### previewThought()

Create preview of thought (truncated).

```typescript
function previewThought(content: string, length?: number): string
```

### generateThoughtId()

Generate unique thought ID.

```typescript
function generateThoughtId(order: number): string
```

**Example:**

```typescript
const id = generateThoughtId(5); // "T005"
```

### validateThoughtRecord()

Validate thought record structure.

```typescript
function validateThoughtRecord(record: ThoughtRecord): boolean
```

### sanitizeThought()

Remove dangerous content from thought text.

```typescript
function sanitizeThought(thought: string): string
```

### Other Utilities

- `deepClone<T>(obj: T): T`
- `isTimelineSorted(timeline: ThoughtRecord[]): boolean`
- `mergeMetadata(base, updates): ThoughtMetadata`
- `calculatePercentage(value, total): number`
- `formatTimestamp(isoString): string`
- `parseTimestamp(isoString): number`
- `isStale(timestamp, staleHours): boolean`
- `unique<T>(array: T[]): T[]`
- `groupBy<T, K>(array, keyFn): Record<K, T[]>`
- `sortObjectKeys<T>(obj: T): T`

---

## Constants

### DEFAULT_STAGES

Array of default cognitive stages:

```typescript
const DEFAULT_STAGES: readonly StageDescriptor[] = [
  {
    id: 'problem_definition',
    title: 'Problem Definition',
    description: 'Clarify the goal, constraints...',
    guidingQuestions: [...],
    exampleActivities: [...],
  },
  // ... 4 more stages
];
```

### REPETITION_NORMALISATION_REGEX

Regex for repetition detection:

```typescript
const REPETITION_NORMALISATION_REGEX = /[\s\n\r]+/g;
```

---

## Advanced Usage

### Custom Stage Framework

```typescript
import { StructuredThinkingService } from '@mcp-bundle/structured-thinking';

const customFramework = {
  stages: [
    {
      id: 'discovery',
      title: 'Discovery',
      description: 'Discover the problem space',
    },
    {
      id: 'ideation',
      title: 'Ideation',
      description: 'Generate ideas',
    },
  ],
  transitions: [
    {
      from: 'discovery',
      to: ['ideation', 'research'],
      prompt: 'Ready to ideate?',
    },
  ],
  heuristics: {
    dwellThresholds: { discovery: 5, ideation: 3 },
    rollingWindow: 3,
    repetitionWindow: 5,
    repetitionThreshold: 0.8,
  },
};

const service = new StructuredThinkingService(planner, {
  frameworkConfig: customFramework,
});
```

### Performance Monitoring

```typescript
const service = new StructuredThinkingService(planner, {
  enableCache: true,
  cacheTTL: 30000,
});

// Track performance
setInterval(() => {
  const stats = service.getCacheStats();
  console.log(`Cache performance:`, {
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
    size: `${stats.size}/${stats.maxSize}`,
    evictions: stats.evictions,
  });
}, 60000);
```

### Batch Processing

```typescript
import { BatchProcessor } from '@mcp-bundle/structured-thinking';

const batcher = new BatchProcessor<ThoughtRecord>(
  async (batch) => {
    console.log(`Processing ${batch.length} thoughts`);
    await database.bulkInsert(batch);
  },
  { batchSize: 100, batchDelay: 5000 }
);

// Add thoughts
thoughts.forEach((t) => batcher.add(t));

// Ensure flush before shutdown
process.on('SIGTERM', async () => {
  await batcher.flush();
  process.exit(0);
});
```

---

## Error Handling

All methods may throw errors. Always wrap in try/catch:

```typescript
try {
  const result = service.trackThoughts(entries);
} catch (error) {
  console.error('Error tracking thoughts:', error);
}
```

---

## TypeScript Support

Full TypeScript support with type inference:

```typescript
import type { ThoughtEntry, ThoughtRecord } from '@mcp-bundle/structured-thinking';

const entry: ThoughtEntry = {
  stage: 'research',
  thought: 'Some research',
  metadata: { importance: 'high' }, // Autocomplete works!
};
```

---

## License

MIT

## Support

- GitHub Issues: [https://github.com/your-org/mcp-bundle](https://github.com/your-org/mcp-bundle)
- Documentation: [README.md](../README.md)
- Migration Guide: [MIGRATION.md](./MIGRATION.md)
