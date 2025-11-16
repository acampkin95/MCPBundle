import path from 'node:path';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const boolFromEnv = (value: string | undefined, fallback: boolean) => {
  if (typeof value === 'undefined' || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const numberFromEnv = (value: string | undefined, fallback: number) => {
  if (typeof value === 'undefined' || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const rawEnv = process.env;

const databaseUrl =
  rawEnv.CLOUDFLARE_MCP_DB_URL ?? rawEnv.POSTGRES_CONNECTION_STRING ?? rawEnv.DATABASE_URL;
const apiToken = rawEnv.CLOUDFLARE_API_TOKEN ?? rawEnv.CLOUDFLARE_DNS_API_TOKEN;
const accountId = rawEnv.CLOUDFLARE_ACCOUNT_ID;
const zoneId = rawEnv.CLOUDFLARE_ZONE_ID;
const baseHostname = rawEnv.CLOUDFLARE_BASE_HOSTNAME ?? rawEnv.CLOUDFLARE_MCP_BASE_HOSTNAME;
const heartbeatSecret = rawEnv.CLOUDFLARE_MCP_HEARTBEAT_SECRET;
const logIngestToken = rawEnv.CLOUDFLARE_MCP_LOG_INGEST_TOKEN ?? heartbeatSecret;
const logDbPath = rawEnv.CLOUDFLARE_MCP_LOG_DB ?? path.join(process.cwd(), 'data', 'panel-logs.db');

const requiredEnvEntries: Record<string, string | undefined> = {
  CLOUDFLARE_API_TOKEN: apiToken,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_ZONE_ID: zoneId,
  CLOUDFLARE_BASE_HOSTNAME: baseHostname,
  CLOUDFLARE_MCP_DB_URL: databaseUrl,
  CLOUDFLARE_MCP_HEARTBEAT_SECRET: heartbeatSecret,
  CLOUDFLARE_MCP_LOG_INGEST_TOKEN: logIngestToken,
};

const missingEnv = Object.entries(requiredEnvEntries)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnv.length > 0) {
  logger.error('cloudflare-mcp missing required environment', { missingEnv });
  throw new Error(
    `Missing required environment variables for cloudflare-mcp: ${missingEnv.join(', ')}`
  );
}

if (!rawEnv.CLOUDFLARE_MCP_LOG_INGEST_TOKEN) {
  logger.warn(
    'CLOUDFLARE_MCP_LOG_INGEST_TOKEN not set; falling back to heartbeat secret for ingestion auth'
  );
}

const configSchema = z.object({
  cloudflare: z.object({
    apiToken: z.string().min(10),
    accountId: z.string().min(5),
    zoneId: z.string().min(5),
    baseHostname: z.string().min(3),
    defaultTtl: z.number().int().positive(),
    proxied: z.boolean(),
  }),
  database: z.object({
    url: z.string().url().or(z.string().startsWith('postgres')),
    sslMode: z.enum(['disable', 'allow', 'require']),
  }),
  mesh: z.object({
    heartbeatSecret: z.string().min(16),
    adminToken: z.string().optional(),
    host: z.string().default('0.0.0.0'),
    port: z.number().int().positive(),
    defaultHeartbeatMs: z.number().int().positive(),
    staleThresholdMs: z.number().int().positive(),
    tlsCertPath: z.string().optional(),
    tlsKeyPath: z.string().optional(),
  }),
  monitoring: z.object({
    scanIntervalMs: z.number().int().positive(),
    offlineGraceMs: z.number().int().positive(),
  }),
  logging: z.object({
    dbPath: z.string().min(1),
    ingestToken: z.string().min(16),
    retentionDays: z.number().int().nonnegative(),
    maxEntries: z.number().int().positive(),
    cleanupInterval: z.number().int().positive(),
  }),
});

const parsed = configSchema.parse({
  cloudflare: {
    apiToken: apiToken!,
    accountId: accountId!,
    zoneId: zoneId!,
    baseHostname: baseHostname!,
    defaultTtl: numberFromEnv(rawEnv.CLOUDFLARE_MCP_DEFAULT_TTL, 60),
    proxied: boolFromEnv(rawEnv.CLOUDFLARE_MCP_PROXY_MODE, true),
  },
  database: {
    url: databaseUrl!,
    sslMode:
      (rawEnv.CLOUDFLARE_MCP_DB_SSL_MODE as 'disable' | 'allow' | 'require' | undefined) ?? 'allow',
  },
  mesh: {
    heartbeatSecret: heartbeatSecret!,
    adminToken: rawEnv.CLOUDFLARE_MCP_ADMIN_TOKEN,
    host: rawEnv.CLOUDFLARE_MCP_HOST ?? '0.0.0.0',
    port: numberFromEnv(rawEnv.CLOUDFLARE_MCP_PORT, 3003),
    defaultHeartbeatMs: numberFromEnv(rawEnv.CLOUDFLARE_MCP_HEARTBEAT_MS, 60_000),
    staleThresholdMs: numberFromEnv(rawEnv.CLOUDFLARE_MCP_STALE_MS, 5 * 60_000),
    tlsCertPath: rawEnv.CLOUDFLARE_MCP_TLS_CERT,
    tlsKeyPath: rawEnv.CLOUDFLARE_MCP_TLS_KEY,
  },
  monitoring: {
    scanIntervalMs: numberFromEnv(rawEnv.CLOUDFLARE_MCP_MONITOR_INTERVAL_MS, 60_000),
    offlineGraceMs: numberFromEnv(rawEnv.CLOUDFLARE_MCP_OFFLINE_GRACE_MS, 5 * 60_000),
  },
  logging: {
    dbPath: logDbPath,
    ingestToken: logIngestToken!,
    retentionDays: numberFromEnv(rawEnv.CLOUDFLARE_MCP_LOG_RETENTION_DAYS, 14),
    maxEntries: numberFromEnv(rawEnv.CLOUDFLARE_MCP_LOG_MAX_ROWS, 50_000),
    cleanupInterval: numberFromEnv(rawEnv.CLOUDFLARE_MCP_LOG_CLEANUP_INTERVAL, 250),
  },
});

export type CloudflareRuntimeConfig = typeof parsed;

export const cloudflareConfig: CloudflareRuntimeConfig = parsed;
