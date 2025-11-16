/**
 * LRU (Least Recently Used) Cache Implementation
 * Optimized for memory management with size limits and TTL support
 */

interface CacheEntry<T> {
  readonly value: T;
  readonly timestamp: number;
  readonly size: number;
}

interface LRUCacheOptions {
  readonly maxSize: number; // Maximum total size in bytes
  readonly maxEntries?: number; // Maximum number of entries
  readonly ttl?: number; // Time-to-live in milliseconds
  readonly onEvict?: (key: string, value: unknown) => void;
}

export class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly options: Required<LRUCacheOptions>;
  private currentSize = 0;

  constructor(options: LRUCacheOptions) {
    this.options = {
      maxSize: options.maxSize,
      maxEntries: options.maxEntries ?? Number.MAX_SAFE_INTEGER,
      ttl: options.ttl ?? Number.MAX_SAFE_INTEGER,
      onEvict: options.onEvict ?? (() => {}),
    };
  }

  /**
   * Get value from cache
   */
  public get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  public set(key: string, value: T): void {
    // Calculate entry size
    const size = this.calculateSize(value);

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict entries until we have space
    while (
      this.currentSize + size > this.options.maxSize ||
      this.cache.size >= this.options.maxEntries
    ) {
      this.evictOldest();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      size,
    });

    this.currentSize += size;
  }

  /**
   * Check if key exists in cache
   */
  public has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check expiration
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  public delete(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentSize -= entry.size;

    // Call eviction callback
    this.options.onEvict(key, entry.value);

    return true;
  }

  /**
   * Clear all entries
   */
  public clear(): void {
    for (const [key, entry] of this.cache.entries()) {
      this.options.onEvict(key, entry.value);
    }

    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  public stats(): {
    readonly size: number;
    readonly entries: number;
    readonly maxSize: number;
    readonly maxEntries: number;
    readonly utilizationPercent: number;
  } {
    return {
      size: this.currentSize,
      entries: this.cache.size,
      maxSize: this.options.maxSize,
      maxEntries: this.options.maxEntries,
      utilizationPercent: (this.currentSize / this.options.maxSize) * 100,
    };
  }

  /**
   * Prune expired entries
   */
  public prune(): number {
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get all keys (ordered by recency)
   */
  public keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.options.ttl;
  }

  /**
   * Evict oldest (least recently used) entry
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;

    if (firstKey) {
      this.delete(firstKey as string);
    }
  }

  /**
   * Calculate size of value in bytes (approximate)
   */
  private calculateSize(value: T): number {
    try {
      const json = JSON.stringify(value);
      return json.length * 2; // UTF-16 uses 2 bytes per character
    } catch {
      // Fallback for non-serializable objects
      return 1024; // 1KB default estimate
    }
  }
}
