/**
 * Tests for Statistical Anomaly Detection
 *
 * @module tests/statistical-anomaly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StatisticalAnomalyDetector,
  detectAnomaly,
  type AnomalyResult,
  type StatisticalAnomalyConfig
} from '../src/models/statistical-anomaly';

describe('StatisticalAnomalyDetector', () => {
  describe('Constructor and Configuration', () => {
    it('should create detector with default config', () => {
      const detector = new StatisticalAnomalyDetector();
      expect(detector).toBeDefined();
      expect(detector.isReady()).toBe(false);
    });

    it('should create detector with custom config', () => {
      const config: StatisticalAnomalyConfig = {
        method: 'zscore',
        zscoreThreshold: 2.5,
        windowSize: 50,
        minSamples: 20
      };
      const detector = new StatisticalAnomalyDetector(config);
      expect(detector).toBeDefined();
    });

    it('should use auto method by default', () => {
      const detector = new StatisticalAnomalyDetector();
      detector.fit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                    16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
      const result = detector.detect(100);
      expect(result.method).toBe('zscore');
    });
  });

  describe('Fit and Ready State', () => {
    let detector: StatisticalAnomalyDetector;

    beforeEach(() => {
      detector = new StatisticalAnomalyDetector({ minSamples: 10 });
    });

    it('should not be ready without data', () => {
      expect(detector.isReady()).toBe(false);
      expect(detector.getDataSize()).toBe(0);
    });

    it('should not be ready with insufficient samples', () => {
      detector.fit([1, 2, 3, 4, 5]);
      expect(detector.isReady()).toBe(false);
      expect(detector.getDataSize()).toBe(5);
    });

    it('should be ready with sufficient samples', () => {
      detector.fit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(detector.isReady()).toBe(true);
      expect(detector.getDataSize()).toBe(12);
    });

    it('should calculate statistics after fit', () => {
      detector.fit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const stats = detector.getStatistics();
      expect(stats).not.toBeNull();
      expect(stats?.mean).toBeCloseTo(5.5, 1);
      expect(stats?.median).toBe(5.5);
    });

    it('should handle rolling window size limit', () => {
      const smallDetector = new StatisticalAnomalyDetector({ windowSize: 10 });
      const data = Array.from({ length: 20 }, (_, i) => i + 1);
      smallDetector.fit(data);
      expect(smallDetector.getDataSize()).toBe(10);
    });
  });

  describe('Z-Score Detection', () => {
    let detector: StatisticalAnomalyDetector;

    beforeEach(() => {
      detector = new StatisticalAnomalyDetector({
        method: 'zscore',
        zscoreThreshold: 3.0,
        minSamples: 10
      });
    });

    it('should detect anomalies beyond threshold', () => {
      // Mean = 50, StdDev ≈ 15.8
      const data = Array.from({ length: 30 }, (_, i) => 50 + (i % 10) - 5);
      detector.fit(data);

      // 100 is ~3.16 standard deviations from mean
      const result = detector.detect(100);
      expect(result.isAnomaly).toBe(true);
      expect(result.method).toBe('zscore');
      expect(result.score).toBeGreaterThan(3.0);
    });

    it('should not flag normal values as anomalies', () => {
      const data = Array.from({ length: 30 }, (_, i) => 50 + (i % 10) - 5);
      detector.fit(data);

      const result = detector.detect(52);
      expect(result.isAnomaly).toBe(false);
      expect(result.score).toBeLessThan(3.0);
    });

    it('should handle values below mean', () => {
      const data = Array.from({ length: 30 }, (_, i) => 50 + (i % 10) - 5);
      detector.fit(data);

      const result = detector.detect(0);
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(3.0);
    });

    it('should return zero score for insufficient data', () => {
      detector.fit([1, 2, 3]);
      const result = detector.detect(100);
      expect(result.isAnomaly).toBe(false);
      expect(result.score).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should calculate confidence scores', () => {
      const data = Array.from({ length: 30 }, (_, i) => 50 + (i % 10) - 5);
      detector.fit(data);

      const result = detector.detect(100);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('IQR Detection', () => {
    let detector: StatisticalAnomalyDetector;

    beforeEach(() => {
      detector = new StatisticalAnomalyDetector({
        method: 'iqr',
        iqrMultiplier: 1.5,
        minSamples: 10
      });
    });

    it('should detect outliers using IQR method', () => {
      // Data with clear outlier
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      detector.fit(data);

      const result = detector.detect(100);
      expect(result.isAnomaly).toBe(true);
      expect(result.method).toBe('iqr');
    });

    it('should not flag values within bounds', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      detector.fit(data);

      const result = detector.detect(18);
      expect(result.isAnomaly).toBe(false);
    });

    it('should handle lower bound outliers', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      detector.fit(data);

      const result = detector.detect(-10);
      expect(result.isAnomaly).toBe(true);
    });

    it('should calculate score as distance from bounds', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      detector.fit(data);

      const result = detector.detect(100);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Modified Z-Score Detection', () => {
    let detector: StatisticalAnomalyDetector;

    beforeEach(() => {
      detector = new StatisticalAnomalyDetector({
        method: 'modified_zscore',
        modifiedZscoreThreshold: 3.5,
        minSamples: 10
      });
    });

    it('should detect anomalies using MAD', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      detector.fit(data);

      const result = detector.detect(100);
      expect(result.isAnomaly).toBe(true);
      expect(result.method).toBe('modified_zscore');
    });

    it('should be robust to existing outliers', () => {
      // Data with one outlier already present
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 100];
      detector.fit(data);

      // Should still detect another outlier
      const result = detector.detect(200);
      expect(result.isAnomaly).toBe(true);
    });

    it('should use median instead of mean', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21];
      detector.fit(data);

      const stats = detector.getStatistics();
      expect(stats?.median).toBeDefined();
      expect(stats?.mad).toBeDefined();
    });
  });

  describe('Update and Incremental Learning', () => {
    let detector: StatisticalAnomalyDetector;

    beforeEach(() => {
      detector = new StatisticalAnomalyDetector({
        method: 'zscore',
        windowSize: 20,
        minSamples: 10
      });
    });

    it('should update statistics with new data', () => {
      const initialData = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21];
      detector.fit(initialData);

      const statsBefore = detector.getStatistics();
      detector.update(25);
      const statsAfter = detector.getStatistics();

      expect(statsAfter?.mean).not.toBe(statsBefore?.mean);
    });

    it('should maintain rolling window size', () => {
      const data = Array.from({ length: 15 }, (_, i) => i + 10);
      detector.fit(data);

      detector.update(100);
      detector.update(101);
      detector.update(102);
      detector.update(103);
      detector.update(104);
      detector.update(105);

      expect(detector.getDataSize()).toBe(20);
    });

    it('should allow detection after update', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21];
      detector.fit(data);

      detector.update(22);
      detector.update(23);

      const result = detector.detect(100);
      expect(result.isAnomaly).toBeDefined();
    });
  });

  describe('Method Override', () => {
    let detector: StatisticalAnomalyDetector;

    beforeEach(() => {
      detector = new StatisticalAnomalyDetector({
        method: 'auto',
        minSamples: 10
      });
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21];
      detector.fit(data);
    });

    it('should allow method override in detect', () => {
      const zscoreResult = detector.detect(100, 'zscore');
      expect(zscoreResult.method).toBe('zscore');

      const iqrResult = detector.detect(100, 'iqr');
      expect(iqrResult.method).toBe('iqr');

      const modifiedResult = detector.detect(100, 'modified_zscore');
      expect(modifiedResult.method).toBe('modified_zscore');
    });
  });

  describe('Reset Functionality', () => {
    it('should reset detector state', () => {
      const detector = new StatisticalAnomalyDetector({ minSamples: 10 });
      detector.fit([10, 12, 14, 15, 16, 17, 18, 19, 20, 21]);

      expect(detector.isReady()).toBe(true);
      expect(detector.getDataSize()).toBeGreaterThan(0);

      detector.reset();

      expect(detector.isReady()).toBe(false);
      expect(detector.getDataSize()).toBe(0);
      expect(detector.getStatistics()).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data array', () => {
      const detector = new StatisticalAnomalyDetector();
      detector.fit([]);
      expect(detector.getDataSize()).toBe(0);
      expect(detector.isReady()).toBe(false);
    });

    it('should handle single value', () => {
      const detector = new StatisticalAnomalyDetector({ minSamples: 1 });
      detector.fit([42]);
      const result = detector.detect(100);
      expect(result.score).toBe(0); // No variance
    });

    it('should handle all identical values', () => {
      const detector = new StatisticalAnomalyDetector({ minSamples: 10 });
      detector.fit([50, 50, 50, 50, 50, 50, 50, 50, 50, 50]);
      const result = detector.detect(51);
      expect(result.score).toBe(0); // StdDev = 0
    });

    it('should handle negative values', () => {
      const detector = new StatisticalAnomalyDetector({ minSamples: 10 });
      detector.fit([-50, -40, -35, -30, -25, -20, -15, -10, -5, 0]);
      const result = detector.detect(-100);
      expect(result).toBeDefined();
    });

    it('should handle very large values', () => {
      const detector = new StatisticalAnomalyDetector({ minSamples: 10 });
      detector.fit([1e6, 1e6 + 100, 1e6 + 200, 1e6 + 300, 1e6 + 400,
                    1e6 + 500, 1e6 + 600, 1e6 + 700, 1e6 + 800, 1e6 + 900]);
      const result = detector.detect(1e6 + 10000);
      expect(result).toBeDefined();
    });
  });

  describe('Convenience Function', () => {
    it('should detect anomaly in one call', () => {
      const data = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21];
      const result = detectAnomaly(data, 100, { method: 'zscore', minSamples: 5 });

      expect(result).toBeDefined();
      expect(result.isAnomaly).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.method).toBe('zscore');
    });

    it('should use default config if not provided', () => {
      const data = Array.from({ length: 40 }, (_, i) => i + 10);
      const result = detectAnomaly(data, 100);

      expect(result).toBeDefined();
      expect(result.method).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', () => {
      const detector = new StatisticalAnomalyDetector({
        windowSize: 1000,
        minSamples: 100
      });

      const largeData = Array.from({ length: 5000 }, (_, i) =>
        50 + Math.sin(i / 100) * 10 + Math.random() * 5
      );

      const startTime = Date.now();
      detector.fit(largeData);
      const fitTime = Date.now() - startTime;

      expect(fitTime).toBeLessThan(100); // Should fit in <100ms

      const detectStart = Date.now();
      for (let i = 0; i < 100; i++) {
        detector.detect(50 + Math.random() * 100);
      }
      const detectTime = Date.now() - detectStart;

      expect(detectTime).toBeLessThan(50); // 100 detections in <50ms
    });

    it('should handle rapid updates efficiently', () => {
      const detector = new StatisticalAnomalyDetector({
        windowSize: 100,
        minSamples: 30
      });

      const initialData = Array.from({ length: 30 }, (_, i) => i + 10);
      detector.fit(initialData);

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        detector.update(50 + Math.random() * 10);
      }
      const updateTime = Date.now() - startTime;

      expect(updateTime).toBeLessThan(300); // 1000 updates in <300ms (allows for system load)
    });
  });

  describe('Real-World Scenarios', () => {
    it('should detect CPU spike anomaly', () => {
      // Simulate CPU usage data
      const normalCPU = Array.from({ length: 50 }, () => 20 + Math.random() * 10);
      const detector = new StatisticalAnomalyDetector({
        method: 'zscore',
        zscoreThreshold: 2.5,
        minSamples: 30
      });

      detector.fit(normalCPU);

      const cpuSpike = 95; // Sudden spike to 95%
      const result = detector.detect(cpuSpike);

      expect(result.isAnomaly).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect memory leak pattern', () => {
      // Simulate gradual memory increase
      const memoryUsage = Array.from({ length: 40 }, (_, i) => 500 + i * 5);
      const detector = new StatisticalAnomalyDetector({
        method: 'iqr',
        minSamples: 30
      });

      detector.fit(memoryUsage);

      // Sudden jump
      const result = detector.detect(900);
      expect(result.isAnomaly).toBe(true);
    });

    it('should detect response time degradation', () => {
      // Simulate API response times
      const normalResponseTimes = Array.from({ length: 50 }, () => 100 + Math.random() * 50);
      const detector = new StatisticalAnomalyDetector({
        method: 'modified_zscore',
        minSamples: 30
      });

      detector.fit(normalResponseTimes);

      const slowResponse = 500; // Slow response time
      const result = detector.detect(slowResponse);

      expect(result.isAnomaly).toBe(true);
    });

    it('should adapt to changing baseline', () => {
      const detector = new StatisticalAnomalyDetector({
        method: 'zscore',
        windowSize: 50,
        minSamples: 30
      });

      // Initial baseline around 100
      const initialData = Array.from({ length: 40 }, () => 100 + Math.random() * 10);
      detector.fit(initialData);

      const result1 = detector.detect(150);
      expect(result1.isAnomaly).toBe(true);

      // Shift baseline to around 150
      for (let i = 0; i < 50; i++) {
        detector.update(150 + Math.random() * 10);
      }

      // Now 150 should be normal
      const result2 = detector.detect(150);
      expect(result2.isAnomaly).toBe(false);
    });
  });
});
