/**
 * High-performance in-memory cache with LRU eviction
 * @packageDocumentation
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  size: number;
}

/**
 * Lightweight LRU cache with TTL support
 */
export class LRUCache<K, V> {
  private readonly cache: Map<K, CacheEntry<V>>;
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private currentSize: number;

  // Statistics
  private hits: number;
  private misses: number;
  private evictions: number;

  constructor(maxSize: number = 1000, defaultTTL: number = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.currentSize--;
      this.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V, ttl?: number): void {
    // Remove existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.cache.delete(key);
      this.currentSize--;
    }

    // Evict oldest entries if at capacity
    while (this.currentSize >= this.maxSize && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.currentSize--;
      this.evictions++;
    }

    // Calculate expiry
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);

    // Estimate size (rough approximation)
    const size = this.estimateSize(value);

    // Add new entry
    this.cache.set(key, { value, expiresAt, size });
    this.currentSize++;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.currentSize--;
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.currentSize--;
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.currentSize--;
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.currentSize,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Estimate memory size of value (rough approximation)
   */
  private estimateSize(value: V): number {
    // Simple heuristic: assume 1 unit per item
    // Could be enhanced with actual JSON.stringify size
    return 1;
  }
}

/**
 * Cache key generator for structured thinking operations
 */
export class CacheKeyGenerator {
  /**
   * Generate key for timeline summary
   */
  static timelineSummary(checksum: string): string {
    return `timeline:summary:${checksum}`;
  }

  /**
   * Generate key for diagnostics
   */
  static diagnostics(checksum: string, options: { staleHours?: number }): string {
    const optionsKey = JSON.stringify(options);
    return `diagnostics:${checksum}:${optionsKey}`;
  }

  /**
   * Generate key for filtered timeline
   */
  static filteredTimeline(
    checksum: string,
    filters: {
      stage?: string;
      branchId?: string;
      tags?: readonly string[];
      importance?: string;
      textIncludes?: string;
      limit?: number;
      sinceThoughtNumber?: number;
    }
  ): string {
    const filterKey = JSON.stringify(filters);
    return `filtered:${checksum}:${filterKey}`;
  }

  /**
   * Generate key for normalized timeline
   */
  static normalizedTimeline(checksum: string): string {
    return `normalized:${checksum}`;
  }

  /**
   * Generate checksum for timeline (fast hash)
   */
  static timelineChecksum(timeline: readonly { id: string; timestamp: string }[]): string {
    if (timeline.length === 0) {
      return 'empty';
    }

    // Fast checksum: length + first ID + last ID + last timestamp
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    return `${timeline.length}:${first.id}:${last.id}:${last.timestamp}`;
  }
}

/**
 * Batch processor for reducing database writes
 */
export class BatchProcessor<T> {
  private queue: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly batchDelay: number;
  private readonly processor: (batch: T[]) => Promise<void>;

  constructor(
    processor: (batch: T[]) => Promise<void>,
    options: {
      batchSize?: number;
      batchDelay?: number;
    } = {}
  ) {
    this.processor = processor;
    this.batchSize = options.batchSize ?? 100;
    this.batchDelay = options.batchDelay ?? 1000;
  }

  /**
   * Add item to batch queue
   */
  add(item: T): void {
    this.queue.push(item);

    // Process immediately if batch is full
    if (this.queue.length >= this.batchSize) {
      void this.flush();
      return;
    }

    // Schedule delayed processing
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.batchDelay);
    }
  }

  /**
   * Flush pending items
   */
  async flush(): Promise<void> {
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Process queue
    if (this.queue.length === 0) {
      return;
    }

    const batch = this.queue.splice(0, this.queue.length);
    await this.processor(batch);
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}
