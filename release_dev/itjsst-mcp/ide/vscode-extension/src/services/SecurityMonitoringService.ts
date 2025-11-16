/**
 * SecurityMonitoringService - Wazuh SIEM Integration (STUB)
 *
 * Future features:
 * - Connect to Wazuh API at https://154.26.158.31:9443/api
 * - Display recent security alerts
 * - Filter by severity (critical/high/medium/low)
 * - Monitor failed authentication attempts
 * - Track MCP server suspicious activity
 * - Alert on security policy violations
 *
 * Note: This is a stub implementation. Requires Wazuh API credentials.
 */

import * as vscode from 'vscode';

interface WazuhConfig {
  readonly enabled: boolean;
  readonly apiUrl: string;
  readonly username?: string;
  readonly password?: string;
}

interface WazuhAlert {
  readonly id: string;
  readonly timestamp: Date;
  readonly rule: {
    readonly id: number;
    readonly level: number;
    readonly description: string;
  };
  readonly agent: {
    readonly name: string;
    readonly ip: string;
  };
  readonly data: Record<string, unknown>;
}

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export class SecurityMonitoringService {
  private readonly config: WazuhConfig;
  private readonly outputChannel: vscode.OutputChannel;
  private authenticated = false;
  // Future feature: JWT token storage
  // private token?: string;

  constructor(
    config: Partial<WazuhConfig>,
    outputChannel: vscode.OutputChannel
  ) {
    this.config = {
      enabled: config.enabled ?? false,
      apiUrl: config.apiUrl ?? 'https://154.26.158.31:9443/api',
      username: config.username,
      password: config.password,
    };
    this.outputChannel = outputChannel;

    if (this.config.enabled) {
      this.outputChannel.appendLine(
        '[SecurityMonitoringService] Security monitoring enabled but not yet implemented'
      );
    }
  }

  /**
   * Authenticate with Wazuh API (STUB)
   */
  public async authenticate(): Promise<boolean> {
    if (!this.config.enabled) {
      this.outputChannel.appendLine(
        '[SecurityMonitoringService] Security monitoring disabled'
      );
      return false;
    }

    if (!this.config.username || !this.config.password) {
      this.outputChannel.appendLine(
        '[SecurityMonitoringService] STUB: Missing Wazuh credentials'
      );
      return false;
    }

    this.outputChannel.appendLine(
      `[SecurityMonitoringService] STUB: Would authenticate with ${this.config.apiUrl}`
    );

    // Future implementation:
    // - POST /security/user/authenticate
    // - Store JWT token
    // - Handle token expiration and refresh

    this.authenticated = false;
    return false;
  }

  /**
   * Get recent security alerts (STUB)
   */
  public async getRecentAlerts(
    limit: number = 50,
    severity?: AlertSeverity
  ): Promise<readonly WazuhAlert[]> {
    if (!this.authenticated) {
      this.outputChannel.appendLine(
        '[SecurityMonitoringService] STUB: Not authenticated, returning empty alerts'
      );
      return [];
    }

    this.outputChannel.appendLine(
      `[SecurityMonitoringService] STUB: Would fetch ${limit} alerts with severity: ${severity ?? 'all'}`
    );

    // Future implementation:
    // - GET /alerts with filters
    // - Parse response
    // - Map to WazuhAlert interface

    return [];
  }

  /**
   * Get alerts for specific MCP server (STUB)
   */
  public async getMCPServerAlerts(serverName: string): Promise<readonly WazuhAlert[]> {
    this.outputChannel.appendLine(
      `[SecurityMonitoringService] STUB: Would fetch alerts for server: ${serverName}`
    );

    // Future implementation:
    // - Filter alerts by agent name matching server
    // - Look for MCP-specific rule IDs
    // - Return server-specific alerts

    return [];
  }

  /**
   * Get failed authentication attempts (STUB)
   */
  public async getFailedAuthAttempts(
    hours: number = 24
  ): Promise<readonly WazuhAlert[]> {
    this.outputChannel.appendLine(
      `[SecurityMonitoringService] STUB: Would fetch failed auth attempts from last ${hours} hours`
    );

    // Future implementation:
    // - Filter for authentication failure rules (5503, 5710, etc.)
    // - Group by source IP
    // - Calculate attempt frequency

    return [];
  }

  /**
   * Map Wazuh rule level to severity
   */
  private mapLevelToSeverity(level: number): AlertSeverity {
    if (level >= 12) {
      return 'critical';
    }
    if (level >= 7) {
      return 'high';
    }
    if (level >= 3) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Show security alerts in webview (STUB)
   */
  public async showAlertsPanel(_context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'securityAlerts',
      'Security Alerts',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = this.getAlertsHTML([]);
  }

  /**
   * Generate alerts HTML (STUB)
   */
  private getAlertsHTML(alerts: readonly WazuhAlert[]): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alerts</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }

    h1 {
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }

    .warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      padding: 16px;
      border-radius: 6px;
      margin: 16px 0;
    }

    .alert {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 12px;
      border-radius: 4px;
      margin: 8px 0;
      border-left: 4px solid var(--severity-color, #888);
    }

    .alert.critical {
      border-left-color: var(--vscode-errorForeground);
    }

    .alert.high {
      border-left-color: var(--vscode-inputValidation-warningBorder);
    }

    .alert.medium {
      border-left-color: var(--vscode-textLink-foreground);
    }

    .alert-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .alert-time {
      opacity: 0.7;
      font-size: 0.9em;
    }

    .severity-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .severity-critical {
      background: var(--vscode-errorBackground);
      color: var(--vscode-errorForeground);
    }

    .severity-high {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
  </style>
</head>
<body>
  <h1>Security Alerts - Wazuh Integration</h1>

  <div class="warning">
    <strong>⚠️ Feature Not Yet Implemented</strong>
    <p>The Wazuh SIEM integration is currently a stub implementation. To enable this feature:</p>
    <ul>
      <li>Configure Wazuh API credentials in extension settings</li>
      <li>Ensure network connectivity to https://154.26.158.31:9443/api</li>
      <li>Grant API access permissions for the extension</li>
    </ul>
    <p>Once configured, this panel will display:</p>
    <ul>
      <li>Recent security alerts from all MCP infrastructure</li>
      <li>Failed authentication attempts</li>
      <li>Suspicious activity on MCP servers</li>
      <li>Security policy violations</li>
      <li>Real-time alerts with severity filtering</li>
    </ul>
  </div>

  ${
    alerts.length > 0
      ? alerts
          .map(
            (alert) => `
    <div class="alert">
      <div class="alert-header">
        <span class="severity-badge severity-${this.mapLevelToSeverity(alert.rule.level)}">
          ${this.mapLevelToSeverity(alert.rule.level).toUpperCase()}
        </span>
        <span class="alert-time">${alert.timestamp.toLocaleString()}</span>
      </div>
      <div>
        <strong>${alert.rule.description}</strong><br>
        Agent: ${alert.agent.name} (${alert.agent.ip})<br>
        Rule ID: ${alert.rule.id}
      </div>
    </div>
  `
          )
          .join('')
      : '<p style="text-align: center; margin-top: 40px; opacity: 0.6;">No alerts to display</p>'
  }
</body>
</html>`;
  }

  /**
   * Check if authenticated
   */
  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Get configuration
   */
  public getConfig(): WazuhConfig {
    return this.config;
  }
}

/**
 * Integration requirements for full implementation:
 *
 * 1. Wazuh API Access:
 *    - Endpoint: https://154.26.158.31:9443/api
 *    - Authentication: POST /security/user/authenticate
 *    - Token refresh handling
 *    - SSL/TLS certificate validation
 *
 * 2. Required API Endpoints:
 *    - GET /alerts - Retrieve security alerts
 *    - GET /agents - List monitored agents
 *    - GET /rules - Query security rules
 *    - GET /decoders - Get event decoders
 *
 * 3. Alert Filters:
 *    - Rule level (severity)
 *    - Time range
 *    - Agent name/IP
 *    - Rule ID
 *    - Alert status
 *
 * 4. MCP-Specific Rules:
 *    - Failed SSH attempts on VMI01/VMI02D/VMI03
 *    - PostgreSQL unauthorized access
 *    - Suspicious MCP tool invocations
 *    - Rate limiting violations
 *    - Keycloak authentication failures
 *
 * 5. UI Components:
 *    - Alert list with filtering
 *    - Severity indicators
 *    - Time-based grouping
 *    - Alert details modal
 *    - Export alerts to CSV/JSON
 *
 * 6. Real-time Updates:
 *    - WebSocket connection for live alerts
 *    - Desktop notifications for critical alerts
 *    - Sound alerts (optional)
 *    - Status bar indicator
 *
 * 7. Dependencies:
 *    - npm install axios (HTTP client)
 *    - npm install https (Node.js TLS support)
 *    - Configure SSL certificate trust
 *
 * 8. Configuration Settings:
 *    - structuralThinking.security.wazuh.enabled
 *    - structuralThinking.security.wazuh.apiUrl
 *    - structuralThinking.security.wazuh.username
 *    - structuralThinking.security.wazuh.password (SecretStorage)
 *    - structuralThinking.security.wazuh.pollInterval
 */
