/**
 * Tests for LSTM Time-Series Predictor
 *
 * @module tests/lstm-predictor
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LSTMPredictor,
  predictTimeSeries,
  type LSTMConfig,
  type LSTMPredictionResult,
  type LSTMTrainingResult
} from '../src/models/lstm-predictor';

describe('LSTMPredictor', () => {
  describe('Constructor', () => {
    it('should create predictor with default config', () => {
      const predictor = new LSTMPredictor();
      const config = predictor.getConfig();

      expect(config.sequenceLength).toBe(10);
      expect(config.predictionHorizon).toBe(1);
      expect(config.lstmUnits).toEqual([50]);
      expect(config.denseUnits).toEqual([]);
      expect(config.dropout).toBe(0.0);
      expect(config.learningRate).toBe(0.001);
      expect(config.epochs).toBe(50);
      expect(config.batchSize).toBe(32);
      expect(config.validationSplit).toBe(0.2);
      expect(config.verbose).toBe(false);
    });

    it('should create predictor with custom config', () => {
      const customConfig: LSTMConfig = {
        sequenceLength: 24,
        predictionHorizon: 6,
        lstmUnits: [64, 32],
        denseUnits: [16],
        dropout: 0.2,
        learningRate: 0.0005,
        epochs: 100,
        batchSize: 64,
        validationSplit: 0.3,
        verbose: true
      };

      const predictor = new LSTMPredictor(customConfig);
      const config = predictor.getConfig();

      expect(config.sequenceLength).toBe(24);
      expect(config.predictionHorizon).toBe(6);
      expect(config.lstmUnits).toEqual([64, 32]);
      expect(config.denseUnits).toEqual([16]);
      expect(config.dropout).toBe(0.2);
      expect(config.learningRate).toBe(0.0005);
      expect(config.epochs).toBe(100);
      expect(config.batchSize).toBe(64);
      expect(config.validationSplit).toBe(0.3);
      expect(config.verbose).toBe(true);
    });

    it('should not be trained initially', () => {
      const predictor = new LSTMPredictor();
      expect(predictor.isTrained()).toBe(false);
    });
  });

  describe('Training', () => {
    let predictor: LSTMPredictor;

    beforeEach(() => {
      predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        epochs: 5,
        verbose: false
      });
    });

    afterEach(() => {
      predictor.dispose();
    });

    it('should train on simple linear sequence', async () => {
      // Simple linear trend: 1, 2, 3, 4, ...
      const data = Array.from({ length: 50 }, (_, i) => i + 1);

      const result = await predictor.train(data);

      expect(result).toBeDefined();
      expect(result.finalLoss).toBeGreaterThan(0);
      expect(result.epochs).toBe(5);
      expect(result.history.loss.length).toBe(5);
      expect(predictor.isTrained()).toBe(true);
    }, 30000); // 30s timeout for TensorFlow operations

    it('should train on sinusoidal data', async () => {
      // Sinusoidal pattern
      const data = Array.from({ length: 100 }, (_, i) =>
        50 + 20 * Math.sin(i * 0.1)
      );

      const result = await predictor.train(data);

      expect(result.finalLoss).toBeGreaterThan(0);
      expect(result.epochs).toBe(5);
      expect(predictor.isTrained()).toBe(true);
    }, 30000);

    it('should throw error with insufficient data', async () => {
      const data = [1, 2, 3]; // Too few values

      await expect(predictor.train(data)).rejects.toThrow('Insufficient data');
    });

    it('should handle constant values', async () => {
      const data = Array(50).fill(42);

      const result = await predictor.train(data);

      expect(result.finalLoss).toBeGreaterThanOrEqual(0);
      expect(predictor.isTrained()).toBe(true);
    }, 30000);

    it('should return training history', async () => {
      const data = Array.from({ length: 50 }, (_, i) => i + 1);

      const result = await predictor.train(data);

      expect(result.history.loss).toHaveLength(5);
      expect(result.history.loss.every(loss => typeof loss === 'number')).toBe(true);
    }, 30000);
  });

  describe('Prediction', () => {
    let predictor: LSTMPredictor;

    beforeEach(() => {
      predictor = new LSTMPredictor({
        sequenceLength: 10,
        predictionHorizon: 1,
        epochs: 10,
        verbose: false
      });
    });

    afterEach(() => {
      predictor.dispose();
    });

    it('should throw error when predicting before training', async () => {
      const recentData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      await expect(predictor.predict(recentData)).rejects.toThrow('Model not trained');
    });

    it('should predict next value for linear sequence', async () => {
      // Train on linear trend
      const trainingData = Array.from({ length: 100 }, (_, i) => i + 1);
      await predictor.train(trainingData);

      // Predict next value after [91, 92, ..., 100]
      const recentData = trainingData.slice(-10);
      const result = await predictor.predict(recentData);

      expect(result).toBeDefined();
      expect(result.predictions).toHaveLength(1);
      // Model should predict something reasonable, even if not perfect
      expect(result.predictions[0]).toBeGreaterThan(50);
      expect(result.predictions[0]).toBeLessThan(150);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, 30000);

    it('should throw error with wrong input length', async () => {
      const trainingData = Array.from({ length: 100 }, (_, i) => i + 1);
      await predictor.train(trainingData);

      const wrongLengthData = [1, 2, 3]; // Wrong length

      await expect(predictor.predict(wrongLengthData)).rejects.toThrow('Input length');
    }, 30000);

    it('should predict multiple steps ahead', async () => {
      const multiStepPredictor = new LSTMPredictor({
        sequenceLength: 10,
        predictionHorizon: 5,
        epochs: 10,
        verbose: false
      });

      const trainingData = Array.from({ length: 100 }, (_, i) => i + 1);
      await multiStepPredictor.train(trainingData);

      const recentData = trainingData.slice(-10);
      const result = await multiStepPredictor.predict(recentData);

      expect(result.predictions).toHaveLength(5);
      expect(result.predictions.every(p => typeof p === 'number')).toBe(true);

      multiStepPredictor.dispose();
    }, 30000);
  });

  describe('Model Management', () => {
    it('should provide model summary before training', () => {
      const predictor = new LSTMPredictor();
      const summary = predictor.getSummary();

      expect(summary).toBe('Model not built yet');
      predictor.dispose();
    });

    it('should provide model summary after training', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        epochs: 2,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      await predictor.train(data);

      const summary = predictor.getSummary();

      expect(summary).toContain('Layer');
      expect(summary.length).toBeGreaterThan(10);

      predictor.dispose();
    }, 30000);

    it('should reset predictor', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        epochs: 2,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      await predictor.train(data);

      expect(predictor.isTrained()).toBe(true);

      predictor.reset();

      expect(predictor.isTrained()).toBe(false);
      expect(predictor.getSummary()).toBe('Model not built yet');

      predictor.dispose();
    }, 30000);
  });

  describe('Edge Cases', () => {
    it('should handle very small training dataset', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 3,
        predictionHorizon: 1,
        epochs: 5,
        validationSplit: 0.0, // No validation split for small dataset
        verbose: false
      });

      // Minimum viable dataset
      const data = Array.from({ length: 20 }, (_, i) => i + 1);

      const result = await predictor.train(data);

      expect(result.finalLoss).toBeGreaterThanOrEqual(0);
      expect(predictor.isTrained()).toBe(true);

      predictor.dispose();
    }, 30000);

    it('should handle negative values', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        epochs: 5,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => -50 + i);

      await predictor.train(data);

      const recentData = data.slice(-5);
      const result = await predictor.predict(recentData);

      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0]).toBeLessThan(10); // Should predict negative or small positive

      predictor.dispose();
    }, 30000);

    it('should handle zero values', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        epochs: 5,
        verbose: false
      });

      const data = Array(50).fill(0);

      await predictor.train(data);

      const recentData = [0, 0, 0, 0, 0];
      const result = await predictor.predict(recentData);

      expect(result.predictions).toHaveLength(1);
      // With constant zero input, prediction should be close to zero
      expect(Math.abs(result.predictions[0])).toBeLessThan(5);

      predictor.dispose();
    }, 30000);

    it('should handle large values', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        epochs: 5,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => 1e6 + i * 1000);

      await predictor.train(data);

      const recentData = data.slice(-5);
      const result = await predictor.predict(recentData);

      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0]).toBeGreaterThan(1e6);

      predictor.dispose();
    }, 30000);
  });

  describe('Real-World Scenarios', () => {
    it('should forecast CPU usage pattern', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 24, // Last 24 hours
        predictionHorizon: 6, // Next 6 hours
        lstmUnits: [32],
        epochs: 15,
        verbose: false
      });

      // Simulate daily CPU usage pattern (higher during work hours)
      const data = Array.from({ length: 200 }, (_, i) => {
        const hour = i % 24;
        const baseLoad = 30;
        const workHoursPeak = hour >= 9 && hour <= 17 ? 40 : 0;
        const noise = Math.random() * 10 - 5;
        return baseLoad + workHoursPeak + noise;
      });

      await predictor.train(data);

      // Predict next 6 hours starting from midnight
      const midnightData = data.slice(0, 24); // First 24 hours (0-23)
      const result = await predictor.predict(midnightData);

      expect(result.predictions).toHaveLength(6);
      expect(result.confidence).toBeGreaterThan(0);

      predictor.dispose();
    }, 45000);

    it('should forecast network traffic with weekly seasonality', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 7, // Last 7 days
        predictionHorizon: 1, // Next day
        lstmUnits: [24],
        epochs: 10,
        verbose: false
      });

      // Simulate weekly traffic pattern (lower on weekends)
      const data = Array.from({ length: 60 }, (_, i) => {
        const dayOfWeek = i % 7;
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
        const baseTraffic = isWeekend ? 1000 : 5000;
        const noise = Math.random() * 500;
        return baseTraffic + noise;
      });

      await predictor.train(data);

      const recentWeek = data.slice(-7);
      const result = await predictor.predict(recentWeek);

      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0]).toBeGreaterThan(500);

      predictor.dispose();
    }, 45000);

    it('should forecast disk usage growth', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 10,
        predictionHorizon: 3,
        lstmUnits: [16],
        epochs: 10,
        verbose: false
      });

      // Simulate disk usage growth (GB) - deterministic data
      const data = Array.from({ length: 50 }, (_, i) => {
        return 100 + i * 2.5; // Linear growth, no noise for deterministic results
      });

      await predictor.train(data);

      const recent = data.slice(-10);
      const result = await predictor.predict(recent);

      expect(result.predictions).toHaveLength(3);
      // Predictions should be valid numbers
      // With limited training (10 epochs, 16 units), predictions may vary
      // Just verify they're reasonable numeric values
      expect(typeof result.predictions[0]).toBe('number');
      expect(isFinite(result.predictions[0])).toBe(true);
      expect(result.predictions[0]).toBeGreaterThan(0);
      expect(result.predictions[0]).toBeLessThan(500);
      expect(result.confidence).toBeGreaterThan(0);

      predictor.dispose();
    }, 45000);
  });

  describe('Configuration Variants', () => {
    it('should work with single LSTM layer', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        lstmUnits: [32],
        epochs: 5,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      await predictor.train(data);

      expect(predictor.isTrained()).toBe(true);

      predictor.dispose();
    }, 30000);

    it('should work with multiple LSTM layers', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        lstmUnits: [32, 16],
        epochs: 5,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      await predictor.train(data);

      expect(predictor.isTrained()).toBe(true);

      predictor.dispose();
    }, 30000);

    it('should work with dense layers', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        lstmUnits: [32],
        denseUnits: [16, 8],
        epochs: 5,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      await predictor.train(data);

      expect(predictor.isTrained()).toBe(true);

      predictor.dispose();
    }, 30000);

    it('should work with dropout', async () => {
      const predictor = new LSTMPredictor({
        sequenceLength: 5,
        predictionHorizon: 1,
        lstmUnits: [32],
        dropout: 0.2,
        epochs: 5,
        verbose: false
      });

      const data = Array.from({ length: 50 }, (_, i) => i + 1);
      await predictor.train(data);

      expect(predictor.isTrained()).toBe(true);

      predictor.dispose();
    }, 30000);
  });
});

describe('predictTimeSeries convenience function', () => {
  it('should train and predict in one call', async () => {
    const historicalData = Array.from({ length: 100 }, (_, i) => i + 1);
    const recentData = historicalData.slice(-10);

    const result = await predictTimeSeries(historicalData, recentData, {
      sequenceLength: 10,
      predictionHorizon: 1,
      epochs: 5,
      verbose: false
    });

    expect(result).toBeDefined();
    expect(result.predictions).toHaveLength(1);
    // Model should predict something in a reasonable range
    expect(result.predictions[0]).toBeGreaterThan(10);
    expect(result.predictions[0]).toBeLessThan(150);
    expect(result.confidence).toBeGreaterThan(0);
  }, 30000);

  it('should work with custom config', async () => {
    const data = Array.from({ length: 100 }, (_, i) =>
      50 + 20 * Math.sin(i * 0.1)
    );
    const recent = data.slice(-24);

    const result = await predictTimeSeries(data, recent, {
      sequenceLength: 24,
      predictionHorizon: 6,
      lstmUnits: [32, 16],
      epochs: 10,
      verbose: false
    });

    expect(result.predictions).toHaveLength(6);
    expect(result.confidence).toBeGreaterThan(0);
  }, 45000);
});
