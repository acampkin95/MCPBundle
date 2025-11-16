import { createLogger, format, transports } from 'winston';
import type { TransformableInfo } from 'logform';
import { AutoInvestigationService } from '../services/autoInvestigationService.js';
import { LogForwarderStream } from './logForwarderStream.js';

const { combine, timestamp, errors, splat, metadata, printf } = format;

const LOG_LEVEL =
  process.env.SERVER_MCP_LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const LOG_INGEST_URL = process.env.SERVER_MCP_LOG_INGEST_URL ?? process.env.LOG_AGGREGATOR_URL;
const LOG_INGEST_TOKEN =
  process.env.SERVER_MCP_LOG_INGEST_TOKEN ?? process.env.LOG_AGGREGATOR_TOKEN;

const autoInvestigator = new AutoInvestigationService({
  serviceName: 'server-mcp',
  pm2ProcessName: process.env.PM2_PROCESS_NAME ?? process.env.name,
});

type LoggerInfo = TransformableInfo & {
  timestamp?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
};

const logFormat = printf((info: LoggerInfo) => {
  const { timestamp: ts, level, message, stack, metadata: meta = {} } = info;

  const normalizedMessage = typeof message === 'string' ? message : JSON.stringify(message);

  const payload: Record<string, unknown> = {
    timestamp: ts,
    level,
    message: stack ?? normalizedMessage,
  };

  if (Object.keys(meta).length) {
    payload.meta = meta;
  }

  return JSON.stringify(payload);
});

export const logger = createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: 'server-mcp' },
  format: combine(
    timestamp(),
    errors({ stack: true }),
    splat(),
    metadata({ fillExcept: ['timestamp', 'level', 'message', 'stack'] }),
    logFormat
  ),
  transports: [
    new transports.Console({
      stderrLevels: ['error', 'warn'],
    }),
    new transports.Stream({
      stream: new LogForwarderStream({
        serviceName: 'server-mcp',
        endpoint: LOG_INGEST_URL,
        token: LOG_INGEST_TOKEN,
        autoInvestigator,
      }),
    }),
  ],
});
