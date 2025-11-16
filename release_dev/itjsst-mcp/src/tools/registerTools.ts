/**
 * Tool Registration - Main Entry Point
 *
 * This file serves as the primary interface for registering all IT/JST tools
 * with the MCP server. All tool implementations have been modularized into
 * separate category-based modules for better maintainability.
 *
 * @module registerTools
 * @version 2.0.0 - Refactored to modular architecture
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SystemInfoService } from '../services/systemInfo.js';
import { CleanupService } from '../services/cleanup.js';
import { LogService } from '../services/logs.js';
import { SoftwareService } from '../services/software.js';
import { NetworkService } from '../services/network.js';
import { PacketCaptureService } from '../services/packetCapture.js';
import { EmailService } from '../services/email.js';
import { MicrosoftService } from '../services/microsoft.js';
import { VpnService } from '../services/vpn.js';
import { SshService } from '../services/ssh.js';
import { LinuxRemoteService } from '../services/linux.js';
import { WebDiagnosticsService } from '../services/webDiagnostics.js';
import { NetworkDiagnosticsService } from '../services/networkDiagnostics.js';
import { StructuredThinkingService } from '../services/structuredThinking.js';
import { MetacognitiveFeedbackService } from '../services/metacognitiveFeedback.js';
import { TaskDecompositionService } from '../services/taskDecomposition.js';
import { ComplianceAuditService } from '../services/complianceAudit.js';
import { NetworkInfrastructureService as InfraService } from '../services/networkInfrastructure.js';
import { SecurityScannerService } from '../services/securityScanner.js';
import { UbuntuAdminService } from '../services/ubuntuAdmin.js';
import { DebianAdminService } from '../services/debianAdmin.js';
import { WindowsAdminService } from '../services/windowsAdmin.js';
import { WirelessDiagnosticsService } from '../services/wirelessDiagnostics.js';
import { RemoteAgentService } from '../services/remoteAgent.js';
import { ExecutionRouter } from '../utils/executionRouter.js';
import { FirewallToolkitService } from '../services/firewallToolkit.js';
import { PanOsService } from '../services/panos.js';
import { MacDiagnosticsService } from '../services/macDiagnostics.js';
import { MacPermissionsService } from '../services/macPermissions.js';
import { DockerDesktopService } from '../services/dockerDesktop.js';
import { WindowsDiagnosticsService } from '../services/windowsDiagnostics.js';
import { WindowsActiveDirectoryService } from '../services/windowsActiveDirectory.js';
import { WindowsIISService } from '../services/windowsIIS.js';
import { WindowsSecurityService } from '../services/windowsSecurity.js';
import { ReportingHubService } from '../services/reportingHub.js';
import { DatabaseDiagnosticsService } from '../services/databaseDiagnostics.js';
import { ZteRouterService } from '../services/zteRouter.js';
import { logger } from '../utils/logger.js';
import type { PolicyEnforcer } from '../services/policyEnforcer.js';
import type { AuditLogger } from '../utils/auditLogger.js';

// Import modular tool registrations
import { registerAllModules, getToolStatistics } from './modules/index.js';

/**
 * Tool Dependencies Interface
 *
 * Defines all service dependencies required by the tool modules.
 * Each service provides specific functionality for tool implementations.
 */
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

/**
 * Policy Enforcement Configuration
 *
 * Global configuration for policy enforcement and audit logging.
 * Can be enabled/disabled via environment variable or programmatically.
 */
let policyEnforcerInstance: PolicyEnforcer | null = null;
let auditLoggerInstance: AuditLogger | null = null;
let policyEnforcementEnabled = process.env.ENABLE_POLICY_ENFORCEMENT === 'true';

/**
 * Configure Policy Enforcement
 *
 * Sets up policy enforcement and audit logging for tool invocations.
 * This should be called during application initialization.
 *
 * @param policyEnforcer - Policy enforcement service instance
 * @param auditLogger - Audit logging service instance
 * @param enabled - Whether to enable policy enforcement (default: true)
 *
 * @example
 * ```typescript
 * import { PolicyEnforcer } from './services/policyEnforcer.js';
 * import { AuditLogger } from './utils/auditLogger.js';
 *
 * const enforcer = new PolicyEnforcer();
 * const auditor = new AuditLogger();
 * configurePolicyEnforcement(enforcer, auditor, true);
 * ```
 */
export function configurePolicyEnforcement(
  policyEnforcer: PolicyEnforcer | null,
  auditLogger: AuditLogger | null,
  enabled: boolean = true
): void {
  policyEnforcerInstance = policyEnforcer;
  auditLoggerInstance = auditLogger;
  policyEnforcementEnabled = enabled;
  logger.info('Policy enforcement configured', {
    enabled,
    hasPolicyEnforcer: !!policyEnforcer,
    hasAuditLogger: !!auditLogger,
  });
}

/**
 * Get Policy Enforcement Status
 *
 * Returns the current policy enforcement configuration.
 *
 * @returns Object containing enforcement status and instances
 */
export function getPolicyEnforcementStatus() {
  return {
    enabled: policyEnforcementEnabled,
    hasPolicyEnforcer: !!policyEnforcerInstance,
    hasAuditLogger: !!auditLoggerInstance,
  };
}

/**
 * Register All Tools
 *
 * Main entry point for registering all IT/JST tools with the MCP server.
 * This function delegates to the modular tool registration system.
 *
 * All tools are organized into the following categories:
 * - System: System information, diagnostics, and monitoring
 * - Network: Network diagnostics, infrastructure, and connectivity
 * - Security: Security scanning, firewall tools, and auditing
 * - Database: Database diagnostics and management
 * - Admin: Administrative tools for Windows, Ubuntu, Debian
 * - Platform: Platform-specific tools (Mac, Docker, ZTE, PAN-OS)
 * - Cognitive: Structured thinking, task planning, metacognition
 * - Utility: General utilities and helper tools
 *
 * @param server - MCP server instance to register tools with
 * @param deps - Service dependencies required by tools
 *
 * @throws {Error} If tool registration fails
 *
 * @example
 * ```typescript
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { createToolDependencies } from './services/index.js';
 *
 * const server = new McpServer();
 * const deps = createToolDependencies();
 * registerTools(server, deps);
 * ```
 */
export const registerTools = (server: McpServer, deps: ToolDependencies): void => {
  const startTime = Date.now();

  try {
    // Register all tools from modular structure
    registerAllModules(server, deps);

    // Get registration statistics
    const stats = getToolStatistics();
    const duration = Date.now() - startTime;

    logger.info('Tool registration completed successfully', {
      totalModules: stats.totalModules,
      totalTools: stats.totalTools,
      categories: stats.categories,
      categoryCounts: stats.categoryCounts,
      durationMs: duration,
    });

    // Log individual category counts
    for (const [category, count] of Object.entries(stats.categoryCounts)) {
      logger.debug(`Registered ${count} ${category} tools`);
    }
  } catch (error) {
    logger.error('Failed to register tools', { error });
    throw error;
  }
};

/**
 * Re-export modular tool system for advanced usage
 */
export {
  registerAllModules,
  getToolStatistics,
  createModuleRegistry,
  allModules,
  allModulesList,
  categorySummaries,
} from './modules/index.js';

export type { ToolModule, ModuleRegistry, ToolDefinition, ToolCategory } from './modules/types.js';
