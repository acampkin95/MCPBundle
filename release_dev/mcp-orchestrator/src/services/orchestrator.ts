/**
 * Orchestrator v2.0
 *
 * Main orchestrator class that coordinates all components:
 * - Agent registry
 * - Priority queue
 * - Command executor with retry and DLQ
 * - Event system
 * - Metrics collection
 */

import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import { logger } from '../utils/logger.js';
import {
  getConfig,
  validateConfig,
  type OrchestratorConfig,
} from '../config/orchestrator.config.js';
import { AgentRegistry, type AgentMetadata, type AgentRegistrationRequest } from './agentRegistry.js';
import { PriorityQueue, type Priority, type QueueItem } from './priorityQueue.js';
import { DeadLetterQueue } from './deadLetterQueue.js';
import { CommandExecutor, type CommandContext, type ExecutionResult } from './commandExecutor.js';
import { EventSystem, type OrchestratorEventType } from './eventSystem.js';
import { MetricsCollector } from './metricsCollector.js';

/**
 * Main orchestrator class
 */
export class Orchestrator extends EventEmitter {
  private readonly config: OrchestratorConfig;
  private readonly agentRegistry: AgentRegistry;
  private readonly priorityQueue: PriorityQueue;
  private readonly dlq: DeadLetterQueue;
  private readonly commandExecutor: CommandExecutor;
  private readonly eventSystem: EventSystem;
  private readonly metricsCollector: MetricsCollector;

  private metricsServer?: Server;
  private readonly startTime: Date;
  private running = false;

  public constructor(config?: Partial<OrchestratorConfig>) {
    super();

    // Get and validate configuration
    this.config = getConfig(config);
    validateConfig(this.config);

    this.startTime = new Date();

    // Initialize components
    this.agentRegistry = new AgentRegistry(this.config.agents);
    this.priorityQueue = new PriorityQueue(this.config.queue);
    this.dlq = new DeadLetterQueue(this.config.deadLetterQueue);
    this.commandExecutor = new CommandExecutor(this.config.retry, this.dlq);
    this.eventSystem = new EventSystem(this.config.events);
    this.metricsCollector = new MetricsCollector(this.config.metrics);

    // Wire up event propagation
    this.setupEventPropagation();

    logger.info('Orchestrator v2.0 initialized', {
      version: this.config.version,
    });
  }

  /**
   * Start the orchestrator
   */
  public async start(): Promise<void> {
    if (this.running) {
      logger.warn('Orchestrator already running');
      return;
    }

    this.running = true;

    // Start metrics server if enabled
    if (this.config.metrics.enabled) {
      await this.startMetricsServer();
    }

    // Emit system started event
    this.eventSystem.emitEvent('system:started', {
      version: this.config.version,
      startTime: this.startTime,
    });

    logger.info('Orchestrator started', {
      metricsEnabled: this.config.metrics.enabled,
      prometheusPort: this.config.metrics.prometheusPort,
    });
  }

  /**
   * Stop the orchestrator
   */
  public async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('Orchestrator not running');
      return;
    }

    this.running = false;

    // Stop metrics server
    if (this.metricsServer) {
      await new Promise<void>((resolve) => {
        this.metricsServer!.close(() => resolve());
      });
      this.metricsServer = undefined;
    }

    // Stop components
    this.agentRegistry.stop();
    this.dlq.stop();

    // Emit system stopped event
    this.eventSystem.emitEvent('system:stopped', {
      uptime: Date.now() - this.startTime.getTime(),
    });

    logger.info('Orchestrator stopped');
  }

  /**
   * Register an agent
   */
  public registerAgent(request: AgentRegistrationRequest): AgentMetadata {
    const agent = this.agentRegistry.registerAgent(request);
    this.updateAgentMetrics();
    return agent;
  }

  /**
   * Unregister an agent
   */
  public unregisterAgent(agentId: string, reason?: string): boolean {
    const success = this.agentRegistry.unregisterAgent(agentId, reason);
    if (success) {
      this.updateAgentMetrics();
    }
    return success;
  }

  /**
   * Record agent heartbeat
   */
  public recordAgentHeartbeat(agentId: string): boolean {
    return this.agentRegistry.recordHeartbeat(agentId);
  }

  /**
   * Get agent
   */
  public getAgent(agentId: string): AgentMetadata | undefined {
    return this.agentRegistry.getAgent(agentId);
  }

  /**
   * Get all agents
   */
  public getAllAgents(): AgentMetadata[] {
    return this.agentRegistry.getAllAgents();
  }

  /**
   * Get healthy agents
   */
  public getHealthyAgents(): AgentMetadata[] {
    return this.agentRegistry.getHealthyAgents();
  }

  /**
   * Enqueue a command
   */
  public enqueue<T>(id: string, data: T, priority: Priority = 'MEDIUM'): QueueItem<T> {
    const item = this.priorityQueue.enqueue(id, data, priority);
    this.eventSystem.emitEvent('command:queued', item);
    this.updateQueueMetrics();
    return item;
  }

  /**
   * Dequeue next command
   */
  public dequeue<T>(): QueueItem<T> | null {
    const item = this.priorityQueue.dequeue<T>();
    if (item) {
      this.updateQueueMetrics();
    }
    return item;
  }

  /**
   * Execute command with retry and DLQ
   */
  public async executeCommand<T, R>(
    context: CommandContext<T>,
    executor: (data: T) => Promise<R>
  ): Promise<ExecutionResult<R>> {
    const startTime = Date.now();

    this.eventSystem.emitEvent('command:executing', { commandId: context.commandId });

    const result = await this.commandExecutor.execute(context, executor);

    const durationSeconds = (Date.now() - startTime) / 1000;

    // Record metrics
    this.metricsCollector.recordCommandExecution(
      result.success ? 'success' : 'error',
      durationSeconds
    );

    if (!result.success) {
      this.metricsCollector.recordCommandError(result.error ?? 'unknown');
      this.eventSystem.emitEvent('command:failed', {
        commandId: context.commandId,
        error: result.error,
        retryCount: result.retryCount,
      });
    } else {
      this.eventSystem.emitEvent('command:completed', {
        commandId: context.commandId,
        executionTime: durationSeconds,
      });
    }

    return result;
  }

  /**
   * Get queue metrics
   */
  public getQueueMetrics() {
    return this.priorityQueue.getMetrics();
  }

  /**
   * Get agent registry stats
   */
  public getAgentStats() {
    return this.agentRegistry.getStats();
  }

  /**
   * Get DLQ metrics
   */
  public getDLQMetrics() {
    return this.dlq.getMetrics();
  }

  /**
   * Get event stats
   */
  public getEventStats() {
    return this.eventSystem.getStats();
  }

  /**
   * Get events by type
   */
  public getEvents(type?: OrchestratorEventType, limit?: number) {
    if (type) {
      return this.eventSystem.getEventsByType(type, limit);
    }
    return this.eventSystem.getRecentEvents(limit);
  }

  /**
   * Get Prometheus metrics
   */
  public async getMetrics(): Promise<string> {
    return await this.metricsCollector.getMetrics();
  }

  /**
   * Get system health
   */
  public getHealth() {
    const uptime = Date.now() - this.startTime.getTime();
    const agentStats = this.agentRegistry.getStats();
    const queueMetrics = this.priorityQueue.getMetrics();
    const dlqMetrics = this.dlq.getMetrics();

    return {
      status: this.running ? 'running' : 'stopped',
      version: this.config.version,
      uptime,
      agents: {
        total: agentStats.totalAgents,
        online: agentStats.online,
        offline: agentStats.offline,
        degraded: agentStats.degraded,
      },
      queue: {
        size: queueMetrics.currentSize,
        slaCompliance: queueMetrics.slaCompliance,
      },
      dlq: {
        size: dlqMetrics.totalItems,
      },
    };
  }

  /**
   * Setup event propagation from components to event system
   */
  private setupEventPropagation(): void {
    // Agent registry events
    this.agentRegistry.on('agent:registered', (agent: AgentMetadata) => {
      this.eventSystem.emitEvent('agent:registered', agent);
      this.metricsCollector.recordEvent('agent:registered');
    });

    this.agentRegistry.on('agent:unregistered', (agentId: string, reason: string) => {
      this.eventSystem.emitEvent('agent:unregistered', { agentId, reason });
      this.metricsCollector.recordEvent('agent:unregistered');
    });

    this.agentRegistry.on('agent:status_changed', (agentId, oldStatus, newStatus) => {
      this.eventSystem.emitEvent('agent:status_changed', {
        agentId,
        oldStatus,
        newStatus,
      });
      this.metricsCollector.recordEvent('agent:status_changed');
      this.updateAgentMetrics();
    });

    this.agentRegistry.on('agent:heartbeat_failed', (agentId, lastHeartbeat) => {
      this.eventSystem.emitEvent('agent:heartbeat_failed', { agentId, lastHeartbeat });
      this.metricsCollector.recordEvent('agent:heartbeat_failed');
    });

    // Queue events
    this.priorityQueue.on('queue:sla_breach', (item, waitTime, sla) => {
      this.eventSystem.emitEvent('queue:sla_breach', { item, waitTime, sla });
      this.metricsCollector.recordSLABreach(item.priority);
      this.metricsCollector.recordEvent('queue:sla_breach');
    });

    this.priorityQueue.on('queue:sla_warning', (item, waitTime, sla) => {
      this.eventSystem.emitEvent('queue:sla_warning', { item, waitTime, sla });
      this.metricsCollector.recordEvent('queue:sla_warning');
    });

    // Command executor events
    this.commandExecutor.on('command:retry', (commandId, attempt) => {
      this.eventSystem.emitEvent('command:retry', { commandId, attempt });
      this.metricsCollector.recordCommandRetry();
      this.metricsCollector.recordEvent('command:retry');
    });

    this.commandExecutor.on('command:dead_letter', (commandId, item) => {
      this.eventSystem.emitEvent('command:dead_letter', { commandId, item });
      this.metricsCollector.recordDLQAdded();
      this.metricsCollector.recordEvent('command:dead_letter');
      this.updateDLQMetrics();
    });

    // DLQ events
    this.dlq.on('item:replayed', () => {
      this.metricsCollector.recordDLQReplayed();
      this.updateDLQMetrics();
    });
  }

  /**
   * Update agent metrics
   */
  private updateAgentMetrics(): void {
    const stats = this.agentRegistry.getStats();
    this.metricsCollector.updateAgentCounts(
      stats.totalAgents,
      stats.online,
      stats.offline,
      stats.degraded,
      stats.byType
    );
  }

  /**
   * Update queue metrics
   */
  private updateQueueMetrics(): void {
    const metrics = this.priorityQueue.getMetrics();
    this.metricsCollector.updateQueueDepth(metrics.currentSize, metrics.byPriority);
  }

  /**
   * Update DLQ metrics
   */
  private updateDLQMetrics(): void {
    const metrics = this.dlq.getMetrics();
    this.metricsCollector.updateDLQSize(metrics.totalItems);
  }

  /**
   * Start Prometheus metrics HTTP server
   */
  private async startMetricsServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.metricsServer = createServer(async (req, res) => {
        if (req.url === this.config.metrics.prometheusPath) {
          try {
            // Update uptime metric
            const uptime = (Date.now() - this.startTime.getTime()) / 1000;
            this.metricsCollector.updateUptime(uptime);

            // Get metrics
            const metrics = await this.metricsCollector.getMetrics();

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(metrics);
          } catch (error) {
            logger.error('Error generating metrics', { error });
            res.writeHead(500);
            res.end('Error generating metrics');
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.metricsServer.listen(this.config.metrics.prometheusPort, () => {
        logger.info('Metrics server started', {
          port: this.config.metrics.prometheusPort,
          path: this.config.metrics.prometheusPath,
        });
        resolve();
      });

      this.metricsServer.on('error', (error) => {
        logger.error('Metrics server error', { error });
        reject(error);
      });
    });
  }
}
