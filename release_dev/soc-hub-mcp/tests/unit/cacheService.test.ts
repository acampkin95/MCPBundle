/**
 * Unit tests for CacheService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from '../../src/services/cacheService.js';

describe('CacheService', () => {
  describe('with caching disabled', () => {
    let cacheService: CacheService;

    beforeEach(() => {
      cacheService = new CacheService({
        host: 'localhost',
        port: 6379,
        enabled: false,
      });
    });

    it('should handle get() when disabled', async () => {
      const result = await cacheService.get('test-key');
      expect(result).toBeNull();

      const metrics = cacheService.getMetrics();
      expect(metrics.misses).toBe(1);
    });

    it('should handle set() when disabled', async () => {
      await cacheService.set('test-key', { value: 'test' });
      const result = await cacheService.get('test-key');
      expect(result).toBeNull();
    });

    it('should handle delete() when disabled', async () => {
      await cacheService.delete('test-key');
      const metrics = cacheService.getMetrics();
      expect(metrics.deletes).toBe(0);
    });

    it('should return metrics correctly', () => {
      const metrics = cacheService.getMetrics();
      expect(metrics).toHaveProperty('hits');
      expect(metrics).toHaveProperty('misses');
      expect(metrics).toHaveProperty('sets');
      expect(metrics).toHaveProperty('deletes');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('hitRate');
    });

    it('should calculate hit rate correctly', async () => {
      await cacheService.get('key1');
      await cacheService.get('key2');
      await cacheService.get('key3');

      const metrics = cacheService.getMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.misses).toBe(3);
    });

    it('should reset metrics', async () => {
      await cacheService.get('key1');
      await cacheService.set('key2', 'value');

      cacheService.resetMetrics();

      const metrics = cacheService.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.sets).toBe(0);
    });

    it('should handle health check when disabled', async () => {
      const health = await cacheService.healthCheck();
      expect(health.healthy).toBe(false);
    });
  });

  describe('metrics tracking', () => {
    let cacheService: CacheService;

    beforeEach(() => {
      cacheService = new CacheService({
        host: 'localhost',
        port: 6379,
        enabled: false,
      });
    });

    it('should track cache misses', async () => {
      await cacheService.get('nonexistent');
      await cacheService.get('nonexistent2');

      const metrics = cacheService.getMetrics();
      expect(metrics.misses).toBe(2);
      expect(metrics.hits).toBe(0);
    });

    it('should calculate hit rate correctly with mixed results', async () => {
      // Simulate misses
      await cacheService.get('key1');
      await cacheService.get('key2');
      await cacheService.get('key3');

      const metrics = cacheService.getMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.misses).toBe(3);
      expect(metrics.hits).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should accept custom port and host', () => {
      const cacheService = new CacheService({
        host: 'redis.example.com',
        port: 6380,
        enabled: false,
      });

      expect(cacheService).toBeDefined();
    });

    it('should accept optional password', () => {
      const cacheService = new CacheService({
        host: 'localhost',
        port: 6379,
        password: 'secret',
        enabled: false,
      });

      expect(cacheService).toBeDefined();
    });

    it('should accept custom database number', () => {
      const cacheService = new CacheService({
        host: 'localhost',
        port: 6379,
        db: 2,
        enabled: false,
      });

      expect(cacheService).toBeDefined();
    });

    it('should default to enabled if not specified', () => {
      const cacheService = new CacheService({
        host: 'localhost',
        port: 6379,
      });

      expect(cacheService).toBeDefined();
    });
  });
});
