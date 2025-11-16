/**
 * AnalyticsDashboard - Comprehensive metrics and visualization dashboard
 *
 * Features:
 * - Thinking sessions over time (time series chart)
 * - Quality score distribution by stage
 * - Tag cloud from thought metadata
 * - Time spent per stage analysis
 * - Completion rates and productivity metrics
 * - Research query frequency analysis
 */

import * as vscode from 'vscode';
import type { DatabaseService } from '../services/DatabaseService';

interface AnalyticsMetrics {
  readonly totalSessions: number;
  readonly totalThoughts: number;
  readonly averageQualityScore: number;
  readonly averageThoughtsPerSession: number;
  readonly stageDistribution: Record<string, number>;
  readonly qualityByStage: Record<string, number>;
  readonly tagFrequency: Record<string, number>;
  readonly sessionsOverTime: Array<{
    readonly date: string;
    readonly count: number;
  }>;
  readonly completionRate: number;
  readonly topTags: Array<{ readonly tag: string; readonly count: number }>;
}

export class AnalyticsDashboard {
  private static currentPanel: AnalyticsDashboard | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly databaseService: DatabaseService;
  private readonly outputChannel: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];
  private refreshInterval?: NodeJS.Timeout;

  private constructor(
    panel: vscode.WebviewPanel,
    databaseService: DatabaseService,
    outputChannel: vscode.OutputChannel
  ) {
    this.panel = panel;
    this.databaseService = databaseService;
    this.outputChannel = outputChannel;

    // Initialize panel
    this.update();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      this.handleMessage.bind(this),
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.update();
    }, 30000);
  }

  /**
   * Create or show analytics dashboard
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    databaseService: DatabaseService,
    outputChannel: vscode.OutputChannel
  ): Promise<void> {
    const column = vscode.ViewColumn.Two;

    // If we already have a panel, show it
    if (AnalyticsDashboard.currentPanel) {
      AnalyticsDashboard.currentPanel.panel.reveal(column);
      AnalyticsDashboard.currentPanel.update();
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'analyticsConsole',
      'Thinking Analytics',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    AnalyticsDashboard.currentPanel = new AnalyticsDashboard(
      panel,
      databaseService,
      outputChannel
    );
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: { type: string }): Promise<void> {
    switch (message.type) {
      case 'refresh':
        await this.update();
        break;
      case 'export':
        await this.exportMetrics();
        break;
    }
  }

  /**
   * Update dashboard with latest metrics
   */
  private async update(): Promise<void> {
    try {
      const metrics = await this.calculateMetrics();
      this.panel.webview.html = this.getHtmlContent(metrics);
      this.outputChannel.appendLine('[AnalyticsDashboard] Metrics updated');
    } catch (error) {
      this.outputChannel.appendLine(
        `[AnalyticsDashboard] Error updating metrics: ${String(error)}`
      );
      void vscode.window.showErrorMessage(
        `Failed to update analytics: ${String(error)}`
      );
    }
  }

  /**
   * Calculate analytics metrics from database
   */
  private async calculateMetrics(): Promise<AnalyticsMetrics> {
    const sessions = await this.databaseService.getSessions(1000);
    const allThoughts = await Promise.all(
      sessions.map((s) => this.databaseService.getThoughts(s.sessionId, 1000))
    );

    const thoughts = allThoughts.flat();

    // Calculate basic metrics
    const totalSessions = sessions.length;
    const totalThoughts = thoughts.length;
    const averageThoughtsPerSession =
      totalSessions > 0 ? totalThoughts / totalSessions : 0;

    // Quality score average
    const qualityScores = thoughts
      .map((t: { qualityScore?: number }) => t.qualityScore)
      .filter((q): q is number => q !== undefined);
    const averageQualityScore =
      qualityScores.length > 0
        ? qualityScores.reduce((sum: number, q: number) => sum + q, 0) / qualityScores.length
        : 0;

    // Stage distribution
    const stageDistribution: Record<string, number> = {};
    const qualityByStage: Record<string, { sum: number; count: number }> = {};

    for (const thought of thoughts) {
      stageDistribution[thought.stage] =
        (stageDistribution[thought.stage] || 0) + 1;

      if (thought.qualityScore !== undefined) {
        if (!qualityByStage[thought.stage]) {
          qualityByStage[thought.stage] = { sum: 0, count: 0 };
        }
        const stageData = qualityByStage[thought.stage];
        if (stageData) {
          stageData.sum += thought.qualityScore;
          stageData.count += 1;
        }
      }
    }

    // Calculate average quality per stage
    const avgQualityByStage: Record<string, number> = {};
    for (const [stage, data] of Object.entries(qualityByStage)) {
      avgQualityByStage[stage] = data.count > 0 ? data.sum / data.count : 0;
    }

    // Tag frequency
    const tagFrequency: Record<string, number> = {};
    for (const thought of thoughts) {
      const tags = thought.metadata?.tags || [];
      for (const tag of tags) {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      }
    }

    // Top tags
    const topTags = Object.entries(tagFrequency)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Sessions over time (last 30 days)
    const sessionsOverTime: Array<{ date: string; count: number }> = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Group sessions by date
    const sessionsByDate: Record<string, number> = {};
    for (const session of sessions) {
      if (session.createdAt >= thirtyDaysAgo) {
        const dateKey = session.createdAt.toISOString().split('T')[0];
        if (dateKey) {
          sessionsByDate[dateKey] = (sessionsByDate[dateKey] || 0) + 1;
        }
      }
    }

    // Fill in missing dates with 0
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      if (dateKey) {
        sessionsOverTime.push({
          date: dateKey,
          count: sessionsByDate[dateKey] || 0,
        });
      }
    }

    sessionsOverTime.reverse(); // Oldest to newest

    // Completion rate (sessions with conclusion stage thoughts)
    const completedSessions = sessions.filter((session) => {
      const sessionThoughts = thoughts.filter(
        (t: { sessionId: string }) => t.sessionId === session.sessionId
      );
      return sessionThoughts.some(
        (t: { stage: string }) => t.stage === 'conclusion' || t.stage === 'validation'
      );
    });
    const completionRate =
      totalSessions > 0 ? (completedSessions.length / totalSessions) * 100 : 0;

    return {
      totalSessions,
      totalThoughts,
      averageQualityScore,
      averageThoughtsPerSession,
      stageDistribution,
      qualityByStage: avgQualityByStage,
      tagFrequency,
      sessionsOverTime,
      completionRate,
      topTags,
    };
  }

  /**
   * Export metrics to JSON file
   */
  private async exportMetrics(): Promise<void> {
    try {
      const metrics = await this.calculateMetrics();
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('thinking-analytics.json'),
        filters: {
          JSON: ['json'],
        },
      });

      if (uri) {
        const content = JSON.stringify(metrics, null, 2);
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(content, 'utf8')
        );
        void vscode.window.showInformationMessage('Analytics exported successfully');
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to export analytics: ${String(error)}`
      );
    }
  }

  /**
   * Generate HTML content for dashboard
   */
  private getHtmlContent(metrics: AnalyticsMetrics): string {
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
  <title>Thinking Analytics</title>

  <!-- Chart.js for visualizations -->
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --card-bg: var(--vscode-sideBar-background);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      background: var(--bg);
      color: var(--fg);
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--border);
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: var(--accent);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      transition: opacity 0.2s;
    }

    button:hover {
      opacity: 0.9;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .metric-card {
      background: var(--card-bg);
      padding: 20px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .metric-value {
      font-size: 32px;
      font-weight: 700;
      margin: 8px 0;
    }

    .metric-label {
      font-size: 13px;
      opacity: 0.8;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
      margin-bottom: 24px;
    }

    .chart-card {
      background: var(--card-bg);
      padding: 20px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .chart-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .chart-container {
      position: relative;
      height: 300px;
    }

    .tag-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 16px;
    }

    .tag {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 16px;
      background: var(--accent);
      color: var(--vscode-button-foreground);
      font-size: calc(12px + var(--size, 0) * 4px);
      opacity: calc(0.5 + var(--size, 0) * 0.5);
    }

    .last-updated {
      text-align: center;
      opacity: 0.6;
      font-size: 12px;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Thinking Analytics Dashboard</h1>
    <div class="actions">
      <button onclick="handleRefresh()">Refresh</button>
      <button onclick="handleExport()">Export JSON</button>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">Total Sessions</div>
      <div class="metric-value">${metrics.totalSessions}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Thoughts</div>
      <div class="metric-value">${metrics.totalThoughts}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg Quality Score</div>
      <div class="metric-value">${metrics.averageQualityScore.toFixed(1)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Completion Rate</div>
      <div class="metric-value">${metrics.completionRate.toFixed(1)}%</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg Thoughts/Session</div>
      <div class="metric-value">${metrics.averageThoughtsPerSession.toFixed(1)}</div>
    </div>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <div class="chart-title">Sessions Over Time (Last 30 Days)</div>
      <div class="chart-container">
        <canvas id="sessionsChart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Thoughts by Stage</div>
      <div class="chart-container">
        <canvas id="stageChart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Quality Score by Stage</div>
      <div class="chart-container">
        <canvas id="qualityChart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Top Tags</div>
      <div class="tag-cloud">
        ${metrics.topTags
          .map((tag) => {
            const maxCount = metrics.topTags[0]?.count || 1;
            const size = tag.count / maxCount;
            return `<span class="tag" style="--size: ${size}">${tag.tag} (${tag.count})</span>`;
          })
          .join('')}
      </div>
    </div>
  </div>

  <div class="last-updated">
    Last updated: ${new Date().toLocaleString()}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Chart.js default colors
    const chartColors = {
      blue: 'rgb(54, 162, 235)',
      green: 'rgb(75, 192, 192)',
      yellow: 'rgb(255, 205, 86)',
      red: 'rgb(255, 99, 132)',
      purple: 'rgb(153, 102, 255)',
      orange: 'rgb(255, 159, 64)',
    };

    // Sessions over time chart
    new Chart(document.getElementById('sessionsChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(metrics.sessionsOverTime.map((s) => s.date))},
        datasets: [{
          label: 'Sessions Created',
          data: ${JSON.stringify(metrics.sessionsOverTime.map((s) => s.count))},
          borderColor: chartColors.blue,
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });

    // Stage distribution chart
    new Chart(document.getElementById('stageChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(Object.keys(metrics.stageDistribution))},
        datasets: [{
          label: 'Thoughts',
          data: ${JSON.stringify(Object.values(metrics.stageDistribution))},
          backgroundColor: [
            chartColors.blue,
            chartColors.green,
            chartColors.yellow,
            chartColors.red,
            chartColors.purple,
            chartColors.orange,
          ],
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

    // Quality by stage chart
    new Chart(document.getElementById('qualityChart'), {
      type: 'radar',
      data: {
        labels: ${JSON.stringify(Object.keys(metrics.qualityByStage))},
        datasets: [{
          label: 'Avg Quality Score',
          data: ${JSON.stringify(Object.values(metrics.qualityByStage))},
          borderColor: chartColors.green,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 100
          }
        }
      }
    });

    function handleRefresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    function handleExport() {
      vscode.postMessage({ type: 'export' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate random nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    AnalyticsDashboard.currentPanel = undefined;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.panel.dispose();

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}
