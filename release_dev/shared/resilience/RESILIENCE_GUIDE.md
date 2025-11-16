# Resilience Patterns Library - Comprehensive Guide

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Retry Logic](#retry-logic)
5. [Circuit Breaker](#circuit-breaker)
6. [Timeout Handling](#timeout-handling)
7. [Configuration](#configuration)
8. [Integration Examples](#integration-examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)
11. [Performance Considerations](#performance-considerations)

## Overview

The Resilience Patterns Library provides industry-standard fault tolerance patterns for Node.js applications. It implements three core patterns:

- **Retry Logic**: Automatically retry failed operations with exponential backoff
- **Circuit Breaker**: Prevent cascading failures by failing fast when a service is down
- **Timeout Handling**: Ensure operations don't hang indefinitely

### Key Features

- ✅ **TypeScript Support**: Full type safety with strict mode compliance
- ✅ **Zero Dependencies**: No external runtime dependencies (development only)
- ✅ **Configurable**: Extensive configuration options with sensible defaults
- ✅ **Observable**: Built-in logging and metrics support
- ✅ **Battle-Tested**: 80%+ test coverage with 65+ test cases
- ✅ **Production-Ready**: Designed for high-throughput, low-latency applications

## Installation

### From Source (Within MCP Bundle)

```typescript
import { retry, CircuitBreaker, withTimeout } from '@mcp-bundle/resilience';
```

### Package Info

- **Version**: 1.0.0
- **License**: UNLICENSED (Internal use)
- **TypeScript**: 5.6.3+
- **Node.js**: 20.0.0+

## Quick Start

### Basic Retry

```typescript
import { retry } from '@mcp-bundle/resilience';

// Simple retry with defaults
const result = await retry(async () => {
  const response = await fetch('https://api.example.com/data');
  return response.json();
});

if (result.success) {
  console.log('Data:', result.data);
} else {
  console.error('Failed after', result.attempts, 'attempts');
}
```

### Basic Circuit Breaker

```typescript
import { CircuitBreaker } from '@mcp-bundle/resilience';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  timeout: 60000,
});

try {
  const data = await breaker.execute(async () => {
    return await apiClient.fetchData();
  });
  console.log('Success:', data);
} catch (error) {
  console.error('Circuit breaker error:', error);
}
```

### Basic Timeout

```typescript
import { withTimeout } from '@mcp-bundle/resilience';

const result = await withTimeout(
  async () => {
    return await longRunningOperation();
  },
  { timeout: 5000 }
);

if (result.success) {
  console.log('Completed in', result.duration, 'ms');
} else if (result.timedOut) {
  console.error('Operation timed out');
}
```

## Retry Logic

### Configuration Options

```typescript
interface RetryConfig {
  maxAttempts: number;          // Max retry attempts (default: 3)
  baseDelay: number;             // Base delay in ms (default: 1000)
  maxDelay: number;              // Max delay in ms (default: 10000)
  backoffMultiplier: number;     // Backoff multiplier (default: 2)
  jitter: number;                // Jitter as decimal 0-1 (default: 0.2)
  timeout?: number;              // Optional timeout per attempt
  retryIf?: (error: Error) => boolean;  // Retry predicate
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}
```

### Exponential Backoff Formula

Delay calculation:
```
delay = min(baseDelay * (backoffMultiplier ^ attempt), maxDelay)
delay_with_jitter = delay + random(-jitter * delay, +jitter * delay)
```

Example progression (baseDelay=1000ms, multiplier=2, maxDelay=10000ms):
- Attempt 0: 1000ms ± 200ms
- Attempt 1: 2000ms ± 400ms
- Attempt 2: 4000ms ± 800ms
- Attempt 3: 8000ms ± 1600ms
- Attempt 4: 10000ms ± 2000ms (capped)

### Advanced Usage

#### Custom Retry Predicate

```typescript
const result = await retry(
  async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  },
  {
    maxAttempts: 5,
    retryIf: (error) => {
      // Only retry on specific errors
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      const match = error.message.match(/HTTP (\d+)/);
      if (match) {
        const status = parseInt(match[1] ?? '0', 10);
        return retryableStatuses.includes(status);
      }
      return false;
    },
  }
);
```

#### With Logging

```typescript
import { retry } from '@mcp-bundle/resilience';
import logger from './logger';

const result = await retry(
  async () => await databaseQuery(),
  {
    maxAttempts: 3,
    baseDelay: 500,
    onRetry: (error, attempt, delay) => {
      logger.warn('Retry attempt', {
        attempt,
        error: error.message,
        nextRetryIn: delay,
      });
    },
  }
);
```

### Specialized Retry Functions

#### Network Operations

```typescript
import { retryNetwork } from '@mcp-bundle/resilience';

// Automatically retries network errors
const result = await retryNetwork(
  async () => await apiClient.request(),
  { maxAttempts: 5, baseDelay: 1000 }
);
```

Retryable network errors:
- ECONNREFUSED
- ECONNRESET
- ETIMEDOUT
- ENOTFOUND
- ENETUNREACH
- EHOSTUNREACH

#### Database Operations

```typescript
import { retryDatabase } from '@mcp-bundle/resilience';

// Automatically retries transient database errors
const result = await retryDatabase(
  async () => await db.query('SELECT * FROM users'),
  { maxAttempts: 3, baseDelay: 100 }
);
```

Retryable database errors:
- CONNECTION_LOST
- PROTOCOL_CONNECTION_LOST
- ER_LOCK_WAIT_TIMEOUT
- ER_LOCK_DEADLOCK

#### Redis Operations

```typescript
import { retryRedis } from '@mcp-bundle/resilience';

// Automatically retries Redis-specific errors
const result = await retryRedis(
  async () => await redis.get('key'),
  { maxAttempts: 3 }
);
```

Retryable Redis errors:
- READONLY
- LOADING
- BUSYKEY

## Circuit Breaker

### State Machine

The circuit breaker operates in three states:

```
         ┌─────────────┐
         │   CLOSED    │ (Normal operation)
         └──────┬──────┘
                │
                │ Failure threshold reached
                ↓
         ┌─────────────┐
    ┌───┤    OPEN     │ (Failing fast)
    │   └──────┬──────┘
    │          │
    │          │ Timeout elapsed
    │          ↓
    │   ┌─────────────┐
    │   │ HALF_OPEN   │ (Testing recovery)
    │   └──────┬──────┘
    │          │
    │          ├─── Success ──→ CLOSED
    │          │
    │          └─── Failure ───┘
    │
    └─────────────────────────────┘
```

### Configuration Options

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;       // Failures to open (default: 5)
  successThreshold: number;        // Successes to close from half-open (default: 2)
  timeout: number;                 // Time before trying half-open (default: 60000ms)
  windowSize?: number;             // Rolling window for failures (default: 60000ms)
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  onOpen?: (failures: number) => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}
```

### Usage Examples

#### Basic Circuit Breaker

```typescript
import { CircuitBreaker } from '@mcp-bundle/resilience';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
});

async function callApi() {
  try {
    return await breaker.execute(async () => {
      const response = await fetch('https://api.example.com/data');
      return response.json();
    });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.log('Circuit is open, using fallback');
      return getFallbackData();
    }
    throw error;
  }
}
```

#### With State Change Monitoring

```typescript
import { CircuitBreaker, CircuitState } from '@mcp-bundle/resilience';
import logger from './logger';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  timeout: 30000,
  onStateChange: (from, to) => {
    logger.info('Circuit breaker state change', { from, to });

    if (to === CircuitState.OPEN) {
      // Alert team
      alerting.send('Circuit breaker opened for API');
    }
  },
  onOpen: (failures) => {
    logger.error('Circuit opened after failures', { failures });
  },
  onClose: () => {
    logger.info('Circuit closed, service recovered');
  },
});
```

#### Per-Service Circuit Breakers

```typescript
class ApiClient {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  private getBreaker(service: string): CircuitBreaker {
    if (!this.circuitBreakers.has(service)) {
      this.circuitBreakers.set(
        service,
        new CircuitBreaker({
          failureThreshold: 5,
          timeout: 60000,
        })
      );
    }
    return this.circuitBreakers.get(service)!;
  }

  async call(service: string, endpoint: string) {
    const breaker = this.getBreaker(service);
    return breaker.execute(async () => {
      return await fetch(`https://${service}.api.com${endpoint}`);
    });
  }
}
```

### Statistics and Monitoring

```typescript
const breaker = new CircuitBreaker({ failureThreshold: 5 });

// Get statistics
const stats = breaker.getStats();
console.log({
  state: stats.state,
  totalCalls: stats.totalCalls,
  successRate: stats.successfulCalls / stats.totalCalls,
  failureRate: stats.failedCalls / stats.totalCalls,
  averageResponseTime: stats.averageResponseTime,
});

// Reset if needed
breaker.reset();

// Manual control (for testing/maintenance)
breaker.forceOpen();  // Force open
breaker.forceClose(); // Force close
```

## Timeout Handling

### Configuration Options

```typescript
interface TimeoutConfig {
  timeout: number;              // Timeout in ms (default: 30000)
  timeoutMessage?: string;      // Custom error message
  onTimeout?: () => void;       // Cleanup callback
  onComplete?: (duration: number) => void;  // Success callback
}
```

### Usage Examples

#### Basic Timeout

```typescript
import { withTimeout } from '@mcp-bundle/resilience';

const result = await withTimeout(
  async () => {
    return await fetch('https://api.example.com/large-file');
  },
  { timeout: 10000 }
);

if (result.success) {
  console.log('Downloaded in', result.duration, 'ms');
} else if (result.timedOut) {
  console.error('Download timed out after 10s');
} else {
  console.error('Download failed:', result.error);
}
```

#### With Cleanup

```typescript
import { withTimeout } from '@mcp-bundle/resilience';

let abortController: AbortController | undefined;

const result = await withTimeout(
  async () => {
    abortController = new AbortController();
    return await fetch(url, { signal: abortController.signal });
  },
  {
    timeout: 5000,
    onTimeout: () => {
      // Clean up resources
      abortController?.abort();
      console.log('Request aborted due to timeout');
    },
  }
);
```

#### Using AbortController Helper

```typescript
import { createTimeoutController } from '@mcp-bundle/resilience';

const controller = createTimeoutController(5000);

try {
  const response = await fetch(url, { signal: controller.signal });
  const data = await response.json();
  console.log('Success:', data);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request timed out after 5 seconds');
  }
}
```

#### Simpler API with timeoutPromise

```typescript
import { timeoutPromise, TimeoutError } from '@mcp-bundle/resilience';

try {
  const data = await timeoutPromise(
    fetch('https://api.example.com/data').then(r => r.json()),
    5000,
    'API request timed out'
  );
  console.log('Success:', data);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Timeout after 5s');
  } else {
    console.error('Request failed:', error);
  }
}
```

## Configuration

### Per-MCP Server Configuration

Each MCP server should have a `resilience.config.ts` file:

```typescript
// src/resilience.config.ts
import { ResilienceConfig } from '@mcp-bundle/resilience';

export const resilienceConfig: ResilienceConfig = {
  // Retry configuration
  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS ?? '3', 10),
    baseDelay: parseInt(process.env.RETRY_BASE_DELAY ?? '1000', 10),
    maxDelay: parseInt(process.env.RETRY_MAX_DELAY ?? '10000', 10),
    backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER ?? '2'),
    jitter: parseFloat(process.env.RETRY_JITTER ?? '0.2'),
  },

  // Circuit breaker configuration
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '5', 10),
    successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD ?? '2', 10),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT ?? '60000', 10),
    windowSize: parseInt(process.env.CIRCUIT_BREAKER_WINDOW ?? '60000', 10),
  },

  // Timeout configuration
  timeout: {
    timeout: parseInt(process.env.DEFAULT_TIMEOUT ?? '30000', 10),
  },

  // Enable/disable features
  enableRetry: process.env.ENABLE_RETRY !== 'false',
  enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER !== 'false',
  enableTimeout: process.env.ENABLE_TIMEOUT !== 'false',
};
```

### Environment Variables

Add to `.env`:

```bash
# Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY=1000
RETRY_MAX_DELAY=10000
RETRY_BACKOFF_MULTIPLIER=2
RETRY_JITTER=0.2

# Circuit Breaker Configuration
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
CIRCUIT_BREAKER_TIMEOUT=60000
CIRCUIT_BREAKER_WINDOW=60000

# Timeout Configuration
DEFAULT_TIMEOUT=30000

# Feature Toggles
ENABLE_RETRY=true
ENABLE_CIRCUIT_BREAKER=true
ENABLE_TIMEOUT=true
```

## Integration Examples

### Example 1: Perplexity MCP - API Calls

```typescript
// perplexity-mcp/src/client/api-client.ts
import { retry, CircuitBreaker, withTimeout } from '@mcp-bundle/resilience';
import { resilienceConfig } from '../resilience.config.js';
import logger from '../utils/logger.js';

class PerplexityApiClient {
  private breaker: CircuitBreaker;

  constructor() {
    this.breaker = new CircuitBreaker({
      ...resilienceConfig.circuitBreaker,
      onStateChange: (from, to) => {
        logger.info('Perplexity API circuit breaker state change', { from, to });
      },
    });
  }

  async query(prompt: string): Promise<string> {
    // Combine all three patterns
    return this.breaker.execute(async () => {
      const result = await retry(
        async () => {
          const timeoutResult = await withTimeout(
            async () => {
              const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              return response.json();
            },
            { timeout: 30000 }
          );

          if (!timeoutResult.success) {
            throw timeoutResult.error ?? new Error('Timeout');
          }

          return timeoutResult.data;
        },
        {
          ...resilienceConfig.retry,
          onRetry: (error, attempt, delay) => {
            logger.warn('Retrying Perplexity API call', { attempt, delay, error: error.message });
          },
        }
      );

      if (!result.success) {
        throw result.error ?? new Error('Retry failed');
      }

      return result.data.choices[0].message.content;
    });
  }
}
```

### Example 2: SOC Hub MCP - PostgreSQL

```typescript
// soc-hub-mcp/src/database/connection.ts
import { Pool } from 'pg';
import { retryDatabase, CircuitBreaker } from '@mcp-bundle/resilience';
import { resilienceConfig } from '../resilience.config.js';
import logger from '../utils/logger.js';

class DatabaseConnection {
  private pool: Pool;
  private breaker: CircuitBreaker;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.breaker = new CircuitBreaker({
      ...resilienceConfig.circuitBreaker,
      onOpen: (failures) => {
        logger.error('Database circuit breaker opened', { failures });
      },
    });
  }

  async query(sql: string, params: unknown[]): Promise<unknown[]> {
    return this.breaker.execute(async () => {
      const result = await retryDatabase(
        async () => {
          const queryResult = await this.pool.query(sql, params);
          return queryResult.rows;
        },
        {
          maxAttempts: 3,
          baseDelay: 100,
          onRetry: (error, attempt) => {
            logger.warn('Retrying database query', { attempt, error: error.message });
          },
        }
      );

      if (!result.success) {
        throw result.error ?? new Error('Database query failed');
      }

      return result.data ?? [];
    });
  }
}
```

### Example 3: ITJSST MCP - PowerShell

```typescript
// itjsst-mcp/src/powershell/executor.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { retry, withTimeout } from '@mcp-bundle/resilience';
import { resilienceConfig } from '../resilience.config.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

class PowerShellExecutor {
  async execute(script: string): Promise<string> {
    const result = await retry(
      async () => {
        const timeoutResult = await withTimeout(
          async () => {
            const { stdout, stderr } = await execAsync(`powershell.exe -Command "${script}"`);
            if (stderr) {
              logger.warn('PowerShell stderr', { stderr });
            }
            return stdout;
          },
          {
            timeout: 60000, // 1 minute for PowerShell scripts
            onTimeout: () => {
              logger.error('PowerShell script timed out', { script });
            },
          }
        );

        if (!timeoutResult.success) {
          throw timeoutResult.error ?? new Error('PowerShell timeout');
        }

        return timeoutResult.data ?? '';
      },
      {
        maxAttempts: 2, // Limited retries for PowerShell
        baseDelay: 2000,
        retryIf: (error) => {
          // Only retry on specific errors
          return error.message.includes('ECONNREFUSED') ||
                 error.message.includes('timeout');
        },
        onRetry: (error, attempt) => {
          logger.warn('Retrying PowerShell execution', { attempt, error: error.message });
        },
      }
    );

    if (!result.success) {
      throw result.error ?? new Error('PowerShell execution failed');
    }

    return result.data ?? '';
  }
}
```

### Example 4: MCP Orchestrator - Command Queue

```typescript
// mcp-orchestrator/src/queue/command-queue.ts
import Redis from 'ioredis';
import { retryRedis, CircuitBreaker } from '@mcp-bundle/resilience';
import { resilienceConfig } from '../resilience.config.js';
import logger from '../utils/logger.js';

class CommandQueue {
  private redis: Redis;
  private breaker: CircuitBreaker;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      retryStrategy: () => null, // Disable built-in retry, use our own
    });

    this.breaker = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 30000,
      onOpen: () => {
        logger.error('Redis circuit breaker opened');
      },
    });
  }

  async enqueue(command: string): Promise<void> {
    await this.breaker.execute(async () => {
      const result = await retryRedis(
        async () => {
          await this.redis.lpush('commands', command);
        },
        {
          maxAttempts: 3,
          baseDelay: 500,
          onRetry: (error, attempt) => {
            logger.warn('Retrying Redis enqueue', { attempt, error: error.message });
          },
        }
      );

      if (!result.success) {
        throw result.error ?? new Error('Redis enqueue failed');
      }
    });
  }

  async dequeue(): Promise<string | null> {
    return this.breaker.execute(async () => {
      const result = await retryRedis(
        async () => {
          const item = await this.redis.brpop('commands', 1);
          return item?.[1] ?? null;
        },
        { maxAttempts: 2, baseDelay: 200 }
      );

      if (!result.success) {
        throw result.error ?? new Error('Redis dequeue failed');
      }

      return result.data ?? null;
    });
  }
}
```

## Best Practices

### 1. Choose Appropriate Patterns

| Scenario | Recommended Pattern | Rationale |
|----------|---------------------|-----------|
| External API call | Retry + Circuit Breaker + Timeout | Full protection against network issues |
| Database query | Retry + Circuit Breaker | Transient failures common, timeout usually handled by driver |
| File I/O | Retry only | Usually local, fast fail preferred |
| User-facing operation | Timeout only | Don't retry user actions |
| Background job | Retry + Timeout | Can afford retries, but limit execution time |

### 2. Configure Timeouts Appropriately

```typescript
// Short timeout for simple queries
const userResult = await withTimeout(
  async () => db.query('SELECT * FROM users WHERE id = $1', [userId]),
  { timeout: 1000 }
);

// Longer timeout for complex operations
const reportResult = await withTimeout(
  async () => generateReport(params),
  { timeout: 60000 }
);

// Very long timeout for batch operations
const batchResult = await withTimeout(
  async () => processBatch(items),
  { timeout: 300000 }
);
```

### 3. Use Specialized Retry Functions

```typescript
// ✅ Good: Use specialized function
const result = await retryNetwork(
  async () => fetch(url),
  { maxAttempts: 5 }
);

// ❌ Bad: Generic retry with manual error checking
const result = await retry(
  async () => fetch(url),
  {
    maxAttempts: 5,
    retryIf: (error) => {
      // Complex error checking
      return error.message.includes('ECONNREFUSED') || /* ... */;
    },
  }
);
```

### 4. Implement Proper Logging

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  timeout: 60000,
  onStateChange: (from, to) => {
    logger.info('Circuit state change', {
      from,
      to,
      timestamp: new Date().toISOString(),
      service: 'api-client',
    });
  },
  onOpen: (failures) => {
    logger.error('Circuit opened', {
      failures,
      service: 'api-client',
    });
    // Send alert
    alerting.send('Circuit breaker opened for api-client');
  },
});
```

### 5. Monitor and Collect Metrics

```typescript
import { CircuitBreaker } from '@mcp-bundle/resilience';
import { metrics } from './metrics.js';

class MetricsCollector {
  private interval: NodeJS.Timeout;

  constructor(private breaker: CircuitBreaker) {
    // Collect metrics every 10 seconds
    this.interval = setInterval(() => {
      const stats = breaker.getStats();

      metrics.gauge('circuit_breaker.total_calls', stats.totalCalls);
      metrics.gauge('circuit_breaker.successful_calls', stats.successfulCalls);
      metrics.gauge('circuit_breaker.failed_calls', stats.failedCalls);
      metrics.gauge('circuit_breaker.rejected_calls', stats.rejectedCalls);
      metrics.gauge('circuit_breaker.avg_response_time', stats.averageResponseTime);
      metrics.gauge('circuit_breaker.state', stats.state === 'OPEN' ? 1 : 0);
    }, 10000);
  }

  stop() {
    clearInterval(this.interval);
  }
}
```

### 6. Test Resilience Patterns

```typescript
// tests/resilience.test.ts
import { retry, CircuitBreaker } from '@mcp-bundle/resilience';

describe('API Client Resilience', () => {
  it('should retry on network errors', async () => {
    let attempts = 0;
    const mockApi = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('ECONNREFUSED');
      }
      return 'success';
    });

    const result = await retry(mockApi, { maxAttempts: 3 });

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('should open circuit after threshold', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const failingOp = vi.fn().mockRejectedValue(new Error('Fail'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingOp)).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('OPEN');
  });
});
```

## Troubleshooting

### Circuit Breaker Not Opening

**Problem**: Circuit breaker stays closed despite failures

**Solutions**:
1. Check if failures are within the rolling window
2. Verify failure threshold is appropriate
3. Ensure errors are being thrown (not caught and ignored)

```typescript
// Debug circuit breaker state
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  windowSize: 60000,
  onStateChange: (from, to) => {
    console.log(`Circuit: ${from} -> ${to}`);
  },
});

const stats = breaker.getStats();
console.log('Consecutive failures:', stats.consecutiveFailures);
console.log('Failed calls:', stats.failedCalls);
console.log('State:', stats.state);
```

### Retry Logic Not Working

**Problem**: Operations not being retried

**Solutions**:
1. Check if `retryIf` predicate is too restrictive
2. Verify error types match expected errors
3. Ensure operation is actually throwing errors

```typescript
// Debug retry attempts
const result = await retry(
  operation,
  {
    maxAttempts: 3,
    onRetry: (error, attempt, delay) => {
      console.log('Retry debug:', {
        attempt,
        delay,
        error: error.message,
        errorType: error.constructor.name,
      });
    },
  }
);

console.log('Retry result:', {
  success: result.success,
  attempts: result.attempts,
  totalTime: result.totalTime,
});
```

### Timeout Not Triggering

**Problem**: Operation doesn't timeout as expected

**Solutions**:
1. Verify timeout value is correct
2. Check if operation completes faster than timeout
3. Ensure operation is actually async

```typescript
// Debug timeout
const result = await withTimeout(
  operation,
  {
    timeout: 5000,
    onTimeout: () => {
      console.log('Timeout triggered!');
    },
    onComplete: (duration) => {
      console.log('Completed in:', duration, 'ms');
    },
  }
);

console.log('Timeout result:', {
  success: result.success,
  timedOut: result.timedOut,
  duration: result.duration,
});
```

## Performance Considerations

### Memory Usage

- Circuit breaker maintains rolling window of failures (limited by windowSize)
- Retry logic doesn't store history (minimal memory footprint)
- Timeout handlers are cleaned up automatically

### CPU Usage

- Exponential backoff calculation is O(1)
- Circuit breaker state check is O(1)
- Minimal overhead (<1ms) for each pattern

### Latency Impact

- Retry: Adds delay only on failures (baseDelay * attempts)
- Circuit Breaker: <0.1ms overhead in CLOSED state, 0ms (fail fast) in OPEN
- Timeout: ~1ms overhead for Promise.race

### Recommended Limits

- Max concurrent circuit breakers: 100
- Max retry attempts: 10 (typically 3-5)
- Min timeout: 100ms (avoid too short)
- Max timeout: 300000ms (5 minutes)

---

## Support and Feedback

For issues, questions, or feature requests, please contact the MCP Bundle development team.

**Version**: 1.0.0
**Last Updated**: November 15, 2025
**Maintained By**: MCP Bundle v2.0 Team
