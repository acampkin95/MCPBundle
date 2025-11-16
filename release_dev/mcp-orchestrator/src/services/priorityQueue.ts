/**
 * Priority Queue v2.0
 *
 * Advanced priority-based queue with:
 * - Priority levels (CRITICAL, HIGH, MEDIUM, LOW)
 * - SLA tracking and breach detection
 * - Performance metrics
 * - Event emission on SLA breaches
 */

import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import type { QueueConfig } from '../config/orchestrator.config.js';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface QueueItem<T = unknown> {
  readonly id: string;
  readonly data: T;
  readonly priority: Priority;
  readonly enqueuedAt: Date;
  readonly sla: number; // milliseconds
  dequeuedAt?: Date;
}

export interface QueueMetrics {
  totalEnqueued: number;
  totalDequeued: number;
  currentSize: number;
  byPriority: Record<Priority, number>;
  avgWaitTime: number;
  p95WaitTime: number;
  p99WaitTime: number;
  slaCompliance: number; // percentage 0-1
  slaBreach: number; // count
}

export interface QueueEvents {
  'item:enqueued': (item: QueueItem) => void;
  'item:dequeued': (item: QueueItem) => void;
  'queue:sla_breach': (item: QueueItem, waitTime: number, sla: number) => void;
  'queue:sla_warning': (item: QueueItem, waitTime: number, sla: number, threshold: number) => void;
  'queue:size_limit': (maxSize: number) => void;
}

/**
 * Priority Queue with SLA tracking
 */
export class PriorityQueue<T = unknown> extends EventEmitter {
  private readonly queues: Map<Priority, QueueItem<T>[]>;
  private readonly config: QueueConfig;
  private readonly priorityOrder: Map<Priority, number>;
  private readonly slaMap: Map<Priority, number>;

  // Metrics tracking
  private totalEnqueued = 0;
  private totalDequeued = 0;
  private slaBreaches = 0;
  private readonly waitTimeSamples: number[] = [];
  private readonly maxSamples = 1000;

  public constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.queues = new Map<Priority, QueueItem<T>[]>([
      ['CRITICAL', []],
      ['HIGH', []],
      ['MEDIUM', []],
      ['LOW', []],
    ]);

    // Build priority order map
    this.priorityOrder = new Map<Priority, number>();
    this.slaMap = new Map<Priority, number>();

    for (const priority of config.priorities) {
      this.priorityOrder.set(priority.level, priority.order);
      this.slaMap.set(priority.level, priority.sla);
    }

    logger.info('PriorityQueue initialized', {
      maxSize: config.maxSize,
      slaTracking: config.enableSLATracking,
    });
  }

  /**
   * Enqueue an item with priority
   */
  public enqueue(id: string, data: T, priority: Priority = 'MEDIUM'): QueueItem<T> {
    if (this.size() >= this.config.maxSize) {
      this.emit('queue:size_limit', this.config.maxSize);
      throw new Error(`Queue size limit reached: ${this.config.maxSize}`);
    }

    const sla = this.slaMap.get(priority) ?? 30000;

    const item: QueueItem<T> = {
      id,
      data,
      priority,
      enqueuedAt: new Date(),
      sla,
    };

    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    queue.push(item);
    this.totalEnqueued++;

    this.emit('item:enqueued', item);

    logger.debug('Item enqueued', {
      id,
      priority,
      sla,
      queueSize: this.size(),
    });

    return item;
  }

  /**
   * Dequeue highest priority item
   */
  public dequeue(): QueueItem<T> | null {
    // Get priorities in order (CRITICAL first)
    const priorities: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) {
        continue;
      }

      // Get oldest item from this priority level (FIFO within priority)
      const item = queue.shift()!;
      item.dequeuedAt = new Date();

      this.totalDequeued++;

      // Track wait time
      const waitTime = item.dequeuedAt.getTime() - item.enqueuedAt.getTime();
      this.recordWaitTime(waitTime);

      // Check SLA
      if (this.config.enableSLATracking) {
        this.checkSLA(item, waitTime);
      }

      this.emit('item:dequeued', item);

      logger.debug('Item dequeued', {
        id: item.id,
        priority: item.priority,
        waitTime,
        sla: item.sla,
      });

      return item;
    }

    return null; // Queue empty
  }

  /**
   * Peek at next item without removing
   */
  public peek(): QueueItem<T> | null {
    const priorities: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        return queue[0];
      }
    }

    return null;
  }

  /**
   * Get queue size
   */
  public size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get items by priority level
   */
  public getByPriority(priority: Priority): QueueItem<T>[] {
    const queue = this.queues.get(priority);
    return queue ? [...queue] : [];
  }

  /**
   * Clear all items
   */
  public clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }

    logger.info('Queue cleared');
  }

  /**
   * Get queue metrics
   */
  public getMetrics(): QueueMetrics {
    const byPriority: Record<Priority, number> = {
      CRITICAL: this.queues.get('CRITICAL')?.length ?? 0,
      HIGH: this.queues.get('HIGH')?.length ?? 0,
      MEDIUM: this.queues.get('MEDIUM')?.length ?? 0,
      LOW: this.queues.get('LOW')?.length ?? 0,
    };

    // Calculate wait time statistics
    const samples = this.waitTimeSamples;
    const avgWaitTime =
      samples.length > 0 ? samples.reduce((sum, val) => sum + val, 0) / samples.length : 0;

    const sorted = [...samples].sort((a, b) => a - b);
    const p95WaitTime = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const p99WaitTime = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;

    // Calculate SLA compliance
    const totalProcessed = this.totalDequeued;
    const slaCompliance =
      totalProcessed > 0 ? (totalProcessed - this.slaBreaches) / totalProcessed : 1;

    return {
      totalEnqueued: this.totalEnqueued,
      totalDequeued: this.totalDequeued,
      currentSize: this.size(),
      byPriority,
      avgWaitTime,
      p95WaitTime,
      p99WaitTime,
      slaCompliance,
      slaBreach: this.slaBreaches,
    };
  }

  /**
   * Record wait time sample
   */
  private recordWaitTime(waitTime: number): void {
    this.waitTimeSamples.push(waitTime);

    // Keep samples limited
    if (this.waitTimeSamples.length > this.maxSamples) {
      this.waitTimeSamples.shift();
    }
  }

  /**
   * Check SLA compliance for item
   */
  private checkSLA(item: QueueItem<T>, waitTime: number): void {
    const sla = item.sla;
    const warningThreshold = sla * this.config.slaWarningThreshold;

    if (waitTime > sla) {
      // SLA breached
      this.slaBreaches++;
      this.emit('queue:sla_breach', item, waitTime, sla);

      logger.warn('SLA breach detected', {
        id: item.id,
        priority: item.priority,
        waitTime,
        sla,
        breach: waitTime - sla,
      });
    } else if (waitTime > warningThreshold) {
      // Approaching SLA breach
      this.emit('queue:sla_warning', item, waitTime, sla, this.config.slaWarningThreshold);

      logger.debug('SLA warning', {
        id: item.id,
        priority: item.priority,
        waitTime,
        sla,
        threshold: warningThreshold,
      });
    }
  }

  /**
   * Get items approaching SLA breach
   */
  public getItemsApproachingSLA(): QueueItem<T>[] {
    const now = new Date();
    const items: QueueItem<T>[] = [];

    for (const queue of this.queues.values()) {
      for (const item of queue) {
        const waitTime = now.getTime() - item.enqueuedAt.getTime();
        const warningThreshold = item.sla * this.config.slaWarningThreshold;

        if (waitTime > warningThreshold) {
          items.push(item);
        }
      }
    }

    return items;
  }

  /**
   * Reset metrics (for testing)
   */
  public resetMetrics(): void {
    this.totalEnqueued = 0;
    this.totalDequeued = 0;
    this.slaBreaches = 0;
    this.waitTimeSamples.length = 0;

    logger.info('Queue metrics reset');
  }
}
