/**
 * Tests for Isolation Forest Anomaly Detection
 *
 * @module tests/isolation-forest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IsolationForest,
  detectAnomalyIForest,
  type IsolationForestConfig,
  type IsolationForestResult
} from '../src/models/isolation-forest';

describe('IsolationForest', () => {
  describe('Constructor and Configuration', () => {
    it('should create forest with default config', () => {
      const forest = new IsolationForest();
      expect(forest).toBeDefined();
      expect(forest.isTrained()).toBe(false);
    });

    it('should create forest with custom config', () => {
      const config: IsolationForestConfig = {
        numTrees: 50,
        sampleSize: 128,
        contamination: 0.05,
        randomSeed: 12345
      };
      const forest = new IsolationForest(config);
      const forestConfig = forest.getConfig();

      expect(forestConfig.numTrees).toBe(50);
      expect(forestConfig.sampleSize).toBe(128);
      expect(forestConfig.contamination).toBe(0.05);
      expect(forestConfig.randomSeed).toBe(12345);
    });

    it('should calculate default maxDepth from sampleSize', () => {
      const forest = new IsolationForest({ sampleSize: 256 });
      const config = forest.getConfig();

      // log2(256) = 8
      expect(config.maxDepth).toBe(8);
    });

    it('should use custom maxDepth if provided', () => {
      const forest = new IsolationForest({ sampleSize: 256, maxDepth: 10 });
      const config = forest.getConfig();

      expect(config.maxDepth).toBe(10);
    });
  });

  describe('Training (fit)', () => {
    let forest: IsolationForest;

    beforeEach(() => {
      forest = new IsolationForest({
        numTrees: 10,
        sampleSize: 20,
        randomSeed: 42
      });
    });

    it('should train on 1D data', () => {
      const data = Array.from({ length: 50 }, (_, i) => [i]);
      forest.fit(data);

      expect(forest.isTrained()).toBe(true);
    });

    it('should train on 2D data', () => {
      const data = Array.from({ length: 50 }, (_, i) => [i, i * 2]);
      forest.fit(data);

      expect(forest.isTrained()).toBe(true);
    });

    it('should train on multi-dimensional data', () => {
      const data = Array.from({ length: 50 }, (_, i) => [i, i * 2, i * 3, i * 4]);
      forest.fit(data);

      expect(forest.isTrained()).toBe(true);
    });

    it('should throw error on empty data', () => {
      expect(() => forest.fit([])).toThrow('Cannot train on empty dataset');
    });

    it('should handle small datasets', () => {
      const data = [[1], [2], [3]];
      forest.fit(data);

      expect(forest.isTrained()).toBe(true);
    });
  });

  describe('Anomaly Detection', () => {
    let forest: IsolationForest;

    beforeEach(() => {
      forest = new IsolationForest({
        numTrees: 50,
        sampleSize: 50,
        contamination: 0.1,
        randomSeed: 42
      });
    });

    it('should detect clear outliers in 1D data', () => {
      // Normal data around 10
      const data = Array.from({ length: 100 }, () => [10 + (Math.random() - 0.5) * 2]);
      forest.fit(data);

      // Clear outlier
      const result = forest.detect([100]);
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should not flag normal points as anomalies', () => {
      const data = Array.from({ length: 100 }, () => [10 + (Math.random() - 0.5) * 2]);
      forest.fit(data);

      const result = forest.detect([10.5]);
      expect(result.isAnomaly).toBe(false);
      expect(result.score).toBeLessThan(0.6);
    });

    it('should detect outliers in 2D data', () => {
      // Normal data in a cluster
      const data = Array.from({ length: 100 }, () => [
        10 + (Math.random() - 0.5) * 2,
        20 + (Math.random() - 0.5) * 2
      ]);
      forest.fit(data);

      // Outlier far from cluster
      const result = forest.detect([100, 200]);
      expect(result.isAnomaly).toBe(true);
    });

    it('should handle multi-dimensional anomalies', () => {
      const data = Array.from({ length: 100 }, () => [
        10 + (Math.random() - 0.5),
        20 + (Math.random() - 0.5),
        30 + (Math.random() - 0.5),
        40 + (Math.random() - 0.5)
      ]);
      forest.fit(data);

      const result = forest.detect([50, 60, 70, 80]);
      expect(result.isAnomaly).toBe(true);
    });

    it('should throw error if not trained', () => {
      expect(() => forest.detect([1, 2])).toThrow('Forest not trained yet');
    });

    it('should throw error on dimension mismatch', () => {
      const data = [[1, 2], [3, 4], [5, 6]];
      forest.fit(data);

      expect(() => forest.detect([1])).toThrow('Point dimension');
      expect(() => forest.detect([1, 2, 3])).toThrow('Point dimension');
    });
  });

  describe('Anomaly Score', () => {
    it('should return scores between 0 and 1', () => {
      const forest = new IsolationForest({ numTrees: 20, randomSeed: 42 });
      const data = Array.from({ length: 50 }, () => [10 + Math.random() * 5]);
      forest.fit(data);

      for (let i = 0; i < 10; i++) {
        const score = forest.anomalyScore([10 + Math.random() * 10]);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should give higher scores to outliers', () => {
      const forest = new IsolationForest({ numTrees: 50, randomSeed: 42 });
      const data = Array.from({ length: 100 }, () => [10 + Math.random() * 2]);
      forest.fit(data);

      const normalScore = forest.anomalyScore([11]);
      const outlierScore = forest.anomalyScore([100]);

      expect(outlierScore).toBeGreaterThan(normalScore);
    });

    it('should be consistent for same point', () => {
      const forest = new IsolationForest({ numTrees: 30, randomSeed: 42 });
      const data = Array.from({ length: 50 }, () => [10 + Math.random() * 2]);
      forest.fit(data);

      const point = [15];
      const score1 = forest.anomalyScore(point);
      const score2 = forest.anomalyScore(point);

      expect(score1).toBe(score2);
    });
  });

  describe('Contamination Parameter', () => {
    it('should respect contamination threshold', () => {
      const contamination = 0.1; // Expect 10% anomalies
      const forest = new IsolationForest({
        numTrees: 50,
        contamination,
        randomSeed: 42
      });

      const data = Array.from({ length: 100 }, (_, i) => [i]);
      forest.fit(data);

      // Count how many training points are flagged as anomalies
      let anomalyCount = 0;
      for (const point of data) {
        if (forest.detect(point).isAnomaly) {
          anomalyCount++;
        }
      }

      // Should be approximately contamination * data.length
      const expectedAnomalies = Math.floor(contamination * data.length);
      expect(anomalyCount).toBeGreaterThanOrEqual(expectedAnomalies - 5);
      expect(anomalyCount).toBeLessThanOrEqual(expectedAnomalies + 5);
    });

    it('should adjust threshold with different contamination values', () => {
      const data = Array.from({ length: 100 }, () => [10 + Math.random() * 2]);

      const forest1 = new IsolationForest({ contamination: 0.05, randomSeed: 42 });
      forest1.fit(data);
      const result1 = forest1.detect([15]);

      const forest2 = new IsolationForest({ contamination: 0.2, randomSeed: 42 });
      forest2.fit(data);
      const result2 = forest2.detect([15]);

      // Higher contamination = lower threshold = more anomalies
      // If result1 is normal, result2 might be anomaly
      expect(result2.threshold).toBeLessThan(result1.threshold);
    });
  });

  describe('Reproducibility', () => {
    it('should produce same results with same seed', () => {
      const data = Array.from({ length: 100 }, () => [10 + Math.random() * 5]);
      const testPoint = [20];

      const forest1 = new IsolationForest({ numTrees: 30, randomSeed: 12345 });
      forest1.fit(data);
      const result1 = forest1.detect(testPoint);

      const forest2 = new IsolationForest({ numTrees: 30, randomSeed: 12345 });
      forest2.fit(data);
      const result2 = forest2.detect(testPoint);

      expect(result1.score).toBe(result2.score);
      expect(result1.isAnomaly).toBe(result2.isAnomaly);
    });

    it('should produce different results with different seeds', () => {
      const data = Array.from({ length: 100 }, () => [10 + Math.random() * 5]);
      const testPoint = [20];

      const forest1 = new IsolationForest({ numTrees: 30, randomSeed: 111 });
      forest1.fit(data);
      const score1 = forest1.anomalyScore(testPoint);

      const forest2 = new IsolationForest({ numTrees: 30, randomSeed: 999 });
      forest2.fit(data);
      const score2 = forest2.anomalyScore(testPoint);

      // Scores might be different due to different random trees
      // But should be in similar range
      expect(Math.abs(score1 - score2)).toBeLessThan(0.5);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset forest state', () => {
      const forest = new IsolationForest();
      const data = [[1], [2], [3]];

      forest.fit(data);
      expect(forest.isTrained()).toBe(true);

      forest.reset();
      expect(forest.isTrained()).toBe(false);
      expect(() => forest.detect([1])).toThrow('Forest not trained yet');
    });
  });

  describe('Edge Cases', () => {
    it('should handle all identical points', () => {
      const forest = new IsolationForest({ numTrees: 10, randomSeed: 42 });
      const data = Array(50).fill([10]);

      forest.fit(data);
      const result = forest.detect([10]);

      // All points are "normal" since they're identical
      expect(result).toBeDefined();
    });

    it('should handle single feature', () => {
      const forest = new IsolationForest({ numTrees: 10, randomSeed: 42, contamination: 0.1 });
      const data = [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10],
                    [11], [12], [13], [14], [15], [16], [17], [18], [19], [20]];

      forest.fit(data);
      const result = forest.detect([100]);

      // With larger dataset, outlier should be detected
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should handle large number of features', () => {
      const forest = new IsolationForest({ numTrees: 20, randomSeed: 42 });
      const data = Array.from({ length: 50 }, () =>
        Array.from({ length: 20 }, () => Math.random() * 10)
      );

      forest.fit(data);
      const anomaly = Array(20).fill(100);
      const result = forest.detect(anomaly);

      expect(result.isAnomaly).toBe(true);
    });

    it('should handle negative values', () => {
      const forest = new IsolationForest({ numTrees: 50, randomSeed: 42, contamination: 0.05 });
      // Generate deterministic negative values in range [-10, -5]
      const data = Array.from({ length: 100 }, (_, i) => [-10 + (i % 50) * 0.1]);

      forest.fit(data);
      const result = forest.detect([-100]);

      // -100 is 10x outside the normal range, should be detected
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(0.6);
    });

    it('should handle very large values', () => {
      const forest = new IsolationForest({ numTrees: 50, randomSeed: 42, contamination: 0.05 });
      // Generate deterministic large values in range [1e6, 1e6+1000]
      const data = Array.from({ length: 100 }, (_, i) => [1e6 + (i % 100) * 10]);

      forest.fit(data);
      const result = forest.detect([1e9]);

      // 1e9 is 1000x larger than normal range, should be detected
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(0.6);
    });
  });

  describe('Result Structure', () => {
    it('should return complete result object', () => {
      const forest = new IsolationForest({ numTrees: 10 });
      const data = [[1], [2], [3], [4], [5]];
      forest.fit(data);

      const result = forest.detect([10]);

      expect(result).toHaveProperty('isAnomaly');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('pathLength');
      expect(result).toHaveProperty('threshold');

      expect(typeof result.isAnomaly).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(typeof result.pathLength).toBe('number');
      expect(typeof result.threshold).toBe('number');
    });
  });

  describe('Performance Tests', () => {
    it('should train efficiently on moderate datasets', () => {
      const forest = new IsolationForest({ numTrees: 100, sampleSize: 256 });
      const data = Array.from({ length: 1000 }, () => [
        Math.random() * 100,
        Math.random() * 100
      ]);

      const startTime = Date.now();
      forest.fit(data);
      const trainTime = Date.now() - startTime;

      expect(trainTime).toBeLessThan(1000); // Should train in <1s
    });

    it('should detect efficiently', () => {
      const forest = new IsolationForest({ numTrees: 100 });
      const data = Array.from({ length: 500 }, () => [
        Math.random() * 100,
        Math.random() * 100
      ]);
      forest.fit(data);

      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        forest.detect([Math.random() * 100, Math.random() * 100]);
      }
      const detectTime = Date.now() - startTime;

      expect(detectTime).toBeLessThan(100); // 100 detections in <100ms
    });
  });

  describe('Convenience Function', () => {
    it('should detect anomaly in one call', () => {
      const data = Array.from({ length: 50 }, () => [10 + Math.random() * 2]);
      const result = detectAnomalyIForest(data, [100], { randomSeed: 42 });

      expect(result).toBeDefined();
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should use default config if not provided', () => {
      const data = Array.from({ length: 50 }, () => [10 + Math.random() * 2]);
      const result = detectAnomalyIForest(data, [100]);

      expect(result).toBeDefined();
      expect(result.isAnomaly).toBeDefined();
    });
  });

  describe('Real-World Scenarios', () => {
    it('should detect CPU usage spike', () => {
      const forest = new IsolationForest({ numTrees: 50, randomSeed: 42 });

      // Normal CPU usage: 20-40%
      const normalCPU = Array.from({ length: 100 }, () => [20 + Math.random() * 20]);
      forest.fit(normalCPU);

      // CPU spike to 95%
      const result = forest.detect([95]);
      expect(result.isAnomaly).toBe(true);
    });

    it('should detect network traffic anomaly', () => {
      const forest = new IsolationForest({ numTrees: 50, randomSeed: 42 });

      // Normal traffic pattern: [requests/s, bytes/s]
      const normalTraffic = Array.from({ length: 100 }, () => [
        100 + Math.random() * 50,  // 100-150 req/s
        1000 + Math.random() * 500 // 1000-1500 KB/s
      ]);
      forest.fit(normalTraffic);

      // DDoS attack pattern
      const result = forest.detect([10000, 50000]);
      expect(result.isAnomaly).toBe(true);
    });

    it('should detect database query anomaly', () => {
      const forest = new IsolationForest({ numTrees: 50, randomSeed: 42 });

      // Normal query patterns: [duration_ms, rows_returned, cpu_cost]
      const normalQueries = Array.from({ length: 100 }, () => [
        10 + Math.random() * 40,    // 10-50ms
        100 + Math.random() * 900,  // 100-1000 rows
        0.1 + Math.random() * 0.4   // 0.1-0.5 cpu cost
      ]);
      forest.fit(normalQueries);

      // Slow query with many rows
      const result = forest.detect([5000, 1000000, 50]);
      expect(result.isAnomaly).toBe(true);
    });

    it('should adapt to different normal baselines', () => {
      // Test with two different datasets representing different "normal" patterns
      const forest1 = new IsolationForest({ numTrees: 30, randomSeed: 42 });
      const data1 = Array.from({ length: 50 }, () => [10 + Math.random() * 5]);
      forest1.fit(data1);

      const forest2 = new IsolationForest({ numTrees: 30, randomSeed: 42 });
      const data2 = Array.from({ length: 50 }, () => [100 + Math.random() * 50]);
      forest2.fit(data2);

      // Value that's normal for data1 but anomalous for data2
      const result1 = forest1.detect([12]);
      const result2 = forest2.detect([12]);

      expect(result1.isAnomaly).toBe(false);
      expect(result2.isAnomaly).toBe(true);
    });
  });
});
