/**
 * ResearchPanel - Webview panel for Perplexity deep research
 * Provides rich UI for research queries with markdown rendering
 */

import * as vscode from 'vscode';
import { ResearchService, ResearchMode } from '../services/ResearchService';

export class ResearchPanel {
  public static currentPanel: ResearchPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly researchService: ResearchService;
  private readonly logger: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];

  private sessionId?: string;
  private isResearching = false;

  public static createOrShow(
    extensionUri: vscode.Uri,
    researchService: ResearchService,
    logger: vscode.OutputChannel,
    sessionId?: string
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (ResearchPanel.currentPanel) {
      ResearchPanel.currentPanel.panel.reveal(column);
      ResearchPanel.currentPanel.sessionId = sessionId;
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'perplexityResearch',
      'Perplexity Deep Research',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ResearchPanel.currentPanel = new ResearchPanel(
      panel,
      researchService,
      logger,
      sessionId
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    researchService: ResearchService,
    logger: vscode.OutputChannel,
    sessionId?: string
  ) {
    this.panel = panel;
    this.researchService = researchService;
    this.logger = logger;
    this.sessionId = sessionId;

    // Set initial HTML
    this.update();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleMessage(message);
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public dispose(): void {
    ResearchPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: {
    type: string;
    query?: string;
    mode?: ResearchMode;
    queryId?: string;
  }): Promise<void> {
    switch (message.type) {
      case 'research':
        await this.performResearch(message.query ?? '', message.mode ?? 'quick');
        break;

      case 'extractContext':
        await this.sendEditorContext();
        break;

      case 'clearCache':
        this.researchService.clearCache();
        void this.panel.webview.postMessage({
          type: 'cacheCleared',
        });
        break;

      case 'addFavorite':
        if (message.queryId) {
          this.researchService.addFavorite(message.queryId);
        }
        break;

      case 'removeFavorite':
        if (message.queryId) {
          this.researchService.removeFavorite(message.queryId);
        }
        break;

      case 'loadHistory':
        await this.sendHistory();
        break;

      case 'loadFavorites':
        await this.sendFavorites();
        break;

      default:
        this.logger.appendLine(`[ResearchPanel] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Perform research query
   */
  private async performResearch(query: string, mode: ResearchMode): Promise<void> {
    if (!query || this.isResearching) {
      return;
    }

    this.isResearching = true;

    // Send progress indicator
    void this.panel.webview.postMessage({
      type: 'researchStarted',
      query,
      mode,
    });

    try {
      const result = await this.researchService.research(query, {
        mode,
        sessionId: this.sessionId,
        saveToSession: !!this.sessionId,
      });

      // Send result to webview
      void this.panel.webview.postMessage({
        type: 'researchCompleted',
        result: {
          queryId: result.queryId,
          query,
          mode,
          response: result.response,
          sources: result.sources ?? [],
          cached: result.cached,
          timestamp: result.timestamp.toISOString(),
        },
      });
    } catch (error) {
      void this.panel.webview.postMessage({
        type: 'researchFailed',
        error: String(error),
      });
    } finally {
      this.isResearching = false;
    }
  }

  /**
   * Send editor context to webview
   */
  private async sendEditorContext(): Promise<void> {
    const context = this.researchService.extractEditorContext();
    void this.panel.webview.postMessage({
      type: 'contextExtracted',
      context: context ?? '',
    });
  }

  /**
   * Send query history to webview
   */
  private async sendHistory(): Promise<void> {
    const history = this.researchService.getHistory();
    void this.panel.webview.postMessage({
      type: 'historyLoaded',
      history,
    });
  }

  /**
   * Send favorites to webview
   */
  private async sendFavorites(): Promise<void> {
    const favorites = this.researchService.getFavorites();
    void this.panel.webview.postMessage({
      type: 'favoritesLoaded',
      favorites,
    });
  }

  /**
   * Update webview content
   */
  private update(): void {
    this.panel.webview.html = this.getHtmlContent();
  }

  /**
   * Generate HTML content for webview
   */
  private getHtmlContent(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Perplexity Deep Research</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    .container {
      display: flex;
      height: 100vh;
      flex-direction: column;
    }

    .header {
      padding: 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .search-input {
      flex: 1;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: 14px;
    }

    .search-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .btn {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--vscode-font-family);
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .mode-selector {
      display: flex;
      gap: 8px;
    }

    .mode-btn {
      padding: 6px 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .mode-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .sidebar {
      width: 200px;
      background: var(--vscode-sideBar-background);
      border-right: 1px solid var(--vscode-panel-border);
      overflow-y: auto;
      padding: 12px;
    }

    .sidebar-section {
      margin-bottom: 16px;
    }

    .sidebar-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .history-item {
      padding: 6px 8px;
      margin-bottom: 4px;
      background: var(--vscode-list-hoverBackground);
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-item:hover {
      background: var(--vscode-list-activeSelectionBackground);
    }

    .main {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .result-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .result-query {
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .result-meta {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .result-content {
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .sources {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .sources-title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .source-link {
      display: block;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      margin-bottom: 4px;
    }

    .source-link:hover {
      color: var(--vscode-textLink-activeForeground);
      text-decoration: underline;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }

    .spinner {
      border: 3px solid var(--vscode-panel-border);
      border-top: 3px solid var(--vscode-button-background);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-quick {
      background: var(--vscode-terminal-ansiGreen);
      color: var(--vscode-editor-background);
    }

    .badge-deep {
      background: var(--vscode-terminal-ansiBlue);
      color: var(--vscode-editor-background);
    }

    .badge-bi {
      background: var(--vscode-terminal-ansiMagenta);
      color: var(--vscode-editor-background);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="search-bar">
        <input type="text" id="queryInput" class="search-input" placeholder="Enter research query...">
        <button id="searchBtn" class="btn">Research</button>
        <button id="contextBtn" class="btn btn-secondary">Use Editor Context</button>
      </div>
      <div class="mode-selector">
        <button class="mode-btn active" data-mode="quick">Quick</button>
        <button class="mode-btn" data-mode="deep">Deep</button>
        <button class="mode-btn" data-mode="bi">Business Intel</button>
      </div>
    </div>
    <div class="content">
      <div class="sidebar">
        <div class="sidebar-section">
          <div class="sidebar-title">History</div>
          <div id="historyList"></div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-title">Favorites</div>
          <div id="favoritesList"></div>
        </div>
      </div>
      <div class="main">
        <div id="results">
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div>Enter a research query to get started</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentMode = 'quick';
    let results = [];

    // DOM elements
    const queryInput = document.getElementById('queryInput');
    const searchBtn = document.getElementById('searchBtn');
    const contextBtn = document.getElementById('contextBtn');
    const resultsDiv = document.getElementById('results');
    const modeBtns = document.querySelectorAll('.mode-btn');

    // Mode selection
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
      });
    });

    // Search
    searchBtn.addEventListener('click', () => {
      const query = queryInput.value.trim();
      if (query) {
        performSearch(query);
      }
    });

    queryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = queryInput.value.trim();
        if (query) {
          performSearch(query);
        }
      }
    });

    // Extract context
    contextBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'extractContext' });
    });

    function performSearch(query) {
      vscode.postMessage({
        type: 'research',
        query,
        mode: currentMode
      });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'researchStarted':
          showLoading(message.query);
          searchBtn.disabled = true;
          break;

        case 'researchCompleted':
          addResult(message.result);
          searchBtn.disabled = false;
          break;

        case 'researchFailed':
          showError(message.error);
          searchBtn.disabled = false;
          break;

        case 'contextExtracted':
          queryInput.value = message.context;
          break;

        case 'historyLoaded':
          updateHistory(message.history);
          break;

        case 'favoritesLoaded':
          updateFavorites(message.favorites);
          break;
      }
    });

    function showLoading(query) {
      resultsDiv.innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          <div>Researching: \${escapeHtml(query)}</div>
        </div>
      \`;
    }

    function addResult(result) {
      const modeClass = \`badge-\${result.mode}\`;
      const sourcesHtml = result.sources.length > 0 ? \`
        <div class="sources">
          <div class="sources-title">Sources</div>
          \${result.sources.map(s => \`<a href="\${s}" class="source-link" target="_blank">\${s}</a>\`).join('')}
        </div>
      \` : '';

      const html = \`
        <div class="result-card">
          <div class="result-header">
            <div class="result-query">\${escapeHtml(result.query)}</div>
            <div class="result-meta">
              <span class="badge \${modeClass}">\${result.mode}</span>
              <span>\${new Date(result.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
          <div class="result-content">\${escapeHtml(result.response)}</div>
          \${sourcesHtml}
        </div>
      \`;

      results.unshift(result);

      if (results.length === 1) {
        resultsDiv.innerHTML = html;
      } else {
        resultsDiv.insertAdjacentHTML('afterbegin', html);
      }
    }

    function showError(error) {
      resultsDiv.innerHTML = \`
        <div class="result-card" style="border-color: var(--vscode-errorForeground);">
          <div style="color: var(--vscode-errorForeground); font-weight: 600;">Error</div>
          <div style="margin-top: 8px;">\${escapeHtml(error)}</div>
        </div>
      \`;
    }

    function updateHistory(history) {
      const listDiv = document.getElementById('historyList');
      listDiv.innerHTML = history.map(h => \`
        <div class="history-item" onclick="queryInput.value='\${escapeHtml(h.queryText)}'">\${escapeHtml(h.queryText)}</div>
      \`).join('');
    }

    function updateFavorites(favorites) {
      const listDiv = document.getElementById('favoritesList');
      listDiv.innerHTML = favorites.map(f => \`
        <div class="history-item" onclick="queryInput.value='\${escapeHtml(f.queryText)}'">\${escapeHtml(f.queryText)}</div>
      \`).join('');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Load history and favorites on startup
    vscode.postMessage({ type: 'loadHistory' });
    vscode.postMessage({ type: 'loadFavorites' });
  </script>
</body>
</html>`;
  }

  /**
   * Generate nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
