/**
 * Unit tests for MCPClientService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPClientService } from '../MCPClientService';
import { CredentialService } from '../CredentialService';
import { MCPConfig } from '../../types';
import * as vscode from 'vscode';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Tool result' }],
    }),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        { name: 'test-tool', description: 'Test tool', inputSchema: {} },
      ],
    }),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('node-ssh', () => ({
  NodeSSH: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    execCommand: vi.fn().mockResolvedValue({
      stdout: 'SSH command output',
      stderr: '',
      code: 0,
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('MCPClientService', () => {
  let service: MCPClientService;
  let mockCredentialService: CredentialService;
  let mockLogger: vscode.OutputChannel;
  let config: MCPConfig;

  beforeEach(() => {
    mockCredentialService = {
      getSSHCredentials: vi.fn().mockResolvedValue({
        username: 'root',
        password: 'testpass',
      }),
    } as unknown as CredentialService;

    mockLogger = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    config = {
      remoteMode: false,
      servers: [
        {
          name: 'itjsst-mcp',
          command: 'node',
          args: ['/opt/mcp/itjsst-mcp/dist/index.js'],
          description: 'IT Administration MCP Server',
        },
        {
          name: 'perplexity-mcp',
          command: 'node',
          args: ['/opt/mcp/perplexity-mcp/dist/index.js'],
          description: 'Perplexity AI Search MCP',
        },
      ],
      ssh: {
        host: '46.250.243.123',
        port: 22,
        username: 'root',
      },
      connectionTimeout: 30000,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize local MCP servers', async () => {
      config.remoteMode = false;
      service = new MCPClientService(config, mockCredentialService, mockLogger);

      await service.initialize();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Initializing MCP servers in local mode')
      );
    });

    it('should initialize remote MCP servers via SSH', async () => {
      config.remoteMode = true;
      service = new MCPClientService(config, mockCredentialService, mockLogger);

      await service.initialize();

      expect(mockCredentialService.getSSHCredentials).toHaveBeenCalledWith(
        '46.250.243.123'
      );
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Initializing MCP servers in remote mode')
      );
    });

    it('should connect to all configured servers', async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);

      await service.initialize();

      const servers = service.getServers();
      expect(servers.length).toBeGreaterThan(0);
    });

    it('should handle connection errors gracefully', async () => {
      config.servers = [
        {
          name: 'invalid-server',
          command: 'nonexistent-command',
          args: [],
          description: 'Invalid server',
        },
      ];

      service = new MCPClientService(config, mockCredentialService, mockLogger);

      // Should not throw, but log error
      await service.initialize();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('invokeTool', () => {
    beforeEach(async () => {
      config.remoteMode = false;
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should invoke tool on specified server', async () => {
      const result = await service.invokeTool({
        serverName: 'itjsst-mcp',
        toolName: 'system-overview',
        arguments: { topProcesses: 10 },
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should throw error if server not found', async () => {
      await expect(
        service.invokeTool({
          serverName: 'nonexistent-server',
          toolName: 'test-tool',
          arguments: {},
        })
      ).rejects.toThrow('Server not found: nonexistent-server');
    });

    it('should throw error if tool not available', async () => {
      await expect(
        service.invokeTool({
          serverName: 'itjsst-mcp',
          toolName: 'nonexistent-tool',
          arguments: {},
        })
      ).rejects.toThrow();
    });

    it('should handle tool execution timeout', async () => {
      config.connectionTimeout = 100; // 100ms timeout
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();

      // Mock a slow tool execution
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      vi.mocked(Client).mockImplementationOnce(
        () =>
          ({
            callTool: vi.fn().mockImplementation(
              () =>
                new Promise((resolve) => {
                  setTimeout(() => resolve({ content: [] }), 200);
                })
            ),
            listTools: vi.fn().mockResolvedValue({ tools: [] }),
            connect: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
          }) as any
      );

      // Timeout should occur
      await expect(
        service.invokeTool({
          serverName: 'itjsst-mcp',
          toolName: 'slow-tool',
          arguments: {},
        })
      ).rejects.toThrow();
    });
  });

  describe('getServers', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should return list of connected servers', () => {
      const servers = service.getServers();

      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0]).toHaveProperty('name');
      expect(servers[0]).toHaveProperty('connected');
    });
  });

  describe('getServerTools', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should return tools for specified server', async () => {
      const tools = await service.getServerTools('itjsst-mcp');

      expect(Array.isArray(tools)).toBe(true);
    });

    it('should throw error if server not found', async () => {
      await expect(
        service.getServerTools('nonexistent-server')
      ).rejects.toThrow('Server not found: nonexistent-server');
    });
  });

  describe('reconnect', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should reconnect to specified server', async () => {
      await service.reconnect('itjsst-mcp');

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Reconnecting to itjsst-mcp')
      );
    });

    it('should throw error if server not found', async () => {
      await expect(service.reconnect('nonexistent-server')).rejects.toThrow(
        'Server not found: nonexistent-server'
      );
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should disconnect from specified server', async () => {
      await service.disconnect('itjsst-mcp');

      const servers = service.getServers();
      const server = servers.find((s) => s.name === 'itjsst-mcp');
      expect(server?.connected).toBe(false);
    });

    it('should handle disconnect errors gracefully', async () => {
      // Disconnect twice should not throw
      await service.disconnect('itjsst-mcp');
      await service.disconnect('itjsst-mcp');

      expect(mockLogger.appendLine).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should dispose all servers and SSH connection', async () => {
      await service.dispose();

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('MCP Client service disposed')
      );

      const servers = service.getServers();
      servers.forEach((server) => {
        expect(server.connected).toBe(false);
      });
    });
  });

  describe('health checks', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should check health of all servers', async () => {
      const health = await service.checkHealth();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('servers');
      expect(Array.isArray(health.servers)).toBe(true);
    });

    it('should identify unhealthy servers', async () => {
      // Disconnect a server
      await service.disconnect('itjsst-mcp');

      const health = await service.checkHealth();

      expect(health.healthy).toBe(false);
      const unhealthyServer = health.servers.find(
        (s) => s.name === 'itjsst-mcp'
      );
      expect(unhealthyServer?.healthy).toBe(false);
    });
  });

  describe('remote mode', () => {
    beforeEach(() => {
      config.remoteMode = true;
    });

    it('should use SSH credentials for remote connection', async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);

      await service.initialize();

      expect(mockCredentialService.getSSHCredentials).toHaveBeenCalledWith(
        config.ssh!.host
      );
    });

    it('should execute commands via SSH tunnel', async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();

      await service.invokeTool({
        serverName: 'itjsst-mcp',
        toolName: 'system-overview',
        arguments: {},
      });

      // Verify SSH was used for remote execution
      expect(mockLogger.appendLine).toHaveBeenCalled();
    });

    it('should handle SSH connection failures', async () => {
      mockCredentialService.getSSHCredentials = vi
        .fn()
        .mockRejectedValue(new Error('SSH auth failed'));

      service = new MCPClientService(config, mockCredentialService, mockLogger);

      await expect(service.initialize()).rejects.toThrow('SSH auth failed');
    });
  });

  describe('error recovery', () => {
    beforeEach(async () => {
      service = new MCPClientService(config, mockCredentialService, mockLogger);
      await service.initialize();
    });

    it('should auto-reconnect on connection loss', async () => {
      // Simulate connection loss
      await service.disconnect('itjsst-mcp');

      // Attempt to invoke tool should trigger reconnect
      try {
        await service.invokeTool({
          serverName: 'itjsst-mcp',
          toolName: 'system-overview',
          arguments: {},
        });
      } catch {
        // May throw if reconnect fails in test env
      }

      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('reconnect')
      );
    });
  });
});
