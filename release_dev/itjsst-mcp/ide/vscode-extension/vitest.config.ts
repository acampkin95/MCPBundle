import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'out/',
        'dist/',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/types/**',
        'src/extension.ts', // Main entry point tested via integration
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      all: true,
      clean: true,
    },
    testTimeout: 30000, // 30s for integration tests with network calls
    hookTimeout: 10000, // 10s for setup/teardown
    pool: 'forks', // Isolate tests to prevent state pollution
    maxConcurrency: 5, // Limit concurrent tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
