/**
 * LRU (Least Recently Used) Cache Implementation
 * Optimized for memory management with size limits and TTL support
 */
interface LRUCacheOptions {
    readonly maxSize: number;
    readonly maxEntries?: number;
    readonly ttl?: number;
    readonly onEvict?: (key: string, value: unknown) => void;
}
export declare class LRUCache<T> {
    private readonly cache;
    private readonly options;
    private currentSize;
    constructor(options: LRUCacheOptions);
    /**
     * Get value from cache
     */
    get(key: string): T | undefined;
    /**
     * Set value in cache
     */
    set(key: string, value: T): void;
    /**
     * Check if key exists in cache
     */
    has(key: string): boolean;
    /**
     * Delete key from cache
     */
    delete(key: string): boolean;
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    stats(): {
        readonly size: number;
        readonly entries: number;
        readonly maxSize: number;
        readonly maxEntries: number;
        readonly utilizationPercent: number;
    };
    /**
     * Prune expired entries
     */
    prune(): number;
    /**
     * Get all keys (ordered by recency)
     */
    keys(): string[];
    /**
     * Check if entry is expired
     */
    private isExpired;
    /**
     * Evict oldest (least recently used) entry
     */
    private evictOldest;
    /**
     * Calculate size of value in bytes (approximate)
     */
    private calculateSize;
}
export {};
//# sourceMappingURL=LRUCache.d.ts.map