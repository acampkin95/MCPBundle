/**
 * Tests for module exports
 *
 * @module tests/index
 */

import { describe, it, expect } from 'vitest';
import {
  StatisticalAnomalyDetector,
  detectAnomaly,
  IsolationForest,
  detectAnomalyIForest,
  LSTMPredictor,
  predictTimeSeries,
  type AnomalyResult,
  type StatisticalAnomalyConfig,
  type IsolationForestConfig,
  type IsolationForestResult,
  type LSTMConfig,
  type LSTMPredictionResult,
  type LSTMTrainingResult
} from '../src/index';

describe('Module Exports', () => {
  describe('Statistical Anomaly Detection', () => {
    it('should export StatisticalAnomalyDetector class', () => {
      expect(StatisticalAnomalyDetector).toBeDefined();
      expect(typeof StatisticalAnomalyDetector).toBe('function');
    });

    it('should export detectAnomaly function', () => {
      expect(detectAnomaly).toBeDefined();
      expect(typeof detectAnomaly).toBe('function');
    });

    it('should be able to create StatisticalAnomalyDetector instance', () => {
      const detector = new StatisticalAnomalyDetector();
      expect(detector).toBeInstanceOf(StatisticalAnomalyDetector);
    });

    it('should be able to use detectAnomaly function', () => {
      const data = Array.from({ length: 40 }, (_, i) => i + 10);
      const result = detectAnomaly(data, 100);
      expect(result).toBeDefined();
      expect(result.isAnomaly).toBeDefined();
    });
  });

  describe('Isolation Forest', () => {
    it('should export IsolationForest class', () => {
      expect(IsolationForest).toBeDefined();
      expect(typeof IsolationForest).toBe('function');
    });

    it('should export detectAnomalyIForest function', () => {
      expect(detectAnomalyIForest).toBeDefined();
      expect(typeof detectAnomalyIForest).toBe('function');
    });

    it('should be able to create IsolationForest instance', () => {
      const forest = new IsolationForest();
      expect(forest).toBeInstanceOf(IsolationForest);
      forest.reset();
    });
  });

  describe('LSTM Time-Series Prediction', () => {
    it('should export LSTMPredictor class', () => {
      expect(LSTMPredictor).toBeDefined();
      expect(typeof LSTMPredictor).toBe('function');
    });

    it('should export predictTimeSeries function', () => {
      expect(predictTimeSeries).toBeDefined();
      expect(typeof predictTimeSeries).toBe('function');
    });

    it('should be able to create LSTMPredictor instance', () => {
      const predictor = new LSTMPredictor();
      expect(predictor).toBeInstanceOf(LSTMPredictor);
      predictor.dispose();
    });
  });

  describe('Training Pipeline', () => {
    it('should export TrainingPipeline class', async () => {
      const { TrainingPipeline } = await import('../src/index');
      expect(TrainingPipeline).toBeDefined();
      expect(typeof TrainingPipeline).toBe('function');
    });

    it('should be able to create TrainingPipeline instance', async () => {
      const { TrainingPipeline } = await import('../src/index');
      const pipeline = new TrainingPipeline();
      expect(pipeline).toBeInstanceOf(TrainingPipeline);
    });
  });

  describe('Model Versioning', () => {
    it('should export ModelVersioning class', async () => {
      const { ModelVersioning } = await import('../src/index');
      expect(ModelVersioning).toBeDefined();
      expect(typeof ModelVersioning).toBe('function');
    });

    it('should be able to create ModelVersioning instance', async () => {
      const { ModelVersioning } = await import('../src/index');
      const versioning = new ModelVersioning();
      expect(versioning).toBeInstanceOf(ModelVersioning);
    });
  });
});
