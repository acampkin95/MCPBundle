/**
 * Resilience patterns library
 * Provides retry logic, circuit breaker, and timeout handling
 * @module resilience
 */

// Export types
export * from './types.js';

// Export retry functionality
export {
  retry,
  retryNetwork,
  retryDatabase,
  retryRedis,
  withRetry,
  calculateDelay,
} from './retry.js';

// Export circuit breaker functionality
export { CircuitBreaker, withCircuitBreaker } from './circuit-breaker.js';

// Export timeout functionality
export {
  withTimeout,
  timeoutPromise,
  createTimeoutWrapper,
  createTimeoutController,
  withTimeoutDecorator,
} from './timeout.js';

/**
 * Version information
 */
export const VERSION = '1.0.0';
