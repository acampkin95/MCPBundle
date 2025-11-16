"use strict";
/**
 * Structural Thinking Manager - Main Extension Entry Point
 * Enterprise-grade VSCode extension for MCP Bundle's Structural Thinking Framework
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// Services
const CredentialService_1 = require("./services/CredentialService");
const DatabaseService_1 = require("./services/DatabaseService");
const MCPClientService_1 = require("./services/MCPClientService");
const ResearchService_1 = require("./services/ResearchService");
const ExportService_1 = require("./services/ExportService");
const SearchService_1 = require("./services/SearchService");
const OnboardingService_1 = require("./services/OnboardingService");
// Providers
const ThinkingProcessTreeProvider_1 = require("./providers/ThinkingProcessTreeProvider");
// Webviews
const ResearchPanel_1 = require("./webviews/ResearchPanel");
const ThoughtEditor_1 = require("./webviews/ThoughtEditor");
const AnalyticsDashboard_1 = require("./webviews/AnalyticsDashboard");
async function activate(context) {
    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Structural Thinking');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('[Extension] Activating Structural Thinking Manager...');
    try {
        // Load configuration
        const config = loadConfiguration();
        // Setup logging
        configureLogging(outputChannel, config.logging.level);
        // Initialize services (without connecting yet)
        const credentialService = new CredentialService_1.CredentialService(context, outputChannel);
        const databaseService = new DatabaseService_1.DatabaseService(config.database, credentialService, outputChannel);
        const mcpClientService = new MCPClientService_1.MCPClientService(config.mcp, credentialService, outputChannel);
        // Initialize Phase 2 services
        const researchService = new ResearchService_1.ResearchService(mcpClientService, databaseService, outputChannel);
        const exportService = new ExportService_1.ExportService(databaseService, outputChannel);
        const searchService = new SearchService_1.SearchService(databaseService, outputChannel);
        // Initialize onboarding service (Phase 3)
        const onboardingService = new OnboardingService_1.OnboardingService(context, outputChannel);
        // Register tree view provider
        const treeProvider = new ThinkingProcessTreeProvider_1.ThinkingProcessTreeProvider(databaseService, outputChannel, config.treeView);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('thinkingProcesses', treeProvider));
        // Register commands
        registerCommands(context, databaseService, mcpClientService, researchService, exportService, searchService, treeProvider, outputChannel);
        // Cleanup on deactivation
        context.subscriptions.push({
            dispose: async () => {
                await databaseService.dispose();
                await mcpClientService.dispose();
                treeProvider.dispose();
            },
        });
        outputChannel.appendLine('[Extension] Activated successfully (initializing connections in background...)');
        // Initialize connections in background (non-blocking)
        void initializeConnectionsInBackground(databaseService, mcpClientService, searchService, onboardingService, outputChannel);
    }
    catch (error) {
        outputChannel.appendLine(`[Extension] Activation failed: ${String(error)}`);
        void vscode.window.showErrorMessage(`Failed to activate Structural Thinking Manager: ${String(error)}`);
        throw error;
    }
}
/**
 * Initialize database and MCP connections in the background (non-blocking)
 */
async function initializeConnectionsInBackground(databaseService, mcpClientService, searchService, onboardingService, outputChannel) {
    try {
        outputChannel.appendLine('[Background] Initializing database connection...');
        // Initialize database connection (with timeout)
        const dbInitPromise = Promise.race([
            databaseService.initialize(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Database initialization timeout')), 10000))
        ]);
        await dbInitPromise;
        outputChannel.appendLine(`[Background] Database connected (${databaseService.getMode()})`);
        // Apply performance migration (PostgreSQL only)
        if (databaseService.getMode() === 'postgresql') {
            outputChannel.appendLine('[Background] Applying performance migration...');
            await databaseService.applyPerformanceMigration();
            outputChannel.appendLine('[Background] Performance migration applied');
        }
        // Initialize FTS5 for SQLite if needed
        if (databaseService.getMode() === 'sqlite') {
            outputChannel.appendLine('[Background] Initializing FTS5 search...');
            await searchService.initializeFTS5();
            outputChannel.appendLine('[Background] FTS5 search initialized');
        }
        // Initialize MCP connections (with timeout)
        outputChannel.appendLine('[Background] Initializing MCP connections...');
        const mcpInitPromise = Promise.race([
            mcpClientService.initialize(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('MCP initialization timeout')), 10000))
        ]);
        await mcpInitPromise;
        outputChannel.appendLine('[Background] MCP connections established');
        // Check and show onboarding for first-time users
        await onboardingService.checkAndShowOnboarding();
        void vscode.window.showInformationMessage('Structural Thinking Manager initialized successfully!');
    }
    catch (error) {
        outputChannel.appendLine(`[Background] Initialization error: ${String(error)}`);
        void vscode.window.showWarningMessage(`Structural Thinking Manager activated with limited functionality: ${String(error)}`);
    }
}
function deactivate() {
    // Cleanup handled by context subscriptions
}
/**
 * Load extension configuration from VSCode settings
 */
function loadConfiguration() {
    const config = vscode.workspace.getConfiguration('structuralThinking');
    // Database configuration
    const databaseMode = config.get('database.mode', 'auto');
    const pgHost = config.get('database.postgresql.host', '46.250.243.123');
    const pgPort = config.get('database.postgresql.port', 5432);
    const pgDatabase = config.get('database.postgresql.database', 'mcp_ecosystem');
    const pgPoolSize = config.get('database.postgresql.poolSize', 5);
    // MCP configuration
    const mcpRemoteMode = config.get('mcp.remoteMode', true);
    const sshHost = config.get('mcp.ssh.host', '46.250.243.123');
    const sshUsername = config.get('mcp.ssh.username', 'root');
    // Tree view configuration
    const refreshInterval = config.get('treeView.refreshInterval', 5000);
    const maxThoughtsPerSession = config.get('treeView.maxThoughtsPerSession', 100);
    // Logging configuration
    const logLevel = config.get('logging.level', 'info');
    // SQLite database path
    const sqlitePath = path.join(os.homedir(), '.vscode', 'structural-thinking', 'mcp_plan.db');
    return {
        database: {
            mode: databaseMode,
            postgresql: {
                host: pgHost,
                port: pgPort,
                database: pgDatabase,
                username: '', // Will be fetched from CredentialService
                password: '', // Will be fetched from CredentialService
                poolSize: pgPoolSize,
                connectionTimeout: 10000,
                idleTimeout: 30000,
            },
            sqlite: {
                databasePath: sqlitePath,
                enableWAL: true,
            },
        },
        mcp: {
            remoteMode: mcpRemoteMode,
            ssh: {
                host: sshHost,
                port: 22,
                username: sshUsername,
            },
            servers: [
                {
                    name: 'mcp-orchestrator',
                    displayName: 'MCP Orchestrator',
                    remotePath: '/opt/mcp/services/mcp-orchestrator/dist/index.js',
                    enabled: true,
                },
                {
                    name: 'itjsst-mcp',
                    displayName: 'IT-MCP Server',
                    remotePath: '/opt/mcp/services/itjsst-mcp/dist/index.js',
                    enabled: true,
                },
                {
                    name: 'perplexity-mcp',
                    displayName: 'Perplexity Research',
                    remotePath: '/opt/mcp/services/perplexity-mcp/dist/index.js',
                    enabled: true,
                },
            ],
        },
        treeView: {
            refreshInterval,
            maxThoughtsPerSession,
        },
        logging: {
            level: logLevel,
            outputChannel: 'Structural Thinking',
        },
    };
}
/**
 * Configure logging level
 */
function configureLogging(outputChannel, level) {
    outputChannel.appendLine(`[Extension] Log level set to: ${level}`);
}
/**
 * Register all extension commands
 */
function registerCommands(context, databaseService, mcpClientService, researchService, exportService, _searchService, treeProvider, outputChannel) {
    // Refresh tree view
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.refresh', () => {
        treeProvider.refresh();
        void vscode.window.showInformationMessage('Thinking processes refreshed');
    }));
    // Create new thinking session
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.createSession', async () => {
        try {
            const origin = await vscode.window.showInputBox({
                prompt: 'Enter session origin/description',
                placeHolder: 'e.g., Feature: User authentication',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Origin cannot be empty';
                    }
                    return null;
                },
            });
            if (!origin) {
                return;
            }
            const sessionId = (0, crypto_1.randomUUID)();
            await databaseService.createSession(sessionId, origin);
            treeProvider.refresh();
            void vscode.window.showInformationMessage(`Created thinking session: ${origin}`);
            outputChannel.appendLine(`[Commands] Created session: ${sessionId}`);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to create session: ${String(error)}`);
            outputChannel.appendLine(`[Commands] Create session error: ${String(error)}`);
        }
    }));
    // View thought details
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.viewThought', async (item) => {
        if (!item?.metadata) {
            return;
        }
        const thought = item.metadata;
        const panel = vscode.window.createWebviewPanel('thoughtDetails', `Thought: ${thought.stage}`, vscode.ViewColumn.One, {
            enableScripts: true,
        });
        panel.webview.html = getThoughtDetailsHTML(thought);
        outputChannel.appendLine(`[Commands] Viewing thought: ${thought.thoughtId}`);
    }));
    // Edit thought with advanced editor
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.editThought', async (item) => {
        if (!item?.metadata) {
            return;
        }
        try {
            await ThoughtEditor_1.ThoughtEditor.createOrShow(context.extensionUri, item.metadata, databaseService, outputChannel);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to open thought editor: ${String(error)}`);
            outputChannel.appendLine(`[Commands] Edit thought error: ${String(error)}`);
        }
    }));
    // Delete thought
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.deleteThought', async (item) => {
        if (!item?.metadata) {
            return;
        }
        const thought = item.metadata;
        const confirmed = await vscode.window.showWarningMessage(`Delete this thought? This action cannot be undone.`, { modal: true }, 'Delete');
        if (confirmed !== 'Delete') {
            return;
        }
        try {
            await databaseService.deleteThought(thought.thoughtId);
            treeProvider.refresh();
            void vscode.window.showInformationMessage('Thought deleted');
            outputChannel.appendLine(`[Commands] Deleted thought: ${thought.thoughtId}`);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to delete thought: ${String(error)}`);
        }
    }));
    // Export session
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.exportSession', async (item) => {
        try {
            // Get session ID from tree item or prompt user
            let sessionId = item?.metadata?.sessionId;
            if (!sessionId) {
                const sessions = await databaseService.getSessions(50);
                if (sessions.length === 0) {
                    void vscode.window.showInformationMessage('No sessions available to export');
                    return;
                }
                const selected = await vscode.window.showQuickPick(sessions.map((s) => ({
                    label: s.origin,
                    description: `${s.thoughtCount} thoughts`,
                    detail: `Created: ${s.createdAt.toLocaleString()}`,
                    sessionId: s.sessionId,
                })), { placeHolder: 'Select session to export' });
                if (!selected) {
                    return;
                }
                sessionId = selected.sessionId;
            }
            // Prompt for export format
            const format = await vscode.window.showQuickPick([
                { label: 'JSON', description: 'Machine-readable format', value: 'json' },
                { label: 'Markdown', description: 'Human-readable format', value: 'markdown' },
            ], { placeHolder: 'Select export format' });
            if (!format) {
                return;
            }
            // Export and save
            const result = await exportService.exportSession(sessionId, {
                format: format.value,
                includeMetadata: true,
                includeTimestamps: true,
                groupByStage: true,
                prettify: true,
            });
            await exportService.saveExport(result);
            outputChannel.appendLine(`[Commands] Exported session: ${sessionId}`);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Export failed: ${String(error)}`);
            outputChannel.appendLine(`[Commands] Export error: ${String(error)}`);
        }
    }));
    // Open MCP health dashboard
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.openDashboard', async () => {
        const servers = mcpClientService.getServers();
        const panel = vscode.window.createWebviewPanel('mcpDashboard', 'MCP Health Dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
        });
        panel.webview.html = getHealthDashboardHTML(servers, databaseService);
        outputChannel.appendLine('[Commands] Opened health dashboard');
    }));
    // Perplexity research
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.perplexityResearch', async (item) => {
        try {
            const sessionId = item?.metadata?.sessionId;
            ResearchPanel_1.ResearchPanel.createOrShow(context.extensionUri, researchService, outputChannel, sessionId);
            outputChannel.appendLine('[Commands] Opened research panel');
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to open research panel: ${String(error)}`);
            outputChannel.appendLine(`[Commands] Research panel error: ${String(error)}`);
        }
    }));
    // Open analytics dashboard
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.showAnalytics', async () => {
        try {
            await AnalyticsDashboard_1.AnalyticsDashboard.createOrShow(context.extensionUri, databaseService, outputChannel);
            outputChannel.appendLine('[Commands] Opened analytics dashboard');
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to open analytics dashboard: ${String(error)}`);
            outputChannel.appendLine(`[Commands] Analytics dashboard error: ${String(error)}`);
        }
    }));
    // Configure databases
    context.subscriptions.push(vscode.commands.registerCommand('structuralThinking.configureDatabases', async () => {
        void vscode.window.showInformationMessage('Database configuration coming soon');
    }));
}
/**
 * Generate HTML for thought details webview
 */
function getThoughtDetailsHTML(thought) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thought Details</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      color: var(--vscode-foreground);
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .metadata {
      background: var(--vscode-editor-background);
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .metadata-item {
      margin: 8px 0;
    }
    .content {
      margin: 20px 0;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      padding: 15px;
      border-radius: 5px;
    }
    .stage {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 0.85em;
    }
  </style>
</head>
<body>
  <h1>Thought Details</h1>

  <div class="metadata">
    <div class="metadata-item">
      <strong>ID:</strong> ${thought.thoughtId}
    </div>
    <div class="metadata-item">
      <strong>Stage:</strong> <span class="stage">${thought.stage}</span>
    </div>
    ${thought.qualityScore
        ? `<div class="metadata-item">
      <strong>Quality Score:</strong> ${thought.qualityScore}/100
    </div>`
        : ''}
    ${thought.metadata?.importance
        ? `<div class="metadata-item">
      <strong>Importance:</strong> ${thought.metadata.importance}
    </div>`
        : ''}
    ${thought.metadata?.tags?.length
        ? `<div class="metadata-item">
      <strong>Tags:</strong> ${thought.metadata.tags.join(', ')}
    </div>`
        : ''}
    <div class="metadata-item">
      <strong>Created:</strong> ${thought.createdAt.toLocaleString()}
    </div>
  </div>

  <h2>Content</h2>
  <div class="content">${escapeHtml(thought.content)}</div>
</body>
</html>
  `.trim();
}
/**
 * Generate HTML for health dashboard
 */
function getHealthDashboardHTML(servers, databaseService) {
    const serverRows = servers
        .map((s) => `
    <tr>
      <td>${s.config.displayName}</td>
      <td class="${s.connected ? 'healthy' : 'unhealthy'}">
        ${s.connected ? '✓ Connected' : '✗ Disconnected'}
      </td>
    </tr>
  `)
        .join('');
    const dbMode = databaseService.getMode();
    const dbHealthy = databaseService.isHealthy();
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Health Dashboard</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
    }
    h1 {
      color: var(--vscode-foreground);
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    th {
      background: var(--vscode-editor-background);
    }
    .healthy {
      color: var(--vscode-terminal-ansiGreen);
    }
    .unhealthy {
      color: var(--vscode-terminal-ansiRed);
    }
  </style>
</head>
<body>
  <h1>MCP Ecosystem Health</h1>

  <h2>Database</h2>
  <table>
    <tr>
      <th>Component</th>
      <th>Status</th>
    </tr>
    <tr>
      <td>Mode</td>
      <td class="${dbHealthy ? 'healthy' : 'unhealthy'}">${dbMode.toUpperCase()}</td>
    </tr>
    <tr>
      <td>Connection</td>
      <td class="${dbHealthy ? 'healthy' : 'unhealthy'}">
        ${dbHealthy ? '✓ Healthy' : '✗ Unhealthy'}
      </td>
    </tr>
  </table>

  <h2>MCP Servers</h2>
  <table>
    <tr>
      <th>Server</th>
      <th>Status</th>
    </tr>
    ${serverRows}
  </table>
</body>
</html>
  `.trim();
}
/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
}
//# sourceMappingURL=extension.js.map