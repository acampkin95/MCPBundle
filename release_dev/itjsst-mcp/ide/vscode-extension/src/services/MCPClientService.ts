/**
 * MCPClientService - MCP protocol client for stdio and SSH transports
 */

import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { NodeSSH } from 'node-ssh';
import { CredentialService } from './CredentialService';
import {
  MCPConfig,
  MCPServerConfig,
  MCPToolResult,
  MCPConnectionError,
  MCPContent,
} from '../types';

export interface MCPToolInvocation {
  readonly serverName: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
}

export interface MCPServer {
  readonly config: MCPServerConfig;
  readonly client: Client;
  readonly transport: StdioClientTransport;
  readonly connected: boolean;
  readonly tools: readonly string[];
}

export class MCPClientService {
  private readonly config: MCPConfig;
  private readonly credentialService: CredentialService;
  private readonly logger: vscode.OutputChannel;
  private readonly servers = new Map<string, MCPServer>();
  private ssh?: NodeSSH;

  constructor(
    config: MCPConfig,
    credentialService: CredentialService,
    logger: vscode.OutputChannel
  ) {
    this.config = config;
    this.credentialService = credentialService;
    this.logger = logger;
  }

  /**
   * Initialize MCP connections
   */
  public async initialize(): Promise<void> {
    const enabledServers = this.config.servers.filter((s) => s.enabled);

    if (enabledServers.length === 0) {
      this.logger.appendLine('[MCPClientService] No MCP servers enabled');
      return;
    }

    // Initialize SSH connection if remote mode
    if (this.config.remoteMode && this.config.ssh) {
      await this.initializeSSH();
    }

    // Connect to each enabled server
    for (const serverConfig of enabledServers) {
      try {
        await this.connectServer(serverConfig);
      } catch (error) {
        this.logger.appendLine(
          `[MCPClientService] Failed to connect to ${serverConfig.name}: ${String(error)}`
        );
        // Continue with other servers
      }
    }

    this.logger.appendLine(
      `[MCPClientService] Initialized ${this.servers.size}/${enabledServers.length} servers`
    );
  }

  /**
   * Initialize SSH connection for remote MCP servers
   */
  private async initializeSSH(): Promise<void> {
    if (!this.config.ssh) {
      throw new MCPConnectionError(
        'SSH configuration missing',
        'ssh',
        undefined
      );
    }

    const sshConfig = this.config.ssh;

    // Get SSH credentials
    const { username, password } = await this.credentialService.getSSHCredentials(
      sshConfig.host
    );

    this.ssh = new NodeSSH();

    const connectionConfig: {
      host: string;
      port?: number;
      username: string;
      password?: string;
      privateKeyPath?: string;
    } = {
      host: sshConfig.host,
      port: sshConfig.port ?? 22,
      username,
    };

    // Use password or private key
    if (password) {
      connectionConfig.password = password;
    } else if (sshConfig.privateKeyPath) {
      connectionConfig.privateKeyPath = sshConfig.privateKeyPath;
    }

    await this.ssh.connect(connectionConfig);

    this.logger.appendLine(
      `[MCPClientService] SSH connected to ${sshConfig.host}:${connectionConfig.port}`
    );
  }

  /**
   * Connect to individual MCP server
   */
  private async connectServer(config: MCPServerConfig): Promise<void> {
    let transport: StdioClientTransport;

    if (this.config.remoteMode && config.remotePath) {
      // Remote execution via SSH
      if (!this.ssh) {
        throw new MCPConnectionError(
          'SSH not initialized',
          config.name,
          undefined
        );
      }

      transport = new StdioClientTransport({
        command: 'ssh',
        args: [
          `${this.config.ssh?.username}@${this.config.ssh?.host}`,
          'node',
          config.remotePath,
        ],
      });
    } else if (config.command) {
      // Local execution
      const args = config.args ?? [];
      transport = new StdioClientTransport({
        command: config.command,
        args: Array.from(args),
      });
    } else {
      throw new MCPConnectionError(
        'No command or remotePath specified',
        config.name,
        undefined
      );
    }

    const client = new Client(
      {
        name: 'vscode-structural-thinking',
        version: '0.1.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // Get available tools
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools.map((t) => t.name);

    this.servers.set(config.name, {
      config,
      client,
      transport,
      connected: true,
      tools,
    });

    this.logger.appendLine(
      `[MCPClientService] Connected to ${config.displayName} (${tools.length} tools)`
    );
  }

  /**
   * Invoke MCP tool
   */
  public async invokeTool<T = unknown>(
    invocation: MCPToolInvocation
  ): Promise<MCPToolResult<T>> {
    const server = this.servers.get(invocation.serverName);

    if (!server) {
      throw new MCPConnectionError(
        `Server not found: ${invocation.serverName}`,
        invocation.serverName,
        undefined
      );
    }

    if (!server.connected) {
      throw new MCPConnectionError(
        `Server not connected: ${invocation.serverName}`,
        invocation.serverName,
        undefined
      );
    }

    if (!server.tools.includes(invocation.toolName)) {
      throw new MCPConnectionError(
        `Tool not found: ${invocation.toolName}`,
        invocation.serverName,
        undefined
      );
    }

    try {
      const response = await server.client.callTool({
        name: invocation.toolName,
        arguments: invocation.arguments,
      });

      type ContentItem = {
        type?: string;
        text?: string;
        data?: string;
        mimeType?: string;
        resource?: { uri?: string };
      };

      const content: MCPContent[] = (response.content as unknown[]).map((c: unknown) => {
        const item = c as ContentItem;
        if (item.type === 'text') {
          return { type: 'text', text: item.text };
        }
        if (item.type === 'image') {
          return {
            type: 'image',
            data: item.data,
            mimeType: item.mimeType,
          };
        }
        if (item.type === 'resource') {
          return {
            type: 'resource',
            text: item.resource?.uri,
          };
        }
        return { type: 'text', text: JSON.stringify(item) };
      });

      // Try to parse structured content from text response
      let structuredContent: T | undefined;
      const textContent = content.find((c) => c.type === 'text' && c.text);

      if (textContent?.text) {
        try {
          structuredContent = JSON.parse(textContent.text) as T;
        } catch {
          // Not JSON, use text as-is
          structuredContent = textContent.text as unknown as T;
        }
      }

      this.logger.appendLine(
        `[MCPClientService] Tool ${invocation.toolName} invoked on ${invocation.serverName}`
      );

      return {
        content,
        structuredContent,
        isError: (response.isError as boolean | undefined) ?? false,
      };
    } catch (error) {
      this.logger.appendLine(
        `[MCPClientService] Tool invocation failed: ${String(error)}`
      );

      throw new MCPConnectionError(
        `Tool invocation failed: ${invocation.toolName}`,
        invocation.serverName,
        error
      );
    }
  }

  /**
   * Get available tools for a server
   */
  public getTools(serverName: string): readonly string[] {
    const server = this.servers.get(serverName);
    return server?.tools ?? [];
  }

  /**
   * Get all connected servers
   */
  public getServers(): readonly MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Check if server is connected
   */
  public isServerConnected(serverName: string): boolean {
    const server = this.servers.get(serverName);
    return server?.connected ?? false;
  }

  /**
   * Reconnect to a server
   */
  public async reconnectServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);

    if (!server) {
      throw new MCPConnectionError(
        `Server not found: ${serverName}`,
        serverName,
        undefined
      );
    }

    // Disconnect existing connection
    await this.disconnectServer(serverName);

    // Reconnect
    await this.connectServer(server.config);

    this.logger.appendLine(`[MCPClientService] Reconnected to ${serverName}`);
  }

  /**
   * Disconnect from server
   */
  private async disconnectServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);

    if (!server) {
      return;
    }

    try {
      await server.client.close();
    } catch (error) {
      this.logger.appendLine(
        `[MCPClientService] Error disconnecting ${serverName}: ${String(error)}`
      );
    }

    this.servers.delete(serverName);
  }

  /**
   * Dispose all connections
   */
  public async dispose(): Promise<void> {
    for (const serverName of this.servers.keys()) {
      await this.disconnectServer(serverName);
    }

    if (this.ssh) {
      this.ssh.dispose();
      this.logger.appendLine('[MCPClientService] SSH connection closed');
    }

    this.logger.appendLine('[MCPClientService] All connections closed');
  }

  /**
   * Health check for all servers
   */
  public async healthCheck(): Promise<Map<string, boolean>> {
    const health = new Map<string, boolean>();

    for (const [name, server] of this.servers) {
      try {
        // Try to list tools as a health check
        await server.client.listTools();
        health.set(name, true);
      } catch {
        health.set(name, false);
      }
    }

    return health;
  }
}
