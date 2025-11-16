/**
 * Orchestrator v2.0 Configuration
 *
 * Central configuration for all orchestrator features.
 * Values can be overridden via environment variables.
 */

export interface QueuePriorityConfig {
  readonly level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly sla: number; // milliseconds
  readonly order: number; // lower = higher priority
}

export interface QueueConfig {
  readonly maxSize: number;
  readonly priorities: readonly QueuePriorityConfig[];
  readonly enableSLATracking: boolean;
  readonly slaWarningThreshold: number; // percentage (0-1)
}

export interface AgentConfig {
  readonly heartbeatInterval: number; // milliseconds
  readonly heartbeatTimeout: number; // milliseconds
  readonly maxRetries: number;
  readonly staleConnectionTimeout: number; // milliseconds
}

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelay: number; // milliseconds
  readonly maxDelay: number; // milliseconds
  readonly backoffMultiplier: number;
  readonly jitter: boolean;
}

export interface DeadLetterQueueConfig {
  readonly enabled: boolean;
  readonly maxSize: number;
  readonly retentionDays: number;
  readonly autoReplayEnabled: boolean;
  readonly autoReplayInterval: number; // milliseconds
}

export interface MetricsConfig {
  readonly enabled: boolean;
  readonly prometheusPort: number;
  readonly prometheusPath: string;
  readonly collectDefaultMetrics: boolean;
  readonly defaultLabels: Record<string, string>;
}

export interface EventConfig {
  readonly enabled: boolean;
  readonly maxHistorySize: number;
  readonly retentionDays: number;
}

export interface LoggingConfig {
  readonly level: 'error' | 'warn' | 'info' | 'debug';
  readonly format: 'json' | 'simple';
  readonly timestamp: boolean;
  readonly correlationIdEnabled: boolean;
}

export interface OrchestratorConfig {
  readonly queue: QueueConfig;
  readonly agents: AgentConfig;
  readonly retry: RetryConfig;
  readonly deadLetterQueue: DeadLetterQueueConfig;
  readonly metrics: MetricsConfig;
  readonly events: EventConfig;
  readonly logging: LoggingConfig;
  readonly version: string;
}

/**
 * Default configuration
 */
export const defaultConfig: OrchestratorConfig = {
  queue: {
    maxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '10000', 10),
    priorities: [
      { level: 'CRITICAL', sla: 1000, order: 0 },
      { level: 'HIGH', sla: 5000, order: 1 },
      { level: 'MEDIUM', sla: 30000, order: 2 },
      { level: 'LOW', sla: 60000, order: 3 },
    ],
    enableSLATracking: process.env.ENABLE_SLA_TRACKING !== 'false',
    slaWarningThreshold: parseFloat(process.env.SLA_WARNING_THRESHOLD ?? '0.8'),
  },

  agents: {
    heartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL ?? '30000', 10),
    heartbeatTimeout: parseInt(process.env.AGENT_HEARTBEAT_TIMEOUT ?? '120000', 10),
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES ?? '3', 10),
    staleConnectionTimeout: parseInt(process.env.AGENT_STALE_TIMEOUT ?? '300000', 10),
  },

  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS ?? '3', 10),
    baseDelay: parseInt(process.env.RETRY_BASE_DELAY ?? '1000', 10),
    maxDelay: parseInt(process.env.RETRY_MAX_DELAY ?? '10000', 10),
    backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER ?? '2'),
    jitter: process.env.RETRY_JITTER !== 'false',
  },

  deadLetterQueue: {
    enabled: process.env.DLQ_ENABLED !== 'false',
    maxSize: parseInt(process.env.DLQ_MAX_SIZE ?? '1000', 10),
    retentionDays: parseInt(process.env.DLQ_RETENTION_DAYS ?? '7', 10),
    autoReplayEnabled: process.env.DLQ_AUTO_REPLAY === 'true',
    autoReplayInterval: parseInt(process.env.DLQ_AUTO_REPLAY_INTERVAL ?? '3600000', 10),
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT ?? '9090', 10),
    prometheusPath: process.env.PROMETHEUS_PATH ?? '/metrics',
    collectDefaultMetrics: process.env.COLLECT_DEFAULT_METRICS !== 'false',
    defaultLabels: {
      app: 'mcp-orchestrator',
      version: '2.0.0',
    },
  },

  events: {
    enabled: process.env.EVENTS_ENABLED !== 'false',
    maxHistorySize: parseInt(process.env.EVENT_HISTORY_SIZE ?? '1000', 10),
    retentionDays: parseInt(process.env.EVENT_RETENTION_DAYS ?? '7', 10),
  },

  logging: {
    level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') ?? 'info',
    format: (process.env.LOG_FORMAT as 'json' | 'simple') ?? 'json',
    timestamp: process.env.LOG_TIMESTAMP !== 'false',
    correlationIdEnabled: process.env.LOG_CORRELATION_ID !== 'false',
  },

  version: '2.0.0',
};

/**
 * Get configuration with optional overrides
 */
export function getConfig(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return {
    ...defaultConfig,
    ...overrides,
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: OrchestratorConfig): void {
  // Queue validation
  if (config.queue.maxSize <= 0) {
    throw new Error('queue.maxSize must be positive');
  }

  if (config.queue.slaWarningThreshold < 0 || config.queue.slaWarningThreshold > 1) {
    throw new Error('queue.slaWarningThreshold must be between 0 and 1');
  }

  // Agent validation
  if (config.agents.heartbeatInterval <= 0) {
    throw new Error('agents.heartbeatInterval must be positive');
  }

  if (config.agents.heartbeatTimeout <= config.agents.heartbeatInterval) {
    throw new Error('agents.heartbeatTimeout must be greater than heartbeatInterval');
  }

  // Retry validation
  if (config.retry.maxAttempts < 1) {
    throw new Error('retry.maxAttempts must be at least 1');
  }

  if (config.retry.baseDelay <= 0 || config.retry.maxDelay <= 0) {
    throw new Error('retry delays must be positive');
  }

  if (config.retry.maxDelay < config.retry.baseDelay) {
    throw new Error('retry.maxDelay must be >= baseDelay');
  }

  // DLQ validation
  if (config.deadLetterQueue.maxSize <= 0) {
    throw new Error('deadLetterQueue.maxSize must be positive');
  }

  // Metrics validation
  if (config.metrics.prometheusPort < 1 || config.metrics.prometheusPort > 65535) {
    throw new Error('metrics.prometheusPort must be a valid port number');
  }

  // Events validation
  if (config.events.maxHistorySize <= 0) {
    throw new Error('events.maxHistorySize must be positive');
  }
}
