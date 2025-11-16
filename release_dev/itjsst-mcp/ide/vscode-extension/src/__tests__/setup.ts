/**
 * Global test setup
 * Runs before all tests to configure mocks and environment
 */

import { vi } from 'vitest';

// Mock VSCode API
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    createTreeView: vi.fn(),
    registerTreeDataProvider: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        // Default configuration values
        const defaults: Record<string, unknown> = {
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
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    })),
    workspaceFolders: undefined,
    onDidChangeConfiguration: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file', path })),
    parse: vi.fn((uri: string) => ({ fsPath: uri, scheme: 'file', path: uri })),
  },
  TreeItem: class TreeItem {
    constructor(
      public label: string,
      public collapsibleState?: number
    ) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class ThemeIcon {
    constructor(public id: string) {}
  },
  EventEmitter: class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    public fire(data: T) {
      this.listeners.forEach((l) => l(data));
    }
  },
  ExtensionContext: class ExtensionContext {
    public subscriptions: Array<{ dispose: () => void }> = [];
    public globalState = {
      get: vi.fn(),
      update: vi.fn(),
    };
    public workspaceState = {
      get: vi.fn(),
      update: vi.fn(),
    };
    public secrets = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    };
    public extensionPath = '/mock/extension/path';
    public storagePath = '/mock/storage/path';
    public globalStoragePath = '/mock/global/storage/path';
    public logPath = '/mock/log/path';
  },
  CancellationTokenSource: class CancellationTokenSource {
    public token = { isCancellationRequested: false };
    public cancel() {
      this.token.isCancellationRequested = true;
    }
    public dispose() {}
  },
}));

// Configure test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests (unless VERBOSE=1)
if (!process.env.VERBOSE) {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: console.error, // Keep errors visible
  };
}
