/**
 * Command Executor v2.0
 *
 * Executes commands with:
 * - Automatic retry logic using shared resilience library
 * - Dead letter queue integration for failed commands
 * - Event emission for tracking
 * - Metrics collection
 */

import { EventEmitter } from 'node:events';
import { retry } from '../../../shared/resilience/dist/index.js';
import { logger } from '../utils/logger.js';
import { DeadLetterQueue, type DeadLetterItem } from './deadLetterQueue.js';
import type { RetryConfig } from '../config/orchestrator.config.js';

export interface CommandContext<T = unknown> {
  readonly commandId: string;
  readonly data: T;
  readonly metadata?: Record<string, unknown>;
}

export interface ExecutionResult<R = unknown> {
  readonly success: boolean;
  readonly result?: R;
  readonly error?: string;
  readonly retryCount: number;
  readonly executionTime: number;
}

export interface ExecutorEvents {
  'command:executing': (commandId: string) => void;
  'command:completed': (commandId: string, result: ExecutionResult) => void;
  'command:failed': (commandId: string, error: string, retryCount: number) => void;
  'command:retry': (commandId: string, attempt: number, maxAttempts: number) => void;
  'command:dead_letter': (commandId: string, item: DeadLetterItem) => void;
}

/**
 * Command executor with retry and DLQ
 */
export class CommandExecutor<T = unknown, R = unknown> extends EventEmitter {
  private readonly config: RetryConfig;
  private readonly dlq: DeadLetterQueue<T>;

  public constructor(config: RetryConfig, dlq: DeadLetterQueue<T>) {
    super();
    this.config = config;
    this.dlq = dlq;

    logger.info('CommandExecutor initialized', {
      maxAttempts: config.maxAttempts,
      baseDelay: config.baseDelay,
    });
  }

  /**
   * Execute command with retry logic
   */
  public async execute(
    context: CommandContext<T>,
    executor: (data: T) => Promise<R>
  ): Promise<ExecutionResult<R>> {
    const { commandId, data, metadata } = context;
    const startTime = Date.now();

    this.emit('command:executing', commandId);

    logger.info('Executing command', { commandId });

    try {
      // Execute with retry using shared resilience library
      const result = await retry(
        async (attempt) => {
          if (attempt > 1) {
            this.emit('command:retry', commandId, attempt, this.config.maxAttempts);
            logger.info('Retrying command', {
              commandId,
              attempt,
              maxAttempts: this.config.maxAttempts,
            });
          }

          return await executor(data);
        },
        {
          maxAttempts: this.config.maxAttempts,
          baseDelay: this.config.baseDelay,
          maxDelay: this.config.maxDelay,
          backoffMultiplier: this.config.backoffMultiplier,
          jitter: this.config.jitter,
          retryPredicate: (error) => {
            // Retry on network errors, timeouts, etc.
            // Don't retry on validation errors
            if (error instanceof Error) {
              return !error.message.includes('validation');
            }
            return true;
          },
        }
      );

      const executionTime = Date.now() - startTime;

      const executionResult: ExecutionResult<R> = {
        success: true,
        result,
        retryCount: 0, // Will be updated by retry logic
        executionTime,
      };

      this.emit('command:completed', commandId, executionResult);

      logger.info('Command completed successfully', {
        commandId,
        executionTime,
      });

      return executionResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const executionResult: ExecutionResult<R> = {
        success: false,
        error: errorMessage,
        retryCount: this.config.maxAttempts,
        executionTime,
      };

      this.emit('command:failed', commandId, errorMessage, this.config.maxAttempts);

      logger.error('Command failed after max retries', {
        commandId,
        error: errorMessage,
        maxAttempts: this.config.maxAttempts,
        executionTime,
      });

      // Add to dead letter queue
      const dlqItem = this.dlq.add(
        commandId,
        data,
        'max_retries_exceeded',
        this.config.maxAttempts,
        errorMessage,
        metadata
      );

      this.emit('command:dead_letter', commandId, dlqItem);

      return executionResult;
    }
  }

  /**
   * Execute batch of commands
   */
  public async executeBatch(
    contexts: CommandContext<T>[],
    executor: (data: T) => Promise<R>
  ): Promise<ExecutionResult<R>[]> {
    const results: ExecutionResult<R>[] = [];

    for (const context of contexts) {
      const result = await this.execute(context, executor);
      results.push(result);
    }

    logger.info('Batch execution completed', {
      total: contexts.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

    return results;
  }

  /**
   * Execute commands in parallel (with concurrency limit)
   */
  public async executeParallel(
    contexts: CommandContext<T>[],
    executor: (data: T) => Promise<R>,
    concurrency = 5
  ): Promise<ExecutionResult<R>[]> {
    const results: ExecutionResult<R>[] = [];
    const executing: Promise<void>[] = [];

    for (const context of contexts) {
      const promise = this.execute(context, executor).then((result) => {
        results.push(result);
      });

      executing.push(promise);

      // Limit concurrency
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          if (await Promise.race([executing[i], Promise.resolve('pending')]) !== 'pending') {
            executing.splice(i, 1);
          }
        }
      }
    }

    // Wait for remaining
    await Promise.all(executing);

    logger.info('Parallel execution completed', {
      total: contexts.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      concurrency,
    });

    return results;
  }

  /**
   * Replay command from dead letter queue
   */
  public async replayFromDLQ(
    commandId: string,
    executor: (data: T) => Promise<R>
  ): Promise<ExecutionResult<R> | null> {
    const data = this.dlq.replay(commandId);
    if (!data) {
      logger.warn('Cannot replay: command not found in DLQ', { commandId });
      return null;
    }

    logger.info('Replaying command from DLQ', { commandId });

    return await this.execute({ commandId, data }, executor);
  }

  /**
   * Replay all commands from dead letter queue
   */
  public async replayAllFromDLQ(executor: (data: T) => Promise<R>): Promise<ExecutionResult<R>[]> {
    const items = this.dlq.replayAll();

    logger.info('Replaying all commands from DLQ', { count: items.length });

    const contexts: CommandContext<T>[] = items.map((data, index) => ({
      commandId: `dlq-replay-${index}`,
      data,
    }));

    return await this.executeBatch(contexts, executor);
  }
}
