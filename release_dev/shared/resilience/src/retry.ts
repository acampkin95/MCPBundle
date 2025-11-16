/**
 * Retry logic with exponential backoff and jitter
 * @module resilience/retry
 */

import {
  RetryConfig,
  RetryResult,
  MaxRetriesExceededError,
} from './types.js';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitter: 0.2, // ±20%
};

/**
 * Calculate delay for next retry attempt with exponential backoff and jitter
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const { baseDelay, maxDelay, backoffMultiplier, jitter } = config;

  // Calculate exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter: random value between -jitter and +jitter
  const jitterAmount = cappedDelay * jitter;
  const jitterValue = (Math.random() * 2 - 1) * jitterAmount;

  // Return delay with jitter, ensuring it's never negative
  return Math.max(0, Math.floor(cappedDelay + jitterValue));
}

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default retry predicate - retries on all errors
 * @param error - Error to check
 * @returns Always true
 */
function defaultRetryIf(_error: Error): boolean {
  return true;
}

/**
 * Execute an operation with retry logic
 * @param operation - Async operation to execute
 * @param config - Retry configuration (partial, merged with defaults)
 * @returns Promise resolving to RetryResult
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     return response.json();
 *   },
 *   {
 *     maxAttempts: 5,
 *     baseDelay: 500,
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */
export async function retry<T>(
  operation: () => Promise<T>,
  partialConfig: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...partialConfig,
    retryIf: partialConfig.retryIf ?? defaultRetryIf,
  };

  const startTime = Date.now();
  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    attempts++;

    try {
      // Execute the operation
      const data = await operation();

      // Success!
      return {
        success: true,
        data,
        attempts,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      const retryPredicate = config.retryIf ?? defaultRetryIf;
      if (!retryPredicate(lastError)) {
        return {
          success: false,
          error: lastError,
          attempts,
          totalTime: Date.now() - startTime,
        };
      }

      // If this was the last attempt, don't delay
      if (attempt === config.maxAttempts - 1) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, config);

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(lastError, attempt + 1, delay);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: new MaxRetriesExceededError(
      attempts,
      lastError ?? new Error('Unknown error')
    ),
    attempts,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Decorator to wrap a function with retry logic
 * @param config - Retry configuration
 * @returns Function decorator
 *
 * @example
 * ```typescript
 * class ApiClient {
 *   @withRetry({ maxAttempts: 3, baseDelay: 1000 })
 *   async fetchData(url: string) {
 *     const response = await fetch(url);
 *     return response.json();
 *   }
 * }
 * ```
 */
export function withRetry<T extends Array<unknown>, R>(
  config: Partial<RetryConfig> = {}
) {
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
      const result = await retry(
        () => originalMethod.apply(this, args),
        config
      );

      if (result.success && result.data !== undefined) {
        return result.data;
      }

      throw result.error ?? new Error('Retry failed without error');
    };

    return descriptor;
  };
}

/**
 * Retry specifically for network operations
 * Automatically retries on common network errors
 */
export async function retryNetwork<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const networkRetryIf = (error: Error): boolean => {
    // Retry on network errors
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
    ];

    return retryableErrors.some(
      (code) =>
        error.message.includes(code) ||
        (error as NodeJS.ErrnoException).code === code
    );
  };

  return retry(operation, {
    ...config,
    retryIf: config.retryIf ?? networkRetryIf,
  });
}

/**
 * Retry specifically for database operations
 * Automatically retries on common database errors
 */
export async function retryDatabase<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const databaseRetryIf = (error: Error): boolean => {
    // Retry on transient database errors
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'CONNECTION_LOST',
      'PROTOCOL_CONNECTION_LOST',
      'ER_LOCK_WAIT_TIMEOUT',
      'ER_LOCK_DEADLOCK',
    ];

    return retryableErrors.some(
      (code) =>
        error.message.includes(code) ||
        (error as { code?: string }).code === code
    );
  };

  return retry(operation, {
    ...config,
    retryIf: config.retryIf ?? databaseRetryIf,
  });
}

/**
 * Retry specifically for Redis operations
 * Automatically retries on common Redis errors
 */
export async function retryRedis<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const redisRetryIf = (error: Error): boolean => {
    // Retry on transient Redis errors
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'READONLY',
      'LOADING',
      'BUSYKEY',
    ];

    return retryableErrors.some(
      (code) =>
        error.message.includes(code) ||
        (error as { code?: string }).code === code
    );
  };

  return retry(operation, {
    ...config,
    retryIf: config.retryIf ?? redisRetryIf,
  });
}
