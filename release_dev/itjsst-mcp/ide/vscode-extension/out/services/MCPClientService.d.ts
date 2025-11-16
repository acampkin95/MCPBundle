/**
 * MCPClientService - MCP protocol client for stdio and SSH transports
 */
import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CredentialService } from './CredentialService';
import { MCPConfig, MCPServerConfig, MCPToolResult } from '../types';
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
export declare class MCPClientService {
    private readonly config;
    private readonly credentialService;
    private readonly logger;
    private readonly servers;
    private ssh?;
    constructor(config: MCPConfig, credentialService: CredentialService, logger: vscode.OutputChannel);
    /**
     * Initialize MCP connections
     */
    initialize(): Promise<void>;
    /**
     * Initialize SSH connection for remote MCP servers
     */
    private initializeSSH;
    /**
     * Connect to individual MCP server
     */
    private connectServer;
    /**
     * Invoke MCP tool
     */
    invokeTool<T = unknown>(invocation: MCPToolInvocation): Promise<MCPToolResult<T>>;
    /**
     * Get available tools for a server
     */
    getTools(serverName: string): readonly string[];
    /**
     * Get all connected servers
     */
    getServers(): readonly MCPServer[];
    /**
     * Check if server is connected
     */
    isServerConnected(serverName: string): boolean;
    /**
     * Reconnect to a server
     */
    reconnectServer(serverName: string): Promise<void>;
    /**
     * Disconnect from server
     */
    private disconnectServer;
    /**
     * Dispose all connections
     */
    dispose(): Promise<void>;
    /**
     * Health check for all servers
     */
    healthCheck(): Promise<Map<string, boolean>>;
}
//# sourceMappingURL=MCPClientService.d.ts.map