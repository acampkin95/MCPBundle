/**
 * @mcp-bundle/ml-foundation
 *
 * Machine learning foundation library for MCP Bundle v2.0
 * Provides anomaly detection, predictive analytics, and time-series forecasting
 *
 * @module ml-foundation
 * @version 2.0.0
 */

// Statistical Anomaly Detection
export {
  StatisticalAnomalyDetector,
  detectAnomaly,
  type AnomalyResult,
  type StatisticalAnomalyConfig
} from './models/statistical-anomaly';

// ML-based Anomaly Detection
export {
  IsolationForest,
  detectAnomalyIForest,
  type IsolationForestConfig,
  type IsolationForestResult
} from './models/isolation-forest';

// Time-Series Forecasting
export {
  LSTMPredictor,
  predictTimeSeries,
  type LSTMConfig,
  type LSTMPredictionResult,
  type LSTMTrainingResult
} from './models/lstm-predictor';

// Training utilities
export {
  TrainingPipeline,
  type TrainingJobConfig,
  type TrainingOptions,
  type TrainingResult
} from './training/pipeline';

export {
  ModelVersioning,
  type ModelMetadata,
  type ModelVersion,
  type VersioningConfig
} from './training/versioning';

// Inference utilities (to be implemented)
// export { InferenceAPI } from './inference/api';
// export { ModelCache } from './inference/cache';

// Utility functions (to be implemented)
// export * from './utils/data-preprocessing';
// export * from './utils/metrics';
