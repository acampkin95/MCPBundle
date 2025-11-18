/**
 * Database Utility Functions
 * Shared database helpers for timeouts, retry logic, and connection management
 */

import { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';

/**
 * Execute a query with a timeout
 * Prevents queries from hanging indefinitely
 *
 * @param pool - PostgreSQL connection pool
 * @param query - SQL query or QueryConfig
 * @param values - Query parameters
 * @param timeoutMs - Timeout in milliseconds (default: 30000 = 30s)
 * @returns Query result
 * @throws Error if query times out or fails
 */
export async function queryWithTimeout<T = any>(
  pool: Pool,
  query: string | QueryConfig,
  values?: any[],
  timeoutMs = 30000
): Promise<QueryResult<T>> {
  const client = await pool.connect();

  try {
    // Set statement timeout for this connection
    await client.query(`SET statement_timeout = ${timeoutMs}`);

    // Execute query with parameters
    const result = typeof query === 'string'
      ? await client.query<T>(query, values)
      : await client.query<T>(query);

    return result;
  } finally {
    // Reset statement timeout and release connection
    await client.query('RESET statement_timeout').catch(() => {
      // Ignore reset errors
    });
    client.release();
  }
}

/**
 * Execute a query with automatic retries on transient failures
 *
 * @param pool - PostgreSQL connection pool
 * @param query - SQL query or QueryConfig
 * @param values - Query parameters
 * @param options - Retry options
 * @returns Query result
 */
export async function queryWithRetry<T = any>(
  pool: Pool,
  query: string | QueryConfig,
  values?: any[],
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<QueryResult<T>> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    timeoutMs = 30000
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await queryWithTimeout<T>(pool, query, values, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = isTransientError(lastError);

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Query failed after retries');
}

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // PostgreSQL transient error patterns
  const transientPatterns = [
    'connection refused',
    'connection reset',
    'connection timeout',
    'temporary failure',
    'deadlock detected',
    'could not serialize access',
    'server closed the connection unexpectedly',
    'terminating connection due to administrator command',
    'the connection is broken',
    'econnreset',
    'etimedout',
    'enotfound',
    'ehostunreach'
  ];

  return transientPatterns.some(pattern => message.includes(pattern));
}

/**
 * Execute a transaction with automatic retries and timeouts
 *
 * @param pool - PostgreSQL connection pool
 * @param callback - Transaction callback function
 * @param options - Transaction options
 * @returns Transaction result
 */
export async function transactionWithRetry<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
  options: {
    maxRetries?: number;
    timeoutMs?: number;
    isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeoutMs = 60000,
    isolationLevel = 'READ COMMITTED'
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const client = await pool.connect();

    try {
      // Set statement timeout
      await client.query(`SET statement_timeout = ${timeoutMs}`);

      // Begin transaction with isolation level
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

      // Execute transaction callback
      const result = await callback(client);

      // Commit transaction
      await client.query('COMMIT');

      return result;
    } catch (error) {
      // Rollback on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Ignore rollback errors
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = isTransientError(lastError);

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        1000 * Math.pow(2, attempt),
        10000
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      // Reset statement timeout and release connection
      await client.query('RESET statement_timeout').catch(() => {});
      client.release();
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}

/**
 * Health check for PostgreSQL connection
 *
 * @param pool - PostgreSQL connection pool
 * @param timeoutMs - Timeout in milliseconds
 * @returns true if healthy, false otherwise
 */
export async function checkDatabaseHealth(
  pool: Pool,
  timeoutMs = 5000
): Promise<boolean> {
  try {
    const result = await queryWithTimeout(
      pool,
      'SELECT 1 as health_check',
      [],
      timeoutMs
    );

    return result.rows[0]?.health_check === 1;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for database to become available
 * Useful during startup when database might not be ready
 *
 * @param pool - PostgreSQL connection pool
 * @param options - Wait options
 * @returns true if database becomes available, false if timeout
 */
export async function waitForDatabase(
  pool: Pool,
  options: {
    maxWaitMs?: number;
    checkIntervalMs?: number;
  } = {}
): Promise<boolean> {
  const {
    maxWaitMs = 60000, // 1 minute
    checkIntervalMs = 1000 // 1 second
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const isHealthy = await checkDatabaseHealth(pool, checkIntervalMs);

    if (isHealthy) {
      return true;
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  return false;
}
