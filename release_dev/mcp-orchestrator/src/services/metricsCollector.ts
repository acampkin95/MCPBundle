/**
 * Metrics Collector v2.0
 *
 * Prometheus metrics collection for orchestrator:
 * - Command execution metrics
 * - Queue depth and SLA metrics
 * - Agent health metrics
 * - System performance metrics
 */

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from 'prom-client';
import { logger } from '../utils/logger.js';
import type { MetricsConfig } from '../config/orchestrator.config.js';

/**
 * Metrics collector with Prometheus integration
 */
export class MetricsCollector {
  private readonly registry: Registry;
  private readonly config: MetricsConfig;

  // Command metrics
  public readonly commandsTotal: Counter;
  public readonly commandErrors: Counter;
  public readonly commandRetries: Counter;
  public readonly commandDuration: Histogram;

  // Queue metrics
  public readonly queueDepth: Gauge;
  public readonly queueDepthByPriority: Gauge;
  public readonly queueSLABreaches: Counter;
  public readonly queueWaitTime: Histogram;

  // Agent metrics
  public readonly agentsTotal: Gauge;
  public readonly agentsOnline: Gauge;
  public readonly agentsOffline: Gauge;
  public readonly agentsDegraded: Gauge;
  public readonly agentRequests: Counter;
  public readonly agentErrors: Counter;
  public readonly agentResponseTime: Histogram;

  // DLQ metrics
  public readonly dlqSize: Gauge;
  public readonly dlqAdded: Counter;
  public readonly dlqReplayed: Counter;

  // System metrics
  public readonly systemUptime: Gauge;
  public readonly eventCount: Counter;

  public constructor(config: MetricsConfig) {
    this.config = config;
    this.registry = new Registry();

    // Set default labels
    if (config.defaultLabels) {
      this.registry.setDefaultLabels(config.defaultLabels);
    }

    // Collect default system metrics if enabled
    if (config.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: 'orchestrator_',
      });
    }

    // Initialize command metrics
    this.commandsTotal = new Counter({
      name: 'orchestrator_commands_total',
      help: 'Total number of commands processed',
      labelNames: ['status'] as const,
      registers: [this.registry],
    } as CounterConfiguration<'status'>);

    this.commandErrors = new Counter({
      name: 'orchestrator_command_errors_total',
      help: 'Total number of command errors',
      labelNames: ['error_type'] as const,
      registers: [this.registry],
    } as CounterConfiguration<'error_type'>);

    this.commandRetries = new Counter({
      name: 'orchestrator_command_retries_total',
      help: 'Total number of command retries',
      registers: [this.registry],
    });

    this.commandDuration = new Histogram({
      name: 'orchestrator_command_duration_seconds',
      help: 'Command execution duration',
      labelNames: ['status'] as const,
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.registry],
    } as HistogramConfiguration<'status'>);

    // Initialize queue metrics
    this.queueDepth = new Gauge({
      name: 'orchestrator_queue_depth',
      help: 'Current queue depth (all priorities)',
      registers: [this.registry],
    });

    this.queueDepthByPriority = new Gauge({
      name: 'orchestrator_queue_depth_by_priority',
      help: 'Current queue depth by priority level',
      labelNames: ['priority'] as const,
      registers: [this.registry],
    } as GaugeConfiguration<'priority'>);

    this.queueSLABreaches = new Counter({
      name: 'orchestrator_queue_sla_breaches_total',
      help: 'Total number of SLA breaches',
      labelNames: ['priority'] as const,
      registers: [this.registry],
    } as CounterConfiguration<'priority'>);

    this.queueWaitTime = new Histogram({
      name: 'orchestrator_queue_wait_time_seconds',
      help: 'Time spent in queue before dequeue',
      labelNames: ['priority'] as const,
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60],
      registers: [this.registry],
    } as HistogramConfiguration<'priority'>);

    // Initialize agent metrics
    this.agentsTotal = new Gauge({
      name: 'orchestrator_agents_total',
      help: 'Total number of registered agents',
      labelNames: ['type'] as const,
      registers: [this.registry],
    } as GaugeConfiguration<'type'>);

    this.agentsOnline = new Gauge({
      name: 'orchestrator_agents_online',
      help: 'Number of online agents',
      registers: [this.registry],
    });

    this.agentsOffline = new Gauge({
      name: 'orchestrator_agents_offline',
      help: 'Number of offline agents',
      registers: [this.registry],
    });

    this.agentsDegraded = new Gauge({
      name: 'orchestrator_agents_degraded',
      help: 'Number of degraded agents',
      registers: [this.registry],
    });

    this.agentRequests = new Counter({
      name: 'orchestrator_agent_requests_total',
      help: 'Total requests per agent',
      labelNames: ['agent_id'] as const,
      registers: [this.registry],
    } as CounterConfiguration<'agent_id'>);

    this.agentErrors = new Counter({
      name: 'orchestrator_agent_errors_total',
      help: 'Total errors per agent',
      labelNames: ['agent_id'] as const,
      registers: [this.registry],
    } as CounterConfiguration<'agent_id'>);

    this.agentResponseTime = new Histogram({
      name: 'orchestrator_agent_response_time_seconds',
      help: 'Agent response time',
      labelNames: ['agent_id'] as const,
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    } as HistogramConfiguration<'agent_id'>);

    // Initialize DLQ metrics
    this.dlqSize = new Gauge({
      name: 'orchestrator_dlq_size',
      help: 'Current dead letter queue size',
      registers: [this.registry],
    });

    this.dlqAdded = new Counter({
      name: 'orchestrator_dlq_added_total',
      help: 'Total items added to DLQ',
      registers: [this.registry],
    });

    this.dlqReplayed = new Counter({
      name: 'orchestrator_dlq_replayed_total',
      help: 'Total items replayed from DLQ',
      registers: [this.registry],
    });

    // Initialize system metrics
    this.systemUptime = new Gauge({
      name: 'orchestrator_uptime_seconds',
      help: 'Orchestrator uptime in seconds',
      registers: [this.registry],
    });

    this.eventCount = new Counter({
      name: 'orchestrator_events_total',
      help: 'Total events emitted',
      labelNames: ['event_type'] as const,
      registers: [this.registry],
    } as CounterConfiguration<'event_type'>);

    logger.info('MetricsCollector initialized', {
      prometheusPort: config.prometheusPort,
      collectDefaultMetrics: config.collectDefaultMetrics,
    });
  }

  /**
   * Get metrics in Prometheus format
   */
  public async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  /**
   * Get registry (for custom metrics or HTTP server)
   */
  public getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Record command execution
   */
  public recordCommandExecution(status: 'success' | 'error', durationSeconds: number): void {
    this.commandsTotal.inc({ status });
    this.commandDuration.observe({ status }, durationSeconds);
  }

  /**
   * Record command error
   */
  public recordCommandError(errorType: string): void {
    this.commandErrors.inc({ error_type: errorType });
  }

  /**
   * Record command retry
   */
  public recordCommandRetry(): void {
    this.commandRetries.inc();
  }

  /**
   * Update queue depth
   */
  public updateQueueDepth(total: number, byPriority: Record<string, number>): void {
    this.queueDepth.set(total);

    for (const [priority, count] of Object.entries(byPriority)) {
      this.queueDepthByPriority.set({ priority }, count);
    }
  }

  /**
   * Record SLA breach
   */
  public recordSLABreach(priority: string): void {
    this.queueSLABreaches.inc({ priority });
  }

  /**
   * Record queue wait time
   */
  public recordQueueWaitTime(priority: string, waitTimeSeconds: number): void {
    this.queueWaitTime.observe({ priority }, waitTimeSeconds);
  }

  /**
   * Update agent counts
   */
  public updateAgentCounts(
    total: number,
    online: number,
    offline: number,
    degraded: number,
    byType: Record<string, number>
  ): void {
    this.agentsOnline.set(online);
    this.agentsOffline.set(offline);
    this.agentsDegraded.set(degraded);

    for (const [type, count] of Object.entries(byType)) {
      this.agentsTotal.set({ type }, count);
    }
  }

  /**
   * Record agent request
   */
  public recordAgentRequest(agentId: string, responseTimeSeconds: number, isError: boolean): void {
    this.agentRequests.inc({ agent_id: agentId });
    this.agentResponseTime.observe({ agent_id: agentId }, responseTimeSeconds);

    if (isError) {
      this.agentErrors.inc({ agent_id: agentId });
    }
  }

  /**
   * Update DLQ size
   */
  public updateDLQSize(size: number): void {
    this.dlqSize.set(size);
  }

  /**
   * Record DLQ operation
   */
  public recordDLQAdded(): void {
    this.dlqAdded.inc();
  }

  /**
   * Record DLQ replay
   */
  public recordDLQReplayed(): void {
    this.dlqReplayed.inc();
  }

  /**
   * Update uptime
   */
  public updateUptime(seconds: number): void {
    this.systemUptime.set(seconds);
  }

  /**
   * Record event
   */
  public recordEvent(eventType: string): void {
    this.eventCount.inc({ event_type: eventType });
  }

  /**
   * Reset all metrics (for testing)
   */
  public reset(): void {
    this.registry.clear();
    logger.info('Metrics reset');
  }
}
