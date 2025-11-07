import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CommandExecutionError, type CommandResult } from "../utils/commandRunner.js";
import { SystemInfoService } from "../services/systemInfo.js";
import { CleanupService } from "../services/cleanup.js";
import { LogService } from "../services/logs.js";
import { SoftwareService } from "../services/software.js";
import { NetworkService } from "../services/network.js";
import { PacketCaptureService } from "../services/packetCapture.js";
import { EmailService } from "../services/email.js";
import { MicrosoftService } from "../services/microsoft.js";
import { VpnService } from "../services/vpn.js";
import { SshService } from "../services/ssh.js";
import { LinuxRemoteService } from "../services/linux.js";
import { WebDiagnosticsService } from "../services/webDiagnostics.js";
import { NetworkDiagnosticsService } from "../services/networkDiagnostics.js";
import { StructuredThinkingService } from "../services/structuredThinking.js";
import { MetacognitiveFeedbackService } from "../services/metacognitiveFeedback.js";
import { TaskDecompositionService } from "../services/taskDecomposition.js";
import { ComplianceAuditService } from "../services/complianceAudit.js";
import { NetworkInfrastructureService as InfraService } from "../services/networkInfrastructure.js";
import {
  SecurityScannerService,
  type InstallationResult,
} from "../services/securityScanner.js";
import { UbuntuAdminService } from "../services/ubuntuAdmin.js";
import { DebianAdminService } from "../services/debianAdmin.js";
import { WindowsAdminService } from "../services/windowsAdmin.js";
import { WirelessDiagnosticsService } from "../services/wirelessDiagnostics.js";
import { RemoteAgentService } from "../services/remoteAgent.js";
import { ExecutionRouter } from "../utils/executionRouter.js";
import { FirewallToolkitService } from "../services/firewallToolkit.js";
import { PanOsService, type PanOsPreset } from "../services/panos.js";
import { MacDiagnosticsService, type DiagnosticsRunOutput } from "../services/macDiagnostics.js";
import { MacPermissionsService } from "../services/macPermissions.js";
import { DockerDesktopService } from "../services/dockerDesktop.js";
import { WindowsDiagnosticsService } from "../services/windowsDiagnostics.js";
import { WindowsActiveDirectoryService, type ADOperation } from "../services/windowsActiveDirectory.js";
import { WindowsIISService, type IISOperation } from "../services/windowsIIS.js";
import { WindowsSecurityService, type SecurityOperation } from "../services/windowsSecurity.js";
import { ReportingHubService } from "../services/reportingHub.js";
import { logger } from "../utils/logger.js";
import { DatabaseDiagnosticsService, type DatabaseDiagnosticSuite } from "../services/databaseDiagnostics.js";
import { ZteRouterService, type ZteOperation } from "../services/zteRouter.js";
import { randomUUID } from "node:crypto";
import type { ThoughtMetadata, ThoughtRecord } from "../services/structuredThinking.js";
import { join as pathJoin, resolve as pathResolve } from "node:path";
import { z } from "zod";
import type { PolicyEnforcer } from "../services/policyEnforcer.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import type { AuthorizationContext } from "../types/policy.js";
import { getToolMetadata, listToolMetadata } from "../config/toolMetadata.js";

export interface ToolDependencies {
  readonly systemInfo: SystemInfoService;
  readonly cleanup: CleanupService;
  readonly logs: LogService;
  readonly software: SoftwareService;
  readonly network: NetworkService;
  readonly packetCapture: PacketCaptureService;
  readonly email: EmailService;
  readonly microsoft: MicrosoftService;
  readonly vpn: VpnService;
  readonly ssh: SshService;
  readonly linux: LinuxRemoteService;
  readonly webDiagnostics: WebDiagnosticsService;
  readonly networkDiagnostics: NetworkDiagnosticsService;
  readonly structuredThinking: StructuredThinkingService;
  readonly metacognitive: MetacognitiveFeedbackService;
  readonly taskDecomposition: TaskDecompositionService;
  readonly complianceAudit: ComplianceAuditService;
  readonly networkInfra: InfraService;
  readonly securityScanner: SecurityScannerService;
  readonly ubuntuAdmin: UbuntuAdminService;
  readonly debianAdmin: DebianAdminService;
  readonly windowsAdmin: WindowsAdminService;
  readonly wireless: WirelessDiagnosticsService;
  readonly remoteAgent: RemoteAgentService;
  readonly executionRouter: ExecutionRouter;
  readonly firewallToolkit: FirewallToolkitService;
  readonly panos: PanOsService;
  readonly macDiagnostics: MacDiagnosticsService;
  readonly macPermissions: MacPermissionsService;
  readonly dockerDesktop: DockerDesktopService;
  readonly windowsDiagnostics: WindowsDiagnosticsService;
  readonly windowsActiveDirectory: WindowsActiveDirectoryService;
  readonly windowsIIS: WindowsIISService;
  readonly windowsSecurity: WindowsSecurityService;
  readonly reportingHub: ReportingHubService;
  readonly databaseDiagnostics: DatabaseDiagnosticsService;
  readonly zteRouter: ZteRouterService;
}

interface CommandSummary {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

const formatCommandResult = (result: CommandResult): CommandSummary => ({
  command: result.command,
  stdout: result.stdout.trim(),
  stderr: result.stderr.trim(),
  exitCode: result.code,
});

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

const FIREWALL_VENDORS = ["palo-alto", "pan-os", "cisco-asa", "fortinet", "checkpoint", "pfsense"] as const;
const FIREWALL_SCENARIOS = ["connectivity", "performance", "vpn", "high-availability", "threat"] as const;
const PANOS_PRESETS = [
  "system-info",
  "session-summary",
  "routing",
  "interface-stats",
  "threat-log",
  "global-counters",
  "ha-status",
] as const satisfies readonly PanOsPreset[];
const MAC_DIAGNOSTIC_SUITES = ["hardware", "performance", "security", "network", "storage"] as const;
const MAC_REPAIR_ACTIONS = [
  "disk-verify",
  "disk-repair",
  "reset-spotlight",
  "flush-cache",
  "software-update",
  "rebuild-permissions",
] as const;
const WINDOWS_DIAGNOSTIC_SUITES = [
  "system",
  "performance",
  "security",
  "network",
  "storage",
  "active-directory",
  "iis",
  "hyperv",
  "updates",
  "services",
] as const;
const WINDOWS_REPAIR_ACTIONS = [
  "sfc-scan",
  "dism-health",
  "chkdsk",
  "flush-dns",
  "reset-winsock",
  "rebuild-wmi",
  "reset-windows-update",
  "repair-app-store",
  "clear-temp",
  "defragment",
] as const;
const AD_OPERATIONS: readonly ADOperation[] = [
  // Read operations
  "get-user",
  "get-group",
  "get-computer",
  "get-ou",
  "list-users",
  "list-groups",
  "list-computers",
  "list-ous",
  "get-domain-info",
  "get-domain-controllers",
  "get-fsmo-roles",
  "get-replication-status",
  "search-locked-accounts",
  "search-disabled-accounts",
  "search-expired-passwords",
  "search-stale-objects",
  "get-gpo-list",
  "get-gpo-report",
  // Write operations - User Management
  "create-user",
  "modify-user",
  "delete-user",
  "enable-user",
  "disable-user",
  "unlock-user",
  "reset-password",
  "set-password-never-expires",
  "force-password-change",
  // Write operations - Group Management
  "create-group",
  "modify-group",
  "delete-group",
  "add-group-member",
  "remove-group-member",
  "get-group-members",
  // Write operations - Computer Management
  "create-computer",
  "delete-computer",
  "disable-computer",
  "enable-computer",
  "reset-computer-password",
  // Write operations - OU Management
  "create-ou",
  "delete-ou",
  "move-object",
  // Write operations - GPO Management
  "create-gpo",
  "delete-gpo",
  "link-gpo",
  "unlink-gpo",
] as const;
const IIS_OPERATIONS: readonly IISOperation[] = [
  "list-sites",
  "get-site",
  "create-site",
  "delete-site",
  "start-site",
  "stop-site",
  "restart-site",
  "list-app-pools",
  "get-app-pool",
  "create-app-pool",
  "delete-app-pool",
  "start-app-pool",
  "stop-app-pool",
  "restart-app-pool",
  "recycle-app-pool",
  "list-bindings",
  "add-binding",
  "remove-binding",
  "list-ssl-bindings",
  "list-certificates",
  "bind-certificate",
  "get-site-config",
  "set-authentication",
  "list-virtual-directories",
  "create-virtual-directory",
  "delete-virtual-directory",
  "get-log-settings",
  "parse-recent-logs",
] as const;
const SECURITY_OPERATIONS: readonly SecurityOperation[] = [
  "defender-status",
  "defender-scan-quick",
  "defender-scan-full",
  "defender-scan-custom",
  "defender-update-signatures",
  "defender-threat-history",
  "defender-quarantine-list",
  "defender-exclusions",
  "defender-add-exclusion",
  "defender-remove-exclusion",
  "bitlocker-status",
  "bitlocker-enable",
  "bitlocker-disable",
  "bitlocker-suspend",
  "bitlocker-resume",
  "bitlocker-get-recovery-key",
  "bitlocker-backup-recovery-key",
  "firewall-status",
  "firewall-list-rules",
  "firewall-create-rule",
  "firewall-delete-rule",
  "firewall-enable-rule",
  "firewall-disable-rule",
  "analyze-failed-logins",
  "analyze-privilege-escalations",
  "analyze-account-changes",
  "analyze-security-events",
  "assess-security-baseline",
  "check-password-policy",
  "check-account-policies",
  "check-audit-policies",
  "scan-outdated-software",
  "scan-missing-updates",
  "scan-weak-configurations",
] as const;
const DATABASE_SUITES = ["postgres", "redis", "nginx", "keycloak", "firewall", "system"] as const;
const DEFAULT_DATABASE_SUITES = [...DATABASE_SUITES] as unknown as DatabaseDiagnosticSuite[];

const ZTE_OPERATIONS: readonly ZteOperation[] = [
  "status",
  "signal-strength",
  "network-info",
  "wan-info",
  "device-info",
  "connected-devices",
  "wifi-status",
  "wifi-config",
  "reboot",
  "sms-list",
  "sms-send",
  "data-usage",
  "apn-settings",
  "band-selection",
  "login",
  "logout",
] as const;

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

const reportContextLabel = (vendor: string, scenario: string, context?: string): string =>
  context ? `${vendor}/${scenario} :: ${context}` : `${vendor}/${scenario}`;

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
  timeline = deps.structuredThinking.normaliseTimeline(timeline);
  await deps.structuredThinking.saveStoredTimeline(timeline, targetPath);
  return { timeline, storagePath: targetPath };
};

const parseDuEntries = (output: string): Array<{ size: string; path: string }> =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [size, ...pathParts] = line.split(/\s+/);
      return {
        size,
        path: pathParts.join(" "),
      };
    });

const formatM365Items = (items: unknown, preferredFields: string[]): string => {
  if (!Array.isArray(items) || items.length === 0) {
    return "No data returned.";
  }

  const maxPreview = 10;
  const lines = items.slice(0, maxPreview).map((item) => {
    if (item && typeof item === "object") {
      const objectItem = item as Record<string, unknown>;
      for (const field of preferredFields) {
        const value = objectItem[field];
        if (typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }
      return JSON.stringify(objectItem);
    }
    return String(item);
  });

  if (items.length > maxPreview) {
    lines.push(`... (+${items.length - maxPreview} more)`);
  }

  return lines.join("\n");
};

const formatRemoteChecks = (
  title: string,
  checks: Array<{ name: string; stdout: string; stderr: string; exitCode: number | null }>,
): string => {
  const sections: Record<string, string> = {};

  for (const check of checks) {
    const body = [
      check.stdout || "<no output>",
      check.stderr ? `\n[stderr]\n${check.stderr}` : undefined,
      check.exitCode !== null && check.exitCode !== 0 ? `\n(exit code ${check.exitCode})` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    sections[check.name] = body;
  }

  return toTextContent(title, sections);
};

const limitItems = <T>(items: T[], max: number): T[] =>
  items.length > max ? items.slice(0, max) : items;

const ensureArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
};

const parsePortList = (input: string): number[] => {
  const result = new Set<number>();
  for (const segment of input.split(/[,\s]+/).filter(Boolean)) {
    if (segment.includes("-")) {
      const [startStr, endStr] = segment.split("-");
      const start = Number(startStr);
      const end = Number(endStr);
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        for (let port = start; port <= end; port += 1) {
          if (port > 0 && port <= 65535) {
            result.add(port);
          }
        }
      }
    } else {
      const port = Number(segment);
      if (Number.isFinite(port) && port > 0 && port <= 65535) {
        result.add(port);
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
};

const DEFAULT_THOUGHT_EXPORT_BASENAME = "thought_history_export";

const THOUGHT_EXPORT_EXTENSIONS = {
  json: "json",
  jsonb: "jsonb",
  markdown: "md",
  claude: "claude.md",
  agents: "agents.md",
} as const;

type ThoughtExportFormat = keyof typeof THOUGHT_EXPORT_EXTENSIONS;

const getDefaultExportPath = (format: ThoughtExportFormat) =>
  pathJoin(process.cwd(), `${DEFAULT_THOUGHT_EXPORT_BASENAME}.${THOUGHT_EXPORT_EXTENSIONS[format]}`);

/**
 * Policy enforcement configuration
 * Set via environment variables or initialized by server
 */
let policyEnforcerInstance: PolicyEnforcer | null = null;
let auditLoggerInstance: AuditLogger | null = null;
let policyEnforcementEnabled = process.env.ENABLE_POLICY_ENFORCEMENT === "true";

export function configurePolicyEnforcement(
  policyEnforcer: PolicyEnforcer | null,
  auditLogger: AuditLogger | null,
  enabled: boolean = true
): void {
  policyEnforcerInstance = policyEnforcer;
  auditLoggerInstance = auditLogger;
  policyEnforcementEnabled = enabled;
  logger.info("Policy enforcement configured", {
    enabled,
    hasPolicyEnforcer: !!policyEnforcer,
    hasAuditLogger: !!auditLogger,
  });
}

/**
 * Wrap a tool handler with policy enforcement
 *
 * This wrapper:
 * 1. Evaluates the tool invocation against policy rules
 * 2. Checks capability authorization
 * 3. Requires approval for high-risk operations
 * 4. Logs all decisions and executions to audit trail
 *
 * @param toolName Tool identifier (e.g., "system-overview")
 * @param operation Operation within the tool (defaults to toolName)
 * @param handler Original tool handler
 * @param userCapabilities Capabilities assigned to the caller (from JWT)
 * @returns Wrapped handler with policy enforcement
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapWithPolicy<TArgs extends Record<string, any>>(
  toolName: string,
  operation: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: TArgs) => Promise<any>,
  userCapabilities: readonly string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (args: TArgs) => Promise<any> {
  return async (args: TArgs) => {
    // Skip policy enforcement if disabled
    if (!policyEnforcementEnabled || !policyEnforcerInstance) {
      logger.debug("Policy enforcement disabled, executing directly", { toolName });
      return handler(args);
    }

    const startTime = Date.now();
    const context: AuthorizationContext = {
      callerId: "local-mcp-server", // TODO: Extract from JWT when Keycloak integrated
      tool: toolName,
      operation,
      args,
      userCapabilities,
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. Evaluate policy
      const decision = await policyEnforcerInstance.evaluateToolInvocation(context);

      // 2. Log decision to audit trail
      if (auditLoggerInstance) {
        auditLoggerInstance.logDecision(context, decision);
      }

      // 3. Handle decision
      if (decision.action === "deny") {
        logger.warn("Tool invocation denied by policy", {
          toolName,
          operation,
          reason: decision.reason,
          riskLevel: decision.riskLevel,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Access Denied\n\n**Reason**: ${decision.reason}\n**Risk Level**: ${decision.riskLevel}\n\n${decision.missingCapabilities ? `**Missing Capabilities**: ${decision.missingCapabilities.join(", ")}` : ""}`,
            },
          ],
          structuredContent: {
            error: {
              type: "authorization_error",
              message: decision.reason,
              riskLevel: decision.riskLevel,
              missingCapabilities: decision.missingCapabilities,
            },
          },
        };
      }

      if (decision.action === "require_approval") {
        logger.info("Tool invocation requires approval", {
          toolName,
          operation,
          riskLevel: decision.riskLevel,
          reason: decision.approvalReason,
        });

        // Submit to approval queue
        const { jobId } = await policyEnforcerInstance.requestApproval(context, decision);

        return {
          content: [
            {
              type: "text" as const,
              text: `⏳ **Approval Required**\n\n**Operation**: ${toolName}.${operation}\n**Risk Level**: ${decision.riskLevel}\n**Reason**: ${decision.approvalReason}\n\n**Job ID**: ${jobId}\n\nThis operation has been queued for approval. An administrator must approve before execution.`,
            },
          ],
          structuredContent: {
            approval_required: {
              jobId,
              tool: toolName,
              operation,
              riskLevel: decision.riskLevel,
              reason: decision.approvalReason,
              status: "pending_approval",
            },
          },
        };
      }

      // 4. Execute tool (action === "allow")
      logger.info("Tool invocation authorized", {
        toolName,
        operation,
        riskLevel: decision.riskLevel,
      });

      const result = await handler(args);
      const duration = Date.now() - startTime;

      // 5. Log successful execution
      if (auditLoggerInstance) {
        auditLoggerInstance.logExecution(
          context.callerId, // Using callerId as audit ID for now
          "success",
          duration,
          [] // TODO: Track actual side effects from result
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log failed execution
      if (auditLoggerInstance) {
        auditLoggerInstance.logExecution(
          context.callerId,
          "failure",
          duration,
          [],
          error instanceof Error ? error.message : String(error)
        );
      }

      throw error; // Re-throw for normal error handling
    }
  };
}

export const registerTools = (server: McpServer, deps: ToolDependencies): void => {
  server.registerTool(
    "system-overview",
    {
      description: "Collects a detailed snapshot of system health, resource usage, and running processes.",
      inputSchema: {
        topProcesses: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Number of processes to include from top."),
      },
    },
    async ({ topProcesses }) => {
      try {
        const overview = await deps.systemInfo.getSystemOverview(topProcesses);

        const structuredContent = {
          uname: overview.uname,
          uptime: overview.uptime,
          loadAverage: overview.loadAverage,
          memory: overview.memory,
          topProcesses: overview.topProcesses,
          diskUsage: overview.diskUsage,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("System Overview", {
                "Kernel & Hardware": overview.uname,
                Uptime: `${overview.uptime}\nLoad Average: ${overview.loadAverage}`,
                Memory: overview.memory,
                "Top Processes": overview.topProcesses,
                "Disk Usage": overview.diskUsage,
              }),
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "list-launch-daemons",
    {
      description: "Lists registered launchd services (daemons and agents) to help diagnose startup tasks.",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe("Optional substring filter applied to the service label."),
      },
    },
    async ({ filter }) => {
      try {
        const result = await deps.systemInfo.listLaunchDaemons();
        const stdout = filter
          ? result.stdout
              .split("\n")
              .filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
              .join("\n")
          : result.stdout;

        const structuredContent = {
          command: result.command,
          stdout: stdout.trim(),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("launchctl list", {
                Command: result.command,
                Services: stdout.trim(),
              }),
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "email-mx-lookup",
    {
      description: "Retrieves MX records for a domain using dig, sorted by priority.",
      inputSchema: {
        domain: z.string().min(1, "Domain is required"),
      },
    },
    async ({ domain }) => {
      try {
        const mxResult = await deps.email.lookupMx(domain);
        const recordsText =
          mxResult.records.length === 0
            ? "No MX records found."
            : mxResult.records
                .map((record) => `${record.priority}\t${record.exchange}`)
                .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("MX Records", {
                Domain: domain,
                Command: mxResult.command,
                Records: recordsText,
              }),
            },
          ],
          structuredContent: {
            domain,
            command: mxResult.command,
            records: mxResult.records,
            rawOutput: mxResult.result.stdout.trim(),
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "email-connectivity-test",
    {
      description:
        "Attempts TCP connections against SMTP/IMAP endpoints to verify reachability. Uses nc with configurable timeouts.",
      inputSchema: {
        checks: z
          .array(
            z.object({
              host: z.string().min(1),
              protocol: z
                .enum(["smtp", "submission", "smtps", "imap", "imaps", "pop3", "pop3s"])
                .default("smtp"),
              port: z.number().int().min(1).max(65535).optional(),
              timeoutSeconds: z.number().int().min(1).max(30).default(5),
            }),
          )
          .min(1)
          .describe("Targets to probe for connectivity. Port defaults based on protocol."),
      },
    },
    async ({ checks }) => {
      const defaultPorts: Record<string, number> = {
        smtp: 25,
        submission: 587,
        smtps: 465,
        imap: 143,
        imaps: 993,
        pop3: 110,
        pop3s: 995,
      };

      const resolvedChecks = checks.map((check) => ({
        ...check,
        port: check.port ?? defaultPorts[check.protocol],
      }));

      const results = [];
      for (const target of resolvedChecks) {
        const connectivity = await deps.email.testConnectivity({
          host: target.host,
          port: target.port,
          timeoutSeconds: target.timeoutSeconds,
        });

        results.push({
          host: target.host,
          protocol: target.protocol,
          port: target.port,
          timeoutSeconds: target.timeoutSeconds,
          success: connectivity.success,
          command: connectivity.command,
          stdout: connectivity.result.stdout.trim(),
          stderr: connectivity.result.stderr.trim(),
          exitCode: connectivity.result.code,
        });
      }

      const text = results
        .map((result) => {
          const status = result.success ? "✅ Success" : "❌ Failure";
          const message = result.success
            ? result.stdout || "Connection established."
            : result.stderr || result.stdout || "No diagnostic output.";
          return [
            `Target: ${result.protocol.toUpperCase()} ${result.host}:${result.port}`,
            `Timeout: ${result.timeoutSeconds}s`,
            `Result: ${status}`,
            `Command: ${result.command}`,
            `Output: ${message}`,
          ].join("\n");
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `# Email Connectivity Test\n\n${text}`,
          },
        ],
        structuredContent: {
          checks: results,
        },
      };
    },
  );

  server.registerTool(
    "email-auth-check",
    {
      description:
        "Evaluates SPF, DKIM, and DMARC TXT records for a domain. Provide DKIM selectors to test specific keys.",
      inputSchema: {
        domain: z.string().min(1, "Domain is required"),
        dkimSelectors: z
          .array(z.string().min(1))
          .default(["default"])
          .describe("DKIM selectors to query (selector._domainkey.domain)."),
      },
    },
    async ({ domain, dkimSelectors }) => {
      try {
        const [spf, dmarc] = await Promise.all([
          deps.email.checkSpf(domain),
          deps.email.checkDmarc(domain),
        ]);

        const dkimChecks = [];
        for (const selector of dkimSelectors) {
          const record = await deps.email.checkDkim(domain, selector);
          dkimChecks.push({
            selector,
            command: record.command,
            values: record.values,
            rawOutput: record.result.stdout.trim(),
          });
        }

        const summaryLines = [
          `# Email Authentication (${domain})`,
          "\n## SPF",
          spf.values.length ? spf.values.join("\n") : "No SPF record detected.",
          "\n## DMARC",
          dmarc.values.length ? dmarc.values.join("\n") : "No DMARC record detected.",
          "\n## DKIM",
          dkimChecks.length
            ? dkimChecks
                .map((check) => {
                  const values = check.values.length
                    ? check.values.join("\n")
                    : "No record detected.";
                  return `Selector: ${check.selector}\n${values}`;
                })
                .join("\n\n")
            : "No selectors evaluated.",
        ].join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: summaryLines,
            },
          ],
          structuredContent: {
            domain,
            spf: {
              command: spf.command,
              values: spf.values,
              rawOutput: spf.result.stdout.trim(),
            },
            dmarc: {
              command: dmarc.command,
              values: dmarc.values,
              rawOutput: dmarc.result.stdout.trim(),
            },
            dkim: dkimChecks,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "m365-intune-summary",
    {
      description:
        "Generates a Microsoft 365 and Intune snapshot using the Microsoft 365 CLI. Requires prior authentication with `m365 login`.",
      inputSchema: {
        includeUsers: z.boolean().default(true),
        includeGroups: z.boolean().default(false),
        includeIntuneDevices: z.boolean().default(true),
        includeServiceHealth: z.boolean().default(true),
      },
    },
    async ({ includeUsers, includeGroups, includeIntuneDevices, includeServiceHealth }) => {
      try {
        const sections: Record<string, string> = {};
        const structuredContent: Record<string, unknown> = {};

        if (includeUsers) {
          const users = await deps.microsoft.listUsers();
          const items = ensureArray(users.parsed);
          sections.Users = items.length
            ? formatM365Items(items, ["displayName", "userPrincipalName", "mail"])
            : users.rawOutput || "No data returned.";
          structuredContent.users = {
            command: users.command,
            count: items.length,
            sample: limitItems(items, 50),
            rawOutput: users.rawOutput,
          };
        }

        if (includeGroups) {
          const groups = await deps.microsoft.listGroups();
          const items = ensureArray(groups.parsed);
          sections.Groups = items.length
            ? formatM365Items(items, ["displayName", "mail", "id"])
            : groups.rawOutput || "No data returned.";
          structuredContent.groups = {
            command: groups.command,
            count: items.length,
            sample: limitItems(items, 50),
            rawOutput: groups.rawOutput,
          };
        }

        if (includeIntuneDevices) {
          const devices = await deps.microsoft.listIntuneDevices();
          const items = ensureArray(devices.parsed);
          sections["Intune Devices"] = items.length
            ? formatM365Items(items, ["deviceName", "operatingSystem", "userDisplayName"])
            : devices.rawOutput || "No data returned.";
          structuredContent.intuneDevices = {
            command: devices.command,
            count: items.length,
            sample: limitItems(items, 50),
            rawOutput: devices.rawOutput,
          };
        }

        if (includeServiceHealth) {
          const health = await deps.microsoft.getServiceHealth();
          const items = ensureArray(health.parsed);
          sections["Service Health"] = items.length
            ? formatM365Items(items, ["service", "status", "id"])
            : health.rawOutput || "No data returned.";
          structuredContent.serviceHealth = {
            command: health.command,
            count: items.length,
            sample: limitItems(items, 50),
            rawOutput: health.rawOutput,
          };
        }

        if (Object.keys(sections).length === 0) {
          sections.Note = "No sections selected.";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Microsoft 365 Snapshot", sections),
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "web-service-status",
    {
      description:
        "Inspects common web server processes (nginx, Apache, Node) and optionally fetches response headers or runs a Lighthouse audit.",
      inputSchema: {
        url: z
          .string()
          .url()
          .optional()
          .describe("Optional URL to evaluate."),
        includeHeaders: z.boolean().default(true),
        includeLighthouse: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(60).default(10),
        lighthouseCategories: z
          .array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
          .default(["performance"]),
      },
    },
    async ({ url, includeHeaders, includeLighthouse, timeoutSeconds, lighthouseCategories }) => {
      try {
        const processes = await deps.webDiagnostics.checkProcesses();

        const sections: Record<string, string> = {
          "nginx processes": processes.nginx || "<none>",
          "Apache/httpd processes": processes.apache || "<none>",
          "Node-based servers": processes.node || "<none>",
        };

        let headersResult: CommandResult | undefined;
        if (url && includeHeaders) {
          headersResult = await deps.webDiagnostics.fetchHeaders(url, timeoutSeconds);
          sections.Headers = headersResult.stdout.trim() || headersResult.stderr.trim() || "No headers returned.";
        }

        let lighthouse;
        if (url && includeLighthouse) {
          lighthouse = await deps.webDiagnostics.runLighthouse(url, lighthouseCategories);
          sections.Lighthouse = lighthouse.error
            ? `Error: ${lighthouse.error}`
            : lighthouse.scores
                ? Object.entries(lighthouse.scores)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join("\n")
                : "No scores available.";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Web Service Status", sections),
            },
          ],
          structuredContent: {
            processes,
            headers: headersResult
              ? {
                  command: headersResult.command,
                  stdout: headersResult.stdout,
                  stderr: headersResult.stderr,
                }
              : undefined,
            lighthouse,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "web-performance-probe",
    {
      description: "Runs a curl performance probe against a URL, returning HTTP code and timing metrics.",
      inputSchema: {
        url: z.string().url(),
        method: z.string().default("GET"),
        headers: z
          .array(
            z.object({
              name: z.string().min(1),
              value: z.string().default(""),
            }),
          )
          .default([]),
        body: z.string().optional(),
        timeoutSeconds: z.number().int().min(1).max(60).default(15),
      },
    },
    async ({ url, method, headers, body, timeoutSeconds }) => {
      try {
        const headerMap = Object.fromEntries(headers.map((header) => [header.name, header.value]));
        const metrics = await deps.webDiagnostics.testEndpoint(url, {
          method,
          headers: headerMap,
          body,
          timeoutSeconds,
        });

        const sections: Record<string, string> = {
          URL: url,
          Method: method,
          "HTTP code": metrics.httpCode?.toString() ?? "Unknown",
          "Total time (s)": metrics.timeTotal?.toString() ?? "n/a",
          "TTFB (s)": metrics.timeStartTransfer?.toString() ?? "n/a",
          "Connect time (s)": metrics.timeConnect?.toString() ?? "n/a",
          "Bytes downloaded": metrics.sizeDownload?.toString() ?? "n/a",
        };

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Web Performance Probe", sections),
            },
          ],
          structuredContent: {
            metrics,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "network-port-scan",
    {
      description:
        "Performs TCP/UDP port scans using netcat. Optionally runs nmap when available for deeper inspection.",
      inputSchema: {
        host: z.string().min(1),
        ports: z
          .string()
          .default("80,443")
          .describe("Comma-separated list or ranges (e.g. '22,80,443,8000-8005')."),
        protocol: z.enum(["tcp", "udp", "both"]).default("tcp"),
        timeoutSeconds: z.number().int().min(1).max(30).default(3),
        useNmap: z.boolean().default(false),
      },
    },
    async ({ host, ports, protocol, timeoutSeconds, useNmap }) => {
      try {
        const portList = parsePortList(ports);
        if (portList.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No valid ports provided.",
              },
            ],
            structuredContent: {
              error: "No valid ports provided",
            },
          };
        }

        const tcpResults =
          protocol === "tcp" || protocol === "both"
            ? await deps.networkDiagnostics.scanTcpPorts(host, portList, timeoutSeconds)
            : undefined;
        const udpResults =
          protocol === "udp" || protocol === "both"
            ? await deps.networkDiagnostics.scanUdpPorts(host, portList, timeoutSeconds)
            : undefined;

        const nmapTcp = useNmap && (protocol === "tcp" || protocol === "both")
          ? await deps.networkDiagnostics.runNmap(host, portList, "tcp")
          : undefined;
        const nmapUdp = useNmap && (protocol === "udp" || protocol === "both")
          ? await deps.networkDiagnostics.runNmap(host, portList, "udp")
          : undefined;

        const describeScan = (
          scanResults: Awaited<ReturnType<typeof deps.networkDiagnostics.scanTcpPorts>> | undefined,
        ): string => {
          if (!scanResults) {
            return "<not run>";
          }
          return scanResults
            .map((entry) => {
              const status = entry.success ? "open" : "closed";
              const detail = entry.stderr.trim() || entry.stdout.trim();
              return `${entry.protocol.toUpperCase()} ${entry.port}: ${status}${detail ? `\n${detail}` : ""}`;
            })
            .join("\n\n");
        };

        const sections: Record<string, string> = {
          Host: host,
          Ports: portList.join(", "),
        };

        if (tcpResults) {
          sections["TCP scan"] = describeScan(tcpResults);
        }
        if (udpResults) {
          sections["UDP scan"] = describeScan(udpResults);
        }
        if (useNmap) {
          sections.nmap = [nmapTcp?.stdout, nmapUdp?.stdout].filter(Boolean).join("\n\n") || "nmap not available or produced no output.";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Network Port Scan", sections),
            },
          ],
          structuredContent: {
            host,
            ports: portList,
            tcp: tcpResults,
            udp: udpResults,
            nmapTcp,
            nmapUdp,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "firewall-diagnostics",
    {
      description:
        "Runs vendor-neutral firewall checks using pfctl and the macOS application firewall settings.",
      inputSchema: {},
    },
    async () => {
      try {
        const diagnostics = await deps.networkDiagnostics.firewallDiagnostics();

        const sections: Record<string, string> = {};
        if (diagnostics.pfctl) {
          sections.pfctl = diagnostics.pfctl.stdout.trim() || diagnostics.pfctl.stderr.trim() || "pfctl returned no output.";
        }
        if (diagnostics.socketFilter) {
          sections.socketfilterfw = diagnostics.socketFilter.stdout.trim() || diagnostics.socketFilter.stderr.trim();
        }
        if (diagnostics.applicationFirewall) {
          sections["Application Firewall"] = diagnostics.applicationFirewall.stdout.trim() || diagnostics.applicationFirewall.stderr.trim();
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Firewall Diagnostics", sections),
            },
          ],
          structuredContent: {
            diagnostics,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "structured-thinking-framework",
    {
      description:
        "Provides the standard structured thinking stages and optional custom extensions with guiding questions.",
      inputSchema: {
        includeExamples: z.boolean().default(true),
        customStages: z
          .array(
            z.object({
              id: z.string().min(1),
              title: z.string().min(1),
              description: z.string().min(1),
              guidingQuestions: z.array(z.string()).default([]),
              exampleActivities: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      },
    },
    async ({ includeExamples, customStages }) => {
      await deps.structuredThinking.ensureStorageFile();
      const framework = deps.structuredThinking.getFramework({
        includeExamples,
        customStages: customStages.length ? customStages : undefined,
      });

      const sections: Record<string, string> = {};
      for (const stage of framework) {
        const lines = [stage.description];
        if (stage.guidingQuestions?.length) {
          lines.push("\nGuiding questions:", ...stage.guidingQuestions.map((question) => `- ${question}`));
        }
        if (includeExamples !== false && stage.exampleActivities?.length) {
          lines.push("\nExample activities:", ...stage.exampleActivities.map((activity) => `- ${activity}`));
        }
        sections[stage.title] = lines.join("\n");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Structured Thinking Framework", sections),
          },
        ],
        structuredContent: {
          stages: framework,
        },
      };
    },
  );

  server.registerTool(
    "thought-tracker",
    {
      description:
        "Records sequential thoughts with stage metadata, tagging, and importance analysis.",
      inputSchema: {
        entries: z
          .array(
            z.object({
              stage: z.string().min(1),
              thought: z.string().min(1),
              metadata: z
                .object({
                  source: z.string().optional(),
                  tags: z.array(z.string()).default([]),
                  importance: z.enum(["low", "medium", "high"]).optional(),
                  references: z.array(z.string()).default([]),
                })
                .optional(),
            }),
          )
          .min(1),
        autoNumbering: z.boolean().default(true),
      },
    },
    async ({ entries, autoNumbering }) => {
      await deps.structuredThinking.ensureStorageFile();
      const tracking = deps.structuredThinking.trackThoughts(entries, autoNumbering);

      const timelineText = tracking.timeline
        .map((record) => {
          const bits = [`${record.id} [${record.stage}] ${record.thought}`];
          if (record.metadata?.tags?.length) {
            bits.push(`Tags: ${record.metadata.tags.join(", ")}`);
          }
          if (record.metadata?.importance) {
            bits.push(`Importance: ${record.metadata.importance}`);
          }
          if (record.metadata?.source) {
            bits.push(`Source: ${record.metadata.source}`);
          }
          return bits.join("\n");
        })
        .join("\n\n");

      const summaryLines = ["Stage tally:"]; // for final text
      for (const [stage, count] of Object.entries(tracking.stageTally)) {
        summaryLines.push(`- ${stage}: ${count}`);
      }

      if (Object.keys(tracking.importanceBreakdown).length) {
        summaryLines.push("\nImportance breakdown:");
        for (const [level, count] of Object.entries(tracking.importanceBreakdown)) {
          summaryLines.push(`- ${level}: ${count}`);
        }
      }

      if (Object.keys(tracking.tags).length) {
        summaryLines.push("\nTag counts:");
        for (const [tag, count] of Object.entries(tracking.tags)) {
          summaryLines.push(`- ${tag}: ${count}`);
        }
      }

      const sections = {
        Timeline: timelineText,
        Summary: summaryLines.join("\n"),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Thought Tracker", sections),
          },
        ],
        structuredContent: {
          tracking,
        },
      };
    },
  );

  server.registerTool(
    "capture_thought",
    {
      description:
        "Captures a single thought entry with sequencing metadata, persisting it to the workspace thought history file.",
      inputSchema: {
        thought: z.string().min(1),
        thought_number: z.number().int().min(1),
        total_thoughts: z.number().int().min(1),
        next_thought_needed: z.boolean(),
        stage: z.string().min(1),
        is_revision: z.boolean().optional(),
        revises_thought: z.number().int().min(1).optional(),
        branch_from_thought: z.number().int().min(1).optional(),
        branch_id: z.string().optional(),
        needs_more_thoughts: z.boolean().optional(),
        score: z.number().min(0).max(1).optional(),
        tags: z.array(z.string().min(1)).default([]),
        storagePath: z.string().optional(),
      },
    },
    async ({
      thought,
      thought_number,
      total_thoughts,
      next_thought_needed,
      stage,
      is_revision,
      revises_thought,
      branch_from_thought,
      branch_id,
      needs_more_thoughts,
      score,
      tags,
      storagePath,
    }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let existingTimeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (existingTimeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          existingTimeline = bootstrapped;
        }
      }
      const qualityScore = typeof score === "number" ? Number(score.toFixed(3)) : undefined;
      let importance: ThoughtMetadata["importance"] | undefined;
      if (typeof qualityScore === "number") {
        if (qualityScore >= 0.75) {
          importance = "high";
        } else if (qualityScore >= 0.4) {
          importance = "medium";
        } else {
          importance = "low";
        }
      }

      const metadata = {
        tags,
        importance,
        thoughtNumber: thought_number,
        totalThoughts: total_thoughts,
        nextThoughtNeeded: next_thought_needed,
        needsMoreThoughts: needs_more_thoughts,
        isRevision: is_revision,
        revisesThought: revises_thought,
        branchFromThought: branch_from_thought,
        branchId: branch_id,
        qualityScore,
        stageLabel: stage,
      } satisfies ThoughtMetadata;

      const record: ThoughtRecord = {
        id: `T${String(thought_number).padStart(3, "0")}`,
        stage,
        order: thought_number,
        thought: thought.trim(),
        timestamp: new Date().toISOString(),
        metadata,
      };

      const updatedTimeline = await deps.structuredThinking.appendThoughtRecord(record, targetPath);
      const normalisedTimeline = deps.structuredThinking.normaliseTimeline(updatedTimeline);
      await deps.structuredThinking.saveStoredTimeline(normalisedTimeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(normalisedTimeline);

      // Auto-assess thought quality using metacognitive feedback
      const thoughtIndex = normalisedTimeline.findIndex(t => t.id === record.id);
      const priorThoughts = normalisedTimeline.slice(0, thoughtIndex);
      const assessment = deps.metacognitive.assessThought(record, priorThoughts);

      const sections: Record<string, string> = {
        "Thought captured": thought.trim(),
        Stage: stage,
        "Sequence": `${thought_number} of ${total_thoughts}`,
        "Next thought needed": next_thought_needed ? "Yes" : "No",
        "Stored at": targetPath,
      };

      // Display automated quality assessment
      const dims = assessment.qualityDimensions;
      sections["Quality Assessment"] = [
        `Overall: ${(assessment.overallScore * 100).toFixed(1)}% (confidence: ${(assessment.confidence * 100).toFixed(1)}%)`,
        `Completeness: ${(dims.completeness * 100).toFixed(0)}% | Specificity: ${(dims.specificity * 100).toFixed(0)}% | Coherence: ${(dims.coherence * 100).toFixed(0)}%`,
        `Novelty: ${(dims.novelty * 100).toFixed(0)}% | Actionability: ${(dims.actionability * 100).toFixed(0)}% | Evidence: ${(dims.evidenceBased * 100).toFixed(0)}%`,
      ].join('\n');

      if (assessment.flags.length > 0) {
        const flagsText = assessment.flags
          .map(f => `[${f.type.toUpperCase()}] ${f.message}`)
          .join('\n');
        sections["Quality Flags"] = flagsText;
      }

      if (assessment.suggestions.length > 0) {
        const suggestionsText = assessment.suggestions
          .slice(0, 3) // Top 3 suggestions
          .map(s => `- ${s}`)
          .join('\n');
        sections["Suggestions"] = suggestionsText;
      }

      // Keep legacy score display for backward compatibility
      if (typeof qualityScore === "number") {
        sections["Legacy Score"] = qualityScore.toString();
      }

      if (branch_id) {
        sections["Branch"] = branch_id;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Thought Capture", sections),
          },
        ],
        structuredContent: {
          record,
          tracking,
          qualityAssessment: assessment,
        },
      };
    },
  );

  server.registerTool(
    "devops-task-plan",
    {
      description:
        "Generates a DevOps checklist, CI/CD pipeline, and debugging tracks from the stored thought history, ready for Linear/Notion export.",
      inputSchema: {
        goal: z.string().default("Structured thinking session"),
        context: z.string().optional(),
        assumptions: z.array(z.string()).default([]),
        constraints: z.array(z.string()).default([]),
        stages: z.array(z.string()).default([]),
        storagePath: z.string().optional(),
      },
    },
    async ({ goal, context, assumptions, constraints, stages, storagePath }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let timeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (timeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          timeline = bootstrapped;
        }
      }

      timeline = deps.structuredThinking.normaliseTimeline(timeline);
      await deps.structuredThinking.saveStoredTimeline(timeline, targetPath);

      const decomposition = deps.taskDecomposition.buildDecomposition({
        goal,
        context,
        assumptions,
        constraints,
        stages: stages.length ? stages : undefined,
        thoughts: timeline,
      });

      const linearPayload = deps.taskDecomposition.prepareLinearPayload(decomposition.tasks);
      const notionPayload = deps.taskDecomposition.prepareNotionPayload(decomposition.tasks);

      const summarySections: Record<string, string> = {
        Goal: goal,
        "Critical path": decomposition.criticalPath.join(" -> "),
        "CI pipeline": decomposition.ciPipeline.map((stage) => stage.name).join(", "),
        "Debug tracks": decomposition.debugTracks.length
          ? decomposition.debugTracks.map((track) => `${track.id} (${track.status})`).join(", ")
          : "None",
        "Tasks": decomposition.tasks.length.toString(),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("DevOps Task Plan", summarySections),
          },
        ],
        structuredContent: {
          decomposition,
          linearPayload,
          notionPayload,
          storagePath: targetPath,
        },
      };
    },
  );

  server.registerTool(
    "thought-summary",
    {
      description:
        "Builds a summary of the stored thought history, including progress metrics and related thought groupings.",
      inputSchema: {
        storagePath: z.string().optional(),
        topRelated: z.number().int().min(1).max(20).default(5),
      },
    },
    async ({ storagePath, topRelated }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let timeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (timeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          timeline = bootstrapped;
        }
      }
      timeline = deps.structuredThinking.normaliseTimeline(timeline);
      await deps.structuredThinking.saveStoredTimeline(timeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(timeline);

      const related = tracking.relatedThoughts.slice(0, topRelated);
      const relatedText = related.length
        ? related
            .map((group) => {
              const label = group.tag ?? group.stage ?? group.importance ?? "related";
              const items = group.thoughts
                .map((thought) => `  - ${thought.id} [${thought.stage}] ${thought.thought}`)
                .join("\n");
              return `* ${label}\n${items}`;
            })
            .join("\n\n")
        : "No related thoughts detected.";

      const sections: Record<string, string> = {
        Summary: tracking.summary,
        Progress: `${tracking.progress.completed}/${tracking.progress.total} (${tracking.progress.percentage}%)`,
        "Related thoughts": relatedText,
        "Storage path": targetPath,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Thought Summary", sections),
          },
        ],
        structuredContent: {
          tracking,
          related: related,
          storagePath: targetPath,
        },
      };
    },
  );

  server.registerTool(
    "thought-export",
    {
      description:
        "Exports the stored thought history to JSON/Markdown formats within the workspace and returns the output string.",
      inputSchema: {
        format: z.enum(["json", "jsonb", "markdown", "claude", "agents"]).default("json"),
        includeMetadata: z.boolean().default(true),
        destinationPath: z.string().optional(),
        storagePath: z.string().optional(),
      },
    },
    async ({ format, includeMetadata, destinationPath, storagePath }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let timeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (timeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          timeline = bootstrapped;
        }
      }
      timeline = deps.structuredThinking.normaliseTimeline(timeline);
      await deps.structuredThinking.saveStoredTimeline(timeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(timeline);

      const resolvedDestination = destinationPath
        ? pathResolve(destinationPath)
        : getDefaultExportPath(format as ThoughtExportFormat);

      const contents = await deps.structuredThinking.exportToFile(
        tracking,
        {
          format,
          includeMetadata,
        },
        resolvedDestination,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Thought Export", {
              Format: format,
              "Destination file": resolvedDestination,
              Bytes: Buffer.byteLength(contents, "utf8").toString(),
            }),
          },
        ],
        structuredContent: {
          format,
          destination: resolvedDestination,
          output: contents,
        },
      };
    },
  );

  server.registerTool(
    "thought-import",
    {
      description:
        "Imports thoughts from JSON or Markdown content into the workspace history file, optionally appending to existing entries.",
      inputSchema: {
        format: z.enum(["json", "jsonb", "markdown", "claude", "agents"]),
        content: z.string().min(1),
        append: z.boolean().default(true),
        storagePath: z.string().optional(),
      },
    },
    async ({ format, content, append, storagePath }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let existingTimeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (existingTimeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          existingTimeline = bootstrapped;
        }
      }
      existingTimeline = deps.structuredThinking.normaliseTimeline(existingTimeline);
      const imported = deps.structuredThinking.importThoughts({ format, content });

      const combinedTimeline = append
        ? deps.structuredThinking.normaliseTimeline([...existingTimeline, ...imported.timeline])
        : deps.structuredThinking.normaliseTimeline(imported.timeline);

      await deps.structuredThinking.saveStoredTimeline(combinedTimeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(combinedTimeline);

      const sections: Record<string, string> = {
        "Import format": format,
        Mode: append ? "appended" : "replaced",
        "Timeline length": tracking.timeline.length.toString(),
        "Storage path": targetPath,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Thought Import", sections),
          },
        ],
        structuredContent: {
          tracking,
          storagePath: targetPath,
        },
      };
    },
  );

  server.registerTool(
    "structured-diagnostics",
    {
      description: "Analyzes the structured thinking timeline for coverage gaps, stale entries, and pending high-importance work.",
      inputSchema: {
        staleHours: z.number().int().min(1).max(168).default(24),
        storagePath: z.string().optional(),
      },
    },
    async ({ staleHours, storagePath }) => {
      const { timeline, storagePath: resolvedPath } = await loadStructuredTimeline(deps, storagePath);
      const diagnostics = deps.structuredThinking.diagnoseTimeline(timeline, { staleHours });

      const stageCoverageText = Object.entries(diagnostics.stageCoverage)
        .map(([stage, count]) => `- ${stage}: ${count}`)
        .join("\n");
      const missingText = diagnostics.missingStages.length
        ? diagnostics.missingStages.map((stage) => `- ${stage}`).join("\n")
        : "<none>";
      const pendingText = diagnostics.highImportancePending.length
        ? diagnostics.highImportancePending
            .map((record) => `- ${record.id} [${record.stage}] ${record.thought}`)
            .join("\n")
        : "<none>";
      const sourcesText = diagnostics.sourceSummaries.length
        ? diagnostics.sourceSummaries
            .map((summary) => `- ${summary.source}: ${summary.count} (last: ${summary.lastRecorded})`)
            .join("\n")
        : "<none>";

      const sections: Record<string, string> = {
        "Total thoughts": diagnostics.totalThoughts.toString(),
        "Last updated": diagnostics.lastUpdated ?? "unknown",
        "Stage coverage": stageCoverageText,
        "Missing stages": missingText,
        "High-importance pending": pendingText,
        "Source summary": sourcesText,
        "Storage path": resolvedPath,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Structured Thinking Diagnostics", sections),
          },
        ],
        structuredContent: {
          diagnostics,
          storagePath: resolvedPath,
        },
      };
    },
  );

  server.registerTool(
    "structured-report",
    {
      description: "Generates a comprehensive structured thinking report in Markdown or JSON, optionally including the recent timeline.",
      inputSchema: {
        format: z.enum(["markdown", "json"]).default("markdown"),
        includeTimeline: z.boolean().default(false),
        maxEntries: z.number().int().min(1).max(200).default(25),
        staleHours: z.number().int().min(1).max(168).default(24),
        storagePath: z.string().optional(),
      },
    },
    async ({ format, includeTimeline, maxEntries, staleHours, storagePath }) => {
      const { timeline, storagePath: resolvedPath } = await loadStructuredTimeline(deps, storagePath);
      const report = deps.structuredThinking.generateReport(timeline, {
        format,
        includeTimeline,
        maxEntries,
        staleHours,
      });

      const textContent = format === "markdown" ? report.content : `Report (${format})\n\n${report.content}`;

      return {
        content: [
          {
            type: "text" as const,
            text: textContent,
          },
        ],
        structuredContent: {
          report,
          storagePath: resolvedPath,
        },
      };
    },
  );

  // Metacognitive feedback tools
  server.registerTool(
    "assess-thought-quality",
    {
      description: "Assess the quality of one or more thoughts using multi-dimensional analysis (completeness, specificity, coherence, novelty, actionability, evidence-based scoring with confidence levels and actionable suggestions)",
      inputSchema: {
        thoughtIds: z.array(z.string()).min(1).optional(),
        recentCount: z.number().int().min(1).max(10).default(1),
        storagePath: z.string().optional(),
      },
    },
    async ({ thoughtIds, recentCount, storagePath }) => {
      const { timeline } = await loadStructuredTimeline(deps, storagePath);

      const thoughtsToAssess = thoughtIds
        ? timeline.filter(t => thoughtIds.includes(t.id))
        : timeline.slice(-recentCount);

      if (thoughtsToAssess.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: toTextContent("Thought Quality Assessment", {
              "Status": "No thoughts found to assess",
            }),
          }],
          structuredContent: { assessments: [] },
        };
      }

      const assessments = thoughtsToAssess.map((thought) => {
        const thoughtIndex = timeline.indexOf(thought);
        const priorThoughts = timeline.slice(0, thoughtIndex);
        return deps.metacognitive.assessThought(thought, priorThoughts);
      });

      const sections: Record<string, string> = {};
      for (const assessment of assessments) {
        const dims = assessment.qualityDimensions;
        const flagsText = assessment.flags.length
          ? assessment.flags.map(f => `[${f.type.toUpperCase()}] ${f.message}`).join('\n      ')
          : 'None';
        const suggestionsText = assessment.suggestions.length
          ? assessment.suggestions.map(s => `  - ${s}`).join('\n    ')
          : 'None';

        sections[assessment.thoughtId] = [
          `Overall Score: ${(assessment.overallScore * 100).toFixed(1)}% (confidence: ${(assessment.confidence * 100).toFixed(1)}%)`,
          `Dimensions:`,
          `  - Completeness: ${(dims.completeness * 100).toFixed(0)}%`,
          `  - Specificity: ${(dims.specificity * 100).toFixed(0)}%`,
          `  - Coherence: ${(dims.coherence * 100).toFixed(0)}%`,
          `  - Novelty: ${(dims.novelty * 100).toFixed(0)}%`,
          `  - Actionability: ${(dims.actionability * 100).toFixed(0)}%`,
          `  - Evidence-Based: ${(dims.evidenceBased * 100).toFixed(0)}%`,
          `Flags: ${flagsText}`,
          `Suggestions:\n    ${suggestionsText}`,
        ].join('\n');
      }

      return {
        content: [{
          type: "text" as const,
          text: toTextContent("Thought Quality Assessment", sections),
        }],
        structuredContent: { assessments },
      };
    }
  );

  server.registerTool(
    "metacognitive-report",
    {
      description: "Generate comprehensive quality report for structured thinking session with quality trends, stage-specific analysis, and improvement recommendations",
      inputSchema: {
        minThoughts: z.number().int().min(1).default(1),
        storagePath: z.string().optional(),
      },
    },
    async ({ minThoughts, storagePath }) => {
      const { timeline } = await loadStructuredTimeline(deps, storagePath);

      if (timeline.length < minThoughts) {
        return {
          content: [{
            type: "text" as const,
            text: toTextContent("Metacognitive Report", {
              "Status": `Insufficient thoughts (${timeline.length}/${minThoughts} required)`,
            }),
          }],
          structuredContent: { error: "Insufficient thoughts" },
        };
      }

      const report = deps.metacognitive.generateReport(timeline);

      const trendsText = report.trends.map((trend: { readonly dimension: string; readonly direction: string; readonly changeRate: number; readonly recentAverage: number }) => {
        const arrow = trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
        return `  ${arrow} ${trend.dimension}: ${trend.direction} (${(trend.changeRate * 100).toFixed(1)}%/thought, recent avg: ${(trend.recentAverage * 100).toFixed(0)}%)`;
      }).join('\n');

      const stageQualityText = Object.entries(report.stageQuality)
        .map(([stage, score]) => `  - ${stage}: ${(score * 100).toFixed(0)}%`)
        .join('\n');

      const issuesText = report.criticalIssues.length
        ? report.criticalIssues.map(issue => `  - ${issue}`).join('\n')
        : '  None';

      const recommendationsText = report.recommendations.length
        ? report.recommendations.map(rec => `  - ${rec}`).join('\n')
        : '  None';

      const sections: Record<string, string> = {
        "Overall Quality": `${(report.overallQuality * 100).toFixed(1)}%`,
        "Total Assessments": report.assessments.length.toString(),
        "Quality Trends": trendsText || '  No trends detected',
        "Stage Quality": stageQualityText || '  No stage data',
        "Critical Issues": issuesText,
        "Recommendations": recommendationsText,
        "Needs Follow-up": report.needsFollowUp ? 'Yes' : 'No',
      };

      return {
        content: [{
          type: "text" as const,
          text: toTextContent("Metacognitive Report", sections),
        }],
        structuredContent: { report },
      };
    }
  );

  server.registerTool(
    "quality-trends",
    {
      description: "Analyze quality trends across thought timeline to identify improving, declining, or stable dimensions",
      inputSchema: {
        dimensions: z.array(z.enum([
          "completeness",
          "specificity",
          "coherence",
          "novelty",
          "actionability",
          "evidenceBased"
        ])).optional(),
        minAssessments: z.number().int().min(3).default(3),
        storagePath: z.string().optional(),
      },
    },
    async ({ dimensions, minAssessments, storagePath }) => {
      const { timeline } = await loadStructuredTimeline(deps, storagePath);

      if (timeline.length < minAssessments) {
        return {
          content: [{
            type: "text" as const,
            text: toTextContent("Quality Trends", {
              "Status": `Insufficient thoughts (${timeline.length}/${minAssessments} required)`,
            }),
          }],
          structuredContent: { trends: [] },
        };
      }

      const assessments = timeline.map((thought, index) => {
        const priorThoughts = timeline.slice(0, index);
        return deps.metacognitive.assessThought(thought, priorThoughts);
      });

      const allTrends = deps.metacognitive.analyzeTrends(assessments);
      const trends = dimensions
        ? allTrends.filter(t => dimensions.includes(t.dimension as "completeness" | "specificity" | "coherence" | "novelty" | "actionability" | "evidenceBased"))
        : allTrends;

      const sections: Record<string, string> = {};
      for (const trend of trends) {
        const arrow = trend.direction === 'improving' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
        sections[`${arrow} ${trend.dimension}`] = [
          `Direction: ${trend.direction}`,
          `Change Rate: ${(trend.changeRate * 100).toFixed(2)}% per thought`,
          `Recent Average (last 3): ${(trend.recentAverage * 100).toFixed(1)}%`,
          `Historical Average: ${(trend.historicalAverage * 100).toFixed(1)}%`,
        ].join('\n');
      }

      return {
        content: [{
          type: "text" as const,
          text: toTextContent("Quality Trends Analysis", sections),
        }],
        structuredContent: { trends },
      };
    }
  );

  server.registerTool(
    "compliance-audit",
    {
      description:
        "Runs Essential 8 and optional NIST compliance checks against a supplied system inventory and control set.",
      inputSchema: {
        systems: z.array(
          z.object({
            id: z.string().default(() => randomUUID()),
            name: z.string(),
            os: z.string(),
            patchLevel: z.string().optional(),
            lastPatched: z.string().optional(),
            mfaEnabled: z.boolean().optional(),
            applicationControl: z.boolean().optional(),
            hardeningBaseline: z.string().optional(),
            backupStatus: z.enum(["healthy", "warning", "failed"]).optional(),
            loggingStatus: z.enum(["centralised", "local-only", "missing"]).optional(),
            internetFacing: z.boolean().optional(),
          }),
        ),
        controls: z
          .array(
            z.object({
              id: z.string(),
              family: z.string(),
              description: z.string(),
              implemented: z.boolean().optional(),
              evidence: z.array(z.string()).default([]),
            }),
          )
          .default([]),
        framework: z.enum(["NIST CSF", "NIST 800-53"]).default("NIST CSF"),
        generateEvidence: z.boolean().default(false),
        evidenceName: z.string().optional(),
      },
    },
    async ({ systems, controls, framework, generateEvidence, evidenceName }) => {
      const essential = deps.complianceAudit.auditEssential8(systems);
      const nist = controls.length
        ? deps.complianceAudit.validateNIST(controls, framework)
        : undefined;

      let evidencePackage;
      if (generateEvidence) {
        const findings = essential.checklist
          .filter((item) => !item.compliant)
          .map((item, index) => ({
            id: `E8-${index + 1}`,
            title: item.area,
            severity: "medium" as const,
            details: item.remediation ?? `Remediate ${item.area} gap`,
            remediation: item.remediation,
            evidence: item.evidence,
          }));
        evidencePackage = await deps.complianceAudit.generateEvidencePackage(findings, evidenceName);
      }

      const sections: Record<string, string> = {
        "Essential Eight score": `${essential.overallScore.toFixed(1)}%`,
        "Systems analysed": systems.length.toString(),
      };

      if (nist) {
        sections[`${framework} coverage`] = `${nist.coverage.toFixed(1)}%`;
        if (nist.gaps.length) {
          sections["NIST gaps"] = nist.gaps
            .slice(0, 5)
            .map((gap) => `${gap.controlId}: ${gap.remediation}`)
            .join("\n");
        }
      }

      if (evidencePackage) {
        sections["Evidence package"] = evidencePackage.location;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Compliance Audit", sections),
          },
        ],
        structuredContent: {
          essential,
          nist,
          evidencePackage,
        },
      };
    },
  );

  server.registerTool(
    "network-infra-diagnostics",
    {
      description:
        "Generates network troubleshooting plans (trace path, firewall validation, dual-stack checks) using provided symptoms and topology data.",
      inputSchema: {
        source: z.string().default("10.0.0.1"),
        destination: z.string().default("10.0.0.2"),
        includeFirewallAnalysis: z.boolean().default(true),
        includeNatLookup: z.boolean().default(false),
        includeCaptureCommands: z.boolean().default(false),
        firewallDevice: z.string().default("PaloAlto-Cluster"),
        firewallPolicy: z.array(z.string()).default([]),
        performDualStackCheck: z.boolean().default(true),
        topologyNodes: z
          .array(
            z.object({
              id: z.string(),
              type: z.enum(["firewall", "switch", "router", "server", "vpn", "dns", "dhcp", "other"]),
              name: z.string(),
              metadata: z.record(z.unknown()).optional(),
            }),
          )
          .default([]),
        topologyLinks: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              linkType: z.enum(["ethernet", "lag", "vlan", "vpn", "wireless", "virtual"]),
              description: z.string().optional(),
            }),
          )
          .default([]),
      },
    },
    async ({
      source,
      destination,
      includeFirewallAnalysis,
      includeNatLookup,
      includeCaptureCommands,
      firewallDevice,
      firewallPolicy,
      performDualStackCheck,
      topologyNodes,
      topologyLinks,
    }) => {
      const path = deps.networkInfra.tracePath(source, destination, {
        includeFirewallAnalysis,
        includeNatLookup,
        includeCaptureCommands,
      });

      const firewall = firewallPolicy.length
        ? deps.networkInfra.validateFirewallRules(firewallDevice, "production", firewallPolicy)
        : undefined;

      const dualStack = performDualStackCheck
        ? deps.networkInfra.diagnoseDualStack(`${source}->${destination}`)
        : undefined;

      const topology = topologyNodes.length || topologyLinks.length
        ? deps.networkInfra.generateTopology(topologyNodes, topologyLinks)
        : undefined;

      const sections: Record<string, string> = {
        "Trace summary": `${source} -> ${destination} (${path.steps.length} checkpoints)`,
        "Suggested commands": path.steps
          .slice(0, 3)
          .map((step) => `* ${step.layer}: ${step.commands.join(", ")}`)
          .join("\n"),
      };

      if (firewall) {
        sections["Firewall findings"] = firewall.summary;
      }
      if (dualStack) {
        sections["Dual-stack status"] = `${dualStack.ipv4Status} / ${dualStack.ipv6Status}`;
      }

      safeCaptureReport(deps.reportingHub, {
        tool: "network-infra-diagnostics",
        summary: `Analysed path ${source} -> ${destination} (${path.steps.length} checkpoints).`,
        sections,
        tags: ["network", "firewall", includeFirewallAnalysis ? "policy" : "topology"],
        references: dualStack ? dualStack.checkpoints : undefined,
        importance: includeFirewallAnalysis ? "high" : "medium",
        devOpsCategory: "network",
        executionContext: `source=${source}, destination=${destination}`,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Network Infrastructure Diagnostics", sections),
          },
        ],
        structuredContent: {
          path,
          firewall,
          dualStack,
          topology,
        },
      };
    },
  );

  server.registerTool(
    "mac-diagnostics",
    {
      description:
        "Performs deep macOS diagnostics and repair operations locally or via SSH (hardware, performance, security, network, storage).",
      inputSchema: {
        mode: z.enum(["local", "remote"]).default("local"),
        operation: z.enum(["diagnostics", "repair"]).default("diagnostics"),
        suite: z.enum(MAC_DIAGNOSTIC_SUITES).optional(),
        repairAction: z.enum(MAC_REPAIR_ACTIONS).optional(),
        baselinePath: z.string().optional(),
        compareBaseline: z.boolean().default(false),
        updateBaseline: z.boolean().default(false),
        cacheTtlSeconds: z.number().int().min(5).max(3600).optional(),
        host: z.string().optional(),
        username: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
        extraOptions: z.record(z.string()).optional(),
      },
    },
    async ({
      mode,
      operation,
      suite,
      repairAction,
      baselinePath,
      compareBaseline,
      updateBaseline,
      cacheTtlSeconds,
      host,
      username,
      port,
      identityFile,
      knownHostsFile,
      allocateTty,
      timeoutSeconds,
      extraOptions,
    }) => {
      const capability = mode === "local" ? (operation === "diagnostics" ? "local-sudo" : "local-sudo") : "ssh-mac";
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: "mac-diagnostics",
          capability,
          payload: {
            mode,
            operation,
            suite,
            repairAction,
            baselinePath,
            compareBaseline,
            updateBaseline,
            host,
            username,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("macOS Diagnostics", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const sshOptions = mode === "remote"
          ? {
              host: host ?? (() => {
                throw new Error("Remote diagnostics require 'host'.");
              })(),
              username: username ?? (() => {
                throw new Error("Remote diagnostics require 'username'.");
              })(),
              port,
              identityFile,
              knownHostsFile,
              allocateTty,
              timeoutSeconds,
              extraOptions: extraOptions ?? undefined,
            }
          : undefined;

        let results;
        let baselineDetails: DiagnosticsRunOutput | undefined;
        if (operation === "diagnostics") {
          if (!suite) {
            throw new Error("Diagnostics operation requires 'suite'.");
          }
          if (mode === "local") {
            baselineDetails = await deps.macDiagnostics.runLocalDiagnosticsWithBaseline({
              suite,
              baselinePath,
              compareBaseline,
              updateBaseline,
              cacheTtlSeconds,
            });
            results = baselineDetails.results;
          } else {
            results = await deps.macDiagnostics.runRemoteDiagnostics({
              ...(sshOptions as NonNullable<typeof sshOptions>),
              suite,
            });
          }
        } else {
          if (!repairAction) {
            throw new Error("Repair operation requires 'repairAction'.");
          }
          results = mode === "local"
            ? await deps.macDiagnostics.runLocalRepair(repairAction)
            : await deps.macDiagnostics.runRemoteRepair({
                ...(sshOptions as NonNullable<typeof sshOptions>),
                action: repairAction,
              });
        }

        const sections: Record<string, string> = {};
        for (const item of results) {
          sections[item.label] = item.stdout.trim() || item.stderr.trim() || "<no output>";
        }

        if (baselineDetails?.comparisons && baselineDetails.comparisons.length) {
          const comparisonSummary = baselineDetails.comparisons
            .map((comparison) => `- ${comparison.label}: ${comparison.changed ? "changed" : "no change"} (${comparison.currentHash})`)
            .join("\n");
          sections["Baseline comparison"] = comparisonSummary;
        }

        if (baselineDetails?.baselinePath) {
          const statusLabel = baselineDetails.baselineUpdated
            ? "Updated"
            : updateBaseline
              ? "Not updated"
              : compareBaseline
                ? "Read"
                : "Available";
          sections["Baseline path"] = `${baselineDetails.baselinePath} (${statusLabel})`;
        }

        if (mode === "local" && cacheTtlSeconds) {
          const cacheLabel = baselineDetails?.cacheHit ? "Hit" : "Miss";
          sections["Cache status"] = `${cacheLabel} (TTL ${cacheTtlSeconds}s)`;
        }

        const changeTotals = baselineDetails?.comparisons
          ? {
              changed: baselineDetails.comparisons.filter((comparison) => comparison.changed).length,
              total: baselineDetails.comparisons.length,
            }
          : undefined;

        const reportTags = ["macos", operation, mode === "local" ? "local" : "remote"];
        if (changeTotals) {
          reportTags.push("baseline");
        }

        const changeSuffix = changeTotals ? ` (baseline changes: ${changeTotals.changed}/${changeTotals.total})` : "";

        safeCaptureReport(deps.reportingHub, {
          tool: "mac-diagnostics",
          summary: `${mode === "local" ? "Local" : `Remote ${host ?? "unknown"}`} macOS ${operation} (${operation === "diagnostics" ? suite : repairAction}) completed${changeSuffix}`,
          sections,
          tags: reportTags,
          importance: operation === "repair" ? "high" : "medium",
          devOpsCategory: "endpoint",
          executionContext:
            mode === "remote" && host ? `host=${host}, user=${username ?? "unknown"}` : "local",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("macOS Diagnostics", sections),
            },
          ],
          structuredContent: {
            mode,
            operation,
            results,
            baseline: baselineDetails
              ? {
                  comparisons: baselineDetails.comparisons,
                  baselinePath: baselineDetails.baselinePath,
                  baselineUpdated: baselineDetails.baselineUpdated,
                  cacheHit: baselineDetails.cacheHit,
                  cacheTtlSeconds,
                }
              : undefined,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "tool-metadata",
    {
      description: "Returns catalog metadata for registered MCP tools including capabilities and runtime expectations.",
      inputSchema: {
        toolId: z.string().optional(),
      },
    },
    async ({ toolId }) => {
      const metadata = toolId ? getToolMetadata(toolId) : undefined;
      const list = metadata ? [metadata] : listToolMetadata();

      if (toolId && !metadata) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No metadata found for tool '${toolId}'.`,
            },
          ],
          structuredContent: {
            toolId,
            metadata: null,
          },
        };
      }

      const sections: Record<string, string> = {};
      for (const entry of list) {
        sections[entry.id] = [
          entry.description,
          `Capabilities: ${entry.requiredCapabilities.length ? entry.requiredCapabilities.join(", ") : "none"}`,
          entry.estimatedDuration ? `Estimated duration: ${entry.estimatedDuration}` : undefined,
          entry.recommendedPrivileges ? `Privileges: ${entry.recommendedPrivileges}` : undefined,
          entry.supportsStreaming ? "Supports streaming responses" : undefined,
        ]
          .filter(Boolean)
          .join("\n");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Tool Metadata", sections),
          },
        ],
        structuredContent: {
          toolId: toolId ?? null,
          metadata: list,
        },
      };
    },
  );

  server.registerTool(
    "playbook-preview",
    {
      description:
        "Validates and summarizes a sequence of tool executions (playbook) without running the underlying tools.",
      inputSchema: {
        name: z.string().default("mac-playbook"),
        captureReport: z.boolean().default(true),
        steps: z
          .array(
            z.object({
              id: z.string().default(() => randomUUID()),
              tool: z.string(),
              description: z.string().optional(),
              params: z.record(z.any()).default({}),
            }),
          )
          .min(1),
      },
    },
    async ({ name, captureReport, steps }) => {
      const lines: string[] = [];
      const capabilitySet = new Set<string>();
      const missingMetadata: string[] = [];

      steps.forEach((step, index) => {
        const metadata = getToolMetadata(step.tool);
        if (metadata) {
          for (const capability of metadata.requiredCapabilities) {
            capabilitySet.add(capability);
          }
        } else {
          missingMetadata.push(step.tool);
        }
        lines.push(`${index + 1}. ${step.tool}${metadata ? ` (${metadata.estimatedDuration ?? "unknown"})` : ""}`);
        if (step.description) {
          lines.push(`   • ${step.description}`);
        }
      });

      const sections: Record<string, string> = {
        Summary: `${steps.length} steps • ${capabilitySet.size} capability groups required`,
        Steps: lines.join("\n"),
        Capabilities: capabilitySet.size
          ? Array.from(capabilitySet.values()).sort().join(", ")
          : "<none>",
        "Metadata coverage": missingMetadata.length
          ? `Missing metadata for: ${missingMetadata.join(", ")}`
          : "All steps have metadata",
      };

      if (captureReport) {
        safeCaptureReport(deps.reportingHub, {
          tool: "playbook-preview",
          summary: `${name}: ${steps.length} steps planned`,
          sections,
          stage: "planning",
          tags: ["playbook", "planning"],
          importance: "medium",
          devOpsCategory: "endpoint",
        });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent(`Playbook Preview: ${name}`, sections),
          },
        ],
        structuredContent: {
          name,
          steps,
          requiredCapabilities: Array.from(capabilitySet.values()),
          missingMetadata,
        },
      };
    },
  );

  server.registerTool(
    "docker-desktop-status",
    {
      description: "Summarizes Docker Desktop CLI availability, engine status, and running containers on macOS.",
      inputSchema: {},
    },
    async () => {
      try {
        const status = await deps.dockerDesktop.getStatus();
        const sections: Record<string, string> = {
          Availability: status.cliAvailable ? "Docker CLI detected" : status.error ?? "CLI not found",
          Containers: status.containers && status.containers.length
            ? status.containers.map((container) => `- ${container.name}: ${container.status}`).join("\n")
            : "<no running containers>",
        };

        if (status.info) {
          const infoRecord = status.info as Record<string, unknown>;
          const server = infoRecord.Server && typeof infoRecord.Server === "object" ? (infoRecord.Server as Record<string, unknown>) : undefined;
          const client = infoRecord.Client && typeof infoRecord.Client === "object" ? (infoRecord.Client as Record<string, unknown>) : undefined;
          const serverVersion = typeof server?.Version === "string" ? server.Version : undefined;
          const clientVersion = typeof client?.Version === "string" ? client.Version : undefined;

          const engineLines = [
            serverVersion ? `Server: ${serverVersion}` : undefined,
            clientVersion ? `Client: ${clientVersion}` : undefined,
          ].filter((line): line is string => Boolean(line));

          if (engineLines.length) {
            sections["Engine"] = engineLines.join("\n");
          }
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "docker-desktop-status",
          summary: status.cliAvailable
            ? `Docker CLI available • containers=${status.containers?.length ?? 0}`
            : status.error ?? "Docker CLI unavailable",
          sections,
          stage: "analysis",
          tags: ["docker", "macos"],
          importance: "medium",
          devOpsCategory: "developer-experience",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Docker Desktop Status", sections),
            },
          ],
          structuredContent: {
            status,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "mac-permissions-overview",
    {
      description:
        "Audits macOS admin membership, SecureToken presence, FileVault status, and TCC service counts.",
      inputSchema: {
        tccLimit: z.number().int().min(1).max(50).default(10),
        captureReport: z.boolean().default(true),
      },
    },
    async ({ tccLimit, captureReport }) => {
      try {
        const overview = await deps.macPermissions.collectOverview();
        const adminText = overview.adminGroup.members.length
          ? overview.adminGroup.members.join(", ")
          : "<no admin members>";

        const secureTokenText = overview.secureTokens.tokens.length
          ? overview.secureTokens.tokens.map((entry) => `${entry.user} (${entry.uuid})`).join("\n")
          : "<no secure token holders>";

        const tccTop = overview.tccSummary.services
          .slice(0, tccLimit)
          .map((svc) => `${svc.service}: ${svc.entries}`)
          .join("\n");

        const sections: Record<string, string> = {
          "Admin group": adminText,
          "Secure tokens": secureTokenText,
          "FileVault": overview.fileVault.details || (overview.fileVault.enabled ? "Enabled" : "Disabled"),
          "TCC services": tccTop || "<no TCC entries>",
        };

        if (captureReport) {
          safeCaptureReport(deps.reportingHub, {
            tool: "mac-permissions-overview",
            summary: `Admin accounts (${overview.adminGroup.members.length}), secure tokens (${overview.secureTokens.tokens.length}), FileVault ${overview.fileVault.enabled ? "enabled" : "disabled"}`,
            sections,
            stage: "analysis",
            tags: ["macos", "permissions", "security"],
            importance: overview.fileVault.enabled ? "medium" : "high",
            devOpsCategory: "endpoint",
            debugLayer: "permissions",
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("macOS Permissions Overview", sections),
            },
          ],
          structuredContent: {
            overview,
            tccLimit,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "mac-permissions-audit",
    {
      description:
        "Runs a structured permissions audit for macOS endpoints, highlighting compliance issues and remediation guidance.",
      inputSchema: {
        captureReport: z.boolean().default(true),
      },
    },
    async ({ captureReport }) => {
      try {
        const audit = await deps.macPermissions.auditPermissions();
        const findingsText = audit.findings.length
          ? audit.findings
              .map((finding, index) => `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.message}${finding.remediation ? `\n   Remediation: ${finding.remediation}` : ""}`)
              .join("\n")
          : "No permission issues detected.";

        const sections: Record<string, string> = {
          "Risk score": audit.riskScore.toUpperCase(),
          "Admin group": audit.overview.adminGroup.members.join(", ") || "<none>",
          "Secure tokens": audit.overview.secureTokens.tokens.map((entry) => entry.user).join(", ") || "<none>",
          "FileVault": audit.overview.fileVault.details || (audit.overview.fileVault.enabled ? "Enabled" : "Disabled"),
          "Findings": findingsText,
        };

        if (captureReport) {
          safeCaptureReport(deps.reportingHub, {
            tool: "mac-permissions-audit",
            summary: `Risk=${audit.riskScore.toUpperCase()} | Findings=${audit.findings.length}`,
            sections,
            stage: "analysis",
            tags: ["macos", "security", "permissions"],
            importance: audit.riskScore === "high" ? "high" : audit.riskScore === "medium" ? "medium" : "low",
            devOpsCategory: "endpoint",
            debugLayer: "permissions",
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("macOS Permissions Audit", sections),
            },
          ],
          structuredContent: {
            audit,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "windows-diagnostics",
    {
      description:
        "Performs deep Windows diagnostics and repair operations locally or via WinRM (system, performance, security, network, storage, Active Directory, IIS, Hyper-V, updates, services).",
      inputSchema: {
        mode: z.enum(["local", "remote"]).default("local"),
        operation: z.enum(["diagnostics", "repair"]).default("diagnostics"),
        suite: z.enum(WINDOWS_DIAGNOSTIC_SUITES).optional(),
        repairAction: z.enum(WINDOWS_REPAIR_ACTIONS).optional(),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(["Default", "Negotiate", "Kerberos", "Basic", "Credssp"]).optional(),
        ignoreCertErrors: z.boolean().optional(),
      },
    },
    async ({
      mode,
      operation,
      suite,
      repairAction,
      dryRun,
      host,
      username,
      password,
      passwordEnvVar,
      useSsl,
      port,
      authentication,
      ignoreCertErrors,
    }) => {
      const capability = mode === "local" ? "local-shell" : "winrm";
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: "windows-diagnostics",
          capability,
          payload: {
            mode,
            operation,
            suite,
            repairAction,
            dryRun,
            host,
            username,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Windows Diagnostics", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const connectionOptions = mode === "remote"
          ? {
              host: host ?? (() => {
                throw new Error("Remote diagnostics require 'host'.");
              })(),
              username,
              password,
              passwordEnvVar,
              useSsl,
              port,
              authentication,
              ignoreCertErrors,
            }
          : undefined;

        let results;
        if (operation === "diagnostics") {
          if (!suite) {
            throw new Error("Diagnostics operation requires 'suite'.");
          }
          results = mode === "local"
            ? await deps.windowsDiagnostics.runLocalDiagnostics(suite)
            : await deps.windowsDiagnostics.runRemoteDiagnostics(
                suite,
                connectionOptions as NonNullable<typeof connectionOptions>,
              );
        } else {
          if (!repairAction) {
            throw new Error("Repair operation requires 'repairAction'.");
          }
          results = mode === "local"
            ? await deps.windowsDiagnostics.runLocalRepair(repairAction, dryRun)
            : await deps.windowsDiagnostics.runRemoteRepair(
                repairAction,
                connectionOptions as NonNullable<typeof connectionOptions>,
                dryRun,
              );
        }

        const sections: Record<string, string> = {};
        for (const item of results) {
          const output = item.json
            ? JSON.stringify(item.json, null, 2)
            : item.stdout.trim() || item.stderr.trim() || "<no output>";
          sections[item.label] = output;
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "windows-diagnostics",
          summary: `${mode === "local" ? "Local" : `Remote ${host ?? "unknown"}`} Windows ${operation} (${operation === "diagnostics" ? suite : repairAction}) ${operation === "repair" && dryRun ? "(dry-run)" : "completed"}`,
          sections,
          tags: ["windows", operation, mode === "local" ? "local" : "remote", ...(dryRun && operation === "repair" ? ["dry-run"] : [])],
          importance: operation === "repair" && !dryRun ? "high" : "medium",
          devOpsCategory: "endpoint",
          executionContext:
            mode === "remote" && host ? `host=${host}, user=${username ?? "unknown"}` : "local",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Windows Diagnostics", sections),
            },
          ],
          structuredContent: {
            mode,
            operation,
            dryRun: operation === "repair" ? dryRun : undefined,
            results,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "windows-ad",
    {
      description:
        "Performs Active Directory operations including user, group, computer, OU, and GPO management. Supports both read and write operations with dry-run mode for safety.",
      inputSchema: {
        operation: z.enum(AD_OPERATIONS as unknown as [ADOperation, ...ADOperation[]]),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(["Default", "Negotiate", "Kerberos", "Basic", "Credssp"]).optional(),
        ignoreCertErrors: z.boolean().optional(),
        // Common parameters
        identity: z.string().optional(),
        name: z.string().optional(),
        distinguishedName: z.string().optional(),
        searchBase: z.string().optional(),
        filter: z.string().optional(),
        // User-specific parameters
        givenName: z.string().optional(),
        surname: z.string().optional(),
        displayName: z.string().optional(),
        emailAddress: z.string().optional(),
        userPassword: z.string().optional(),
        mustChangePassword: z.boolean().optional(),
        passwordNeverExpires: z.boolean().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
        // Group-specific parameters
        groupScope: z.enum(["DomainLocal", "Global", "Universal"]).optional(),
        groupCategory: z.enum(["Distribution", "Security"]).optional(),
        memberToAdd: z.string().optional(),
        memberToRemove: z.string().optional(),
        // OU-specific parameters
        path: z.string().optional(),
        targetPath: z.string().optional(),
        // GPO-specific parameters
        gpoName: z.string().optional(),
        linkTarget: z.string().optional(),
        linkEnabled: z.boolean().optional(),
        linkOrder: z.number().int().optional(),
      },
    },
    async (params) => {
      const capability = params.host ? "winrm" : "local-shell";
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: "windows-ad",
          capability,
          payload: params,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Active Directory", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const options = {
          ...params,
          operation: params.operation,
          password: params.userPassword,
        };

        const result = await deps.windowsActiveDirectory.executeOperation(options);

        const sections: Record<string, string> = {};
        sections["Operation"] = result.operation;
        sections["Status"] = result.success ? "✓ Success" : "✗ Failed";
        if (result.message) {
          sections["Message"] = result.message;
        }
        if (result.data) {
          sections["Data"] = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
        }
        if (result.stderr && !result.success) {
          sections["Error"] = result.stderr;
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "windows-ad",
          summary: `Active Directory ${result.operation} ${params.dryRun ? "(dry-run)" : ""} - ${result.success ? "success" : "failed"}`,
          sections,
          tags: ["windows", "active-directory", result.operation, ...(params.dryRun ? ["dry-run"] : [])],
          importance: params.dryRun ? "medium" : "high",
          devOpsCategory: "security",
          executionContext: params.host ? `host=${params.host}, user=${params.username ?? "unknown"}` : "local",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Active Directory", sections),
            },
          ],
          structuredContent: {
            operation: result.operation,
            success: result.success,
            dryRun: params.dryRun,
            data: result.data,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "windows-iis",
    {
      description:
        "Performs IIS operations including website, app pool, binding, SSL certificate, and virtual directory management.",
      inputSchema: {
        operation: z.enum(IIS_OPERATIONS as unknown as [IISOperation, ...IISOperation[]]),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(["Default", "Negotiate", "Kerberos", "Basic", "Credssp"]).optional(),
        ignoreCertErrors: z.boolean().optional(),
        siteName: z.string().optional(),
        physicalPath: z.string().optional(),
        bindingInformation: z.string().optional(),
        protocol: z.enum(["http", "https"]).optional(),
        appPoolName: z.string().optional(),
        managedRuntimeVersion: z.enum(["v4.0", "v2.0", "No Managed Code"]).optional(),
        managedPipelineMode: z.enum(["Integrated", "Classic"]).optional(),
        ipAddress: z.string().optional(),
        hostHeader: z.string().optional(),
        certificateHash: z.string().optional(),
        vdirPath: z.string().optional(),
        vdirPhysicalPath: z.string().optional(),
        anonymousAuth: z.boolean().optional(),
        windowsAuth: z.boolean().optional(),
        basicAuth: z.boolean().optional(),
        logPath: z.string().optional(),
        maxLogLines: z.number().int().optional(),
      },
    },
    async (params) => {
      const capability = params.host ? "winrm" : "local-shell";
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        return {
          content: [{ type: "text" as const, text: toTextContent("IIS", { Result: "Delegated to remote agent." }) }],
          structuredContent: { remoteAgent: await deps.remoteAgent.dispatch({ tool: "windows-iis", capability, payload: params }) },
        };
      }

      try {
        const result = await deps.windowsIIS.executeOperation(params);
        const sections: Record<string, string> = {
          Operation: result.operation,
          Status: result.success ? "✓ Success" : "✗ Failed",
        };
        if (result.message) sections["Message"] = result.message;
        if (result.data) sections["Data"] = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
        if (result.stderr && !result.success) sections["Error"] = result.stderr;

        safeCaptureReport(deps.reportingHub, {
          tool: "windows-iis",
          summary: `IIS ${result.operation} ${params.dryRun ? "(dry-run)" : ""} - ${result.success ? "success" : "failed"}`,
          sections,
          tags: ["windows", "iis", result.operation, ...(params.dryRun ? ["dry-run"] : [])],
          importance: params.dryRun ? "medium" : "high",
          devOpsCategory: "infrastructure",
          executionContext: params.host ? `host=${params.host}` : "local",
        });

        return {
          content: [{ type: "text" as const, text: toTextContent("IIS", sections) }],
          structuredContent: { operation: result.operation, success: result.success, dryRun: params.dryRun, data: result.data },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "windows-security",
    {
      description:
        "Performs Windows security operations including Windows Defender, BitLocker, firewall management, security event analysis, and baseline assessment.",
      inputSchema: {
        operation: z.enum(SECURITY_OPERATIONS as unknown as [SecurityOperation, ...SecurityOperation[]]),
        dryRun: z.boolean().default(true),
        host: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z.string().optional(),
        useSsl: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(["Default", "Negotiate", "Kerberos", "Basic", "Credssp"]).optional(),
        ignoreCertErrors: z.boolean().optional(),
        scanPath: z.string().optional(),
        exclusionPath: z.string().optional(),
        exclusionExtension: z.string().optional(),
        exclusionProcess: z.string().optional(),
        driveLetter: z.string().optional(),
        encryptionMethod: z.enum(["Aes128", "Aes256", "XtsAes128", "XtsAes256"]).optional(),
        ruleName: z.string().optional(),
        ruleDirection: z.enum(["Inbound", "Outbound"]).optional(),
        ruleAction: z.enum(["Allow", "Block"]).optional(),
        ruleProtocol: z.enum(["TCP", "UDP", "Any"]).optional(),
        ruleLocalPort: z.string().optional(),
        ruleRemotePort: z.string().optional(),
        ruleRemoteAddress: z.string().optional(),
        hoursBack: z.number().int().optional(),
        maxEvents: z.number().int().optional(),
      },
    },
    async (params) => {
      const capability = params.host ? "winrm" : "local-shell";
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        return {
          content: [{ type: "text" as const, text: toTextContent("Windows Security", { Result: "Delegated to remote agent." }) }],
          structuredContent: { remoteAgent: await deps.remoteAgent.dispatch({ tool: "windows-security", capability, payload: params }) },
        };
      }

      try {
        const result = await deps.windowsSecurity.executeOperation(params);
        const sections: Record<string, string> = {
          Operation: result.operation,
          Status: result.success ? "✓ Success" : "✗ Failed",
        };
        if (result.message) sections["Message"] = result.message;
        if (result.data) sections["Data"] = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
        if (result.stderr && !result.success) sections["Error"] = result.stderr;

        safeCaptureReport(deps.reportingHub, {
          tool: "windows-security",
          summary: `Windows Security ${result.operation} ${params.dryRun ? "(dry-run)" : ""} - ${result.success ? "success" : "failed"}`,
          sections,
          tags: ["windows", "security", result.operation, ...(params.dryRun ? ["dry-run"] : [])],
          importance: params.dryRun ? "medium" : "high",
          devOpsCategory: "security",
          executionContext: params.host ? `host=${params.host}` : "local",
        });

        return {
          content: [{ type: "text" as const, text: toTextContent("Windows Security", sections) }],
          structuredContent: { operation: result.operation, success: result.success, dryRun: params.dryRun, data: result.data },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "zte-router",
    {
      description:
        "Manage ZTE routers (NH8091/Optus Ultra 5G, MF286, MC801A) via HTTP API - includes status, signal strength, WiFi config, SMS, data usage, APN settings, and band selection.",
      inputSchema: {
        operation: z.enum(ZTE_OPERATIONS as unknown as [ZteOperation, ...ZteOperation[]]),
        host: z.string().default("192.168.1.1"),
        username: z.string().optional(),
        password: z.string(),
        port: z.number().int().min(1).max(65535).optional(),
        protocol: z.enum(["http", "https"]).optional(),
        dryRun: z.boolean().default(false),
        // WiFi config parameters
        ssid: z.string().optional(),
        wifiPassword: z.string().optional(),
        // SMS parameters
        phoneNumber: z.string().optional(),
        smsMessage: z.string().optional(),
        // APN parameters
        apnName: z.string().optional(),
        apnUsername: z.string().optional(),
        apnPassword: z.string().optional(),
        // Band selection
        bandMode: z.string().optional(),
      },
    },
    async (params) => {
      try {
        const result = await deps.zteRouter.executeOperation(params);
        const sections: Record<string, string> = {
          Operation: result.operation,
          Status: result.success ? "✓ Success" : "✗ Failed",
        };
        if (result.message) sections["Message"] = result.message;
        if (result.data) {
          sections["Data"] = JSON.stringify(result.data, null, 2);
        }
        if (result.rawOutput && !result.data) {
          sections["Raw Output"] = result.rawOutput;
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "zte-router",
          summary: `ZTE Router ${result.operation} ${params.dryRun ? "(dry-run)" : ""} - ${result.success ? "success" : "failed"}`,
          sections,
          tags: ["network", "zte", "router", "5g", result.operation, ...(params.dryRun ? ["dry-run"] : [])],
          importance: params.dryRun ? "medium" : "high",
          devOpsCategory: "network",
          executionContext: `host=${params.host}`,
        });

        return {
          content: [{ type: "text" as const, text: toTextContent("ZTE Router", sections) }],
          structuredContent: { operation: result.operation, success: result.success, dryRun: params.dryRun, data: result.data },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "database-diagnostics",
    {
      description:
        "Runs deep diagnostics against database-hosting Linux servers (PostgreSQL, Redis, Nginx, Keycloak, firewall, system).",
      inputSchema: {
        mode: z.enum(["local", "remote"]).default("remote"),
        suites: z.array(z.enum(DATABASE_SUITES)).default(DEFAULT_DATABASE_SUITES),
        host: z.string().optional(),
        username: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
        extraOptions: z.record(z.string()).optional(),
      },
    },
    async ({
      mode,
      suites,
      host,
      username,
      port,
      identityFile,
      knownHostsFile,
      allocateTty,
      timeoutSeconds,
      extraOptions,
    }) => {
      const capability = mode === "local" ? "local-sudo" : "ssh-linux";
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: "database-diagnostics",
          capability,
          payload: {
            mode,
            suites,
            host,
            username,
          },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Database Diagnostics", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const results = mode === "local"
          ? await deps.databaseDiagnostics.runLocal(suites as DatabaseDiagnosticSuite[])
          : await deps.databaseDiagnostics.runRemote({
              host: host ?? (() => {
                throw new Error("Remote diagnostics require 'host'.");
              })(),
              username: username ?? (() => {
                throw new Error("Remote diagnostics require 'username'.");
              })(),
              suites: suites as DatabaseDiagnosticSuite[],
              port,
              identityFile,
              knownHostsFile,
              allocateTty,
              timeoutSeconds,
              extraOptions: extraOptions ?? undefined,
            });

        const sections: Record<string, string> = {};
        for (const item of results) {
          sections[item.label] = item.stdout.trim() || item.stderr.trim() || "<no output>";
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "database-diagnostics",
          summary: `${mode === "local" ? "Local" : `Remote ${host ?? "unknown"}`} database diagnostics for suites ${Array.from(new Set(suites)).join(", ")}`,
          sections,
          tags: ["database", "postgres", mode === "local" ? "local" : "remote"],
          importance: "high",
          devOpsCategory: "infrastructure",
          executionContext: mode === "remote" ? `host=${host}, user=${username}` : "local",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Database Diagnostics", sections),
            },
          ],
          structuredContent: {
            mode,
            suites,
            results,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "firewall-toolkit",
    {
      description:
        "Produces vendor-aware firewall troubleshooting playbooks (Palo Alto, Cisco ASA, Fortinet, Check Point, pfSense).",
      inputSchema: {
        vendor: z.enum(FIREWALL_VENDORS),
        scenario: z.enum(FIREWALL_SCENARIOS),
        context: z.string().optional(),
      },
    },
    async ({ vendor, scenario, context }) => {
      try {
        const playbook = deps.firewallToolkit.generatePlaybook({ vendor, scenario, context });

        const formatSteps = (steps: typeof playbook.preChecks) =>
          steps
            .map((step) => [
              `${step.title} — ${step.description}`,
              step.commands.map((cmd) => `- ${cmd}`).join("\n"),
            ].filter(Boolean).join("\n"))
            .join("\n\n");

        const sections: Record<string, string> = {
          Summary: playbook.summary,
        };

        if (playbook.preChecks.length) {
          sections["Pre-checks"] = formatSteps(playbook.preChecks);
        }

        if (playbook.diagnosticCommands.length) {
          sections["Diagnostics"] = formatSteps(playbook.diagnosticCommands);
        }

        if (playbook.remediationHints.length) {
          sections["Remediation hints"] = playbook.remediationHints.map((hint) => `- ${hint}`).join("\n");
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "firewall-toolkit",
          summary: `${vendor} ${scenario} playbook generated`,
          sections,
          tags: ["firewall", vendor, scenario],
          devOpsCategory: "network-security",
          importance: "medium",
          executionContext: reportContextLabel(vendor, scenario, context),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Firewall Troubleshooting", sections),
            },
          ],
          structuredContent: {
            playbook,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  const buildLinuxAdminSchema = () => ({
    action: z.enum([
      "update-packages",
      "service",
      "nginx-test",
      "nginx-reload",
      "pm2-status",
      "pm2-logs",
      "docker",
      "postgres",
      "network",
      "samba",
      "virtualmin",
      "security",
      "kubernetes",
    ]),
    service: z.string().optional(),
    serviceAction: z.enum(["start", "stop", "restart", "status", "enable", "disable"]).optional(),
    packageUpgrade: z.boolean().default(true),
    packageAutoRemove: z.boolean().default(false),
    pm2App: z.string().optional(),
    dockerCommand: z
      .enum([
        "status",
        "ps",
        "images",
        "prune",
        "compose-up",
        "compose-down",
        "logs",
        "stats",
        "inspect",
        "diff",
        "export",
        "commit",
        "logs-label",
      ])
      .optional(),
    dockerComposeFile: z.string().optional(),
    dockerServices: z.array(z.string()).default([]),
    dockerTail: z.number().int().min(1).max(500).default(100),
    dockerBuild: z.boolean().default(false),
    dockerPull: z.boolean().default(false),
    dockerEnvFile: z.string().optional(),
    dockerContainer: z.string().optional(),
    dockerFormat: z.string().optional(),
    dockerExportPath: z.string().optional(),
    dockerImageName: z.string().optional(),
    dockerLabelFilter: z.string().optional(),
    dockerSince: z.string().optional(),
    postgresCommand: z
      .enum(["status", "connections", "vacuum", "custom", "repack", "backup", "restore", "wal", "isready"])
      .optional(),
    postgresDb: z.string().optional(),
    postgresSql: z.string().optional(),
    postgresBackupPath: z.string().optional(),
    postgresRestorePath: z.string().optional(),
    virtualminCommand: z
      .enum([
        "list-domains",
        "list-users",
        "restart-service",
        "create-domain",
        "backup-domain",
        "check-config",
        "custom",
      ])
      .optional(),
    virtualminDomain: z.string().optional(),
    virtualminUser: z.string().optional(),
    virtualminService: z.string().optional(),
    virtualminDestination: z.string().optional(),
    virtualminOptions: z.string().optional(),
    virtualminArgs: z.string().optional(),
    networkInterface: z.string().optional(),
    networkDestination: z.string().optional(),
    networkAnalyzeRoutes: z.boolean().default(true),
    networkCapture: z.boolean().default(false),
    sambaCommand: z
      .enum([
        "list-shares",
        "test-smb",
        "reload-samba",
        "check-samba-config",
        "show-nfs-shares",
        "file-permissions",
        "set-permissions",
        "windows-acl-note",
        "repair-postgres",
        "add-share",
        "remove-share",
        "add-samba-user",
        "list-samba-users",
        "update-nfs",
        "permissions-snapshot",
        "permissions-restore",
        "set-acl",
        "ownership",
      ])
      .optional(),
    sambaPath: z.string().optional(),
    sambaUser: z.string().optional(),
    sambaMode: z.string().optional(),
    sambaRecursive: z.boolean().default(false),
    sambaService: z.enum(["smb", "winbind", "nmbd", "nfs"]).optional(),
    sambaSharesFile: z.string().optional(),
    postgresFix: z.enum(["reindex", "vacuum", "fsck"]).optional(),
    sambaShareName: z.string().optional(),
    sambaSharePath: z.string().optional(),
    sambaShareComment: z.string().optional(),
    sambaDryRun: z.boolean().default(false),
    permissionsSnapshotFile: z.string().optional(),
    permissionsRestoreFile: z.string().optional(),
    aclSpec: z.string().optional(),
    ownershipOwner: z.string().optional(),
    ownershipGroup: z.string().optional(),
    securityCommand: z
      .enum([
        "generate-ssh-key",
        "list-authorized-keys",
        "harden-ssh",
        "ufw",
        "iptables",
        "tcp-health",
        "ipv6-health",
        "docker-troubleshoot",
        "storage-info",
        "storage-sync",
        "rotate-ssh-key",
        "clean-known-hosts",
        "fail2ban",
        "auditd",
        "suricata",
        "cis-audit",
        "apparmor-status",
        "selinux-status",
        "lynis",
        "ssh-trust-report",
      ])
      .optional(),
    securityKeyType: z.string().optional(),
    securityKeyComment: z.string().optional(),
    securityKeyPath: z.string().optional(),
    securityUser: z.string().optional(),
    securityUfwAction: z.enum(["enable", "disable", "status", "allow", "deny"]).optional(),
    securityUfwRule: z.string().optional(),
    securityIptablesRule: z.string().optional(),
    securityTarget: z.string().optional(),
    securityInterface: z.string().optional(),
    securityDockerLog: z.string().optional(),
    securityBucketProvider: z.enum(["aws", "gcs", "azure", "minio"]).optional(),
    securityBucketName: z.string().optional(),
    securityBucketPath: z.string().optional(),
    securitySyncDestination: z.string().optional(),
    securityKnownHost: z.string().optional(),
    kubernetesCommand: z
      .enum(["context", "get-pods", "get-nodes", "describe-node", "logs", "restart-deployment"])
      .optional(),
    kubernetesNamespace: z.string().optional(),
    kubernetesResource: z.string().optional(),
    kubernetesContainer: z.string().optional(),
    kubernetesSince: z.string().optional(),
    kubernetesDeployment: z.string().optional(),
  });

  const registerLinuxAdminTool = (
    toolName: string,
    description: string,
    serviceImpl: UbuntuAdminService,
    displayTitle: string,
  ) => {
    server.registerTool(
      toolName,
      {
        description,
        inputSchema: buildLinuxAdminSchema(),
      },
    wrapWithPolicy(
      toolName,
      "executeAdminAction",
      async ({
      action,
      service: targetService,
      serviceAction,
      packageUpgrade,
        packageAutoRemove,
        pm2App,
        dockerCommand,
        dockerComposeFile,
        dockerServices,
        dockerTail,
        dockerBuild,
        dockerPull,
        dockerEnvFile,
        dockerContainer,
        dockerFormat,
        dockerExportPath,
        dockerImageName,
        dockerLabelFilter,
        dockerSince,
        postgresCommand,
        postgresDb,
        postgresSql,
        postgresBackupPath,
        postgresRestorePath,
        virtualminCommand,
        virtualminDomain,
        virtualminUser,
        virtualminService,
        virtualminDestination,
        virtualminOptions,
        virtualminArgs,
        networkInterface,
        networkDestination,
        networkAnalyzeRoutes,
        networkCapture,
        sambaCommand,
        sambaPath,
        sambaUser,
        sambaMode,
        sambaRecursive,
        sambaService,
        sambaSharesFile,
        postgresFix,
        sambaShareName,
        sambaSharePath,
        sambaShareComment,
        sambaDryRun,
        permissionsSnapshotFile,
        permissionsRestoreFile,
        aclSpec,
        ownershipOwner,
        ownershipGroup,
        securityCommand,
        securityKeyType,
        securityKeyComment,
        securityKeyPath,
        securityUser,
        securityUfwAction,
        securityUfwRule,
        securityIptablesRule,
        securityTarget,
        securityInterface,
        securityDockerLog,
        securityBucketProvider,
        securityBucketName,
        securityBucketPath,
        securitySyncDestination,
        securityKnownHost,
        kubernetesCommand,
        kubernetesNamespace,
        kubernetesResource,
        kubernetesContainer,
        kubernetesSince,
      kubernetesDeployment,
    }) => {
      const capability = "local-sudo" as const;
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: toolName,
          capability,
          payload: {
            action,
            service: targetService,
            serviceAction,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(displayTitle, {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      const results: Record<string, unknown> = {};
      const sections: Record<string, string> = {};

        try {
          switch (action) {
            case "update-packages": {
              const res = await serviceImpl.updatePackages({
                upgrade: packageUpgrade,
                autoRemove: packageAutoRemove,
              });
              results.packages = res;
              sections["Packages"] = res.map((r) => r.stdout || r.stderr).join("\n---\n");
              break;
            }
            case "service": {
              if (!targetService || !serviceAction) {
                throw new Error("Service management requires 'service' and 'serviceAction'.");
              }
              const res = await serviceImpl.manageService({
                service: targetService,
                action: serviceAction,
              });
              results.service = res;
              sections["Service"] = res.stdout || res.stderr || "Command executed.";
              break;
            }
            case "nginx-test": {
              const res = await serviceImpl.nginxTestConfiguration();
              results.nginxTest = res;
              sections["Nginx config"] = res.stdout || res.stderr;
              break;
            }
            case "nginx-reload": {
              const res = await serviceImpl.nginxReload();
              results.nginxReload = res;
              sections["Nginx reload"] = res.stdout || res.stderr || "Reload executed.";
              break;
            }
            case "pm2-status": {
              const res = await serviceImpl.pm2Status();
              results.pm2Status = res;
              sections["PM2 status"] = res.stdout || res.stderr;
              break;
            }
            case "pm2-logs": {
              const res = await serviceImpl.pm2Logs(pm2App);
              results.pm2Logs = res;
              sections["PM2 logs"] = res.stdout || res.stderr;
              break;
            }
            case "docker": {
              if (!dockerCommand) {
                throw new Error("Docker action requires 'dockerCommand'.");
              }
              const res = await serviceImpl.dockerAction({
                command: dockerCommand,
                composeFile: dockerComposeFile,
                services: dockerServices,
                tail: dockerTail,
                build: dockerBuild,
                pull: dockerPull,
                envFile: dockerEnvFile,
                container: dockerContainer,
                format: dockerFormat,
                exportPath: dockerExportPath,
                imageName: dockerImageName,
                labelFilter: dockerLabelFilter,
                since: dockerSince,
              });
              results.docker = res;
              sections["Docker"] = res.stdout || res.stderr;
              break;
            }
            case "postgres": {
              if (!postgresCommand) {
                throw new Error("PostgreSQL action requires 'postgresCommand'.");
              }
              const res = await serviceImpl.postgresAction({
                command: postgresCommand,
                database: postgresDb,
                customSql: postgresSql,
                backupPath: postgresBackupPath,
                restorePath: postgresRestorePath,
              });
              results.postgres = res;
              sections["PostgreSQL"] = res.stdout || res.stderr;
              break;
            }
            case "virtualmin": {
              if (!virtualminCommand) {
                throw new Error("Virtualmin action requires 'virtualminCommand'.");
              }
              const res = await serviceImpl.virtualminCommand({
                command: virtualminCommand,
                domain: virtualminDomain,
                user: virtualminUser,
                service: virtualminService,
                destination: virtualminDestination,
                options: virtualminOptions,
                customArgs: virtualminArgs,
              });
              results.virtualmin = res;
              sections["Virtualmin"] = res.stdout || res.stderr;
              break;
            }
            case "network": {
              const res = await serviceImpl.networkDiagnostics({
                interfaceName: networkInterface,
                analyzeRoutes: networkAnalyzeRoutes,
                capture: networkCapture,
                destination: networkDestination,
              });
              results.network = res;
              sections["Network diagnostics"] = res.map((item) => item.stdout || item.stderr).join("\n---\n");
              break;
            }
            case "samba": {
              if (!sambaCommand) {
                throw new Error("Filesystem action requires 'sambaCommand'.");
              }
              const res = await serviceImpl.filesystemAction({
                command: sambaCommand,
                path: sambaPath,
                user: sambaUser,
                mode: sambaMode,
                recursive: sambaRecursive,
                service: sambaService,
                sharesFile: sambaSharesFile,
                postgresFix,
                postgresDb,
                shareName: sambaShareName,
                sharePath: sambaSharePath,
                shareComment: sambaShareComment,
                dryRun: sambaDryRun,
                snapshotFile: permissionsSnapshotFile,
                restoreFile: permissionsRestoreFile,
                aclSpec,
                owner: ownershipOwner,
                group: ownershipGroup,
              });
              results.filesystem = res;
              sections["Filesystem"] = res.map((item) => item.stdout || item.stderr).join("\n---\n");
              break;
            }
            case "security": {
              if (!securityCommand) {
                throw new Error("Security action requires 'securityCommand'.");
              }
              const res = await serviceImpl.securityAction({
                command: securityCommand,
                keyType: securityKeyType,
                keyComment: securityKeyComment,
                keyPath: securityKeyPath,
                user: securityUser,
                ufwAction: securityUfwAction,
                ufwRule: securityUfwRule,
                iptablesRule: securityIptablesRule,
                target: securityTarget,
                interfaceName: securityInterface,
                dockerLog: securityDockerLog,
                bucketProvider: securityBucketProvider,
                bucketName: securityBucketName,
                bucketPath: securityBucketPath,
                syncDestination: securitySyncDestination,
                knownHost: securityKnownHost,
              });
              results.security = res;
              sections["Security"] = res.map((item) => item.stdout || item.stderr).join("\n---\n");
              break;
            }
            case "kubernetes": {
              if (!kubernetesCommand) {
                throw new Error("Kubernetes action requires 'kubernetesCommand'.");
              }
              const res = await serviceImpl.kubernetesAction({
                command: kubernetesCommand,
                namespace: kubernetesNamespace,
                resource: kubernetesResource,
                container: kubernetesContainer,
                since: kubernetesSince,
                deployment: kubernetesDeployment,
              });
              results.kubernetes = res;
              sections["Kubernetes"] = res.stdout || res.stderr;
              break;
            }
            default:
              throw new Error(`Unsupported action: ${action}`);
          }
        } catch (error) {
          sections.Error = error instanceof Error ? error.message : String(error);
        }

        if (Object.keys(sections).length === 0) {
          sections.Result = "No operation executed.";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent(displayTitle, sections),
            },
          ],
          structuredContent: results,
        };
      },
      ["ssh-linux", "local-sudo", "system-modify"]  // Required capabilities for Linux admin
      )
    );
  };

  registerLinuxAdminTool(
    "ubuntu-admin",
    "Executes advanced Ubuntu administration tasks including package updates, service management, Nginx/PM2/Docker/PostgreSQL operations, and network diagnostics.",
    deps.ubuntuAdmin,
    "Ubuntu Administration",
  );
  registerLinuxAdminTool(
    "debian-admin",
    "Executes advanced Debian administration tasks including package updates, service management, Nginx/PM2/Docker/PostgreSQL operations, and network diagnostics.",
    deps.debianAdmin,
    "Debian Administration",
  );

  server.registerTool(
    "windows-admin",
    {
      description:
        "Executes remote Windows administration via PowerShell remoting (requires pwsh/WinRM connectivity from the host).",
      inputSchema: {
        action: z.enum([
          "system-info",
          "service",
          "processes",
          "event-log",
          "disk",
          "network",
          "scheduled-tasks",
          "firewall",
          "run-script",
          "updates",
          "roles-features",
          "performance",
        ]),
        host: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default("WINDOWS_REMOTE_PASSWORD"),
        useSsl: z.boolean().default(false),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z.enum(["Default", "Negotiate", "Kerberos", "Basic", "Credssp"]).default("Default"),
        ignoreCertErrors: z.boolean().default(false),
        serviceName: z.string().optional(),
        serviceAction: z.enum(["status", "start", "stop", "restart"]).optional(),
        serviceForce: z.boolean().default(false),
        processName: z.string().optional(),
        processTop: z.number().int().min(1).max(50).default(10),
        processSort: z.enum(["cpu", "memory"]).default("cpu"),
        eventLogName: z.string().default("System"),
        eventMaxEntries: z.number().int().min(1).max(500).default(50),
        eventLevel: z.enum(["critical", "error", "warning", "information", "verbose"]).optional(),
        eventId: z.number().int().optional(),
        eventProvider: z.string().optional(),
        includeRoutes: z.boolean().default(false),
        networkTestHost: z.string().optional(),
        taskNameFilter: z.string().optional(),
        taskStateFilter: z.enum(["Ready", "Running", "Disabled", "Queued", "Unknown"]).optional(),
        firewallIncludeRules: z.boolean().default(false),
        firewallRuleName: z.string().optional(),
        firewallProfile: z.string().optional(),
        script: z.string().optional(),
        scriptExpectJson: z.boolean().default(false),
        updatesMode: z.enum(["list", "install"]).default("list"),
        updatesIncludeOptional: z.boolean().default(false),
        updatesCategories: z.array(z.string()).default([]),
        roleFeatureAction: z.enum(["list", "install", "remove"]).default("list"),
        roleFeatureNames: z.array(z.string()).default([]),
        roleIncludeManagementTools: z.boolean().default(false),
        performanceSampleSeconds: z.number().int().min(1).max(30).default(5),
        performanceIncludeDisks: z.boolean().default(false),
        performanceIncludeNetwork: z.boolean().default(false),
      },
    },
    wrapWithPolicy(
      "windows-admin",
      "executeAdminAction",
      async ({
      action,
      host,
      username,
      password,
      passwordEnvVar,
      useSsl,
      port,
      authentication,
      ignoreCertErrors,
      serviceName,
      serviceAction,
      serviceForce,
      processName,
      processTop,
      processSort,
      eventLogName,
      eventMaxEntries,
      eventLevel,
      eventId,
      eventProvider,
      includeRoutes,
      networkTestHost,
      taskNameFilter,
      taskStateFilter,
      firewallIncludeRules,
      firewallRuleName,
      firewallProfile,
      script,
      scriptExpectJson,
      updatesMode,
      updatesIncludeOptional,
      updatesCategories,
      roleFeatureAction,
      roleFeatureNames,
      roleIncludeManagementTools,
      performanceSampleSeconds,
      performanceIncludeDisks,
      performanceIncludeNetwork,
    }) => {
      const capability = "winrm" as const;
      const route = await deps.executionRouter.route(capability);
      if (route.kind === "agent") {
        const response = await deps.remoteAgent.dispatch({
          tool: "windows-admin",
          capability,
          payload: { action, host },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Windows Administration", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      const connection = {
        host,
        username,
        password: password || undefined,
        passwordEnvVar,
        useSsl,
        port,
        authentication,
        ignoreCertErrors,
      };

      const sections: Record<string, string> = {};
      try {
        let response:
          | ReturnType<typeof deps.windowsAdmin.systemInfo>
          | ReturnType<typeof deps.windowsAdmin.serviceAction>
          | ReturnType<typeof deps.windowsAdmin.processSummary>
          | ReturnType<typeof deps.windowsAdmin.eventLog>
          | ReturnType<typeof deps.windowsAdmin.diskStatus>
          | ReturnType<typeof deps.windowsAdmin.networkStatus>
          | ReturnType<typeof deps.windowsAdmin.scheduledTasks>
          | ReturnType<typeof deps.windowsAdmin.firewallStatus>
          | ReturnType<typeof deps.windowsAdmin.runScript>;

        switch (action) {
          case "system-info": {
            response = deps.windowsAdmin.systemInfo(connection);
            break;
          }
          case "service": {
            if (!serviceName || !serviceAction) {
              throw new Error("Service action requires 'serviceName' and 'serviceAction'.");
            }
            response = deps.windowsAdmin.serviceAction({
              ...connection,
              service: serviceName,
              action: serviceAction,
              force: serviceForce,
            });
            break;
          }
          case "processes": {
            response = deps.windowsAdmin.processSummary({
              ...connection,
              nameFilter: processName,
              top: processTop,
              sortBy: processSort,
            });
            break;
          }
          case "event-log": {
            const levelMap: Record<string, 1 | 2 | 3 | 4 | 5> = {
              critical: 1,
              error: 2,
              warning: 3,
              information: 4,
              verbose: 5,
            };
            response = deps.windowsAdmin.eventLog({
              ...connection,
              logName: eventLogName,
              maxEvents: eventMaxEntries,
              level: eventLevel ? levelMap[eventLevel] : undefined,
              eventId,
              provider: eventProvider,
            });
            break;
          }
          case "disk": {
            response = deps.windowsAdmin.diskStatus(connection);
            break;
          }
          case "network": {
            response = deps.windowsAdmin.networkStatus({
              ...connection,
              includeRoutes,
              testHost: networkTestHost,
            });
            break;
          }
          case "scheduled-tasks": {
            response = deps.windowsAdmin.scheduledTasks({
              ...connection,
              taskNameFilter,
              stateFilter: taskStateFilter,
            });
            break;
          }
          case "firewall": {
            response = deps.windowsAdmin.firewallStatus({
              ...connection,
              includeRules: firewallIncludeRules,
              ruleNameFilter: firewallRuleName,
              profileFilter: firewallProfile,
            });
            break;
          }
          case "run-script": {
            if (!script) {
              throw new Error("Custom PowerShell script requires 'script'.");
            }
            response = deps.windowsAdmin.runScript(script, connection, scriptExpectJson);
            break;
          }
          case "updates": {
            response = deps.windowsAdmin.windowsUpdateAction({
              ...connection,
              mode: updatesMode,
              includeOptional: updatesIncludeOptional,
              categories: updatesCategories,
            });
            break;
          }
          case "roles-features": {
            response = deps.windowsAdmin.rolesAndFeatures({
              ...connection,
              action: roleFeatureAction,
              featureNames: roleFeatureNames,
              includeManagementTools: roleIncludeManagementTools,
            });
            break;
          }
          case "performance": {
            response = deps.windowsAdmin.performanceSnapshot({
              ...connection,
              sampleSeconds: performanceSampleSeconds,
              includeDisks: performanceIncludeDisks,
              includeNetwork: performanceIncludeNetwork,
            });
            break;
          }
          default:
            throw new Error(`Unsupported action: ${action satisfies never}`);
        }

        const resolved = await response;
        const structuredContent = {
          command: resolved.command,
          stdout: resolved.stdout,
          stderr: resolved.stderr,
          exitCode: resolved.code ?? null,
          data: "json" in resolved ? resolved.json : undefined,
        };

        const data = "json" in resolved ? resolved.json : undefined;

        switch (action) {
          case "system-info": {
            const info = data as Record<string, unknown> | undefined;
            if (info) {
              const computer = info.ComputerSystem as Record<string, unknown> | undefined;
              const os = info.OS as Record<string, unknown> | undefined;
              const uptime = info.Uptime as Record<string, unknown> | undefined;
              const disks = Array.isArray(info.Disks) ? info.Disks : [];
              const hotfixes = Array.isArray(info.HotFixes) ? info.HotFixes : [];

              sections["Computer"] = [
                `Name: ${info.ComputerName ?? "<unknown>"}`,
                computer?.Model ? `Model: ${computer.Model}` : null,
                computer?.Manufacturer ? `Vendor: ${computer.Manufacturer}` : null,
                computer?.TotalPhysicalMemory
                  ? `Memory: ${Math.round(Number(computer.TotalPhysicalMemory) / (1024 ** 3))} GB`
                  : null,
              ]
                .filter(Boolean)
                .join("\n");

              if (os) {
                sections["Operating system"] = [
                  os.Caption ? String(os.Caption) : undefined,
                  os.Version ? `Version: ${os.Version}` : undefined,
                  os.BuildNumber ? `Build: ${os.BuildNumber}` : undefined,
                  os.LastBootUpTime ? `Last boot: ${os.LastBootUpTime}` : undefined,
                ]
                  .filter(Boolean)
                  .join("\n");
              }

              if (uptime) {
                sections["Uptime"] = [
                  `Days: ${uptime.Days ?? "-"}`,
                  `Hours: ${uptime.Hours ?? "-"}`,
                  `Minutes: ${uptime.Minutes ?? "-"}`,
                ].join("\n");
              }

              if (disks.length) {
                sections["Disks"] = disks
                  .map((disk) => {
                    const volume = disk as Record<string, unknown>;
                    const label = volume.VolumeName ? ` (${volume.VolumeName})` : "";
                    return `${volume.DeviceID ?? volume.DriveLetter ?? "?"}${label}: ${volume.FreeGB ?? "?"} GB free / ${volume.SizeGB ?? "?"} GB (${volume.FreePercent ?? "?"}%)`;
                  })
                  .join("\n");
              }

              if (hotfixes.length) {
                sections["Recent hotfixes"] = hotfixes
                  .map((patch) => {
                    const item = patch as Record<string, unknown>;
                    return `${item.HotFixID ?? "<id unknown>"} - ${item.Description ?? "n/a"} (${item.InstalledOn ?? "date unknown"})`;
                  })
                  .join("\n");
              }
            }
            break;
          }
          case "service": {
            const service = (data ?? {}) as Record<string, unknown>;
            sections["Service"] = [
              `Name: ${service.Name ?? service.DisplayName ?? serviceName}`,
              `Status: ${service.Status ?? "n/a"}`,
              service.StartType ? `Start type: ${service.StartType}` : null,
              service.RunAs ? `Logon: ${service.RunAs}` : null,
            ]
              .filter(Boolean)
              .join("\n");
            break;
          }
          case "processes": {
            const list = Array.isArray(data) ? data : [];
            sections["Top processes"] = list
              .map((proc) => {
                const item = proc as Record<string, unknown>;
                const cpu = item.CPU != null ? `CPU: ${item.CPU}` : "";
                const memory = item.MemoryMB != null ? `Mem: ${item.MemoryMB} MB` : "";
                return `${item.Name ?? "?"} (PID ${item.Id ?? "?"}) ${cpu} ${memory}`.trim();
              })
              .join("\n");
            break;
          }
          case "event-log": {
            const events = Array.isArray(data) ? data : [];
            sections["Events"] = events
              .slice(0, 10)
              .map((evt) => {
                const item = evt as Record<string, unknown>;
                return `${item.TimeCreated ?? ""} [${item.LevelDisplayName ?? item.Level ?? ""}] ${item.Id ?? ""} ${item.ProviderName ?? ""}\n${String(item.Message ?? "").slice(0, 400)}`;
              })
              .join("\n---\n");
            break;
          }
          case "disk": {
            const diskData = (data ?? {}) as Record<string, unknown>;
            const volumes = Array.isArray(diskData.Volumes) ? diskData.Volumes : [];
            const physical = Array.isArray(diskData.PhysicalDisks) ? diskData.PhysicalDisks : [];
            if (volumes.length) {
              sections["Volumes"] = volumes
                .map((vol) => {
                  const item = vol as Record<string, unknown>;
                  return `${item.DriveLetter ?? "?"}: ${item.FreeGB ?? "?"} GB free / ${item.SizeGB ?? "?"} GB (${item.FreePercent ?? "?"}%)`;
                })
                .join("\n");
            }
            if (physical.length) {
              sections["Physical disks"] = physical
                .map((disk) => {
                  const item = disk as Record<string, unknown>;
                  const sizeGb =
                    item.Size != null ? `${Math.round(Number(item.Size) / (1024 ** 3))} GB` : "n/a";
                  return `${item.FriendlyName ?? "disk"} (${item.MediaType ?? "media"}) - ${sizeGb}, ${item.HealthStatus ?? "?"}/${item.OperationalStatus ?? "?"}`;
                })
                .join("\n");
            }
            break;
          }
          case "network": {
            const net = (data ?? {}) as Record<string, unknown>;
            const adapters = Array.isArray(net.Adapters) ? net.Adapters : [];
            const addresses = Array.isArray(net.Addresses) ? net.Addresses : [];
            if (adapters.length) {
              sections["Adapters"] = adapters
                .map((adapter) => {
                  const item = adapter as Record<string, unknown>;
                  return `${item.Name ?? "?"} (${item.Status ?? "?"}) ${item.LinkSpeed ?? ""}`;
                })
                .join("\n");
            }
            if (addresses.length) {
              sections["Addresses"] = addresses
                .map((addr) => {
                  const item = addr as Record<string, unknown>;
                  return `${item.InterfaceAlias ?? "?"}: ${item.IPAddress ?? "?"}/${item.PrefixLength ?? "?"} (${item.AddressFamily ?? "?"})`;
                })
                .join("\n");
            }
            if (net.ConnectivityTest) {
              sections["Test connection"] = JSON.stringify(net.ConnectivityTest, null, 2);
            }
            break;
          }
          case "scheduled-tasks": {
            const tasks = Array.isArray(data) ? data : [];
            sections["Scheduled tasks"] = tasks
              .slice(0, 15)
              .map((task) => {
                const item = task as Record<string, unknown>;
                return `${item.TaskPath ?? ""}${item.TaskName ?? ""} (${item.State ?? "?"})\nLast: ${item.LastRunTime ?? "?"} | Next: ${item.NextRunTime ?? "?"} | Result: ${item.LastTaskResult ?? "?"}`;
              })
              .join("\n---\n");
            break;
          }
          case "firewall": {
            const fw = (data ?? {}) as Record<string, unknown>;
            const profiles = Array.isArray(fw.Profiles) ? fw.Profiles : [];
            const rules = Array.isArray(fw.Rules) ? fw.Rules : [];
            if (profiles.length) {
              sections["Profiles"] = profiles
                .map((profile) => {
                  const item = profile as Record<string, unknown>;
                  return `${item.Name ?? "Profile"}: Enabled=${item.Enabled ?? "?"}, Inbound=${item.DefaultInboundAction ?? "?"}, Outbound=${item.DefaultOutboundAction ?? "?"}`;
                })
                .join("\n");
            }
            if (rules.length) {
              sections["Sample rules"] = rules
                .slice(0, 20)
                .map((rule) => {
                  const item = rule as Record<string, unknown>;
                  return `${item.DisplayName ?? "rule"} (${item.Direction ?? "?"} / ${item.Action ?? "?"})`;
                })
                .join("\n");
            }
            break;
          }
          case "run-script": {
            if (scriptExpectJson && data) {
              sections["Script output"] = JSON.stringify(data, null, 2);
            } else {
              sections["Script output"] = resolved.stdout.trim() || "<no output>";
            }
            break;
          }
          case "updates": {
            const updateData = (data ?? {}) as Record<string, unknown>;
            const updates = Array.isArray(updateData.Updates) ? updateData.Updates : [];
            sections["Updates"] = updates
              .slice(0, 10)
              .map((item) => {
                const update = item as Record<string, unknown>;
                const kb = update.KB ? `KB: ${update.KB}` : "";
                const severity = update.Severity ? `Severity: ${update.Severity}` : "";
                return `${update.Title ?? "Update"} ${kb} ${severity}`.trim();
              })
              .join("\n");
            if (updateData.InstallSummary) {
              sections["Install summary"] = JSON.stringify(updateData.InstallSummary, null, 2);
            }
            break;
          }
          case "roles-features": {
            if (Array.isArray(data)) {
              sections["Roles & Features"] = data
                .map((item) => {
                  const feature = item as Record<string, unknown>;
                  return `${feature.Name ?? "Feature"}: ${feature.Installed ?? false}`;
                })
                .join("\n");
            } else if (data) {
              sections["Roles & Features"] = JSON.stringify(data, null, 2);
            } else {
              sections["Roles & Features"] = resolved.stdout.trim() || "<no output>";
            }
            break;
          }
          case "performance": {
            if (data) {
              sections["Performance"] = JSON.stringify(data, null, 2);
            } else {
              sections["Performance"] = resolved.stdout.trim() || "<no output>";
            }
            break;
          }
          default:
            sections["Output"] = resolved.stdout.trim() || "<no output>";
        }

        if (!Object.keys(sections).length) {
          sections["Output"] = resolved.stdout.trim() || "<no output>";
        }

        safeCaptureReport(deps.reportingHub, {
          tool: "windows-admin",
          summary: `Windows action '${action}' executed for ${host}`,
          sections,
          tags: ["windows", action],
          importance: action === "updates" && updatesMode === "install" ? "high" : "medium",
          devOpsCategory: "windows",
          executionContext: `host=${host}`,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Windows Administration", sections),
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return handleError(error);
      }
    },
    ["winrm", "system-modify"]  // Required capabilities for Windows admin
    )
  );

  server.registerTool(
    "panos-cli",
    {
      description:
        "Executes operational CLI commands against Palo Alto Networks PAN-OS devices over SSH, with optional preset commands.",
      inputSchema: {
        listPresets: z.boolean().default(false),
        host: z.string().optional(),
        username: z.string().optional(),
        command: z.string().optional(),
        preset: z.enum(PANOS_PRESETS).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(3600).optional(),
        extraOptions: z.record(z.string()).optional(),
      },
    },
    async ({
      listPresets,
      host,
      username,
      command,
      preset,
      port,
      identityFile,
      knownHostsFile,
      allocateTty,
      timeoutSeconds,
      extraOptions,
    }) => {
      if (listPresets) {
        const presets = deps.panos.listPresets();
        const sections = {
          Presets: presets
            .map((item) => `${item.preset}: ${item.description}`)
            .join("\n"),
        };
        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("PAN-OS Presets", sections),
            },
          ],
          structuredContent: {
            presets,
          },
        };
      }

      if (!host || !username) {
        throw new Error("PAN-OS CLI execution requires 'host' and 'username'.");
      }

      const capability = "ssh-linux" as const;
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: "panos-cli",
          capability,
          payload: {
            host,
            username,
            command,
            preset,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("PAN-OS CLI", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const result = await deps.panos.execute({
          host,
          username,
          command: command ?? undefined,
          preset: preset as PanOsPreset | undefined,
          port,
          identityFile,
          knownHostsFile,
          allocateTty,
          timeoutSeconds,
          extraOptions: extraOptions ?? undefined,
        });

        const sections = {
          Command: result.command,
          Output: result.stdout.trim() || result.stderr.trim() || "<no output>",
        };

        safeCaptureReport(deps.reportingHub, {
          tool: "panos-cli",
          summary: `PAN-OS command executed on ${host}`,
          sections,
          tags: ["firewall", "pan-os", preset ?? "custom"],
          devOpsCategory: "network-security",
          executionContext: `host=${host}, preset=${preset ?? "custom"}`,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("PAN-OS CLI", sections),
            },
          ],
          structuredContent: {
            command: result.command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.code,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "scan_security_vulnerabilities",
    {
      description:
        "Installs and runs CodeQL and OpenVAS security scans. Requires local tooling (brew) and may prompt for sudo.",
      inputSchema: {
        installCodeql: z.boolean().default(false),
        installOpenvas: z.boolean().default(false),
        updateOpenvasFeeds: z.boolean().default(false),
        codeql: z
          .object({
            sourceRoot: z.string().optional(),
            language: z.string().default("javascript"),
            buildCommand: z.string().optional(),
            databasePath: z.string().optional(),
            querySuite: z.string().optional(),
            outputSarifPath: z.string().optional(),
          })
          .optional(),
        openvas: z
          .object({
            target: z.string().default("127.0.0.1"),
            portRange: z.string().optional(),
            profile: z.string().optional(),
            username: z.string().optional(),
            password: z.string().optional(),
          })
          .optional(),
      },
    },
    async ({
      installCodeql,
      installOpenvas,
      updateOpenvasFeeds,
      codeql,
      openvas,
    }) => {
      const actions: Record<string, unknown> = {};

      if (installCodeql) {
        actions.codeqlInstall = await deps.securityScanner.installCodeql();
      }

      if (installOpenvas) {
        actions.openvasInstall = await deps.securityScanner.installOpenvas();
      }

      if (updateOpenvasFeeds) {
        try {
          actions.openvasFeedUpdate = await deps.securityScanner.updateOpenvasFeeds();
        } catch (error) {
          actions.openvasFeedUpdateError =
            error instanceof Error ? error.message : String(error);
        }
      }

      if (codeql?.sourceRoot) {
        try {
          actions.codeqlScan = await deps.securityScanner.runCodeqlScan({
            sourceRoot: codeql.sourceRoot,
            language: codeql.language,
            buildCommand: codeql.buildCommand,
            databasePath: codeql.databasePath,
            querySuite: codeql.querySuite,
            outputSarifPath: codeql.outputSarifPath,
          });
        } catch (error) {
          actions.codeqlScanError =
            error instanceof Error ? error.message : String(error);
        }
      }

      if (openvas) {
        actions.openvasScan = await deps.securityScanner.runOpenvasScan({
          target: openvas.target,
          portRange: openvas.portRange,
          profile: openvas.profile,
          username: openvas.username,
          password: openvas.password,
        });
      }

      const sections: Record<string, string> = {};

      if (actions.codeqlInstall) {
        sections["CodeQL install"] = (actions.codeqlInstall as InstallationResult).exitCode === 0
          ? "Installed via brew"
          : `Install failed: ${(actions.codeqlInstall as InstallationResult).stderr}`;
      }

      if (actions.openvasInstall) {
        sections["OpenVAS install"] = (actions.openvasInstall as InstallationResult).exitCode === 0
          ? "Installed via brew"
          : `Install failed: ${(actions.openvasInstall as InstallationResult).stderr}`;
      }

      if (actions.codeqlScan) {
        const scan = actions.codeqlScan as { sarifPath: string; databasePath: string };
        sections["CodeQL SARIF"] = scan.sarifPath;
        sections["CodeQL DB"] = scan.databasePath;
      } else if (actions.codeqlScanError) {
        sections["CodeQL error"] = String(actions.codeqlScanError);
      }

      if (actions.openvasScan) {
        const scan = actions.openvasScan as { stderr: string; stdout: string; exitCode: number | null };
        sections["OpenVAS status"] = `Exit code: ${scan.exitCode}`;
        if (scan.stderr) {
          sections["OpenVAS stderr"] = scan.stderr;
        }
      }

      if (Object.keys(sections).length === 0) {
        sections.Result = "No actions requested.";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toTextContent("Security Vulnerability Scan", sections),
          },
        ],
        structuredContent: actions,
      };
    },
  );

  server.registerTool(
    "vpn-diagnostics",
    {
      description:
        "Collects macOS VPN diagnostics including scutil network connections, interfaces, routes, and common VPN process listings.",
      inputSchema: {
        includeWifi: z.boolean().default(true),
      },
    },
    async ({ includeWifi }) => {
      try {
        const diagnostics = await deps.vpn.collectDiagnostics(includeWifi);

        const sections: Record<string, string> = {
          "scutil --nc list": diagnostics.scutilList.stdout.trim() || diagnostics.scutilList.stderr.trim(),
          Interfaces: diagnostics.netInterfaces.stdout.trim(),
          Routes: diagnostics.routes.stdout.trim(),
          Processes:
            diagnostics.runningProcesses.stdout.trim() ||
            diagnostics.runningProcesses.stderr.trim() ||
            "No VPN-related processes detected.",
        };

        if (includeWifi && diagnostics.wifiInfo) {
          sections.WiFi = diagnostics.wifiInfo.stdout.trim() || diagnostics.wifiInfo.stderr.trim();
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("VPN Diagnostics", sections),
            },
          ],
          structuredContent: {
            scutil: formatCommandResult(diagnostics.scutilList),
            interfaces: formatCommandResult(diagnostics.netInterfaces),
            routes: formatCommandResult(diagnostics.routes),
            processes: formatCommandResult(diagnostics.runningProcesses),
            wifi: diagnostics.wifiInfo ? formatCommandResult(diagnostics.wifiInfo) : undefined,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "ssh-exec",
    {
      description:
        "Runs a remote command over SSH with optional identity, port, and extra options. Useful for ad-hoc administration tasks.",
      inputSchema: {
        host: z.string().min(1),
        username: z.string().optional(),
        command: z.string().min(1),
        port: z.number().int().min(1).max(65535).optional(),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        allocateTty: z.boolean().default(false),
        timeoutSeconds: z.number().int().min(1).max(600).optional(),
      },
    },
    wrapWithPolicy(
      "ssh-exec",
      "executeCommand",
      async ({ host, username, command, port, identityFile, knownHostsFile, allocateTty, timeoutSeconds }) => {
      try {
        const result = await deps.ssh.execute(
          {
            host,
            username,
            command,
          },
          {
            port,
            identityFile,
            knownHostsFile,
            allocateTty,
            timeoutSeconds,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("SSH Execution", {
                Target: `${username ? `${username}@` : ""}${host}${port ? `:${port}` : ""}`,
                Command: result.command,
                Output: result.stdout.trim() || "<no stdout>",
                Stderr: result.stderr.trim() || "<no stderr>",
              }),
            },
          ],
          structuredContent: {
            commandResult: formatCommandResult(result),
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
    ["ssh-linux", "remote-exec"]  // Required capabilities for SSH execution
    )
  );

  server.registerTool(
    "ubuntu-health-report",
    {
      description:
        "Collects a remote Ubuntu system health report via SSH (distribution info, uptime, disk usage, packages, services).",
      inputSchema: {
        host: z.string().min(1),
        username: z.string().default("root"),
        port: z.number().int().min(1).max(65535).default(22),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        timeoutSeconds: z.number().int().min(1).max(600).optional(),
      },
    },
    async ({ host, username, port, identityFile, knownHostsFile, timeoutSeconds }) => {
      try {
        const report = await deps.linux.collectUbuntuHealth({
          host,
          username,
          port,
          identityFile,
          knownHostsFile,
          timeoutSeconds,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatRemoteChecks(`Ubuntu Health (${username}@${host})`, report.checks),
            },
          ],
          structuredContent: {
            target: report.target,
            checks: report.checks,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "debian-health-report",
    {
      description:
        "Collects a remote Debian system health report via SSH (kernel, uptime, disk usage, apt upgrades, failed services).",
      inputSchema: {
        host: z.string().min(1),
        username: z.string().default("root"),
        port: z.number().int().min(1).max(65535).default(22),
        identityFile: z.string().optional(),
        knownHostsFile: z.string().optional(),
        timeoutSeconds: z.number().int().min(1).max(600).optional(),
      },
    },
    async ({ host, username, port, identityFile, knownHostsFile, timeoutSeconds }) => {
      try {
        const report = await deps.linux.collectDebianHealth({
          host,
          username,
          port,
          identityFile,
          knownHostsFile,
          timeoutSeconds,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatRemoteChecks(`Debian Health (${username}@${host})`, report.checks),
            },
          ],
          structuredContent: {
            target: report.target,
            checks: report.checks,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "cleanup-runbook",
    {
      description:
        "Runs macOS hygiene tasks (caches, downloads, Time Machine thinning). Supports dry-run previews before executing.",
      inputSchema: {
        purgeUserCaches: z.boolean().default(true),
        purgeSystemCaches: z.boolean().default(false),
        purgeDownloadsOlderThanDays: z.number().int().min(1).max(365).default(60),
        downloadsPath: z
          .string()
          .default(`${process.env.HOME ?? "~"}/Downloads`)
          .describe("Directory to clean when purging old download files."),
        thinTimeMachineSnapshotsGb: z.number().min(0).max(200).default(0),
        dryRun: z
          .boolean()
          .default(true)
          .describe("When true, show commands without executing them."),
      },
    },
    async (options) => {
      try {
        const summaries: Record<string, ReturnType<typeof formatCommandResult>> = {};

        if (options.purgeUserCaches) {
          const result = await deps.cleanup.cleanUserCaches(options);
          summaries[result.name] = formatCommandResult(result.result);
        }

        if (options.purgeSystemCaches) {
          const result = await deps.cleanup.cleanSystemCaches(options);
          summaries[result.name] = formatCommandResult(result.result);
        }

        if (options.purgeDownloadsOlderThanDays > 0) {
          const result = await deps.cleanup.purgeDownloads({
            target: options.downloadsPath,
            olderThanDays: options.purgeDownloadsOlderThanDays,
            dryRun: options.dryRun,
          });
          summaries[result.name] = formatCommandResult(result.result);
        }

        if (options.thinTimeMachineSnapshotsGb > 0) {
          const result = await deps.cleanup.thinTimeMachineSnapshots(
            options.thinTimeMachineSnapshotsGb,
            options,
          );
          summaries[result.name] = formatCommandResult(result.result);
        }

        const structuredContent = {
          dryRun: options.dryRun,
          tasks: summaries,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Cleanup Runbook", {
                Mode: options.dryRun ? "Dry run (no changes applied)" : "Executing cleanup tasks",
                Tasks: JSON.stringify(structuredContent.tasks, null, 2),
              }),
            },
          ],
          structuredContent,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "mailbox-quota-check",
    {
      description:
        "Calculates mailbox storage consumption using du. Useful for locating oversized accounts.",
      inputSchema: {
        path: z
          .string()
          .default(`${process.env.HOME ?? "~"}/Library/Mail`)
          .describe("Mailbox directory to measure."),
        includeBreakdown: z
          .boolean()
          .default(true)
          .describe("When true, include per-subfolder usage."),
      },
    },
    async ({ path, includeBreakdown }) => {
      try {
        const quota = await deps.email.checkMailboxUsage(path, includeBreakdown);
        const totalEntries = parseDuEntries(quota.total.stdout);
        const totalSummary = totalEntries[0] ?? { size: quota.total.stdout.trim(), path: quota.resolvedPath };

        const breakdownEntries = quota.breakdown ? parseDuEntries(quota.breakdown.stdout) : [];

        const sections: Record<string, string> = {
          Path: `${quota.targetPath} (resolved: ${quota.resolvedPath})`,
          Total: `${totalSummary.size} ${totalSummary.path}`,
        };

        if (includeBreakdown) {
          sections.Breakdown =
            breakdownEntries.length === 0
              ? "No subdirectories found or breakdown unavailable."
              : breakdownEntries.map((entry) => `${entry.size}\t${entry.path}`).join("\n");
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Mailbox Quota", sections),
            },
          ],
          structuredContent: {
            targetPath: quota.targetPath,
            resolvedPath: quota.resolvedPath,
            total: {
              command: quota.total.command,
              size: totalSummary.size,
              path: totalSummary.path,
              rawOutput: quota.total.stdout.trim(),
            },
            breakdown:
              includeBreakdown && quota.breakdown
                ? {
                    command: quota.breakdown.command,
                    entries: breakdownEntries,
                    rawOutput: quota.breakdown.stdout.trim(),
                  }
                : includeBreakdown
                  ? null
                  : undefined,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "log-review",
    {
      description:
        "Aggregates recent macOS log entries for quick triage. Filter by predicate or process name.",
      inputSchema: {
        lastMinutes: z.number().int().min(1).max(1440).default(120),
        predicate: z
          .string()
          .optional()
          .describe("Raw log predicate to pass to `log show`."),
        process: z
          .string()
          .optional()
          .describe("Process or binary name to isolate."),
        limit: z.number().int().min(1).max(1000).default(250),
      },
    },
    async ({ lastMinutes, predicate, process, limit }) => {
      try {
        const logResult = process
          ? await deps.logs.inspectProcess(process, { predicate, lastMinutes, limit })
          : await deps.logs.collectErrorEvents({ predicate, lastMinutes, limit });

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Log Review", {
                Command: logResult.command,
                Output: logResult.result.stdout.trim(),
              }),
            },
          ],
          structuredContent: {
            command: logResult.command,
            stdout: logResult.result.stdout.trim(),
            stderr: logResult.result.stderr.trim(),
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "software-maintenance",
    {
      description:
        "Surfaces package hygiene tasks: Homebrew outdated packages, optional cleanup, and application sizes.",
      inputSchema: {
        includeApplications: z.boolean().default(true),
        performCleanup: z
          .boolean()
          .default(false)
          .describe("When true, runs `brew cleanup` after listing outdated formulae."),
      },
    },
    async ({ includeApplications, performCleanup }) => {
      try {
        const brewOutdated = await deps.software.listBrewOutdated();
        const resultSummary: Record<string, ReturnType<typeof formatCommandResult>> = {
          brewOutdated: formatCommandResult(brewOutdated),
        };

        if (performCleanup) {
          const cleanup = await deps.software.cleanupBrew();
          resultSummary.brewCleanup = formatCommandResult(cleanup);
        }

        if (includeApplications) {
          const apps = await deps.software.listApplicationsSortedBySize();
          resultSummary.applicationSizes = formatCommandResult(apps);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Software Maintenance", {
                "brew outdated": resultSummary.brewOutdated.stdout,
                ...(performCleanup && resultSummary.brewCleanup
                  ? { "brew cleanup": resultSummary.brewCleanup.stdout }
                  : {}),
                ...(includeApplications && resultSummary.applicationSizes
                  ? { "Application Sizes": resultSummary.applicationSizes.stdout }
                  : {}),
              }),
            },
          ],
          structuredContent: resultSummary,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "network-inspect",
    {
      description:
        "Captures a point-in-time view of network activity, firewall status, and Wi-Fi environment.",
      inputSchema: {
        includeFirewall: z.boolean().default(true),
        includeWifiScan: z.boolean().default(false),
        bandwidthSampleSeconds: z.number().int().min(1).max(60).default(10),
      },
    },
    async ({ includeFirewall, includeWifiScan, bandwidthSampleSeconds }) => {
      try {
        const tasks: Record<string, ReturnType<typeof formatCommandResult>> = {};

        const connections = await deps.network.listActiveConnections();
        tasks.connections = formatCommandResult(connections);

        const listeners = await deps.network.listListeningSockets();
        tasks.listeners = formatCommandResult(listeners);

        if (includeFirewall) {
          const firewall = await deps.network.analyzeFirewall();
          tasks.firewall = formatCommandResult(firewall);
        }

        if (includeWifiScan) {
          const wifi = await deps.network.scanWirelessNetworks();
          tasks.wifiScan = formatCommandResult(wifi);
        }

        const bandwidth = await deps.network.sampleBandwidth(bandwidthSampleSeconds);
        tasks.bandwidth = formatCommandResult(bandwidth);

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Network Inspection", {
                Connections: tasks.connections.stdout,
                Listeners: tasks.listeners.stdout,
                ...(includeFirewall && tasks.firewall ? { Firewall: tasks.firewall.stdout } : {}),
                ...(includeWifiScan && tasks.wifiScan ? { "Wi-Fi Scan": tasks.wifiScan.stdout } : {}),
                Bandwidth: tasks.bandwidth.stdout,
              }),
            },
          ],
          structuredContent: tasks,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "wireless-diagnostics",
    {
      description:
        "Collects Wi-Fi status, nearby network scan results, performance samples, and recent wireless subsystem logs (macOS).",
      inputSchema: {
        interface: z.string().default("en0"),
        includeScan: z.boolean().default(true),
        includePreferredNetworks: z.boolean().default(false),
        includePerformance: z.boolean().default(true),
        includeEnvironmentReport: z.boolean().default(false),
        includeAirportPreferences: z.boolean().default(false),
        includeLogs: z.boolean().default(false),
        logMinutes: z.number().int().min(1).max(1440).default(10),
        pingHost: z.string().optional(),
        pingCount: z.number().int().min(1).max(20).default(5),
        pingIntervalSeconds: z.number().min(0.1).max(5).default(0.2),
      },
    },
    async ({
      interface: iface,
      includeScan,
      includePreferredNetworks,
      includePerformance,
      includeEnvironmentReport,
      includeAirportPreferences,
      includeLogs,
      logMinutes,
      pingHost,
      pingCount,
      pingIntervalSeconds,
    }) => {
      const capability = "macos-wireless" as const;
      const route = await deps.executionRouter.route(capability);
      if (route.kind !== "local") {
        const response = await deps.remoteAgent.dispatch({
          tool: "wireless-diagnostics",
          capability,
          payload: { interface: iface, includeScan, includePerformance },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Wireless Diagnostics", {
                Result:
                  response.status === "accepted"
                    ? "Delegated to remote agent."
                    : `Remote agent unavailable: ${response.reason ?? "unknown"}`,
              }),
            },
          ],
          structuredContent: {
            remoteAgent: response,
          },
        };
      }

      try {
        const results: Record<string, ReturnType<typeof formatCommandResult>> = {};
        const sections: Record<string, string> = {};

        const status = await deps.wireless.currentStatus({ interfaceName: iface });
        results.status = formatCommandResult(status);
        sections.Status = results.status.stdout || results.status.stderr || "<no output>";

        if (includeScan) {
          const scan = await deps.wireless.scanNetworks({ interfaceName: iface });
          results.scan = formatCommandResult(scan);
          sections["Nearby Networks"] = results.scan.stdout || results.scan.stderr || "<no output>";
        }

        if (includePreferredNetworks) {
          const preferred = await deps.wireless.listPreferredNetworks(iface);
          results.preferredNetworks = formatCommandResult(preferred);
          sections["Preferred Networks"] =
            results.preferredNetworks.stdout || results.preferredNetworks.stderr || "<no output>";
        }

        if (includePerformance) {
          const performance = await deps.wireless.performanceSummary();
          results.performance = formatCommandResult(performance);
          sections["Network Quality"] =
            results.performance.stdout || results.performance.stderr || "<no output>";
        }

        if (includeEnvironmentReport) {
          const environment = await deps.wireless.environmentReport();
          results.environment = formatCommandResult(environment);
          sections["Environment Report"] = results.environment.stdout || "<environment data>";
        }

        if (includeAirportPreferences) {
          const prefs = await deps.wireless.airportPreferences();
          results.airportPreferences = formatCommandResult(prefs);
          sections["Airport Preferences"] =
            results.airportPreferences.stdout || results.airportPreferences.stderr || "<no output>";
        }

        if (includeLogs) {
          const logs = await deps.wireless.wifiLogs({ minutes: logMinutes });
          results.logs = formatCommandResult(logs);
          sections["Recent Wi-Fi Logs"] = results.logs.stdout || results.logs.stderr || "<no output>";
        }

        if (pingHost) {
          const latency = await deps.wireless.pingHost({
            host: pingHost,
            count: pingCount,
            intervalSeconds: pingIntervalSeconds,
          });
          results.ping = formatCommandResult(latency);
          sections[`Ping ${pingHost}`] = results.ping.stdout || results.ping.stderr || "<no output>";
        }

        return {
          content: [
            {
              type: "text" as const,
              text: toTextContent("Wireless Diagnostics", sections),
            },
          ],
          structuredContent: results,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    "packet-capture",
    {
      description:
        "Runs a bounded tcpdump capture suitable for ad-hoc diagnostics. Requires sudo when executed.",
      inputSchema: {
        interface: z.string().default("en0"),
        durationSeconds: z.number().int().min(5).max(600).default(60),
        filterExpression: z
          .string()
          .optional()
          .describe("Optional BPF filter (e.g., 'port 443')."),
        outputDirectory: z
          .string()
          .optional()
          .describe("Directory to store capture files. Defaults to ./captures"),
      },
    },
    async ({ interface: iface, durationSeconds, filterExpression, outputDirectory }) => {
      try {
        const capture = await deps.packetCapture.capture({
          interface: iface,
          durationSeconds,
          filterExpression,
          outputDirectory,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: [
                "# Packet Capture",
                `Command: ${capture.command}`,
                `Output file: ${capture.outputPath}`,
              ].join("\n"),
            },
          ],
          structuredContent: {
            command: capture.command,
            outputPath: capture.outputPath,
          },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );
};
