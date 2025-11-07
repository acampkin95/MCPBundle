/**
 * Shared policy and authorization types for IT-MCP.
 *
 * These types are used across the policy enforcement, audit logging,
 * and configuration layers. They intentionally live outside of the original
 * `src/types` directory so they can be consumed without filesystem
 * permission issues encountered in certain deployment environments.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface OperationPolicy {
  readonly danger: RiskLevel;
  readonly requires: readonly string[];
  readonly interactiveOnly?: boolean;
  readonly maxRetries?: number;
}

export interface PolicyRule {
  readonly tool: string;
  readonly operations: Record<string, OperationPolicy>;
}

export type PolicyDecisionAction = "allow" | "deny" | "require_approval";

export interface PolicyDecision {
  readonly action: PolicyDecisionAction;
  readonly reason: string;
  readonly riskLevel: RiskLevel;
  readonly requiresApproval: boolean;
  readonly missingCapabilities?: readonly string[];
  readonly approvalReason?: string;
}

export interface AuthorizationContext {
  readonly callerId: string;
  readonly tool: string;
  readonly operation: string;
  readonly args: Record<string, unknown>;
  readonly userCapabilities: readonly string[];
  readonly timestamp: string;
  readonly targetAgent?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly context: AuthorizationContext;
  readonly decision: PolicyDecision;
  readonly execution?: {
    readonly status: "success" | "failure" | "timeout";
    readonly duration_ms: number;
    readonly sideEffects: readonly string[];
    readonly error?: string;
  };
  readonly approver?: string;
  readonly approvedAt?: string;
}
