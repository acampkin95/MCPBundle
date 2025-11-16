/**
 * Logger utility using Winston
 */

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

// Safe JSON stringify that handles circular references and errors
function safeStringify(obj: unknown): string {
  const seen = new WeakSet();

  return JSON.stringify(obj, (_key, value) => {
    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        code: (value as { code?: string }).code,
      };
    }

    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  });
}

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'soc-hub-mcp' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0 && meta.service) {
            delete meta.service;
            if (Object.keys(meta).length > 0) {
              try {
                msg += ` ${safeStringify(meta)}`;
              } catch (_err) {
                msg += ' [Error serializing metadata]';
              }
            }
          }
          return msg;
        })
      ),
    }),
  ],
});

// Create a stream for HTTP request logging
export const httpLoggerStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};
