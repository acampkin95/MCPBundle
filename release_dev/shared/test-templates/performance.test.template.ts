/**
 * Performance Test Template
 *
 * Purpose: Measure and verify performance characteristics of code
 *
 * Usage:
 * 1. Copy this template to your tests/performance directory
 * 2. Rename to match what you're testing (e.g., databaseQueries.perf.test.ts)
 * 3. Replace placeholders with actual performance tests
 * 4. Run: npm run test:performance (or npm test -- tests/performance)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { performance } from 'perf_hooks';

// Import the code to test
// import { functionToTest } from '@/path/to/module';

/**
 * Helper function to measure execution time
 */
function measureTime(fn: () => void | Promise<void>): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

/**
 * Helper function to measure async execution time
 */
async function measureAsyncTime(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return end - start;
}

/**
 * Calculate statistics from an array of times
 */
function calculateStats(times: number[]): {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
} {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

describe('Performance Tests', () => {
  beforeAll(() => {
    // Warm up any caches
    // Initialize test data
  });

  describe('Response Time Performance', () => {
    it('should complete operation within acceptable time', async () => {
      const iterations = 1000;
      const maxAvgTime = 10; // milliseconds
      const times: number[] = [];

      // Run multiple iterations
      for (let i = 0; i < iterations; i++) {
        const time = await measureAsyncTime(async () => {
          // await operationToTest();
          await new Promise(resolve => setTimeout(resolve, 1)); // Placeholder
        });
        times.push(time);
      }

      // Calculate statistics
      const stats = calculateStats(times);

      // Log results
      console.log('\nPerformance Statistics:');
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Min:        ${stats.min.toFixed(2)}ms`);
      console.log(`  Max:        ${stats.max.toFixed(2)}ms`);
      console.log(`  Mean:       ${stats.mean.toFixed(2)}ms`);
      console.log(`  Median:     ${stats.median.toFixed(2)}ms`);
      console.log(`  P95:        ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99:        ${stats.p99.toFixed(2)}ms`);

      // Assertions
      expect(stats.mean).toBeLessThan(maxAvgTime);
      expect(stats.p95).toBeLessThan(maxAvgTime * 2);
      expect(stats.p99).toBeLessThan(maxAvgTime * 3);
    }, 30000); // 30 second timeout for performance tests
  });

  describe('Throughput Performance', () => {
    it('should handle expected throughput', async () => {
      const duration = 5000; // 5 seconds
      const minOperationsPerSecond = 100;
      let operationCount = 0;

      const startTime = performance.now();
      const endTime = startTime + duration;

      while (performance.now() < endTime) {
        // await operationToTest();
        await new Promise(resolve => setTimeout(resolve, 1)); // Placeholder
        operationCount++;
      }

      const actualDuration = (performance.now() - startTime) / 1000;
      const operationsPerSecond = operationCount / actualDuration;

      console.log(`\nThroughput Test:`);
      console.log(`  Duration: ${actualDuration.toFixed(2)}s`);
      console.log(`  Operations: ${operationCount}`);
      console.log(`  Throughput: ${operationsPerSecond.toFixed(2)} ops/sec`);

      expect(operationsPerSecond).toBeGreaterThanOrEqual(minOperationsPerSecond);
    }, 10000);
  });

  describe('Memory Usage Performance', () => {
    it('should not leak memory during repeated operations', async () => {
      const iterations = 1000;
      const maxMemoryIncrease = 10; // MB

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      for (let i = 0; i < iterations; i++) {
        // await operationToTest();
        await new Promise(resolve => setTimeout(resolve, 1)); // Placeholder
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`\nMemory Usage:`);
      console.log(`  Initial:  ${initialMemory.toFixed(2)} MB`);
      console.log(`  Final:    ${finalMemory.toFixed(2)} MB`);
      console.log(`  Increase: ${memoryIncrease.toFixed(2)} MB`);

      expect(memoryIncrease).toBeLessThan(maxMemoryIncrease);
    }, 30000);
  });

  describe('Concurrent Load Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const maxP95Time = 100; // milliseconds

      const promises = Array.from({ length: concurrentRequests }, async () => {
        return measureAsyncTime(async () => {
          // await operationToTest();
          await new Promise(resolve => setTimeout(resolve, 10)); // Placeholder
        });
      });

      const times = await Promise.all(promises);
      const stats = calculateStats(times);

      console.log(`\nConcurrent Load Test (${concurrentRequests} requests):`);
      console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
      console.log(`  P95:  ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99:  ${stats.p99.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(maxP95Time);
    }, 15000);
  });

  describe('Database Query Performance', () => {
    it('should execute queries within acceptable time', async () => {
      const queryCount = 100;
      const maxAvgQueryTime = 50; // milliseconds

      const times: number[] = [];

      for (let i = 0; i < queryCount; i++) {
        const time = await measureAsyncTime(async () => {
          // await database.query('SELECT * FROM table WHERE id = ?', [i]);
          await new Promise(resolve => setTimeout(resolve, 5)); // Placeholder
        });
        times.push(time);
      }

      const stats = calculateStats(times);

      console.log(`\nDatabase Query Performance (${queryCount} queries):`);
      console.log(`  Mean:   ${stats.mean.toFixed(2)}ms`);
      console.log(`  Median: ${stats.median.toFixed(2)}ms`);
      console.log(`  P95:    ${stats.p95.toFixed(2)}ms`);

      expect(stats.mean).toBeLessThan(maxAvgQueryTime);
    });
  });

  describe('Cache Performance', () => {
    it('should show significant speedup with caching', async () => {
      const iterations = 100;
      const minSpeedup = 5; // Cache should be at least 5x faster

      // Measure without cache
      const uncachedTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const time = await measureAsyncTime(async () => {
          // await expensiveOperation();
          await new Promise(resolve => setTimeout(resolve, 10)); // Placeholder
        });
        uncachedTimes.push(time);
      }

      // Measure with cache (simulating cache hit)
      const cachedTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const time = await measureAsyncTime(async () => {
          // await cachedOperation();
          await new Promise(resolve => setTimeout(resolve, 1)); // Placeholder (faster)
        });
        cachedTimes.push(time);
      }

      const uncachedStats = calculateStats(uncachedTimes);
      const cachedStats = calculateStats(cachedTimes);
      const speedup = uncachedStats.mean / cachedStats.mean;

      console.log(`\nCache Performance:`);
      console.log(`  Uncached mean: ${uncachedStats.mean.toFixed(2)}ms`);
      console.log(`  Cached mean:   ${cachedStats.mean.toFixed(2)}ms`);
      console.log(`  Speedup:       ${speedup.toFixed(2)}x`);

      expect(speedup).toBeGreaterThanOrEqual(minSpeedup);
    });
  });

  describe('Algorithm Complexity', () => {
    it('should scale linearly with input size', async () => {
      const inputSizes = [100, 200, 400, 800, 1600];
      const times: number[] = [];

      for (const size of inputSizes) {
        // Generate input of specified size
        const input = Array.from({ length: size }, (_, i) => i);

        const time = await measureAsyncTime(async () => {
          // await algorithmToTest(input);
          await new Promise(resolve => setTimeout(resolve, size / 100)); // Placeholder
        });

        times.push(time);
        console.log(`  Input size ${size}: ${time.toFixed(2)}ms`);
      }

      // Check if time scales roughly linearly (allowing some variance)
      const ratio1 = times[1] / times[0]; // 200/100
      const ratio2 = times[2] / times[1]; // 400/200
      const ratio3 = times[3] / times[2]; // 800/400
      const ratio4 = times[4] / times[3]; // 1600/800

      console.log(`\nScaling ratios:`);
      console.log(`  ${ratio1.toFixed(2)}, ${ratio2.toFixed(2)}, ${ratio3.toFixed(2)}, ${ratio4.toFixed(2)}`);

      // For linear scaling, ratios should be close to 2.0
      // Allow variance between 1.5 and 3.0
      expect(ratio1).toBeGreaterThan(1.5);
      expect(ratio1).toBeLessThan(3.0);
    });
  });
});

/**
 * Performance Testing Best Practices:
 *
 * 1. Warm-up:
 *    - Run operations once before measuring
 *    - Allows JIT compilation and cache warming
 *
 * 2. Multiple Iterations:
 *    - Run tests multiple times
 *    - Calculate statistics (min, max, mean, median, percentiles)
 *
 * 3. Realistic Conditions:
 *    - Test with production-like data
 *    - Test under realistic load
 *    - Consider network latency
 *
 * 4. Metrics to Track:
 *    - Response time (mean, median, p95, p99)
 *    - Throughput (operations per second)
 *    - Memory usage
 *    - CPU usage
 *    - Concurrency handling
 *
 * 5. Thresholds:
 *    - Set realistic performance targets
 *    - Based on requirements, not arbitrary numbers
 *    - Document why targets were chosen
 *
 * 6. Regression Prevention:
 *    - Run performance tests in CI/CD
 *    - Alert on significant regressions
 *    - Track trends over time
 *
 * 7. Profiling:
 *    - Use profiling tools for deep analysis
 *    - Identify bottlenecks
 *    - Optimize based on data
 *
 * 8. Documentation:
 *    - Document performance characteristics
 *    - Note any degradation as acceptable trade-offs
 *    - Track improvements over time
 *
 * Running with Node.js built-in profiler:
 * node --prof dist/index.js
 * node --prof-process isolate-*.log > processed.txt
 *
 * Running with garbage collection exposed:
 * node --expose-gc your-test-file.js
 */
