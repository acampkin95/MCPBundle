/**
 * Model Versioning System
 *
 * Manages model lifecycle including versioning, metadata, and persistence.
 * Supports semantic versioning and model comparison.
 *
 * Features:
 * - Semantic versioning (major.minor.patch)
 * - Model metadata (training date, metrics, config)
 * - Model comparison and selection
 * - Filesystem-based storage
 * - Model registry
 *
 * Use Cases:
 * - Track multiple trained model versions
 * - Compare model performance metrics
 * - Roll back to previous versions
 * - A/B testing different models
 * - Model deployment management
 *
 * @module training/versioning
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Model metadata structure
 */
export interface ModelMetadata {
  modelId: string;                    // Unique model identifier
  version: string;                    // Semantic version (e.g., "1.0.0")
  modelType: 'statistical' | 'isolation-forest' | 'lstm';
  createdAt: Date;                    // Training completion timestamp
  config: Record<string, any>;        // Model configuration
  metrics: {                          // Training and validation metrics
    [key: string]: number;
  };
  tags?: string[];                    // Custom tags for organization
  description?: string;               // Model description
}

/**
 * Model version entry
 */
export interface ModelVersion {
  metadata: ModelMetadata;
  modelPath: string;                  // Path to saved model
  size: number;                       // Model file size in bytes
}

/**
 * Model versioning configuration
 */
export interface VersioningConfig {
  storageDir?: string;                // Base directory for models (default: ./models)
  maxVersions?: number;               // Max versions to keep per model (default: 10)
  autoCleanup?: boolean;              // Auto-delete old versions (default: true)
}

/**
 * Model Versioning Manager
 *
 * @example
 * ```typescript
 * const versioning = new ModelVersioning({
 *   storageDir: './trained-models',
 *   maxVersions: 5
 * });
 *
 * // Register a trained model
 * await versioning.registerModel({
 *   modelId: 'cpu-anomaly-detector',
 *   version: '1.0.0',
 *   modelType: 'statistical',
 *   createdAt: new Date(),
 *   config: { method: 'zscore', threshold: 3.0 },
 *   metrics: { accuracy: 0.95, precision: 0.93 }
 * }, './model.json');
 *
 * // List all versions
 * const versions = versioning.listVersions('cpu-anomaly-detector');
 *
 * // Get best model by metric
 * const best = versioning.getBestModel('cpu-anomaly-detector', 'accuracy');
 * ```
 */
export class ModelVersioning {
  private config: Required<VersioningConfig>;
  private registry: Map<string, ModelVersion[]>;

  constructor(config: VersioningConfig = {}) {
    this.config = {
      storageDir: config.storageDir ?? './models',
      maxVersions: config.maxVersions ?? 10,
      autoCleanup: config.autoCleanup ?? true
    };
    this.registry = new Map();
    this.loadRegistry();
  }

  /**
   * Register a new model version
   */
  public async registerModel(
    metadata: ModelMetadata,
    modelPath: string
  ): Promise<void> {
    // Validate version format
    if (!this.isValidVersion(metadata.version)) {
      throw new Error(`Invalid version format: ${metadata.version}. Use semantic versioning (e.g., 1.0.0)`);
    }

    // Ensure storage directory exists
    const modelDir = path.join(this.config.storageDir, metadata.modelId);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // Copy model to versioned storage
    const versionDir = path.join(modelDir, metadata.version);
    if (fs.existsSync(versionDir)) {
      throw new Error(`Model version ${metadata.modelId}@${metadata.version} already exists`);
    }
    fs.mkdirSync(versionDir, { recursive: true });

    const destPath = path.join(versionDir, 'model');
    this.copyDirectory(modelPath, destPath);

    // Save metadata
    const metadataPath = path.join(versionDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Get model size
    const size = this.getDirectorySize(destPath);

    // Update registry
    const version: ModelVersion = {
      metadata,
      modelPath: destPath,
      size
    };

    const versions = this.registry.get(metadata.modelId) || [];
    versions.push(version);
    this.registry.set(metadata.modelId, versions);

    // Auto-cleanup if enabled
    if (this.config.autoCleanup) {
      this.cleanup(metadata.modelId);
    }

    // Save registry
    this.saveRegistry();
  }

  /**
   * List all versions of a model
   */
  public listVersions(modelId: string): ModelVersion[] {
    return this.registry.get(modelId) || [];
  }

  /**
   * Get a specific model version
   */
  public getVersion(modelId: string, version: string): ModelVersion | null {
    const versions = this.registry.get(modelId) || [];
    return versions.find(v => v.metadata.version === version) || null;
  }

  /**
   * Get the latest version of a model
   */
  public getLatestVersion(modelId: string): ModelVersion | null {
    const versions = this.registry.get(modelId) || [];
    if (versions.length === 0) return null;

    return versions.reduce((latest, current) =>
      this.compareVersions(current.metadata.version, latest.metadata.version) > 0
        ? current
        : latest
    );
  }

  /**
   * Get the best model by a specific metric
   */
  public getBestModel(modelId: string, metric: string): ModelVersion | null {
    const versions = this.registry.get(modelId) || [];
    if (versions.length === 0) return null;

    const withMetric = versions.filter(v => v.metadata.metrics[metric] !== undefined);
    if (withMetric.length === 0) return null;

    return withMetric.reduce((best, current) =>
      current.metadata.metrics[metric] > best.metadata.metrics[metric]
        ? current
        : best
    );
  }

  /**
   * Compare two models
   */
  public compareModels(
    modelId: string,
    version1: string,
    version2: string
  ): { better: string; comparison: Record<string, { v1: number; v2: number; diff: number }> } | null {
    const v1 = this.getVersion(modelId, version1);
    const v2 = this.getVersion(modelId, version2);

    if (!v1 || !v2) return null;

    const comparison: Record<string, { v1: number; v2: number; diff: number }> = {};
    const metrics1 = v1.metadata.metrics;
    const metrics2 = v2.metadata.metrics;

    // Compare common metrics
    for (const metric in metrics1) {
      if (metrics2[metric] !== undefined) {
        comparison[metric] = {
          v1: metrics1[metric],
          v2: metrics2[metric],
          diff: metrics2[metric] - metrics1[metric]
        };
      }
    }

    // Determine which is better (by average improvement)
    const diffs = Object.values(comparison).map(c => c.diff);
    const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    const better = avgDiff > 0 ? version2 : version1;

    return { better, comparison };
  }

  /**
   * Delete a specific model version
   */
  public deleteVersion(modelId: string, version: string): void {
    const versions = this.registry.get(modelId) || [];
    const index = versions.findIndex(v => v.metadata.version === version);

    if (index === -1) {
      throw new Error(`Model version ${modelId}@${version} not found`);
    }

    // Delete files
    const versionDir = path.dirname(versions[index].modelPath);
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true });
    }

    // Update registry
    versions.splice(index, 1);
    this.registry.set(modelId, versions);
    this.saveRegistry();
  }

  /**
   * Cleanup old versions
   */
  private cleanup(modelId: string): void {
    const versions = this.registry.get(modelId) || [];
    if (versions.length <= this.config.maxVersions) return;

    // Sort by creation date
    const sorted = [...versions].sort(
      (a, b) => b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime()
    );

    // Delete oldest versions
    const toDelete = sorted.slice(this.config.maxVersions);
    for (const version of toDelete) {
      try {
        this.deleteVersion(modelId, version.metadata.version);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Load registry from disk
   */
  private loadRegistry(): void {
    const registryPath = path.join(this.config.storageDir, 'registry.json');
    if (!fs.existsSync(registryPath)) return;

    try {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      for (const [modelId, versions] of Object.entries(data)) {
        this.registry.set(
          modelId,
          (versions as any[]).map(v => ({
            ...v,
            metadata: {
              ...v.metadata,
              createdAt: new Date(v.metadata.createdAt)
            }
          }))
        );
      }
    } catch (error) {
      // Ignore errors, start fresh
    }
  }

  /**
   * Save registry to disk
   */
  private saveRegistry(): void {
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
    }

    const registryPath = path.join(this.config.storageDir, 'registry.json');
    const data = Object.fromEntries(this.registry);
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2));
  }

  /**
   * Validate semantic version format
   */
  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version);
  }

  /**
   * Compare two semantic versions
   * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Get total size of directory
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;

    if (!fs.existsSync(dirPath)) return 0;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        size += this.getDirectorySize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }

    return size;
  }

  /**
   * Get all registered model IDs
   */
  public getModelIds(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get storage statistics
   */
  public getStorageStats(): {
    totalModels: number;
    totalVersions: number;
    totalSize: number;
    models: Array<{ modelId: string; versions: number; size: number }>;
  } {
    const models = this.getModelIds().map(modelId => {
      const versions = this.listVersions(modelId);
      const size = versions.reduce((sum, v) => sum + v.size, 0);
      return { modelId, versions: versions.length, size };
    });

    return {
      totalModels: models.length,
      totalVersions: models.reduce((sum, m) => sum + m.versions, 0),
      totalSize: models.reduce((sum, m) => sum + m.size, 0),
      models
    };
  }
}
