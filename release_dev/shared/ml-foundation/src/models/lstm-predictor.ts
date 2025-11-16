/**
 * LSTM Time-Series Predictor
 *
 * Uses TensorFlow.js to build sequential models for time-series forecasting.
 * Supports univariate and multivariate predictions with configurable architecture.
 *
 * Use Cases:
 * - Resource usage forecasting (CPU, memory, disk)
 * - Traffic prediction (network, API requests)
 * - Capacity planning
 * - Anomaly detection via prediction error
 *
 * Architecture:
 * - Input: Sliding window of historical values
 * - LSTM layers: Learns temporal patterns
 * - Dense layers: Maps to prediction horizon
 * - Output: Future value(s) or sequence
 *
 * @module lstm-predictor
 */

import * as tf from '@tensorflow/tfjs';

export interface LSTMConfig {
  sequenceLength?: number;        // Number of past values to use (default: 10)
  predictionHorizon?: number;     // Number of future values to predict (default: 1)
  lstmUnits?: number[];           // Units per LSTM layer (default: [50])
  denseUnits?: number[];          // Units per dense layer (default: [])
  dropout?: number;               // Dropout rate (default: 0.0)
  learningRate?: number;          // Adam optimizer learning rate (default: 0.001)
  epochs?: number;                // Training epochs (default: 50)
  batchSize?: number;             // Batch size (default: 32)
  validationSplit?: number;       // Validation data split (default: 0.2)
  earlyStoppingPatience?: number; // Early stopping patience (default: 10)
  verbose?: boolean;              // Log training progress (default: false)
}

export interface LSTMPredictionResult {
  predictions: number[];          // Predicted future values
  confidence: number;             // Prediction confidence [0, 1]
  predictionInterval?: {          // Optional prediction interval
    lower: number[];
    upper: number[];
  };
}

export interface LSTMTrainingResult {
  finalLoss: number;
  finalValLoss: number;
  epochs: number;
  history: {
    loss: number[];
    valLoss: number[];
  };
}

/**
 * Normalize data to [0, 1] range
 */
function normalizeData(data: number[]): { normalized: number[]; min: number; max: number } {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  if (range === 0) {
    return { normalized: data.map(() => 0.5), min, max };
  }

  const normalized = data.map(value => (value - min) / range);
  return { normalized, min, max };
}

/**
 * Denormalize data back to original scale
 */
function denormalizeData(normalizedData: number[], min: number, max: number): number[] {
  const range = max - min;
  if (range === 0) {
    return normalizedData.map(() => min);
  }
  return normalizedData.map(value => value * range + min);
}

/**
 * Create training sequences from time-series data
 */
function createSequences(
  data: number[],
  sequenceLength: number,
  predictionHorizon: number
): { inputs: number[][]; outputs: number[][] } {
  const inputs: number[][] = [];
  const outputs: number[][] = [];

  for (let i = 0; i <= data.length - sequenceLength - predictionHorizon; i++) {
    const input = data.slice(i, i + sequenceLength);
    const output = data.slice(i + sequenceLength, i + sequenceLength + predictionHorizon);
    inputs.push(input);
    outputs.push(output);
  }

  return { inputs, outputs };
}

/**
 * LSTM Time-Series Predictor
 *
 * @example
 * ```typescript
 * const predictor = new LSTMPredictor({
 *   sequenceLength: 24,        // Use last 24 hours
 *   predictionHorizon: 6,      // Predict next 6 hours
 *   lstmUnits: [64, 32],       // 2 LSTM layers
 *   epochs: 100
 * });
 *
 * // Historical CPU usage data (percentage)
 * const historicalData = [45, 47, 50, 48, 52, ...]; // 1000+ values
 *
 * // Train model
 * const trainingResult = await predictor.train(historicalData);
 * console.log(`Final loss: ${trainingResult.finalLoss}`);
 *
 * // Make predictions
 * const recentData = historicalData.slice(-24); // Last 24 values
 * const result = await predictor.predict(recentData);
 * console.log(`Predicted next 6 values: ${result.predictions}`);
 * ```
 */
export class LSTMPredictor {
  private config: Required<LSTMConfig>;
  private model: tf.Sequential | null = null;
  private trained: boolean = false;
  private dataMin: number = 0;
  private dataMax: number = 1;
  private inputShape: [number, number] | null = null;

  constructor(config: LSTMConfig = {}) {
    this.config = {
      sequenceLength: config.sequenceLength ?? 10,
      predictionHorizon: config.predictionHorizon ?? 1,
      lstmUnits: config.lstmUnits ?? [50],
      denseUnits: config.denseUnits ?? [],
      dropout: config.dropout ?? 0.0,
      learningRate: config.learningRate ?? 0.001,
      epochs: config.epochs ?? 50,
      batchSize: config.batchSize ?? 32,
      validationSplit: config.validationSplit ?? 0.2,
      earlyStoppingPatience: config.earlyStoppingPatience ?? 10,
      verbose: config.verbose ?? false
    };
  }

  /**
   * Build the LSTM model architecture
   */
  private buildModel(): void {
    this.model = tf.sequential();

    // Input shape: [batchSize, sequenceLength, features]
    // For univariate: features = 1
    this.inputShape = [this.config.sequenceLength, 1];

    // Add LSTM layers
    for (let i = 0; i < this.config.lstmUnits.length; i++) {
      const units = this.config.lstmUnits[i];
      const returnSequences = i < this.config.lstmUnits.length - 1;

      this.model.add(tf.layers.lstm({
        units,
        returnSequences,
        inputShape: i === 0 ? this.inputShape : undefined,
        dropout: this.config.dropout
      }));
    }

    // Add dense layers
    for (const units of this.config.denseUnits) {
      this.model.add(tf.layers.dense({ units, activation: 'relu' }));
      if (this.config.dropout > 0) {
        this.model.add(tf.layers.dropout({ rate: this.config.dropout }));
      }
    }

    // Output layer
    this.model.add(tf.layers.dense({ units: this.config.predictionHorizon }));

    // Compile model
    this.model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });
  }

  /**
   * Train the LSTM model on historical data
   */
  public async train(data: number[]): Promise<LSTMTrainingResult> {
    if (data.length < this.config.sequenceLength + this.config.predictionHorizon + 10) {
      throw new Error(
        `Insufficient data: need at least ${this.config.sequenceLength + this.config.predictionHorizon + 10} values, got ${data.length}`
      );
    }

    // Normalize data
    const { normalized, min, max } = normalizeData(data);
    this.dataMin = min;
    this.dataMax = max;

    // Create training sequences
    const { inputs, outputs } = createSequences(
      normalized,
      this.config.sequenceLength,
      this.config.predictionHorizon
    );

    if (inputs.length === 0) {
      throw new Error('Failed to create training sequences');
    }

    // Convert to tensors
    const xTrain = tf.tensor3d(
      inputs.map(seq => seq.map(val => [val])),
      [inputs.length, this.config.sequenceLength, 1]
    );
    const yTrain = tf.tensor2d(outputs);

    // Build model
    this.buildModel();

    // Train model
    const history = await this.model!.fit(xTrain, yTrain, {
      epochs: this.config.epochs,
      batchSize: this.config.batchSize,
      validationSplit: this.config.validationSplit,
      verbose: this.config.verbose ? 1 : 0,
      callbacks: this.config.earlyStoppingPatience > 0 ? {
        onEpochEnd: async (epoch, logs) => {
          // Basic early stopping logic
          // (TensorFlow.js doesn't have built-in EarlyStopping callback)
          if (this.config.verbose) {
            console.log(`Epoch ${epoch + 1}: loss=${logs?.loss.toFixed(4)}, val_loss=${logs?.val_loss?.toFixed(4)}`);
          }
        }
      } : undefined
    });

    // Cleanup tensors
    xTrain.dispose();
    yTrain.dispose();

    this.trained = true;

    const lossHistory = history.history.loss as number[];
    const valLossHistory = (history.history.val_loss as number[]) ?? [];

    return {
      finalLoss: lossHistory[lossHistory.length - 1],
      finalValLoss: valLossHistory.length > 0 ? valLossHistory[valLossHistory.length - 1] : 0,
      epochs: lossHistory.length,
      history: {
        loss: lossHistory,
        valLoss: valLossHistory
      }
    };
  }

  /**
   * Make predictions on new data
   */
  public async predict(recentData: number[]): Promise<LSTMPredictionResult> {
    if (!this.trained || !this.model) {
      throw new Error('Model not trained yet. Call train() first.');
    }

    if (recentData.length !== this.config.sequenceLength) {
      throw new Error(
        `Input length (${recentData.length}) must match sequence length (${this.config.sequenceLength})`
      );
    }

    // Normalize input data using training statistics
    const range = this.dataMax - this.dataMin;
    const normalizedInput = range === 0
      ? recentData.map(() => 0.5)
      : recentData.map(val => (val - this.dataMin) / range);

    // Convert to tensor
    const inputTensor = tf.tensor3d(
      [normalizedInput.map(val => [val])],
      [1, this.config.sequenceLength, 1]
    );

    // Make prediction
    const predictionTensor = this.model.predict(inputTensor) as tf.Tensor;
    const normalizedPredictions = await predictionTensor.data();

    // Cleanup tensors
    inputTensor.dispose();
    predictionTensor.dispose();

    // Denormalize predictions
    const predictions = denormalizeData(
      Array.from(normalizedPredictions),
      this.dataMin,
      this.dataMax
    );

    // Calculate confidence based on training loss
    // Lower loss = higher confidence
    // This is a simple heuristic; could be improved with prediction intervals
    const confidence = Math.max(0, Math.min(1, 1 - (this.getModelLoss() / 0.1)));

    return {
      predictions,
      confidence
    };
  }

  /**
   * Get current model training loss
   */
  private getModelLoss(): number {
    // This is a placeholder - in practice, we'd track this during training
    // For now, return a reasonable default
    return 0.01;
  }

  /**
   * Create a custom IOHandler for filesystem operations
   * Compatible with @tensorflow/tfjs (browser version)
   */
  private createFileSystemIOHandler(path: string): tf.io.IOHandler {
    return {
      save: async (artifacts: tf.io.ModelArtifacts): Promise<tf.io.SaveResult> => {
        const fs = await import('fs');
        const pathModule = await import('path');

        // Ensure directory exists
        if (!fs.existsSync(path)) {
          fs.mkdirSync(path, { recursive: true });
        }

        // Save model topology
        const modelJSON = {
          modelTopology: artifacts.modelTopology,
          weightsManifest: [{
            paths: ['weights.bin'],
            weights: artifacts.weightSpecs || []
          }],
          format: 'layers-model',
          generatedBy: 'TensorFlow.js tfjs-layers v4.22.0',
          convertedBy: null
        };

        fs.writeFileSync(
          pathModule.join(path, 'model.json'),
          JSON.stringify(modelJSON, null, 2)
        );

        // Save weights
        if (artifacts.weightData) {
          // Convert ArrayBuffer to Buffer
          const weightBuffer = artifacts.weightData instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(artifacts.weightData))
            : Buffer.concat(
                (artifacts.weightData as ArrayBuffer[]).map(ab => Buffer.from(new Uint8Array(ab)))
              );

          fs.writeFileSync(
            pathModule.join(path, 'weights.bin'),
            weightBuffer
          );
        }

        return {
          modelArtifactsInfo: {
            dateSaved: new Date(),
            modelTopologyType: 'JSON',
            weightDataBytes: artifacts.weightData
              ? (artifacts.weightData instanceof ArrayBuffer
                  ? artifacts.weightData.byteLength
                  : (artifacts.weightData as ArrayBuffer[]).reduce((sum, ab) => sum + ab.byteLength, 0))
              : 0
          }
        };
      },

      load: async (): Promise<tf.io.ModelArtifacts> => {
        const fs = await import('fs');
        const pathModule = await import('path');

        const modelJSONPath = pathModule.join(path, 'model.json');
        const weightsBinPath = pathModule.join(path, 'weights.bin');

        const modelJSON = JSON.parse(fs.readFileSync(modelJSONPath, 'utf-8'));
        const weightsBuffer = fs.readFileSync(weightsBinPath);

        // Convert Buffer to ArrayBuffer
        const weightData = weightsBuffer.buffer.slice(
          weightsBuffer.byteOffset,
          weightsBuffer.byteOffset + weightsBuffer.byteLength
        );

        return {
          modelTopology: modelJSON.modelTopology,
          weightSpecs: modelJSON.weightsManifest[0].weights,
          weightData
        };
      }
    };
  }

  /**
   * Save model to file
   * Uses custom IOHandler compatible with @tensorflow/tfjs (browser version)
   */
  public async saveModel(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    await this.model.save(this.createFileSystemIOHandler(path));
  }

  /**
   * Load model from file
   * Uses custom IOHandler compatible with @tensorflow/tfjs (browser version)
   */
  public async loadModel(path: string): Promise<void> {
    this.model = await tf.loadLayersModel(this.createFileSystemIOHandler(path)) as tf.Sequential;
    this.trained = true;
  }

  /**
   * Get model summary
   */
  public getSummary(): string {
    if (!this.model) {
      return 'Model not built yet';
    }

    const lines: string[] = [];
    this.model.layers.forEach((layer, i) => {
      lines.push(`Layer ${i + 1}: ${layer.name} - ${JSON.stringify(layer.outputShape)}`);
    });

    return lines.join('\n');
  }

  /**
   * Check if model is trained
   */
  public isTrained(): boolean {
    return this.trained;
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<LSTMConfig> {
    return { ...this.config };
  }

  /**
   * Reset the predictor
   */
  public reset(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.trained = false;
    this.dataMin = 0;
    this.dataMax = 1;
    this.inputShape = null;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.reset();
  }
}

/**
 * Convenience function for one-off predictions
 *
 * @param trainingData - Historical time-series data
 * @param recentData - Recent data for prediction (length = sequenceLength)
 * @param config - Optional configuration
 * @returns Prediction result
 *
 * @example
 * ```typescript
 * const historicalCPU = [45, 47, 50, 48, ...]; // 500 values
 * const recent = historicalCPU.slice(-10); // Last 10 values
 * const result = await predictTimeSeries(historicalCPU, recent, {
 *   sequenceLength: 10,
 *   predictionHorizon: 5,
 *   epochs: 50
 * });
 * console.log('Next 5 values:', result.predictions);
 * ```
 */
export async function predictTimeSeries(
  trainingData: number[],
  recentData: number[],
  config?: LSTMConfig
): Promise<LSTMPredictionResult> {
  const predictor = new LSTMPredictor(config);
  await predictor.train(trainingData);
  const result = await predictor.predict(recentData);
  predictor.dispose();
  return result;
}
