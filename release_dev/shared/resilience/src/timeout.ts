/**
 * Timeout handler implementation
 * @module resilience/timeout
 */

import { TimeoutConfig, TimeoutResult, TimeoutError } from './types.js';

/**
 * Default timeout configuration
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  timeout: 30000, // 30 seconds
  timeoutMessage: 'Operation timed out',
};

/**
 * Execute an operation with timeout
 * @param operation - Async operation to execute
 * @param config - Timeout configuration (partial, merged with defaults)
 * @returns Promise resolving to TimeoutResult
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     return response.json();
 *   },
 *   {
 *     timeout: 5000,
 *     onTimeout: () => {
 *       console.log('Request timed out, cleaning up...');
 *     }
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else if (result.timedOut) {
 *   console.error('Operation timed out after', result.duration, 'ms');
 * } else {
 *   console.error('Operation failed:', result.error);
 * }
 * ```
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  partialConfig: Partial<TimeoutConfig> = {}
): Promise<TimeoutResult<T>> {
  const config: TimeoutConfig = {
    ...DEFAULT_TIMEOUT_CONFIG,
    ...partialConfig,
  };

  const startTime = Date.now();
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;

        // Call cleanup callback
        if (config.onTimeout) {
          try {
            config.onTimeout();
          } catch (cleanupError) {
            // Log cleanup error but don't let it interfere with timeout error
            console.error('Error in timeout cleanup:', cleanupError);
          }
        }

        reject(new TimeoutError(config.timeoutMessage, config.timeout));
      }, config.timeout);
    });

    // Race between operation and timeout
    const data = await Promise.race([operation(), timeoutPromise]);

    // Operation completed successfully
    const duration = Date.now() - startTime;

    if (config.onComplete) {
      config.onComplete(duration);
    }

    return {
      success: true,
      data,
      duration,
      timedOut: false,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      duration,
      timedOut,
    };
  } finally {
    // Clear timeout if it exists
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Create a timeout wrapper function
 * @param timeout - Timeout in milliseconds
 * @param message - Optional timeout message
 * @returns Function that wraps operations with timeout
 *
 * @example
 * ```typescript
 * const timeoutAfter5s = createTimeoutWrapper(5000);
 *
 * const result = await timeoutAfter5s(async () => {
 *   return await longRunningOperation();
 * });
 * ```
 */
export function createTimeoutWrapper(
  timeout: number,
  message?: string
): <T>(operation: () => Promise<T>) => Promise<T> {
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const config: Partial<TimeoutConfig> = { timeout };
    if (message !== undefined) {
      config.timeoutMessage = message;
    }
    const result = await withTimeout(operation, config);

    if (result.success && result.data !== undefined) {
      return result.data;
    }

    throw result.error ?? new Error('Timeout failed without error');
  };
}

/**
 * Decorator to wrap a method with timeout
 * @param config - Timeout configuration
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class ApiClient {
 *   @withTimeoutDecorator({ timeout: 5000 })
 *   async fetchData(url: string) {
 *     const response = await fetch(url);
 *     return response.json();
 *   }
 * }
 * ```
 */
export function withTimeoutDecorator<T extends Array<unknown>, R>(
  config: Partial<TimeoutConfig> = {}
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
      const result = await withTimeout(
        () => originalMethod.apply(this, args),
        config
      );

      if (result.success && result.data !== undefined) {
        return result.data;
      }

      throw result.error ?? new Error('Timeout failed without error');
    };

    return descriptor;
  };
}

/**
 * Promise-based timeout utility
 * Simpler API that throws on timeout
 * @param operation - Async operation to execute
 * @param timeout - Timeout in milliseconds
 * @param message - Optional timeout message
 * @returns Promise resolving to operation result
 * @throws TimeoutError if operation times out
 *
 * @example
 * ```typescript
 * try {
 *   const data = await timeoutPromise(
 *     fetch('https://api.example.com/data'),
 *     5000
 *   );
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Request timed out after 5 seconds');
 *   }
 * }
 * ```
 */
export async function timeoutPromise<T>(
  operation: Promise<T>,
  timeout: number,
  message?: string
): Promise<T> {
  const config: Partial<TimeoutConfig> = { timeout };
  if (message !== undefined) {
    config.timeoutMessage = message;
  }
  const result = await withTimeout(() => operation, config);

  if (result.success && result.data !== undefined) {
    return result.data;
  }

  throw result.error ?? new Error('Timeout failed without error');
}

/**
 * Create an AbortController that times out after specified duration
 * Useful for fetch API and other abortable operations
 * @param timeout - Timeout in milliseconds
 * @returns AbortController that will abort after timeout
 *
 * @example
 * ```typescript
 * const controller = createTimeoutController(5000);
 *
 * try {
 *   const response = await fetch('https://api.example.com/data', {
 *     signal: controller.signal
 *   });
 *   const data = await response.json();
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Request was aborted (likely timeout)');
 *   }
 * }
 * ```
 */
export function createTimeoutController(timeout: number): AbortController {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort();
  }, timeout);

  return controller;
}
