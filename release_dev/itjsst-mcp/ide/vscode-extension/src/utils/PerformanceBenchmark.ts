/**
 * Performance Benchmarking and Monitoring System
 * Tracks operation metrics and identifies performance bottlenecks
 */

/**
 * Performance metric for a single operation
 */
interface PerformanceMetric {
  readonly operation: string;
  readonly durationMs: number;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Aggregated performance statistics
 */
interface PerformanceStats {
  readonly operation: string;
  readonly count: number;
  readonly totalMs: number;
  readonly avgMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

/**
 * Performance targets for operations
 */
interface PerformanceTarget {
  readonly operation: string;
  readonly targetMs: number;
  readonly criticalMs: number;
}

/**
 * Performance benchmark tracker
 */
export class PerformanceBenchmark {
  private readonly metrics: PerformanceMetric[] = [];
  private readonly targets = new Map<string, PerformanceTarget>();

  // Default performance targets
  private readonly defaultTargets: PerformanceTarget[] = [
    { operation: 'database.query', targetMs: 100, criticalMs: 500 },
    { operation: 'database.getSessions', targetMs: 100, criticalMs: 500 },
    { operation: 'database.getThoughts', targetMs: 100, criticalMs: 500 },
    { operation: 'treeView.refresh', targetMs: 500, criticalMs: 2000 },
    { operation: 'treeView.getChildren', targetMs: 200, criticalMs: 1000 },
    { operation: 'search.fts5', targetMs: 500, criticalMs: 2000 },
    { operation: 'export.session', targetMs: 2000, criticalMs: 10000 },
    { operation: 'research.query', targetMs: 5000, criticalMs: 30000 },
    { operation: 'mcp.invokeTool', targetMs: 3000, criticalMs: 15000 },
  ];

  constructor() {
    // Initialize default targets
    for (const target of this.defaultTargets) {
      this.targets.set(target.operation, target);
    }
  }

  /**
   * Record performance metric
   */
  public record(operation: string, durationMs: number, metadata?: Record<string, unknown>): void {
    this.metrics.push({
      operation,
      durationMs,
      timestamp: new Date(),
      metadata,
    });

    // Trim metrics (keep last 1000)
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
  }

  /**
   * Time an operation
   */
  public async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.record(operation, Date.now() - start);
      return result;
    } catch (error) {
      this.record(operation, Date.now() - start, { error: true });
      throw error;
    }
  }

  /**
   * Time a synchronous operation
   */
  public timeSync<T>(operation: string, fn: () => T): T {
    const start = Date.now();
    try {
      const result = fn();
      this.record(operation, Date.now() - start);
      return result;
    } catch (error) {
      this.record(operation, Date.now() - start, { error: true });
      throw error;
    }
  }

  /**
   * Get statistics for an operation
   */
  public getStats(operation: string): PerformanceStats | null {
    const operationMetrics = this.metrics.filter((m) => m.operation === operation);

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map((m) => m.durationMs).sort((a, b) => a - b);

    const total = durations.reduce((sum, d) => sum + d, 0);
    const count = durations.length;

    return {
      operation,
      count,
      totalMs: total,
      avgMs: total / count,
      minMs: durations[0] ?? 0,
      maxMs: durations[durations.length - 1] ?? 0,
      p50Ms: this.percentile(durations, 50),
      p95Ms: this.percentile(durations, 95),
      p99Ms: this.percentile(durations, 99),
    };
  }

  /**
   * Get all statistics grouped by operation
   */
  public getAllStats(): PerformanceStats[] {
    const operations = new Set(this.metrics.map((m) => m.operation));
    return Array.from(operations)
      .map((op) => this.getStats(op))
      .filter((stats): stats is PerformanceStats => stats !== null)
      .sort((a, b) => b.avgMs - a.avgMs);
  }

  /**
   * Get operations exceeding targets
   */
  public getViolations(): Array<{
    operation: string;
    stats: PerformanceStats;
    target: PerformanceTarget;
    severity: 'warning' | 'critical';
  }> {
    const violations: Array<{
      operation: string;
      stats: PerformanceStats;
      target: PerformanceTarget;
      severity: 'warning' | 'critical';
    }> = [];

    for (const [operation, target] of this.targets.entries()) {
      const stats = this.getStats(operation);
      if (!stats) {
        continue;
      }

      if (stats.p95Ms > target.criticalMs) {
        violations.push({
          operation,
          stats,
          target,
          severity: 'critical',
        });
      } else if (stats.p95Ms > target.targetMs) {
        violations.push({
          operation,
          stats,
          target,
          severity: 'warning',
        });
      }
    }

    return violations.sort((a, b) => b.stats.p95Ms - a.stats.p95Ms);
  }

  /**
   * Set performance target for operation
   */
  public setTarget(operation: string, targetMs: number, criticalMs: number): void {
    this.targets.set(operation, { operation, targetMs, criticalMs });
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }

    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics.length = 0;
  }

  /**
   * Export metrics to JSON
   */
  public exportMetrics(): {
    metrics: PerformanceMetric[];
    stats: PerformanceStats[];
    violations: Array<{
      operation: string;
      stats: PerformanceStats;
      target: PerformanceTarget;
      severity: 'warning' | 'critical';
    }>;
  } {
    return {
      metrics: [...this.metrics],
      stats: this.getAllStats(),
      violations: this.getViolations(),
    };
  }

  /**
   * Generate performance report
   */
  public generateReport(): string {
    const stats = this.getAllStats();
    const violations = this.getViolations();

    let report = '# Performance Benchmark Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Total operations tracked: ${this.metrics.length}\n\n`;

    if (violations.length > 0) {
      report += '## Performance Violations\n\n';
      for (const violation of violations) {
        const severity = violation.severity.toUpperCase();
        report += `**[${severity}]** ${violation.operation}\n`;
        report += `  - P95: ${violation.stats.p95Ms.toFixed(2)}ms (target: ${violation.target.targetMs}ms)\n`;
        report += `  - Max: ${violation.stats.maxMs.toFixed(2)}ms\n`;
        report += `  - Count: ${violation.stats.count}\n\n`;
      }
    }

    report += '## All Operations\n\n';
    report += '| Operation | Count | Avg | P50 | P95 | P99 | Max |\n';
    report += '|-----------|-------|-----|-----|-----|-----|-----|\n';

    for (const stat of stats) {
      report += `| ${stat.operation} | ${stat.count} | `;
      report += `${stat.avgMs.toFixed(1)}ms | `;
      report += `${stat.p50Ms.toFixed(1)}ms | `;
      report += `${stat.p95Ms.toFixed(1)}ms | `;
      report += `${stat.p99Ms.toFixed(1)}ms | `;
      report += `${stat.maxMs.toFixed(1)}ms |\n`;
    }

    return report;
  }
}

/**
 * Global performance benchmark instance
 */
export const globalBenchmark = new PerformanceBenchmark();
