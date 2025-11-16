/**
 * Resilience configuration for Cloudflare MCP
 * Defines retry, circuit breaker, and timeout configurations
 * @module config/resilience
 */

import type { RetryConfig, CircuitBreakerConfig } from '@mcp-bundle/resilience';

/**
 * Retry configuration for Cloudflare API calls
 */
export const cloudflareApiRetryConfig: Partial<RetryConfig> = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitter: 0.2, // ±20%
  retryIf: (error: Error): boolean => {
    // Retry on network errors and specific HTTP status codes
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
    ];

    // Retry on rate limiting (429) and server errors (5xx)
    const retryableStatusCodes = [429, 500, 502, 503, 504];

    const isNetworkError = retryableErrors.some(
      (code) =>
        error.message.includes(code) ||
        (error as NodeJS.ErrnoException).code === code
    );

    const isRetryableHttpError = retryableStatusCodes.some((code) =>
      error.message.includes(String(code))
    );

    return isNetworkError || isRetryableHttpError;
  },
};

/**
 * Circuit breaker configuration for Cloudflare API
 */
export const cloudflareApiCircuitBreakerConfig: Partial<CircuitBreakerConfig> = {
  failureThreshold: 5, // Open circuit after 5 consecutive failures
  successThreshold: 2, // Close circuit after 2 consecutive successes in half-open state
  timeout: 60000, // Wait 1 minute before attempting to close circuit
  windowSize: 60000, // Track failures over 1 minute window
};

/**
 * Retry configuration for database operations
 */
export const databaseRetryConfig: Partial<RetryConfig> = {
  maxAttempts: 3,
  baseDelay: 500, // 500ms
  maxDelay: 5000, // 5 seconds
  backoffMultiplier: 2,
  jitter: 0.1,
  retryIf: (error: Error): boolean => {
    // Retry on transient database errors
    const retryableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'CONNECTION_LOST',
      'PROTOCOL_CONNECTION_LOST',
      'ER_LOCK_WAIT_TIMEOUT',
      'ER_LOCK_DEADLOCK',
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
    ];

    return retryableErrors.some(
      (code) =>
        error.message.includes(code) ||
        (error as { code?: string }).code === code
    );
  },
};

/**
 * Circuit breaker configuration for database operations
 */
export const databaseCircuitBreakerConfig: Partial<CircuitBreakerConfig> = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  windowSize: 30000,
};

/**
 * Timeout configurations (in milliseconds)
 */
export const timeoutConfig = {
  cloudflareApi: 30000, // 30 seconds for Cloudflare API calls
  database: 10000, // 10 seconds for database operations
  heartbeat: 5000, // 5 seconds for heartbeat processing
  health: 3000, // 3 seconds for health checks
} as const;

/**
 * Logging configuration for resilience patterns
 */
export const resilienceLoggingConfig = {
  logRetries: true,
  logCircuitStateChanges: true,
  logTimeouts: true,
} as const;
