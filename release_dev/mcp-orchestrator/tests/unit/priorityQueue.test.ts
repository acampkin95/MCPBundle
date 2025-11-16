/**
 * Priority Queue v2.0 Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PriorityQueue, type Priority } from '../../src/services/priorityQueue.js';
import type { QueueConfig } from '../../src/config/orchestrator.config.js';

describe('PriorityQueue', () => {
  let queue: PriorityQueue<string>;
  let config: QueueConfig;

  beforeEach(() => {
    config = {
      maxSize: 100,
      priorities: [
        { level: 'CRITICAL', sla: 1000, order: 0 },
        { level: 'HIGH', sla: 5000, order: 1 },
        { level: 'MEDIUM', sla: 30000, order: 2 },
        { level: 'LOW', sla: 60000, order: 3 },
      ],
      enableSLATracking: true,
      slaWarningThreshold: 0.8,
    };
    queue = new PriorityQueue<string>(config);
  });

  describe('Enqueue/Dequeue', () => {
    it('should enqueue item with default MEDIUM priority', () => {
      const item = queue.enqueue('item-1', 'test data');

      expect(item.id).toBe('item-1');
      expect(item.data).toBe('test data');
      expect(item.priority).toBe('MEDIUM');
      expect(queue.size()).toBe(1);
    });

    it('should enqueue item with specified priority', () => {
      const item = queue.enqueue('item-1', 'test data', 'HIGH');

      expect(item.priority).toBe('HIGH');
      expect(item.sla).toBe(5000);
    });

    it('should dequeue highest priority item first', () => {
      queue.enqueue('low', 'low data', 'LOW');
      queue.enqueue('critical', 'critical data', 'CRITICAL');
      queue.enqueue('medium', 'medium data', 'MEDIUM');
      queue.enqueue('high', 'high data', 'HIGH');

      const first = queue.dequeue();
      expect(first?.id).toBe('critical');
      expect(first?.priority).toBe('CRITICAL');
    });

    it('should dequeue in FIFO order within same priority', () => {
      queue.enqueue('item-1', 'data-1', 'HIGH');
      queue.enqueue('item-2', 'data-2', 'HIGH');
      queue.enqueue('item-3', 'data-3', 'HIGH');

      const first = queue.dequeue();
      const second = queue.dequeue();
      const third = queue.dequeue();

      expect(first?.id).toBe('item-1');
      expect(second?.id).toBe('item-2');
      expect(third?.id).toBe('item-3');
    });

    it('should return null when dequeueing empty queue', () => {
      const item = queue.dequeue();
      expect(item).toBeNull();
    });

    it('should emit item:enqueued event', () => {
      const handler = vi.fn();
      queue.on('item:enqueued', handler);

      queue.enqueue('item-1', 'data');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        id: 'item-1',
        priority: 'MEDIUM',
      }));
    });

    it('should emit item:dequeued event', () => {
      const handler = vi.fn();
      queue.on('item:dequeued', handler);

      queue.enqueue('item-1', 'data');
      queue.dequeue();

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('Peek', () => {
    it('should peek at next item without removing', () => {
      queue.enqueue('item-1', 'data-1', 'HIGH');
      queue.enqueue('item-2', 'data-2', 'CRITICAL');

      const next = queue.peek();

      expect(next?.id).toBe('item-2'); // CRITICAL has highest priority
      expect(queue.size()).toBe(2); // Size unchanged
    });

    it('should return null for empty queue', () => {
      const next = queue.peek();
      expect(next).toBeNull();
    });
  });

  describe('Priority Ordering', () => {
    it('should respect priority order: CRITICAL > HIGH > MEDIUM > LOW', () => {
      queue.enqueue('low', 'low', 'LOW');
      queue.enqueue('medium', 'medium', 'MEDIUM');
      queue.enqueue('high', 'high', 'HIGH');
      queue.enqueue('critical', 'critical', 'CRITICAL');

      expect(queue.dequeue()?.id).toBe('critical');
      expect(queue.dequeue()?.id).toBe('high');
      expect(queue.dequeue()?.id).toBe('medium');
      expect(queue.dequeue()?.id).toBe('low');
    });
  });

  describe('Queue Size Management', () => {
    it('should track queue size', () => {
      expect(queue.size()).toBe(0);

      queue.enqueue('item-1', 'data');
      expect(queue.size()).toBe(1);

      queue.enqueue('item-2', 'data');
      expect(queue.size()).toBe(2);

      queue.dequeue();
      expect(queue.size()).toBe(1);
    });

    it('should enforce max size limit', () => {
      const smallQueue = new PriorityQueue<string>({
        ...config,
        maxSize: 2,
      });

      smallQueue.enqueue('item-1', 'data');
      smallQueue.enqueue('item-2', 'data');

      expect(() => {
        smallQueue.enqueue('item-3', 'data');
      }).toThrow('Queue size limit reached');
    });

    it('should emit queue:size_limit event', () => {
      const smallQueue = new PriorityQueue<string>({
        ...config,
        maxSize: 1,
      });

      const handler = vi.fn();
      smallQueue.on('queue:size_limit', handler);

      smallQueue.enqueue('item-1', 'data');

      expect(() => {
        smallQueue.enqueue('item-2', 'data');
      }).toThrow();

      expect(handler).toHaveBeenCalledWith(1);
    });
  });

  describe('Get by Priority', () => {
    it('should get items by priority level', () => {
      queue.enqueue('high-1', 'data', 'HIGH');
      queue.enqueue('high-2', 'data', 'HIGH');
      queue.enqueue('low-1', 'data', 'LOW');

      const highItems = queue.getByPriority('HIGH');
      const lowItems = queue.getByPriority('LOW');

      expect(highItems.length).toBe(2);
      expect(lowItems.length).toBe(1);
    });

    it('should return empty array for priority with no items', () => {
      const items = queue.getByPriority('CRITICAL');
      expect(items).toEqual([]);
    });
  });

  describe('Clear', () => {
    it('should clear all items', () => {
      queue.enqueue('item-1', 'data');
      queue.enqueue('item-2', 'data');
      queue.enqueue('item-3', 'data');

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.dequeue()).toBeNull();
    });
  });

  describe('SLA Tracking', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should track wait time', async () => {
      const item = queue.enqueue('item-1', 'data', 'CRITICAL');

      // Advance time by 500ms
      vi.advanceTimersByTime(500);

      const dequeued = queue.dequeue();

      expect(dequeued?.id).toBe('item-1');

      const metrics = queue.getMetrics();
      expect(metrics.avgWaitTime).toBeGreaterThan(0);
    });

    it('should emit sla_breach event when SLA exceeded', () => {
      const handler = vi.fn();
      queue.on('queue:sla_breach', handler);

      queue.enqueue('item-1', 'data', 'CRITICAL'); // SLA: 1000ms

      // Advance time past SLA
      vi.advanceTimersByTime(1500);

      queue.dequeue();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should emit sla_warning event when approaching SLA', () => {
      const handler = vi.fn();
      queue.on('queue:sla_warning', handler);

      queue.enqueue('item-1', 'data', 'CRITICAL'); // SLA: 1000ms

      // Advance time to 85% of SLA (warning threshold is 80%)
      vi.advanceTimersByTime(850);

      queue.dequeue();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should not emit events when SLA tracking disabled', () => {
      const noSLAQueue = new PriorityQueue<string>({
        ...config,
        enableSLATracking: false,
      });

      const breachHandler = vi.fn();
      const warningHandler = vi.fn();
      noSLAQueue.on('queue:sla_breach', breachHandler);
      noSLAQueue.on('queue:sla_warning', warningHandler);

      noSLAQueue.enqueue('item-1', 'data', 'CRITICAL');
      vi.advanceTimersByTime(2000);
      noSLAQueue.dequeue();

      expect(breachHandler).not.toHaveBeenCalled();
      expect(warningHandler).not.toHaveBeenCalled();
    });

    it('should get items approaching SLA', () => {
      queue.enqueue('item-1', 'data', 'CRITICAL'); // SLA: 1000ms
      queue.enqueue('item-2', 'data', 'HIGH'); // SLA: 5000ms

      // Advance to 90% of CRITICAL SLA
      vi.advanceTimersByTime(900);

      const approaching = queue.getItemsApproachingSLA();

      expect(approaching.length).toBe(1);
      expect(approaching[0].id).toBe('item-1');
    });
  });

  describe('Metrics', () => {
    it('should track total enqueued and dequeued', () => {
      queue.enqueue('item-1', 'data');
      queue.enqueue('item-2', 'data');
      queue.dequeue();

      const metrics = queue.getMetrics();

      expect(metrics.totalEnqueued).toBe(2);
      expect(metrics.totalDequeued).toBe(1);
      expect(metrics.currentSize).toBe(1);
    });

    it('should track counts by priority', () => {
      queue.enqueue('item-1', 'data', 'HIGH');
      queue.enqueue('item-2', 'data', 'HIGH');
      queue.enqueue('item-3', 'data', 'LOW');

      const metrics = queue.getMetrics();

      expect(metrics.byPriority.HIGH).toBe(2);
      expect(metrics.byPriority.LOW).toBe(1);
      expect(metrics.byPriority.CRITICAL).toBe(0);
    });

    it('should calculate wait time percentiles', () => {
      // Enqueue and dequeue 100 items with varying wait times
      for (let i = 0; i < 100; i++) {
        queue.enqueue(`item-${i}`, 'data');
      }

      for (let i = 0; i < 100; i++) {
        queue.dequeue();
      }

      const metrics = queue.getMetrics();

      expect(metrics.avgWaitTime).toBeGreaterThanOrEqual(0);
      expect(metrics.p95WaitTime).toBeGreaterThanOrEqual(0);
      expect(metrics.p99WaitTime).toBeGreaterThanOrEqual(0);
    });

    it('should track SLA compliance', () => {
      // This item will breach SLA
      queue.enqueue('breach', 'data', 'CRITICAL');
      vi.advanceTimersByTime(2000); // Way past 1000ms SLA
      queue.dequeue();

      // This item is within SLA
      queue.enqueue('ok', 'data', 'CRITICAL');
      queue.dequeue();

      const metrics = queue.getMetrics();

      expect(metrics.slaBreach).toBe(1);
      expect(metrics.slaCompliance).toBe(0.5); // 1 success, 1 breach = 50%
    });

    it('should reset metrics', () => {
      queue.enqueue('item-1', 'data');
      queue.dequeue();

      queue.resetMetrics();

      const metrics = queue.getMetrics();

      expect(metrics.totalEnqueued).toBe(0);
      expect(metrics.totalDequeued).toBe(0);
      expect(metrics.slaBreach).toBe(0);
    });
  });
});
