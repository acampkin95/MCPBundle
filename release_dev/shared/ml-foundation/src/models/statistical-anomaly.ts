/**
 * Statistical Anomaly Detection
 *
 * Implements lightweight statistical methods for anomaly detection:
 * - Z-score (standard deviation based)
 * - IQR (Interquartile Range)
 * - Modified Z-score (median absolute deviation)
 *
 * These methods are fast, interpretable, and don't require training.
 * Use as baseline or fallback when ML models unavailable.
 *
 * @module statistical-anomaly
 */

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  confidence: number;
  method: 'zscore' | 'iqr' | 'modified_zscore';
  threshold: number;
}

export interface StatisticalAnomalyConfig {
  method?: 'zscore' | 'iqr' | 'modified_zscore' | 'auto';
  zscoreThreshold?: number;  // Default: 3.0
  iqrMultiplier?: number;    // Default: 1.5
  modifiedZscoreThreshold?: number;  // Default: 3.5
  windowSize?: number;       // Rolling window size (default: 100)
  minSamples?: number;       // Minimum samples required (default: 30)
}

/**
 * Calculate mean of an array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate median of an array
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[], meanValue?: number): number {
  if (values.length === 0) return 0;
  const avg = meanValue ?? mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  const variance = mean(squaredDiffs);
  return Math.sqrt(variance);
}

/**
 * Calculate median absolute deviation (MAD)
 */
function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const medianValue = median(values);
  const absoluteDeviations = values.map(val => Math.abs(val - medianValue));
  return median(absoluteDeviations);
}

/**
 * Calculate quartiles (Q1, Q2, Q3)
 */
function quartiles(values: number[]): { q1: number; q2: number; q3: number } {
  if (values.length === 0) {
    return { q1: 0, q2: 0, q3: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q2 = median(sorted);

  const lowerHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const upperHalf = sorted.slice(Math.ceil(sorted.length / 2));

  const q1 = median(lowerHalf);
  const q3 = median(upperHalf);

  return { q1, q2, q3 };
}

/**
 * Statistical Anomaly Detector
 *
 * @example
 * ```typescript
 * const detector = new StatisticalAnomalyDetector({
 *   method: 'zscore',
 *   zscoreThreshold: 3.0,
 *   windowSize: 100
 * });
 *
 * // Add historical data
 * detector.fit([1.2, 1.5, 1.3, 1.4, 1.6, ...]);
 *
 * // Detect anomalies
 * const result = detector.detect(10.5);
 * if (result.isAnomaly) {
 *   console.log(`Anomaly detected! Score: ${result.score}`);
 * }
 * ```
 */
export class StatisticalAnomalyDetector {
  private config: Required<StatisticalAnomalyConfig>;
  private historicalData: number[] = [];
  private stats: {
    mean: number;
    stdDev: number;
    median: number;
    mad: number;
    q1: number;
    q3: number;
    iqr: number;
  } | null = null;

  constructor(config: StatisticalAnomalyConfig = {}) {
    this.config = {
      method: config.method || 'auto',
      zscoreThreshold: config.zscoreThreshold ?? 3.0,
      iqrMultiplier: config.iqrMultiplier ?? 1.5,
      modifiedZscoreThreshold: config.modifiedZscoreThreshold ?? 3.5,
      windowSize: config.windowSize ?? 100,
      minSamples: config.minSamples ?? 30
    };
  }

  /**
   * Fit the detector on historical data
   *
   * @param data - Historical time-series data
   */
  public fit(data: number[]): void {
    // Store historical data (rolling window)
    if (data.length > this.config.windowSize) {
      this.historicalData = data.slice(-this.config.windowSize);
    } else {
      this.historicalData = [...data];
    }

    // Calculate statistics
    if (this.historicalData.length >= this.config.minSamples) {
      const meanValue = mean(this.historicalData);
      const medianValue = median(this.historicalData);
      const { q1, q2, q3 } = quartiles(this.historicalData);

      this.stats = {
        mean: meanValue,
        stdDev: stdDev(this.historicalData, meanValue),
        median: medianValue,
        mad: medianAbsoluteDeviation(this.historicalData),
        q1,
        q3,
        iqr: q3 - q1
      };
    }
  }

  /**
   * Update with new data point (incremental learning)
   *
   * @param value - New data point
   */
  public update(value: number): void {
    this.historicalData.push(value);

    // Maintain rolling window
    if (this.historicalData.length > this.config.windowSize) {
      this.historicalData.shift();
    }

    // Recalculate statistics
    this.fit(this.historicalData);
  }

  /**
   * Detect if a value is an anomaly
   *
   * @param value - Value to check
   * @param method - Override detection method
   * @returns AnomalyResult
   */
  public detect(value: number, method?: 'zscore' | 'iqr' | 'modified_zscore'): AnomalyResult {
    if (!this.stats || this.historicalData.length < this.config.minSamples) {
      return {
        isAnomaly: false,
        score: 0,
        confidence: 0,
        method: 'zscore',
        threshold: this.config.zscoreThreshold
      };
    }

    const detectionMethod = method || (this.config.method === 'auto' ? 'zscore' : this.config.method);

    switch (detectionMethod) {
      case 'zscore':
        return this.detectZScore(value);
      case 'iqr':
        return this.detectIQR(value);
      case 'modified_zscore':
        return this.detectModifiedZScore(value);
      default:
        return this.detectZScore(value);
    }
  }

  /**
   * Z-score anomaly detection
   *
   * Anomaly if: |value - mean| > threshold * stdDev
   */
  private detectZScore(value: number): AnomalyResult {
    if (!this.stats) throw new Error('Statistics not calculated');

    const deviation = Math.abs(value - this.stats.mean);
    const score = this.stats.stdDev > 0 ? deviation / this.stats.stdDev : 0;
    const isAnomaly = score > this.config.zscoreThreshold;

    // Confidence based on how far beyond threshold
    const confidence = isAnomaly
      ? Math.min(1.0, (score - this.config.zscoreThreshold) / this.config.zscoreThreshold)
      : 0;

    return {
      isAnomaly,
      score,
      confidence,
      method: 'zscore',
      threshold: this.config.zscoreThreshold
    };
  }

  /**
   * IQR (Interquartile Range) anomaly detection
   *
   * Anomaly if: value < Q1 - multiplier * IQR OR value > Q3 + multiplier * IQR
   */
  private detectIQR(value: number): AnomalyResult {
    if (!this.stats) throw new Error('Statistics not calculated');

    const lowerBound = this.stats.q1 - this.config.iqrMultiplier * this.stats.iqr;
    const upperBound = this.stats.q3 + this.config.iqrMultiplier * this.stats.iqr;

    const isAnomaly = value < lowerBound || value > upperBound;

    // Calculate score as distance from bounds
    let score = 0;
    if (value < lowerBound) {
      score = (lowerBound - value) / this.stats.iqr;
    } else if (value > upperBound) {
      score = (value - upperBound) / this.stats.iqr;
    }

    // Confidence based on distance from bounds
    const confidence = isAnomaly ? Math.min(1.0, score / this.config.iqrMultiplier) : 0;

    return {
      isAnomaly,
      score,
      confidence,
      method: 'iqr',
      threshold: this.config.iqrMultiplier
    };
  }

  /**
   * Modified Z-score anomaly detection (robust to outliers)
   *
   * Uses median and MAD instead of mean and stdDev
   * Anomaly if: |0.6745 * (value - median) / MAD| > threshold
   */
  private detectModifiedZScore(value: number): AnomalyResult {
    if (!this.stats) throw new Error('Statistics not calculated');

    // Modified Z-score uses MAD instead of standard deviation
    // 0.6745 is the constant to make MAD comparable to stdDev
    const deviation = Math.abs(value - this.stats.median);
    const score = this.stats.mad > 0
      ? (0.6745 * deviation) / this.stats.mad
      : 0;

    const isAnomaly = score > this.config.modifiedZscoreThreshold;

    // Confidence based on how far beyond threshold
    const confidence = isAnomaly
      ? Math.min(1.0, (score - this.config.modifiedZscoreThreshold) / this.config.modifiedZscoreThreshold)
      : 0;

    return {
      isAnomaly,
      score,
      confidence,
      method: 'modified_zscore',
      threshold: this.config.modifiedZscoreThreshold
    };
  }

  /**
   * Get current statistics
   */
  public getStatistics() {
    return this.stats ? { ...this.stats } : null;
  }

  /**
   * Get historical data size
   */
  public getDataSize(): number {
    return this.historicalData.length;
  }

  /**
   * Check if detector is ready (has minimum samples)
   */
  public isReady(): boolean {
    return this.historicalData.length >= this.config.minSamples && this.stats !== null;
  }

  /**
   * Reset the detector
   */
  public reset(): void {
    this.historicalData = [];
    this.stats = null;
  }
}

/**
 * Convenience function for one-off anomaly detection
 *
 * @param data - Historical data
 * @param value - Value to check
 * @param config - Detection configuration
 * @returns AnomalyResult
 *
 * @example
 * ```typescript
 * const result = detectAnomaly(
 *   [1.2, 1.5, 1.3, 1.4, 1.6],
 *   10.5,
 *   { method: 'zscore', zscoreThreshold: 3.0 }
 * );
 * ```
 */
export function detectAnomaly(
  data: number[],
  value: number,
  config?: StatisticalAnomalyConfig
): AnomalyResult {
  const detector = new StatisticalAnomalyDetector(config);
  detector.fit(data);
  return detector.detect(value);
}
