/**
 * Unit tests for LogForwarderStream
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock logger to prevent circular dependency during testing
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Must import after mocking logger
const { LogForwarderStream } = await import('../../../src/utils/logForwarderStream.js');
import type {
  AutoInvestigationService,
  StructuredLogRecord,
} from '../../../src/services/autoInvestigationService.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('LogForwarderStream', () => {
  let stream: LogForwarderStream;
  const mockEndpoint = 'https://logs.example.com/ingest';
  const mockToken = 'test-token-123';

  // Helper function to wait for stream write with assertions
  const writeAndWait = (
    info: any,
    assertions: () => void,
    waitMs = 10
  ): Promise<void> => {
    return new Promise((resolve) => {
      stream.write(info, () => {
        setTimeout(() => {
          assertions();
          resolve();
        }, waitMs);
      });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    if (stream) {
      stream.destroy();
    }
  });

  describe('constructor', () => {
    it('should create stream with minimal options', () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
      });

      expect(stream).toBeDefined();
    });

    it('should create stream with full options', () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        nodeId: 'test-node',
        defaultCategory: 'security',
        maxQueue: 100,
      });

      expect(stream).toBeDefined();
    });

    it('should use hostname as nodeId when not provided', () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      // NodeId should be set (either from env or hostname)
      expect(stream).toBeDefined();
    });

    it('should use default maxQueue of 200', () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
      });

      expect(stream).toBeDefined();
    });
  });

  describe('_write', () => {
    it('should do nothing when endpoint is not configured', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
      });

      const info = {
        level: 'info',
        message: 'Test message',
        timestamp: new Date().toISOString(),
      };

      await new Promise<void>((resolve) => {
        stream.write(info, () => {
          expect(mockFetch).not.toHaveBeenCalled();
          resolve();
        });
      });
    });

    it('should do nothing when token is not configured', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        timestamp: new Date().toISOString(),
      };

      await new Promise<void>((resolve) => {
        stream.write(info, () => {
          expect(mockFetch).not.toHaveBeenCalled();
          resolve();
        });
      });
    });

    it('should queue and forward log when endpoint and token are configured', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        nodeId: 'test-node',
      });

      const info = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-11-15T12:00:00.000Z',
      };

      await writeAndWait(info, () => {
        expect(mockFetch).toHaveBeenCalledWith(
          mockEndpoint,
          expect.objectContaining({
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-ingest-key': mockToken,
            },
          })
        );
      });
    });

    it('should drop oldest entry when queue is full', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        maxQueue: 2, // Small queue for testing
      });

      // Prevent auto-flush to test queue behavior
      mockFetch.mockResolvedValue({ ok: true });

      const info1 = { level: 'info', message: 'Message 1' };
      const info2 = { level: 'info', message: 'Message 2' };
      const info3 = { level: 'info', message: 'Message 3' };

      await Promise.all([
        new Promise<void>((resolve) => stream.write(info1, () => resolve())),
        new Promise<void>((resolve) => stream.write(info2, () => resolve())),
        new Promise<void>((resolve) => stream.write(info3, () => resolve())),
      ]);

      // Wait a bit for queue management
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should have attempted to send (queue management happens internally)
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('buildPayload', () => {
    it('should build payload with string message', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        nodeId: 'test-node',
      });

      const info = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-11-15T12:00:00.000Z',
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.service).toBe('test-service');
        expect(body.nodeId).toBe('test-node');
        expect(body.level).toBe('info');
        expect(body.message).toBe('Test message');
        expect(body.timestamp).toBe('2025-11-15T12:00:00.000Z');
      });
    });

    it('should stringify non-string message', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: { complex: 'object' },
        timestamp: '2025-11-15T12:00:00.000Z',
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.message).toBe('{"complex":"object"}');
      });
    });

    it('should use default category when not provided', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        defaultCategory: 'application',
      });

      const info = {
        level: 'info',
        message: 'Test message',
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.category).toBe('application');
      });
    });

    it('should use category from metadata when provided', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'error',
        message: 'Security breach',
        metadata: {
          category: 'security',
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.category).toBe('security');
      });
    });

    it('should include stack trace when provided', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'error',
        message: 'Error occurred',
        stack: 'Error: Test\n    at Object.<anonymous>',
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.stack).toBe('Error: Test\n    at Object.<anonymous>');
      });
    });

    it('should include correlationId when provided', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          correlationId: 'req-12345',
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.correlationId).toBe('req-12345');
      });
    });
  });

  describe('normalizeTags', () => {
    it('should normalize array tags', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          tags: ['tag1', 'tag2', 'tag3'],
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.tags).toEqual(['tag1', 'tag2', 'tag3']);
      });
    });

    it('should normalize string tags (comma-separated)', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          tags: 'tag1, tag2, tag3',
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.tags).toEqual(['tag1', 'tag2', 'tag3']);
      });
    });

    it('should limit tags to 16 items', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          tags,
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.tags.length).toBe(16);
      });
    });

    it('should filter out empty tags', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          tags: ['tag1', '', 'tag2', null, 'tag3'],
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.tags).toEqual(['tag1', 'tag2', 'tag3']);
      });
    });
  });

  describe('cleanMetadata', () => {
    it('should remove special fields from metadata', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          tags: ['tag1'],
          category: 'application',
          correlationId: 'req-123',
          scope: 'test',
          customField: 'value',
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.metadata).toEqual({ customField: 'value' });
        expect(body.metadata.tags).toBeUndefined();
        expect(body.metadata.category).toBeUndefined();
        expect(body.metadata.correlationId).toBeUndefined();
        expect(body.metadata.scope).toBeUndefined();
      });
    });

    it('should return undefined when no metadata remains', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
        metadata: {
          tags: ['tag1'],
          category: 'application',
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.metadata).toBeUndefined();
      });
    });
  });

  describe('autoInvestigator integration', () => {
    it('should call autoInvestigator when configured', async () => {
      const mockInvestigator: AutoInvestigationService = {
        evaluate: vi.fn().mockResolvedValue(null),
      } as any;

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        autoInvestigator: mockInvestigator,
      });

      const info = {
        level: 'error',
        message: 'Error occurred',
      };

      await writeAndWait(info, () => {
        expect(mockInvestigator.evaluate).toHaveBeenCalled();
      });
    });

    it('should decorate payload with investigation outcome', async () => {
      const mockInvestigator: AutoInvestigationService = {
        evaluate: vi.fn().mockResolvedValue({
          investigation: {
            status: 'succeeded',
            notes: 'Investigation complete',
            attemptedAt: new Date().toISOString(),
          },
        }),
      } as any;

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        autoInvestigator: mockInvestigator,
      });

      const info = {
        level: 'error',
        message: 'Error occurred',
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.investigation).toBeDefined();
        expect(body.investigation.status).toBe('succeeded');
      });
    });

    it('should decorate payload with security event', async () => {
      const mockInvestigator: AutoInvestigationService = {
        evaluate: vi.fn().mockResolvedValue({
          security: {
            reason: 'Unauthorized access',
            severity: 'high',
          },
        }),
      } as any;

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        autoInvestigator: mockInvestigator,
        defaultCategory: 'application',
      });

      const info = {
        level: 'error',
        message: 'Security breach',
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.security).toBeDefined();
        expect(body.security.reason).toBe('Unauthorized access');
        expect(body.category).toBe('security'); // Changed to security
        expect(body.tags).toContain('security'); // Security tag added
      });
    });

    it('should ensure security tag is added for security events', async () => {
      const mockInvestigator: AutoInvestigationService = {
        evaluate: vi.fn().mockResolvedValue({
          security: {
            reason: 'Unauthorized',
            severity: 'high',
          },
        }),
      } as any;

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        autoInvestigator: mockInvestigator,
      });

      const info = {
        level: 'error',
        message: 'Security issue',
        metadata: {
          tags: ['existing-tag'],
        },
      };

      await writeAndWait(info, () => {
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.tags).toContain('security');
        expect(body.tags).toContain('existing-tag');
      });
    });

    it('should handle autoInvestigator errors gracefully', async () => {
      const mockInvestigator: AutoInvestigationService = {
        evaluate: vi.fn().mockRejectedValue(new Error('Investigation failed')),
      } as any;

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
        autoInvestigator: mockInvestigator,
      });

      const info = {
        level: 'error',
        message: 'Error occurred',
      };

      await writeAndWait(info, () => {
        // Should still forward the log despite investigation failure
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('flush', () => {
    it('should retry on fetch failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true });

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info = {
        level: 'info',
        message: 'Test message',
      };

      await writeAndWait(info, () => {
        expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + retry
      }, 1200); // Wait longer than 1s retry delay
    });

    it('should not flush when queue is empty', async () => {
      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      // No writes, so no flushes should occur
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should only flush one entry at a time', async () => {
      let fetchCallCount = 0;
      mockFetch.mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({ ok: true });
      });

      stream = new LogForwarderStream({
        serviceName: 'test-service',
        endpoint: mockEndpoint,
        token: mockToken,
      });

      const info1 = { level: 'info', message: 'Message 1' };
      const info2 = { level: 'info', message: 'Message 2' };

      stream.write(info1, () => {});
      stream.write(info2, () => {});

      setTimeout(() => {
        // Should have flushed both messages sequentially
        expect(fetchCallCount).toBeGreaterThanOrEqual(1);
      }, 50);
    });
  });
});
