#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import path from 'node:path';
import express, { type Express } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { cloudflareConfig } from './config/cloudflare.js';
import { buildPanelOverview } from './services/adminPanelView.js';
import { CloudflareDnsService } from './services/cloudflareDnsService.js';
import { HeartbeatService } from './services/heartbeatService.js';
import { MeshHealthMonitor } from './services/meshHealthMonitor.js';
import { MeshRegistryStore, type MeshAgentRecord } from './services/meshRegistry.js';
import { MeshMetricsCollector } from './services/metricsCollector.js';
import {
  LogIngestorService,
  type LogCategory,
  type LogLevel,
  type LogQueryFilters,
} from './services/logIngestor.js';
import { SQLitePlannerService } from './services/sqlitePlanner.js';
import { StructuredThinkingService } from './services/structuredThinking.js';
import { registerTools } from './tools/registerTools.js';
import { logger } from './utils/logger.js';

const instructions = `You are the Cloudflare MCP. Maintain DNS, mesh heartbeat, and policy gates for distributed MCP nodes.
- Enforce MAC-based identity with the heartbeat registry
- Drive Cloudflare DNS updates with audit logging
- Provide tooling for mesh admins to inspect and authorize agents
- Never leak raw credentials or API tokens
`;

const LOG_LEVEL_VALUES = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const LOG_CATEGORY_VALUES = ['application', 'system', 'security', 'audit'] as const;
const SECURITY_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;

const logIngestSchema = z.object({
  service: z.string().min(2).max(96),
  nodeId: z.string().min(2).max(160),
  level: z.enum(LOG_LEVEL_VALUES),
  category: z.enum(LOG_CATEGORY_VALUES).default('application'),
  message: z.string().min(1).max(4000),
  timestamp: z.string().datetime({ offset: true }).optional(),
  stack: z.string().max(16_000).optional(),
  tags: z.array(z.string().min(1).max(48)).max(16).optional(),
  correlationId: z.string().max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
  metrics: z.record(z.number()).optional(),
  pm2: z
    .object({
      name: z.string().max(64).optional(),
      instanceId: z.union([z.string().max(64), z.number()]).optional(),
      restartCount: z.number().int().nonnegative().optional(),
      pid: z.number().int().nonnegative().optional(),
    })
    .optional(),
  investigation: z
    .object({
      status: z.enum(['pending', 'auto_repaired', 'succeeded', 'escalated', 'not_applicable']),
      attemptedAt: z.string().datetime({ offset: true }).optional(),
      actions: z.array(z.string().max(128)).max(8).optional(),
      notes: z.string().max(4000).optional(),
      remediationId: z.string().max(64).optional(),
    })
    .optional(),
  security: z
    .object({
      reason: z.string().min(4).max(512),
      actor: z.string().max(128).optional(),
      sourceIp: z.string().max(64).optional(),
      severity: z.enum(SECURITY_SEVERITY_VALUES).optional(),
      blocked: z.boolean().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
});

const pickQueryParam = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' && value.length ? value : undefined;
};

const parseTimestamp = (value: unknown): number | undefined => {
  const raw = pickQueryParam(value);
  if (!raw) {
    return undefined;
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseLimit = (value: unknown, fallback: number): number => {
  const raw = pickQueryParam(value);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 500);
};

const parseTags = (value: unknown): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return undefined;
};

const parseLogLevel = (value: unknown): LogLevel | undefined => {
  const raw = pickQueryParam(value)?.toLowerCase();
  return LOG_LEVEL_VALUES.find((level) => level === raw) as LogLevel | undefined;
};

const parseLogCategory = (value: unknown): LogCategory | undefined => {
  const raw = pickQueryParam(value)?.toLowerCase();
  return LOG_CATEGORY_VALUES.find((category) => category === raw) as LogCategory | undefined;
};

async function main(): Promise<void> {
  const registry = new MeshRegistryStore({
    connectionString: cloudflareConfig.database.url,
    sslMode: cloudflareConfig.database.sslMode,
  });
  await registry.initialize();

  const credentialSalt = createHash('sha256')
    .update(cloudflareConfig.mesh.heartbeatSecret)
    .digest('hex');

  const dnsService = new CloudflareDnsService({
    apiToken: cloudflareConfig.cloudflare.apiToken,
    accountId: cloudflareConfig.cloudflare.accountId,
    zoneId: cloudflareConfig.cloudflare.zoneId,
    baseHostname: cloudflareConfig.cloudflare.baseHostname,
    defaultTtl: cloudflareConfig.cloudflare.defaultTtl,
    proxied: cloudflareConfig.cloudflare.proxied,
  });

  const heartbeatService = new HeartbeatService(registry, dnsService, {
    sharedSecret: cloudflareConfig.mesh.heartbeatSecret,
    defaultHeartbeatMs: cloudflareConfig.mesh.defaultHeartbeatMs,
    adminToken: cloudflareConfig.mesh.adminToken,
  });

  const planner = new SQLitePlannerService();
  const structuredThinking = new StructuredThinkingService(planner);
  const meshMetrics = new MeshMetricsCollector();
  const logIngestor = new LogIngestorService({
    dbPath: cloudflareConfig.logging.dbPath,
    retentionDays: cloudflareConfig.logging.retentionDays,
    maxEntries: cloudflareConfig.logging.maxEntries,
    cleanupInterval: cloudflareConfig.logging.cleanupInterval,
  });
  logger.info('Log ingestor ready', {
    dbPath: cloudflareConfig.logging.dbPath,
    retentionDays: cloudflareConfig.logging.retentionDays,
    maxEntries: cloudflareConfig.logging.maxEntries,
  });
  const updateAgentMetrics = (agents: MeshAgentRecord[]) => {
    meshMetrics.updateAgents(agents, cloudflareConfig.monitoring.offlineGraceMs);
  };

  const healthMonitor = new MeshHealthMonitor(registry, dnsService, {
    scanIntervalMs: cloudflareConfig.monitoring.scanIntervalMs,
    offlineGraceMs: cloudflareConfig.monitoring.offlineGraceMs,
  });
  healthMonitor.start();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'cloudflare-mcp' });
  });

  app.post('/mesh/heartbeat', async (req, res) => {
    if (!heartbeatService.verifySharedSecret(req.header('x-heartbeat-token'))) {
      logger.warn('Rejected heartbeat: invalid token', { source: req.ip });
      res.status(401).json({ error: 'invalid heartbeat token' });
      return;
    }

    try {
      const response = await heartbeatService.handleHeartbeat(req.body);
      res.json(response);
    } catch (error) {
      logger.error('Heartbeat processing failed', { error, body: req.body });
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/mesh/agents/:agentName/authorize', async (req, res) => {
    const adminToken = req.header('x-admin-token');
    try {
      const record = await heartbeatService.authorizePendingMac(req.params.agentName, adminToken);
      res.json(record);
    } catch (error) {
      logger.warn('MAC authorization request failed', {
        agent: req.params.agentName,
        error,
      });
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/panel/logs/ingest', (req, res) => {
    const ingestKey = req.header('x-ingest-key');
    if (ingestKey !== cloudflareConfig.logging.ingestToken) {
      logger.warn('Rejected log ingest', { source: req.ip });
      res.status(401).json({ error: 'invalid ingest token' });
      return;
    }

    try {
      const payloads = Array.isArray(req.body) ? req.body : [req.body];
      const ingested: Array<{ id: number; deduplicated: boolean; repeatCount: number }> = [];
      for (const candidate of payloads) {
        const parsed = logIngestSchema.safeParse(candidate);
        if (!parsed.success) {
          res.status(400).json({
            error: 'invalid log payload',
            details: parsed.error.flatten(),
          });
          return;
        }
        ingested.push(logIngestor.ingest(parsed.data));
      }
      res.json({ ingested });
    } catch (error) {
      logger.error('Failed to ingest log entry', { error });
      res.status(500).json({ error: 'unable to persist log entry' });
    }
  });

  const hostnameResolver = (agent: MeshAgentRecord) =>
    dnsService.resolveHostname(agent.dnsLabel ?? agent.agentName);

  app.get('/panel/overview', async (_req, res) => {
    try {
      const agents = await registry.listAgents();
      const overview = buildPanelOverview(agents, {
        salt: credentialSalt,
        staleThresholdMs: cloudflareConfig.monitoring.offlineGraceMs,
        hostnameResolver,
      });
      updateAgentMetrics(agents);
      res.json({
        ...overview,
        logSummary: logIngestor.summary(),
        securityEvents: logIngestor.recentSecurityEvents(10),
      });
    } catch (error) {
      logger.error('Failed to build admin panel overview', { error });
      res.status(500).json({ error: 'Unable to build admin panel overview' });
    }
  });

  app.get('/panel/structured-thoughts', (_req, res) => {
    try {
      const timeline = structuredThinking.getTimeline();
      const report = structuredThinking.generateReport(timeline, {
        format: 'json',
        includeTimeline: true,
        maxEntries: 100,
        staleHours: 4,
      });
      res.json({
        summary: report.summary,
        diagnostics: report.diagnostics,
        timeline: report.timeline,
        rendered: report.content,
      });
    } catch (error) {
      logger.error('Failed to export structured thoughts', { error });
      res.status(500).json({ error: 'Unable to export structured thoughts' });
    }
  });

  app.get('/panel/logs', (req, res) => {
    try {
      const filters: LogQueryFilters = {
        service: pickQueryParam(req.query.service),
        nodeId: pickQueryParam(req.query.nodeId ?? req.query.node),
        level: parseLogLevel(req.query.level),
        category: parseLogCategory(req.query.category),
        tags: parseTags(req.query.tags),
        search: pickQueryParam(req.query.search),
        cursor: pickQueryParam(req.query.cursor),
        limit: parseLimit(req.query.limit, 50),
        since: parseTimestamp(req.query.since),
        until: parseTimestamp(req.query.until),
        includePayload: pickQueryParam(req.query.includePayload) === 'true',
      };
      res.json(logIngestor.query(filters));
    } catch (error) {
      logger.error('Failed to query log stream', { error });
      res.status(500).json({ error: 'Unable to query logs' });
    }
  });

  app.get('/panel/logs/summary', (_req, res) => {
    try {
      res.json(logIngestor.summary());
    } catch (error) {
      logger.error('Failed to summarize logs', { error });
      res.status(500).json({ error: 'Unable to summarize logs' });
    }
  });

  app.get('/panel/logs/security', (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, 25);
      const events = logIngestor.recentSecurityEvents(limit);
      res.json({ events });
    } catch (error) {
      logger.error('Failed to enumerate security events', { error });
      res.status(500).json({ error: 'Unable to enumerate security events' });
    }
  });

  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', meshMetrics.contentType);
      res.send(await meshMetrics.metrics());
    } catch (error) {
      logger.error('Failed to emit Prometheus metrics', { error });
      res.status(500).json({ error: 'Unable to expose metrics' });
    }
  });

  const httpServer = createNetworkServer(app);
  httpServer.listen(cloudflareConfig.mesh.port, cloudflareConfig.mesh.host, () => {
    logger.info('Cloudflare MCP heartbeat API ready', {
      host: cloudflareConfig.mesh.host,
      port: cloudflareConfig.mesh.port,
      tls: Boolean(cloudflareConfig.mesh.tlsCertPath && cloudflareConfig.mesh.tlsKeyPath),
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('Shutting down cloudflare-mcp', { signal });
    healthMonitor.stop();
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });
    await registry.close().catch((error) => {
      logger.warn('Failed closing registry connection', { error });
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  const mcpServer = new McpServer({
    name: 'cloudflare-mcp',
    version: '2.0.0',
  });

  registerTools(mcpServer, {
    dnsService,
    registry,
    heartbeatService,
    structuredThinking,
    logIngestor,
    credentialSalt,
    staleThresholdMs: cloudflareConfig.monitoring.offlineGraceMs,
    updatePanelMetrics: updateAgentMetrics,
  });

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport); // Keeps running via stdio
}

function createNetworkServer(app: Express) {
  const certPath = cloudflareConfig.mesh.tlsCertPath;
  const keyPath = cloudflareConfig.mesh.tlsKeyPath;

  if (certPath && keyPath) {
    const cert = readFileSync(path.resolve(certPath));
    const key = readFileSync(path.resolve(keyPath));
    return createHttpsServer({ cert, key }, app);
  }

  return createHttpServer(app);
}

main().catch((error) => {
  logger.error('cloudflare-mcp failed to start', { error });
  process.exitCode = 1;
});
