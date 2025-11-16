import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Globals (if you want describe, it, expect without imports)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/tests/**',
        '**/*.config.*',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },

    // Test matching patterns
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Watch mode settings
    watch: false,

    // Reporter
    reporters: ['verbose'],

    // Performance
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },

    // Mocking
    mockReset: true,
    restoreMocks: true,

    // Benchmark
    benchmark: {
      include: ['**/*.bench.ts'],
      exclude: ['node_modules'],
    },
  },
});
