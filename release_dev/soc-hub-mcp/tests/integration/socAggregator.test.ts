/**
 * Integration tests for SOCAggregator
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SOCAggregator } from '../../src/services/socAggregator.js';

// Mock the API clients
vi.mock('../../src/services/wazuhClient.js', () => ({
  WazuhClient: vi.fn().mockImplementation(() => ({
    getAgentsSummary: vi.fn().mockResolvedValue({ active: 3, disconnected: 0 }),
    getAlerts: vi.fn().mockResolvedValue([]),
    getAgents: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, response_time_ms: 50 }),
  })),
}));

vi.mock('../../src/services/elasticsearchClient.js', () => ({
  ElasticsearchClient: vi.fn().mockImplementation(() => ({
    getSuricataAlerts: vi.fn().mockResolvedValue([]),
    getFalcoAlerts: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, response_time_ms: 30 }),
  })),
}));

vi.mock('../../src/services/thehiveClient.js', () => ({
  TheHiveClient: vi.fn().mockImplementation(() => ({
    getOpenCases: vi.fn().mockResolvedValue([]),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, response_time_ms: 40 }),
  })),
}));

vi.mock('../../src/services/crowdsecClient.js', () => ({
  CrowdSecClient: vi.fn().mockImplementation(() => ({
    getActiveBans: vi.fn().mockResolvedValue([]),
    getTopScenarios: vi.fn().mockResolvedValue([]),
  })),
}));

describe('SOCAggregator Integration Tests', () => {
  let aggregator: SOCAggregator;

  beforeAll(() => {
    const config = {
      wazuh: {
        url: 'https://test.wazuh.com:55000',
        user: 'test',
        password: 'test',
        verify_ssl: false,
      },
      elasticsearch: {
        url: 'http://test.elastic.com:9200',
        user: 'elastic',
        password: 'test',
      },
      thehive: {
        url: 'http://test.thehive.com:9000',
        api_key: 'test-key',
      },
      crowdsec_hosts: [
        { name: 'test1', ip: '192.168.1.1' },
        { name: 'test2', ip: '192.168.1.2' },
      ],
    };

    aggregator = new SOCAggregator(config);
  });

  describe('initialization', () => {
    it('should create SOCAggregator instance', () => {
      expect(aggregator).toBeDefined();
    });

    it('should have access to all clients', () => {
      expect(aggregator.wazuh).toBeDefined();
      expect(aggregator.elasticsearch).toBeDefined();
      expect(aggregator.thehive).toBeDefined();
      expect(aggregator.crowdsec).toBeDefined();
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard data structure', async () => {
      const data = await aggregator.getDashboardData();

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('overview');
      expect(data).toHaveProperty('recent_alerts');
      expect(data).toHaveProperty('agent_status');
      expect(data).toHaveProperty('active_cases');
      expect(data).toHaveProperty('threat_intel');
      expect(data).toHaveProperty('system_health');
    });

    it('should have valid overview data', async () => {
      const data = await aggregator.getDashboardData();

      expect(data.overview).toHaveProperty('total_alerts');
      expect(data.overview).toHaveProperty('critical_alerts');
      expect(data.overview).toHaveProperty('agents_active');
      expect(data.overview).toHaveProperty('agents_disconnected');
      expect(data.overview).toHaveProperty('open_cases');
      expect(data.overview).toHaveProperty('threat_level');
    });

    it('should have valid threat level', async () => {
      const data = await aggregator.getDashboardData();

      expect(['low', 'medium', 'high', 'critical']).toContain(data.overview.threat_level);
    });

    it('should have timestamp in ISO format', async () => {
      const data = await aggregator.getDashboardData();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('getServiceHealth', () => {
    it('should return health status for all services', async () => {
      const health = await aggregator.getServiceHealth();

      expect(Array.isArray(health)).toBe(true);
      expect(health.length).toBeGreaterThan(0);
    });

    it('should have valid health check structure', async () => {
      const health = await aggregator.getServiceHealth();

      health.forEach((service) => {
        expect(service).toHaveProperty('service');
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('last_check');
        expect(['healthy', 'unhealthy']).toContain(service.status);
      });
    });

    it('should check wazuh service', async () => {
      const health = await aggregator.getServiceHealth();
      const wazuhHealth = health.find((s) => s.service === 'wazuh');

      expect(wazuhHealth).toBeDefined();
    });

    it('should check elasticsearch service', async () => {
      const health = await aggregator.getServiceHealth();
      const esHealth = health.find((s) => s.service === 'elasticsearch');

      expect(esHealth).toBeDefined();
    });

    it('should check thehive service', async () => {
      const health = await aggregator.getServiceHealth();
      const thehiveHealth = health.find((s) => s.service === 'thehive');

      expect(thehiveHealth).toBeDefined();
    });
  });

  describe('threat level calculation', () => {
    it('should calculate threat level based on metrics', async () => {
      const data = await aggregator.getDashboardData();

      expect(data.overview.threat_level).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(
        data.overview.threat_level
      );
    });
  });

  describe('system health', () => {
    it('should include system health for all hosts', async () => {
      const data = await aggregator.getDashboardData();

      expect(data.system_health).toHaveProperty('vmi01');
      expect(data.system_health).toHaveProperty('vmi02d');
      expect(data.system_health).toHaveProperty('vmi03');
    });

    it('should have valid system health structure', async () => {
      const data = await aggregator.getDashboardData();

      Object.values(data.system_health).forEach((host) => {
        expect(host).toHaveProperty('hostname');
        expect(host).toHaveProperty('timestamp');
        expect(host).toHaveProperty('cpu');
        expect(host).toHaveProperty('memory');
        expect(host).toHaveProperty('disk');
        expect(host).toHaveProperty('network');
      });
    });
  });

  describe('threat intelligence', () => {
    it('should include threat intelligence data', async () => {
      const data = await aggregator.getDashboardData();

      expect(data.threat_intel).toHaveProperty('banned_ips');
      expect(data.threat_intel).toHaveProperty('active_decisions');
      expect(data.threat_intel).toHaveProperty('top_scenarios');
    });

    it('should have valid active decisions structure', async () => {
      const data = await aggregator.getDashboardData();

      expect(Array.isArray(data.threat_intel.active_decisions)).toBe(true);

      data.threat_intel.active_decisions.forEach((decision) => {
        expect(decision).toHaveProperty('origin');
        expect(decision).toHaveProperty('type');
        expect(decision).toHaveProperty('scope');
        expect(decision).toHaveProperty('value');
        expect(decision).toHaveProperty('scenario');
      });
    });
  });
});
