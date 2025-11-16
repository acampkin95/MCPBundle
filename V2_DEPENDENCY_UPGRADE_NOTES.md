# MCP Bundle V2 Dependency Upgrade Notes

**Date:** November 15, 2025
**Status:** In Progress
**Scope:** All 6 MCP Servers + Admin Panel

---

## Executive Summary

This document tracks the modernization of dependency stacks across all MCP Bundle components, upgrading to latest stable versions with comprehensive testing infrastructure.

### Upgrade Targets

| Component | TypeScript | MCP SDK | Node Types | Vitest | Status |
|-----------|-----------|---------|------------|--------|--------|
| itjsst-mcp | 5.4.5 → 5.9.6 | 1.20.2 → 1.0.4 | 20.11.30 → 22.9.0 | N/A → 2.1.8 | Pending |
| mcp-orchestrator | 5.5.4 → 5.9.6 | 1.20.2 → 1.0.4 | 20.11.19 → 22.9.0 | N/A → 2.1.8 | Pending |
| perplexity-mcp | 5.9.3 ✅ | 1.0.4 ✅ | 24.10.0 → 22.9.0 | 4.0.7 → 2.1.8 | Partial |
| cloudflare-mcp | 5.5.4 → 5.9.6 | 1.20.2 → 1.0.4 | 20.11.19 → 22.9.0 | N/A → 2.1.8 | Pending |
| soc-hub-mcp | 5.6.3 → 5.9.6 | 1.0.4 ✅ | 22.8.6 → 22.9.0 | 2.1.3 → 2.1.8 | Partial |
| admin-panel | 5.6.3 → 5.9.6 | N/A | 20.11.30 → 22.9.0 | N/A → 2.1.8 | Pending |

---

## Detailed Changes by Component

### 1. itjsst-mcp (IT Management MCP)

**Current State:**
- TypeScript: 5.4.5
- MCP SDK: 1.20.2 (outdated)
- Testing: None configured
- Node Types: 20.11.30

**Planned Upgrades:**

#### Dependencies
- `@modelcontextprotocol/sdk`: 1.20.2 → **1.0.4** (standardized version)
- All other deps: Latest compatible versions

#### DevDependencies
- `typescript`: 5.4.5 → **5.9.6**
- `@types/node`: 20.11.30 → **22.9.0**
- `@typescript-eslint/eslint-plugin`: 6.20.0 → **8.15.0**
- `@typescript-eslint/parser`: 6.20.0 → **8.15.0**
- `eslint`: 8.56.0 → **9.15.0** (major update, config changes required)
- `prettier`: 3.6.2 → **3.4.2**
- Add: `vitest`: **^2.1.8**
- Add: `@vitest/coverage-v8`: **^2.1.8**

#### Breaking Changes
- ESLint 9.x requires new flat config format
- TypeScript 5.9.x has stricter type checking
- MCP SDK 1.0.4 API changes (standardized across all servers)

#### New Scripts
```json
"test": "vitest run",
"test:watch": "vitest watch",
"test:coverage": "vitest run --coverage",
"test:unit": "vitest run tests/unit",
"test:integration": "vitest run tests/integration"
```

---

### 2. mcp-orchestrator (Server Management MCP)

**Current State:**
- TypeScript: 5.5.4
- MCP SDK: 1.20.2 (outdated)
- Testing: Jest configured but minimal tests
- Node Types: 20.11.19

**Planned Upgrades:**

#### Dependencies
- `@modelcontextprotocol/sdk`: 1.20.2 → **1.0.4**
- `express`: 5.1.0 → **5.0.1** (stable release)
- `winston`: 3.13.0 → **3.17.0**
- `zod`: 3.22.4 → **3.24.1**

#### DevDependencies
- `typescript`: 5.5.4 → **5.9.6**
- `@types/node`: 20.11.19 → **22.9.0**
- `@typescript-eslint/eslint-plugin`: 7.0.1 → **8.15.0**
- `@typescript-eslint/parser`: 7.0.1 → **8.15.0**
- Replace `jest` with `vitest` for consistency
- Remove: `jest`, `@types/jest`, `ts-jest`
- Add: `vitest`: **^2.1.8**
- Add: `@vitest/coverage-v8`: **^2.1.8**

#### Breaking Changes
- Migration from Jest to Vitest (test syntax remains similar)
- Express 5.x breaking changes (router changes)
- ESLint 8 → 9 config migration

---

### 3. perplexity-mcp (Business Intelligence MCP)

**Current State:** ✅ Already using latest TypeScript and MCP SDK
- TypeScript: 5.9.3 ✅
- MCP SDK: 1.0.4 ✅
- Testing: Vitest 4.0.7
- Node Types: 24.10.0 (too new, incompatible)

**Planned Upgrades:**

#### Dependencies
- Already on latest versions ✅

#### DevDependencies
- `@types/node`: 24.10.0 → **22.9.0** (downgrade for stability)
- `vitest`: 4.0.7 → **2.1.8** (align with other servers)
- `@vitest/coverage-v8`: 4.0.7 → **2.1.8**
- `@typescript-eslint/eslint-plugin`: 8.46.3 → **8.15.0**
- `@typescript-eslint/parser`: 8.46.3 → **8.15.0**

#### Notes
- This server is the most up-to-date
- Only minor alignment needed for consistency
- No breaking changes expected

---

### 4. cloudflare-mcp (DNS Management MCP)

**Current State:**
- TypeScript: 5.5.4
- MCP SDK: 1.20.2 (outdated)
- Testing: Jest configured
- Node Types: 20.11.19

**Planned Upgrades:**

#### Dependencies
- `@modelcontextprotocol/sdk`: 1.20.2 → **1.0.4**
- `express`: 5.1.0 → **5.0.1**
- `winston`: 3.13.0 → **3.17.0**
- `zod`: 3.22.4 → **3.24.1**
- `prom-client`: 15.1.1 → **15.1.3**

#### DevDependencies
- `typescript`: 5.5.4 → **5.9.6**
- `@types/node`: 20.11.19 → **22.9.0**
- Replace Jest with Vitest
- Same as mcp-orchestrator upgrades

---

### 5. soc-hub-mcp (Security Operations MCP)

**Current State:**
- TypeScript: 5.6.3
- MCP SDK: 1.0.4 ✅
- Testing: Vitest 2.1.3
- Node Types: 22.8.6

**Planned Upgrades:**

#### Dependencies
- Already on latest MCP SDK ✅
- `winston`: 3.15.0 → **3.17.0**
- `zod`: 3.23.8 → **3.24.1**
- `redis`: 4.7.0 → **4.7.0** (latest)
- `axios`: 1.7.7 → **1.7.9**

#### DevDependencies
- `typescript`: 5.6.3 → **5.9.6**
- `@types/node`: 22.8.6 → **22.9.0**
- `vitest`: 2.1.3 → **2.1.8**
- `@vitest/coverage-v8`: 2.1.3 → **2.1.8**
- `@typescript-eslint/eslint-plugin`: 8.11.0 → **8.15.0**
- `@typescript-eslint/parser`: 8.11.0 → **8.15.0**
- `eslint`: 9.13.0 → **9.15.0**

---

### 6. admin-panel (Next.js Dashboard)

**Current State:**
- TypeScript: 5.6.3
- Framework: Next.js 14.2.5
- Testing: None configured
- Node Types: 20.11.30

**Planned Upgrades:**

#### Dependencies
- `next`: 14.2.5 → **15.0.3** (major update)
- `next-auth`: 4.24.7 → **4.24.10**
- `react`: 18.3.1 → **18.3.1** (latest)
- `react-dom`: 18.3.1 → **18.3.1** (latest)

#### DevDependencies
- `typescript`: 5.6.3 → **5.9.6**
- `@types/node`: 20.11.30 → **22.9.0**
- `@types/react`: 18.3.3 → **18.3.12**
- `eslint`: 8.57.0 → **9.15.0**
- `eslint-config-next`: 14.2.5 → **15.0.3**
- Add: `vitest`: **^2.1.8**
- Add: `@vitest/coverage-v8`: **^2.1.8**
- Add: `@vitejs/plugin-react`: **^4.3.4**

#### Breaking Changes
- Next.js 15 introduces App Router as default
- ESLint config migration
- May need React Server Components updates

---

## Testing Infrastructure Setup

### Standard Vitest Configuration

All servers will receive a standardized `vitest.config.ts`:

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
        '*.config.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});
```

### Test Directory Structure

```
tests/
├── unit/                    # Unit tests for individual functions/modules
│   ├── services/
│   ├── utils/
│   └── handlers/
├── integration/             # Integration tests for API endpoints
│   ├── api/
│   └── database/
├── e2e/                     # End-to-end tests
│   └── workflows/
├── performance/             # Performance benchmarks
│   └── benchmarks/
├── fixtures/                # Test data and fixtures
│   ├── data/
│   └── mocks/
└── helpers/                 # Test utilities and helpers
    ├── setup.ts
    └── teardown.ts
```

### Test Templates

#### Unit Test Template (`tests/templates/unit.test.ts`)
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('functionName', () => {
    it('should handle valid input correctly', () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBeDefined();
      expect(result).toEqual(expectedOutput);
    });

    it('should throw error on invalid input', () => {
      // Arrange
      const invalidInput = { /* invalid data */ };

      // Act & Assert
      expect(() => functionName(invalidInput)).toThrow();
    });
  });
});
```

#### Integration Test Template (`tests/templates/integration.test.ts`)
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment } from '../helpers/setup';

describe('API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  describe('POST /api/endpoint', () => {
    it('should create resource successfully', async () => {
      // Arrange
      const payload = { /* test payload */ };

      // Act
      const response = await apiClient.post('/api/endpoint', payload);

      // Assert
      expect(response.status).toBe(201);
      expect(response.data).toMatchObject({
        id: expect.any(String),
        // ... other fields
      });
    });
  });
});
```

#### E2E Test Template (`tests/templates/e2e.test.ts`)
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('End-to-End Workflow', () => {
  beforeAll(async () => {
    // Setup complete test environment
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should complete full user workflow', async () => {
    // Step 1: User action
    const step1 = await performAction1();
    expect(step1).toBeDefined();

    // Step 2: System response
    const step2 = await performAction2(step1.data);
    expect(step2.status).toBe('success');

    // Step 3: Verify final state
    const finalState = await checkFinalState();
    expect(finalState).toMatchObject({
      // Expected final state
    });
  });
});
```

#### Performance Test Template (`tests/templates/performance.test.ts`)
```typescript
import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';

describe('Performance Tests', () => {
  it('should complete operation within acceptable time', async () => {
    const iterations = 1000;
    const maxAvgTime = 10; // milliseconds

    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operationToTest();
      const end = performance.now();
      times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

    console.log(`Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`P95 time: ${p95.toFixed(2)}ms`);

    expect(avgTime).toBeLessThan(maxAvgTime);
  });
});
```

---

## Migration Checklist

### Pre-Migration
- [x] Backup all package.json files
- [ ] Document current versions
- [ ] Review breaking changes
- [ ] Plan migration order

### Migration Steps (Per Component)
- [ ] Update package.json dependencies
- [ ] Update package.json devDependencies
- [ ] Add test scripts
- [ ] Install new dependencies
- [ ] Update tsconfig.json if needed
- [ ] Migrate ESLint config (if using ESLint 9)
- [ ] Create vitest.config.ts
- [ ] Create test directory structure
- [ ] Add test templates
- [ ] Run build to verify compatibility
- [ ] Fix any TypeScript errors
- [ ] Write initial tests
- [ ] Run test suite
- [ ] Update CI/CD workflows

### Post-Migration
- [ ] Document changes
- [ ] Update README files
- [ ] Test all integrations
- [ ] Performance testing
- [ ] Security audit (`npm audit`)
- [ ] Verify all servers start correctly

---

## Breaking Changes Summary

### TypeScript 5.9.x
- Stricter type checking for `any` types
- Better enum type inference
- Improved decorator support
- Performance improvements

### ESLint 9.x
**Major Change:** Flat config format required

**Old format (`eslintrc.js`):**
```javascript
module.exports = {
  extends: ['eslint:recommended'],
  rules: { /* ... */ }
};
```

**New format (`eslint.config.js`):**
```javascript
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { '@typescript-eslint': tseslint },
    rules: { /* ... */ }
  }
];
```

### MCP SDK 1.0.4
- Standardized API across all servers
- Improved error handling
- Better TypeScript types
- Performance optimizations

### Next.js 15 (admin-panel)
- App Router is now default
- Turbopack bundler
- React Server Components by default
- Improved caching strategies

### Jest → Vitest Migration
**Mostly compatible**, but note:
- Config file format different
- Some matcher differences
- Better ES modules support
- Faster execution

---

## Version Pinning Strategy

### Exact Pinning (No Caret/Tilde)
Critical infrastructure dependencies:
- `@modelcontextprotocol/sdk`: Exact version
- `typescript`: Exact version
- Framework versions (`next`, `express`)

### Caret Pinning (^)
Development tools and testing:
- `vitest`: ^2.1.8 (minor updates OK)
- `eslint`: ^9.15.0
- `prettier`: ^3.4.2

### Tilde Pinning (~)
Not used (prefer exact or caret)

---

## Rollback Plan

### If Issues Occur:
1. **Stop immediately** - Don't continue with other components
2. **Restore from backup:**
   ```bash
   cp .backup/package-json-originals/{component}-package.json.bak {component}/package.json
   ```
3. **Reinstall original dependencies:**
   ```bash
   cd {component}
   rm -rf node_modules package-lock.json
   npm install
   ```
4. **Document the issue** in this file
5. **Investigate root cause** before retrying

### Backup Locations
- Original package.json files: `/Users/alex/Projects/MCP Bundle/release_dev/.backup/package-json-originals/`
- Created: 2025-11-15 08:24

---

## Testing Strategy

### Phase 1: Individual Component Testing
For each upgraded component:
1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Run existing tests: `npm test`
4. Fix any compatibility issues
5. Add new tests using templates

### Phase 2: Integration Testing
After all components upgraded:
1. Test MCP Orchestrator → Other MCPs communication
2. Test Admin Panel → All MCPs integration
3. Test cross-server workflows
4. Performance benchmarking

### Phase 3: System Testing
1. Full stack deployment test
2. Load testing
3. Security scanning
4. Documentation verification

---

## Timeline

### Estimated Duration: 2-3 days

**Day 1:**
- itjsst-mcp upgrade (2 hours)
- mcp-orchestrator upgrade (2 hours)
- cloudflare-mcp upgrade (2 hours)
- Testing and fixes (2 hours)

**Day 2:**
- perplexity-mcp alignment (1 hour)
- soc-hub-mcp upgrade (1 hour)
- admin-panel upgrade (3 hours)
- Testing and fixes (3 hours)

**Day 3:**
- Integration testing (4 hours)
- Documentation (2 hours)
- Final verification (2 hours)

---

## Resources

### Documentation Links
- [TypeScript 5.9 Release Notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/)
- [ESLint 9 Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [Vitest Documentation](https://vitest.dev/)
- [Next.js 15 Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)

### Useful Commands
```bash
# Check for outdated packages
npm outdated

# Interactive upgrade
npm-check -u

# Security audit
npm audit

# Verify TypeScript compilation
npx tsc --noEmit

# Run all tests
npm test

# Coverage report
npm run test:coverage
```

---

## Notes

### Observations
- perplexity-mcp is the most up-to-date server
- itjsst-mcp and mcp-orchestrator need the most work
- admin-panel faces Next.js 15 upgrade challenges
- All servers can benefit from unified testing infrastructure

### Decisions Made
1. Standardize on Vitest for all testing (migrate from Jest)
2. Use MCP SDK 1.0.4 across all servers (current stable)
3. TypeScript 5.9.6 for all (latest stable)
4. Node types 22.9.0 for consistency
5. ESLint 9.15.0 with flat config format

### Open Questions
- [ ] Should we upgrade Next.js to 15 or stay on 14?
- [ ] Do we need E2E testing infrastructure now or later?
- [ ] Should we add Playwright for admin-panel testing?

---

**Status:** Document created, upgrades pending
**Next Steps:** Begin with itjsst-mcp upgrade and testing
**Updated:** 2025-11-15 08:24
