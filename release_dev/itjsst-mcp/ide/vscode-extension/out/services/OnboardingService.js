"use strict";
/**
 * OnboardingService - First-time user experience and interactive walkthrough
 *
 * Features:
 * - Welcome message on first activation
 * - Interactive step-by-step tour
 * - Feature highlights with contextual help
 * - Quick start guide
 * - Don't show again option with persistent state
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
exports.OnboardingService = void 0;
const vscode = __importStar(require("vscode"));
class OnboardingService {
    context;
    outputChannel;
    // Future feature: track multi-step tour progress
    // private currentTourStep = 0;
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    /**
     * Check if user should see onboarding
     */
    async checkAndShowOnboarding() {
        const state = this.getOnboardingState();
        if (state.completed || state.dismissed) {
            return;
        }
        await this.showWelcome();
    }
    /**
     * Show welcome message with tour options
     */
    async showWelcome() {
        const choice = await vscode.window.showInformationMessage('Welcome to Structural Thinking Manager! Would you like a quick tour?', { modal: false }, 'Start Tour', 'Quick Start Guide', 'Skip', "Don't Show Again");
        switch (choice) {
            case 'Start Tour':
                await this.startInteractiveTour();
                break;
            case 'Quick Start Guide':
                await this.showQuickStartGuide();
                break;
            case "Don't Show Again":
                this.setOnboardingState({ completed: false, currentStep: 0, dismissed: true });
                break;
            case 'Skip':
            default:
                // Do nothing, show again next time
                break;
        }
    }
    /**
     * Interactive step-by-step tour
     */
    async startInteractiveTour() {
        // this.currentTourStep = 0; // Future feature
        this.outputChannel.appendLine('[OnboardingService] Starting interactive tour');
        // Step 1: Show the thinking processes view
        await vscode.commands.executeCommand('workbench.view.extension.structural-thinking');
        const continueStep1 = await vscode.window.showInformationMessage('Step 1/5: This is your Thinking Processes sidebar. Here you can view all your structured thinking sessions.', { modal: false }, 'Next', 'Skip Tour');
        if (continueStep1 !== 'Next') {
            return this.endTour();
        }
        // Step 2: Create a session
        const continueStep2 = await vscode.window.showInformationMessage('Step 2/5: Click the + button in the sidebar to create your first thinking session, or press Cmd+Shift+N (Ctrl+Shift+N on Windows).', { modal: false }, 'Next', 'Skip Tour');
        if (continueStep2 !== 'Next') {
            return this.endTour();
        }
        // Step 3: Explain thought editing
        const continueStep3 = await vscode.window.showInformationMessage('Step 3/5: You can edit thoughts with live markdown preview by clicking the edit icon next to any thought.', { modal: false }, 'Next', 'Skip Tour');
        if (continueStep3 !== 'Next') {
            return this.endTour();
        }
        // Step 4: Research integration
        const continueStep4 = await vscode.window.showInformationMessage('Step 4/5: Use the search icon or press Cmd+Shift+R (Ctrl+Shift+R) to research topics with Perplexity AI during your thinking process.', { modal: false }, 'Next', 'Skip Tour');
        if (continueStep4 !== 'Next') {
            return this.endTour();
        }
        // Step 5: Analytics
        const continueStep5 = await vscode.window.showInformationMessage('Step 5/5: View your thinking analytics by clicking the graph icon or pressing Cmd+Shift+A (Ctrl+Shift+A). Track your productivity and quality scores!', { modal: false }, 'Finish Tour', 'Show Analytics Now');
        if (continueStep5 === 'Show Analytics Now') {
            await vscode.commands.executeCommand('structuralThinking.showAnalytics');
        }
        this.endTour();
    }
    /**
     * End the tour and mark as completed
     */
    endTour() {
        this.setOnboardingState({ completed: true, currentStep: 5, dismissed: false });
        void vscode.window.showInformationMessage('Tour complete! You can access help anytime from the Command Palette (Cmd+Shift+P / Ctrl+Shift+P).');
        this.outputChannel.appendLine('[OnboardingService] Tour completed');
    }
    /**
     * Show quick start guide in webview
     */
    async showQuickStartGuide() {
        const panel = vscode.window.createWebviewPanel('quickStartGuide', 'Quick Start Guide', vscode.ViewColumn.One, {
            enableScripts: true,
        });
        panel.webview.html = this.getQuickStartHTML();
        this.setOnboardingState({ completed: true, currentStep: 0, dismissed: false });
    }
    /**
     * Generate Quick Start Guide HTML
     */
    getQuickStartHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Start Guide</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }

    h1 {
      color: var(--vscode-textLink-foreground);
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }

    h2 {
      color: var(--vscode-textLink-foreground);
      margin-top: 24px;
    }

    .feature {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 16px;
      border-radius: 6px;
      margin: 16px 0;
    }

    .shortcut {
      display: inline-block;
      background: var(--vscode-textCodeBlock-background);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
      margin: 0 4px;
    }

    .tip {
      border-left: 4px solid var(--vscode-textLink-foreground);
      padding-left: 16px;
      margin: 16px 0;
      opacity: 0.9;
    }

    ul {
      margin: 8px 0;
      padding-left: 24px;
    }

    li {
      margin: 4px 0;
    }

    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
  </style>
</head>
<body>
  <h1>Structural Thinking Manager - Quick Start Guide</h1>

  <h2>🎯 Core Concepts</h2>
  <div class="feature">
    <h3>Structured Thinking Framework</h3>
    <p>Organize your thoughts into 8 cognitive stages:</p>
    <ul>
      <li><strong>Problem Definition</strong> - Define the problem, constraints, and goals</li>
      <li><strong>Research</strong> - Gather information and explore existing solutions</li>
      <li><strong>Analysis</strong> - Break down the problem and identify patterns</li>
      <li><strong>Synthesis</strong> - Combine insights and design solutions</li>
      <li><strong>Conclusion</strong> - Finalize decisions and document rationale</li>
      <li><strong>Reflection</strong> - Review outcomes and learn from the process</li>
      <li><strong>Implementation</strong> - Execute the planned solution</li>
      <li><strong>Validation</strong> - Test and verify the implementation</li>
    </ul>
  </div>

  <h2>⚡ Keyboard Shortcuts</h2>
  <div class="feature">
    <ul>
      <li><span class="shortcut">Cmd+Shift+N</span> / <span class="shortcut">Ctrl+Shift+N</span> - Create new thinking session</li>
      <li><span class="shortcut">Cmd+Shift+R</span> / <span class="shortcut">Ctrl+Shift+R</span> - Open research panel</li>
      <li><span class="shortcut">Cmd+Shift+E</span> / <span class="shortcut">Ctrl+Shift+E</span> - Export session</li>
      <li><span class="shortcut">Cmd+Shift+A</span> / <span class="shortcut">Ctrl+Shift+A</span> - Show analytics dashboard</li>
      <li><span class="shortcut">Cmd+Shift+F5</span> / <span class="shortcut">Ctrl+Shift+F5</span> - Refresh thinking processes</li>
    </ul>
  </div>

  <h2>📝 Creating Your First Session</h2>
  <div class="feature">
    <ol>
      <li>Open the Structural Thinking sidebar (click the brain icon in the Activity Bar)</li>
      <li>Click the <strong>+</strong> button or press <span class="shortcut">Cmd+Shift+N</span></li>
      <li>Enter a descriptive name for your thinking session</li>
      <li>Start adding thoughts by expanding the session and using the context menu</li>
    </ol>
  </div>

  <h2>✏️ Editing Thoughts</h2>
  <div class="feature">
    <p>Use the advanced markdown editor for rich thought documentation:</p>
    <ul>
      <li>Click the <strong>edit icon</strong> next to any thought</li>
      <li>Write in markdown with live preview</li>
      <li>Add tags for organization (comma-separated)</li>
      <li>Set importance level (low, medium, high, critical)</li>
      <li>Adjust quality score (0-100)</li>
      <li>Auto-save after 2 seconds of inactivity</li>
    </ul>
    <div class="tip">
      <strong>💡 Tip:</strong> Press <span class="shortcut">Cmd+S</span> / <span class="shortcut">Ctrl+S</span> to save immediately, or <span class="shortcut">Cmd+Enter</span> / <span class="shortcut">Ctrl+Enter</span> to save and close.
    </div>
  </div>

  <h2>🔍 AI-Powered Research</h2>
  <div class="feature">
    <p>Integrate Perplexity AI research into your thinking process:</p>
    <ul>
      <li>Click the <strong>search icon</strong> or press <span class="shortcut">Cmd+Shift+R</span></li>
      <li>Enter your research query with optional context</li>
      <li>View AI-generated research with sources</li>
      <li>Responses are automatically cached to avoid duplicate queries</li>
      <li>Research is linked to your active thinking session</li>
    </ul>
  </div>

  <h2>📊 Analytics Dashboard</h2>
  <div class="feature">
    <p>Track your thinking productivity and quality:</p>
    <ul>
      <li>Press <span class="shortcut">Cmd+Shift+A</span> or click the graph icon</li>
      <li>View sessions over time (last 30 days)</li>
      <li>Analyze thoughts by stage distribution</li>
      <li>Monitor quality scores per stage</li>
      <li>Explore tag frequency and top tags</li>
      <li>Track completion rates</li>
      <li>Export analytics to JSON for external analysis</li>
    </ul>
  </div>

  <h2>💾 Export Options</h2>
  <div class="feature">
    <p>Export your thinking sessions in multiple formats:</p>
    <ul>
      <li><strong>JSON</strong> - Machine-readable format with full metadata</li>
      <li><strong>Markdown</strong> - Human-readable format for documentation</li>
      <li>Include/exclude metadata, timestamps, and grouping options</li>
      <li>Prettified output for readability</li>
    </ul>
  </div>

  <h2>🔧 Configuration</h2>
  <div class="feature">
    <p>Customize your experience in VSCode Settings:</p>
    <ul>
      <li><strong>Database Mode</strong> - SQLite (local), PostgreSQL (production), or Auto (fallback)</li>
      <li><strong>PostgreSQL Connection</strong> - Configure host, port, database, and credentials</li>
      <li><strong>MCP Remote Mode</strong> - Connect to MCP servers via SSH or local stdio</li>
      <li><strong>Tree View Refresh</strong> - Set auto-refresh interval (default: 5 seconds)</li>
      <li><strong>Max Thoughts Per Session</strong> - Limit displayed thoughts (default: 100)</li>
      <li><strong>Logging Level</strong> - Control output verbosity (error, warn, info, debug)</li>
    </ul>
  </div>

  <h2>🔐 Database Modes</h2>
  <div class="feature">
    <h3>SQLite (Local)</h3>
    <p>Default mode for offline-first development. Data stored in <code>~/.vscode/structural-thinking/mcp_plan.db</code></p>

    <h3>PostgreSQL (Production)</h3>
    <p>Connect to production database at <code>46.250.243.123:5432</code> for team collaboration and centralized storage.</p>

    <h3>Auto (Recommended)</h3>
    <p>Attempts PostgreSQL first, falls back to SQLite if unavailable. Best of both worlds!</p>
  </div>

  <h2>📚 Additional Resources</h2>
  <div class="feature">
    <ul>
      <li>Access all commands via Command Palette: <span class="shortcut">Cmd+Shift+P</span> / <span class="shortcut">Ctrl+Shift+P</span></li>
      <li>Search for "Structural Thinking" to see all available commands</li>
      <li>Right-click on sessions/thoughts in the tree view for contextual actions</li>
      <li>Check the Output panel (View → Output → Structural Thinking) for debugging</li>
    </ul>
  </div>

  <div class="tip">
    <strong>🎉 You're ready to start!</strong> Create your first thinking session and explore the features. Happy thinking!
  </div>
</body>
</html>`;
    }
    /**
     * Get onboarding state from workspace storage
     */
    getOnboardingState() {
        const completed = this.context.globalState.get('onboarding.completed', false);
        const dismissed = this.context.globalState.get('onboarding.dismissed', false);
        const currentStep = this.context.globalState.get('onboarding.currentStep', 0);
        return { completed, dismissed, currentStep };
    }
    /**
     * Set onboarding state in workspace storage
     */
    setOnboardingState(state) {
        void this.context.globalState.update('onboarding.completed', state.completed);
        void this.context.globalState.update('onboarding.dismissed', state.dismissed);
        void this.context.globalState.update('onboarding.currentStep', state.currentStep);
    }
    /**
     * Reset onboarding (for testing or re-running tour)
     */
    resetOnboarding() {
        this.setOnboardingState({ completed: false, dismissed: false, currentStep: 0 });
        this.outputChannel.appendLine('[OnboardingService] Onboarding reset');
    }
}
exports.OnboardingService = OnboardingService;
//# sourceMappingURL=OnboardingService.js.map