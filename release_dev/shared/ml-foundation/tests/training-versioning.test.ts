/**
 * Tests for Model Versioning System
 *
 * @module tests/training-versioning
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelVersioning, type ModelMetadata } from '../src/training/versioning';
import * as fs from 'fs';
import * as path from 'path';

const TEST_STORAGE_DIR = './test-models';

describe('ModelVersioning', () => {
  let versioning: ModelVersioning;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_STORAGE_DIR)) {
      fs.rmSync(TEST_STORAGE_DIR, { recursive: true });
    }

    versioning = new ModelVersioning({
      storageDir: TEST_STORAGE_DIR,
      maxVersions: 3,
      autoCleanup: true
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_STORAGE_DIR)) {
      fs.rmSync(TEST_STORAGE_DIR, { recursive: true });
    }
  });

  describe('Model Registration', () => {
    it('should register a new model version', async () => {
      const metadata: ModelMetadata = {
        modelId: 'test-model',
        version: '1.0.0',
        modelType: 'statistical',
        createdAt: new Date(),
        config: { method: 'zscore' },
        metrics: { accuracy: 0.95 }
      };

      // Create temporary model directory
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), JSON.stringify({ test: true }));

      await versioning.registerModel(metadata, tempModelDir);

      const versions = versioning.listVersions('test-model');
      expect(versions).toHaveLength(1);
      expect(versions[0].metadata.version).toBe('1.0.0');

      // Cleanup
      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should reject invalid version format', async () => {
      const metadata: ModelMetadata = {
        modelId: 'test-model',
        version: '1.0', // Invalid: missing patch
        modelType: 'statistical',
        createdAt: new Date(),
        config: {},
        metrics: {}
      };

      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });

      await expect(versioning.registerModel(metadata, tempModelDir)).rejects.toThrow('Invalid version format');

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should reject duplicate version', async () => {
      const metadata: ModelMetadata = {
        modelId: 'test-model',
        version: '1.0.0',
        modelType: 'statistical',
        createdAt: new Date(),
        config: {},
        metrics: {}
      };

      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      await versioning.registerModel(metadata, tempModelDir);

      // Try to register same version again
      await expect(versioning.registerModel(metadata, tempModelDir)).rejects.toThrow('already exists');

      fs.rmSync(tempModelDir, { recursive: true });
    });
  });

  describe('Version Management', () => {
    it('should list all versions', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      // Register multiple versions
      for (let i = 1; i <= 3; i++) {
        const metadata: ModelMetadata = {
          modelId: 'test-model',
          version: `1.0.${i}`,
          modelType: 'statistical',
          createdAt: new Date(),
          config: {},
          metrics: { accuracy: 0.9 + i * 0.01 }
        };
        await versioning.registerModel(metadata, tempModelDir);
      }

      const versions = versioning.listVersions('test-model');
      expect(versions).toHaveLength(3);

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should get specific version', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      const metadata: ModelMetadata = {
        modelId: 'test-model',
        version: '2.5.3',
        modelType: 'lstm',
        createdAt: new Date(),
        config: {},
        metrics: {}
      };

      await versioning.registerModel(metadata, tempModelDir);

      const version = versioning.getVersion('test-model', '2.5.3');
      expect(version).not.toBeNull();
      expect(version?.metadata.version).toBe('2.5.3');

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should get latest version', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      // Register versions in non-sorted order
      const versions = ['1.0.0', '2.0.0', '1.5.0', '2.1.0'];
      for (const ver of versions) {
        const metadata: ModelMetadata = {
          modelId: 'test-model',
          version: ver,
          modelType: 'statistical',
          createdAt: new Date(),
          config: {},
          metrics: {}
        };
        await versioning.registerModel(metadata, tempModelDir);
      }

      const latest = versioning.getLatestVersion('test-model');
      expect(latest?.metadata.version).toBe('2.1.0');

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should get best model by metric', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      const metricsData = [
        { version: '1.0.0', accuracy: 0.92 },
        { version: '1.1.0', accuracy: 0.95 },
        { version: '1.2.0', accuracy: 0.93 }
      ];

      for (const data of metricsData) {
        const metadata: ModelMetadata = {
          modelId: 'test-model',
          version: data.version,
          modelType: 'statistical',
          createdAt: new Date(),
          config: {},
          metrics: { accuracy: data.accuracy }
        };
        await versioning.registerModel(metadata, tempModelDir);
      }

      const best = versioning.getBestModel('test-model', 'accuracy');
      expect(best?.metadata.version).toBe('1.1.0');
      expect(best?.metadata.metrics.accuracy).toBe(0.95);

      fs.rmSync(tempModelDir, { recursive: true });
    });
  });

  describe('Model Comparison', () => {
    it('should compare two models', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      const metadata1: ModelMetadata = {
        modelId: 'test-model',
        version: '1.0.0',
        modelType: 'statistical',
        createdAt: new Date(),
        config: {},
        metrics: { accuracy: 0.90, precision: 0.88 }
      };

      const metadata2: ModelMetadata = {
        modelId: 'test-model',
        version: '2.0.0',
        modelType: 'statistical',
        createdAt: new Date(),
        config: {},
        metrics: { accuracy: 0.95, precision: 0.92 }
      };

      await versioning.registerModel(metadata1, tempModelDir);
      await versioning.registerModel(metadata2, tempModelDir);

      const comparison = versioning.compareModels('test-model', '1.0.0', '2.0.0');
      expect(comparison).not.toBeNull();
      expect(comparison?.better).toBe('2.0.0');
      expect(comparison?.comparison.accuracy.diff).toBeCloseTo(0.05, 2);

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should return null when comparing non-existent models', () => {
      const comparison = versioning.compareModels('non-existent', '1.0.0', '2.0.0');
      expect(comparison).toBeNull();
    });
  });

  describe('Version Cleanup', () => {
    it('should auto-cleanup old versions', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      // Register 5 versions (max is 3)
      for (let i = 1; i <= 5; i++) {
        const metadata: ModelMetadata = {
          modelId: 'test-model',
          version: `1.0.${i}`,
          modelType: 'statistical',
          createdAt: new Date(Date.now() + i * 1000), // Ensure different timestamps
          config: {},
          metrics: {}
        };
        await versioning.registerModel(metadata, tempModelDir);
      }

      const versions = versioning.listVersions('test-model');
      expect(versions.length).toBeLessThanOrEqual(3);

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should delete specific version', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      const metadata: ModelMetadata = {
        modelId: 'test-model',
        version: '1.0.0',
        modelType: 'statistical',
        createdAt: new Date(),
        config: {},
        metrics: {}
      };

      await versioning.registerModel(metadata, tempModelDir);
      expect(versioning.listVersions('test-model')).toHaveLength(1);

      versioning.deleteVersion('test-model', '1.0.0');
      expect(versioning.listVersions('test-model')).toHaveLength(0);

      fs.rmSync(tempModelDir, { recursive: true });
    });
  });

  describe('Storage Statistics', () => {
    it('should calculate storage statistics', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), JSON.stringify({ data: 'test' }));

      const metadata: ModelMetadata = {
        modelId: 'test-model',
        version: '1.0.0',
        modelType: 'statistical',
        createdAt: new Date(),
        config: {},
        metrics: {}
      };

      await versioning.registerModel(metadata, tempModelDir);

      const stats = versioning.getStorageStats();
      expect(stats.totalModels).toBe(1);
      expect(stats.totalVersions).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);

      fs.rmSync(tempModelDir, { recursive: true });
    });

    it('should list all model IDs', async () => {
      const tempModelDir = './temp-model';
      fs.mkdirSync(tempModelDir, { recursive: true });
      fs.writeFileSync(path.join(tempModelDir, 'model.json'), '{}');

      const models = ['model-a', 'model-b', 'model-c'];
      for (const modelId of models) {
        const metadata: ModelMetadata = {
          modelId,
          version: '1.0.0',
          modelType: 'statistical',
          createdAt: new Date(),
          config: {},
          metrics: {}
        };
        await versioning.registerModel(metadata, tempModelDir);
      }

      const ids = versioning.getModelIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('model-a');
      expect(ids).toContain('model-b');
      expect(ids).toContain('model-c');

      fs.rmSync(tempModelDir, { recursive: true });
    });
  });
});
