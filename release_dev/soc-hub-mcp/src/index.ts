#!/usr/bin/env node
/**
 * SOC Hub MCP Server
 * Main entry point - initializes services and starts server
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SOCAggregator } from './services/socAggregator.js';
import { SOCHubServer } from './api/server.js';
import { logger } from './utils/logger.js';
import { z } from 'zod';

/**
 * Initialize SOC Aggregator
 */
function initializeAggregator(): SOCAggregator {
  const config = {
    wazuh: {
      url: process.env.WAZUH_API_URL || 'https://154.26.158.31:55000',
      user: process.env.WAZUH_API_USER || 'admin',
      password: process.env.WAZUH_API_PASSWORD || '',
      verify_ssl: process.env.WAZUH_VERIFY_SSL === 'true',
    },
    elasticsearch: {
      url: process.env.ELASTICSEARCH_URL || 'http://154.26.158.31:9200',
      user: process.env.ELASTICSEARCH_USER || 'elastic',
      password: process.env.ELASTICSEARCH_PASSWORD || '',
    },
    thehive: {
      url: process.env.THEHIVE_URL || 'http://154.26.158.31:9000',
      api_key: process.env.THEHIVE_API_KEY || '',
    },
    crowdsec_hosts: [
      { name: 'vmi01', ip: '46.250.243.123' },
      { name: 'vmi02d', ip: '46.250.241.70' },
      { name: 'vmi03', ip: '154.26.158.31' },
    ],
  };

  return new SOCAggregator(config);
}

/**
 * Start HTTP API server
 */
async function startHttpServer(aggregator: SOCAggregator): Promise<void> {
  const port = Number(process.env.PORT) || 3200;
  const server = new SOCHubServer(aggregator, {
    port,
    allowed_origins: process.env.ALLOWED_ORIGINS?.split(','),
  });

  await server.start();
  logger.info(`HTTP API server started on port ${port}`);
}

/**
 * Start MCP stdio server
 */
async function startMCPServer(aggregator: SOCAggregator): Promise<void> {
  const server = new Server(
    {
      name: 'soc-hub-mcp',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register MCP tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'soc_get_dashboard',
          description: 'Get complete SOC dashboard overview with alerts, agents, cases, and threat intelligence',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'soc_get_agents',
          description: 'Get all Wazuh agents with their status',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'soc_get_alerts',
          description: 'Get security alerts from Wazuh, Suricata, and Falco',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['wazuh', 'suricata', 'falco', 'all'],
                description: 'Alert source to query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of alerts to return',
                default: 50,
              },
              severity: {
                type: 'array',
                items: { type: 'number' },
                description: 'Filter by severity levels',
              },
            },
          },
        },
        {
          name: 'soc_get_cases',
          description: 'Get incident response cases from TheHive',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by case status (Open, Resolved, etc.)',
              },
              severity: {
                type: 'array',
                items: { type: 'number' },
                description: 'Filter by severity (1-4)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of cases to return',
                default: 20,
              },
            },
          },
        },
        {
          name: 'soc_create_case',
          description: 'Create a new incident response case in TheHive',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Case title',
              },
              description: {
                type: 'string',
                description: 'Case description',
              },
              severity: {
                type: 'number',
                description: 'Severity level (1=Low, 2=Medium, 3=High, 4=Critical)',
                enum: [1, 2, 3, 4],
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Case tags',
              },
              tlp: {
                type: 'number',
                description: 'TLP (Traffic Light Protocol) level',
                enum: [0, 1, 2, 3],
              },
            },
            required: ['title', 'description', 'severity'],
          },
        },
        {
          name: 'soc_get_threat_intel',
          description: 'Get threat intelligence data from CrowdSec (banned IPs, top scenarios)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'soc_search_ip',
          description: 'Search for security events related to a specific IP address',
          inputSchema: {
            type: 'object',
            properties: {
              ip: {
                type: 'string',
                description: 'IP address to search for',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 50,
              },
            },
            required: ['ip'],
          },
        },
        {
          name: 'soc_health_check',
          description: 'Check health status of all SOC services',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'soc_get_dashboard': {
          const data = await aggregator.getDashboardData();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data, null, 2),
              },
            ],
          };
        }

        case 'soc_get_agents': {
          const agents = await aggregator.wazuh.getAgents();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(agents, null, 2),
              },
            ],
          };
        }

        case 'soc_get_alerts': {
          const schema = z.object({
            source: z.enum(['wazuh', 'suricata', 'falco', 'all']).default('all'),
            limit: z.number().default(50),
            severity: z.array(z.number()).optional(),
          });
          const params = schema.parse(args);

          let alerts: unknown[] = [];

          if (params.source === 'wazuh' || params.source === 'all') {
            const wazuhAlerts = await aggregator.wazuh.getAlerts({
              limit: params.limit,
              severity: params.severity,
            });
            alerts = [...alerts, ...wazuhAlerts];
          }

          if (params.source === 'suricata' || params.source === 'all') {
            const suricataAlerts = await aggregator.elasticsearch.getSuricataAlerts({
              limit: params.limit,
              severity: params.severity,
            });
            alerts = [...alerts, ...suricataAlerts];
          }

          if (params.source === 'falco' || params.source === 'all') {
            const falcoAlerts = await aggregator.elasticsearch.getFalcoAlerts({
              limit: params.limit,
            });
            alerts = [...alerts, ...falcoAlerts];
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(alerts, null, 2),
              },
            ],
          };
        }

        case 'soc_get_cases': {
          const schema = z.object({
            status: z.array(z.string()).optional(),
            severity: z.array(z.number()).optional(),
            limit: z.number().default(20),
          });
          const params = schema.parse(args);

          const cases = await aggregator.thehive.getCases(params);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(cases, null, 2),
              },
            ],
          };
        }

        case 'soc_create_case': {
          const schema = z.object({
            title: z.string(),
            description: z.string(),
            severity: z.number().min(1).max(4),
            tags: z.array(z.string()).optional(),
            tlp: z.number().min(0).max(3).optional(),
          });
          const params = schema.parse(args);

          const caseData = await aggregator.thehive.createCase(params);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(caseData, null, 2),
              },
            ],
          };
        }

        case 'soc_get_threat_intel': {
          const stats = await aggregator.crowdsec.getStats();
          const topScenarios = await aggregator.crowdsec.getTopScenarios(10);
          const activeBans = await aggregator.crowdsec.getActiveBans();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ stats, topScenarios, activeBans: activeBans.slice(0, 50) }, null, 2),
              },
            ],
          };
        }

        case 'soc_search_ip': {
          const schema = z.object({
            ip: z.string(),
            limit: z.number().default(50),
          });
          const params = schema.parse(args);

          const results = await aggregator.elasticsearch.searchByIP(params.ip, params.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'soc_health_check': {
          const health = await aggregator.getServiceHealth();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(health, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP stdio server started');
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting SOC Hub MCP Server...');

    // Initialize aggregator
    const aggregator = initializeAggregator();

    // Start servers based on mode
    const mode = process.env.SERVER_MODE || 'http';

    if (mode === 'http' || mode === 'both') {
      await startHttpServer(aggregator);
    }

    if (mode === 'mcp' || mode === 'both') {
      await startMCPServer(aggregator);
    }

    logger.info(`SOC Hub server started successfully in ${mode} mode`);
  } catch (error) {
    logger.error('Failed to start SOC Hub server', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the application
void main();
