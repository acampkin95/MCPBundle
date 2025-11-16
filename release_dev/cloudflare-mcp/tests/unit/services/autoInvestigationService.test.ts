/**
 * Unit tests for AutoInvestigationService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoInvestigationService } from '../../../src/services/autoInvestigationService.js';
import type { StructuredLogRecord } from '../../../src/services/autoInvestigationService.js';

// Mock execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn((fn) => fn),
}));

describe('AutoInvestigationService', () => {
  let service: AutoInvestigationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AutoInvestigationService({
      serviceName: 'test-service',
      pm2ProcessName: 'test-process',
      cooldownMs: 60000,
    });
  });

  describe('evaluate', () => {
    it('should return undefined for non-error log levels', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'info',
        category: 'application',
        message: 'Info message',
      };

      const result = await service.evaluate(payload);

      expect(result).toBeUndefined();
    });

    it('should return undefined for warning log level', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'warn',
        category: 'application',
        message: 'Warning message',
      };

      const result = await service.evaluate(payload);

      expect(result).toBeUndefined();
    });

    it('should investigate error-level logs', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error message',
      };

      const result = await service.evaluate(payload);

      expect(result).toBeDefined();
      expect(result?.investigation).toBeDefined();
    });

    it('should investigate fatal-level logs', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'fatal',
        category: 'application',
        message: 'Fatal error',
      };

      const result = await service.evaluate(payload);

      expect(result).toBeDefined();
      expect(result?.investigation).toBeDefined();
    });

    it('should detect security events by keyword', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: 'Unauthorized access attempt',
      };

      const result = await service.evaluate(payload);

      expect(result).toBeDefined();
      expect(result?.security).toBeDefined();
      expect(result?.security?.reason).toContain('Unauthorized');
      expect(result?.security?.severity).toBe('high');
      expect(result?.investigation?.status).toBe('escalated');
    });

    it('should detect security events by tag', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Authentication problem',
        tags: ['security', 'auth'],
      };

      const result = await service.evaluate(payload);

      expect(result).toBeDefined();
      expect(result?.security).toBeDefined();
      expect(result?.investigation?.status).toBe('escalated');
    });

    it('should detect security events from metadata', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error occurred',
        metadata: { securityEvent: true },
      };

      const result = await service.evaluate(payload);

      expect(result).toBeDefined();
      expect(result?.security).toBeDefined();
    });

    it('should extract actor from metadata', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: 'Failed login',
        metadata: { actor: 'malicious-user@example.com' },
      };

      const result = await service.evaluate(payload);

      expect(result?.security?.actor).toBe('malicious-user@example.com');
    });

    it('should extract actor from username field', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: 'Unauthorized',
        metadata: { username: 'test-user' },
      };

      const result = await service.evaluate(payload);

      expect(result?.security?.actor).toBe('test-user');
    });

    it('should extract source IP from metadata', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: 'Denied',
        metadata: { ip: '192.168.1.100' },
      };

      const result = await service.evaluate(payload);

      expect(result?.security?.sourceIp).toBe('192.168.1.100');
    });

    it('should extract source IP from sourceIp field', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: 'Forbidden',
        metadata: { sourceIp: '10.0.0.1' },
      };

      const result = await service.evaluate(payload);

      expect(result?.security?.sourceIp).toBe('10.0.0.1');
    });

    it('should detect PM2 failures', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Process crash detected',
        stack: 'pm2 exit code 1',
      };

      const result = await service.evaluate(payload);

      expect(result).toBeDefined();
      expect(result?.investigation).toBeDefined();
    });

    it('should enforce cooldown period for duplicate errors', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Duplicate error',
      };

      const result1 = await service.evaluate(payload);
      const result2 = await service.evaluate(payload);

      expect(result1?.investigation?.status).toBe('succeeded');
      expect(result2?.investigation?.status).toBe('not_applicable');
      expect(result2?.investigation?.notes).toContain('recently executed');
    });

    it('should allow investigation after cooldown period', async () => {
      const shortCooldownService = new AutoInvestigationService({
        serviceName: 'test-service',
        cooldownMs: 100, // 100ms cooldown
      });

      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error message',
      };

      const result1 = await shortCooldownService.evaluate(payload);

      // Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result2 = await shortCooldownService.evaluate(payload);

      expect(result1?.investigation?.status).toBe('succeeded');
      expect(result2?.investigation?.status).toBe('succeeded');
    });

    it('should not attempt PM2 restart when PM2 process name not configured', async () => {
      const noPm2Service = new AutoInvestigationService({
        serviceName: 'test-service',
      });

      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'pm2 crash detected',
      };

      const result = await noPm2Service.evaluate(payload);

      // When PM2 process name is not configured, it falls through to generic telemetry capture
      expect(result?.investigation?.status).toBe('succeeded');
      expect(result?.investigation?.notes).toContain('telemetry');
    });

    it('should include security metadata in security events', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: 'Invalid credentials',
        metadata: {
          requestId: '12345',
          path: '/api/login',
        },
      };

      const result = await service.evaluate(payload);

      expect(result?.security?.metadata).toEqual({
        requestId: '12345',
        path: '/api/login',
      });
    });

    it('should generate fingerprint for deduplication', async () => {
      const payload1: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error A',
      };

      const payload2: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-2', // Different node
        level: 'error',
        category: 'application',
        message: 'Error A', // Same message
      };

      const result1 = await service.evaluate(payload1);
      const result2 = await service.evaluate(payload2);

      // Same message from different nodes should be deduplicated (same fingerprint)
      expect(result2?.investigation?.status).toBe('not_applicable');
    });

    it('should handle different error messages separately', async () => {
      const payload1: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error A',
      };

      const payload2: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error B',
      };

      const result1 = await service.evaluate(payload1);
      const result2 = await service.evaluate(payload2);

      // Different messages should both be investigated
      expect(result1?.investigation?.status).toBe('succeeded');
      expect(result2?.investigation?.status).toBe('succeeded');
    });

    it('should capture telemetry for non-specific errors', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Generic error occurred',
      };

      const result = await service.evaluate(payload);

      expect(result?.investigation?.status).toBe('succeeded');
      expect(result?.investigation?.notes).toContain('telemetry');
    });

    it('should include attempted timestamp in investigation', async () => {
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'application',
        message: 'Error message',
      };

      const result = await service.evaluate(payload);

      expect(result?.investigation?.attemptedAt).toBeDefined();
      expect(new Date(result!.investigation!.attemptedAt!).getTime()).toBeGreaterThan(0);
    });

    it('should truncate long security messages', async () => {
      const longMessage = 'A'.repeat(1000);
      const payload: StructuredLogRecord = {
        service: 'test-service',
        nodeId: 'node-1',
        level: 'error',
        category: 'security',
        message: longMessage,
        tags: ['security'],
      };

      const result = await service.evaluate(payload);

      expect(result?.security?.reason.length).toBe(512);
    });
  });
});
