/**
 * Tests for Training Pipeline
 *
 * @module tests/training-pipeline
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrainingPipeline } from '../src/training/pipeline';
import * as fs from 'fs';

const TEST_STORAGE_DIR = './test-pipeline-models';

describe('TrainingPipeline', () => {
  let pipeline: TrainingPipeline;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_STORAGE_DIR)) {
      fs.rmSync(TEST_STORAGE_DIR, { recursive: true });
    }

    pipeline = new TrainingPipeline({
      storageDir: TEST_STORAGE_DIR,
      maxVersions: 5
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_STORAGE_DIR)) {
      fs.rmSync(TEST_STORAGE_DIR, { recursive: true });
    }
  });

  describe('Statistical Model Training', () => {
    it('should train statistical anomaly detector', async () => {
      const data = Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i * 0.1) * 10);

      const result = await pipeline.trainStatistical(
        {
          modelId: 'cpu-monitor',
          modelType: 'statistical',
          version: '1.0.0',
          description: 'CPU anomaly detector'
        },
        data,
        { method: 'zscore', zscoreThreshold: 3.0 },
        { trainTestSplit: 0.8, saveModel: true }
      );

      expect(result.success).toBe(true);
      expect(result.modelId).toBe('cpu-monitor');
      expect(result.version).toBe('1.0.0');
      expect(result.metrics.train).toBeDefined();
      expect(result.metrics.test).toBeDefined();
      expect(result.metrics.train?.accuracy).toBeGreaterThan(0);
      expect(result.modelPath).toBeDefined();
    });

    it('should calculate train and test metrics', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 10);

      const result = await pipeline.trainStatistical(
        {
          modelId: 'linear-detector',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'iqr', iqrMultiplier: 1.5 },
        { trainTestSplit: 0.8 }
      );

      expect(result.metrics.train?.accuracy).toBeDefined();
      expect(result.metrics.train?.precision).toBeDefined();
      expect(result.metrics.train?.recall).toBeDefined();
      expect(result.metrics.train?.f1Score).toBeDefined();
      expect(result.metrics.test?.accuracy).toBeDefined();
    });

    it('should handle training errors gracefully', async () => {
      const result = await pipeline.trainStatistical(
        {
          modelId: 'test-model',
          modelType: 'statistical',
          version: '1.0.0'
        },
        [], // Empty data should cause error
        { method: 'zscore' },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Isolation Forest Training', () => {
    it('should train isolation forest model', async () => {
      const data = Array.from({ length: 100 }, () => [
        Math.random() * 100,
        Math.random() * 100
      ]);

      const result = await pipeline.trainIsolationForest(
        {
          modelId: 'multivariate-detector',
          modelType: 'isolation-forest',
          version: '1.0.0'
        },
        data,
        { numTrees: 50, randomSeed: 42 },
        { trainTestSplit: 0.8, randomSeed: 42 }
      );

      expect(result.success).toBe(true);
      expect(result.metrics.train).toBeDefined();
      expect(result.metrics.test).toBeDefined();
      expect(result.metrics.train?.avgScore).toBeDefined();
    });

    it('should use provided random seed', async () => {
      const data = Array.from({ length: 50 }, () => [Math.random() * 100]);

      const result1 = await pipeline.trainIsolationForest(
        {
          modelId: 'test-forest-1',
          modelType: 'isolation-forest',
          version: '1.0.0'
        },
        data,
        { numTrees: 10, randomSeed: 123 },
        { trainTestSplit: 0.8, randomSeed: 123, saveModel: false }
      );

      const result2 = await pipeline.trainIsolationForest(
        {
          modelId: 'test-forest-2',
          modelType: 'isolation-forest',
          version: '1.0.0'
        },
        data,
        { numTrees: 10, randomSeed: 123 },
        { trainTestSplit: 0.8, randomSeed: 123, saveModel: false }
      );

      // Results should be identical with same seed
      expect(result1.metrics.train?.avgScore).toBe(result2.metrics.train?.avgScore);
    });
  });

  describe('LSTM Training', () => {
    it('should train LSTM predictor', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 1);

      const result = await pipeline.trainLSTM(
        {
          modelId: 'traffic-forecast',
          modelType: 'lstm',
          version: '1.0.0'
        },
        data,
        {
          sequenceLength: 10,
          predictionHorizon: 1,
          lstmUnits: [16],
          epochs: 5,
          verbose: false
        },
        { trainTestSplit: 0.8, validationSplit: 0.2, saveModel: true }
      );

      if (!result.success) {
        console.log('LSTM training failed with error:', result.error);
      }

      expect(result.success).toBe(true);
      expect(result.metrics.train?.finalLoss).toBeDefined();
      expect(result.metrics.validation?.finalValLoss).toBeDefined();
      expect(result.metrics.test).toBeDefined();
      expect(result.modelPath).toBeDefined();
    }, 30000);

    it('should include training duration', async () => {
      const data = Array.from({ length: 50 }, (_, i) => i + 1);

      const result = await pipeline.trainLSTM(
        {
          modelId: 'quick-lstm',
          modelType: 'lstm',
          version: '1.0.0'
        },
        data,
        {
          sequenceLength: 5,
          predictionHorizon: 1,
          lstmUnits: [8],
          epochs: 3,
          verbose: false
        },
        { trainTestSplit: 0.8, saveModel: false }
      );

      expect(result.duration).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Model Versioning Integration', () => {
    it('should register trained models in versioning system', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 10);

      await pipeline.trainStatistical(
        {
          modelId: 'versioned-model',
          modelType: 'statistical',
          version: '1.0.0',
          tags: ['production', 'cpu']
        },
        data,
        { method: 'zscore' },
        { saveModel: true }
      );

      const versioning = pipeline.getVersioning();
      const versions = versioning.listVersions('versioned-model');

      expect(versions).toHaveLength(1);
      expect(versions[0].metadata.version).toBe('1.0.0');
      expect(versions[0].metadata.tags).toContain('production');
    });

    it('should support multiple versions of same model', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 10);

      // Train v1.0.0
      await pipeline.trainStatistical(
        {
          modelId: 'evolving-model',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'zscore', zscoreThreshold: 3.0 },
        { saveModel: true }
      );

      // Train v1.1.0
      await pipeline.trainStatistical(
        {
          modelId: 'evolving-model',
          modelType: 'statistical',
          version: '1.1.0'
        },
        data,
        { method: 'zscore', zscoreThreshold: 2.5 },
        { saveModel: true }
      );

      const versioning = pipeline.getVersioning();
      const versions = versioning.listVersions('evolving-model');

      expect(versions).toHaveLength(2);
      expect(versions.map(v => v.metadata.version)).toContain('1.0.0');
      expect(versions.map(v => v.metadata.version)).toContain('1.1.0');
    });

    it('should retrieve best model by metric', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 10);

      // Train multiple versions with different performance
      await pipeline.trainStatistical(
        {
          modelId: 'performance-test',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'zscore', zscoreThreshold: 3.0 },
        { saveModel: true }
      );

      await pipeline.trainStatistical(
        {
          modelId: 'performance-test',
          modelType: 'statistical',
          version: '1.1.0'
        },
        data,
        { method: 'iqr', iqrMultiplier: 1.5 },
        { saveModel: true }
      );

      const versioning = pipeline.getVersioning();
      const best = versioning.getBestModel('performance-test', 'accuracy');

      expect(best).not.toBeNull();
      expect(best?.metadata.version).toMatch(/^1\.\d+\.\d+$/);
    });
  });

  describe('Training Options', () => {
    it('should support custom train-test split', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);

      const result = await pipeline.trainStatistical(
        {
          modelId: 'split-test',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'zscore' },
        { trainTestSplit: 0.9, saveModel: false } // 90/10 split
      );

      expect(result.success).toBe(true);
      // With 90/10 split, we should have metrics for both sets
      expect(result.metrics.train).toBeDefined();
      expect(result.metrics.test).toBeDefined();
    });

    it('should allow disabling model saving', async () => {
      const data = Array.from({ length: 50 }, (_, i) => i + 10);

      const result = await pipeline.trainStatistical(
        {
          modelId: 'nosave-model',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'zscore' },
        { saveModel: false }
      );

      expect(result.success).toBe(true);
      expect(result.modelPath).toBeUndefined();

      const versioning = pipeline.getVersioning();
      const versions = versioning.listVersions('nosave-model');
      expect(versions).toHaveLength(0);
    });
  });

  describe('Job Tracking', () => {
    it('should generate unique job IDs', async () => {
      const data = Array.from({ length: 50 }, (_, i) => i);

      const result1 = await pipeline.trainStatistical(
        {
          modelId: 'job-test-1',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'zscore' },
        { saveModel: false }
      );

      const result2 = await pipeline.trainStatistical(
        {
          modelId: 'job-test-2',
          modelType: 'statistical',
          version: '1.0.0'
        },
        data,
        { method: 'zscore' },
        { saveModel: false }
      );

      expect(result1.jobId).toBeDefined();
      expect(result2.jobId).toBeDefined();
      expect(result1.jobId).not.toBe(result2.jobId);
    });

    it('should include model metadata in results', async () => {
      const data = Array.from({ length: 50 }, (_, i) => i);

      const result = await pipeline.trainStatistical(
        {
          modelId: 'metadata-test',
          modelType: 'statistical',
          version: '2.3.1',
          description: 'Test model',
          tags: ['test', 'demo']
        },
        data,
        { method: 'zscore' },
        { saveModel: false }
      );

      expect(result.modelId).toBe('metadata-test');
      expect(result.version).toBe('2.3.1');
    });
  });
});
