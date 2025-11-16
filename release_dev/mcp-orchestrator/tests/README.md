# MCP Orchestrator Test Suite

Comprehensive test suite for the MCP Orchestrator with 200+ tests covering unit, integration, performance, and E2E scenarios.

## Test Structure

```
tests/
├── unit/                      # Unit tests (isolated component testing)
│   ├── commandQueue.test.ts   # CommandQueueService (150+ tests)
│   ├── healthCheck.test.ts    # HealthCheckService (50+ tests)
│   └── ...
├── integration/               # Integration tests (multi-component)
│   ├── commandExecution.test.ts  # Full command lifecycle (60+ tests)
│   └── ...
├── performance/               # Performance & scalability tests
│   ├── queueThroughput.test.ts   # Throughput benchmarks
│   └── ...
├── e2e/                       # End-to-end tests
│   └── orchestration.test.ts     # Full system workflows
├── fixtures/                  # Test data
│   ├── mockAgents.ts          # Mock agent data
│   └── mockCommands.ts        # Mock command data
└── helpers/                   # Test utilities
    └── testDatabase.ts        # Database helpers
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Coverage Targets

- **Overall Coverage**: 90%+
- **Unit Tests**: 95%+ coverage
- **Integration Tests**: 85%+ coverage
- **Critical Paths**: 100% coverage

### Current Coverage

Run `npm run test:coverage` to see current coverage metrics.

## Performance Benchmarks

### Target Performance Metrics

| Operation | Target | Current |
|-----------|--------|---------|
| Command Enqueue | < 5ms | See test output |
| Command Dequeue | < 5ms | See test output |
| Queue Throughput | > 1000 cmd/s | See test output |
| Health Check | < 100ms | See test output |
| Stats Calculation | < 50ms | See test output |

### Running Performance Tests

```bash
npm test tests/performance
```

Performance tests output detailed metrics to console:
- Throughput (operations/second)
- Average latency
- Memory usage
- Scalability ratios

## Test Fixtures

### Mock Agents
```typescript
import { MOCK_AGENTS, generateMockAgents } from '@tests/fixtures/mockAgents';

// Predefined agents
const agent = MOCK_AGENTS[0];

// Generate N agents for load testing
const agents = generateMockAgents(1000);
```

### Mock Commands
```typescript
import { MOCK_COMMANDS, createMockCommand } from '@tests/fixtures/mockCommands';

// Predefined commands
const command = MOCK_COMMANDS[0];

// Create custom command
const custom = createMockCommand({
  priority: 'urgent',
  targetAgentId: 'agent-01'
});
```

## Test Helpers

### Database Utilities
```typescript
import { createTestDatabase, waitFor } from '@tests/helpers/testDatabase';

// In-memory database
const db = createTestDatabase();

// File-based database with cleanup
const { db, cleanup } = createTestDatabaseFile();
// ... use db
cleanup();

// Wait for condition
await waitFor(() => queue.getStats().totalCompleted === 10);
```

### Time Utilities
```typescript
import { sleep, measureTime } from '@tests/helpers/testDatabase';

await sleep(100);

const { result, durationMs } = await measureTime(async () => {
  return await someAsyncOperation();
});
```

## Writing Tests

### Unit Test Template
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServiceUnderTest } from '@/services/serviceUnderTest.js';
import { createTestDatabase } from '@tests/helpers/testDatabase.js';

describe('ServiceUnderTest', () => {
  let service: ServiceUnderTest;

  beforeEach(() => {
    // Setup
    service = new ServiceUnderTest();
  });

  afterEach(() => {
    // Cleanup
    service.close();
  });

  describe('methodName', () => {
    it('should do expected behavior', () => {
      const result = service.methodName();
      expect(result).toBe(expectedValue);
    });

    it('should handle error cases', () => {
      expect(() => service.methodName(invalidInput)).toThrow();
    });
  });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Integration', () => {
  beforeEach(() => {
    // Setup multiple services
  });

  it('should complete end-to-end workflow', async () => {
    // 1. Setup
    // 2. Execute workflow
    // 3. Verify results
    // 4. Verify side effects
  });
});
```

### Performance Test Template
```typescript
import { describe, it, expect } from 'vitest';

describe('Performance', () => {
  it('should meet throughput target', () => {
    const start = Date.now();

    // Execute operation N times
    for (let i = 0; i < 1000; i++) {
      service.operation();
    }

    const duration = Date.now() - start;
    const throughput = (1000 / duration) * 1000;

    console.log(`Throughput: ${throughput} ops/sec`);
    expect(throughput).toBeGreaterThan(TARGET_THROUGHPUT);
  });
});
```

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` for setup
- Use `afterEach` for cleanup
- Don't rely on test execution order

### 2. Descriptive Test Names
```typescript
// Good
it('should enqueue command with default priority when not specified', () => {});

// Bad
it('should work', () => {});
```

### 3. Arrange-Act-Assert Pattern
```typescript
it('should update command status', () => {
  // Arrange
  const command = createMockCommand();
  queue.enqueue(command);

  // Act
  queue.updateStatus(command.jobId, 'completed');

  // Assert
  const result = queue.getCommand(command.jobId);
  expect(result?.status).toBe('completed');
});
```

### 4. Test Edge Cases
- Empty inputs
- Null/undefined values
- Boundary conditions
- Invalid inputs
- Concurrent operations

### 5. Mock External Dependencies
```typescript
import { vi } from 'vitest';

const mockService = {
  method: vi.fn().mockResolvedValue(result)
};
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Scheduled daily runs

### CI Configuration
```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

## Debugging Tests

### Run Single Test File
```bash
npx vitest run tests/unit/commandQueue.test.ts
```

### Run Single Test Case
```bash
npx vitest run -t "should enqueue command"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/vitest run
```

### Verbose Output
```bash
npx vitest run --reporter=verbose
```

## Test Data Cleanup

All tests use temporary databases that are automatically cleaned up:
- In-memory databases (`:memory:`) for fast tests
- File-based databases in `/tmp` for integration tests
- Cleanup hooks in `afterEach` ensure no leftovers

## Known Issues & Workarounds

### Issue: SQLite BUSY errors
**Workaround**: Tests use WAL mode and separate database files per test

### Issue: Timing-sensitive tests flaky
**Workaround**: Use `waitFor()` helper instead of fixed delays

### Issue: Memory leaks in performance tests
**Workaround**: Force GC with `global.gc()` if available

## Contributing

When adding new tests:
1. Follow existing patterns
2. Add to appropriate directory (unit/integration/performance)
3. Update this README if adding new patterns
4. Ensure tests pass locally before PR
5. Maintain coverage above 90%

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Test Coverage Reports](./coverage/index.html) (after running coverage)
