import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CommandExecutionError } from "../utils/commandRunner.js";
import { logger } from "../utils/logger.js";
import {
  validateDatabaseName,
  validateServiceName,
  validateFilePath,
  ALLOWED_LOG_DIRS,
  ALLOWED_BACKUP_DIRS,
} from "../utils/validators.js";

// Service imports
import type { PostgresManagerService } from "../services/postgresManager.js";
import type { RedisManagerService } from "../services/redisManager.js";
import type { ServerAdminService } from "../services/serverAdmin.js";
import type { DatabaseDiagnosticsService, DatabaseDiagnosticSuite } from "../services/databaseDiagnostics.js";
import type { KeycloakManagerService } from "../services/keycloakManager.js";
import type { NginxMonitoringService } from "../services/nginxMonitoring.js";
import type { SystemMetricsService } from "../services/systemMetrics.js";
import type { StructuredThinkingService, ThoughtTrackingResult, ThoughtRecord } from "../services/structuredThinking.js";
import type { DatabaseSyncService } from "../services/databaseSync.js";
import type { ReportingHubService } from "../services/reportingHub.js";

export interface ToolDependencies {
  readonly postgresManager: PostgresManagerService | null;
  readonly redisManager: RedisManagerService | null;
  readonly serverAdmin: ServerAdminService;
  readonly databaseDiagnostics: DatabaseDiagnosticsService;
  readonly keycloakManager: KeycloakManagerService | null;
  readonly nginxMonitoring: NginxMonitoringService;
  readonly systemMetrics: SystemMetricsService;
  readonly structuredThinking: StructuredThinkingService;
  readonly databaseSync?: DatabaseSyncService;
  readonly reportingHub: ReportingHubService;
}

const formatThinkingResult = (title: string, result: ThoughtTrackingResult): string => {
  const lines = [`# ${title}`, result.summary];

  if (result.feedbackSignals.length) {
    lines.push("\n## Feedback Signals");
    for (const signal of result.feedbackSignals) {
      const scope = signal.branchId ?? signal.stageId ?? "timeline";
      lines.push(`- (${signal.severity}) [${signal.type}] ${scope}: ${signal.message}`);
    }
  }

  if (result.branchInsights.length) {
    lines.push("\n## Branch Overview");
    for (const branch of result.branchInsights) {
      const average = typeof branch.averageQuality === "number" ? branch.averageQuality.toFixed(2) : "n/a";
      lines.push(
        `- ${branch.branchId}: ${branch.health} • thoughts ${branch.thoughtCount} • depth ${branch.maxDepth} • avg quality ${average}`,
      );
    }
  }

  return lines.join("\n");
};

const toTextContent = (title: string, sections: Record<string, string>): string => {
  const lines = [`# ${title}`];
  for (const [key, value] of Object.entries(sections)) {
    lines.push(`\n## ${key}`);
    lines.push(value || "<no output>");
  }
  return lines.join("\n");
};

const handleError = (error: unknown) => {
  if (error instanceof CommandExecutionError) {
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Command failed: ${error.result.command}`,
            error.result.stderr || error.result.stdout || String(error),
          ].join("\n"),
        },
      ],
      structuredContent: {
        error: {
          command: error.result.command,
          stderr: error.result.stderr,
          stdout: error.result.stdout,
          exitCode: error.result.code ?? undefined,
        },
      },
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    structuredContent: {
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    },
  };
};

const DATABASE_SUITES = ["postgres", "redis", "nginx", "keycloak", "firewall", "system"] as const;
const DEFAULT_DATABASE_SUITES: DatabaseDiagnosticSuite[] = ["postgres", "redis", "nginx", "system"];

const safeCaptureReport = (
  reportingHub: ReportingHubService,
  payload: Parameters<ReportingHubService["capture"]>[0],
): void => {
  try {
    reportingHub.capture(payload);
  } catch (error) {
    logger.warn("Failed to capture structured report", {
      tool: payload.tool,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const loadStructuredTimeline = async (
  deps: ToolDependencies,
  storagePath?: string,
): Promise<{ timeline: ThoughtRecord[]; storagePath: string }> => {
  const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
  let timeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
  if (timeline.length === 0) {
    const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
    if (bootstrapped.length) {
      timeline = bootstrapped;
    }
  }
  return {
    timeline,
    storagePath: targetPath,
  };
};

const thoughtMetadataSchema = z
  .object({
    source: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    importance: z.enum(["low", "medium", "high"]).optional(),
    references: z.array(z.string().min(1)).optional(),
    thoughtNumber: z.number().int().min(1).optional(),
    totalThoughts: z.number().int().min(1).optional(),
    nextThoughtNeeded: z.boolean().optional(),
    needsMoreThoughts: z.boolean().optional(),
    isRevision: z.boolean().optional(),
    revisesThought: z.number().int().min(1).optional(),
    branchFromThought: z.number().int().min(1).optional(),
    branchId: z.string().min(1).optional(),
    qualityScore: z.number().min(0).max(1).optional(),
    stageLabel: z.string().optional(),
    devOpsCategory: z.string().optional(),
    debugLayer: z.string().optional(),
    schemaEntities: z.array(z.string()).optional(),
    runtimeStack: z.array(z.string()).optional(),
    branchRootId: z.string().optional(),
    branchDepth: z.number().int().min(0).optional(),
    branchHealth: z.enum(["healthy", "stagnant", "at_risk", "forming", "unknown"]).optional(),
  })
  .passthrough();

const thoughtEntrySchema = z.object({
  stage: z.string().min(1),
  thought: z.string().min(1),
  metadata: thoughtMetadataSchema.optional(),
});

const thoughtUpdateSchema = z.object({
  stage: z.string().min(1).optional(),
  thought: z.string().min(1).optional(),
  metadata: thoughtMetadataSchema.partial().optional(),
});

const thoughtFilterSchema = z
  .object({
    stage: z.string().min(1).optional(),
    branchId: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    importance: z.enum(["low", "medium", "high"]).optional(),
    textIncludes: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    sinceThoughtNumber: z.number().int().min(0).optional(),
  })
  .optional();

const structuredThinkingInputShape = {
  operation: z.enum([
    "capture",
    "revise",
    "retrieve",
    "summary",
    "clear",
    "framework",
    "diagnostics",
    "sync-status",
    "sync-now",
  ]),
  entries: z.array(thoughtEntrySchema).optional(),
  autoNumbering: z.boolean().optional(),
  thoughtId: z.string().min(1).optional(),
  updates: thoughtUpdateSchema.optional(),
  filters: thoughtFilterSchema,
  includeTimeline: z.boolean().optional(),
  staleHours: z.number().int().min(1).max(168).optional(),
} as const;

const structuredThinkingInputSchema = z
  .object(structuredThinkingInputShape)
  .superRefine((value, ctx) => {
    switch (value.operation) {
      case "capture":
        if (!value.entries?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "entries are required for capture operation",
            path: ["entries"],
          });
        }
        break;
      case "revise":
        if (!value.thoughtId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "thoughtId is required for revise operation",
            path: ["thoughtId"],
          });
        }
        if (!value.updates) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "updates are required for revise operation",
            path: ["updates"],
          });
        }
        break;
      default:
        break;
    }
  });

export function registerTools(server: McpServer, deps: ToolDependencies): void {
  logger.info("Registering SERVER-MCP tools");

  // ============================================
  // database-diagnostics
  // ============================================
  server.registerTool(
    "database-diagnostics",
    {
      description:
        "Runs local diagnostics against database services (PostgreSQL, Redis, NGINX, Keycloak, firewall, system).",
      inputSchema: {
        suites: z.array(z.enum(DATABASE_SUITES)).default(DEFAULT_DATABASE_SUITES),
      },
    },
    async ({ suites }) => {
      try {
        const results = await deps.databaseDiagnostics.runLocal(suites as DatabaseDiagnosticSuite[]);

        const sections: Record<string, string> = {};
        for (const item of results) {
          sections[item.label] = item.stdout.trim() || item.stderr.trim() || "<no output>";
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "database-diagnostics",
          summary: `Executed diagnostic suites: ${suites.join(", ")}`,
          sections,
          tags: suites,
          importance: "medium",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Database Diagnostics", sections),
            },
          ],
          structuredContent: {
            suites,
            results,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ============================================
  // postgres-manage
  // ============================================
  server.registerTool(
    "postgres-manage",
    {
      description:
        "Direct PostgreSQL management operations (connections, replication, bloat, slow queries, vacuum, reindex, backup).",
      inputSchema: {
        operation: z.enum([
          "connections",
          "replication",
          "bloat",
          "slow-queries",
          "index-usage",
          "vacuum",
          "reindex",
          "backup",
        ]),
        database: z.string().optional().refine(
          (val) => !val || validateDatabaseName(val),
          { message: "Invalid database name. Must be alphanumeric with underscores, starting with letter or underscore, max 63 characters." }
        ),
        minDurationMs: z.number().int().min(1).max(3600000).optional().describe("Minimum query duration in ms for slow-queries (max 1 hour)"),
        analyze: z.boolean().optional().describe("Run ANALYZE with VACUUM"),
        destination: z.string().optional().refine(
          (val) => !val || validateFilePath(val, ALLOWED_BACKUP_DIRS),
          { message: `Backup destination must be in allowed directories: ${ALLOWED_BACKUP_DIRS.join(", ")}` }
        ).describe("Backup destination directory"),
      },
    },
    async ({ operation, database, minDurationMs, analyze, destination }) => {
      // Check if PostgreSQL service is available
      if (!deps.postgresManager) {
        return {
          content: [
            {
              type: "text",
              text: "PostgreSQL service unavailable. Please check that POSTGRES_HOST, POSTGRES_USER, and POSTGRES_PASSWORD environment variables are set correctly.",
            },
          ],
          isError: true,
        };
      }

      try {
        let result: unknown;
        const sections: Record<string, string> = {};

        switch (operation) {
          case "connections": {
            const stats = await deps.postgresManager.getActiveConnections();
            sections["Total Connections"] = String(stats.total);
            sections["By State"] = JSON.stringify(stats.byState, null, 2);
            sections["Idle"] = String(stats.idle);
            sections["Active"] = String(stats.active);
            sections["Waiting"] = String(stats.waiting);
            result = stats;
            break;
          }

          case "replication": {
            const repl = await deps.postgresManager.getReplicationLag();
            sections["Is Replica"] = String(repl.isReplica);
            if (repl.isReplica) {
              sections["Replication State"] = repl.replicationState ?? "unknown";
              sections["Primary Host"] = repl.primaryHost ?? "unknown";
              sections["Lag Bytes"] = String(repl.lagBytes ?? 0);
              sections["Lag Seconds"] = String(repl.lagSeconds ?? 0);
            }
            result = repl;
            break;
          }

          case "bloat": {
            const bloat = await deps.postgresManager.getTableBloat();
            sections["Tables with Bloat"] = bloat.length > 0
              ? bloat.map((t) => `${t.schemaName}.${t.tableName}: ${t.bloatPct}% (${t.deadTuples} dead tuples)`).join("\n")
              : "No significant bloat detected";
            result = bloat;
            break;
          }

          case "slow-queries": {
            const slowQueries = await deps.postgresManager.getSlowQueries(minDurationMs ?? 100);
            sections["Slow Queries"] = slowQueries.length > 0
              ? slowQueries.map((q) => `${q.meanTimeMs}ms avg: ${q.query}`).join("\n")
              : "No slow queries detected (pg_stat_statements may not be enabled)";
            result = slowQueries;
            break;
          }

          case "index-usage": {
            const indexes = await deps.postgresManager.getIndexUsage();
            const unused = indexes.filter((i) => i.isUnused);
            sections["Total Indexes"] = String(indexes.length);
            sections["Unused Indexes"] = unused.length > 0
              ? unused.map((i) => `${i.schemaName}.${i.tableName}.${i.indexName} (${i.indexSizeMB}MB, 0 scans)`).join("\n")
              : "All indexes are being used";
            result = indexes;
            break;
          }

          case "vacuum": {
            if (!database) {
              throw new Error("Database name required for vacuum operation");
            }
            const vacuumResult = await deps.postgresManager.runVacuum(database, analyze ?? true);
            sections["Database"] = database;
            sections["Analyze"] = String(analyze ?? true);
            sections["Duration"] = `${vacuumResult.durationMs}ms`;
            sections["Success"] = String(vacuumResult.success);
            sections["Output"] = vacuumResult.output;
            result = vacuumResult;
            break;
          }

          case "reindex": {
            if (!database) {
              throw new Error("Database name required for reindex operation");
            }
            const reindexResult = await deps.postgresManager.reindexDatabase(database);
            sections["Database"] = database;
            sections["Tables Reindexed"] = String(reindexResult.tablesReindexed);
            sections["Duration"] = `${reindexResult.durationMs}ms`;
            sections["Success"] = String(reindexResult.success);
            result = reindexResult;
            break;
          }

          case "backup": {
            if (!database) {
              throw new Error("Database name required for backup operation");
            }
            if (!destination) {
              throw new Error("Destination directory required for backup");
            }
            const backupResult = await deps.postgresManager.createBackup(database, destination);
            sections["Database"] = database;
            sections["Backup Path"] = backupResult.backupPath;
            sections["Size"] = `${Math.round(backupResult.sizeBytes / 1024 / 1024)}MB`;
            sections["Duration"] = `${backupResult.durationMs}ms`;
            result = backupResult;
            break;
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "postgres-manage",
          summary: `Ran ${operation} operation${database ? ` on ${database}` : ""}`,
          sections,
          tags: ["postgres", operation],
          references: database ? [database] : undefined,
          importance: operation === "backup" || operation === "vacuum" ? "high" : "medium",
          executionContext: JSON.stringify({ database, destination, operation }),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(`PostgreSQL: ${operation}`, sections),
            },
          ],
          structuredContent: {
            operation,
            database,
            result,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ============================================
  // redis-manage
  // ============================================
  server.registerTool(
    "redis-manage",
    {
      description: "Direct Redis management operations (info, memory, keyspace, slow log, clients, save).",
      inputSchema: {
        operation: z.enum(["info", "memory", "keyspace", "slow-log", "clients", "bgsave", "ping"]),
        count: z.number().int().min(1).max(1000).optional().describe("Number of entries for slow-log"),
      },
    },
    async ({ operation, count }) => {
      // Check if Redis service is available
      if (!deps.redisManager) {
        return {
          content: [
            {
              type: "text",
              text: "Redis service unavailable. Please check that REDIS_HOST environment variable is set correctly.",
            },
          ],
          isError: true,
        };
      }

      try {
        let result: unknown;
        const sections: Record<string, string> = {};

        switch (operation) {
          case "info": {
            const info = await deps.redisManager.getInfo();
            sections["Version"] = info.version;
            sections["Uptime"] = `${info.uptime}s`;
            sections["Connected Clients"] = String(info.connectedClients);
            sections["Used Memory"] = `${Math.round(info.usedMemory / 1024 / 1024)}MB`;
            sections["Ops/Sec"] = String(info.opsPerSec);
            sections["Role"] = info.role;
            result = info;
            break;
          }

          case "memory": {
            const memory = await deps.redisManager.getMemoryStats();
            sections["Used Memory"] = memory.usedMemoryHuman;
            sections["Peak Memory"] = memory.usedMemoryPeakHuman;
            sections["Fragmentation Ratio"] = String(memory.memoryFragmentationRatio);
            sections["Max Memory"] = memory.maxMemory > 0 ? `${Math.round(memory.maxMemory / 1024 / 1024)}MB` : "unlimited";
            sections["Eviction Policy"] = memory.maxMemoryPolicy;
            result = memory;
            break;
          }

          case "keyspace": {
            const keyspace = await deps.redisManager.getKeyspaceStats();
            sections["Databases"] = keyspace.length > 0
              ? keyspace.map((db) => `DB${db.database}: ${db.keys} keys, ${db.expires} expires`).join("\n")
              : "No keys in any database";
            result = keyspace;
            break;
          }

          case "slow-log": {
            const slowLog = await deps.redisManager.getSlowLog(count ?? 10);
            sections["Slow Commands"] = slowLog.length > 0
              ? slowLog.map((entry) => `${entry.duration}µs: ${entry.command} (client: ${entry.clientAddress})`).join("\n")
              : "No slow commands";
            result = slowLog;
            break;
          }

          case "clients": {
            const clients = await deps.redisManager.getClientList();
            sections["Connected Clients"] = String(clients.length);
            sections["Client Details"] = clients.length > 0
              ? clients.map((c) => `${c.address} (db${c.db}): ${c.cmd}, idle ${c.idle}s`).join("\n")
              : "No clients connected";
            result = clients;
            break;
          }

          case "bgsave": {
            const saveResult = await deps.redisManager.bgsave();
            sections["BGSAVE Triggered"] = String(saveResult.success);
            sections["Duration"] = `${saveResult.durationMs}ms`;
            sections["Last Save"] = new Date(saveResult.lastSave * 1000).toISOString();
            result = saveResult;
            break;
          }

          case "ping": {
            const pong = await deps.redisManager.ping();
            sections["Status"] = pong ? "Connected" : "Disconnected";
            result = { connected: pong };
            break;
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "redis-manage",
          summary: `Executed Redis ${operation} command`,
          sections,
          tags: ["redis", operation],
          importance: operation === "bgsave" ? "high" : "medium",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(`Redis: ${operation}`, sections),
            },
          ],
          structuredContent: {
            operation,
            result,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ============================================
  // keycloak-manage
  // ============================================
  server.registerTool(
    "keycloak-manage",
    {
      description: "Keycloak Admin API operations (realm stats, sessions, clients, events, users, secret rotation).",
      inputSchema: {
        operation: z.enum(["realm-stats", "sessions", "clients", "events", "users", "create-user", "rotate-secret"]),
        realm: z.string().optional(),
        lastHours: z.number().int().min(1).max(168).optional().describe("Hours of event history"),
        username: z.string().optional().describe("Username for create-user"),
        email: z.string().optional().describe("Email for create-user"),
        password: z.string().optional().describe("Password for create-user"),
        clientId: z.string().optional().describe("Client ID for rotate-secret"),
        maxUsers: z.number().int().min(1).max(1000).optional().describe("Max users to list"),
      },
    },
    async ({ operation, realm, lastHours, username, email, password, clientId, maxUsers }) => {
      // Check if Keycloak service is available
      if (!deps.keycloakManager) {
        return {
          content: [
            {
              type: "text",
              text: "Keycloak service unavailable. Please check that KEYCLOAK_BASE_URL, KEYCLOAK_CLIENT_ID, and KEYCLOAK_CLIENT_SECRET environment variables are set correctly.",
            },
          ],
          isError: true,
        };
      }

      try {
        let result: unknown;
        const sections: Record<string, string> = {};

        switch (operation) {
          case "realm-stats": {
            const stats = await deps.keycloakManager.getRealmStats(realm);
            sections["Realm"] = stats.realmName;
            sections["Users"] = String(stats.users);
            sections["Clients"] = String(stats.clients);
            sections["Roles"] = String(stats.roles);
            sections["Groups"] = String(stats.groups);
            sections["Enabled"] = String(stats.enabled);
            result = stats;
            break;
          }

          case "sessions": {
            const sessions = await deps.keycloakManager.getActiveSessions(realm);
            sections["Active Sessions"] = String(sessions.length);
            sections["Session Details"] = sessions.length > 0
              ? sessions.slice(0, 10).map((s) => `${s.username} from ${s.ipAddress} (${Object.keys(s.clients).length} clients)`).join("\n")
              : "No active sessions";
            result = sessions;
            break;
          }

          case "clients": {
            const clients = await deps.keycloakManager.getClientStats(realm);
            sections["Total Clients"] = String(clients.length);
            sections["Enabled Clients"] = String(clients.filter((c) => c.enabled).length);
            sections["Public Clients"] = String(clients.filter((c) => c.publicClient).length);
            result = clients;
            break;
          }

          case "events": {
            const events = await deps.keycloakManager.getEventStats(realm, lastHours);
            sections["Total Events"] = String(events.totalEvents);
            sections["By Type"] = JSON.stringify(events.byType, null, 2);
            sections["Recent Events"] = events.recentEvents.slice(0, 5).map((e) => `${new Date(e.time).toISOString()}: ${e.type}`).join("\n");
            result = events;
            break;
          }

          case "users": {
            const users = await deps.keycloakManager.listUsers(realm, maxUsers);
            sections["Total Users"] = String(users.length);
            sections["User List"] = users.slice(0, 20).map((u) => `${u.username} (${u.email ?? "no email"}) - ${u.enabled ? "enabled" : "disabled"}`).join("\n");
            result = users;
            break;
          }

          case "create-user": {
            if (!realm || !username || !email || !password) {
              throw new Error("realm, username, email, and password required for create-user");
            }
            const user = await deps.keycloakManager.createUser(realm, username, email, password);
            sections["User Created"] = `${user.username} (${user.email})`;
            sections["User ID"] = user.id;
            result = user;
            break;
          }

          case "rotate-secret": {
            if (!realm || !clientId) {
              throw new Error("realm and clientId required for rotate-secret");
            }
            const newSecret = await deps.keycloakManager.rotateClientSecret(realm, clientId);
            sections["Client ID"] = clientId;
            sections["New Secret"] = newSecret;
            sections["Warning"] = "Update client configuration with new secret";
            result = { clientId, newSecret };
            break;
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "keycloak-manage",
          summary: `Keycloak ${operation} operation${realm ? ` on realm ${realm}` : ""}`,
          sections,
          tags: ["keycloak", operation],
          references: realm ? [realm] : undefined,
          importance: operation === "rotate-secret" ? "high" : "medium",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(`Keycloak: ${operation}`, sections),
            },
          ],
          structuredContent: {
            operation,
            realm,
            result,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ============================================
  // nginx-monitor
  // ============================================
  server.registerTool(
    "nginx-monitor",
    {
      description: "NGINX monitoring operations (access log stats, error log, config test, reload).",
      inputSchema: {
        operation: z.enum(["access-stats", "error-log", "test-config", "reload"]),
        logPath: z.string().optional().refine(
          (val) => !val || validateFilePath(val, ALLOWED_LOG_DIRS),
          { message: `Log path must be in allowed directories: ${ALLOWED_LOG_DIRS.join(", ")}` }
        ).describe("Path to log file"),
        lastMinutes: z.number().int().min(1).max(1440).optional().describe("Time window in minutes"),
        lines: z.number().int().min(1).max(10000).optional().describe("Number of log lines"),
      },
    },
    async ({ operation, logPath, lastMinutes, lines }) => {
      try {
        let result: unknown;
        const sections: Record<string, string> = {};

        switch (operation) {
          case "access-stats": {
            const stats = await deps.nginxMonitoring.getAccessLogStats(logPath, lastMinutes);
            sections["Total Requests"] = String(stats.totalRequests);
            sections["By Status Code"] = JSON.stringify(stats.byStatusCode, null, 2);
            sections["By Method"] = JSON.stringify(stats.byMethod, null, 2);
            sections["Top Paths"] = stats.topPaths.map((p) => `${p.path}: ${p.count}`).join("\n");
            sections["Top IPs"] = stats.topIPs.map((ip) => `${ip.ip}: ${ip.count}`).join("\n");
            sections["Avg Response Size"] = `${stats.avgResponseSize} bytes`;
            result = stats;
            break;
          }

          case "error-log": {
            const errors = await deps.nginxMonitoring.getErrorLogRecent(logPath, lines);
            sections["Total Errors"] = String(errors.length);
            sections["Recent Errors"] = errors.slice(0, 20).map((e) => `[${e.level}] ${e.timestamp}: ${e.message}`).join("\n");
            result = errors;
            break;
          }

          case "test-config": {
            const testResult = await deps.nginxMonitoring.testConfiguration();
            sections["Config Valid"] = String(testResult.success);
            sections["Output"] = testResult.output;
            if (testResult.errors.length > 0) {
              sections["Errors"] = testResult.errors.join("\n");
            }
            result = testResult;
            break;
          }

          case "reload": {
            const reloadSuccess = await deps.nginxMonitoring.reloadConfig();
            sections["Reload Success"] = String(reloadSuccess);
            result = { success: reloadSuccess };
            break;
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "nginx-monitor",
          summary: `NGINX ${operation} check${logPath ? ` for ${logPath}` : ""}`,
          sections,
          tags: ["nginx", operation],
          references: logPath ? [logPath] : undefined,
          importance: operation === "reload" ? "high" : "medium",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(`NGINX: ${operation}`, sections),
            },
          ],
          structuredContent: {
            operation,
            result,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ============================================
  // system-metrics
  // ============================================
  server.registerTool(
    "system-metrics",
    {
      description: "Linux system metrics (overview, processes, disk I/O, network, journal errors, service status).",
      inputSchema: {
        operation: z.enum(["overview", "processes", "disk-io", "network", "journal-errors", "service-status"]),
        topN: z.number().int().min(1).max(100).optional().describe("Number of top processes"),
        lastMinutes: z.number().int().min(1).max(1440).optional().describe("Time window for journal errors"),
        serviceName: z.string().optional().refine(
          (val) => !val || validateServiceName(val),
          { message: "Invalid service name. Must be from allowed list: postgresql, redis, nginx, docker, pm2, ssh, etc." }
        ).describe("Service name for service-status"),
      },
    },
    async ({ operation, topN, lastMinutes, serviceName }) => {
      try {
        let result: unknown;
        const sections: Record<string, string> = {};

        switch (operation) {
          case "overview": {
            const overview = await deps.systemMetrics.getSystemOverview();
            sections["Uptime"] = overview.uptime;
            sections["Load Average"] = `${overview.loadAverage.oneMin} / ${overview.loadAverage.fiveMin} / ${overview.loadAverage.fifteenMin}`;
            sections["Memory"] = `${Math.round(overview.memory.used / 1024 / 1024 / 1024)}GB / ${Math.round(overview.memory.total / 1024 / 1024 / 1024)}GB (${overview.memory.percentUsed}%)`;
            sections["Disk Usage"] = overview.disk.map((d) => `${d.mountPoint}: ${d.percentUsed}% (${d.used} / ${d.size})`).join("\n");
            sections["CPU"] = `${overview.cpu.cores} cores - ${overview.cpu.model}`;
            result = overview;
            break;
          }

          case "processes": {
            const processes = await deps.systemMetrics.getProcessList(topN);
            sections["Top Processes"] = processes.map((p) => `${p.command}: ${p.cpu}% CPU, ${p.mem}% MEM (PID ${p.pid})`).join("\n");
            result = processes;
            break;
          }

          case "disk-io": {
            const diskIO = await deps.systemMetrics.getDiskIO();
            sections["Disk I/O"] = diskIO.length > 0
              ? diskIO.map((d) => `${d.device}: ${d.tps} TPS, ${d.readPerSec} r/s, ${d.writePerSec} w/s`).join("\n")
              : "iostat not available or no I/O activity";
            result = diskIO;
            break;
          }

          case "network": {
            const network = await deps.systemMetrics.getNetworkStats();
            sections["Network Interfaces"] = network.map((n) => `${n.interface}: RX ${Math.round(n.rxBytes / 1024 / 1024)}MB, TX ${Math.round(n.txBytes / 1024 / 1024)}MB`).join("\n");
            result = network;
            break;
          }

          case "journal-errors": {
            const errors = await deps.systemMetrics.getJournalErrors(lastMinutes);
            sections["Total Errors"] = String(errors.length);
            sections["Recent Errors"] = errors.slice(0, 20).map((e) => `${e.timestamp} [${e.unit}]: ${e.message}`).join("\n");
            result = errors;
            break;
          }

          case "service-status": {
            if (!serviceName) {
              throw new Error("serviceName required for service-status");
            }
            const status = await deps.systemMetrics.getServiceStatus(serviceName);
            sections["Service"] = serviceName;
            sections["Active"] = String(status.active);
            sections["Running"] = String(status.running);
            sections["Enabled"] = String(status.enabled);
            sections["Status Output"] = status.status;
            result = status;
            break;
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "system-metrics",
          summary: `Collected system metrics: ${operation}`,
          sections,
          tags: ["system", operation],
          importance: operation === "overview" ? "medium" : "low",
          executionContext: JSON.stringify({ topN, lastMinutes, serviceName }),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(`System Metrics: ${operation}`, sections),
            },
          ],
          structuredContent: {
            operation,
            result,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ============================================
  // structured-thinking
  // ============================================
  server.registerTool(
    "structured-thinking",
    {
      description:
        "Manage structured thinking timeline (capture, revise, retrieve, summarize) and inspect framework heuristics.",
      inputSchema: structuredThinkingInputShape,
    },
    async (input) => {
      const parsed = structuredThinkingInputSchema.parse(input);

      try {
        switch (parsed.operation) {
          case "capture": {
            const entries = (parsed.entries ?? []).map((entry) => ({
              stage: entry.stage,
              thought: entry.thought,
              metadata: entry.metadata,
            }));
            const result = deps.structuredThinking.trackThoughts(entries, parsed.autoNumbering ?? true);
            return {
              content: [
                {
                  type: "text" as const,
                  text: formatThinkingResult("Thoughts Captured", result),
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                result,
              },
            };
          }
          case "revise": {
            const result = deps.structuredThinking.reviseThought(parsed.thoughtId!, {
              stage: parsed.updates?.stage,
              thought: parsed.updates?.thought,
              metadata: parsed.updates?.metadata,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: formatThinkingResult(`Thought ${parsed.thoughtId} revised`, result),
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                result,
              },
            };
          }
          case "retrieve": {
            const filters = { ...(parsed.filters ?? {}), limit: parsed.filters?.limit ?? 25 };
            const filtered = deps.structuredThinking.filterTimeline(filters);
            const snapshot = deps.structuredThinking.summarizeTimeline(filtered);
            const sections: Record<string, string> = {};
            sections["Summary"] = snapshot.summary;
            sections["Matches"] = filtered
              .map((record) => `- ${record.id} [${record.stage}] ${record.thought}`)
              .join("\n")
              .trim() || "<no matches>";
            return {
              content: [
                {
                  type: "text" as const,
                  text: toTextContent("Structured Thinking Retrieval", sections),
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                filters,
                records: filtered,
                snapshot,
              },
            };
          }
          case "summary": {
            const { timeline } = await loadStructuredTimeline(deps);
            const result = deps.structuredThinking.summarizeTimeline(timeline);
            const includeTimeline = parsed.includeTimeline ?? false;
            const sections: Record<string, string> = {
              Summary: result.summary,
            };
            if (includeTimeline) {
              sections["Timeline"] = timeline
                .map((record) => `- ${record.id} [${record.stage}] ${record.thought}`)
                .join("\n");
            }
            return {
              content: [
                {
                  type: "text" as const,
                  text: toTextContent("Structured Thinking Summary", sections),
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                result,
              },
            };
          }
          case "clear": {
            const result = deps.structuredThinking.clearTimeline();
            return {
              content: [
                {
                  type: "text" as const,
                  text: "# Timeline cleared\nStructured thinking timeline has been reset.",
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                result,
              },
            };
          }
          case "framework": {
            const framework = deps.structuredThinking.getFrameworkConfig();
            const sections: Record<string, string> = {};
            sections["Stages"] = framework.stages
              .map((stage) => `- ${stage.id}: ${stage.title}`)
              .join("\n");
            if (framework.transitions?.length) {
              sections["Transitions"] = framework.transitions
                .map((transition) => {
                  const prompt = transition.prompt ? ` – ${transition.prompt}` : "";
                  return `- ${transition.from} → ${transition.to.join(", ")}${prompt}`;
                })
                .join("\n");
            }
            if (framework.heuristics) {
              sections["Heuristics"] = JSON.stringify(framework.heuristics, null, 2);
            }
            return {
              content: [
                {
                  type: "text" as const,
                  text: toTextContent("Structured Thinking Framework", sections),
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                framework,
              },
            };
          }
          case "diagnostics": {
            const { timeline } = await loadStructuredTimeline(deps);
            const diagnostics = deps.structuredThinking.diagnoseTimeline(timeline, {
              staleHours: parsed.staleHours ?? 24,
            });
            const result = deps.structuredThinking.summarizeTimeline(timeline);
            const sections: Record<string, string> = {
              Summary: result.summary,
              Diagnostics: JSON.stringify(diagnostics, null, 2),
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: toTextContent("Structured Thinking Diagnostics", sections),
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                diagnostics,
                result,
              },
            };
          }
          case "sync-status": {
            if (!deps.databaseSync) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "# Database sync unavailable\nNo PostgreSQL connection configured.",
                  },
                ],
                structuredContent: {
                  operation: parsed.operation,
                  status: "unavailable",
                },
              };
            }
            const status = deps.databaseSync.getStatus();
            return {
              content: [
                {
                  type: "text" as const,
                  text: `# Sync Status\nState: ${status.syncState}\nLast sync: ${status.lastSyncAt}`,
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                status,
              },
            };
          }
          case "sync-now": {
            if (!deps.databaseSync) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "# Database sync unavailable\nNo PostgreSQL connection configured.",
                  },
                ],
                structuredContent: {
                  operation: parsed.operation,
                  status: "unavailable",
                },
              };
            }
            const status = await deps.databaseSync.syncNow();
            return {
              content: [
                {
                  type: "text" as const,
                  text: `# Sync Triggered\nState: ${status.syncState}\nLast sync: ${status.lastSyncAt}`,
                },
              ],
              structuredContent: {
                operation: parsed.operation,
                status,
              },
            };
          }
          default: {
            const exhaustiveCheck: never = parsed.operation;
            throw new Error(`Unsupported structured-thinking operation: ${exhaustiveCheck}`);
          }
        }
      } catch (error) {
        return handleError(error);
      }
    },
  );

  logger.info("SERVER-MCP tools registered successfully", {
    toolCount: 7,
    tools: [
      "database-diagnostics",
      "postgres-manage",
      "redis-manage",
      "keycloak-manage",
      "nginx-monitor",
      "system-metrics",
      "structured-thinking",
    ],
  });
}
