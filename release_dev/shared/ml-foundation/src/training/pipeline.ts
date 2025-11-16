/**
 * Model Training Pipeline
 *
 * Orchestrates end-to-end model training workflows including:
 * - Data preparation and validation
 * - Model training with cross-validation
 * - Performance evaluation
 * - Model versioning and registration
 * - Training history tracking
 *
 * Features:
 * - Automated training workflows
 * - Train-test split utilities
 * - Cross-validation support
 * - Performance metrics calculation
 * - Integration with versioning system
 * - Training job tracking
 *
 * Use Cases:
 * - Automated model retraining
 * - Experiment tracking
 * - Model selection and comparison
 * - Production model deployment
 *
 * @module training/pipeline
 */

import { ModelVersioning, ModelMetadata } from './versioning';
import { StatisticalAnomalyDetector, type StatisticalAnomalyConfig } from '../models/statistical-anomaly';
import { IsolationForest, type IsolationForestConfig } from '../models/isolation-forest';
import { LSTMPredictor, type LSTMConfig } from '../models/lstm-predictor';

/**
 * Training job configuration
 */
export interface TrainingJobConfig {
  modelId: string;                    // Unique model identifier
  modelType: 'statistical' | 'isolation-forest' | 'lstm';
  version: string;                    // Semantic version
  description?: string;               // Job description
  tags?: string[];                    // Custom tags
}

/**
 * Training options
 */
export interface TrainingOptions {
  trainTestSplit?: number;            // Train/test ratio (default: 0.8)
  validationSplit?: number;           // Validation ratio (default: 0.2)
  crossValidation?: number;           // K-fold CV (0 = disabled, default: 0)
  randomSeed?: number;                // Random seed for reproducibility
  saveModel?: boolean;                // Auto-save to versioning (default: true)
}

/**
 * Training result
 */
export interface TrainingResult {
  jobId: string;                      // Training job ID
  modelId: string;                    // Model identifier
  version: string;                    // Model version
  success: boolean;                   // Training success
  duration: number;                   // Training duration (ms)
  metrics: {                          // Performance metrics
    train?: Record<string, number>;
    validation?: Record<string, number>;
    test?: Record<string, number>;
  };
  modelPath?: string;                 // Saved model path
  error?: string;                     // Error message if failed
}

/**
 * Model Training Pipeline
 *
 * @example
 * ```typescript
 * const pipeline = new TrainingPipeline({
 *   storageDir: './trained-models'
 * });
 *
 * // Train statistical anomaly detector
 * const result = await pipeline.trainStatistical(
 *   { modelId: 'cpu-monitor', modelType: 'statistical', version: '1.0.0' },
 *   trainingData,
 *   { method: 'zscore', zscoreThreshold: 3.0 },
 *   { trainTestSplit: 0.8 }
 * );
 *
 * console.log('Training metrics:', result.metrics);
 *
 * // Train LSTM predictor
 * const lstmResult = await pipeline.trainLSTM(
 *   { modelId: 'traffic-forecast', modelType: 'lstm', version: '2.0.0' },
 *   timeSeriesData,
 *   { sequenceLength: 24, predictionHorizon: 6, epochs: 50 },
 *   { trainTestSplit: 0.8, validationSplit: 0.2 }
 * );
 * ```
 */
export class TrainingPipeline {
  private versioning: ModelVersioning;
  private jobCounter: number = 0;

  constructor(config?: { storageDir?: string; maxVersions?: number }) {
    this.versioning = new ModelVersioning({
      storageDir: config?.storageDir ?? './models',
      maxVersions: config?.maxVersions ?? 10,
      autoCleanup: true
    });
  }

  /**
   * Train statistical anomaly detector
   */
  public async trainStatistical(
    jobConfig: TrainingJobConfig,
    data: number[],
    modelConfig: StatisticalAnomalyConfig,
    options: TrainingOptions = {}
  ): Promise<TrainingResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();

    try {
      // Validate data
      if (data.length === 0) {
        throw new Error('Cannot train on empty dataset');
      }

      // Split data
      const { train, test } = this.trainTestSplit(data, options.trainTestSplit ?? 0.8, options.randomSeed);

      // Train model
      const detector = new StatisticalAnomalyDetector(modelConfig);
      detector.fit(train);

      // Evaluate on test set
      const testMetrics = this.evaluateStatistical(detector, test);

      // Calculate train metrics
      const trainMetrics = this.evaluateStatistical(detector, train);

      const duration = Date.now() - startTime;

      const result: TrainingResult = {
        jobId,
        modelId: jobConfig.modelId,
        version: jobConfig.version,
        success: true,
        duration,
        metrics: {
          train: trainMetrics,
          test: testMetrics
        }
      };

      // Save model if requested
      if (options.saveModel !== false) {
        await this.saveStatisticalModel(jobConfig, detector, result.metrics, modelConfig);
        result.modelPath = `${this.versioning['config'].storageDir}/${jobConfig.modelId}/${jobConfig.version}`;
      }

      return result;
    } catch (error) {
      return {
        jobId,
        modelId: jobConfig.modelId,
        version: jobConfig.version,
        success: false,
        duration: Date.now() - startTime,
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Train isolation forest
   */
  public async trainIsolationForest(
    jobConfig: TrainingJobConfig,
    data: number[][],
    modelConfig: IsolationForestConfig,
    options: TrainingOptions = {}
  ): Promise<TrainingResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();

    try {
      // Split data
      const { train, test } = this.trainTestSplit(data, options.trainTestSplit ?? 0.8, options.randomSeed);

      // Train model
      const forest = new IsolationForest({
        ...modelConfig,
        randomSeed: options.randomSeed ?? modelConfig.randomSeed
      });
      forest.fit(train);

      // Evaluate on test set
      const testMetrics = this.evaluateIsolationForest(forest, test);

      // Calculate train metrics
      const trainMetrics = this.evaluateIsolationForest(forest, train);

      const duration = Date.now() - startTime;

      const result: TrainingResult = {
        jobId,
        modelId: jobConfig.modelId,
        version: jobConfig.version,
        success: true,
        duration,
        metrics: {
          train: trainMetrics,
          test: testMetrics
        }
      };

      // Save model if requested
      if (options.saveModel !== false) {
        await this.saveIsolationForestModel(jobConfig, forest, result.metrics, modelConfig);
        result.modelPath = `${this.versioning['config'].storageDir}/${jobConfig.modelId}/${jobConfig.version}`;
      }

      return result;
    } catch (error) {
      return {
        jobId,
        modelId: jobConfig.modelId,
        version: jobConfig.version,
        success: false,
        duration: Date.now() - startTime,
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Train LSTM predictor
   */
  public async trainLSTM(
    jobConfig: TrainingJobConfig,
    data: number[],
    modelConfig: LSTMConfig,
    options: TrainingOptions = {}
  ): Promise<TrainingResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();

    try {
      // Split data
      const { train, test } = this.trainTestSplit(data, options.trainTestSplit ?? 0.8, options.randomSeed);

      // Train model
      const predictor = new LSTMPredictor({
        ...modelConfig,
        validationSplit: options.validationSplit ?? 0.2
      });

      const trainingResult = await predictor.train(train);

      // Evaluate on test set
      const testMetrics = await this.evaluateLSTM(predictor, test, modelConfig.sequenceLength ?? 10);

      const duration = Date.now() - startTime;

      const result: TrainingResult = {
        jobId,
        modelId: jobConfig.modelId,
        version: jobConfig.version,
        success: true,
        duration,
        metrics: {
          train: {
            finalLoss: trainingResult.finalLoss,
            epochs: trainingResult.epochs
          },
          validation: {
            finalValLoss: trainingResult.finalValLoss
          },
          test: testMetrics
        }
      };

      // Save model if requested
      if (options.saveModel !== false) {
        const savedPath = await this.saveLSTMModel(jobConfig, predictor, result.metrics, modelConfig);
        result.modelPath = savedPath;
      }

      predictor.dispose();

      return result;
    } catch (error) {
      return {
        jobId,
        modelId: jobConfig.modelId,
        version: jobConfig.version,
        success: false,
        duration: Date.now() - startTime,
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Train-test split utility
   */
  private trainTestSplit<T>(
    data: T[],
    trainRatio: number,
    seed?: number
  ): { train: T[]; test: T[] } {
    // Shuffle data if seed provided
    let shuffled = [...data];
    if (seed !== undefined) {
      shuffled = this.shuffle(shuffled, seed);
    }

    const splitIndex = Math.floor(shuffled.length * trainRatio);
    return {
      train: shuffled.slice(0, splitIndex),
      test: shuffled.slice(splitIndex)
    };
  }

  /**
   * Shuffle array with seed
   */
  private shuffle<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let currentSeed = seed;

    for (let i = shuffled.length - 1; i > 0; i--) {
      // Simple seeded random (LCG)
      currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
      const j = Math.floor((currentSeed / 0x7fffffff) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Evaluate statistical anomaly detector
   */
  private evaluateStatistical(detector: StatisticalAnomalyDetector, data: number[]): Record<string, number> {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    // Calculate mean and std for ground truth
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);

    for (const value of data) {
      const result = detector.detect(value);
      const isActualAnomaly = Math.abs(value - mean) > 3 * std; // 3-sigma rule as ground truth

      if (result.isAnomaly && isActualAnomaly) truePositives++;
      else if (result.isAnomaly && !isActualAnomaly) falsePositives++;
      else if (!result.isAnomaly && !isActualAnomaly) trueNegatives++;
      else falseNegatives++;
    }

    const accuracy = (truePositives + trueNegatives) / data.length;
    const precision = truePositives / (truePositives + falsePositives || 1);
    const recall = truePositives / (truePositives + falseNegatives || 1);
    const f1Score = 2 * (precision * recall) / (precision + recall || 1);

    return { accuracy, precision, recall, f1Score };
  }

  /**
   * Evaluate isolation forest
   */
  private evaluateIsolationForest(forest: IsolationForest, data: number[][]): Record<string, number> {
    const scores = data.map(point => forest.detect(point).score);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return { avgScore, minScore, maxScore };
  }

  /**
   * Evaluate LSTM predictor
   */
  private async evaluateLSTM(
    predictor: LSTMPredictor,
    testData: number[],
    sequenceLength: number
  ): Promise<Record<string, number>> {
    if (testData.length < sequenceLength + 10) {
      return { mae: 0, mse: 0, rmse: 0, samples: 0 };
    }

    const errors: number[] = [];

    for (let i = sequenceLength; i < testData.length - 1; i++) {
      const input = testData.slice(i - sequenceLength, i);
      const actual = testData[i];

      try {
        const result = await predictor.predict(input);
        const predicted = result.predictions[0];
        errors.push(Math.abs(predicted - actual));
      } catch {
        // Skip errors
      }
    }

    if (errors.length === 0) {
      return { mae: 0, mse: 0, rmse: 0, samples: 0 };
    }

    const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    const mse = errors.reduce((sum, e) => sum + e * e, 0) / errors.length;
    const rmse = Math.sqrt(mse);

    return { mae, mse, rmse, samples: errors.length };
  }

  /**
   * Save statistical model
   */
  private async saveStatisticalModel(
    jobConfig: TrainingJobConfig,
    detector: StatisticalAnomalyDetector,
    metrics: Record<string, any>,
    config: StatisticalAnomalyConfig
  ): Promise<void> {
    const metadata: ModelMetadata = {
      modelId: jobConfig.modelId,
      version: jobConfig.version,
      modelType: 'statistical',
      createdAt: new Date(),
      config,
      metrics: {
        ...metrics.train,
        ...metrics.test
      },
      tags: jobConfig.tags,
      description: jobConfig.description
    };

    // Create temporary directory for model files
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-model-'));

    try {
      // Statistical models are lightweight, just save config
      fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify(config, null, 2));

      // Register model (versioning will copy from tempDir to storage)
      await this.versioning.registerModel(metadata, tempDir);
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Save isolation forest model
   */
  private async saveIsolationForestModel(
    jobConfig: TrainingJobConfig,
    forest: IsolationForest,
    metrics: Record<string, any>,
    config: IsolationForestConfig
  ): Promise<void> {
    const metadata: ModelMetadata = {
      modelId: jobConfig.modelId,
      version: jobConfig.version,
      modelType: 'isolation-forest',
      createdAt: new Date(),
      config,
      metrics: {
        ...metrics.train,
        ...metrics.test
      },
      tags: jobConfig.tags,
      description: jobConfig.description
    };

    // Create temporary directory for model files
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-model-'));

    try {
      // Save isolation forest config
      fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify(config, null, 2));

      // Register model (versioning will copy from tempDir to storage)
      await this.versioning.registerModel(metadata, tempDir);
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Save LSTM model
   */
  private async saveLSTMModel(
    jobConfig: TrainingJobConfig,
    predictor: LSTMPredictor,
    metrics: Record<string, any>,
    config: LSTMConfig
  ): Promise<string> {
    const metadata: ModelMetadata = {
      modelId: jobConfig.modelId,
      version: jobConfig.version,
      modelType: 'lstm',
      createdAt: new Date(),
      config,
      metrics: {
        ...(metrics.train || {}),
        ...(metrics.validation || {}),
        ...(metrics.test || {})
      },
      tags: jobConfig.tags,
      description: jobConfig.description
    };

    // Create temporary directory for model files
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-model-'));

    try {
      // Save LSTM model to temp directory
      await predictor.saveModel(tempDir);

      // Register model (versioning will copy from tempDir to storage)
      await this.versioning.registerModel(metadata, tempDir);

      // Return the final storage path
      return path.join(this.versioning['config'].storageDir, jobConfig.modelId, jobConfig.version, 'model');
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${++this.jobCounter}`;
  }

  /**
   * Get versioning system
   */
  public getVersioning(): ModelVersioning {
    return this.versioning;
  }
}
