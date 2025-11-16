"use strict";
/**
 * Performance Benchmarking and Monitoring System
 * Tracks operation metrics and identifies performance bottlenecks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalBenchmark = exports.PerformanceBenchmark = void 0;
/**
 * Performance benchmark tracker
 */
class PerformanceBenchmark {
    metrics = [];
    targets = new Map();
    // Default performance targets
    defaultTargets = [
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
    record(operation, durationMs, metadata) {
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
    async time(operation, fn) {
        const start = Date.now();
        try {
            const result = await fn();
            this.record(operation, Date.now() - start);
            return result;
        }
        catch (error) {
            this.record(operation, Date.now() - start, { error: true });
            throw error;
        }
    }
    /**
     * Time a synchronous operation
     */
    timeSync(operation, fn) {
        const start = Date.now();
        try {
            const result = fn();
            this.record(operation, Date.now() - start);
            return result;
        }
        catch (error) {
            this.record(operation, Date.now() - start, { error: true });
            throw error;
        }
    }
    /**
     * Get statistics for an operation
     */
    getStats(operation) {
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
    getAllStats() {
        const operations = new Set(this.metrics.map((m) => m.operation));
        return Array.from(operations)
            .map((op) => this.getStats(op))
            .filter((stats) => stats !== null)
            .sort((a, b) => b.avgMs - a.avgMs);
    }
    /**
     * Get operations exceeding targets
     */
    getViolations() {
        const violations = [];
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
            }
            else if (stats.p95Ms > target.targetMs) {
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
    setTarget(operation, targetMs, criticalMs) {
        this.targets.set(operation, { operation, targetMs, criticalMs });
    }
    /**
     * Calculate percentile
     */
    percentile(sorted, p) {
        if (sorted.length === 0) {
            return 0;
        }
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)] ?? 0;
    }
    /**
     * Clear all metrics
     */
    clear() {
        this.metrics.length = 0;
    }
    /**
     * Export metrics to JSON
     */
    exportMetrics() {
        return {
            metrics: [...this.metrics],
            stats: this.getAllStats(),
            violations: this.getViolations(),
        };
    }
    /**
     * Generate performance report
     */
    generateReport() {
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
exports.PerformanceBenchmark = PerformanceBenchmark;
/**
 * Global performance benchmark instance
 */
exports.globalBenchmark = new PerformanceBenchmark();
//# sourceMappingURL=PerformanceBenchmark.js.map