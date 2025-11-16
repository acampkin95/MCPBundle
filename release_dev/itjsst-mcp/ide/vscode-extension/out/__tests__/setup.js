"use strict";
/**
 * Global test setup
 * Runs before all tests to configure mocks and environment
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock VSCode API
vitest_1.vi.mock('vscode', () => ({
    window: {
        showInformationMessage: vitest_1.vi.fn(),
        showErrorMessage: vitest_1.vi.fn(),
        showWarningMessage: vitest_1.vi.fn(),
        showInputBox: vitest_1.vi.fn(),
        showQuickPick: vitest_1.vi.fn(),
        createOutputChannel: vitest_1.vi.fn(() => ({
            appendLine: vitest_1.vi.fn(),
            append: vitest_1.vi.fn(),
            clear: vitest_1.vi.fn(),
            show: vitest_1.vi.fn(),
            hide: vitest_1.vi.fn(),
            dispose: vitest_1.vi.fn(),
        })),
        createTreeView: vitest_1.vi.fn(),
        registerTreeDataProvider: vitest_1.vi.fn(),
    },
    commands: {
        registerCommand: vitest_1.vi.fn(),
        executeCommand: vitest_1.vi.fn(),
    },
    workspace: {
        getConfiguration: vitest_1.vi.fn(() => ({
            get: vitest_1.vi.fn((key) => {
                // Default configuration values
                const defaults = {
                    'structuralThinking.database.mode': 'auto',
                    'structuralThinking.database.postgresql.host': '46.250.243.123',
                    'structuralThinking.database.postgresql.port': 5432,
                    'structuralThinking.database.postgresql.database': 'mcp_ecosystem',
                    'structuralThinking.database.postgresql.poolSize': 5,
                    'structuralThinking.mcp.remoteMode': true,
                    'structuralThinking.mcp.ssh.host': '46.250.243.123',
                    'structuralThinking.mcp.ssh.username': 'root',
                    'structuralThinking.logging.level': 'info',
                };
                return defaults[key];
            }),
            update: vitest_1.vi.fn(),
            has: vitest_1.vi.fn(),
            inspect: vitest_1.vi.fn(),
        })),
        workspaceFolders: undefined,
        onDidChangeConfiguration: vitest_1.vi.fn(),
    },
    Uri: {
        file: vitest_1.vi.fn((path) => ({ fsPath: path, scheme: 'file', path })),
        parse: vitest_1.vi.fn((uri) => ({ fsPath: uri, scheme: 'file', path: uri })),
    },
    TreeItem: class TreeItem {
        label;
        collapsibleState;
        constructor(label, collapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    ThemeIcon: class ThemeIcon {
        id;
        constructor(id) {
            this.id = id;
        }
    },
    EventEmitter: class EventEmitter {
        listeners = [];
        event = (listener) => {
            this.listeners.push(listener);
            return { dispose: () => { } };
        };
        fire(data) {
            this.listeners.forEach((l) => l(data));
        }
    },
    ExtensionContext: class ExtensionContext {
        subscriptions = [];
        globalState = {
            get: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        };
        workspaceState = {
            get: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
        };
        secrets = {
            get: vitest_1.vi.fn(),
            store: vitest_1.vi.fn(),
            delete: vitest_1.vi.fn(),
        };
        extensionPath = '/mock/extension/path';
        storagePath = '/mock/storage/path';
        globalStoragePath = '/mock/global/storage/path';
        logPath = '/mock/log/path';
    },
    CancellationTokenSource: class CancellationTokenSource {
        token = { isCancellationRequested: false };
        cancel() {
            this.token.isCancellationRequested = true;
        }
        dispose() { }
    },
}));
// Configure test environment
process.env.NODE_ENV = 'test';
// Suppress console output during tests (unless VERBOSE=1)
if (!process.env.VERBOSE) {
    global.console = {
        ...console,
        log: vitest_1.vi.fn(),
        debug: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        error: console.error, // Keep errors visible
    };
}
//# sourceMappingURL=setup.js.map