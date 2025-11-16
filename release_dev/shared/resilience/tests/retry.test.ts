/**
 * Tests for retry logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retry,
  retryNetwork,
  retryDatabase,
  retryRedis,
  calculateDelay,
} from '../src/retry.js';
import { MaxRetriesExceededError } from '../src/types.js';

describe('retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const config = {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: 0,
      };

      expect(calculateDelay(0, config)).toBe(1000); // 1000 * 2^0 = 1000
      expect(calculateDelay(1, config)).toBe(2000); // 1000 * 2^1 = 2000
      expect(calculateDelay(2, config)).toBe(4000); // 1000 * 2^2 = 4000
    });

    it('should cap delay at maxDelay', () => {
      const config = {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: 0,
      };

      expect(calculateDelay(0, config)).toBe(1000); // 1000
      expect(calculateDelay(1, config)).toBe(2000); // 2000
      expect(calculateDelay(2, config)).toBe(4000); // 4000
      expect(calculateDelay(3, config)).toBe(5000); // 8000 -> capped at 5000
      expect(calculateDelay(4, config)).toBe(5000); // 16000 -> capped at 5000
    });

    it('should add jitter to delay', () => {
      const config = {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: 0.2,
      };

      // With jitter, delay should be within ±20% of expected value
      const delay = calculateDelay(1, config); // Expected: 2000 ± 400
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    });

    it('should never return negative delay', () => {
      const config = {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: 1, // Very high jitter
      };

      const delay = calculateDelay(0, config);
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('retry operation', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retry(operation, { maxAttempts: 3 });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 10, // Short delay for testing
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(MaxRetriesExceededError);
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');

      await retry(operation, {
        maxAttempts: 3,
        baseDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1, // Attempt number
        expect.any(Number) // Delay
      );
    });

    it('should respect retryIf predicate', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Non-retryable'));

      const result = await retry(operation, {
        maxAttempts: 3,
        retryIf: () => false, // Never retry
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should track total time', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');

      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 50,
      });

      expect(result.totalTime).toBeGreaterThanOrEqual(50); // At least one retry delay
      expect(result.totalTime).toBeLessThan(500); // But not too long
    });
  });

  describe('retryNetwork', () => {
    it('should retry on network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');

      const result = await retryNetwork(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-network errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Validation error'));

      const result = await retryNetwork(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // No retries
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on various network error codes', async () => {
      const errorCodes = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ENETUNREACH',
        'EHOSTUNREACH',
      ];

      for (const code of errorCodes) {
        const error = new Error(code);
        (error as NodeJS.ErrnoException).code = code;
        const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

        const result = await retryNetwork(operation, {
          maxAttempts: 3,
          baseDelay: 10,
        });

        expect(result.success).toBe(true);
        expect(operation).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe('retryDatabase', () => {
    it('should retry on database errors', async () => {
      const dbError = new Error('ER_LOCK_WAIT_TIMEOUT');
      const operation = vi.fn().mockRejectedValueOnce(dbError).mockResolvedValue('success');

      const result = await retryDatabase(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-database errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Syntax error'));

      const result = await retryDatabase(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryRedis', () => {
    it('should retry on Redis errors', async () => {
      const redisError = new Error('READONLY');
      const operation = vi.fn().mockRejectedValueOnce(redisError).mockResolvedValue('success');

      const result = await retryRedis(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on various Redis error codes', async () => {
      const errorCodes = ['READONLY', 'LOADING', 'BUSYKEY'];

      for (const code of errorCodes) {
        const error = new Error(code);
        (error as { code?: string }).code = code;
        const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

        const result = await retryRedis(operation, {
          maxAttempts: 3,
          baseDelay: 10,
        });

        expect(result.success).toBe(true);
        expect(operation).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle synchronous throws', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });

    it('should handle non-Error throws', async () => {
      const operation = vi.fn().mockRejectedValue('String error');

      const result = await retry(operation, {
        maxAttempts: 2,
        baseDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(MaxRetriesExceededError);
    });

    it('should handle maxAttempts = 1 (no retries)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      const result = await retry(operation, {
        maxAttempts: 1,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
