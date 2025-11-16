/**
 * Isolation Forest Anomaly Detection
 *
 * Tree-based ensemble method for detecting anomalies.
 * Works by isolating observations through random partitioning.
 * Anomalies are easier to isolate (shorter path length).
 *
 * Algorithm:
 * 1. Build ensemble of isolation trees
 * 2. Each tree recursively partitions data with random splits
 * 3. Anomalies have shorter average path lengths
 * 4. Anomaly score = 2^(-avgPathLength / c(n))
 *
 * Advantages:
 * - No distance/density calculations
 * - Linear time complexity O(n)
 * - Works well with high-dimensional data
 * - Handles contamination naturally
 *
 * @module isolation-forest
 */

export interface IsolationForestConfig {
  numTrees?: number;           // Number of trees in forest (default: 100)
  sampleSize?: number;          // Sample size per tree (default: 256)
  maxDepth?: number;            // Maximum tree depth (default: log2(sampleSize))
  contamination?: number;       // Expected proportion of anomalies (default: 0.1)
  randomSeed?: number;          // Random seed for reproducibility
}

export interface IsolationForestResult {
  isAnomaly: boolean;
  score: number;                // Anomaly score [0, 1], higher = more anomalous
  pathLength: number;           // Average path length
  threshold: number;            // Decision threshold
}

/**
 * Data point type (can be multi-dimensional)
 */
type DataPoint = number[];

/**
 * Isolation Tree Node
 */
interface ITreeNode {
  isLeaf: boolean;
  splitFeature?: number;        // Feature index to split on
  splitValue?: number;          // Value to split at
  left?: ITreeNode;
  right?: ITreeNode;
  size: number;                 // Number of points in this node
}

/**
 * Calculate average path length c(n) for unsuccessful search
 * Used for normalization
 */
function averagePathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;

  // H(n-1) is Harmonic number, approximated as ln(n-1) + 0.5772156649
  const harmonic = Math.log(n - 1) + 0.5772156649;
  return 2 * harmonic - (2 * (n - 1)) / n;
}

/**
 * Simple random number generator with seed
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  randInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  randFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

/**
 * Isolation Tree
 */
class IsolationTree {
  private root: ITreeNode | null = null;
  private maxDepth: number;
  private rng: SeededRandom;

  constructor(maxDepth: number, seed: number) {
    this.maxDepth = maxDepth;
    this.rng = new SeededRandom(seed);
  }

  /**
   * Build tree from sample data
   */
  public build(data: DataPoint[]): void {
    this.root = this.buildNode(data, 0);
  }

  /**
   * Recursively build tree nodes
   */
  private buildNode(data: DataPoint[], depth: number): ITreeNode {
    const size = data.length;

    // Leaf conditions: max depth reached or all points identical
    if (depth >= this.maxDepth || size <= 1) {
      return { isLeaf: true, size };
    }

    // Check if all points are identical
    const allSame = data.every(point =>
      point.every((val, idx) => val === data[0][idx])
    );
    if (allSame) {
      return { isLeaf: true, size };
    }

    // Random feature selection
    const numFeatures = data[0].length;
    const splitFeature = this.rng.randInt(0, numFeatures);

    // Find min/max for this feature
    const values = data.map(point => point[splitFeature]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // Random split value between min and max
    const splitValue = this.rng.randFloat(minVal, maxVal);

    // Partition data
    const leftData = data.filter(point => point[splitFeature] < splitValue);
    const rightData = data.filter(point => point[splitFeature] >= splitValue);

    // If split doesn't partition data, make it a leaf
    if (leftData.length === 0 || rightData.length === 0) {
      return { isLeaf: true, size };
    }

    // Recursively build children
    return {
      isLeaf: false,
      splitFeature,
      splitValue,
      left: this.buildNode(leftData, depth + 1),
      right: this.buildNode(rightData, depth + 1),
      size
    };
  }

  /**
   * Calculate path length for a point
   */
  public pathLength(point: DataPoint): number {
    return this.pathLengthRecursive(point, this.root, 0);
  }

  private pathLengthRecursive(
    point: DataPoint,
    node: ITreeNode | null,
    depth: number
  ): number {
    if (!node) return depth;

    if (node.isLeaf) {
      // Adjust for unseen path length based on node size
      return depth + averagePathLength(node.size);
    }

    if (node.splitFeature === undefined || node.splitValue === undefined) {
      return depth;
    }

    // Traverse tree
    if (point[node.splitFeature] < node.splitValue) {
      return this.pathLengthRecursive(point, node.left ?? null, depth + 1);
    } else {
      return this.pathLengthRecursive(point, node.right ?? null, depth + 1);
    }
  }
}

/**
 * Isolation Forest
 *
 * @example
 * ```typescript
 * const forest = new IsolationForest({
 *   numTrees: 100,
 *   sampleSize: 256,
 *   contamination: 0.1
 * });
 *
 * // Train on historical data
 * const data = [
 *   [1.2, 0.5],
 *   [1.5, 0.8],
 *   [1.3, 0.6]
 * ];
 * forest.fit(data);
 *
 * // Detect anomalies
 * const result = forest.detect([10.0, 5.0]);
 * if (result.isAnomaly) {
 *   console.log(`Anomaly detected! Score: ${result.score}`);
 * }
 * ```
 */
export class IsolationForest {
  private config: Required<IsolationForestConfig>;
  private trees: IsolationTree[] = [];
  private threshold: number = 0;
  private trained: boolean = false;
  private numFeatures: number = 0;
  private avgPathLengthNorm: number = 0;

  constructor(config: IsolationForestConfig = {}) {
    const sampleSize = config.sampleSize ?? 256;
    const maxDepth = config.maxDepth ?? Math.ceil(Math.log2(sampleSize));

    this.config = {
      numTrees: config.numTrees ?? 100,
      sampleSize,
      maxDepth,
      contamination: config.contamination ?? 0.1,
      randomSeed: config.randomSeed ?? Date.now()
    };

    this.avgPathLengthNorm = averagePathLength(sampleSize);
  }

  /**
   * Train the isolation forest on data
   */
  public fit(data: DataPoint[]): void {
    if (data.length === 0) {
      throw new Error('Cannot train on empty dataset');
    }

    this.numFeatures = data[0].length;
    this.trees = [];

    // Build ensemble of isolation trees
    const rng = new SeededRandom(this.config.randomSeed);

    for (let i = 0; i < this.config.numTrees; i++) {
      // Sample subset of data for this tree
      const sample = this.sampleData(data, this.config.sampleSize, rng);

      // Build tree
      const tree = new IsolationTree(this.config.maxDepth, rng.next() * 1000000);
      tree.build(sample);
      this.trees.push(tree);
    }

    // Calculate threshold based on contamination
    this.calculateThreshold(data);
    this.trained = true;
  }

  /**
   * Sample data points randomly
   */
  private sampleData(data: DataPoint[], size: number, rng: SeededRandom): DataPoint[] {
    const sampleSize = Math.min(size, data.length);
    const sample: DataPoint[] = [];
    const indices = new Set<number>();

    while (indices.size < sampleSize) {
      const idx = rng.randInt(0, data.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        sample.push(data[idx]);
      }
    }

    return sample;
  }

  /**
   * Calculate anomaly threshold based on contamination
   */
  private calculateThreshold(data: DataPoint[]): void {
    // Calculate scores for all training points using internal method
    const scores = data.map(point => this.calculateScore(point));
    scores.sort((a, b) => b - a); // Sort descending

    // Threshold is at contamination percentile
    const thresholdIndex = Math.floor(scores.length * this.config.contamination);
    this.threshold = scores[Math.min(thresholdIndex, scores.length - 1)];
  }

  /**
   * Internal score calculation without training check
   */
  private calculateScore(point: DataPoint): number {
    // Calculate average path length across all trees
    let totalPathLength = 0;
    for (const tree of this.trees) {
      totalPathLength += tree.pathLength(point);
    }
    const avgPathLength = totalPathLength / this.trees.length;

    // Normalize and convert to anomaly score
    const exponent = -avgPathLength / this.avgPathLengthNorm;
    const score = Math.pow(2, exponent);

    return score;
  }

  /**
   * Calculate anomaly score for a single point
   * Returns value in [0, 1], higher = more anomalous
   */
  public anomalyScore(point: DataPoint): number {
    if (!this.trained) {
      throw new Error('Forest not trained yet. Call fit() first.');
    }

    if (point.length !== this.numFeatures) {
      throw new Error(
        `Point dimension (${point.length}) doesn't match training data (${this.numFeatures})`
      );
    }

    return this.calculateScore(point);
  }

  /**
   * Detect if a point is an anomaly
   */
  public detect(point: DataPoint): IsolationForestResult {
    const score = this.anomalyScore(point);
    const isAnomaly = score > this.threshold;

    // Calculate average path length for reporting
    let totalPathLength = 0;
    for (const tree of this.trees) {
      totalPathLength += tree.pathLength(point);
    }
    const pathLength = totalPathLength / this.trees.length;

    return {
      isAnomaly,
      score,
      pathLength,
      threshold: this.threshold
    };
  }

  /**
   * Check if forest is trained
   */
  public isTrained(): boolean {
    return this.trained;
  }

  /**
   * Get configuration
   */
  public getConfig(): Required<IsolationForestConfig> {
    return { ...this.config };
  }

  /**
   * Reset the forest
   */
  public reset(): void {
    this.trees = [];
    this.trained = false;
    this.threshold = 0;
    this.numFeatures = 0;
  }
}

/**
 * Convenience function for one-off anomaly detection
 *
 * @param trainingData - Historical data for training
 * @param point - Point to check for anomaly
 * @param config - Optional configuration
 * @returns IsolationForestResult
 *
 * @example
 * ```typescript
 * const data = [[1, 2], [1.5, 2.5], [1.2, 2.1]];
 * const result = detectAnomalyIForest(data, [10, 10]);
 * ```
 */
export function detectAnomalyIForest(
  trainingData: DataPoint[],
  point: DataPoint,
  config?: IsolationForestConfig
): IsolationForestResult {
  const forest = new IsolationForest(config);
  forest.fit(trainingData);
  return forest.detect(point);
}
