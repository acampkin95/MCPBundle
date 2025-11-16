"use strict";
/**
 * MCPClientService - MCP protocol client for stdio and SSH transports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPClientService = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const node_ssh_1 = require("node-ssh");
const types_1 = require("../types");
class MCPClientService {
    config;
    credentialService;
    logger;
    servers = new Map();
    ssh;
    constructor(config, credentialService, logger) {
        this.config = config;
        this.credentialService = credentialService;
        this.logger = logger;
    }
    /**
     * Initialize MCP connections
     */
    async initialize() {
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
            }
            catch (error) {
                this.logger.appendLine(`[MCPClientService] Failed to connect to ${serverConfig.name}: ${String(error)}`);
                // Continue with other servers
            }
        }
        this.logger.appendLine(`[MCPClientService] Initialized ${this.servers.size}/${enabledServers.length} servers`);
    }
    /**
     * Initialize SSH connection for remote MCP servers
     */
    async initializeSSH() {
        if (!this.config.ssh) {
            throw new types_1.MCPConnectionError('SSH configuration missing', 'ssh', undefined);
        }
        const sshConfig = this.config.ssh;
        // Get SSH credentials
        const { username, password } = await this.credentialService.getSSHCredentials(sshConfig.host);
        this.ssh = new node_ssh_1.NodeSSH();
        const connectionConfig = {
            host: sshConfig.host,
            port: sshConfig.port ?? 22,
            username,
        };
        // Use password or private key
        if (password) {
            connectionConfig.password = password;
        }
        else if (sshConfig.privateKeyPath) {
            connectionConfig.privateKeyPath = sshConfig.privateKeyPath;
        }
        await this.ssh.connect(connectionConfig);
        this.logger.appendLine(`[MCPClientService] SSH connected to ${sshConfig.host}:${connectionConfig.port}`);
    }
    /**
     * Connect to individual MCP server
     */
    async connectServer(config) {
        let transport;
        if (this.config.remoteMode && config.remotePath) {
            // Remote execution via SSH
            if (!this.ssh) {
                throw new types_1.MCPConnectionError('SSH not initialized', config.name, undefined);
            }
            transport = new stdio_js_1.StdioClientTransport({
                command: 'ssh',
                args: [
                    `${this.config.ssh?.username}@${this.config.ssh?.host}`,
                    'node',
                    config.remotePath,
                ],
            });
        }
        else if (config.command) {
            // Local execution
            const args = config.args ?? [];
            transport = new stdio_js_1.StdioClientTransport({
                command: config.command,
                args: Array.from(args),
            });
        }
        else {
            throw new types_1.MCPConnectionError('No command or remotePath specified', config.name, undefined);
        }
        const client = new index_js_1.Client({
            name: 'vscode-structural-thinking',
            version: '0.1.0',
        }, {
            capabilities: {},
        });
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
        this.logger.appendLine(`[MCPClientService] Connected to ${config.displayName} (${tools.length} tools)`);
    }
    /**
     * Invoke MCP tool
     */
    async invokeTool(invocation) {
        const server = this.servers.get(invocation.serverName);
        if (!server) {
            throw new types_1.MCPConnectionError(`Server not found: ${invocation.serverName}`, invocation.serverName, undefined);
        }
        if (!server.connected) {
            throw new types_1.MCPConnectionError(`Server not connected: ${invocation.serverName}`, invocation.serverName, undefined);
        }
        if (!server.tools.includes(invocation.toolName)) {
            throw new types_1.MCPConnectionError(`Tool not found: ${invocation.toolName}`, invocation.serverName, undefined);
        }
        try {
            const response = await server.client.callTool({
                name: invocation.toolName,
                arguments: invocation.arguments,
            });
            const content = response.content.map((c) => {
                const item = c;
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
            let structuredContent;
            const textContent = content.find((c) => c.type === 'text' && c.text);
            if (textContent?.text) {
                try {
                    structuredContent = JSON.parse(textContent.text);
                }
                catch {
                    // Not JSON, use text as-is
                    structuredContent = textContent.text;
                }
            }
            this.logger.appendLine(`[MCPClientService] Tool ${invocation.toolName} invoked on ${invocation.serverName}`);
            return {
                content,
                structuredContent,
                isError: response.isError ?? false,
            };
        }
        catch (error) {
            this.logger.appendLine(`[MCPClientService] Tool invocation failed: ${String(error)}`);
            throw new types_1.MCPConnectionError(`Tool invocation failed: ${invocation.toolName}`, invocation.serverName, error);
        }
    }
    /**
     * Get available tools for a server
     */
    getTools(serverName) {
        const server = this.servers.get(serverName);
        return server?.tools ?? [];
    }
    /**
     * Get all connected servers
     */
    getServers() {
        return Array.from(this.servers.values());
    }
    /**
     * Check if server is connected
     */
    isServerConnected(serverName) {
        const server = this.servers.get(serverName);
        return server?.connected ?? false;
    }
    /**
     * Reconnect to a server
     */
    async reconnectServer(serverName) {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new types_1.MCPConnectionError(`Server not found: ${serverName}`, serverName, undefined);
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
    async disconnectServer(serverName) {
        const server = this.servers.get(serverName);
        if (!server) {
            return;
        }
        try {
            await server.client.close();
        }
        catch (error) {
            this.logger.appendLine(`[MCPClientService] Error disconnecting ${serverName}: ${String(error)}`);
        }
        this.servers.delete(serverName);
    }
    /**
     * Dispose all connections
     */
    async dispose() {
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
    async healthCheck() {
        const health = new Map();
        for (const [name, server] of this.servers) {
            try {
                // Try to list tools as a health check
                await server.client.listTools();
                health.set(name, true);
            }
            catch {
                health.set(name, false);
            }
        }
        return health;
    }
}
exports.MCPClientService = MCPClientService;
//# sourceMappingURL=MCPClientService.js.map