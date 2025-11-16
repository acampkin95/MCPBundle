# MCP Bundle Test Templates

Standardized testing templates for all MCP servers in the bundle.

## Overview

This directory contains reusable test templates that provide a consistent testing structure across all MCP servers. Each template includes comprehensive documentation, best practices, and working examples.

## Available Templates

### 1. Unit Test Template (`unit.test.template.ts`)

**Purpose:** Test individual functions, classes, or modules in isolation.

**Features:**
- Comprehensive examples for sync and async functions
- Class testing patterns
- Mock and spy examples
- Complete assertion reference

**When to use:**
- Testing pure functions
- Testing individual classes or modules
- Testing business logic in isolation
- Fast, focused tests

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { calculateTotal } from '@/utils/math';

describe('calculateTotal', () => {
  it('should sum array of numbers', () => {
    const result = calculateTotal([1, 2, 3, 4]);
    expect(result).toBe(10);
  });
});
```

### 2. Integration Test Template (`integration.test.template.ts`)

**Purpose:** Test interactions between multiple components, modules, or services.

**Features:**
- API endpoint testing patterns
- Database integration examples
- Service-to-service communication tests
- Setup/teardown patterns for integration tests

**When to use:**
- Testing API endpoints
- Testing database operations
- Testing service integrations
- Testing module interactions

**Example:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('POST /api/users', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  it('should create user successfully', async () => {
    const response = await apiClient.post('/api/users', {
      name: 'Test User',
      email: 'test@example.com'
    });
    expect(response.status).toBe(201);
  });
});
```

### 3. End-to-End Test Template (`e2e.test.template.ts`)

**Purpose:** Test complete user workflows across the entire system.

**Features:**
- Multi-step workflow examples
- Complete user journey patterns
- Cross-system integration tests
- Data consistency verification

**When to use:**
- Testing critical user flows
- Testing complete business processes
- Verifying system-wide behavior
- Pre-deployment validation

**Example:**
```typescript
describe('User Registration Flow', () => {
  it('should complete full registration', async () => {
    // Step 1: Register
    const user = await registerUser(userData);

    // Step 2: Verify email sent
    const email = await checkEmailQueue();

    // Step 3: Confirm email
    await confirmEmail(user.confirmationToken);

    // Step 4: Login
    const session = await login(userData.email, userData.password);
    expect(session.authenticated).toBe(true);
  });
});
```

### 4. Performance Test Template (`performance.test.template.ts`)

**Purpose:** Measure and verify performance characteristics.

**Features:**
- Response time measurement
- Throughput testing
- Memory usage tracking
- Concurrent load testing
- Statistical analysis helpers

**When to use:**
- Verifying performance requirements
- Preventing performance regressions
- Benchmarking optimizations
- Load testing

**Example:**
```typescript
it('should complete within 100ms', async () => {
  const times = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await operation();
    times.push(performance.now() - start);
  }
  const p95 = calculateP95(times);
  expect(p95).toBeLessThan(100);
});
```

## Using the Templates

### 1. Copy Template to Your Project

```bash
# For unit test
cp shared/test-templates/unit.test.template.ts \
   itjsst-mcp/tests/unit/myModule.test.ts

# For integration test
cp shared/test-templates/integration.test.template.ts \
   itjsst-mcp/tests/integration/apiEndpoints.test.ts
```

### 2. Customize for Your Use Case

1. Replace placeholder imports with actual modules
2. Remove unused sections
3. Add specific test cases
4. Update assertions to match expected behavior

### 3. Run Tests

```bash
# Run all tests
npm test

# Run specific test type
npm run test:unit
npm run test:integration
npm run test:coverage

# Watch mode
npm run test:watch
```

## Test Directory Structure

Each MCP server should follow this structure:

```
tests/
├── unit/                    # Unit tests
│   ├── services/           # Service layer tests
│   ├── utils/              # Utility function tests
│   └── handlers/           # Handler tests
├── integration/            # Integration tests
│   ├── api/               # API endpoint tests
│   └── database/          # Database integration tests
├── e2e/                   # End-to-end tests
│   └── workflows/         # Complete user workflows
├── performance/           # Performance tests
│   └── benchmarks/        # Performance benchmarks
├── fixtures/              # Test data
│   ├── data/             # Sample data files
│   └── mocks/            # Mock objects
└── helpers/               # Test utilities
    ├── setup.ts          # Test environment setup
    ├── teardown.ts       # Test cleanup
    └── factories.ts      # Test data factories
```

## Test Naming Conventions

### File Names
- Unit tests: `<module>.test.ts`
- Integration tests: `<feature>.integration.test.ts`
- E2E tests: `<workflow>.e2e.test.ts`
- Performance tests: `<feature>.perf.test.ts`

### Test Descriptions
- Use descriptive names
- Start with "should"
- Be specific about what's being tested

**Good:**
```typescript
it('should return 404 when user not found', async () => {
  // test code
});
```

**Bad:**
```typescript
it('works', async () => {
  // test code
});
```

## Test Coverage Goals

| Test Type | Target Coverage |
|-----------|----------------|
| Unit Tests | 80%+ |
| Integration Tests | Critical paths |
| E2E Tests | Main user workflows |
| Performance Tests | Key operations |

## Best Practices

### 1. Test Independence
- Each test should be independent
- Use `beforeEach` for setup, not global state
- Clean up after tests

### 2. Clear Assertions
- One concept per test
- Clear expected vs actual values
- Meaningful error messages

### 3. Test Data
- Use factories for test data
- Don't use production data
- Make test data realistic but simple

### 4. Async Handling
- Always use `async/await`
- Handle promise rejections
- Set appropriate timeouts

### 5. Mocking
- Mock external dependencies
- Don't mock what you're testing
- Keep mocks simple

## Common Patterns

### Testing Async Functions
```typescript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Testing Errors
```typescript
it('should throw on invalid input', () => {
  expect(() => functionToTest(invalid)).toThrow();
});

it('should reject promise on error', async () => {
  await expect(asyncFunction(invalid)).rejects.toThrow();
});
```

### Testing with Mocks
```typescript
import { vi } from 'vitest';

it('should call dependency', () => {
  const mockFn = vi.fn();
  const service = new Service(mockFn);

  service.doSomething();

  expect(mockFn).toHaveBeenCalled();
});
```

### Setup and Teardown
```typescript
describe('Database Tests', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('should insert record', async () => {
    // test code
  });
});
```

## Vitest Configuration

Each server has a standardized `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
```

## Continuous Integration

Tests should run in CI/CD:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
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

## Troubleshooting

### Tests Timing Out
- Increase timeout: `testTimeout: 10000` in vitest.config.ts
- Use `{ timeout: 15000 }` on specific tests

### Import Errors
- Check path aliases in vitest.config.ts
- Ensure TypeScript paths match
- Verify file extensions (.ts, .js)

### Coverage Not Updating
- Clear coverage directory: `rm -rf coverage`
- Run with `--coverage` flag explicitly
- Check coverage exclusions in config

### Flaky Tests
- Avoid timeouts in tests
- Ensure test independence
- Use deterministic test data
- Mock time-dependent code

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Test Doubles (Mocks, Stubs, Spies)](https://martinfowler.com/bliki/TestDouble.html)

## Support

For questions or issues:
1. Check this README
2. Review template comments
3. Check Vitest documentation
4. Ask in team chat

---

**Version:** 1.0.0
**Last Updated:** November 15, 2025
**Maintained By:** MCP Bundle Team
