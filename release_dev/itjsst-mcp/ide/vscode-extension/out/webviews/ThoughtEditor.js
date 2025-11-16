"use strict";
/**
 * ThoughtEditor - Advanced markdown editor with live preview
 *
 * Features:
 * - Split-pane editor (markdown left, preview right)
 * - Live preview with syntax highlighting
 * - Metadata editing (tags, importance, quality score)
 * - Auto-save with debouncing
 * - Theme support (VSCode theme integration)
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
exports.ThoughtEditor = void 0;
const vscode = __importStar(require("vscode"));
class ThoughtEditor {
    static currentPanel;
    panel;
    thought;
    databaseService;
    outputChannel;
    disposables = [];
    autoSaveTimeout;
    // Future feature: auto-save scheduling
    // private scheduleAutoSave: (data: ThoughtEditorMessage['data']) => void;
    constructor(panel, thought, databaseService, outputChannel) {
        this.panel = panel;
        this.thought = thought;
        this.databaseService = databaseService;
        this.outputChannel = outputChannel;
        // Set panel content
        this.panel.webview.html = this.getHtmlContent();
        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this), undefined, this.disposables);
        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }
    /**
     * Create or show thought editor
     */
    static async createOrShow(extensionUri, thought, databaseService, outputChannel) {
        const column = vscode.ViewColumn.One;
        // If we already have a panel, show it
        if (ThoughtEditor.currentPanel) {
            ThoughtEditor.currentPanel.panel.reveal(column);
            ThoughtEditor.currentPanel.updateThought(thought);
            return;
        }
        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel('thoughtEditor', `Edit: ${thought.stage}`, column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri],
        });
        ThoughtEditor.currentPanel = new ThoughtEditor(panel, thought, databaseService, outputChannel);
    }
    /**
     * Update thought content in editor
     */
    updateThought(thought) {
        void this.panel.webview.postMessage({
            type: 'update',
            data: {
                content: thought.content,
                metadata: thought.metadata,
                stage: thought.stage,
                qualityScore: thought.qualityScore,
            },
        });
    }
    /**
     * Handle messages from webview
     */
    async handleMessage(message) {
        switch (message.type) {
            case 'save':
                await this.handleSave(message.data);
                break;
            case 'cancel':
                this.panel.dispose();
                break;
            case 'preview-ready':
                this.outputChannel.appendLine('[ThoughtEditor] Preview rendered');
                break;
            case 'error':
                void vscode.window.showErrorMessage(`Editor error: ${JSON.stringify(message.data)}`);
                break;
        }
    }
    /**
     * Handle save operation
     */
    async handleSave(data) {
        if (!data?.content) {
            void vscode.window.showErrorMessage('Cannot save: no content provided');
            return;
        }
        try {
            // Clear existing auto-save timeout
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = undefined;
            }
            // Update thought in database
            await this.databaseService.updateThought(this.thought.thoughtId, {
                content: data.content,
                metadata: data.metadata,
            });
            void vscode.window.showInformationMessage('Thought saved successfully');
            this.outputChannel.appendLine(`[ThoughtEditor] Saved thought: ${this.thought.thoughtId}`);
            // Trigger refresh of tree view
            void vscode.commands.executeCommand('structuralThinking.refresh');
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to save thought: ${String(error)}`);
            this.outputChannel.appendLine(`[ThoughtEditor] Save error: ${String(error)}`);
        }
    }
    /**
     * Schedule auto-save (debounced)
     * Note: This method is available but auto-save is handled client-side in the webview
     */
    // @ts-expect-error Kept for future server-side auto-save implementation
    scheduleAutoSave(data) {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.autoSaveTimeout = setTimeout(() => {
            void this.handleSave(data);
        }, 2000); // 2 second debounce
    }
    /**
     * Generate HTML content for webview
     */
    getHtmlContent() {
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';
    script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
    style-src ${this.panel.webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net;
    font-src ${this.panel.webview.cspSource};
    img-src ${this.panel.webview.cspSource} https: data:;">
  <title>Thought Editor</title>

  <!-- Marked.js for Markdown parsing -->
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>

  <!-- Highlight.js for syntax highlighting -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css">
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>

  <style>
    :root {
      --editor-bg: var(--vscode-editor-background);
      --editor-fg: var(--vscode-editor-foreground);
      --border-color: var(--vscode-panel-border);
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --button-hover-bg: var(--vscode-button-hoverBackground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      background: var(--editor-bg);
      color: var(--editor-fg);
      height: 100vh;
      overflow: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--editor-bg);
    }

    .toolbar-left {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .toolbar-right {
      display: flex;
      gap: 8px;
    }

    .stage-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      background: var(--button-bg);
      color: var(--button-fg);
      font-size: 0.85em;
      font-weight: 500;
    }

    button {
      padding: 6px 16px;
      border: none;
      border-radius: 4px;
      background: var(--button-bg);
      color: var(--button-fg);
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      transition: background 0.2s;
    }

    button:hover {
      background: var(--button-hover-bg);
    }

    button.secondary {
      background: transparent;
      border: 1px solid var(--border-color);
    }

    .split-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .editor-pane,
    .preview-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .editor-pane {
      border-right: 1px solid var(--border-color);
    }

    .pane-header {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.9em;
      font-weight: 600;
      opacity: 0.8;
    }

    #markdown-input {
      flex: 1;
      padding: 16px;
      border: none;
      background: var(--editor-bg);
      color: var(--editor-fg);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.6;
      resize: none;
      outline: none;
    }

    #preview {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      line-height: 1.6;
    }

    #preview h1 {
      font-size: 2em;
      margin: 0.67em 0;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.3em;
    }

    #preview h2 {
      font-size: 1.5em;
      margin: 0.75em 0 0.5em;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.2em;
    }

    #preview h3 {
      font-size: 1.25em;
      margin: 0.5em 0;
    }

    #preview p {
      margin: 0.5em 0;
    }

    #preview code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }

    #preview pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1em 0;
    }

    #preview pre code {
      background: transparent;
      padding: 0;
    }

    #preview ul, #preview ol {
      margin: 0.5em 0;
      padding-left: 2em;
    }

    #preview blockquote {
      border-left: 4px solid var(--border-color);
      padding-left: 1em;
      margin: 0.5em 0;
      opacity: 0.8;
    }

    #preview table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }

    #preview th,
    #preview td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }

    #preview th {
      background: var(--vscode-editor-background);
      font-weight: 600;
    }

    .metadata-editor {
      padding: 12px 16px;
      border-top: 1px solid var(--border-color);
      background: var(--vscode-sideBar-background);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: center;
    }

    .metadata-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metadata-field label {
      font-size: 0.85em;
      opacity: 0.8;
    }

    .metadata-field input,
    .metadata-field select {
      padding: 6px 8px;
      border: 1px solid var(--input-border);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--input-fg);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }

    .metadata-field input[type="range"] {
      width: 150px;
    }

    .quality-display {
      display: inline-block;
      min-width: 40px;
      text-align: center;
      font-weight: 600;
    }

    .tags-input {
      min-width: 200px;
    }

    /* Loading state */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="stage-badge" id="stage-badge">${this.thought.stage}</span>
        <span id="save-status"></span>
      </div>
      <div class="toolbar-right">
        <button class="secondary" onclick="handleCancel()">Cancel</button>
        <button onclick="handleSave()">Save</button>
      </div>
    </div>

    <div class="split-container">
      <div class="editor-pane">
        <div class="pane-header">Markdown Editor</div>
        <textarea id="markdown-input" placeholder="Enter your thought content...">${this.thought.content}</textarea>
        <div class="metadata-editor">
          <div class="metadata-field">
            <label>Quality Score</label>
            <div>
              <input type="range" min="0" max="100" value="${this.thought.qualityScore ?? 50}" id="quality-score" />
              <span class="quality-display" id="quality-display">${this.thought.qualityScore ?? 50}</span>
            </div>
          </div>
          <div class="metadata-field">
            <label>Importance</label>
            <select id="importance">
              <option value="low" ${this.thought.metadata?.importance === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${this.thought.metadata?.importance === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${this.thought.metadata?.importance === 'high' ? 'selected' : ''}>High</option>
              <option value="critical" ${this.thought.metadata?.importance === 'critical'
            ? 'selected'
            : ''}>Critical</option>
            </select>
          </div>
          <div class="metadata-field">
            <label>Tags (comma-separated)</label>
            <input type="text" class="tags-input" id="tags" value="${this.thought.metadata?.tags?.join(', ') ?? ''}" placeholder="e.g., architecture, performance" />
          </div>
        </div>
      </div>

      <div class="preview-pane">
        <div class="pane-header">Live Preview</div>
        <div id="preview" class="loading">Rendering preview...</div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const markdownInput = document.getElementById('markdown-input');
    const preview = document.getElementById('preview');
    const qualityScore = document.getElementById('quality-score');
    const qualityDisplay = document.getElementById('quality-display');
    const tagsInput = document.getElementById('tags');
    const importanceSelect = document.getElementById('importance');
    const saveStatus = document.getElementById('save-status');

    let autoSaveTimeout;

    // Configure marked.js
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: true,
      mangle: false,
    });

    // Initial preview render
    updatePreview();

    // Live preview on input
    markdownInput.addEventListener('input', () => {
      updatePreview();
      scheduleAutoSave();
    });

    // Quality score slider
    qualityScore.addEventListener('input', (e) => {
      qualityDisplay.textContent = e.target.value;
      scheduleAutoSave();
    });

    // Metadata changes
    tagsInput.addEventListener('input', scheduleAutoSave);
    importanceSelect.addEventListener('change', scheduleAutoSave);

    function updatePreview() {
      const markdown = markdownInput.value;
      if (!markdown.trim()) {
        preview.innerHTML = '<div class="loading">Start typing to see preview...</div>';
        return;
      }

      try {
        const html = marked.parse(markdown);
        preview.innerHTML = html;

        // Apply syntax highlighting to code blocks
        preview.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });

        vscode.postMessage({ type: 'preview-ready' });
      } catch (error) {
        preview.innerHTML = '<div class="loading">Error rendering preview</div>';
        vscode.postMessage({ type: 'error', data: { message: error.message } });
      }
    }

    function scheduleAutoSave() {
      clearTimeout(autoSaveTimeout);
      saveStatus.textContent = 'Unsaved changes';

      autoSaveTimeout = setTimeout(() => {
        handleSave(true);
      }, 2000);
    }

    function handleSave(isAutoSave = false) {
      const content = markdownInput.value;
      const tags = tagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const metadata = {
        qualityScore: parseInt(qualityScore.value, 10),
        importance: importanceSelect.value,
        tags: tags.length > 0 ? tags : undefined,
      };

      vscode.postMessage({
        type: 'save',
        data: { content, metadata }
      });

      if (!isAutoSave) {
        saveStatus.textContent = 'Saved!';
        setTimeout(() => {
          saveStatus.textContent = '';
        }, 2000);
      }
    }

    function handleCancel() {
      if (markdownInput.value !== ${JSON.stringify(this.thought.content)}) {
        if (confirm('You have unsaved changes. Are you sure you want to close?')) {
          vscode.postMessage({ type: 'cancel' });
        }
      } else {
        vscode.postMessage({ type: 'cancel' });
      }
    }

    // Keyboard shortcuts
    markdownInput.addEventListener('keydown', (e) => {
      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl+Enter / Cmd+Enter to save and close
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
        setTimeout(() => {
          vscode.postMessage({ type: 'cancel' });
        }, 500);
      }
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'update':
          markdownInput.value = message.data.content;
          qualityScore.value = message.data.qualityScore ?? 50;
          qualityDisplay.textContent = message.data.qualityScore ?? 50;
          if (message.data.metadata?.tags) {
            tagsInput.value = message.data.metadata.tags.join(', ');
          }
          if (message.data.metadata?.importance) {
            importanceSelect.value = message.data.metadata.importance;
          }
          updatePreview();
          break;
      }
    });
  </script>
</body>
</html>`;
    }
    /**
     * Generate random nonce for CSP
     */
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    /**
     * Dispose resources
     */
    dispose() {
        ThoughtEditor.currentPanel = undefined;
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.panel.dispose();
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }
}
exports.ThoughtEditor = ThoughtEditor;
//# sourceMappingURL=ThoughtEditor.js.map