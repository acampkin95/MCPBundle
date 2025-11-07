#!/usr/bin/env node
/**
 * Application Health Agent
 * MCP-based application monitoring and auto-recovery agent
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as promClient from 'prom-client';
import winston from 'winston';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as cron from 'node-cron';
import * as http from 'http';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as si from 'systeminformation';

const execAsync = promisify(exec);

interface ServiceConfig {
  name: string;
  type: 'process' | 'systemd';
  process_name?: string;
  service_name?: string;
  port: number;
  health_endpoint?: string;
  critical: boolean;
  auto_restart: boolean;
  max_restart_attempts?: number;
  restart_delay?: number;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  running: boolean;
  cpu_percent: number;
  memory_mb: number;
  uptime_seconds: number;
  restart_count: number;
  last_check: Date;
  response_time_ms?: number;
  error_message?: string;
}

class AppHealthAgent {
  private config: any;
  private logger: winston.Logger;
  private dbPool: Pool;
  private redis: Redis;
  private mcpClient: Client | null = null;
  private registry: promClient.Registry;
  private metrics: any;
  private serviceStatuses: Map<string, ServiceStatus> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private isShuttingDown = false;

  constructor(configPath: string) {
    this.config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    this.logger = this.setupLogger();
    this.registry = new promClient.Registry();
    this.metrics = this.setupMetrics();
    this.dbPool = this.setupDatabase();
    this.redis = this.setupRedis();
  }

  private setupLogger(): winston.Logger {
    const transports: winston.transport[] = [];
    if (this.config.logging.console_enabled) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) =>
            `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
          )
        )
      }));
    }
    if (this.config.logging.file_enabled) {
      const logDir = path.dirname(this.config.logging.file_path);
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      transports.push(new winston.transports.File({
        filename: this.config.logging.file_path,
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        maxsize: parseInt(this.config.logging.max_size) || 100 * 1024 * 1024,
        maxFiles: this.config.logging.max_files
      }));
    }
    return winston.createLogger({ level: this.config.logging.level, transports });
  }

  private setupMetrics() {
    return {
      heartbeat: new promClient.Counter({
        name: 'app_health_heartbeat_total',
        help: 'Total heartbeats',
        labelNames: ['agent', 'vm'],
        registers: [this.registry]
      }),
      serviceStatus: new promClient.Gauge({
        name: 'service_status',
        help: 'Service status (1=healthy, 0=unhealthy)',
        labelNames: ['service', 'type'],
        registers: [this.registry]
      }),
      serviceCpu: new promClient.Gauge({
        name: 'service_cpu_percent',
        help: 'Service CPU usage',
        labelNames: ['service'],
        registers: [this.registry]
      }),
      serviceMemory: new promClient.Gauge({
        name: 'service_memory_mb',
        help: 'Service memory usage in MB',
        labelNames: ['service'],
        registers: [this.registry]
      }),
      serviceRestarts: new promClient.Counter({
        name: 'service_restarts_total',
        help: 'Total service restarts',
        labelNames: ['service'],
        registers: [this.registry]
      }),
      responseTime: new promClient.Histogram({
        name: 'service_response_time_ms',
        help: 'Service response time',
        labelNames: ['service'],
        buckets: [10, 50, 100, 500, 1000, 5000],
        registers: [this.registry]
      }),
      errors: new promClient.Counter({
        name: 'app_health_errors_total',
        help: 'Total errors',
        labelNames: ['type'],
        registers: [this.registry]
      })
    };
  }

  private setupDatabase(): Pool {
    const password = process.env[this.config.database.password_env];
    if (!password) throw new Error(`DB password not found: ${this.config.database.password_env}`);
    return new Pool({
      host: this.config.database.host,
      port: this.config.database.port,
      database: this.config.database.database,
      user: this.config.database.user,
      password,
      max: this.config.database.max_connections,
      idleTimeoutMillis: this.config.database.idle_timeout,
      connectionTimeoutMillis: this.config.database.connection_timeout
    });
  }

  private setupRedis(): Redis {
    const password = process.env[this.config.redis.password_env];
    return new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: password || undefined,
      db: this.config.redis.db,
      keyPrefix: this.config.redis.key_prefix,
      retryStrategy: (times) => times > 10 ? null : Math.min(times * 100, 3000)
    });
  }

  private async checkService(service: ServiceConfig): Promise<ServiceStatus> {
    const startTime = Date.now();
    let status: ServiceStatus = {
      name: service.name,
      status: 'unknown',
      running: false,
      cpu_percent: 0,
      memory_mb: 0,
      uptime_seconds: 0,
      restart_count: this.restartAttempts.get(service.name) || 0,
      last_check: new Date()
    };

    try {
      if (service.type === 'process') {
        const processes = await si.processes();
        const proc = processes.list.find(p => 
          service.process_name && new RegExp(service.process_name).test(p.command)
        );
        
        if (proc) {
          status.running = true;
          status.cpu_percent = proc.cpu || 0;
          status.memory_mb = (proc.mem_rss || 0) / (1024 * 1024);
          status.uptime_seconds = Math.floor(Date.now() / 1000 - (proc.started ? new Date(proc.started).getTime() / 1000 : 0));
        }
      } else if (service.type === 'systemd') {
        const { stdout } = await execAsync(`systemctl is-active ${service.service_name}`);
        status.running = stdout.trim() === 'active';
      }

      if (service.health_endpoint && status.running) {
        const response = await axios.get(service.health_endpoint, { timeout: 5000 });
        status.response_time_ms = Date.now() - startTime;
        status.status = response.status === 200 ? 'healthy' : 'degraded';
      } else {
        status.status = status.running ? 'healthy' : 'unhealthy';
      }

      this.metrics.serviceStatus.set(
        { service: service.name, type: service.type },
        status.status === 'healthy' ? 1 : 0
      );
      this.metrics.serviceCpu.set({ service: service.name }, status.cpu_percent);
      this.metrics.serviceMemory.set({ service: service.name }, status.memory_mb);
      
      if (status.response_time_ms) {
        this.metrics.responseTime.observe({ service: service.name }, status.response_time_ms);
      }

    } catch (error: any) {
      status.status = 'unhealthy';
      status.error_message = error.message;
      this.logger.error(`Health check failed for ${service.name}:`, error);
      this.metrics.errors.inc({ type: 'health_check' });
    }

    this.serviceStatuses.set(service.name, status);
    return status;
  }

  private async recoverService(service: ServiceConfig, status: ServiceStatus): Promise<void> {
    if (!this.config.recovery.enabled || !service.auto_restart) return;

    const attempts = this.restartAttempts.get(service.name) || 0;
    if (attempts >= (service.max_restart_attempts || 3)) {
      this.logger.error(`Max restart attempts reached for ${service.name}`);
      await this.generateAlert('auto_restart_failed', { service: service.name, attempts });
      return;
    }

    this.logger.warn(`Attempting to restart ${service.name} (attempt ${attempts + 1})`);

    try {
      if (service.type === 'systemd') {
        await execAsync(`sudo systemctl restart ${service.service_name}`);
      } else if (service.type === 'process') {
        await execAsync(`sudo systemctl restart ${service.name}`);
      }

      this.restartAttempts.set(service.name, attempts + 1);
      this.metrics.serviceRestarts.inc({ service: service.name });
      
      await new Promise(resolve => setTimeout(resolve, service.restart_delay || 5000));
      
      const newStatus = await this.checkService(service);
      if (newStatus.status === 'healthy') {
        this.logger.info(`Successfully restarted ${service.name}`);
        this.restartAttempts.delete(service.name);
        await this.generateAlert('service_restarted', { service: service.name, attempts: attempts + 1 });
      }
    } catch (error) {
      this.logger.error(`Failed to restart ${service.name}:`, error);
      this.metrics.errors.inc({ type: 'restart' });
    }
  }

  private async monitorServices(): Promise<void> {
    for (const service of this.config.monitoring.services) {
      const status = await this.checkService(service);
      
      if (status.status === 'unhealthy' && service.critical) {
        await this.generateAlert('service_down', { service: service.name, ...status });
        await this.recoverService(service, status);
      } else if (status.status === 'degraded') {
        await this.generateAlert('performance_degraded', { service: service.name, ...status });
      }

      if (status.cpu_percent > this.config.monitoring.thresholds.cpu_percent_max) {
        await this.generateAlert('high_cpu', { service: service.name, cpu: status.cpu_percent });
      }

      if (status.memory_mb > 0) {
        const memPercent = (status.memory_mb / (await si.mem()).total) * 100;
        if (memPercent > this.config.monitoring.thresholds.memory_percent_max) {
          await this.generateAlert('high_memory', { service: service.name, memory_mb: status.memory_mb });
        }
      }

      await this.storeMetrics('service_status', status);
    }
  }

  private async generateAlert(type: string, data: any): Promise<void> {
    if (!this.config.alerts.enabled) return;
    
    const severity = this.getAlertSeverity(type);
    const alert = {
      type,
      severity,
      agent: this.config.agent.name,
      timestamp: new Date().toISOString(),
      data
    };

    this.logger.warn(`Alert: ${type}`, alert);
    
    if (this.config.alerts.channels.includes('redis')) {
      await this.redis.lpush('alerts', JSON.stringify(alert));
      await this.redis.ltrim('alerts', 0, 999);
    }

    await this.dbPool.query(
      'INSERT INTO mcp_ecosystem.system_metrics (agent_id, metric_type, metric_data) VALUES ($1, $2, $3)',
      [this.config.agent.name, 'alert', JSON.stringify(alert)]
    );
  }

  private getAlertSeverity(type: string): string {
    for (const [severity, types] of Object.entries(this.config.alerts.severity_levels)) {
      if ((types as string[]).includes(type)) return severity;
    }
    return 'info';
  }

  private async storeMetrics(type: string, data: any): Promise<void> {
    try {
      await this.dbPool.query(
        'INSERT INTO mcp_ecosystem.system_metrics (agent_id, metric_type, metric_data) VALUES ($1, $2, $3)',
        [this.config.agent.name, type, JSON.stringify(data)]
      );
    } catch (error) {
      this.logger.error(`Failed to store metrics:`, error);
    }
  }

  private async pushMetrics(): Promise<void> {
    try {
      const gateway = new promClient.Pushgateway(
        this.config.prometheus.pushgateway_url,
        { timeout: 5000 },
        this.registry
      );
      await gateway.pushAdd({
        jobName: this.config.prometheus.job_name,
        groupings: this.config.prometheus.labels
      });
    } catch (error) {
      this.logger.error('Failed to push metrics:', error);
    }
  }

  private setupHealthCheck(): void {
    http.createServer(async (req, res) => {
      if (req.url === '/health') {
        const health = {
          status: 'healthy',
          agent: this.config.agent.name,
          timestamp: new Date().toISOString(),
          services: Array.from(this.serviceStatuses.entries()).map(([name, status]) => ({
            name,
            status: status.status
          }))
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } else if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': this.registry.contentType });
        res.end(await this.registry.metrics());
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    }).listen(this.config.monitoring.health_check_port);
  }

  public async start(): Promise<void> {
    this.logger.info(`Starting ${this.config.agent.name}`);
    this.setupHealthCheck();

    cron.schedule(`*/${Math.floor(this.config.monitoring.metrics_interval / 1000)} * * * * *`, async () => {
      if (!this.isShuttingDown) {
        await this.monitorServices();
        await this.pushMetrics();
      }
    });

    this.logger.info('Agent started');
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.logger.info('Shutting down...');
    await this.dbPool.end();
    await this.redis.quit();
    process.exit(0);
  }
}

async function main() {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config/config.yaml');
  const agent = new AppHealthAgent(configPath);
  
  process.on('SIGTERM', () => agent.shutdown());
  process.on('SIGINT', () => agent.shutdown());
  
  await agent.start();
}

if (require.main === module) {
  main().catch(console.error);
}

export default AppHealthAgent;
