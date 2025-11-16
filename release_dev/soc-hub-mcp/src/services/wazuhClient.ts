/**
 * Wazuh API Client
 * Connects to Wazuh Manager and retrieves security alerts, agent status, and rules
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import type { WazuhAlert, WazuhAgent, AlertFilter } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class WazuhClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  public constructor(config: { url: string; user: string; password: string; verify_ssl?: boolean }) {
    this.baseUrl = config.url;
    this.username = config.user;
    this.password = config.password;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: config.verify_ssl ?? false,
      }),
    });
  }

  /**
   * Authenticate with Wazuh API and get JWT token
   */
  private async authenticate(): Promise<void> {
    try {
      const response = await this.client.post(
        '/security/user/authenticate',
        {},
        {
          auth: {
            username: this.username,
            password: this.password,
          },
        }
      );

      this.token = response.data.data.token;
      // Wazuh tokens expire after 900 seconds (15 minutes)
      this.tokenExpiry = Date.now() + 13 * 60 * 1000; // Refresh 2 minutes early
      logger.info('Wazuh authentication successful');
    } catch (error) {
      logger.error('Wazuh authentication failed', error);
      throw new Error('Failed to authenticate with Wazuh API');
    }
  }

  /**
   * Ensure we have a valid token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Make authenticated request to Wazuh API
   */
  private async request<T>(method: string, endpoint: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensureAuthenticated();

    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        params,
      });

      return response.data.data;
    } catch (error) {
      logger.error(`Wazuh API request failed: ${method} ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Get all Wazuh agents
   */
  public async getAgents(): Promise<WazuhAgent[]> {
    try {
      const data = await this.request<{ affected_items: WazuhAgent[] }>('GET', '/agents');
      return data.affected_items || [];
    } catch (error) {
      logger.error('Failed to fetch Wazuh agents', error);
      return [];
    }
  }

  /**
   * Get agent by ID
   */
  public async getAgent(agentId: string): Promise<WazuhAgent | null> {
    try {
      const data = await this.request<{ affected_items: WazuhAgent[] }>('GET', `/agents/${agentId}`);
      return data.affected_items?.[0] || null;
    } catch (error) {
      logger.error(`Failed to fetch agent ${agentId}`, error);
      return null;
    }
  }

  /**
   * Get agents summary statistics
   */
  public async getAgentsSummary(): Promise<{ active: number; disconnected: number; never_connected: number; total: number }> {
    try {
      const data = await this.request<{
        connection: { active: number; disconnected: number; never_connected: number; total: number };
      }>('GET', '/agents/summary/status');
      return data.connection;
    } catch (error) {
      logger.error('Failed to fetch agents summary', error);
      return { active: 0, disconnected: 0, never_connected: 0, total: 0 };
    }
  }

  /**
   * Get security alerts
   */
  public async getAlerts(filter?: AlertFilter): Promise<WazuhAlert[]> {
    try {
      const params: Record<string, unknown> = {
        limit: filter?.limit || 100,
        offset: filter?.offset || 0,
        sort: '-timestamp',
      };

      if (filter?.agent_id) {
        params['agent.id'] = filter.agent_id.join(',');
      }

      if (filter?.rule_groups) {
        params['rule.groups'] = filter.rule_groups.join(',');
      }

      if (filter?.severity) {
        params['rule.level'] = filter.severity.join(',');
      }

      if (filter?.time_range) {
        params.date_range = `${filter.time_range.from} TO ${filter.time_range.to}`;
      }

      if (filter?.search) {
        params.q = filter.search;
      }

      const data = await this.request<{ affected_items: WazuhAlert[] }>('GET', '/security/alerts', params);
      return data.affected_items || [];
    } catch (error) {
      logger.error('Failed to fetch alerts', error);
      return [];
    }
  }

  /**
   * Get recent critical alerts (level >= 10)
   */
  public async getCriticalAlerts(limit: number = 50): Promise<WazuhAlert[]> {
    return this.getAlerts({
      severity: [10, 11, 12, 13, 14, 15],
      limit,
    });
  }

  /**
   * Get alerts count by severity
   */
  public async getAlertsBySeverity(): Promise<Record<number, number>> {
    try {
      // Get recent alerts and aggregate by severity
      const alerts = await this.getAlerts({ limit: 1000 });
      const severityCount: Record<number, number> = {};

      for (const alert of alerts) {
        const level = alert.rule.level;
        severityCount[level] = (severityCount[level] || 0) + 1;
      }

      return severityCount;
    } catch (error) {
      logger.error('Failed to fetch alerts by severity', error);
      return {};
    }
  }

  /**
   * Get Wazuh manager info
   */
  public async getManagerInfo(): Promise<{ version: string; compilation_date: string; installation_date: string }> {
    try {
      const data = await this.request<{
        affected_items: Array<{ version: string; compilation_date: string; installation_date: string }>;
      }>('GET', '/manager/info');
      return data.affected_items[0] || { version: 'unknown', compilation_date: '', installation_date: '' };
    } catch (error) {
      logger.error('Failed to fetch manager info', error);
      return { version: 'unknown', compilation_date: '', installation_date: '' };
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ healthy: boolean; response_time_ms?: number }> {
    const start = Date.now();
    try {
      await this.request('GET', '/');
      const response_time_ms = Date.now() - start;
      return { healthy: true, response_time_ms };
    } catch (_error) {
      return { healthy: false };
    }
  }
}
