/**
 * Unit tests for resilience configuration
 */

import { describe, it, expect } from 'vitest';
import {
  cloudflareApiRetryConfig,
  cloudflareApiCircuitBreakerConfig,
  databaseRetryConfig,
  databaseCircuitBreakerConfig,
  timeoutConfig,
  resilienceLoggingConfig,
} from '../../../src/config/resilience.js';

describe('Resilience Configuration', () => {
  describe('cloudflareApiRetryConfig', () => {
    it('should have valid retry configuration', () => {
      expect(cloudflareApiRetryConfig.maxAttempts).toBeGreaterThanOrEqual(1);
      expect(cloudflareApiRetryConfig.baseDelay).toBeGreaterThan(0);
      expect(cloudflareApiRetryConfig.maxDelay).toBeGreaterThan(0);
      expect(cloudflareApiRetryConfig.backoffMultiplier).toBeGreaterThan(1);
      expect(cloudflareApiRetryConfig.jitter).toBeGreaterThanOrEqual(0);
      expect(cloudflareApiRetryConfig.jitter).toBeLessThanOrEqual(1);
    });

    it('should have retryIf predicate', () => {
      expect(cloudflareApiRetryConfig.retryIf).toBeDefined();
      expect(typeof cloudflareApiRetryConfig.retryIf).toBe('function');
    });

    it('should retry on network errors', () => {
      const retryIf = cloudflareApiRetryConfig.retryIf!;

      expect(retryIf(new Error('ECONNREFUSED'))).toBe(true);
      expect(retryIf(new Error('ETIMEDOUT'))).toBe(true);
      expect(retryIf(new Error('ENOTFOUND'))).toBe(true);
    });

    it('should retry on 429 and 5xx status codes', () => {
      const retryIf = cloudflareApiRetryConfig.retryIf!;

      expect(retryIf(new Error('429'))).toBe(true);
      expect(retryIf(new Error('500'))).toBe(true);
      expect(retryIf(new Error('502'))).toBe(true);
      expect(retryIf(new Error('503'))).toBe(true);
      expect(retryIf(new Error('504'))).toBe(true);
    });

    it('should not retry on client errors', () => {
      const retryIf = cloudflareApiRetryConfig.retryIf!;

      expect(retryIf(new Error('400'))).toBe(false);
      expect(retryIf(new Error('401'))).toBe(false);
      expect(retryIf(new Error('403'))).toBe(false);
      expect(retryIf(new Error('404'))).toBe(false);
    });
  });

  describe('cloudflareApiCircuitBreakerConfig', () => {
    it('should have valid circuit breaker configuration', () => {
      expect(cloudflareApiCircuitBreakerConfig.failureThreshold).toBeGreaterThan(0);
      expect(cloudflareApiCircuitBreakerConfig.successThreshold).toBeGreaterThan(0);
      expect(cloudflareApiCircuitBreakerConfig.timeout).toBeGreaterThan(0);
      expect(cloudflareApiCircuitBreakerConfig.windowSize).toBeGreaterThan(0);
    });

    it('should have reasonable threshold values', () => {
      expect(cloudflareApiCircuitBreakerConfig.failureThreshold).toBeLessThan(20);
      expect(cloudflareApiCircuitBreakerConfig.successThreshold).toBeLessThan(10);
    });
  });

  describe('databaseRetryConfig', () => {
    it('should have valid retry configuration', () => {
      expect(databaseRetryConfig.maxAttempts).toBeGreaterThanOrEqual(1);
      expect(databaseRetryConfig.baseDelay).toBeGreaterThan(0);
      expect(databaseRetryConfig.maxDelay).toBeGreaterThan(0);
    });

    it('should retry on database errors', () => {
      const retryIf = databaseRetryConfig.retryIf!;

      expect(retryIf(new Error('ECONNREFUSED'))).toBe(true);
      expect(retryIf(new Error('CONNECTION_LOST'))).toBe(true);
      expect(retryIf(new Error('ER_LOCK_WAIT_TIMEOUT'))).toBe(true);
      expect(retryIf(new Error('SQLITE_BUSY'))).toBe(true);
    });
  });

  describe('databaseCircuitBreakerConfig', () => {
    it('should have valid circuit breaker configuration', () => {
      expect(databaseCircuitBreakerConfig.failureThreshold).toBeGreaterThan(0);
      expect(databaseCircuitBreakerConfig.successThreshold).toBeGreaterThan(0);
      expect(databaseCircuitBreakerConfig.timeout).toBeGreaterThan(0);
    });
  });

  describe('timeoutConfig', () => {
    it('should have positive timeout values', () => {
      expect(timeoutConfig.cloudflareApi).toBeGreaterThan(0);
      expect(timeoutConfig.database).toBeGreaterThan(0);
      expect(timeoutConfig.heartbeat).toBeGreaterThan(0);
      expect(timeoutConfig.health).toBeGreaterThan(0);
    });

    it('should have reasonable timeout values', () => {
      // Timeouts should be less than 5 minutes (300000ms)
      expect(timeoutConfig.cloudflareApi).toBeLessThan(300000);
      expect(timeoutConfig.database).toBeLessThan(300000);
      expect(timeoutConfig.heartbeat).toBeLessThan(300000);
      expect(timeoutConfig.health).toBeLessThan(300000);
    });

    it('should have health timeout less than heartbeat timeout', () => {
      expect(timeoutConfig.health).toBeLessThan(timeoutConfig.heartbeat);
    });
  });

  describe('resilienceLoggingConfig', () => {
    it('should have boolean logging flags', () => {
      expect(typeof resilienceLoggingConfig.logRetries).toBe('boolean');
      expect(typeof resilienceLoggingConfig.logCircuitStateChanges).toBe('boolean');
      expect(typeof resilienceLoggingConfig.logTimeouts).toBe('boolean');
    });
  });
});
