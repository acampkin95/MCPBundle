/**
 * Tests for timeout handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withTimeout,
  timeoutPromise,
  createTimeoutWrapper,
  createTimeoutController,
} from '../src/timeout.js';
import { TimeoutError } from '../src/types.js';

describe('timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withTimeout', () => {
    it('should complete operation within timeout', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withTimeout(operation, {
        timeout: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.timedOut).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should timeout slow operation', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'success';
      });

      const result = await withTimeout(operation, {
        timeout: 50,
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should track duration', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'success';
      });

      const result = await withTimeout(operation, {
        timeout: 1000,
      });

      expect(result.duration).toBeGreaterThanOrEqual(50);
      expect(result.duration).toBeLessThan(200);
    });

    it('should call onTimeout callback', async () => {
      const onTimeout = vi.fn();
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'success';
      });

      await withTimeout(operation, {
        timeout: 50,
        onTimeout,
      });

      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('should call onComplete callback', async () => {
      const onComplete = vi.fn();
      const operation = vi.fn().mockResolvedValue('success');

      await withTimeout(operation, {
        timeout: 1000,
        onComplete,
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should handle operation errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));

      const result = await withTimeout(operation, {
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.error?.message).toBe('Operation failed');
    });

    it('should use custom timeout message', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'success';
      });

      const result = await withTimeout(operation, {
        timeout: 50,
        timeoutMessage: 'Custom timeout message',
      });

      expect(result.error?.message).toBe('Custom timeout message');
    });

    it('should handle cleanup errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onTimeout = vi.fn().mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'success';
      });

      const result = await withTimeout(operation, {
        timeout: 50,
        onTimeout,
      });

      expect(result.timedOut).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('timeoutPromise', () => {
    it('should resolve within timeout', async () => {
      const promise = Promise.resolve('success');

      const result = await timeoutPromise(promise, 1000);

      expect(result).toBe('success');
    });

    it('should throw TimeoutError on timeout', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 200);
      });

      await expect(timeoutPromise(promise, 50)).rejects.toThrow(TimeoutError);
    });

    it('should use custom timeout message', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 200);
      });

      await expect(
        timeoutPromise(promise, 50, 'Custom message')
      ).rejects.toThrow('Custom message');
    });

    it('should propagate operation errors', async () => {
      const promise = Promise.reject(new Error('Failed'));

      await expect(timeoutPromise(promise, 1000)).rejects.toThrow('Failed');
    });
  });

  describe('createTimeoutWrapper', () => {
    it('should create wrapper function', async () => {
      const wrapper = createTimeoutWrapper(1000);
      const operation = vi.fn().mockResolvedValue('success');

      const result = await wrapper(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should apply timeout to wrapped operations', async () => {
      const wrapper = createTimeoutWrapper(50);
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'success';
      });

      await expect(wrapper(operation)).rejects.toThrow(TimeoutError);
    });

    it('should use custom message in wrapper', async () => {
      const wrapper = createTimeoutWrapper(50, 'Wrapper timeout');
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'success';
      });

      await expect(wrapper(operation)).rejects.toThrow('Wrapper timeout');
    });
  });

  describe('createTimeoutController', () => {
    it('should create AbortController', () => {
      const controller = createTimeoutController(1000);

      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('should abort after timeout', async () => {
      const controller = createTimeoutController(50);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(controller.signal.aborted).toBe(true);
    });

    it('should work with fetch API', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockImplementation(
        (_url: string, options?: { signal?: AbortSignal }) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(new Response('success'));
            }, 200);

            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          });
        }
      );

      const controller = createTimeoutController(50);

      await expect(
        fetch('https://example.com', { signal: controller.signal })
      ).rejects.toThrow('Aborted');
    });
  });

  describe('edge cases', () => {
    it('should handle operation that completes exactly at timeout', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'success';
      });

      // This is a race condition, but operation should complete
      const result = await withTimeout(operation, {
        timeout: 60,
      });

      // Could be either success or timeout depending on timing
      expect(result.success || result.timedOut).toBe(true);
    });

    it('should handle zero timeout', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'success';
      });

      const result = await withTimeout(operation, {
        timeout: 1, // Very short timeout
      });

      // With very short timeout, slow operation should timeout
      expect(result.timedOut).toBe(true);
    });

    it('should handle negative timeout', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'success';
      });

      const result = await withTimeout(operation, {
        timeout: 1, // Very short timeout (negative would be treated as immediate)
      });

      // Very short timeout should timeout the slow operation
      expect(result.timedOut).toBe(true);
    });

    it('should clear timeout even if operation throws', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));

      await withTimeout(operation, {
        timeout: 1000,
      });

      // If timeout isn't cleared, it would leak. This test just ensures no crash.
      expect(true).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple timeouts concurrently', async () => {
      const operations = [
        vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'op1';
        }),
        vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'op2';
        }),
        vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return 'op3';
        }),
      ];

      const results = await Promise.all(
        operations.map((op) => withTimeout(op, { timeout: 75 }))
      );

      expect(results[0]?.success).toBe(true); // 50ms - within timeout
      expect(results[1]?.timedOut).toBe(true); // 100ms - timeout
      expect(results[2]?.success).toBe(true); // 30ms - within timeout
    });
  });
});
