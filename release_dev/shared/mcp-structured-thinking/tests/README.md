# Tests for mcp-structured-thinking

This directory contains comprehensive tests for the structured thinking library.

## Test Structure

```
tests/
├── service.test.ts       # Main service tests (StructuredThinkingService)
├── cache.test.ts         # Cache utilities tests (LRUCache, BatchProcessor)
├── integration.test.ts   # Integration and workflow tests
└── README.md             # This file
```

## Test Coverage

### service.test.ts (Primary Service Tests)

Tests for the main `StructuredThinkingService` class:

- **Basic Functionality** (7 tests)
  - Service initialization
  - Thought tracking with auto-numbering
  - Thought number assignment
  - Tag tracking
  - Importance breakdown
  - Summary generation
  - Progress calculation

- **Timeline Operations** (9 tests)
  - Get timeline
  - Clear timeline
  - Filter by stage
  - Filter by tags
  - Filter by importance
  - Filter by text content
  - Limit results
  - Normalize timeline
  - Revise thoughts

- **Branch Insights** (2 tests)
  - Branch insight generation
  - Branch health calculation

- **Feedback Signals** (3 tests)
  - Stage dwelling detection
  - Repetition detection
  - Quality drop detection

- **Export/Import** (4 tests)
  - Export as JSON
  - Export as Markdown
  - Import JSON
  - Metadata preservation

- **Caching** (3 tests)
  - Timeline summary caching
  - Cache clearing
  - Cache invalidation on changes

- **Diagnostics** (3 tests)
  - Diagnostics generation
  - Missing stage detection
  - Report generation

- **Error Handling** (4 tests)
  - Empty thought entries
  - Invalid thought ID in revise
  - Invalid import format
  - Invalid timeline records

**Total: 35+ tests**

### cache.test.ts (Cache Utilities Tests)

Tests for caching layer components:

- **LRUCache Basic Operations** (6 tests)
  - Store and retrieve values
  - Missing keys
  - Key existence checks
  - Delete entries
  - Clear cache
  - Update entries

- **LRUCache LRU Eviction** (3 tests)
  - Evict least recently used
  - Access order updates
  - Eviction statistics

- **LRUCache TTL Expiration** (3 tests)
  - Entry expiration after TTL
  - Custom TTL per entry
  - Expired entry cleanup

- **LRUCache Statistics** (5 tests)
  - Cache hits tracking
  - Cache misses tracking
  - Hit rate calculation
  - Cache size tracking
  - Statistics reset

- **CacheKeyGenerator** (6 tests)
  - Timeline summary keys
  - Diagnostics keys
  - Filtered timeline keys
  - Normalized timeline keys
  - Timeline checksums
  - Empty timeline checksums
  - Checksum consistency

- **BatchProcessor** (8 tests)
  - Batch processing when size reached
  - Batch processing after delay
  - Manual flush
  - Queue size tracking
  - Empty flush handling
  - Multiple batch processing
  - Timer clearing after flush

- **Cache Integration** (2 tests)
  - Cache key usage
  - Cache invalidation on changes

**Total: 33+ tests**

### integration.test.ts (Integration Tests)

Real-world workflow tests:

- **Complete Thinking Workflow** (1 comprehensive test)
  - Full 5-stage thinking process
  - Problem definition → Research → Analysis → Synthesis → Conclusion
  - Stage tallying
  - Progress tracking
  - Report generation

- **Branching Workflows** (1 test)
  - Multiple solution branches
  - Branch insights
  - Branch quality comparison

- **Export/Import Workflow** (2 tests)
  - Export/import between services
  - Markdown export readability

- **Revision Workflow** (2 tests)
  - Thought revisions
  - Revision history maintenance

- **Filtering and Search** (4 tests)
  - Multi-criteria filtering
  - Branch filtering
  - Text content search
  - Result pagination

- **Performance with Caching** (2 tests)
  - Expensive operation caching
  - Cache invalidation on modifications

**Total: 12+ tests**

## Grand Total

**80+ comprehensive tests** covering:
- Unit tests for all components
- Integration tests for workflows
- Edge cases and error handling
- Performance optimizations
- Caching behavior

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm test -- service.test.ts
npm test -- cache.test.ts
npm test -- integration.test.ts
```

### Run with Coverage

```bash
npm run test:coverage
```

This will generate a coverage report in the `coverage/` directory.

### Watch Mode

```bash
npm test -- --watch
```

### Verbose Output

```bash
npm test -- --verbose
```

## Coverage Targets

The library maintains high test coverage:

- **Branches**: 90%+
- **Functions**: 90%+
- **Lines**: 90%+
- **Statements**: 90%+

These thresholds are enforced in `jest.config.js`.

## Coverage Report

After running `npm run test:coverage`, open the HTML report:

```bash
open coverage/lcov-report/index.html
```

## Mock Objects

### MockSQLitePlannerService

Used in tests to simulate the SQLite planner dependency:

```typescript
class MockSQLitePlannerService implements ISQLitePlannerService {
  getDatabasePath(): string
  getTimeline(): ThoughtRecord[]
  replaceTimeline(timeline: ThoughtRecord[]): void
  appendThought(record: ThoughtRecord): void
  refreshMarkdownCache(): Promise<void>
  clearTimeline(): void  // Test helper
}
```

## Test Data Helpers

### createTestThoughts()

Creates a standard set of 5 thoughts covering all cognitive stages:

```typescript
const thoughts = createTestThoughts();
// Returns:
// - 1 problem_definition
// - 1 research
// - 1 analysis
// - 1 synthesis
// - 1 conclusion
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-commit hooks (optional)

## Troubleshooting

### Test Failures

1. **Module resolution errors**: Ensure TypeScript and Jest configs match
2. **Timeout errors**: Increase timeout in `jest.config.js`
3. **ESM import errors**: Check `.js` extensions in imports

### Coverage Issues

If coverage is below threshold:
1. Identify uncovered lines: `npm run test:coverage`
2. Open HTML report: `coverage/lcov-report/index.html`
3. Add tests for uncovered code paths

### Performance Tests

Cache-related tests may be timing-sensitive. If flaky:
1. Increase wait times in async tests
2. Run tests in isolation: `npm test -- cache.test.ts`

## Writing New Tests

### Test Template

```typescript
describe('FeatureName', () => {
  let planner: MockSQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new MockSQLitePlannerService();
    service = new StructuredThinkingService(planner);
  });

  afterEach(() => {
    planner.clearTimeline();
  });

  it('should do something', () => {
    // Arrange
    const input = { ... };

    // Act
    const result = service.someMethod(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Best Practices

1. **Descriptive test names**: Use "should" statements
2. **Arrange-Act-Assert**: Structure tests clearly
3. **One assertion per test**: Or closely related assertions
4. **Clean up**: Use `afterEach` to reset state
5. **Mock dependencies**: Use `MockSQLitePlannerService`
6. **Test edge cases**: Empty inputs, invalid data, boundaries
7. **Test errors**: Verify error handling paths

## References

- [Jest Documentation](https://jestjs.io/)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
