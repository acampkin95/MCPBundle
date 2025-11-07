#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { CommandRunner } from "./utils/commandRunner.js";
import { logger } from "./utils/logger.js";

// Service imports
import { SQLitePlannerService } from "./services/sqlitePlanner.js";
import { StructuredThinkingService } from "./services/structuredThinking.js";
import { PostgresManagerService } from "./services/postgresManager.js";
import { RedisManagerService } from "./services/redisManager.js";
import { ServerAdminService } from "./services/serverAdmin.js";
import { DatabaseDiagnosticsService } from "./services/databaseDiagnostics.js";
import { KeycloakManagerService } from "./services/keycloakManager.js";
import { NginxMonitoringService } from "./services/nginxMonitoring.js";
import { SystemMetricsService } from "./services/systemMetrics.js";
import { AutoDiscoveryService } from "./services/autoDiscovery.js";
import { KeycloakAuthService } from "./services/keycloakAuth.js";
import { CommandQueueService } from "./services/commandQueue.js";
import { DatabaseSyncService } from "./services/databaseSync.js";
import { HealthCheckService } from "./services/healthCheck.js";
import { AutomatedMaintenanceService } from "./services/automatedMaintenance.js";
import { ReportingHubService } from "./services/reportingHub.js";
import { CAPABILITIES } from "./config/capabilities.js";

// Tool registration
import { registerTools } from "./tools/registerTools.js";

const instructions = `
This Model Context Protocol server exposes on-server management utilities for Ubuntu infrastructure hosting PostgreSQL, Redis, Keycloak, and NGINX.

SERVER-MCP runs directly on the target Ubuntu server and provides:
- Direct PostgreSQL management (via pg client) - connections, replication, bloat, slow queries, vacuum, reindex, backup
- Direct Redis management (via ioredis client) - info, memory, keyspace, slow log, clients, BGSAVE
- Keycloak Admin API - realm stats, sessions, clients, events, users, secret rotation
- NGINX monitoring - access log stats, error log analysis, config testing, reload
- System metrics - uptime, load, memory, disk, processes, network, journal errors
- Database diagnostics - PostgreSQL, Redis, NGINX, Keycloak, firewall, system health checks
- Ubuntu server administration - packages, services, Docker, PM2, networking, security

Recommended usage:
- Run with elevated privileges when invoking tools that require system access. Many commands automatically add \`sudo\`.
- All operations execute locally (no SSH) - this server runs on the target infrastructure.
- PostgreSQL and Redis connections use direct database clients (not shell commands) for better performance.
- Keycloak operations require valid KEYCLOAK_CLIENT_ID and KEYCLOAK_CLIENT_SECRET environment variables.
- NGINX operations default to standard log locations but can be overridden with parameters.

Environment variables:
- SERVER_MCP_ALLOW_SUDO=true|false (default: true) — disable automatic sudo prefixing
- POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD — PostgreSQL connection
- REDIS_HOST, REDIS_PORT, REDIS_PASSWORD — Redis connection
- KEYCLOAK_BASE_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET — Keycloak Admin API
- NGINX_ACCESS_LOG, NGINX_ERROR_LOG, NGINX_CONFIG_PATH — NGINX file paths
- SERVER_MCP_LOG_LEVEL — Winston log level (debug, info, warn, error)

Integration:
- Designed to work with IT-MCP's distributed agent architecture
- Registers with central agent registry and processes remote commands
- Syncs structured thoughts to central PostgreSQL database
- Sends heartbeat to Redis for distributed coordination
`.trim();

const createServer = () => {
  // Validate required environment variables
  const requiredEnvVars = [
    "POSTGRES_HOST",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error("Missing required environment variables", {
      missing: missingVars,
      hint: "Please set these variables in /etc/server-mcp/server-mcp.env or your environment",
    });
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
  }

  // Validate optional but recommended variables
  const recommendedVars = ["REDIS_HOST", "KEYCLOAK_BASE_URL"];
  const missingRecommended = recommendedVars.filter(varName => !process.env[varName]);

  if (missingRecommended.length > 0) {
    logger.warn("Missing recommended environment variables - some features may be unavailable", {
      missing: missingRecommended,
    });
  }

  const server = new McpServer(
    {
      name: "server-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
      instructions,
    },
  );

  // Initialize CommandRunner
  const allowSudo = process.env.SERVER_MCP_ALLOW_SUDO !== "false";
  const runner = new CommandRunner(allowSudo);

  // Initialize SQLite and structured thinking
  const sqlitePath = process.env.SERVER_MCP_SQLITE_PATH ?? "./mcp_cache.db";
  const planner = new SQLitePlannerService(sqlitePath);
  const structuredThinking = new StructuredThinkingService(planner);

  // Bootstrap markdown resources asynchronously
  void structuredThinking.bootstrapFromWorkspace().catch(() => undefined);

  // Initialize database management services with proper error handling
  let postgresManager: PostgresManagerService | null = null;
  try {
    postgresManager = new PostgresManagerService(runner);
    logger.info("PostgresManagerService initialized");
  } catch (error) {
    logger.warn("PostgresManagerService initialization failed - PostgreSQL operations will be unavailable", { error });
  }

  let redisManager: RedisManagerService | null = null;
  try {
    redisManager = new RedisManagerService();
    logger.info("RedisManagerService initialized");
  } catch (error) {
    logger.warn("RedisManagerService initialization failed - Redis operations will be unavailable", { error });
  }

  let keycloakManager: KeycloakManagerService | null = null;
  try {
    keycloakManager = new KeycloakManagerService();
    logger.info("KeycloakManagerService initialized");
  } catch (error) {
    logger.warn("KeycloakManagerService initialization failed - Keycloak operations will be unavailable", { error });
  }

  // Initialize server administration and monitoring services
  const services = {
    postgresManager,
    redisManager,
    serverAdmin: new ServerAdminService(runner),
    databaseDiagnostics: new DatabaseDiagnosticsService(runner),
    keycloakManager,
    nginxMonitoring: new NginxMonitoringService(runner),
    systemMetrics: new SystemMetricsService(runner),
    structuredThinking,
    reportingHub: new ReportingHubService(structuredThinking),
  };

  // Initialize agent coordination services (optional)
  let autoDiscovery: AutoDiscoveryService | undefined;
  let keycloakAuth: KeycloakAuthService | undefined;
  let commandQueue: CommandQueueService | undefined;
  let databaseSync: DatabaseSyncService | undefined;

  // Get all tool names for capability advertisement
  const toolNames = [
    "database-diagnostics",
    "postgres-manage",
    "redis-manage",
    "keycloak-manage",
    "nginx-monitor",
    "system-metrics",
    "structured-thinking",
  ];

  // Keycloak authentication (optional - for API access and agent registry)
  // Initialize FIRST so AutoDiscoveryService can use it
  const keycloakServerUrl = process.env.KEYCLOAK_BASE_URL;
  const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID;
  const keycloakClientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

  if (keycloakServerUrl && keycloakClientId && keycloakClientSecret) {
    try {
      const keycloakConfig = {
        serverUrl: keycloakServerUrl,
        realm: process.env.KEYCLOAK_REALM ?? "master",
        clientId: keycloakClientId,
        clientSecret: keycloakClientSecret,
      };
      keycloakAuth = new KeycloakAuthService(keycloakConfig);
      void keycloakAuth.authenticate().then(() => {
        logger.info("Keycloak authentication successful");
      }).catch((error) => {
        logger.warn("Keycloak authentication failed", { error });
      });
    } catch (error) {
      logger.warn("KeycloakAuthService initialization failed", { error });
    }
  }

  // Auto-discovery and registration (optional - requires IT_MCP_REGISTRY_URL)
  // Initialized AFTER Keycloak so JWT tokens can be used
  const registryUrl = process.env.IT_MCP_REGISTRY_URL;
  if (registryUrl) {
    try {
      const capabilities = CAPABILITIES.map(c => c.name);
      // Pass keycloakAuth for JWT authentication (if available)
      autoDiscovery = new AutoDiscoveryService(capabilities, toolNames, registryUrl, keycloakAuth);

      // Start heartbeat in background
      void autoDiscovery.register().then(() => {
        autoDiscovery?.startHeartbeat();
        logger.info("Agent auto-discovery registered and heartbeat started");
      }).catch((error) => {
        logger.warn("Agent registration failed - continuing without registry", { error });
      });
    } catch (error) {
      logger.warn("AutoDiscoveryService initialization failed", { error });
    }
  } else {
    logger.info("IT_MCP_REGISTRY_URL not set - running in standalone mode");
  }

  // Command queue (local SQLite queue for distributed work)
  const queuePath = process.env.SERVER_MCP_QUEUE_PATH ?? "./mcp_command_queue.db";
  try {
    commandQueue = new CommandQueueService(queuePath);
    logger.info("CommandQueueService initialized", { queuePath });
  } catch (error) {
    logger.warn("CommandQueueService initialization failed", { error });
  }

  // Database sync (SQLite ↔ PostgreSQL for structured thoughts)
  const postgresConnectionString = process.env.POSTGRES_CONNECTION_STRING;
  if (postgresConnectionString) {
    try {
      databaseSync = new DatabaseSyncService(planner, {
        postgresConnectionString,
        syncIntervalMs: 60000,
        enableAutoSync: true,
      });
      logger.info("DatabaseSyncService initialized and auto-sync started");
    } catch (error) {
      logger.warn("DatabaseSyncService initialization failed", { error });
    }
  }

  // Automated maintenance service (optional)
  let automatedMaintenance: AutomatedMaintenanceService | undefined;
  const enableMaintenance = process.env.AUTO_MAINTENANCE_ENABLED !== "false";
  if (enableMaintenance) {
    try {
      automatedMaintenance = new AutomatedMaintenanceService(postgresManager, redisManager, runner);
      automatedMaintenance.start();
      logger.info("AutomatedMaintenanceService started");
    } catch (error) {
      logger.warn("AutomatedMaintenanceService initialization failed", { error });
    }
  }

  // Health check service
  const healthCheck = new HealthCheckService(postgresManager, redisManager, keycloakManager);

  // Start health check HTTP server
  const healthPort = parseInt(process.env.HEALTH_CHECK_PORT ?? "9090", 10);
  const app = express();

  app.get("/health", async (_req, res) => {
    try {
      const health = await healthCheck.getHealth();
      const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error("Health check failed", { error });
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "SERVER-MCP",
      version: "1.0.0",
      endpoints: {
        health: "/health",
      },
    });
  });

  const httpServer = app.listen(healthPort, () => {
    logger.info(`Health check endpoint available at http://localhost:${healthPort}/health`);
  });

  // Register all tools
  const toolDependencies = {
    ...services,
    databaseSync,
  };
  registerTools(server, toolDependencies);

  logger.info("SERVER-MCP initialized successfully", {
    allowSudo,
    sqlitePath,
    servicesCount: Object.keys(services).length,
    agentCoordination: {
      autoDiscovery: !!autoDiscovery,
      keycloakAuth: !!keycloakAuth,
      commandQueue: !!commandQueue,
      databaseSync: !!databaseSync,
      automatedMaintenance: !!automatedMaintenance,
    },
  });

  return {
    server,
    httpServer,
    cleanup: async () => {
      // Close HTTP server
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          logger.info("Health check HTTP server closed");
          resolve();
        });
      });

      // Cleanup coordination services
      if (automatedMaintenance) {
        automatedMaintenance.destroy();
      }
      if (autoDiscovery) {
        await autoDiscovery.destroy();
      }
      if (keycloakAuth) {
        await keycloakAuth.destroy();
      }
      if (commandQueue) {
        commandQueue.close();
      }
      if (databaseSync) {
        await databaseSync.destroy();
      }
      // Close database connections
      if (postgresManager) {
        await postgresManager.close();
      }
      if (redisManager) {
        await redisManager.close();
      }
      // Note: SQLitePlannerService doesn't have a close() method
      // The database will be closed automatically when the process exits
      logger.info("All services cleaned up");
    },
  };
};

const main = async () => {
  logger.info("Starting SERVER-MCP server");

  const { server, cleanup } = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info("SERVER-MCP server running on stdio");

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await server.close();
    await cleanup();
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

main().catch((error) => {
  logger.error("Fatal error in main", { error });
  process.exit(1);
});
