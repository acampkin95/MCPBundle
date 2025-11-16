/**
 * SOC Hub Express API Server
 * REST API endpoints for accessing SOC data
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { SOCAggregator } from '../services/socAggregator.js';
import { logger } from '../utils/logger.js';
import type { APIResponse } from '../types/index.js';

export class SOCHubServer {
  private app: express.Application;
  private aggregator: SOCAggregator;
  private rateLimiter: RateLimiterMemory;
  private port: number;

  public constructor(aggregator: SOCAggregator, config: { port: number; allowed_origins?: string[] }) {
    this.aggregator = aggregator;
    this.port = config.port;
    this.app = express();

    // Rate limiting
    this.rateLimiter = new RateLimiterMemory({
      points: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      duration: Number(process.env.RATE_LIMIT_WINDOW_MS) / 1000 || 60,
    });

    this.setupMiddleware(config.allowed_origins);
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(allowed_origins?: string[]): void {
    // Security headers
    this.app.use(helmet());

    // CORS
    const origins = allowed_origins || process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3100'];
    this.app.use(
      cors({
        origin: origins,
        credentials: true,
      })
    );

    // Compression
    this.app.use(compression());

    // JSON parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting middleware
    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        await this.rateLimiter.consume(req.ip || 'unknown');
        next();
      } catch (_error) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
          },
        });
      }
    });

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.http(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', async (_req: Request, res: Response) => {
      try {
        const services = await this.aggregator.getServiceHealth();
        const allHealthy = services.every((s) => s.status === 'healthy');

        res.status(allHealthy ? 200 : 503).json({
          success: true,
          data: {
            status: allHealthy ? 'healthy' : 'degraded',
            services,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (_error) {
        res.status(503).json({
          success: false,
          error: {
            code: 'HEALTH_CHECK_FAILED',
            message: 'Health check failed',
          },
        });
      }
    });

    // Get complete dashboard data
    router.get('/dashboard', async (_req: Request, res: Response) => {
      try {
        const data = await this.aggregator.getDashboardData();
        this.sendSuccess(res, data);
      } catch (error) {
        this.sendError(res, 500, 'DASHBOARD_ERROR', 'Failed to fetch dashboard data', error);
      }
    });

    // Get Wazuh agents
    router.get('/agents', async (_req: Request, res: Response) => {
      try {
        const agents = await this.aggregator.wazuh.getAgents();
        this.sendSuccess(res, agents);
      } catch (error) {
        this.sendError(res, 500, 'AGENTS_ERROR', 'Failed to fetch agents', error);
      }
    });

    // Get agent summary
    router.get('/agents/summary', async (_req: Request, res: Response) => {
      try {
        const summary = await this.aggregator.wazuh.getAgentsSummary();
        this.sendSuccess(res, summary);
      } catch (error) {
        this.sendError(res, 500, 'AGENTS_SUMMARY_ERROR', 'Failed to fetch agents summary', error);
      }
    });

    // Get Wazuh alerts
    router.get('/alerts/wazuh', async (req: Request, res: Response) => {
      try {
        const filter = {
          limit: Number(req.query.limit) || 100,
          offset: Number(req.query.offset) || 0,
          severity: req.query.severity ? String(req.query.severity).split(',').map(Number) : undefined,
          agent_id: req.query.agent_id ? String(req.query.agent_id).split(',') : undefined,
        };

        const alerts = await this.aggregator.wazuh.getAlerts(filter);
        this.sendSuccess(res, alerts);
      } catch (error) {
        this.sendError(res, 500, 'WAZUH_ALERTS_ERROR', 'Failed to fetch Wazuh alerts', error);
      }
    });

    // Get Suricata alerts
    router.get('/alerts/suricata', async (req: Request, res: Response) => {
      try {
        const options = {
          limit: Number(req.query.limit) || 100,
          severity: req.query.severity ? String(req.query.severity).split(',').map(Number) : undefined,
          from: req.query.from ? String(req.query.from) : undefined,
          to: req.query.to ? String(req.query.to) : undefined,
        };

        const alerts = await this.aggregator.elasticsearch.getSuricataAlerts(options);
        this.sendSuccess(res, alerts);
      } catch (error) {
        this.sendError(res, 500, 'SURICATA_ALERTS_ERROR', 'Failed to fetch Suricata alerts', error);
      }
    });

    // Get Falco alerts
    router.get('/alerts/falco', async (req: Request, res: Response) => {
      try {
        const options = {
          limit: Number(req.query.limit) || 100,
          priority: req.query.priority ? String(req.query.priority).split(',') : undefined,
          from: req.query.from ? String(req.query.from) : undefined,
          to: req.query.to ? String(req.query.to) : undefined,
        };

        const alerts = await this.aggregator.elasticsearch.getFalcoAlerts(options);
        this.sendSuccess(res, alerts);
      } catch (error) {
        this.sendError(res, 500, 'FALCO_ALERTS_ERROR', 'Failed to fetch Falco alerts', error);
      }
    });

    // Get TheHive cases
    router.get('/cases', async (req: Request, res: Response) => {
      try {
        const filter = {
          status: req.query.status ? String(req.query.status).split(',') : undefined,
          severity: req.query.severity ? String(req.query.severity).split(',').map(Number) : undefined,
          limit: Number(req.query.limit) || 50,
        };

        const cases = await this.aggregator.thehive.getCases(filter);
        this.sendSuccess(res, cases);
      } catch (error) {
        this.sendError(res, 500, 'CASES_ERROR', 'Failed to fetch cases', error);
      }
    });

    // Get specific case
    router.get('/cases/:id', async (req: Request, res: Response) => {
      try {
        const caseData = await this.aggregator.thehive.getCase(req.params.id || '');
        if (!caseData) {
          this.sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
          return;
        }
        this.sendSuccess(res, caseData);
      } catch (error) {
        this.sendError(res, 500, 'CASE_ERROR', 'Failed to fetch case', error);
      }
    });

    // Create case
    router.post('/cases', async (req: Request, res: Response) => {
      try {
        const { title, description, severity, tags, tlp } = req.body;

        if (!title || !description || severity === undefined) {
          this.sendError(res, 400, 'INVALID_INPUT', 'Missing required fields: title, description, severity');
          return;
        }

        const caseData = await this.aggregator.thehive.createCase({
          title,
          description,
          severity,
          tags,
          tlp,
        });

        if (!caseData) {
          this.sendError(res, 500, 'CASE_CREATION_FAILED', 'Failed to create case');
          return;
        }

        this.sendSuccess(res, caseData, 201);
      } catch (error) {
        this.sendError(res, 500, 'CASE_CREATION_ERROR', 'Error creating case', error);
      }
    });

    // Get CrowdSec threat intel
    router.get('/threat-intel/crowdsec', async (_req: Request, res: Response) => {
      try {
        const stats = await this.aggregator.crowdsec.getStats();
        const topScenarios = await this.aggregator.crowdsec.getTopScenarios(10);
        const activeBans = await this.aggregator.crowdsec.getActiveBans();

        this.sendSuccess(res, {
          stats,
          top_scenarios: topScenarios,
          active_bans: activeBans.slice(0, 50), // Limit to 50 for performance
        });
      } catch (error) {
        this.sendError(res, 500, 'CROWDSEC_ERROR', 'Failed to fetch CrowdSec data', error);
      }
    });

    // Get Elasticsearch statistics
    router.get('/stats/elasticsearch', async (req: Request, res: Response) => {
      try {
        const timeRange = req.query.from && req.query.to
          ? { from: String(req.query.from), to: String(req.query.to) }
          : undefined;

        const stats = await this.aggregator.elasticsearch.getAlertStats(timeRange);
        const topTargets = await this.aggregator.elasticsearch.getTopTargets(10);

        this.sendSuccess(res, { ...stats, top_targets: topTargets });
      } catch (error) {
        this.sendError(res, 500, 'ELASTICSEARCH_STATS_ERROR', 'Failed to fetch Elasticsearch stats', error);
      }
    });

    // Search by IP
    router.get('/search/ip/:ip', async (req: Request, res: Response) => {
      try {
        const results = await this.aggregator.elasticsearch.searchByIP(req.params.ip || '', 100);
        this.sendSuccess(res, results);
      } catch (error) {
        this.sendError(res, 500, 'IP_SEARCH_ERROR', 'Failed to search by IP', error);
      }
    });

    this.app.use('/api/v1', router);

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        service: 'SOC Hub MCP Server',
        version: '0.2.0',
        status: 'running',
        endpoints: {
          health: '/api/v1/health',
          dashboard: '/api/v1/dashboard',
          agents: '/api/v1/agents',
          alerts: {
            wazuh: '/api/v1/alerts/wazuh',
            suricata: '/api/v1/alerts/suricata',
            falco: '/api/v1/alerts/falco',
          },
          cases: '/api/v1/cases',
          threat_intel: '/api/v1/threat-intel/crowdsec',
          stats: '/api/v1/stats/elasticsearch',
        },
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
        },
      });
    });

    // Global error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        },
      });
    });
  }

  /**
   * Send success response
   */
  private sendSuccess<T>(res: Response, data: T, status: number = 200): void {
    const response: APIResponse<T> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
    res.status(status).json(response);
  }

  /**
   * Send error response
   */
  private sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
    const response: APIResponse<never> = {
      success: false,
      error: {
        code,
        message,
        details: process.env.NODE_ENV === 'development' ? details : undefined,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
    res.status(status).json(response);
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        logger.info(`SOC Hub server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Get Express app instance
   */
  public getApp(): express.Application {
    return this.app;
  }
}
