import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CommandRunner } from "./utils/commandRunner.js";
import { logger } from "./utils/logger.js";
import { ExecutionRouter } from "./utils/executionRouter.js";
import { SystemInfoService } from "./services/systemInfo.js";
import { CleanupService } from "./services/cleanup.js";
import { LogService } from "./services/logs.js";
import { SoftwareService } from "./services/software.js";
import { NetworkService } from "./services/network.js";
import { PacketCaptureService } from "./services/packetCapture.js";
import { EmailService } from "./services/email.js";
import { MicrosoftService } from "./services/microsoft.js";
import { VpnService } from "./services/vpn.js";
import { SshService } from "./services/ssh.js";
import { LinuxRemoteService } from "./services/linux.js";
import { WebDiagnosticsService } from "./services/webDiagnostics.js";
import { NetworkDiagnosticsService } from "./services/networkDiagnostics.js";
import { TaskDecompositionService } from "./services/taskDecomposition.js";
import { ComplianceAuditService } from "./services/complianceAudit.js";
import { NetworkInfrastructureService } from "./services/networkInfrastructure.js";
import { SecurityScannerService } from "./services/securityScanner.js";
import { SQLitePlannerService } from "./services/sqlitePlanner.js";
import { StructuredThinkingService } from "./services/structuredThinking.js";
import { MetacognitiveFeedbackService } from "./services/metacognitiveFeedback.js";
import { UbuntuAdminService } from "./services/ubuntuAdmin.js";
import { DebianAdminService } from "./services/debianAdmin.js";
import { registerTools } from "./tools/registerTools.js";
import { WindowsAdminService } from "./services/windowsAdmin.js";
import { WirelessDiagnosticsService } from "./services/wirelessDiagnostics.js";
import { RemoteAgentService } from "./services/remoteAgent.js";
import { FirewallToolkitService } from "./services/firewallToolkit.js";
import { PanOsService } from "./services/panos.js";
import { MacDiagnosticsService } from "./services/macDiagnostics.js";
import { MacPermissionsService } from "./services/macPermissions.js";
import { DockerDesktopService } from "./services/dockerDesktop.js";
import { WindowsDiagnosticsService } from "./services/windowsDiagnostics.js";
import { WindowsActiveDirectoryService } from "./services/windowsActiveDirectory.js";
import { WindowsIISService } from "./services/windowsIIS.js";
import { WindowsSecurityService } from "./services/windowsSecurity.js";
import { ReportingHubService } from "./services/reportingHub.js";
import { ZteRouterService } from "./services/zteRouter.js";
import { DatabaseDiagnosticsService } from "./services/databaseDiagnostics.js";
import { CommandQueueService } from "./services/commandQueue.js";
import { initializePolicyEnforcer } from "./services/policyEnforcer.js";
import { initializeAuditLogger, createAuditLogCallback } from "./utils/auditLogger.js";
import { configurePolicyEnforcement } from "./tools/registerTools.js";

const instructions = `
This Model Context Protocol server exposes macOS administration utilities.

Recommended usage:
- Run with elevated privileges when invoking tools that require system access (e.g. tcpdump, cache cleanup). Many commands automatically add \`sudo\`.
- Use the \`cleanup-runbook\` dry-run mode first to preview actions.
- For packet captures, ensure you store captures in a safe location and rotate them regularly.
- Logs are returned as raw text for further analysis; combine with downstream parsing as needed.
- Microsoft 365 tooling depends on the \`m365\` CLI being installed and authenticated (\`m365 login\`).
- Remote Linux tooling shells out to the local \`ssh\` client; ensure keys and host fingerprints are trusted.

Environment variables:
- IT_MCP_ALLOW_SUDO=true|false (default: true) — disable automatic sudo prefixing without editing code.
- IT_MCP_CAPTURE_DIR=/path — default directory for packet captures.
- ENABLE_POLICY_ENFORCEMENT=true|false (default: false) — enable capability-based authorization and audit logging.
`.trim();

const createServer = () => {
  const server = new McpServer(
    {
      name: "it-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
      instructions,
    },
  );

  const allowSudo = process.env.IT_MCP_ALLOW_SUDO !== "false";
  const runner = new CommandRunner(allowSudo);
  const remoteAgent = new RemoteAgentService();
  const executionRouter = new ExecutionRouter();
  const firewallToolkit = new FirewallToolkitService();

  const sshService = new SshService(runner);
  const planner = new SQLitePlannerService();
  const structuredThinking = new StructuredThinkingService(planner);
  void structuredThinking.bootstrapFromWorkspace().catch(() => undefined);
  const metacognitive = new MetacognitiveFeedbackService();
  const reportingHub = new ReportingHubService(structuredThinking);

  const services = {
    systemInfo: new SystemInfoService(runner),
    cleanup: new CleanupService(runner),
    logs: new LogService(runner),
    software: new SoftwareService(runner),
    network: new NetworkService(runner),
    packetCapture: new PacketCaptureService(runner),
    email: new EmailService(runner),
    microsoft: new MicrosoftService(runner),
    vpn: new VpnService(runner),
    ssh: sshService,
    linux: new LinuxRemoteService(sshService),
    webDiagnostics: new WebDiagnosticsService(runner),
    networkDiagnostics: new NetworkDiagnosticsService(runner),
    structuredThinking,
    metacognitive,
    taskDecomposition: new TaskDecompositionService(),
    complianceAudit: new ComplianceAuditService(),
    networkInfra: new NetworkInfrastructureService(),
    securityScanner: new SecurityScannerService(runner),
    ubuntuAdmin: new UbuntuAdminService(runner),
    debianAdmin: new DebianAdminService(runner),
    windowsAdmin: new WindowsAdminService(runner),
    wireless: new WirelessDiagnosticsService(runner),
    remoteAgent,
    executionRouter,
    firewallToolkit,
    panos: new PanOsService(sshService),
    macDiagnostics: new MacDiagnosticsService(runner, sshService),
    macPermissions: new MacPermissionsService(runner),
    dockerDesktop: new DockerDesktopService(runner),
    windowsDiagnostics: new WindowsDiagnosticsService(runner),
    windowsActiveDirectory: new WindowsActiveDirectoryService(runner),
    windowsIIS: new WindowsIISService(runner),
    windowsSecurity: new WindowsSecurityService(runner),
    reportingHub,
    databaseDiagnostics: new DatabaseDiagnosticsService(runner, sshService),
    zteRouter: new ZteRouterService(runner),
  };

  // Initialize policy enforcement layer
  const policyEnforcementEnabled = process.env.ENABLE_POLICY_ENFORCEMENT === "true";

  if (policyEnforcementEnabled) {
    logger.info("Initializing policy enforcement layer...");

    // Initialize command queue for approval workflow
    const commandQueue = new CommandQueueService();

    // Initialize audit logger for immutable audit trail
    const auditLogger = initializeAuditLogger();

    // Initialize policy enforcer with dependencies
    const policyEnforcer = initializePolicyEnforcer(
      commandQueue,
      createAuditLogCallback(auditLogger)
    );

    // Configure policy enforcement BEFORE registering tools
    configurePolicyEnforcement(policyEnforcer, auditLogger, true);

    logger.info("Policy enforcement layer initialized", {
      auditDb: "mcp_audit.db",
      commandQueueDb: "mcp_command_queue.db",
    });
  } else {
    logger.info("Policy enforcement disabled (set ENABLE_POLICY_ENFORCEMENT=true to enable)");
    configurePolicyEnforcement(null, null, false);
  }

  registerTools(server, services);
  return server;
};

const main = async () => {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Server ready on stdio");
};

main().catch((error) => {
  logger.error("Unhandled error in it-mcp server", {
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  });
  process.exit(1);
});
