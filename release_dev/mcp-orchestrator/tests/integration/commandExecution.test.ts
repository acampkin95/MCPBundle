/**
 * Integration tests for command execution lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandQueueService } from '@/services/commandQueue.js';
import { createTestDatabaseFile, waitFor } from '@tests/helpers/testDatabase.js';
import { createMockCommand, generateMockCommands } from '@tests/fixtures/mockCommands.js';

describe('Command Execution Integration', () => {
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

  describe('full command lifecycle', () => {
    it('should execute complete lifecycle: enqueue -> dequeue -> execute -> complete', async () => {
      // 1. Enqueue
      const command = createMockCommand({
        toolName: 'test_operation',
        params: { value: 42 },
      });

      const queued = queueService.enqueue(command);
      expect(queued.status).toBe('queued');
      expect(queued.createdAt).toBeDefined();

      // 2. Dequeue (agent picks up)
      const picked = queueService.dequeue();
      expect(picked?.jobId).toBe(command.jobId);
      expect(picked?.status).toBe('picked');
      expect(picked?.pickedAt).toBeDefined();

      // 3. Start execution
      queueService.updateStatus(command.jobId, 'executing');
      const executing = queueService.getCommand(command.jobId);
      expect(executing?.status).toBe('executing');

      // 4. Complete successfully
      const result = { success: true, output: 'Operation completed', value: 42 };
      queueService.updateStatus(command.jobId, 'completed', result);

      const completed = queueService.getCommand(command.jobId);
      expect(completed?.status).toBe('completed');
      expect(completed?.result).toEqual(result);
      expect(completed?.completedAt).toBeDefined();

      // Verify stats
      const stats = queueService.getStats();
      expect(stats.totalCompleted).toBe(1);
      expect(stats.totalQueued).toBe(0);
    });

    it('should handle failure and retry workflow', async () => {
      const command = createMockCommand({ maxRetries: 3 });
      queueService.enqueue(command);

      // First attempt fails
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'failed', undefined, 'Network timeout');

      let failed = queueService.getCommand(command.jobId);
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Network timeout');
      expect(failed?.retryCount).toBe(0);

      // Retry #1
      expect(queueService.retryCommand(command.jobId)).toBe(true);
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'failed', undefined, 'Connection refused');

      failed = queueService.getCommand(command.jobId);
      expect(failed?.retryCount).toBe(1);

      // Retry #2
      expect(queueService.retryCommand(command.jobId)).toBe(true);
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'failed', undefined, 'Temporary error');

      failed = queueService.getCommand(command.jobId);
      expect(failed?.retryCount).toBe(2);

      // Retry #3 - succeeds
      expect(queueService.retryCommand(command.jobId)).toBe(true);
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'completed', { success: true });

      const completed = queueService.getCommand(command.jobId);
      expect(completed?.status).toBe('completed');
      expect(completed?.retryCount).toBe(3);
    });

    it('should handle timeout scenario', async () => {
      const command = createMockCommand({ toolName: 'slow_operation' });
      queueService.enqueue(command);

      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'executing');

      // Simulate timeout
      await new Promise((resolve) => setTimeout(resolve, 100));
      queueService.updateStatus(command.jobId, 'timeout', undefined, 'Operation exceeded 30s timeout');

      const timedOut = queueService.getCommand(command.jobId);
      expect(timedOut?.status).toBe('timeout');
      expect(timedOut?.completedAt).toBeDefined();

      const stats = queueService.getStats();
      expect(stats.totalFailed).toBe(1); // Timeout counts as failed
    });
  });

  describe('priority queue workflow', () => {
    it('should process urgent commands first', async () => {
      // Queue commands in mixed order
      const low = createMockCommand({ jobId: 'low', priority: 'low' });
      const normal = createMockCommand({ jobId: 'normal', priority: 'normal' });
      const high = createMockCommand({ jobId: 'high', priority: 'high' });
      const urgent = createMockCommand({ jobId: 'urgent', priority: 'urgent' });

      queueService.enqueue(low);
      queueService.enqueue(normal);
      queueService.enqueue(urgent);
      queueService.enqueue(high);

      // Dequeue should follow priority
      expect(queueService.dequeue()?.jobId).toBe('urgent');
      expect(queueService.dequeue()?.jobId).toBe('high');
      expect(queueService.dequeue()?.jobId).toBe('normal');
      expect(queueService.dequeue()?.jobId).toBe('low');
    });

    it('should handle priority preemption correctly', async () => {
      // Start with normal priority commands
      const normal1 = createMockCommand({ jobId: 'normal-1', priority: 'normal' });
      const normal2 = createMockCommand({ jobId: 'normal-2', priority: 'normal' });

      queueService.enqueue(normal1);
      queueService.enqueue(normal2);

      // Process first normal
      const first = queueService.dequeue();
      expect(first?.jobId).toBe('normal-1');

      // Urgent arrives while processing
      const urgent = createMockCommand({ jobId: 'urgent', priority: 'urgent' });
      queueService.enqueue(urgent);

      // Next dequeue should get urgent
      expect(queueService.dequeue()?.jobId).toBe('urgent');

      // Then back to normal queue
      expect(queueService.dequeue()?.jobId).toBe('normal-2');
    });
  });

  describe('targeted agent workflow', () => {
    it('should route command to specific agent', async () => {
      const agentSpecific = createMockCommand({
        jobId: 'agent-specific',
        targetAgentId: 'agent-postgres-01',
      });

      const general = createMockCommand({ jobId: 'general' });

      queueService.enqueue(agentSpecific);
      queueService.enqueue(general);

      // Wrong agent should get general command
      const forWrongAgent = queueService.dequeue('agent-redis-01');
      expect(forWrongAgent?.jobId).toBe('general');

      // Correct agent should get specific command
      const forCorrectAgent = queueService.dequeue('agent-postgres-01');
      expect(forCorrectAgent?.jobId).toBe('agent-specific');
    });

    it('should handle agent affinity in mixed queue', async () => {
      // Create mix of targeted and general commands
      queueService.enqueue(createMockCommand({ jobId: 'general-1' }));
      queueService.enqueue(createMockCommand({ jobId: 'agent1', targetAgentId: 'agent-01' }));
      queueService.enqueue(createMockCommand({ jobId: 'general-2' }));
      queueService.enqueue(createMockCommand({ jobId: 'agent2', targetAgentId: 'agent-02' }));

      // Agent-01 should get its specific command
      expect(queueService.dequeue('agent-01')?.jobId).toBe('agent1');

      // Agent-02 should get its specific command
      expect(queueService.dequeue('agent-02')?.jobId).toBe('agent2');

      // Any agent can get general commands
      expect(queueService.dequeue()?.jobId).toBe('general-1');
      expect(queueService.dequeue()?.jobId).toBe('general-2');
    });
  });

  describe('concurrent execution', () => {
    it('should handle multiple agents processing simultaneously', async () => {
      const commands = generateMockCommands(100);
      commands.forEach((cmd) => queueService.enqueue(cmd));

      // Simulate 5 agents processing concurrently
      const agents = ['agent-01', 'agent-02', 'agent-03', 'agent-04', 'agent-05'];
      const processed: string[] = [];

      // Each agent dequeues and processes
      for (const agent of agents) {
        for (let i = 0; i < 20; i++) {
          const command = queueService.dequeue(agent);
          if (command) {
            queueService.updateStatus(command.jobId, 'executing');
            queueService.updateStatus(command.jobId, 'completed', { agent });
            processed.push(command.jobId);
          }
        }
      }

      expect(processed).toHaveLength(100);

      // All should be completed
      const stats = queueService.getStats();
      expect(stats.totalCompleted).toBe(100);
      expect(stats.totalQueued).toBe(0);
    });

    it('should maintain data integrity with concurrent updates', async () => {
      const command = createMockCommand();
      queueService.enqueue(command);
      queueService.dequeue();

      // Simulate rapid status updates
      queueService.updateStatus(command.jobId, 'executing');
      queueService.updateStatus(command.jobId, 'executing'); // Idempotent
      queueService.updateStatus(command.jobId, 'completed', { result: 'final' });

      const final = queueService.getCommand(command.jobId);
      expect(final?.status).toBe('completed');
      expect(final?.result).toEqual({ result: 'final' });
    });
  });

  describe('batch processing workflow', () => {
    it('should process batch of commands efficiently', async () => {
      const batchSize = 50;
      const commands = generateMockCommands(batchSize);

      // Enqueue batch
      commands.forEach((cmd) => queueService.enqueue(cmd));

      // Process batch
      const results: Array<{ jobId: string; success: boolean }> = [];

      for (let i = 0; i < batchSize; i++) {
        const command = queueService.dequeue();
        if (command) {
          queueService.updateStatus(command.jobId, 'executing');

          // Simulate work
          const success = Math.random() > 0.1; // 90% success rate

          if (success) {
            queueService.updateStatus(command.jobId, 'completed', { index: i });
          } else {
            queueService.updateStatus(command.jobId, 'failed', undefined, 'Random failure');
          }

          results.push({ jobId: command.jobId, success });
        }
      }

      expect(results).toHaveLength(batchSize);

      const stats = queueService.getStats();
      const totalProcessed = stats.totalCompleted + stats.totalFailed;
      expect(totalProcessed).toBe(batchSize);
    });
  });

  describe('error recovery', () => {
    it('should recover from failed dequeue', async () => {
      const command = createMockCommand();
      queueService.enqueue(command);

      // First dequeue succeeds
      const picked = queueService.dequeue();
      expect(picked).not.toBeNull();

      // Agent crashes before processing - command is stuck in 'picked'
      // Simulate recovery: re-queue stuck command
      queueService.updateStatus(command.jobId, 'failed', undefined, 'Agent crash');
      queueService.retryCommand(command.jobId);

      // Should be available for dequeue again
      const retried = queueService.dequeue();
      expect(retried?.jobId).toBe(command.jobId);
      expect(retried?.retryCount).toBe(1);
    });

    it('should handle max retries exhaustion', async () => {
      const command = createMockCommand({ maxRetries: 2 });
      queueService.enqueue(command);

      // Attempt 1
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'failed');
      expect(queueService.retryCommand(command.jobId)).toBe(true);

      // Attempt 2
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'failed');
      expect(queueService.retryCommand(command.jobId)).toBe(true);

      // Attempt 3 (last)
      queueService.dequeue();
      queueService.updateStatus(command.jobId, 'failed');

      // No more retries
      expect(queueService.retryCommand(command.jobId)).toBe(false);

      const failed = queueService.getCommand(command.jobId);
      expect(failed?.status).toBe('failed');
      expect(failed?.retryCount).toBe(2);
    });
  });

  describe('cleanup workflow', () => {
    it('should purge old completed commands', async () => {
      const commands = generateMockCommands(20);

      // Process half of them as completed
      commands.slice(0, 10).forEach((cmd) => {
        queueService.enqueue(cmd);
        queueService.dequeue();
        queueService.updateStatus(cmd.jobId, 'completed');
      });

      // Keep others in queue
      commands.slice(10).forEach((cmd) => queueService.enqueue(cmd));

      // Manually age completed commands
      const db = (queueService as any).db;
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare("UPDATE command_queue SET completed_at = ? WHERE status = 'completed'").run(oldDate);

      // Purge old completed
      const deleted = queueService.purgeOldCommands(7);
      expect(deleted).toBe(10);

      // Queue should still have 10 active commands
      const stats = queueService.getStats();
      expect(stats.totalQueued).toBe(10);
      expect(stats.totalCompleted).toBe(0);
    });
  });

  describe('monitoring and observability', () => {
    it('should provide accurate statistics throughout lifecycle', async () => {
      const commands = generateMockCommands(10);

      // Initially empty
      let stats = queueService.getStats();
      expect(stats.totalQueued).toBe(0);

      // After enqueue
      commands.forEach((cmd) => queueService.enqueue(cmd));
      stats = queueService.getStats();
      expect(stats.totalQueued).toBe(10);

      // After dequeue
      queueService.dequeue();
      queueService.dequeue();
      stats = queueService.getStats();
      expect(stats.totalQueued).toBe(8);
      expect(stats.totalPicked).toBe(2);

      // After execution
      const cmd1 = commands[0];
      queueService.updateStatus(cmd1.jobId, 'executing');
      stats = queueService.getStats();
      expect(stats.totalExecuting).toBe(1);

      // After completion
      queueService.updateStatus(cmd1.jobId, 'completed');
      stats = queueService.getStats();
      expect(stats.totalCompleted).toBe(1);
      expect(stats.totalExecuting).toBe(0);
    });

    it('should track oldest queued command', async () => {
      const first = createMockCommand({ jobId: 'first' });
      queueService.enqueue(first);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const second = createMockCommand({ jobId: 'second' });
      queueService.enqueue(second);

      const stats = queueService.getStats();
      expect(stats.oldestQueued).toBeDefined();

      // Oldest should be the first command
      const oldest = new Date(stats.oldestQueued!);
      const now = new Date();
      const ageMs = now.getTime() - oldest.getTime();
      expect(ageMs).toBeGreaterThanOrEqual(100);
    });
  });
});
