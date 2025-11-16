#!/usr/bin/env node

/**
 * Database Optimizer Agent
 * MCP-based PostgreSQL performance monitoring and optimization agent
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import * as promClient from 'prom-client';
import winston from 'winston';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';
import * as http from 'http';
import { promisify } from 'util';

// Configuration interface
interface Config {
  agent: {
    name: string;
    version: string;
    environment: string;
  };
  orchestrator: {
    host: string;
    port: number;
    transport: string;
    reconnect_interval: number;
    max_reconnect_attempts: number;
  };
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password_env: string;
    max_connections: number;
    idle_timeout: number;
    connection_timeout: number;
    ssl: boolean;
  };
  redis: {
    host: string;
    port: number;
    password_env: string;
    db: number;
    key_prefix: string;
    ttl: number;
  };
  prometheus: {
    pushgateway_url: string;
    job_name: string;
    push_interval: number;
    labels: Record<string, string>;
  };
  monitoring: {
    metrics_interval: number;
    health_check_port: number;
    thresholds: {
      connection_usage_percent: number;
      cache_hit_ratio_min: number;
      dead_tuples_max: number;
      bloat_ratio_max: number;
      slow_query_ms: number;
      index_scan_ratio_min: number;
    };
    databases: string[];
    excluded_schemas: string[];
  };
  optimization: {
    auto_vacuum_enabled: boolean;
    auto_analyze_enabled: boolean;
    index_recommendations_enabled: boolean;
    query_plan_analysis_enabled: boolean;
    vacuum: {
      threshold_scale_factor: number;
      threshold_tuples: number;
      max_freeze_age: number;
    };
  };
  logging: {
    level: string;
    format: string;
    console_enabled: boolean;
    file_enabled: boolean;
    file_path: string;
    max_size: string;
    max_files: number;
    error_patterns: string[];
  };
  alerts: {
    enabled: boolean;
    channels: string[];
    severity_levels: Record<string, string[]>;
  };
}

// Metrics interfaces
interface DatabaseMetrics {
  database: string;
  connections_active: number;
  connections_total: number;
  transactions_committed: number;
  transactions_rolled_back: number;
  blocks_read: number;
  blocks_hit: number;
  cache_hit_ratio: number;
  temp_files: number;
  temp_bytes: number;
  deadlocks: number;
  conflicts: number;
}

interface TableMetrics {
  schema: string;
  table: string;
  live_tuples: number;
  dead_tuples: number;
  bloat_ratio: number;
  last_vacuum: Date | null;
  last_autovacuum: Date | null;
  last_analyze: Date | null;
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  index_scan_ratio: number;
}

interface IndexMetrics {
  schema: string;
  table: string;
  index: string;
  size_bytes: number;
  scans: number;
  tuples_read: number;
  tuples_fetched: number;
  is_unique: boolean;
  is_valid: boolean;
}

interface SlowQuery {
  query: string;
  calls: number;
  total_time: number;
  mean_time: number;
  max_time: number;
  rows: number;
}

/**
 * Database Optimizer Agent Class
 */
class DatabaseOptimizerAgent {
  private config: Config;
  private logger: winston.Logger;
  private dbPool: Pool;
  private redis: Redis;
  private mcpClient: Client | null = null;
  private registry: promClient.Registry;
  private metrics: {
    heartbeat: promClient.Counter;
    dbConnections: promClient.Gauge;
    cacheHitRatio: promClient.Gauge;
    deadTuples: promClient.Gauge;
    bloatRatio: promClient.Gauge;
    slowQueries: promClient.Counter;
    vacuumRuns: promClient.Counter;
    indexScans: promClient.Gauge;
    metricsCollectionDuration: promClient.Histogram;
    errors: promClient.Counter;
  };
  private isShuttingDown = false;
  private reconnectAttempts = 0;

  constructor(configPath: string) {
    this.config = this.loadConfig(configPath);
    this.logger = this.setupLogger();
    this.registry = new promClient.Registry();
    this.metrics = this.setupMetrics();
    this.dbPool = this.setupDatabase();
    this.redis = this.setupRedis();
  }

  /**
   * Load configuration from YAML file
   */
  private loadConfig(configPath: string): Config {
    try {
      const configFile = fs.readFileSync(configPath, 'utf8');
      return yaml.load(configFile) as Config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      process.exit(1);
    }
  }

  /**
   * Setup Winston logger
   */
  private setupLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    if (this.config.logging.console_enabled) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            })
          ),
        })
      );
    }

    if (this.config.logging.file_enabled) {
      // Ensure log directory exists
      const logDir = path.dirname(this.config.logging.file_path);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      transports.push(
        new winston.transports.File({
          filename: this.config.logging.file_path,
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
          maxsize: parseInt(this.config.logging.max_size) || 100 * 1024 * 1024,
          maxFiles: this.config.logging.max_files,
        })
      );
    }

    return winston.createLogger({
      level: this.config.logging.level,
      transports,
    });
  }

  /**
   * Setup Prometheus metrics
   */
  private setupMetrics() {
    const heartbeat = new promClient.Counter({
      name: 'db_optimizer_heartbeat_total',
      help: 'Total number of heartbeats sent',
      labelNames: ['agent', 'vm'],
      registers: [this.registry],
    });

    const dbConnections = new promClient.Gauge({
      name: 'db_connections_active',
      help: 'Number of active database connections',
      labelNames: ['database'],
      registers: [this.registry],
    });

    const cacheHitRatio = new promClient.Gauge({
      name: 'db_cache_hit_ratio',
      help: 'Database cache hit ratio',
      labelNames: ['database'],
      registers: [this.registry],
    });

    const deadTuples = new promClient.Gauge({
      name: 'db_dead_tuples',
      help: 'Number of dead tuples in tables',
      labelNames: ['schema', 'table'],
      registers: [this.registry],
    });

    const bloatRatio = new promClient.Gauge({
      name: 'db_bloat_ratio',
      help: 'Table bloat ratio',
      labelNames: ['schema', 'table'],
      registers: [this.registry],
    });

    const slowQueries = new promClient.Counter({
      name: 'db_slow_queries_total',
      help: 'Total number of slow queries detected',
      labelNames: ['database'],
      registers: [this.registry],
    });

    const vacuumRuns = new promClient.Counter({
      name: 'db_vacuum_runs_total',
      help: 'Total number of vacuum operations',
      labelNames: ['type'],
      registers: [this.registry],
    });

    const indexScans = new promClient.Gauge({
      name: 'db_index_scans',
      help: 'Number of index scans',
      labelNames: ['schema', 'table', 'index'],
      registers: [this.registry],
    });

    const metricsCollectionDuration = new promClient.Histogram({
      name: 'db_optimizer_metrics_collection_duration_seconds',
      help: 'Duration of metrics collection',
      labelNames: ['operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    const errors = new promClient.Counter({
      name: 'db_optimizer_errors_total',
      help: 'Total number of errors',
      labelNames: ['type'],
      registers: [this.registry],
    });

    return {
      heartbeat,
      dbConnections,
      cacheHitRatio,
      deadTuples,
      bloatRatio,
      slowQueries,
      vacuumRuns,
      indexScans,
      metricsCollectionDuration,
      errors,
    };
  }

  /**
   * Setup PostgreSQL connection pool
   */
  private setupDatabase(): Pool {
    const password = process.env[this.config.database.password_env];
    if (!password) {
      throw new Error(
        `Database password not found in environment variable: ${this.config.database.password_env}`
      );
    }

    return new Pool({
      host: this.config.database.host,
      port: this.config.database.port,
      database: this.config.database.database,
      user: this.config.database.user,
      password,
      max: this.config.database.max_connections,
      idleTimeoutMillis: this.config.database.idle_timeout,
      connectionTimeoutMillis: this.config.database.connection_timeout,
      ssl: this.config.database.ssl,
    });
  }

  /**
   * Setup Redis client
   */
  private setupRedis(): Redis {
    const password = process.env[this.config.redis.password_env];

    return new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: password || undefined,
      db: this.config.redis.db,
      keyPrefix: this.config.redis.key_prefix,
      retryStrategy: (times) => {
        if (times > 10) {
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });
  }

  /**
   * Initialize MCP client connection
   */
  private async initMCPClient(): Promise<void> {
    try {
      this.logger.info('Initializing MCP client connection...');

      const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/orchestrator.js'],
        env: process.env,
      });

      this.mcpClient = new Client(
        {
          name: this.config.agent.name,
          version: this.config.agent.version,
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        }
      );

      await this.mcpClient.connect(transport);
      this.logger.info('MCP client connected successfully');
      this.reconnectAttempts = 0;

      // Register heartbeat
      await this.registerHeartbeat();
    } catch (error) {
      this.logger.error('Failed to initialize MCP client:', error);
      this.metrics.errors.inc({ type: 'mcp_connection' });

      if (this.reconnectAttempts < this.config.orchestrator.max_reconnect_attempts) {
        this.reconnectAttempts++;
        this.logger.info(
          `Reconnection attempt ${this.reconnectAttempts}/${this.config.orchestrator.max_reconnect_attempts}`
        );
        setTimeout(() => this.initMCPClient(), this.config.orchestrator.reconnect_interval);
      } else {
        this.logger.error('Max reconnection attempts reached, exiting...');
        process.exit(1);
      }
    }
  }

  /**
   * Register agent heartbeat with orchestrator
   */
  private async registerHeartbeat(): Promise<void> {
    const heartbeatData = {
      agent_id: this.config.agent.name,
      status: 'active',
      metadata: {
        version: this.config.agent.version,
        vm: 'vmi01',
        role: 'database-optimizer',
        capabilities: ['monitoring', 'optimization', 'analysis'],
      },
    };

    try {
      await this.dbPool.query(
        `
        INSERT INTO mcp_ecosystem.agent_heartbeats (agent_id, status, metadata)
        VALUES ($1, $2, $3)
        ON CONFLICT (agent_id)
        DO UPDATE SET
          status = $2,
          metadata = $3,
          last_heartbeat = CURRENT_TIMESTAMP
      `,
        [heartbeatData.agent_id, heartbeatData.status, JSON.stringify(heartbeatData.metadata)]
      );

      this.metrics.heartbeat.inc({
        agent: this.config.agent.name,
        vm: this.config.prometheus.labels.vm,
      });

      this.logger.debug('Heartbeat registered successfully');
    } catch (error) {
      this.logger.error('Failed to register heartbeat:', error);
      this.metrics.errors.inc({ type: 'heartbeat' });
    }
  }

  /**
   * Collect database metrics
   */
  private async collectDatabaseMetrics(): Promise<void> {
    const end = this.metrics.metricsCollectionDuration.startTimer({
      operation: 'database_metrics',
    });

    try {
      for (const dbName of this.config.monitoring.databases) {
        const query = `
          SELECT
            datname as database,
            numbackends as connections_active,
            xact_commit as transactions_committed,
            xact_rollback as transactions_rolled_back,
            blks_read as blocks_read,
            blks_hit as blocks_hit,
            CASE
              WHEN blks_read + blks_hit > 0
              THEN ROUND((blks_hit::float / (blks_read + blks_hit))::numeric, 4)
              ELSE 0
            END as cache_hit_ratio,
            temp_files,
            temp_bytes,
            deadlocks,
            conflicts
          FROM pg_stat_database
          WHERE datname = $1
        `;

        const result = await this.dbPool.query(query, [dbName]);

        if (result.rows.length > 0) {
          const metrics: DatabaseMetrics = result.rows[0];

          this.metrics.dbConnections.set({ database: dbName }, metrics.connections_active);
          this.metrics.cacheHitRatio.set({ database: dbName }, metrics.cache_hit_ratio);

          // Store in Redis for trend analysis
          await this.redis.zadd(`metrics:database:${dbName}`, Date.now(), JSON.stringify(metrics));
          await this.redis.expire(`metrics:database:${dbName}`, this.config.redis.ttl);

          // Check thresholds and generate alerts
          if (metrics.cache_hit_ratio < this.config.monitoring.thresholds.cache_hit_ratio_min) {
            await this.generateAlert('cache_hit_low', {
              database: dbName,
              current: metrics.cache_hit_ratio,
              threshold: this.config.monitoring.thresholds.cache_hit_ratio_min,
            });
          }

          // Store to PostgreSQL
          await this.storeMetrics('database_metrics', metrics);
        }
      }
    } catch (error) {
      this.logger.error('Failed to collect database metrics:', error);
      this.metrics.errors.inc({ type: 'database_metrics' });
    } finally {
      end();
    }
  }

  /**
   * Collect table metrics
   */
  private async collectTableMetrics(): Promise<void> {
    const end = this.metrics.metricsCollectionDuration.startTimer({ operation: 'table_metrics' });

    try {
      const query = `
        SELECT
          schemaname as schema,
          tablename as table,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          CASE
            WHEN n_live_tup > 0
            THEN ROUND((n_dead_tup::float / n_live_tup)::numeric, 4)
            ELSE 0
          END as bloat_ratio,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          seq_scan,
          seq_tup_read,
          idx_scan,
          idx_tup_fetch,
          CASE
            WHEN seq_scan + idx_scan > 0
            THEN ROUND((idx_scan::float / (seq_scan + idx_scan))::numeric, 4)
            ELSE 0
          END as index_scan_ratio
        FROM pg_stat_user_tables
        WHERE schemaname NOT IN (${this.config.monitoring.excluded_schemas.map((_, i) => `$${i + 1}`).join(',')})
        ORDER BY n_dead_tup DESC, bloat_ratio DESC
        LIMIT 100
      `;

      const result = await this.dbPool.query(query, this.config.monitoring.excluded_schemas);

      for (const row of result.rows) {
        const metrics: TableMetrics = row;

        this.metrics.deadTuples.set(
          { schema: metrics.schema, table: metrics.table },
          metrics.dead_tuples
        );

        this.metrics.bloatRatio.set(
          { schema: metrics.schema, table: metrics.table },
          metrics.bloat_ratio
        );

        // Check thresholds
        if (metrics.dead_tuples > this.config.monitoring.thresholds.dead_tuples_max) {
          await this.generateAlert('vacuum_needed', {
            schema: metrics.schema,
            table: metrics.table,
            dead_tuples: metrics.dead_tuples,
            threshold: this.config.monitoring.thresholds.dead_tuples_max,
          });

          // Auto-vacuum if enabled
          if (this.config.optimization.auto_vacuum_enabled) {
            await this.performVacuum(metrics.schema, metrics.table);
          }
        }

        if (metrics.bloat_ratio > this.config.monitoring.thresholds.bloat_ratio_max) {
          await this.generateAlert('bloat_high', {
            schema: metrics.schema,
            table: metrics.table,
            bloat_ratio: metrics.bloat_ratio,
            threshold: this.config.monitoring.thresholds.bloat_ratio_max,
          });
        }

        if (metrics.index_scan_ratio < this.config.monitoring.thresholds.index_scan_ratio_min) {
          await this.generateAlert('index_recommendation', {
            schema: metrics.schema,
            table: metrics.table,
            index_scan_ratio: metrics.index_scan_ratio,
            seq_scans: metrics.seq_scan,
          });
        }

        await this.storeMetrics('table_metrics', metrics);
      }
    } catch (error) {
      this.logger.error('Failed to collect table metrics:', error);
      this.metrics.errors.inc({ type: 'table_metrics' });
    } finally {
      end();
    }
  }

  /**
   * Collect index metrics
   */
  private async collectIndexMetrics(): Promise<void> {
    const end = this.metrics.metricsCollectionDuration.startTimer({ operation: 'index_metrics' });

    try {
      const query = `
        SELECT
          schemaname as schema,
          tablename as table,
          indexname as index,
          pg_relation_size(indexrelid) as size_bytes,
          idx_scan as scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched,
          indisunique as is_unique,
          indisvalid as is_valid
        FROM pg_stat_user_indexes
        JOIN pg_index ON pg_stat_user_indexes.indexrelid = pg_index.indexrelid
        WHERE schemaname NOT IN (${this.config.monitoring.excluded_schemas.map((_, i) => `$${i + 1}`).join(',')})
        ORDER BY idx_scan DESC, size_bytes DESC
      `;

      const result = await this.dbPool.query(query, this.config.monitoring.excluded_schemas);

      for (const row of result.rows) {
        const metrics: IndexMetrics = row;

        this.metrics.indexScans.set(
          { schema: metrics.schema, table: metrics.table, index: metrics.index },
          metrics.scans
        );

        // Detect unused indexes
        if (metrics.scans === 0 && metrics.size_bytes > 1024 * 1024) {
          // > 1MB
          await this.generateAlert('unused_index', {
            schema: metrics.schema,
            table: metrics.table,
            index: metrics.index,
            size_mb: Math.round(metrics.size_bytes / (1024 * 1024)),
          });
        }

        await this.storeMetrics('index_metrics', metrics);
      }
    } catch (error) {
      this.logger.error('Failed to collect index metrics:', error);
      this.metrics.errors.inc({ type: 'index_metrics' });
    } finally {
      end();
    }
  }

  /**
   * Analyze slow queries
   */
  private async analyzeSlowQueries(): Promise<void> {
    const end = this.metrics.metricsCollectionDuration.startTimer({ operation: 'slow_queries' });

    try {
      // Check if pg_stat_statements extension is available
      const extensionCheck = await this.dbPool.query(`
        SELECT COUNT(*) as count
        FROM pg_extension
        WHERE extname = 'pg_stat_statements'
      `);

      if (extensionCheck.rows[0].count === 0) {
        this.logger.warn(
          'pg_stat_statements extension not installed, skipping slow query analysis'
        );
        return;
      }

      const query = `
        SELECT
          query,
          calls,
          total_exec_time as total_time,
          mean_exec_time as mean_time,
          max_exec_time as max_time,
          rows
        FROM pg_stat_statements
        WHERE mean_exec_time > $1
        ORDER BY mean_exec_time DESC
        LIMIT 50
      `;

      const result = await this.dbPool.query(query, [
        this.config.monitoring.thresholds.slow_query_ms,
      ]);

      for (const row of result.rows) {
        const slowQuery: SlowQuery = row;

        this.metrics.slowQueries.inc({ database: this.config.database.database });

        await this.generateAlert('slow_query_detected', {
          query: slowQuery.query.substring(0, 200),
          mean_time_ms: Math.round(slowQuery.mean_time),
          calls: slowQuery.calls,
        });

        await this.storeMetrics('slow_queries', slowQuery);
      }
    } catch (error) {
      this.logger.error('Failed to analyze slow queries:', error);
      this.metrics.errors.inc({ type: 'slow_queries' });
    } finally {
      end();
    }
  }

  /**
   * Perform vacuum operation on a table
   */
  private async performVacuum(schema: string, table: string): Promise<void> {
    try {
      this.logger.info(`Performing VACUUM on ${schema}.${table}`);

      // Use a separate connection for VACUUM (cannot run in transaction)
      const client = await this.dbPool.connect();
      try {
        await client.query(`VACUUM ANALYZE ${schema}.${table}`);
        this.metrics.vacuumRuns.inc({ type: 'manual' });
        this.logger.info(`VACUUM completed on ${schema}.${table}`);
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.error(`Failed to perform VACUUM on ${schema}.${table}:`, error);
      this.metrics.errors.inc({ type: 'vacuum' });
    }
  }

  /**
   * Store metrics to PostgreSQL
   */
  private async storeMetrics(metricType: string, data: any): Promise<void> {
    try {
      await this.dbPool.query(
        `
        INSERT INTO mcp_ecosystem.system_metrics (
          agent_id, metric_type, metric_data, created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `,
        [this.config.agent.name, metricType, JSON.stringify(data)]
      );
    } catch (error) {
      this.logger.error(`Failed to store ${metricType} metrics:`, error);
    }
  }

  /**
   * Generate alert
   */
  private async generateAlert(alertType: string, data: any): Promise<void> {
    if (!this.config.alerts.enabled) {
      return;
    }

    const severity = this.getAlertSeverity(alertType);
    const alert = {
      type: alertType,
      severity,
      agent: this.config.agent.name,
      timestamp: new Date().toISOString(),
      data,
    };

    this.logger.warn(`Alert generated: ${alertType}`, alert);

    // Store in Redis
    if (this.config.alerts.channels.includes('redis')) {
      await this.redis.lpush('alerts', JSON.stringify(alert));
      await this.redis.ltrim('alerts', 0, 999); // Keep last 1000 alerts
    }

    // Store in PostgreSQL
    await this.dbPool.query(
      `
      INSERT INTO mcp_ecosystem.system_metrics (
        agent_id, metric_type, metric_data
      ) VALUES ($1, 'alert', $2)
    `,
      [this.config.agent.name, JSON.stringify(alert)]
    );
  }

  /**
   * Get alert severity level
   */
  private getAlertSeverity(alertType: string): string {
    for (const [severity, types] of Object.entries(this.config.alerts.severity_levels)) {
      if (types.includes(alertType)) {
        return severity;
      }
    }
    return 'info';
  }

  /**
   * Push metrics to Prometheus Pushgateway
   */
  private async pushMetrics(): Promise<void> {
    try {
      const gateway = new promClient.Pushgateway(
        this.config.prometheus.pushgateway_url,
        {
          timeout: 5000,
        },
        this.registry
      );

      await gateway.pushAdd({
        jobName: this.config.prometheus.job_name,
        groupings: this.config.prometheus.labels,
      });

      this.logger.debug('Metrics pushed to Pushgateway');
    } catch (error) {
      this.logger.error('Failed to push metrics to Pushgateway:', error);
      this.metrics.errors.inc({ type: 'pushgateway' });
    }
  }

  /**
   * Setup health check endpoint
   */
  private setupHealthCheck(): void {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/health') {
        const health = {
          status: 'healthy',
          agent: this.config.agent.name,
          version: this.config.agent.version,
          timestamp: new Date().toISOString(),
          checks: {
            database: await this.checkDatabase(),
            redis: await this.checkRedis(),
            mcp: this.mcpClient !== null,
          },
        };

        const isHealthy = Object.values(health.checks).every((check) => check === true);
        res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } else if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': this.registry.contentType });
        res.end(await this.registry.metrics());
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(this.config.monitoring.health_check_port, () => {
      this.logger.info(
        `Health check endpoint listening on port ${this.config.monitoring.health_check_port}`
      );
    });
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dbPool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start the agent
   */
  public async start(): Promise<void> {
    this.logger.info(`Starting ${this.config.agent.name} v${this.config.agent.version}`);

    // Setup health check endpoint
    this.setupHealthCheck();

    // Initialize MCP client
    await this.initMCPClient();

    // Setup periodic tasks
    cron.schedule(
      `*/${Math.floor(this.config.monitoring.metrics_interval / 1000)} * * * * *`,
      async () => {
        if (!this.isShuttingDown) {
          await this.registerHeartbeat();
          await this.collectDatabaseMetrics();
          await this.collectTableMetrics();
          await this.collectIndexMetrics();
          await this.analyzeSlowQueries();
          await this.pushMetrics();
        }
      }
    );

    this.logger.info('Agent started successfully');
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down gracefully...');

    try {
      // Update agent status
      await this.dbPool.query(
        `
        UPDATE mcp_ecosystem.agent_heartbeats
        SET status = 'stopped'
        WHERE agent_id = $1
      `,
        [this.config.agent.name]
      );

      // Close connections
      if (this.mcpClient) {
        await this.mcpClient.close();
      }
      await this.dbPool.end();
      await this.redis.quit();

      this.logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config/config.yaml');
  const agent = new DatabaseOptimizerAgent(configPath);

  // Handle graceful shutdown
  process.on('SIGTERM', () => agent.shutdown());
  process.on('SIGINT', () => agent.shutdown());

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    agent.shutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    agent.shutdown();
  });

  await agent.start();
}

// Start the agent
if (require.main === module) {
  main().catch(console.error);
}

export default DatabaseOptimizerAgent;
