/**
 * Unit tests for cache utilities
 *
 * Tests cover:
 * - LRUCache operations
 * - TTL expiration
 * - Eviction policies
 * - Cache statistics
 * - CacheKeyGenerator
 * - BatchProcessor
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LRUCache, CacheKeyGenerator, BatchProcessor } from '../src/cache.js';

// ============================================================================
// Tests: LRUCache Basic Operations
// ============================================================================

describe('LRUCache - Basic Operations', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache<string, string>(5, 60000); // 5 items, 60s TTL
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    const value = cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const value = cache.get('nonexistent');
    expect(value).toBeUndefined();
  });

  it('should check key existence', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);

    const deleted = cache.delete('key1');
    expect(deleted).toBe(true);
    expect(cache.has('key1')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    cache.clear();

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(false);
  });

  it('should update existing entries', () => {
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');

    const value = cache.get('key1');
    expect(value).toBe('value2');
  });
});

// ============================================================================
// Tests: LRUCache LRU Eviction
// ============================================================================

describe('LRUCache - LRU Eviction', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache<string, string>(3, 60000); // Max 3 items
  });

  it('should evict least recently used item when full', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Cache is now full

    cache.set('key4', 'value4'); // Should evict key1

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
    expect(cache.has('key3')).toBe(true);
    expect(cache.has('key4')).toBe(true);
  });

  it('should update access order on get', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Access key1 to make it most recently used
    cache.get('key1');

    cache.set('key4', 'value4'); // Should evict key2, not key1

    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(true);
    expect(cache.has('key4')).toBe(true);
  });

  it('should track evictions in statistics', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // Triggers eviction

    const stats = cache.getStats();
    expect(stats.evictions).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tests: LRUCache TTL Expiration
// ============================================================================

describe('LRUCache - TTL Expiration', () => {
  it('should expire entries after TTL', () => {
    const cache = new LRUCache<string, string>(5, 100); // 100ms TTL

    cache.set('key1', 'value1');

    // Should exist immediately
    expect(cache.has('key1')).toBe(true);

    // Wait for expiration
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.has('key1')).toBe(false);
        resolve();
      }, 150);
    });
  });

  it('should allow custom TTL per entry', () => {
    const cache = new LRUCache<string, string>(5, 60000);

    cache.set('key1', 'value1', 100); // 100ms TTL
    cache.set('key2', 'value2', 5000); // 5s TTL

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.has('key1')).toBe(false);
        expect(cache.has('key2')).toBe(true);
        resolve();
      }, 150);
    });
  });

  it('should cleanup expired entries', () => {
    const cache = new LRUCache<string, string>(5, 100); // 100ms TTL

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const removed = cache.cleanup();
        expect(removed).toBe(3);
        resolve();
      }, 150);
    });
  });
});

// ============================================================================
// Tests: LRUCache Statistics
// ============================================================================

describe('LRUCache - Statistics', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache<string, string>(5, 60000);
  });

  it('should track cache hits', () => {
    cache.set('key1', 'value1');

    cache.get('key1'); // Hit
    cache.get('key1'); // Hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
  });

  it('should track cache misses', () => {
    cache.get('nonexistent'); // Miss
    cache.get('nonexistent'); // Miss

    const stats = cache.getStats();
    expect(stats.misses).toBe(2);
  });

  it('should calculate hit rate', () => {
    cache.set('key1', 'value1');

    cache.get('key1'); // Hit
    cache.get('key2'); // Miss

    const stats = cache.getStats();
    expect(stats.hitRate).toBeCloseTo(0.5, 1);
  });

  it('should track cache size', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(5);
  });

  it('should reset statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1'); // Hit
    cache.get('key2'); // Miss

    cache.resetStats();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.evictions).toBe(0);
  });
});

// ============================================================================
// Tests: CacheKeyGenerator
// ============================================================================

describe('CacheKeyGenerator', () => {
  it('should generate timeline summary keys', () => {
    const key1 = CacheKeyGenerator.timelineSummary('checksum123');
    expect(key1).toBe('timeline:summary:checksum123');

    const key2 = CacheKeyGenerator.timelineSummary('checksum456');
    expect(key2).toBe('timeline:summary:checksum456');

    expect(key1).not.toBe(key2);
  });

  it('should generate diagnostics keys', () => {
    const key1 = CacheKeyGenerator.diagnostics('checksum123', { staleHours: 24 });
    const key2 = CacheKeyGenerator.diagnostics('checksum123', { staleHours: 48 });

    expect(key1).toContain('diagnostics:checksum123');
    expect(key2).toContain('diagnostics:checksum123');
    expect(key1).not.toBe(key2); // Different options = different keys
  });

  it('should generate filtered timeline keys', () => {
    const key1 = CacheKeyGenerator.filteredTimeline('checksum123', {
      stage: 'research',
      limit: 10,
    });

    const key2 = CacheKeyGenerator.filteredTimeline('checksum123', {
      stage: 'analysis',
      limit: 10,
    });

    expect(key1).toContain('filtered:checksum123');
    expect(key2).toContain('filtered:checksum123');
    expect(key1).not.toBe(key2);
  });

  it('should generate normalized timeline keys', () => {
    const key = CacheKeyGenerator.normalizedTimeline('checksum123');
    expect(key).toBe('normalized:checksum123');
  });

  it('should generate timeline checksums', () => {
    const timeline1 = [
      { id: 'T001', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'T002', timestamp: '2025-01-01T00:01:00.000Z' },
    ];

    const timeline2 = [
      { id: 'T001', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'T003', timestamp: '2025-01-01T00:02:00.000Z' },
    ];

    const checksum1 = CacheKeyGenerator.timelineChecksum(timeline1);
    const checksum2 = CacheKeyGenerator.timelineChecksum(timeline2);

    expect(checksum1).not.toBe(checksum2);
  });

  it('should handle empty timeline checksums', () => {
    const checksum = CacheKeyGenerator.timelineChecksum([]);
    expect(checksum).toBe('empty');
  });

  it('should generate consistent checksums for same timeline', () => {
    const timeline = [
      { id: 'T001', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'T002', timestamp: '2025-01-01T00:01:00.000Z' },
    ];

    const checksum1 = CacheKeyGenerator.timelineChecksum(timeline);
    const checksum2 = CacheKeyGenerator.timelineChecksum(timeline);

    expect(checksum1).toBe(checksum2);
  });
});

// ============================================================================
// Tests: BatchProcessor
// ============================================================================

describe('BatchProcessor', () => {
  it('should process batches when size reached', async () => {
    const processed: number[][] = [];
    const processor = new BatchProcessor<number>(
      async (batch) => {
        processed.push([...batch]);
      },
      { batchSize: 3, batchDelay: 1000 }
    );

    processor.add(1);
    processor.add(2);
    processor.add(3); // Should trigger immediate processing

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(processed).toHaveLength(1);
    expect(processed[0]).toEqual([1, 2, 3]);
  });

  it('should process batches after delay', async () => {
    const processed: number[][] = [];
    const processor = new BatchProcessor<number>(
      async (batch) => {
        processed.push([...batch]);
      },
      { batchSize: 10, batchDelay: 100 }
    );

    processor.add(1);
    processor.add(2);

    // Wait for delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(processed).toHaveLength(1);
    expect(processed[0]).toEqual([1, 2]);
  });

  it('should flush manually', async () => {
    const processed: number[][] = [];
    const processor = new BatchProcessor<number>(
      async (batch) => {
        processed.push([...batch]);
      },
      { batchSize: 10, batchDelay: 1000 }
    );

    processor.add(1);
    processor.add(2);

    await processor.flush();

    expect(processed).toHaveLength(1);
    expect(processed[0]).toEqual([1, 2]);
  });

  it('should track queue size', () => {
    const processor = new BatchProcessor<number>(
      async () => {
        // No-op
      },
      { batchSize: 10, batchDelay: 1000 }
    );

    expect(processor.getQueueSize()).toBe(0);

    processor.add(1);
    processor.add(2);
    processor.add(3);

    expect(processor.getQueueSize()).toBe(3);
  });

  it('should handle empty flush', async () => {
    const processed: number[][] = [];
    const processor = new BatchProcessor<number>(
      async (batch) => {
        processed.push([...batch]);
      },
      { batchSize: 10, batchDelay: 1000 }
    );

    await processor.flush();

    expect(processed).toHaveLength(0);
  });

  it('should process multiple batches', async () => {
    const processed: number[][] = [];
    const processor = new BatchProcessor<number>(
      async (batch) => {
        processed.push([...batch]);
      },
      { batchSize: 2, batchDelay: 1000 }
    );

    processor.add(1);
    processor.add(2); // Batch 1
    processor.add(3);
    processor.add(4); // Batch 2

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(processed).toHaveLength(2);
    expect(processed[0]).toEqual([1, 2]);
    expect(processed[1]).toEqual([3, 4]);
  });

  it('should clear timer after manual flush', async () => {
    const processed: number[][] = [];
    const processor = new BatchProcessor<number>(
      async (batch) => {
        processed.push([...batch]);
      },
      { batchSize: 10, batchDelay: 100 }
    );

    processor.add(1);
    await processor.flush();

    // Wait longer than delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should only have processed once (manual flush)
    expect(processed).toHaveLength(1);
  });
});

// ============================================================================
// Tests: Cache Integration
// ============================================================================

describe('Cache Integration', () => {
  it('should use cache keys with LRUCache', () => {
    const cache = new LRUCache<string, unknown>(100, 60000);

    const timeline = [
      { id: 'T001', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'T002', timestamp: '2025-01-01T00:01:00.000Z' },
    ];

    const checksum = CacheKeyGenerator.timelineChecksum(timeline);
    const summaryKey = CacheKeyGenerator.timelineSummary(checksum);

    const summaryData = { total: 2, stages: ['research', 'analysis'] };
    cache.set(summaryKey, summaryData);

    const retrieved = cache.get(summaryKey);
    expect(retrieved).toEqual(summaryData);
  });

  it('should invalidate cache on timeline changes', () => {
    const cache = new LRUCache<string, unknown>(100, 60000);

    const timeline1 = [
      { id: 'T001', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'T002', timestamp: '2025-01-01T00:01:00.000Z' },
    ];

    const checksum1 = CacheKeyGenerator.timelineChecksum(timeline1);
    const key1 = CacheKeyGenerator.timelineSummary(checksum1);

    cache.set(key1, { total: 2 });

    // Timeline changes
    const timeline2 = [
      ...timeline1,
      { id: 'T003', timestamp: '2025-01-01T00:02:00.000Z' },
    ];

    const checksum2 = CacheKeyGenerator.timelineChecksum(timeline2);
    const key2 = CacheKeyGenerator.timelineSummary(checksum2);

    // Different checksums = different keys
    expect(key1).not.toBe(key2);

    // Old key should still have cached data
    expect(cache.has(key1)).toBe(true);

    // New key should not
    expect(cache.has(key2)).toBe(false);
  });
});
