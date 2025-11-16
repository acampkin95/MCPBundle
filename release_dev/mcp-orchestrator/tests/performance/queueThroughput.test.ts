/**
 * Performance tests for queue throughput
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandQueueService } from '@/services/commandQueue.js';
import { createTestDatabaseFile } from '@tests/helpers/testDatabase.js';
import { generateMockCommands } from '@tests/fixtures/mockCommands.js';

describe('Queue Throughput Performance', () => {
  let queueService: CommandQueueService;
  let cleanup: () => void;

  beforeEach(() => {
    const { db, cleanup: cleanupFn } = createTestDatabaseFile();
    cleanup = cleanupFn;
    queueService = new CommandQueueService(db.name);
  });

  afterEach(() => {
    queueService.close();
    cleanup();
  });

  describe('enqueue performance', () => {
    it('should enqueue 1000 commands in < 1 second', () => {
      const commands = generateMockCommands(1000);
      const start = Date.now();

      commands.forEach((cmd) => queueService.enqueue(cmd));

      const duration = Date.now() - start;
      const throughput = (1000 / duration) * 1000; // commands per second

      console.log(`Enqueue throughput: ${Math.round(throughput)} commands/sec`);
      expect(duration).toBeLessThan(1000);
      expect(throughput).toBeGreaterThan(1000); // Target: >1000 cmd/s
    });

    it('should maintain performance with 10,000 commands', () => {
      const commands = generateMockCommands(10000);
      const start = Date.now();

      commands.forEach((cmd) => queueService.enqueue(cmd));

      const duration = Date.now() - start;
      const throughput = (10000 / duration) * 1000;

      console.log(`Enqueue 10k throughput: ${Math.round(throughput)} commands/sec`);
      expect(duration).toBeLessThan(15000); // Allow 15 seconds for 10k
    });

    it('should have consistent enqueue time per command', () => {
      const measurements: number[] = [];

      for (let batch = 0; batch < 10; batch++) {
        const commands = generateMockCommands(100);
        const start = Date.now();

        commands.forEach((cmd) => queueService.enqueue(cmd));

        const duration = Date.now() - start;
        measurements.push(duration / 100); // avg ms per command
      }

      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const variance = measurements.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / measurements.length;
      const stdDev = Math.sqrt(variance);

      console.log(`Avg enqueue time: ${avgTime.toFixed(3)}ms, StdDev: ${stdDev.toFixed(3)}ms`);

      // Standard deviation should be low (consistent performance)
      expect(stdDev).toBeLessThan(avgTime * 0.5); // < 50% variance
    });
  });

  describe('dequeue performance', () => {
    it('should dequeue 1000 commands in < 1 second', () => {
      const commands = generateMockCommands(1000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const start = Date.now();
      let count = 0;

      while (queueService.dequeue() !== null) {
        count++;
      }

      const duration = Date.now() - start;
      const throughput = (count / duration) * 1000;

      console.log(`Dequeue throughput: ${Math.round(throughput)} commands/sec`);
      expect(duration).toBeLessThan(1000);
      expect(count).toBe(1000);
    });

    it('should maintain dequeue performance with priority queues', () => {
      const commands = generateMockCommands(1000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const start = Date.now();
      let count = 0;

      while (queueService.dequeue() !== null) {
        count++;
      }

      const duration = Date.now() - start;

      console.log(`Priority dequeue: ${duration}ms for ${count} commands`);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('mixed operations performance', () => {
    it('should handle interleaved enqueue/dequeue operations', () => {
      const commands = generateMockCommands(1000);
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        queueService.enqueue(commands[i]);
        if (i % 2 === 0) {
          queueService.dequeue();
        }
      }

      const duration = Date.now() - start;
      console.log(`Mixed operations: ${duration}ms for 1000 enqueues + 500 dequeues`);

      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent read/write patterns', () => {
      const commands = generateMockCommands(500);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        const operation = i % 4;
        switch (operation) {
          case 0:
            queueService.getStats();
            break;
          case 1:
            queueService.dequeue();
            break;
          case 2:
            queueService.enqueue(commands[i % commands.length]);
            break;
          case 3:
            queueService.getCommand(commands[i % commands.length].jobId);
            break;
        }
      }

      const duration = Date.now() - start;
      console.log(`Mixed read/write: ${duration}ms for 1000 operations`);

      expect(duration).toBeLessThan(2000);
    });
  });

  describe('stats performance', () => {
    it('should calculate stats quickly for large queue', () => {
      const commands = generateMockCommands(10000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        queueService.getStats();
        measurements.push(Date.now() - start);
      }

      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      console.log(`Stats calculation: ${avgTime.toFixed(2)}ms avg for 10k queue`);

      expect(avgTime).toBeLessThan(50); // < 50ms average
    });
  });

  describe('memory usage', () => {
    it('should not leak memory with repeated operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 10; i++) {
        const commands = generateMockCommands(1000);
        commands.forEach((cmd) => queueService.enqueue(cmd));

        while (queueService.dequeue() !== null) {
          // Drain queue
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      // Memory should not increase significantly
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // < 50MB
    });

    it('should handle large queue without excessive memory', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const commands = generateMockCommands(10000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const bytesPerCommand = memoryIncrease / 10000;

      console.log(`Memory per command: ${bytesPerCommand.toFixed(0)} bytes`);

      // Each command should use reasonable memory
      expect(bytesPerCommand).toBeLessThan(10000); // < 10KB per command
    });
  });

  describe('scalability', () => {
    it('should scale linearly with queue size', () => {
      const sizes = [100, 500, 1000, 5000];
      const measurements: Array<{ size: number; time: number }> = [];

      for (const size of sizes) {
        const commands = generateMockCommands(size);
        const start = Date.now();

        commands.forEach((cmd) => queueService.enqueue(cmd));

        const duration = Date.now() - start;
        measurements.push({ size, time: duration });

        // Clear queue
        while (queueService.dequeue() !== null) {
          // Drain
        }
      }

      console.log('Scalability measurements:');
      measurements.forEach((m) => {
        const timePerCmd = m.time / m.size;
        console.log(`  ${m.size} commands: ${m.time}ms (${timePerCmd.toFixed(3)}ms per cmd)`);
      });

      // Check linear scalability (time per command should be relatively constant)
      const timesPerCmd = measurements.map((m) => m.time / m.size);
      const maxTime = Math.max(...timesPerCmd);
      const minTime = Math.min(...timesPerCmd);
      const ratio = maxTime / minTime;

      console.log(`Scalability ratio: ${ratio.toFixed(2)}x`);
      expect(ratio).toBeLessThan(3); // Should scale within 3x factor
    });
  });

  describe('index efficiency', () => {
    it('should efficiently use indexes for priority queries', () => {
      // Create large queue with mixed priorities
      const commands = generateMockCommands(5000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      // Dequeue should still be fast with large queue
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        queueService.dequeue();
        measurements.push(Date.now() - start);
      }

      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      console.log(`Indexed dequeue: ${avgTime.toFixed(2)}ms avg with 5k queue`);

      expect(avgTime).toBeLessThan(5); // < 5ms per dequeue
    });

    it('should efficiently filter by targetAgentId', () => {
      const commands = generateMockCommands(5000);
      // Set every 10th command to specific agent
      commands.forEach((cmd, i) => {
        if (i % 10 === 0) {
          cmd.targetAgentId = 'agent-01';
        }
      });

      commands.forEach((cmd) => queueService.enqueue(cmd));

      const start = Date.now();
      let count = 0;

      // Dequeue 100 commands for specific agent
      for (let i = 0; i < 100; i++) {
        const cmd = queueService.dequeue('agent-01');
        if (cmd) count++;
      }

      const duration = Date.now() - start;
      console.log(`Targeted dequeue: ${duration}ms for ${count} commands from 5k queue`);

      expect(duration).toBeLessThan(500);
    });
  });

  describe('bulk operations', () => {
    it('should handle bulk status updates efficiently', () => {
      const commands = generateMockCommands(1000);
      const jobIds = commands.map((cmd) => {
        const queued = queueService.enqueue(cmd);
        return queued.jobId;
      });

      const start = Date.now();

      jobIds.forEach((jobId) => {
        queueService.updateStatus(jobId, 'completed', { success: true });
      });

      const duration = Date.now() - start;
      const throughput = (1000 / duration) * 1000;

      console.log(`Bulk update throughput: ${Math.round(throughput)} updates/sec`);
      expect(duration).toBeLessThan(2000);
    });

    it('should purge efficiently', () => {
      const commands = generateMockCommands(5000);
      const jobIds = commands.map((cmd) => {
        const queued = queueService.enqueue(cmd);
        queueService.updateStatus(queued.jobId, 'completed');
        return queued.jobId;
      });

      // Manually update completed_at to old date
      const db = (queueService as any).db;
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE command_queue SET completed_at = ?').run(oldDate);

      const start = Date.now();
      const deleted = queueService.purgeOldCommands(7);
      const duration = Date.now() - start;

      console.log(`Purge: ${duration}ms to delete ${deleted} commands`);
      expect(duration).toBeLessThan(1000);
      expect(deleted).toBe(5000);
    });
  });
});
