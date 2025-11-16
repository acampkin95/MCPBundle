/**
 * Unit tests for CommandQueueService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandQueueService } from '@/services/commandQueue.js';
import { createTestDatabaseFile } from '@tests/helpers/testDatabase.js';
import { MOCK_COMMANDS, generateMockCommands, createMockCommand } from '@tests/fixtures/mockCommands.js';

describe('CommandQueueService', () => {
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

  describe('enqueue', () => {
    it('should enqueue a command successfully', () => {
      const command = MOCK_COMMANDS[0];
      const queued = queueService.enqueue(command);

      expect(queued.jobId).toBe(command.jobId);
      expect(queued.toolName).toBe(command.toolName);
      expect(queued.status).toBe('queued');
      expect(queued.retryCount).toBe(0);
      expect(queued.createdAt).toBeDefined();
    });

    it('should set default priority to normal', () => {
      const command = createMockCommand({ priority: undefined });
      const queued = queueService.enqueue(command);

      expect(queued.priority).toBe('normal');
    });

    it('should set default maxRetries to 3', () => {
      const command = createMockCommand({ maxRetries: undefined });
      const queued = queueService.enqueue(command);

      expect(queued.maxRetries).toBe(3);
    });

    it('should respect custom maxRetries', () => {
      const command = createMockCommand({ maxRetries: 5 });
      const queued = queueService.enqueue(command);

      expect(queued.maxRetries).toBe(5);
    });

    it('should handle complex params object', () => {
      const complexParams = {
        nested: { value: 123 },
        array: [1, 2, 3],
        string: 'test',
      };
      const command = createMockCommand({ params: complexParams });
      const queued = queueService.enqueue(command);

      expect(queued.params).toEqual(complexParams);
    });

    it('should enqueue multiple commands', () => {
      MOCK_COMMANDS.forEach((cmd) => queueService.enqueue(cmd));

      const stats = queueService.getStats();
      expect(stats.totalQueued).toBe(MOCK_COMMANDS.length);
    });

    it('should handle targetAgentId', () => {
      const command = createMockCommand({ targetAgentId: 'agent-01' });
      const queued = queueService.enqueue(command);

      expect(queued.targetAgentId).toBe('agent-01');
    });
  });

  describe('dequeue', () => {
    beforeEach(() => {
      MOCK_COMMANDS.forEach((cmd) => queueService.enqueue(cmd));
    });

    it('should dequeue commands in priority order', () => {
      // Enqueue should be: urgent > high > normal > low
      const first = queueService.dequeue();
      expect(first?.priority).toBe('urgent');

      const second = queueService.dequeue();
      expect(second?.priority).toBe('high');

      const third = queueService.dequeue();
      expect(third?.priority).toBe('normal');

      const fourth = queueService.dequeue();
      expect(fourth?.priority).toBe('normal');

      const fifth = queueService.dequeue();
      expect(fifth?.priority).toBe('low');
    });

    it('should mark dequeued command as picked', () => {
      const command = queueService.dequeue();
      expect(command?.status).toBe('picked');
      expect(command?.pickedAt).toBeDefined();
    });

    it('should return null when queue is empty', () => {
      // Dequeue all commands
      while (queueService.dequeue() !== null) {
        // Keep dequeuing
      }

      const result = queueService.dequeue();
      expect(result).toBeNull();
    });

    it('should filter by targetAgentId when provided', () => {
      queueService.enqueue(
        createMockCommand({
          jobId: 'targeted-job',
          targetAgentId: 'agent-specific',
          priority: 'urgent',
        })
      );

      const result = queueService.dequeue('agent-specific');
      expect(result?.jobId).toBe('targeted-job');
    });

    it('should not dequeue targeted commands for wrong agent', () => {
      queueService.enqueue(
        createMockCommand({
          targetAgentId: 'agent-01',
          priority: 'urgent',
        })
      );

      const result = queueService.dequeue('agent-02');
      expect(result?.targetAgentId).not.toBe('agent-01');
    });

    it('should dequeue FIFO within same priority', () => {
      const cmd1 = createMockCommand({ jobId: 'first', priority: 'normal' });
      const cmd2 = createMockCommand({ jobId: 'second', priority: 'normal' });

      queueService.enqueue(cmd1);
      queueService.enqueue(cmd2);

      const first = queueService.dequeue();
      expect(first?.jobId).toBe('first');

      const second = queueService.dequeue();
      expect(second?.jobId).toBe('second');
    });
  });

  describe('updateStatus', () => {
    let jobId: string;

    beforeEach(() => {
      const command = queueService.enqueue(MOCK_COMMANDS[0]);
      jobId = command.jobId;
    });

    it('should update status to executing', () => {
      queueService.updateStatus(jobId, 'executing');

      const command = queueService.getCommand(jobId);
      expect(command?.status).toBe('executing');
    });

    it('should update status to completed with result', () => {
      const result = { success: true, data: 'test' };
      queueService.updateStatus(jobId, 'completed', result);

      const command = queueService.getCommand(jobId);
      expect(command?.status).toBe('completed');
      expect(command?.result).toEqual(result);
      expect(command?.completedAt).toBeDefined();
    });

    it('should update status to failed with error', () => {
      const error = 'Connection timeout';
      queueService.updateStatus(jobId, 'failed', undefined, error);

      const command = queueService.getCommand(jobId);
      expect(command?.status).toBe('failed');
      expect(command?.error).toBe(error);
      expect(command?.completedAt).toBeDefined();
    });

    it('should set completedAt for terminal statuses', () => {
      queueService.updateStatus(jobId, 'completed');
      let command = queueService.getCommand(jobId);
      expect(command?.completedAt).toBeDefined();

      const jobId2 = queueService.enqueue(MOCK_COMMANDS[1]).jobId;
      queueService.updateStatus(jobId2, 'failed');
      command = queueService.getCommand(jobId2);
      expect(command?.completedAt).toBeDefined();

      const jobId3 = queueService.enqueue(MOCK_COMMANDS[2]).jobId;
      queueService.updateStatus(jobId3, 'timeout');
      command = queueService.getCommand(jobId3);
      expect(command?.completedAt).toBeDefined();
    });
  });

  describe('retryCommand', () => {
    let jobId: string;

    beforeEach(() => {
      const command = queueService.enqueue(createMockCommand({ maxRetries: 3 }));
      jobId = command.jobId;
      queueService.updateStatus(jobId, 'failed', undefined, 'Network error');
    });

    it('should requeue failed command with incremented retry count', () => {
      const success = queueService.retryCommand(jobId);
      expect(success).toBe(true);

      const command = queueService.getCommand(jobId);
      expect(command?.status).toBe('queued');
      expect(command?.retryCount).toBe(1);
      expect(command?.error).toBeUndefined();
      expect(command?.completedAt).toBeUndefined();
    });

    it('should not retry beyond maxRetries', () => {
      // Retry 3 times (maxRetries = 3)
      queueService.retryCommand(jobId);
      queueService.updateStatus(jobId, 'failed');
      queueService.retryCommand(jobId);
      queueService.updateStatus(jobId, 'failed');
      queueService.retryCommand(jobId);
      queueService.updateStatus(jobId, 'failed');

      // 4th retry should fail
      const success = queueService.retryCommand(jobId);
      expect(success).toBe(false);

      const command = queueService.getCommand(jobId);
      expect(command?.retryCount).toBe(3);
      expect(command?.status).toBe('failed');
    });

    it('should return false for non-existent command', () => {
      const success = queueService.retryCommand('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('getCommand', () => {
    it('should retrieve command by jobId', () => {
      const original = queueService.enqueue(MOCK_COMMANDS[0]);
      const retrieved = queueService.getCommand(original.jobId);

      expect(retrieved?.jobId).toBe(original.jobId);
      expect(retrieved?.toolName).toBe(original.toolName);
    });

    it('should return null for non-existent jobId', () => {
      const result = queueService.getCommand('non-existent');
      expect(result).toBeNull();
    });

    it('should return updated status', () => {
      const jobId = queueService.enqueue(MOCK_COMMANDS[0]).jobId;
      queueService.updateStatus(jobId, 'completed', { result: 'success' });

      const command = queueService.getCommand(jobId);
      expect(command?.status).toBe('completed');
      expect(command?.result).toEqual({ result: 'success' });
    });
  });

  describe('getStats', () => {
    it('should return empty stats for new queue', () => {
      const stats = queueService.getStats();

      expect(stats.totalQueued).toBe(0);
      expect(stats.totalPicked).toBe(0);
      expect(stats.totalExecuting).toBe(0);
      expect(stats.totalCompleted).toBe(0);
      expect(stats.totalFailed).toBe(0);
    });

    it('should count queued commands', () => {
      MOCK_COMMANDS.forEach((cmd) => queueService.enqueue(cmd));

      const stats = queueService.getStats();
      expect(stats.totalQueued).toBe(MOCK_COMMANDS.length);
    });

    it('should track status distribution', () => {
      const commands = MOCK_COMMANDS.map((cmd) => queueService.enqueue(cmd));

      queueService.dequeue(); // picked
      queueService.updateStatus(commands[1].jobId, 'executing');
      queueService.updateStatus(commands[2].jobId, 'completed');
      queueService.updateStatus(commands[3].jobId, 'failed');

      const stats = queueService.getStats();
      expect(stats.totalQueued).toBe(1); // One left in queue
      expect(stats.totalPicked).toBe(1);
      expect(stats.totalExecuting).toBe(1);
      expect(stats.totalCompleted).toBe(1);
      expect(stats.totalFailed).toBe(1);
    });

    it('should include oldest queued timestamp', () => {
      queueService.enqueue(MOCK_COMMANDS[0]);

      const stats = queueService.getStats();
      expect(stats.oldestQueued).toBeDefined();
      expect(new Date(stats.oldestQueued!).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should count timeout as failed', () => {
      const jobId = queueService.enqueue(MOCK_COMMANDS[0]).jobId;
      queueService.updateStatus(jobId, 'timeout');

      const stats = queueService.getStats();
      expect(stats.totalFailed).toBe(1);
    });
  });

  describe('purgeOldCommands', () => {
    it('should purge completed commands older than N days', () => {
      const jobId = queueService.enqueue(MOCK_COMMANDS[0]).jobId;
      queueService.updateStatus(jobId, 'completed');

      // Manually update completed_at to 10 days ago
      const db = (queueService as any).db;
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE command_queue SET completed_at = ? WHERE job_id = ?').run(tenDaysAgo, jobId);

      const deleted = queueService.purgeOldCommands(7);
      expect(deleted).toBe(1);

      const command = queueService.getCommand(jobId);
      expect(command).toBeNull();
    });

    it('should not purge recent completed commands', () => {
      const jobId = queueService.enqueue(MOCK_COMMANDS[0]).jobId;
      queueService.updateStatus(jobId, 'completed');

      const deleted = queueService.purgeOldCommands(7);
      expect(deleted).toBe(0);

      const command = queueService.getCommand(jobId);
      expect(command).not.toBeNull();
    });

    it('should not purge queued or executing commands', () => {
      queueService.enqueue(MOCK_COMMANDS[0]); // queued
      const jobId2 = queueService.enqueue(MOCK_COMMANDS[1]).jobId;
      queueService.updateStatus(jobId2, 'executing');

      const deleted = queueService.purgeOldCommands(0);
      expect(deleted).toBe(0);
    });
  });

  describe('performance', () => {
    it('should enqueue 1000 commands in < 1 second', () => {
      const commands = generateMockCommands(1000);
      const start = Date.now();

      commands.forEach((cmd) => queueService.enqueue(cmd));

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should dequeue 1000 commands in < 1 second', () => {
      const commands = generateMockCommands(1000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const start = Date.now();
      while (queueService.dequeue() !== null) {
        // Keep dequeuing
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle 10000 commands queue', () => {
      const commands = generateMockCommands(10000);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      const stats = queueService.getStats();
      expect(stats.totalQueued).toBe(10000);
    });

    it('should maintain FIFO order under load', () => {
      const jobIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const cmd = createMockCommand({
          jobId: `job-${i}`,
          priority: 'normal',
        });
        queueService.enqueue(cmd);
        jobIds.push(cmd.jobId);
      }

      const dequeuedIds: string[] = [];
      let command;
      while ((command = queueService.dequeue()) !== null) {
        dequeuedIds.push(command.jobId);
      }

      expect(dequeuedIds).toEqual(jobIds);
    });
  });

  describe('edge cases', () => {
    it('should handle empty params object', () => {
      const command = createMockCommand({ params: {} });
      const queued = queueService.enqueue(command);

      expect(queued.params).toEqual({});
    });

    it('should handle empty capabilities array', () => {
      const command = createMockCommand({ requestedCapabilities: [] });
      const queued = queueService.enqueue(command);

      expect(queued.requestedCapabilities).toEqual([]);
    });

    it('should handle very long jobId', () => {
      const longId = 'x'.repeat(1000);
      const command = createMockCommand({ jobId: longId });
      const queued = queueService.enqueue(command);

      expect(queued.jobId).toBe(longId);
    });

    it('should handle special characters in params', () => {
      const specialParams = {
        sql: "SELECT * FROM users WHERE name = 'O''Reilly'",
        json: '{"key": "value"}',
      };
      const command = createMockCommand({ params: specialParams });
      const queued = queueService.enqueue(command);

      expect(queued.params).toEqual(specialParams);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent enqueues', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(queueService.enqueue(createMockCommand({ jobId: `concurrent-${i}` })))
      );

      await Promise.all(promises);

      const stats = queueService.getStats();
      expect(stats.totalQueued).toBe(100);
    });

    it('should handle mixed read/write operations', async () => {
      queueService.enqueue(MOCK_COMMANDS[0]);

      const operations = [
        () => queueService.enqueue(createMockCommand()),
        () => queueService.dequeue(),
        () => queueService.getStats(),
        () => queueService.getCommand(MOCK_COMMANDS[0].jobId),
      ];

      const promises = Array.from({ length: 100 }, (_, i) => Promise.resolve(operations[i % operations.length]()));

      await Promise.all(promises);
      // Should not throw errors
    });
  });
});
