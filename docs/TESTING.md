# Testing & Performance Suite

Comprehensive guide to the testing, code quality, and performance tools in the MCP Bundle project.

## Table of Contents

- [Testing with Vitest](#testing-with-vitest)
- [Code Quality Checks](#code-quality-checks)
- [Performance Profiling](#performance-profiling)
- [Load Testing](#load-testing)
- [Pre-Commit Hooks](#pre-commit-hooks)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

---

## Testing with Vitest

Vitest is a blazing-fast test framework (10-100x faster than Jest) with native ESM and TypeScript support.

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with UI interface (browser-based)
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

Coverage reports are generated in the `coverage/` directory.

### Writing Tests

Create test files with `.test.ts` or `.spec.ts` suffix:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyComponent', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should do something', () => {
    expect(true).toBe(true);
  });

  afterEach(() => {
    // Cleanup after each test
  });
});
```

### Benchmark Tests

Run performance benchmarks with:

```bash
npm run bench
```

Create benchmark files with `.bench.ts` suffix:

```typescript
import { bench, describe } from 'vitest';

describe('Performance Tests', () => {
  bench('fast operation', () => {
    // Code to benchmark
  });

  bench('slow operation', () => {
    // Code to benchmark
  });
});
```

---

## Code Quality Checks

### Running All Checks

```bash
# Run full code quality suite (8 checks)
npm run code-quality
```

This executes:
1. TypeScript strict type checking
2. ESLint with security rules
3. Prettier format check
4. Vitest tests with coverage
5. npm security audit
6. Semgrep security scan
7. ShellCheck (shell scripts)
8. Bundle size analysis

### Individual Checks

```bash
# TypeScript type checking only
npm run type-check

# ESLint only
npm run lint

# Auto-fix ESLint issues
npm run lint:fix

# Prettier check only
npm run format:check

# Auto-format all files
npm run format

# Security audit
npm run security:audit

# Semgrep scan
npm run security:semgrep
```

### Performance Targets

The code-quality script tracks timing:
- **TypeScript type checking**: Target <1s
- **Test execution**: Target <10s

Warnings are shown if targets are exceeded.

---

## Performance Profiling

### Clinic.js Tools

Three profiling modes using Clinic.js:

#### 1. Doctor (General Performance)
Diagnoses performance issues:

```bash
npm run perf:profile
```

Generates an HTML report showing:
- Event loop delay
- Memory usage
- CPU usage
- Active handles

#### 2. Flame (CPU Profiling)
Creates flame graphs for CPU-intensive operations:

```bash
npm run perf:flame
```

Shows exactly where CPU time is spent in your code.

#### 3. Bubbleprof (Async Operations)
Visualizes async operations and delays:

```bash
npm run perf:bubbleprof
```

Shows async operation chains and where delays occur.

### Micro-Benchmarking

Run targeted micro-benchmarks with Benchmark.js:

```bash
npm run perf:benchmark
```

Edit `scripts/benchmark.js` to add custom benchmarks for critical code paths.

Example output:
```
String Concatenation x 1,234,567 ops/sec ±0.12%
Array Join x 2,345,678 ops/sec ±0.08%
Fastest is Array Join
```

---

## Load Testing

### Autocannon HTTP Load Testing

Test HTTP endpoint performance:

```bash
# Default: 100 connections for 30 seconds
npm run load-test

# Custom load test
npx autocannon -c 200 -d 60 http://localhost:9090/health
```

Parameters:
- `-c`: Number of concurrent connections
- `-d`: Duration in seconds
- `-p`: Pipeline requests (default: 1)

Example output:
```
┌─────────┬──────┬──────┬───────┬───────┬─────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg     │
├─────────┼──────┼──────┼───────┼───────┼─────────┤
│ Latency │ 1 ms │ 2 ms │ 5 ms  │ 7 ms  │ 2.3 ms  │
└─────────┴──────┴──────┴───────┴───────┴─────────┘
┌───────────┬─────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ Avg     │
├───────────┼─────────┼─────────┼─────────┤
│ Req/Sec   │ 45000   │ 45000   │ 46234   │
└───────────┴─────────┴─────────┴─────────┘
```

---

## Pre-Commit Hooks

### Automatic Quality Checks

Husky + lint-staged automatically run checks before each commit:

**What runs on `git commit`:**
1. ESLint auto-fix on staged `.ts`, `.tsx`, `.js`, `.jsx` files
2. Prettier auto-format on staged files
3. ShellCheck on staged `.sh` files

Configuration in `.lintstagedrc.json`:

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"],
  "*.sh": ["shellcheck"]
}
```

### Skipping Hooks (Not Recommended)

Only in emergencies:

```bash
git commit --no-verify -m "emergency fix"
```

---

## CI/CD Integration

### GitHub Actions Workflows

Configured in `.github/workflows/code-quality.yml`:

#### 1. Code Quality Job
Runs on every push/PR:
- TypeScript type checking
- ESLint
- Prettier
- Vitest with coverage
- Uploads coverage to Codecov

#### 2. Security Scanning Job
- npm audit (moderate+ vulnerabilities)
- Semgrep security scan
- CodeQL analysis

#### 3. Dependency Review Job
PRs only:
- Reviews dependency changes
- Fails on moderate+ severity issues

#### 4. Performance Benchmarks Job
- Runs build
- Executes performance benchmarks
- Runs Vitest benchmarks

### Viewing Results

Check the Actions tab in GitHub to see:
- Test results and coverage
- Security scan findings
- Performance benchmark trends

---

## Best Practices

### Test Organization

```
tests/
├── unit/           # Fast unit tests
├── integration/    # Integration tests
├── e2e/           # End-to-end tests
└── benchmarks/    # Performance benchmarks
```

### Test Naming

```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should handle normal case', () => {});
    it('should handle edge case', () => {});
    it('should throw on invalid input', () => {});
  });
});
```

### Performance Testing Strategy

1. **Micro-benchmarks**: Test individual functions (Benchmark.js)
2. **Profile during development**: Use Clinic.js to catch issues early
3. **Load test before deployment**: Use Autocannon on staging
4. **Monitor in production**: Use Prometheus metrics (VMI01 setup)

### Coverage Guidelines

- **Critical paths**: 90%+ coverage (auth, data access, core logic)
- **Business logic**: 80%+ coverage
- **Utilities**: 70%+ coverage
- **UI components**: 60%+ coverage

Don't chase 100% coverage - focus on critical paths.

### TypeScript Strict Mode

All strict checks are enabled in `tsconfig.json`:
- `strict: true` (enables all strict checks)
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`

This catches more bugs at compile time.

### Security Best Practices

1. **Run audits regularly**: `npm run security:audit`
2. **Review Semgrep findings**: `npm run security:semgrep`
3. **Update dependencies**: Keep packages up to date
4. **Pre-commit hooks**: Catch issues before they're committed
5. **CI/CD pipeline**: Automated security scanning on every PR

### Performance Optimization Workflow

1. **Identify bottleneck**: Use `npm run perf:profile`
2. **Understand CPU usage**: Use `npm run perf:flame`
3. **Analyze async delays**: Use `npm run perf:bubbleprof`
4. **Benchmark fix**: Compare before/after with `npm run perf:benchmark`
5. **Load test**: Verify improvements with `npm run load-test`
6. **Deploy and monitor**: Check Grafana dashboards on VMI01

---

## Troubleshooting

### Tests Failing Locally But Pass in CI

- Check Node.js version (should be 20.x)
- Clear cache: `rm -rf node_modules coverage .tsbuildinfo && npm ci`
- Check for uncommitted files affecting tests

### Coverage Below Threshold

- Run `npm run test:coverage` to see detailed report
- Open `coverage/index.html` in browser for visual report
- Focus on covering critical paths first

### Performance Regression

- Compare benchmark results before/after changes
- Use Clinic.js to identify new bottlenecks
- Check for memory leaks with Doctor
- Verify async operation chains with Bubbleprof

### Pre-Commit Hook Slow

- Check which linter is slow (ESLint or Prettier)
- Consider using `lint-staged` cache (already configured)
- Reduce number of files being checked (stage fewer files)

### Load Test Failing

- Verify server is running: `curl http://localhost:9090/health`
- Check server logs for errors
- Reduce concurrent connections: `npx autocannon -c 10 -d 10 <url>`
- Verify network connectivity

---

## Quick Reference

### Common Commands

```bash
# Development workflow
npm run dev                  # Start dev server
npm run test:watch           # Watch mode for tests
npm run lint:fix             # Auto-fix linting issues

# Before committing
npm run pre-commit           # Run all pre-commit checks manually
npm run format               # Format all files

# Performance analysis
npm run perf:profile         # General performance diagnosis
npm run perf:flame           # CPU profiling
npm run load-test            # HTTP load testing

# Build and deploy
npm run build                # Compile TypeScript
npm start                    # Run production build
npm run code-quality         # Full quality check before release
```

### File Locations

- Test config: `vitest.config.ts`
- TypeScript config: `tsconfig.json`
- ESLint config: `.eslintrc.json`
- Prettier config: `.prettierrc.json`
- Husky hooks: `.husky/pre-commit`
- Lint-staged config: `.lintstagedrc.json`
- Code quality script: `scripts/code-quality.sh`
- Benchmark suite: `scripts/benchmark.js`
- CI/CD workflow: `.github/workflows/code-quality.yml`

---

## Resources

- **Vitest**: https://vitest.dev/
- **Clinic.js**: https://clinicjs.org/
- **Autocannon**: https://github.com/mcollina/autocannon
- **Benchmark.js**: https://benchmarkjs.com/
- **Husky**: https://typicode.github.io/husky/
- **lint-staged**: https://github.com/okonet/lint-staged
- **Semgrep**: https://semgrep.dev/
- **CodeQL**: https://codeql.github.com/

---

## Summary

This testing suite provides:

- **10-100x faster tests** with Vitest vs Jest
- **Automatic quality checks** on every commit via Husky
- **Comprehensive profiling** with Clinic.js (Doctor, Flame, Bubbleprof)
- **Load testing** with Autocannon for HTTP endpoints
- **Micro-benchmarking** with Benchmark.js for critical paths
- **Security scanning** with npm audit, Semgrep, and CodeQL
- **CI/CD integration** with GitHub Actions
- **TypeScript strict mode** for maximum type safety

All checks complete in under 30 seconds locally, with performance targets of <1s for type checking and <10s for tests.
