/**
 * Policy and authorization types for IT-MCP
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PolicyAction = 'allow' | 'deny' | 'require_approval';

/**
 * Context for authorization decisions
 */
export interface AuthorizationContext {
  readonly callerId: string; // From JWT 'sub' claim
  readonly tool: string; // e.g., "cleanup-runbook"
  readonly operation: string; // e.g., "cleanupLogs"
  readonly args: Record<string, unknown>; // Tool parameters
  readonly targetAgent?: string; // For distributed mode
  readonly userCapabilities: readonly string[]; // From JWT
  readonly timestamp: string;
}

/**
 * Policy rule for a tool operation
 */
export interface OperationPolicy {
  readonly danger: RiskLevel;
  readonly requires: readonly string[]; // Required capabilities
  readonly interactiveOnly?: boolean; // Must have human approval
  readonly maxRetries?: number;
  readonly timeoutSeconds?: number;
}

/**
 * Policy rules for a tool
 */
export interface PolicyRule {
  readonly tool: string;
  readonly operations: Record<string, OperationPolicy>;
}

/**
 * Policy decision result
 */
export interface PolicyDecision {
  readonly action: PolicyAction;
  readonly reason: string;
  readonly riskLevel: RiskLevel;
  readonly requiresApproval: boolean;
  readonly approvalReason?: string;
  readonly missingCapabilities?: readonly string[];
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly context: AuthorizationContext;
  readonly decision: PolicyDecision;
  readonly execution?: {
    readonly status: 'success' | 'failure' | 'timeout';
    readonly duration_ms: number;
    readonly sideEffects: readonly string[];
    readonly error?: string;
  };
  readonly approver?: string;
  readonly approvedAt?: string;
}

/**
 * Approval request
 */
export interface ApprovalRequest {
  readonly context: AuthorizationContext;
  readonly decision: PolicyDecision;
  readonly submittedAt: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly rejectedBy?: string;
  readonly rejectedAt?: string;
  readonly rejectionReason?: string;
}
