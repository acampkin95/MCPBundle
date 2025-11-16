/**
 * Circuit breaker implementation
 * @module resilience/circuit-breaker
 */

import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitBreakerOpenError,
} from './types.js';

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  windowSize: 60000, // 1 minute
};

/**
 * Failure record for tracking failures over time
 */
interface FailureRecord {
  timestamp: Date;
  error: Error;
}

/**
 * Circuit Breaker implementation
 * Implements the circuit breaker pattern to prevent cascading failures
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 3,
 *   timeout: 30000,
 *   onStateChange: (from, to) => {
 *     console.log(`Circuit breaker state: ${from} -> ${to}`);
 *   }
 * });
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await apiClient.fetchData();
 *   });
 * } catch (error) {
 *   if (error instanceof CircuitBreakerOpenError) {
 *     console.log('Circuit is open, failing fast');
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastStateChangeTime: Date = new Date();
  private nextAttemptTime?: Date;
  private readonly config: CircuitBreakerConfig;
  private readonly failures: FailureRecord[] = [];
  private totalCalls = 0;
  private successfulCalls = 0;
  private failedCalls = 0;
  private rejectedCalls = 0;
  private responseTimes: number[] = [];

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    };
  }

  /**
   * Get current circuit breaker state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  public getStats(): CircuitBreakerStats {
    const avgResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;

    const stats: CircuitBreakerStats = {
      state: this.state,
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      rejectedCalls: this.rejectedCalls,
      consecutiveFailures: this.failureCount,
      consecutiveSuccesses: this.successCount,
      averageResponseTime: avgResponseTime,
    };

    if (this.state === CircuitState.OPEN) {
      stats.lastOpenedAt = this.lastStateChangeTime;
    }

    if (this.state === CircuitState.CLOSED) {
      stats.lastClosedAt = this.lastStateChangeTime;
    }

    return stats;
  }

  /**
   * Reset circuit breaker to initial state
   */
  public reset(): void {
    this.changeState(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.failures.length = 0;
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.rejectedCalls = 0;
    this.responseTimes.length = 0;
  }

  /**
   * Execute an operation with circuit breaker protection
   * @param operation - Async operation to execute
   * @returns Promise resolving to operation result
   * @throws CircuitBreakerOpenError if circuit is open
   */
  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (this.shouldAttemptReset()) {
        this.changeState(CircuitState.HALF_OPEN);
      } else {
        this.rejectedCalls++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open. Next attempt at ${this.nextAttemptTime?.toISOString()}`
        );
      }
    }

    this.totalCalls++;
    const startTime = Date.now();

    try {
      // Execute the operation
      const result = await operation();
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);

      // Keep only last 100 response times
      if (this.responseTimes.length > 100) {
        this.responseTimes.shift();
      }

      // Record success
      this.onSuccess();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);

      // Keep only last 100 response times
      if (this.responseTimes.length > 100) {
        this.responseTimes.shift();
      }

      // Record failure
      this.onFailure(error instanceof Error ? error : new Error(String(error)));

      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successfulCalls++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.changeState(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.failedCalls++;
    this.successCount = 0;

    // Add failure to rolling window
    this.failures.push({
      timestamp: new Date(),
      error,
    });

    // Clean up old failures outside window
    if (this.config.windowSize) {
      const cutoffTime = Date.now() - this.config.windowSize;
      while (
        this.failures.length > 0 &&
        this.failures[0]?.timestamp &&
        this.failures[0].timestamp.getTime() < cutoffTime
      ) {
        this.failures.shift();
      }
    }

    // Count failures in window
    this.failureCount = this.failures.length;

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.changeState(CircuitState.OPEN);
      this.scheduleNextAttempt();
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      // Threshold reached, open the circuit
      this.changeState(CircuitState.OPEN);
      this.scheduleNextAttempt();

      if (this.config.onOpen) {
        this.config.onOpen(this.failureCount);
      }
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return false;
    }

    return Date.now() >= this.nextAttemptTime.getTime();
  }

  /**
   * Schedule next attempt time
   */
  private scheduleNextAttempt(): void {
    this.nextAttemptTime = new Date(Date.now() + this.config.timeout);
  }

  /**
   * Change circuit state
   */
  private changeState(newState: CircuitState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;
    this.lastStateChangeTime = new Date();

    // Invoke callbacks
    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState);
    }

    if (newState === CircuitState.CLOSED && this.config.onClose) {
      this.config.onClose();
    }

    if (newState === CircuitState.HALF_OPEN && this.config.onHalfOpen) {
      this.config.onHalfOpen();
    }

    // Reset counters on state change
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.failures.length = 0;
      delete this.nextAttemptTime;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
  }

  /**
   * Force open the circuit (for testing or manual intervention)
   */
  public forceOpen(): void {
    this.changeState(CircuitState.OPEN);
    this.scheduleNextAttempt();
  }

  /**
   * Force close the circuit (for testing or manual intervention)
   */
  public forceClose(): void {
    this.reset();
  }
}

/**
 * Decorator to wrap a method with circuit breaker protection
 * @param config - Circuit breaker configuration
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class ApiClient {
 *   @withCircuitBreaker({ failureThreshold: 3, timeout: 30000 })
 *   async fetchData(url: string) {
 *     const response = await fetch(url);
 *     return response.json();
 *   }
 * }
 * ```
 */
export function withCircuitBreaker<T extends Array<unknown>, R>(
  config: Partial<CircuitBreakerConfig> = {}
) {
  const breaker = new CircuitBreaker(config);

  return function (
    _target: object,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ): TypedPropertyDescriptor<(...args: T) => Promise<R>> {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function (...args: T): Promise<R> {
      return breaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
