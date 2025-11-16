/**
 * SOC Data Aggregator
 * Unified service that aggregates data from all SOC components
 */

import type {
  SOCDashboardData,
  ServiceHealth,
  WazuhAlert,
  ElasticsearchAlert,
  SuricataAlert,
  FalcoAlert,
} from '../types/index.js';
import { WazuhClient } from './wazuhClient.js';
import { ElasticsearchClient } from './elasticsearchClient.js';
import { TheHiveClient } from './thehiveClient.js';
import { CrowdSecClient } from './crowdsecClient.js';
import { logger } from '../utils/logger.js';

export class SOCAggregator {
  private wazuhClient: WazuhClient;
  private elasticsearchClient: ElasticsearchClient;
  private thehiveClient: TheHiveClient;
  private crowdsecClient: CrowdSecClient;

  public constructor(config: {
    wazuh: { url: string; user: string; password: string; verify_ssl?: boolean };
    elasticsearch: { url: string; user: string; password: string };
    thehive: { url: string; api_key: string };
    crowdsec_hosts: Array<{ name: string; ip: string; api_key?: string }>;
  }) {
    this.wazuhClient = new WazuhClient(config.wazuh);
    this.elasticsearchClient = new ElasticsearchClient(config.elasticsearch);
    this.thehiveClient = new TheHiveClient(config.thehive);
    this.crowdsecClient = new CrowdSecClient(config.crowdsec_hosts);

    logger.info('SOC Aggregator initialized');
  }

  /**
   * Get complete SOC dashboard data
   */
  public async getDashboardData(): Promise<SOCDashboardData> {
    logger.info('Fetching SOC dashboard data');

    try {
      // Fetch all data in parallel
      const [
        agentsSummary,
        recentWazuhAlerts,
        suricataAlerts,
        falcoAlerts,
        openCases,
        activeBans,
        topScenarios,
      ] = await Promise.all([
        this.wazuhClient.getAgentsSummary(),
        this.wazuhClient.getAlerts({ limit: 50 }),
        this.elasticsearchClient.getSuricataAlerts({ limit: 25 }),
        this.elasticsearchClient.getFalcoAlerts({ limit: 25 }),
        this.thehiveClient.getOpenCases(20),
        this.crowdsecClient.getActiveBans(),
        this.crowdsecClient.getTopScenarios(10),
      ]);

      // Calculate critical alerts
      const criticalAlerts = recentWazuhAlerts.filter((a) => a.rule.level >= 10).length;

      // Determine overall threat level
      const threatLevel = this.calculateThreatLevel({
        criticalAlerts,
        agentsDisconnected: agentsSummary.disconnected,
        openCases: openCases.length,
        bannedIPs: activeBans.length,
      });

      // Combine recent alerts from all sources
      const recentAlerts: Array<WazuhAlert | ElasticsearchAlert | SuricataAlert | FalcoAlert> = [
        ...recentWazuhAlerts.slice(0, 20),
        ...suricataAlerts,
        ...falcoAlerts,
      ];

      return {
        timestamp: new Date().toISOString(),
        overview: {
          total_alerts: recentWazuhAlerts.length + suricataAlerts.length + falcoAlerts.length,
          critical_alerts: criticalAlerts,
          agents_active: agentsSummary.active,
          agents_disconnected: agentsSummary.disconnected,
          open_cases: openCases.length,
          threat_level: threatLevel,
        },
        recent_alerts: recentAlerts,
        agent_status: await this.wazuhClient.getAgents(),
        active_cases: openCases,
        threat_intel: {
          banned_ips: activeBans.length,
          active_decisions: activeBans.map((ban) => ({
            id: 0,
            origin: ban.host,
            type: 'ban' as const,
            scope: 'ip',
            value: ban.ip,
            duration: '',
            scenario: ban.scenario,
            simulated: false,
            created_at: '',
            expires_at: ban.expires_at,
          })),
          top_scenarios: topScenarios,
        },
        system_health: {
          vmi01: {
            hostname: 'vmi01',
            timestamp: new Date().toISOString(),
            cpu: { usage: 0, cores: 0, load_avg: [0, 0, 0] },
            memory: { total: 0, used: 0, free: 0, usage_percent: 0 },
            disk: { total: 0, used: 0, free: 0, usage_percent: 0 },
            network: { rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0 },
          },
          vmi02d: {
            hostname: 'vmi02d',
            timestamp: new Date().toISOString(),
            cpu: { usage: 0, cores: 0, load_avg: [0, 0, 0] },
            memory: { total: 0, used: 0, free: 0, usage_percent: 0 },
            disk: { total: 0, used: 0, free: 0, usage_percent: 0 },
            network: { rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0 },
          },
          vmi03: {
            hostname: 'vmi03',
            timestamp: new Date().toISOString(),
            cpu: { usage: 0, cores: 0, load_avg: [0, 0, 0] },
            memory: { total: 0, used: 0, free: 0, usage_percent: 0 },
            disk: { total: 0, used: 0, free: 0, usage_percent: 0 },
            network: { rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0 },
          },
        },
      };
    } catch (error) {
      logger.error('Failed to fetch SOC dashboard data', error);
      throw error;
    }
  }

  /**
   * Calculate overall threat level based on multiple factors
   */
  private calculateThreatLevel(params: {
    criticalAlerts: number;
    agentsDisconnected: number;
    openCases: number;
    bannedIPs: number;
  }): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;

    // Critical alerts contribute heavily
    if (params.criticalAlerts > 10) score += 3;
    else if (params.criticalAlerts > 5) score += 2;
    else if (params.criticalAlerts > 0) score += 1;

    // Disconnected agents are concerning
    if (params.agentsDisconnected > 2) score += 2;
    else if (params.agentsDisconnected > 0) score += 1;

    // High number of open cases indicates ongoing issues
    if (params.openCases > 10) score += 2;
    else if (params.openCases > 5) score += 1;

    // Many banned IPs could indicate an attack
    if (params.bannedIPs > 100) score += 2;
    else if (params.bannedIPs > 50) score += 1;

    if (score >= 6) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * Get detailed alert information
   */
  public async getAlertDetails(alertId: string, source: 'wazuh' | 'elasticsearch'): Promise<unknown | null> {
    try {
      if (source === 'wazuh') {
        const alerts = await this.wazuhClient.getAlerts({ limit: 1000 });
        return alerts.find((a) => a.id === alertId) || null;
      } else {
        return await this.elasticsearchClient.searchByIP(alertId, 1);
      }
    } catch (error) {
      logger.error(`Failed to get alert details: ${alertId}`, error);
      return null;
    }
  }

  /**
   * Get service health status
   */
  public async getServiceHealth(): Promise<ServiceHealth[]> {
    logger.info('Checking service health');

    const checks = await Promise.allSettled([
      this.wazuhClient.healthCheck(),
      this.elasticsearchClient.healthCheck(),
      this.thehiveClient.healthCheck(),
    ]);

    const services: ServiceHealth[] = [];

    // Wazuh
    if (checks[0]?.status === 'fulfilled') {
      const result = checks[0].value;
      services.push({
        service: 'wazuh',
        status: result.healthy ? 'healthy' : 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: result.response_time_ms,
      });
    } else {
      services.push({
        service: 'wazuh',
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        error: 'Health check failed',
      });
    }

    // Elasticsearch
    if (checks[1]?.status === 'fulfilled') {
      const result = checks[1].value;
      services.push({
        service: 'elasticsearch',
        status: result.healthy ? 'healthy' : 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: result.response_time_ms,
      });
    } else {
      services.push({
        service: 'elasticsearch',
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        error: 'Health check failed',
      });
    }

    // TheHive
    if (checks[2]?.status === 'fulfilled') {
      const result = checks[2].value;
      services.push({
        service: 'thehive',
        status: result.healthy ? 'healthy' : 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: result.response_time_ms,
      });
    } else {
      services.push({
        service: 'thehive',
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        error: 'Health check failed',
      });
    }

    return services;
  }

  /**
   * Create incident case from alert
   */
  public async createCaseFromAlert(alert: WazuhAlert | SuricataAlert): Promise<boolean> {
    try {
      let title: string;
      let description: string;
      let severity: number;
      let tags: string[];

      if ('rule' in alert) {
        // Wazuh alert
        title = alert.rule.description;
        description = alert.full_log || `Alert from ${alert.agent.name} (${alert.agent.ip})`;
        severity = alert.rule.level >= 12 ? 4 : alert.rule.level >= 10 ? 3 : alert.rule.level >= 7 ? 2 : 1;
        tags = alert.rule.groups || [];
      } else {
        // Suricata alert
        title = alert.alert.signature;
        description = `${alert.alert.category} - ${alert.src_ip}:${alert.src_port} -> ${alert.dest_ip}:${alert.dest_port}`;
        severity = alert.alert.severity >= 1 ? 4 : 2;
        tags = [alert.alert.category, alert.proto];
      }

      const caseData = await this.thehiveClient.createCase({
        title,
        description,
        severity,
        tags,
        tlp: 2,
      });

      return caseData !== null;
    } catch (error) {
      logger.error('Failed to create case from alert', error);
      return false;
    }
  }

  /**
   * Get Wazuh client (for direct access)
   */
  public get wazuh(): WazuhClient {
    return this.wazuhClient;
  }

  /**
   * Get Elasticsearch client (for direct access)
   */
  public get elasticsearch(): ElasticsearchClient {
    return this.elasticsearchClient;
  }

  /**
   * Get TheHive client (for direct access)
   */
  public get thehive(): TheHiveClient {
    return this.thehiveClient;
  }

  /**
   * Get CrowdSec client (for direct access)
   */
  public get crowdsec(): CrowdSecClient {
    return this.crowdsecClient;
  }
}
