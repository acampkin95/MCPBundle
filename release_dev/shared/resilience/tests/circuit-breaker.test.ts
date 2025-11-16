/**
 * Tests for circuit breaker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';
import { CircuitState, CircuitBreakerOpenError } from '../src/types.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start in CLOSED state', () => {
      breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should accept custom configuration', () => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 30000,
      });
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('CLOSED state', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 1000,
      });
    });

    it('should execute operation successfully', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain closed on single failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open after reaching failure threshold', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should reset failure count on success', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success')
        .mockRejectedValue(new Error('Fail 3'));

      await expect(breaker.execute(operation)).rejects.toThrow('Fail 1');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail 2');
      await expect(breaker.execute(operation)).resolves.toBe('success');

      const stats = breaker.getStats();
      // Failure count should be reset after success
      expect(stats.consecutiveFailures).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED); // Still closed
    });
  });

  describe('OPEN state', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 100, // Short timeout for testing
      });
    });

    it('should reject operations immediately', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Trigger circuit to open
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Now operation should be rejected without executing
      await expect(breaker.execute(operation)).rejects.toThrow(
        CircuitBreakerOpenError
      );
      expect(operation).toHaveBeenCalledTimes(2); // Not called the third time
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next call should transition to HALF_OPEN
      const successOperation = vi.fn().mockResolvedValue('success');
      await expect(breaker.execute(successOperation)).resolves.toBe('success');
      // After success in HALF_OPEN, it should close (with successThreshold: 2 by default)
    });

    it('should call onOpen callback', async () => {
      const onOpen = vi.fn();
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 1000,
        onOpen,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');

      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith(2); // Failure count
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 50,
      });
    });

    it('should transition to CLOSED after success threshold', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Succeed twice to close
      const successOperation = vi.fn().mockResolvedValue('success');
      await breaker.execute(successOperation);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await breaker.execute(successOperation);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition back to OPEN on any failure', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Fail in HALF_OPEN should reopen
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should call onHalfOpen callback', async () => {
      const onHalfOpen = vi.fn();
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 50,
        onHalfOpen,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Next call should trigger onHalfOpen
      const successOperation = vi.fn().mockResolvedValue('success');
      await breaker.execute(successOperation);

      expect(onHalfOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 1000,
      });
    });

    it('should track successful calls', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await breaker.execute(operation);
      await breaker.execute(operation);

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.successfulCalls).toBe(2);
      expect(stats.failedCalls).toBe(0);
    });

    it('should track failed calls', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.successfulCalls).toBe(0);
      expect(stats.failedCalls).toBe(2);
    });

    it('should track rejected calls', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');
      await expect(breaker.execute(operation)).rejects.toThrow('Fail');

      // This should be rejected
      await expect(breaker.execute(operation)).rejects.toThrow(
        CircuitBreakerOpenError
      );

      const stats = breaker.getStats();
      expect(stats.rejectedCalls).toBe(1);
    });

    it('should track average response time', async () => {
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'success';
      });

      await breaker.execute(operation);
      await breaker.execute(operation);

      const stats = breaker.getStats();
      expect(stats.averageResponseTime).toBeGreaterThan(40);
    });
  });

  describe('manual control', () => {
    beforeEach(() => {
      breaker = new CircuitBreaker();
    });

    it('should allow manual open', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      breaker.forceOpen();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should allow manual close', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.forceClose();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset statistics', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      await breaker.execute(operation);
      await breaker.execute(operation);

      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.successfulCalls).toBe(0);
    });
  });

  describe('state change callbacks', () => {
    it('should call onStateChange callback', async () => {
      const onStateChange = vi.fn();
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 50,
        onStateChange,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.CLOSED,
        CircuitState.OPEN
      );

      // Wait and transition to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 100));
      const successOp = vi.fn().mockResolvedValue('ok');
      await breaker.execute(successOp);

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.OPEN,
        CircuitState.HALF_OPEN
      );
    });

    it('should call onClose callback', async () => {
      const onClose = vi.fn();
      breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 50,
        onClose,
      });

      const failOp = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(failOp)).rejects.toThrow();
      await expect(breaker.execute(failOp)).rejects.toThrow();

      // Wait and close
      await new Promise((resolve) => setTimeout(resolve, 100));
      const successOp = vi.fn().mockResolvedValue('ok');
      await breaker.execute(successOp);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('rolling window', () => {
    it('should clean up old failures outside window', async () => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        windowSize: 100, // 100ms window
        timeout: 1000,
      });

      const operation = vi.fn().mockRejectedValue(new Error('Fail'));

      // Fail twice
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // This failure should not open circuit (old failures expired)
      await expect(breaker.execute(operation)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});
