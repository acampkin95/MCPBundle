/**
 * Dead Letter Queue v2.0
 *
 * Manages commands that have failed after maximum retry attempts.
 * Features:
 * - Failed command storage and tracking
 * - Failure reason capture
 * - Manual replay capability
 * - Auto-replay option
 * - Retention policy
 */

import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import type { DeadLetterQueueConfig } from '../config/orchestrator.config.js';

export interface DeadLetterItem<T = unknown> {
  readonly id: string;
  readonly originalData: T;
  readonly failureReason: string;
  readonly failedAt: Date;
  readonly retryCount: number;
  readonly lastError?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface DLQMetrics {
  totalItems: number;
  totalReplayed: number;
  totalPurged: number;
  oldestItem?: Date;
  newestItem?: Date;
}

export interface DLQEvents {
  'item:added': (item: DeadLetterItem) => void;
  'item:replayed': (item: DeadLetterItem) => void;
  'item:purged': (count: number) => void;
}

/**
 * Dead Letter Queue for failed commands
 */
export class DeadLetterQueue<T = unknown> extends EventEmitter {
  private readonly items = new Map<string, DeadLetterItem<T>>();
  private readonly config: DeadLetterQueueConfig;
  private totalReplayed = 0;
  private totalPurged = 0;
  private autoReplayInterval?: NodeJS.Timeout;

  public constructor(config: DeadLetterQueueConfig) {
    super();
    this.config = config;

    if (config.autoReplayEnabled) {
      this.startAutoReplay();
    }

    logger.info('DeadLetterQueue initialized', {
      enabled: config.enabled,
      maxSize: config.maxSize,
      autoReplay: config.autoReplayEnabled,
    });
  }

  /**
   * Add item to dead letter queue
   */
  public add(
    id: string,
    data: T,
    failureReason: string,
    retryCount: number,
    lastError?: string,
    metadata?: Record<string, unknown>
  ): DeadLetterItem<T> {
    if (!this.config.enabled) {
      logger.warn('Dead letter queue is disabled', { id });
      throw new Error('Dead letter queue is disabled');
    }

    if (this.items.size >= this.config.maxSize) {
      // Remove oldest item to make room
      const oldest = this.getOldest();
      if (oldest) {
        this.remove(oldest.id);
        logger.warn('DLQ size limit reached, removed oldest item', {
          removedId: oldest.id,
        });
      }
    }

    const item: DeadLetterItem<T> = {
      id,
      originalData: data,
      failureReason,
      failedAt: new Date(),
      retryCount,
      lastError,
      metadata,
    };

    this.items.set(id, item);
    this.emit('item:added', item);

    logger.warn('Item added to dead letter queue', {
      id,
      failureReason,
      retryCount,
      lastError,
    });

    return item;
  }

  /**
   * Get item by ID
   */
  public get(id: string): DeadLetterItem<T> | undefined {
    return this.items.get(id);
  }

  /**
   * Get all items
   */
  public getAll(): DeadLetterItem<T>[] {
    return Array.from(this.items.values());
  }

  /**
   * Remove item from DLQ
   */
  public remove(id: string): boolean {
    const removed = this.items.delete(id);
    if (removed) {
      logger.debug('Item removed from DLQ', { id });
    }
    return removed;
  }

  /**
   * Replay item (returns original data for retry)
   */
  public replay(id: string): T | null {
    const item = this.items.get(id);
    if (!item) {
      logger.warn('Cannot replay: item not found in DLQ', { id });
      return null;
    }

    this.totalReplayed++;
    this.emit('item:replayed', item);

    // Remove from DLQ after replay
    this.items.delete(id);

    logger.info('Item replayed from DLQ', {
      id,
      originalFailureReason: item.failureReason,
    });

    return item.originalData;
  }

  /**
   * Replay all items
   */
  public replayAll(): T[] {
    const items = this.getAll();
    const data: T[] = [];

    for (const item of items) {
      const replayed = this.replay(item.id);
      if (replayed) {
        data.push(replayed);
      }
    }

    logger.info('All items replayed from DLQ', { count: data.length });
    return data;
  }

  /**
   * Purge items older than retention period
   */
  public purgeOld(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let purgedCount = 0;

    for (const [id, item] of this.items.entries()) {
      if (item.failedAt < cutoffDate) {
        this.items.delete(id);
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      this.totalPurged += purgedCount;
      this.emit('item:purged', purgedCount);

      logger.info('Purged old items from DLQ', {
        purgedCount,
        retentionDays: this.config.retentionDays,
      });
    }

    return purgedCount;
  }

  /**
   * Clear all items
   */
  public clear(): void {
    const count = this.items.size;
    this.items.clear();

    logger.info('DLQ cleared', { itemsRemoved: count });
  }

  /**
   * Get metrics
   */
  public getMetrics(): DLQMetrics {
    const items = this.getAll();

    let oldestItem: Date | undefined;
    let newestItem: Date | undefined;

    for (const item of items) {
      if (!oldestItem || item.failedAt < oldestItem) {
        oldestItem = item.failedAt;
      }
      if (!newestItem || item.failedAt > newestItem) {
        newestItem = item.failedAt;
      }
    }

    return {
      totalItems: this.items.size,
      totalReplayed: this.totalReplayed,
      totalPurged: this.totalPurged,
      oldestItem,
      newestItem,
    };
  }

  /**
   * Get oldest item
   */
  private getOldest(): DeadLetterItem<T> | null {
    let oldest: DeadLetterItem<T> | null = null;

    for (const item of this.items.values()) {
      if (!oldest || item.failedAt < oldest.failedAt) {
        oldest = item;
      }
    }

    return oldest;
  }

  /**
   * Start auto-replay mechanism
   */
  private startAutoReplay(): void {
    this.autoReplayInterval = setInterval(() => {
      const items = this.getAll();
      if (items.length > 0) {
        logger.info('Auto-replay triggered', { itemCount: items.length });
        this.replayAll();
      }
    }, this.config.autoReplayInterval);

    logger.info('Auto-replay started', {
      interval: this.config.autoReplayInterval,
    });
  }

  /**
   * Stop auto-replay
   */
  public stop(): void {
    if (this.autoReplayInterval) {
      clearInterval(this.autoReplayInterval);
      this.autoReplayInterval = undefined;
    }

    logger.info('DeadLetterQueue stopped');
  }
}
