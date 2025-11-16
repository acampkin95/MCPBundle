# MCP Bundle V2 Testing Infrastructure Guide

**Version:** 2.0.0
**Date:** November 15, 2025
**Status:** Complete - Ready for Implementation

---

## Executive Summary

This document provides comprehensive guidance for the unified testing infrastructure across all MCP Bundle servers. The testing framework is built on Vitest 2.1.8 with standardized configurations, templates, and best practices.

### Key Achievements

- ✅ Standardized Vitest configuration across all 6 servers
- ✅ Comprehensive test templates (Unit, Integration, E2E, Performance)
- ✅ Unified testing scripts and coverage targets
- ✅ Test directory structures created
- ✅ Complete documentation and examples

---

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Test Configuration](#test-configuration)
3. [Test Templates](#test-templates)
4. [Running Tests](#running-tests)
5. [Coverage Requirements](#coverage-requirements)
6. [CI/CD Integration](#cicd-integration)
7. [Migration from Jest](#migration-from-jest)
8. [Troubleshooting](#troubleshooting)
9. [Next Steps](#next-steps)

---

## Infrastructure Overview

### Technology Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| Vitest | 2.1.8 | Test runner and framework |
| @vitest/coverage-v8 | 2.1.8 | Code coverage reporting |
| TypeScript | 5.9.6 | Type checking in tests |
| Node.js | >=18.18.0 | Runtime environment |

### Servers Configured

1. **itjsst-mcp** - IT Management MCP
2. **mcp-orchestrator** - Server Management MCP
3. **perplexity-mcp** - Business Intelligence MCP
4. **cloudflare-mcp** - DNS Management MCP
5. **soc-hub-mcp** - Security Operations MCP
6. **admin-panel** - Next.js Admin Dashboard

### Directory Structure

Each server now has a standardized test structure:

```
{server}/
├── tests/
│   ├── unit/              # Unit tests for individual modules
│   ├── integration/       # Integration tests for API/DB
│   ├── e2e/              # End-to-end workflow tests
│   ├── performance/      # Performance benchmarks
│   ├── fixtures/         # Test data and mocks
│   └── helpers/          # Test utilities
├── vitest.config.ts      # Vitest configuration
└── package.json          # Updated with test scripts
```

---

## Test Configuration

### Vitest Configuration (vitest.config.ts)

All servers (except admin-panel) use this configuration:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'tests/',
        'coverage/',
        '*.config.ts',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', '.backup'],
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
```

### Admin Panel Configuration

Admin panel uses a React-specific configuration:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',  // DOM environment for React
    setupFiles: ['./tests/setup.ts'],
    // ... coverage config
  }
});
```

### Package.json Test Scripts

All servers now have these standardized scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration"
  }
}
```

---

## Test Templates

### Available Templates

Located in `/Users/alex/Projects/MCP Bundle/release_dev/shared/test-templates/`:

#### 1. Unit Test Template (`unit.test.template.ts`)

**Features:**
- Sync and async function testing
- Class testing patterns
- Mock and spy examples
- Complete assertion reference
- Error handling examples

**Usage:**
```bash
cp shared/test-templates/unit.test.template.ts \
   itjsst-mcp/tests/unit/myModule.test.ts
```

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '@/module';

describe('myFunction', () => {
  it('should process input correctly', () => {
    const result = myFunction('test');
    expect(result).toBe('expected');
  });
});
```

#### 2. Integration Test Template (`integration.test.template.ts`)

**Features:**
- API endpoint testing
- Database integration
- Service-to-service communication
- Setup/teardown patterns

**Example:**
```typescript
describe('POST /api/resource', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  it('should create resource', async () => {
    const response = await apiClient.post('/api/resource', data);
    expect(response.status).toBe(201);
  });
});
```

#### 3. E2E Test Template (`e2e.test.template.ts`)

**Features:**
- Complete workflow testing
- Multi-step process validation
- Cross-system integration
- Data consistency verification

**Example:**
```typescript
it('should complete user registration flow', async () => {
  // Step 1: Register
  const user = await registerUser(data);

  // Step 2: Verify email
  const email = await checkEmailQueue();

  // Step 3: Confirm
  await confirmEmail(user.token);

  // Step 4: Login
  const session = await login(credentials);
  expect(session.authenticated).toBe(true);
});
```

#### 4. Performance Test Template (`performance.test.template.ts`)

**Features:**
- Response time measurement
- Throughput testing
- Memory usage tracking
- Statistical analysis
- Concurrent load testing

**Example:**
```typescript
it('should complete within 100ms', async () => {
  const times = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await operation();
    times.push(performance.now() - start);
  }
  const stats = calculateStats(times);
  expect(stats.p95).toBeLessThan(100);
});
```

### Template Documentation

Each template includes:
- Comprehensive inline documentation
- Working code examples
- Best practices comments
- Common patterns reference
- Troubleshooting tips

---

## Running Tests

### Local Development

```bash
# Navigate to server directory
cd itjsst-mcp

# Install dependencies (after package.json update)
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode (re-run on file changes)
npm run test:watch

# Run specific test type
npm run test:unit
npm run test:integration

# Run specific test file
npx vitest run tests/unit/myModule.test.ts

# Run tests matching pattern
npx vitest run -t "should handle errors"
```

### Coverage Reports

Coverage reports are generated in the `coverage/` directory:

```bash
# Generate coverage
npm run test:coverage

# View HTML report
open coverage/index.html

# View text summary
cat coverage/coverage-summary.json
```

### Debugging Tests

```bash
# Run with debug output
DEBUG=* npm test

# Run with Node inspector
node --inspect-brk node_modules/.bin/vitest run

# Run single test with increased timeout
npx vitest run tests/unit/slow.test.ts --testTimeout=30000
```

---

## Coverage Requirements

### Target Coverage by Server

| Server | Unit Coverage | Integration | E2E | Performance |
|--------|--------------|-------------|-----|-------------|
| itjsst-mcp | 80%+ | Critical paths | Main workflows | Key ops |
| mcp-orchestrator | 80%+ | Critical paths | Main workflows | Key ops |
| perplexity-mcp | 80%+ | Critical paths | Main workflows | Key ops |
| cloudflare-mcp | 80%+ | Critical paths | Main workflows | Key ops |
| soc-hub-mcp | 80%+ | Critical paths | Main workflows | Key ops |
| admin-panel | 70%+ | Critical paths | User flows | Page loads |

### Coverage Thresholds

Configured in `vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    lines: 80,       // 80% of lines covered
    functions: 80,   // 80% of functions covered
    branches: 75,    // 75% of branches covered
    statements: 80   // 80% of statements covered
  }
}
```

Tests will fail if coverage drops below these thresholds.

### Excluded from Coverage

- `node_modules/`
- `dist/` (compiled output)
- `tests/` (test files themselves)
- `coverage/` (coverage reports)
- `*.config.ts` (configuration files)
- `**/*.d.ts` (TypeScript declarations)

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]
        server: [itjsst-mcp, mcp-orchestrator, cloudflare-mcp, perplexity-mcp, soc-hub-mcp, admin-panel]

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        working-directory: ${{ matrix.server }}
        run: npm ci

      - name: Run tests
        working-directory: ${{ matrix.server }}
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ${{ matrix.server }}/coverage/coverage-final.json
          flags: ${{ matrix.server }}
          name: ${{ matrix.server }}-coverage
```

### Pre-commit Hooks

Using Husky and lint-staged:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "vitest related --run"
    ]
  }
}
```

---

## Migration from Jest

### For Servers Currently Using Jest

**mcp-orchestrator** and **cloudflare-mcp** were using Jest. Here's how to migrate:

#### Step 1: Remove Jest Dependencies

```bash
npm uninstall jest @types/jest ts-jest
```

#### Step 2: Install Vitest

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

#### Step 3: Update Test Files

Most Jest tests work with Vitest without changes. Only minor differences:

**Before (Jest):**
```typescript
import { describe, it, expect } from '@jest/globals';
```

**After (Vitest):**
```typescript
import { describe, it, expect } from 'vitest';
```

#### Step 4: Update Mocking

**Before (Jest):**
```typescript
jest.fn()
jest.spyOn(obj, 'method')
jest.mock('module')
```

**After (Vitest):**
```typescript
vi.fn()
vi.spyOn(obj, 'method')
vi.mock('module')
```

#### Step 5: Update Configuration

Replace `jest.config.js` with `vitest.config.ts` (already provided).

#### Step 6: Update Scripts

Package.json scripts already updated in the new package.json files.

### Compatibility Notes

**100% Compatible:**
- Basic assertions (toBe, toEqual, etc.)
- Describe/it blocks
- beforeEach, afterEach, beforeAll, afterAll
- async/await tests

**Minor Changes Needed:**
- Mock imports (`jest.fn()` → `vi.fn()`)
- Module mocking syntax
- Some custom matchers

**Not Compatible:**
- Jest-specific features (snapshot testing format differs)
- Some Jest plugins (need Vitest equivalents)

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Import Errors

**Problem:**
```
Error: Cannot find module '@/module'
```

**Solution:**
Check path aliases in `vitest.config.ts`:
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@tests': path.resolve(__dirname, './tests')
  }
}
```

#### 2. Tests Timing Out

**Problem:**
```
Test timed out in 5000ms
```

**Solution A:** Increase timeout globally in `vitest.config.ts`:
```typescript
test: {
  testTimeout: 10000
}
```

**Solution B:** Increase timeout for specific test:
```typescript
it('slow test', async () => {
  // test code
}, 15000); // 15 second timeout
```

#### 3. Coverage Not Generated

**Problem:**
No coverage report generated

**Solution:**
```bash
# Clear coverage directory
rm -rf coverage

# Run with explicit coverage flag
npx vitest run --coverage

# Check coverage config in vitest.config.ts
```

#### 4. Module Resolution Errors

**Problem:**
```
Cannot find module 'module-name'
```

**Solution:**
```bash
# Install missing dependency
npm install module-name

# For types
npm install --save-dev @types/module-name

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 5. Flaky Tests

**Problem:**
Tests pass/fail randomly

**Solution:**
- Avoid real timers (use `vi.useFakeTimers()`)
- Ensure test independence
- Don't rely on test execution order
- Use deterministic test data
- Increase timeouts if network-dependent

---

## Next Steps

### Immediate Actions (Priority 1)

1. **Install Dependencies:**
   ```bash
   cd itjsst-mcp && npm install
   cd ../mcp-orchestrator && npm install
   cd ../cloudflare-mcp && npm install
   cd ../perplexity-mcp && npm install
   cd ../soc-hub-mcp && npm install
   cd ../admin-panel && npm install
   ```

2. **Verify Configuration:**
   ```bash
   # Test that vitest runs
   cd itjsst-mcp && npm test
   ```

3. **Write First Tests:**
   - Copy templates to test directories
   - Write tests for critical modules
   - Run tests to verify setup

### Short Term (1-2 Weeks)

1. **Achieve Basic Coverage:**
   - Unit tests for core modules
   - Integration tests for APIs
   - Minimum 50% coverage

2. **Set Up CI/CD:**
   - Configure GitHub Actions
   - Add coverage reporting
   - Add status badges

3. **Documentation:**
   - Update README files
   - Add testing examples
   - Document test data setup

### Medium Term (1 Month)

1. **Reach Coverage Targets:**
   - 80% unit test coverage
   - All critical paths tested
   - E2E tests for main workflows

2. **Performance Testing:**
   - Benchmark key operations
   - Set performance baselines
   - Add regression tests

3. **Test Automation:**
   - Pre-commit hooks
   - Automated coverage reporting
   - Test result dashboards

### Long Term (3+ Months)

1. **Advanced Testing:**
   - Load testing
   - Security testing
   - Chaos engineering

2. **Continuous Improvement:**
   - Review and update tests
   - Refactor test utilities
   - Optimize test performance

---

## Resources

### Documentation

- **Vitest:** https://vitest.dev/
- **Coverage:** https://vitest.dev/guide/coverage.html
- **Mocking:** https://vitest.dev/guide/mocking.html
- **TypeScript:** https://www.typescriptlang.org/docs/

### Test Templates

- Unit: `/Users/alex/Projects/MCP Bundle/release_dev/shared/test-templates/unit.test.template.ts`
- Integration: `/Users/alex/Projects/MCP Bundle/release_dev/shared/test-templates/integration.test.template.ts`
- E2E: `/Users/alex/Projects/MCP Bundle/release_dev/shared/test-templates/e2e.test.template.ts`
- Performance: `/Users/alex/Projects/MCP Bundle/release_dev/shared/test-templates/performance.test.template.ts`

### Project Files

- Upgrade Notes: `/Users/alex/Projects/MCP Bundle/V2_DEPENDENCY_UPGRADE_NOTES.md`
- Template README: `/Users/alex/Projects/MCP Bundle/release_dev/shared/test-templates/README.md`

---

## Summary

The MCP Bundle now has a comprehensive, standardized testing infrastructure:

✅ **Vitest 2.1.8** across all servers
✅ **TypeScript 5.9.6** for type safety
✅ **4 test templates** (Unit, Integration, E2E, Performance)
✅ **Standardized configs** for consistency
✅ **Coverage thresholds** (80%+)
✅ **Complete documentation** and examples

### Benefits

1. **Consistency:** Same testing approach across all servers
2. **Quality:** Comprehensive test templates and patterns
3. **Efficiency:** Fast test execution with Vitest
4. **Coverage:** Clear targets and reporting
5. **Maintainability:** Well-documented, easy to extend

### Next Steps

1. Install dependencies on all servers
2. Write initial tests using templates
3. Achieve minimum coverage (50%+)
4. Set up CI/CD integration
5. Iterate towards 80%+ coverage

---

**Status:** Infrastructure Complete - Ready for Test Implementation
**Version:** 2.0.0
**Date:** November 15, 2025
**Maintainer:** MCP Bundle Team
