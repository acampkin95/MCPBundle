/**
 * Type definitions for resilience patterns library
 * @module resilience/types
 */

/**
 * Configuration options for retry logic with exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Base delay in milliseconds before first retry (default: 1000ms) */
  baseDelay: number;
  /** Maximum delay in milliseconds between retries (default: 10000ms) */
  maxDelay: number;
  /** Backoff multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Jitter percentage as decimal (0-1) to add randomness (default: 0.2 = ±20%) */
  jitter: number;
  /** Timeout in milliseconds for each attempt (optional) */
  timeout?: number;
  /** Predicate function to determine if error is retryable */
  retryIf?: (error: Error) => boolean;
  /** Callback invoked before each retry attempt */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if all retries failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total time taken in milliseconds */
  totalTime: number;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation, requests flow through */
  CLOSED = 'CLOSED',
  /** Failure threshold reached, requests fail fast */
  OPEN = 'OPEN',
  /** Testing if service recovered, limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuration options for circuit breaker
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures to open circuit (default: 5) */
  failureThreshold: number;
  /** Number of successful calls to close from half-open (default: 2) */
  successThreshold: number;
  /** Time in milliseconds to wait before trying half-open (default: 60000ms) */
  timeout: number;
  /** Rolling window size in milliseconds for failure counting (default: 60000ms) */
  windowSize?: number;
  /** Callback when circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Callback when circuit opens */
  onOpen?: (failures: number) => void;
  /** Callback when circuit closes */
  onClose?: () => void;
  /** Callback when circuit enters half-open */
  onHalfOpen?: () => void;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  /** Current state of the circuit */
  state: CircuitState;
  /** Total number of calls made */
  totalCalls: number;
  /** Number of successful calls */
  successfulCalls: number;
  /** Number of failed calls */
  failedCalls: number;
  /** Number of calls rejected due to open circuit */
  rejectedCalls: number;
  /** Timestamp when circuit was last opened */
  lastOpenedAt?: Date;
  /** Timestamp when circuit was last closed */
  lastClosedAt?: Date;
  /** Current consecutive failure count */
  consecutiveFailures: number;
  /** Current consecutive success count (in half-open state) */
  consecutiveSuccesses: number;
  /** Average response time in milliseconds */
  averageResponseTime: number;
}

/**
 * Configuration options for timeout handler
 */
export interface TimeoutConfig {
  /** Timeout duration in milliseconds (default: 30000ms) */
  timeout: number;
  /** Error message for timeout (default: "Operation timed out") */
  timeoutMessage?: string;
  /** Cleanup function to call on timeout */
  onTimeout?: () => void;
  /** Callback when operation completes within timeout */
  onComplete?: (duration: number) => void;
}

/**
 * Result of a timeout-wrapped operation
 */
export interface TimeoutResult<T> {
  /** Whether the operation completed within timeout */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if operation failed or timed out */
  error?: Error;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the operation timed out */
  timedOut: boolean;
}

/**
 * Combined resilience configuration
 */
export interface ResilienceConfig {
  /** Retry configuration */
  retry?: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
  /** Timeout configuration */
  timeout?: TimeoutConfig;
  /** Enable/disable retry logic */
  enableRetry?: boolean;
  /** Enable/disable circuit breaker */
  enableCircuitBreaker?: boolean;
  /** Enable/disable timeout */
  enableTimeout?: boolean;
}

/**
 * Metrics for monitoring resilience patterns
 */
export interface ResilienceMetrics {
  /** Retry metrics */
  retry: {
    /** Total retry attempts across all operations */
    totalAttempts: number;
    /** Successful operations after retry */
    successAfterRetry: number;
    /** Failed operations after all retries */
    failedAfterRetry: number;
    /** Average attempts per operation */
    averageAttempts: number;
  };
  /** Circuit breaker metrics */
  circuitBreaker: {
    /** Total times circuit has opened */
    tripCount: number;
    /** Current state */
    currentState: CircuitState;
    /** Time in each state (ms) */
    timeInState: Record<CircuitState, number>;
  };
  /** Timeout metrics */
  timeout: {
    /** Total operations that timed out */
    timeoutCount: number;
    /** Total operations completed */
    completedCount: number;
    /** Timeout rate (0-1) */
    timeoutRate: number;
  };
}

/**
 * Error class for circuit breaker open state
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Error class for timeout
 */
export class TimeoutError extends Error {
  public readonly timeout: number;

  constructor(message = 'Operation timed out', timeout: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

/**
 * Error class for max retries exceeded
 */
export class MaxRetriesExceededError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`Max retries (${attempts}) exceeded. Last error: ${lastError.message}`);
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}
