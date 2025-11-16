/**
 * PolicyEnforcer Service
 *
 * Evaluates tool invocations against policy rules and enforces capability-based access control.
 * Integrates with approval workflow for high-risk operations.
 */

import type {
  AuthorizationContext,
  PolicyDecision,
  OperationPolicy,
  RiskLevel,
} from '../types/policy.js';
import { getPolicyForTool } from '../config/policies.js';
import { CommandQueueService } from './commandQueue.js';

export type AuditLogEntry = Record<string, unknown>;

/**
 * Policy enforcement service for IT-MCP tools
 */
export class PolicyEnforcer {
  private commandQueue: CommandQueueService;
  private auditLog: (entry: AuditLogEntry) => void;

  constructor(commandQueue: CommandQueueService, auditLogger?: (entry: AuditLogEntry) => void) {
    this.commandQueue = commandQueue;
    this.auditLog = auditLogger || (() => {});
  }

  /**
   * Evaluate a tool invocation against policy rules
   *
   * @param context Authorization context containing caller, tool, operation, and capabilities
   * @returns Policy decision (allow, deny, or require_approval)
   */
  async evaluateToolInvocation(context: AuthorizationContext): Promise<PolicyDecision> {
    // 1. Get policy for this tool/operation
    const policy = getPolicyForTool(context.tool, context.operation);

    if (!policy) {
      // No policy defined - deny by default (fail-safe)
      return {
        action: 'deny',
        reason: `No policy defined for ${context.tool}.${context.operation}`,
        riskLevel: 'CRITICAL',
        requiresApproval: false,
      };
    }

    // 2. Check capability authorization
    const capabilityCheck = this.checkCapabilities(context.userCapabilities, policy.requires);

    if (!capabilityCheck.authorized) {
      return {
        action: 'deny',
        reason: `Missing required capabilities: ${capabilityCheck.missing.join(', ')}`,
        riskLevel: policy.danger,
        requiresApproval: false,
        missingCapabilities: capabilityCheck.missing,
      };
    }

    // 3. Assess need for approval
    const needsApproval = await this.assessNeedForApproval(context, policy);

    if (needsApproval) {
      return {
        action: 'require_approval',
        reason: this.generateApprovalReason(context, policy),
        riskLevel: policy.danger,
        requiresApproval: true,
        approvalReason: this.generateApprovalReason(context, policy),
      };
    }

    // 4. Allow execution
    return {
      action: 'allow',
      reason: `Authorized: ${context.tool}.${context.operation} (${policy.danger} risk)`,
      riskLevel: policy.danger,
      requiresApproval: false,
    };
  }

  /**
   * Check if user has required capabilities
   *
   * @param userCapabilities Capabilities assigned to the caller
   * @param requiredCapabilities Capabilities required by the policy
   * @returns Authorization status and missing capabilities
   */
  private checkCapabilities(
    userCapabilities: readonly string[],
    requiredCapabilities: readonly string[]
  ): { authorized: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const required of requiredCapabilities) {
      if (!userCapabilities.includes(required)) {
        missing.push(required);
      }
    }

    return {
      authorized: missing.length === 0,
      missing,
    };
  }

  /**
   * Assess whether operation requires human approval
   *
   * @param context Authorization context
   * @param policy Operation policy
   * @returns True if approval is required
   */
  private async assessNeedForApproval(
    context: AuthorizationContext,
    policy: OperationPolicy
  ): Promise<boolean> {
    // 1. Explicit interactiveOnly flag
    if (policy.interactiveOnly === true) {
      return true;
    }

    // 2. CRITICAL risk level always requires approval
    if (policy.danger === 'CRITICAL') {
      return true;
    }

    // 3. HIGH risk with dangerous parameters
    if (policy.danger === 'HIGH' && this.hasDangerousParams(context.args)) {
      return true;
    }

    // 4. Sudo operations always require approval
    if (policy.requires.includes('local-sudo') && context.args.requiresSudo === true) {
      return true;
    }

    // 5. Remote execution with sudo
    if (
      (policy.requires.includes('ssh-linux') || policy.requires.includes('ssh-mac')) &&
      context.args.requiresSudo === true
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if arguments contain dangerous patterns
   *
   * @param args Tool invocation arguments
   * @returns True if dangerous patterns detected
   */
  private hasDangerousParams(args: Record<string, unknown>): boolean {
    const argsStr = JSON.stringify(args).toLowerCase();

    const dangerousPatterns = [
      'rm -rf',
      'dd if=',
      'mkfs',
      'fdisk',
      'parted',
      'format',
      'systemctl stop',
      'systemctl disable',
      'kill -9',
      'pkill',
      'iptables -f',
      'ufw delete',
      'firewall-cmd --remove',
      '> /dev/',
      'curl | sh',
      'wget | sh',
      'eval',
      'chmod 777',
      'chown root',
    ];

    for (const pattern of dangerousPatterns) {
      if (argsStr.includes(pattern)) {
        return true;
      }
    }

    // Check for --force flags
    if (args.force === true || args.noConfirm === true) {
      return true;
    }

    return false;
  }

  /**
   * Generate human-readable approval reason
   *
   * @param context Authorization context
   * @param policy Operation policy
   * @returns Approval reason message
   */
  private generateApprovalReason(context: AuthorizationContext, policy: OperationPolicy): string {
    const reasons: string[] = [];

    if (policy.interactiveOnly) {
      reasons.push('Operation marked as interactiveOnly');
    }

    if (policy.danger === 'CRITICAL') {
      reasons.push('CRITICAL risk level');
    }

    if (policy.requires.includes('local-sudo')) {
      reasons.push('Requires elevated privileges (sudo)');
    }

    if (policy.requires.includes('system-modify')) {
      reasons.push('Modifies system configuration');
    }

    if (policy.requires.includes('firewall-admin')) {
      reasons.push('Firewall rule modification');
    }

    if (policy.requires.includes('service-control')) {
      reasons.push('Service lifecycle control');
    }

    if (this.hasDangerousParams(context.args)) {
      reasons.push('Potentially destructive parameters detected');
    }

    if (reasons.length === 0) {
      reasons.push(`${policy.danger} risk operation`);
    }

    return `Approval required: ${reasons.join(', ')}`;
  }

  /**
   * Request approval for a high-risk operation
   *
   * Submits the operation to the approval queue and returns a job ID
   * for tracking.
   *
   * @param context Authorization context
   * @param decision Policy decision
   * @returns Job ID for tracking approval status
   */
  async requestApproval(
    context: AuthorizationContext,
    decision: PolicyDecision
  ): Promise<{ jobId: string }> {
    // Submit to command queue with 'queued' status
    // Human approver will mark as 'approved' or 'rejected'
    const jobId = await this.commandQueue.submitCommand({
      toolName: context.tool,
      params: context.args,
      requestedCapabilities: [...(decision.missingCapabilities || [])],
      targetAgentId: context.targetAgent,
      priority: this.riskLevelToPriority(decision.riskLevel),
    });

    // Audit log the approval request
    this.auditLog({
      type: 'approval_requested',
      jobId,
      context,
      decision,
      timestamp: new Date().toISOString(),
    });

    return { jobId };
  }

  /**
   * Convert risk level to command queue priority
   *
   * @param riskLevel Risk level from policy
   * @returns Priority level for command queue
   */
  private riskLevelToPriority(riskLevel: RiskLevel): 'low' | 'normal' | 'high' | 'urgent' {
    switch (riskLevel) {
      case 'CRITICAL':
        return 'urgent';
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'normal';
      case 'LOW':
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Check if a queued command has been approved
   *
   * @param jobId Job ID from requestApproval()
   * @returns Approval status and approver info
   */
  async checkApprovalStatus(jobId: string): Promise<{
    approved: boolean;
    status: string;
    approver?: string;
    approvedAt?: string;
  }> {
    await this.commandQueue.getQueueStats();

    // This is a simplified check - in production, you'd query the
    // approval metadata directly from the database
    const job = await this.commandQueue.getCommandById(jobId);

    if (!job) {
      return {
        approved: false,
        status: 'not_found',
      };
    }

    // In a full implementation, add approval metadata to command_queue schema
    // For now, we use status field as a proxy
    const approved = job.status === 'picked' || job.status === 'executing';

    return {
      approved,
      status: job.status,
      // TODO: Add approver and approvedAt from metadata when schema extended
    };
  }

  /**
   * Deny approval for a queued command
   *
   * @param jobId Job ID from requestApproval()
   * @param reason Rejection reason
   * @param rejectedBy User who rejected the request
   */
  async denyApproval(jobId: string, reason: string, rejectedBy: string): Promise<void> {
    // Mark command as failed in queue
    await this.commandQueue.markCommandFailed(jobId, reason);

    // Audit log the rejection
    this.auditLog({
      type: 'approval_denied',
      jobId,
      reason,
      rejectedBy,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Grant approval for a queued command
   *
   * @param jobId Job ID from requestApproval()
   * @param approvedBy User who approved the request
   */
  async grantApproval(jobId: string, approvedBy: string): Promise<void> {
    // This moves the command to 'picked' state, making it eligible for execution
    // The actual execution will be handled by the tool handler

    // Audit log the approval
    this.auditLog({
      type: 'approval_granted',
      jobId,
      approvedBy,
      timestamp: new Date().toISOString(),
    });

    // In production, you'd update approval metadata in the database
    // For now, the command remains in queue until picked by executor
  }
}

/**
 * Singleton instance for global access
 * Initialized by server.ts with dependencies
 */
let policyEnforcerInstance: PolicyEnforcer | null = null;

export function initializePolicyEnforcer(
  commandQueue: CommandQueueService,
  auditLogger?: (entry: AuditLogEntry) => void
): PolicyEnforcer {
  policyEnforcerInstance = new PolicyEnforcer(commandQueue, auditLogger);
  return policyEnforcerInstance;
}

export function getPolicyEnforcer(): PolicyEnforcer {
  if (!policyEnforcerInstance) {
    throw new Error('PolicyEnforcer not initialized. Call initializePolicyEnforcer() first.');
  }
  return policyEnforcerInstance;
}
