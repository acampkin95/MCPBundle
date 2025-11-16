"use strict";
/**
 * LRU (Least Recently Used) Cache Implementation
 * Optimized for memory management with size limits and TTL support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LRUCache = void 0;
class LRUCache {
    cache = new Map();
    options;
    currentSize = 0;
    constructor(options) {
        this.options = {
            maxSize: options.maxSize,
            maxEntries: options.maxEntries ?? Number.MAX_SAFE_INTEGER,
            ttl: options.ttl ?? Number.MAX_SAFE_INTEGER,
            onEvict: options.onEvict ?? (() => { }),
        };
    }
    /**
     * Get value from cache
     */
    get(key) {
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
    set(key, value) {
        // Calculate entry size
        const size = this.calculateSize(value);
        // Remove existing entry if present
        if (this.cache.has(key)) {
            this.delete(key);
        }
        // Evict entries until we have space
        while (this.currentSize + size > this.options.maxSize ||
            this.cache.size >= this.options.maxEntries) {
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
    has(key) {
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
    delete(key) {
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
    clear() {
        for (const [key, entry] of this.cache.entries()) {
            this.options.onEvict(key, entry.value);
        }
        this.cache.clear();
        this.currentSize = 0;
    }
    /**
     * Get cache statistics
     */
    stats() {
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
    prune() {
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
    keys() {
        return Array.from(this.cache.keys());
    }
    /**
     * Check if entry is expired
     */
    isExpired(entry) {
        return Date.now() - entry.timestamp > this.options.ttl;
    }
    /**
     * Evict oldest (least recently used) entry
     */
    evictOldest() {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
            this.delete(firstKey);
        }
    }
    /**
     * Calculate size of value in bytes (approximate)
     */
    calculateSize(value) {
        try {
            const json = JSON.stringify(value);
            return json.length * 2; // UTF-16 uses 2 bytes per character
        }
        catch {
            // Fallback for non-serializable objects
            return 1024; // 1KB default estimate
        }
    }
}
exports.LRUCache = LRUCache;
//# sourceMappingURL=LRUCache.js.map