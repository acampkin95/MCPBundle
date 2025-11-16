/**
 * Test database utilities
 */

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create a temporary in-memory SQLite database for testing
 */
export function createTestDatabase(): Database.Database {
  return new Database(':memory:');
}

/**
 * Create a temporary file-based SQLite database for testing
 */
export function createTestDatabaseFile(): { db: Database.Database; path: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
  const dbPath = join(tempDir, 'test.db');
  const db = new Database(dbPath);

  return {
    db,
    path: dbPath,
    cleanup: () => {
      try {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock timer for testing time-based functions
 */
export class MockTimer {
  private currentTime = Date.now();
  private timers: Array<{ callback: () => void; time: number }> = [];

  public now(): number {
    return this.currentTime;
  }

  public advance(ms: number): void {
    this.currentTime += ms;
    this.processTimers();
  }

  public setTimeout(callback: () => void, ms: number): void {
    this.timers.push({ callback, time: this.currentTime + ms });
  }

  private processTimers(): void {
    const dueTimers = this.timers.filter((t) => t.time <= this.currentTime);
    this.timers = this.timers.filter((t) => t.time > this.currentTime);
    dueTimers.forEach((t) => t.callback());
  }
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;
  return { result, durationMs };
}

/**
 * Count calls to a function
 */
export function createCallCounter<T extends (...args: unknown[]) => unknown>(fn: T): T & { callCount: number; reset: () => void } {
  let callCount = 0;
  const wrapper = ((...args: unknown[]) => {
    callCount++;
    return fn(...args);
  }) as T & { callCount: number; reset: () => void };

  Object.defineProperty(wrapper, 'callCount', {
    get: () => callCount,
  });

  wrapper.reset = () => {
    callCount = 0;
  };

  return wrapper;
}
