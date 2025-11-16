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
export declare class PerformanceBenchmark {
    private readonly metrics;
    private readonly targets;
    private readonly defaultTargets;
    constructor();
    /**
     * Record performance metric
     */
    record(operation: string, durationMs: number, metadata?: Record<string, unknown>): void;
    /**
     * Time an operation
     */
    time<T>(operation: string, fn: () => Promise<T>): Promise<T>;
    /**
     * Time a synchronous operation
     */
    timeSync<T>(operation: string, fn: () => T): T;
    /**
     * Get statistics for an operation
     */
    getStats(operation: string): PerformanceStats | null;
    /**
     * Get all statistics grouped by operation
     */
    getAllStats(): PerformanceStats[];
    /**
     * Get operations exceeding targets
     */
    getViolations(): Array<{
        operation: string;
        stats: PerformanceStats;
        target: PerformanceTarget;
        severity: 'warning' | 'critical';
    }>;
    /**
     * Set performance target for operation
     */
    setTarget(operation: string, targetMs: number, criticalMs: number): void;
    /**
     * Calculate percentile
     */
    private percentile;
    /**
     * Clear all metrics
     */
    clear(): void;
    /**
     * Export metrics to JSON
     */
    exportMetrics(): {
        metrics: PerformanceMetric[];
        stats: PerformanceStats[];
        violations: Array<{
            operation: string;
            stats: PerformanceStats;
            target: PerformanceTarget;
            severity: 'warning' | 'critical';
        }>;
    };
    /**
     * Generate performance report
     */
    generateReport(): string;
}
/**
 * Global performance benchmark instance
 */
export declare const globalBenchmark: PerformanceBenchmark;
export {};
//# sourceMappingURL=PerformanceBenchmark.d.ts.map