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
export declare class SecurityMonitoringService {
    private readonly config;
    private readonly outputChannel;
    private authenticated;
    constructor(config: Partial<WazuhConfig>, outputChannel: vscode.OutputChannel);
    /**
     * Authenticate with Wazuh API (STUB)
     */
    authenticate(): Promise<boolean>;
    /**
     * Get recent security alerts (STUB)
     */
    getRecentAlerts(limit?: number, severity?: AlertSeverity): Promise<readonly WazuhAlert[]>;
    /**
     * Get alerts for specific MCP server (STUB)
     */
    getMCPServerAlerts(serverName: string): Promise<readonly WazuhAlert[]>;
    /**
     * Get failed authentication attempts (STUB)
     */
    getFailedAuthAttempts(hours?: number): Promise<readonly WazuhAlert[]>;
    /**
     * Map Wazuh rule level to severity
     */
    private mapLevelToSeverity;
    /**
     * Show security alerts in webview (STUB)
     */
    showAlertsPanel(_context: vscode.ExtensionContext): Promise<void>;
    /**
     * Generate alerts HTML (STUB)
     */
    private getAlertsHTML;
    /**
     * Check if authenticated
     */
    isAuthenticated(): boolean;
    /**
     * Get configuration
     */
    getConfig(): WazuhConfig;
}
export {};
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
//# sourceMappingURL=SecurityMonitoringService.d.ts.map