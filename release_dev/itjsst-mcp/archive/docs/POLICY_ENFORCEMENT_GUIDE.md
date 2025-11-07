# Policy Enforcement Implementation Guide

**Date**: 2025-11-02
**Status**: Core Infrastructure Complete ✅

---

## Overview

This guide documents the hardened, capability-scoped authorization layer implemented for IT-MCP. The system provides defense-in-depth security with:

1. **JWT Authentication** (Keycloak integration)
2. **Capability-Based Access Control** (CBAC)
3. **Risk-Based Policy Enforcement**
4. **Approval Workflows** for high-risk operations
5. **Immutable Audit Trails**

---

## Architecture

### 4-Layer Defense-in-Depth

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: HTTPS/TLS                                      │
│ - Certificate validation                                │
│ - TLS 1.2+ enforcement                                  │
│ - HSTS headers                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: JWT Authentication (Keycloak)                  │
│ - Signature verification (JWKS)                         │
│ - Issuer/audience validation                            │
│ - Token expiry enforcement                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Capability Authorization (PolicyEnforcer)      │
│ - Per-operation capability requirements                 │
│ - Risk-level assessment (LOW → CRITICAL)                │
│ - Approval workflow for HIGH/CRITICAL ops               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Audit Trail (AuditLogger)                      │
│ - Immutable decision logs (SQLite + Winston)            │
│ - Execution tracking with side effects                  │
│ - Queryable compliance records                          │
└─────────────────────────────────────────────────────────┘
```

---

## Components Created

### 1. Type Definitions (`src/types/policy.ts`)

**Purpose**: Core types for authorization system

**Key Types**:
- `AuthorizationContext`: Who, what, when, where
- `OperationPolicy`: Risk level, required capabilities, approval flags
- `PolicyDecision`: allow, deny, or require_approval
- `AuditLogEntry`: Immutable audit record

**File**: 90 lines
**Status**: ✅ Complete

---

### 2. Policy Configuration (`src/config/policies.ts`)

**Purpose**: Machine-readable policy rules for all tools

**Risk Classifications**:

| Risk Level | Description | Examples | Approval Required |
|-----------|-------------|----------|------------------|
| **LOW** | Read-only, no system changes | system-overview, network-diagnostics | No |
| **MEDIUM** | Diagnostic operations | mac-diagnostics, ubuntu-diagnostics | No |
| **HIGH** | Privileged operations | cleanup-runbook (with sudo) | Yes |
| **CRITICAL** | Destructive operations | service restarts, firewall changes, SSH sudo | Always |

**Example Policy**:
```typescript
"ssh-execute": {
  tool: "ssh-execute",
  operations: {
    executeCommand: {
      danger: "HIGH",
      requires: ["ssh-linux", "remote-exec"],
      interactiveOnly: false,
    },
    executeSudoCommand: {
      danger: "CRITICAL",
      requires: ["ssh-linux", "remote-exec", "local-sudo"],
      interactiveOnly: true,  // Always require approval
    },
  },
}
```

**File**: 350 lines
**Status**: ✅ Complete (all 39+ tools classified)

---

### 3. PolicyEnforcer Service (`src/services/policyEnforcer.ts`)

**Purpose**: Evaluate tool invocations and enforce policies

**Key Methods**:
- `evaluateToolInvocation(context)`: Returns allow/deny/require_approval
- `checkCapabilities(user, required)`: Validates capability authorization
- `assessNeedForApproval(context, policy)`: Risk-based approval logic
- `requestApproval(context, decision)`: Submit to approval queue
- `grantApproval(jobId, approver)`: Approve pending operation
- `denyApproval(jobId, reason, rejectedBy)`: Reject operation

**File**: 400+ lines
**Status**: ✅ Complete

---

### 4. AuditLogger Utility (`src/utils/auditLogger.ts`)

**Purpose**: Immutable audit trail with dual persistence

**Storage**:
- **SQLite** (`mcp_audit.db`): Queryable compliance records
- **Winston**: Structured JSON logs for SIEM integration

**Schema**:
```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  caller_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  operation TEXT NOT NULL,
  decision_action TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  requires_approval BOOLEAN NOT NULL,
  execution_status TEXT,
  execution_duration_ms INTEGER,
  side_effects TEXT,  -- JSON array
  error TEXT,
  approver TEXT,
  approved_at TEXT,
  context TEXT NOT NULL,
  decision TEXT NOT NULL
);
```

**Key Methods**:
- `logDecision(context, decision)`: Record authorization decision
- `logExecution(auditId, status, duration, sideEffects, error)`: Track execution
- `logApproval(auditId, approvedBy, approved)`: Record approval/rejection
- `query(filters)`: Query audit history
- `getStats()`: Audit statistics

**File**: 500+ lines
**Status**: ✅ Complete

---

### 5. Tool Handler Wrapper (`src/tools/registerTools.ts`)

**Purpose**: Intercept all tool invocations for policy enforcement

**Integration Pattern**:
```typescript
// Before (unprotected):
server.registerTool("system-overview", { ... }, async ({ args }) => {
  return await deps.systemInfo.getSystemOverview(args.topProcesses);
});

// After (protected):
server.registerTool("system-overview", { ... },
  wrapWithPolicy("system-overview", "getSystemInfo", async ({ args }) => {
    return await deps.systemInfo.getSystemOverview(args.topProcesses);
  }, ["local-shell"])  // Required capabilities
);
```

**Wrapper Flow**:
1. Build `AuthorizationContext` from invocation
2. Evaluate against policy rules
3. Log decision to audit trail
4. Return early if denied
5. Submit to approval queue if required
6. Execute tool handler if allowed
7. Log execution result

**File**: Modified registerTools.ts (+170 lines)
**Status**: ✅ Wrapper implemented, ready for tool-by-tool application

---

## Usage

### Enable Policy Enforcement

**Environment Variable**:
```bash
export ENABLE_POLICY_ENFORCEMENT=true
```

**Programmatic Configuration** (in `src/server.ts` or main entry point):
```typescript
import { CommandQueueService } from "./services/commandQueue.js";
import { initializePolicyEnforcer } from "./services/policyEnforcer.js";
import { initializeAuditLogger, createAuditLogCallback } from "./utils/auditLogger.js";
import { configurePolicyEnforcement } from "./tools/registerTools.js";

// Initialize services
const commandQueue = new CommandQueueService();
const auditLogger = initializeAuditLogger();
const policyEnforcer = initializePolicyEnforcer(
  commandQueue,
  createAuditLogCallback(auditLogger)
);

// Configure policy enforcement BEFORE registering tools
configurePolicyEnforcement(policyEnforcer, auditLogger, true);

// Now register tools (they will be automatically wrapped)
registerTools(server, deps);
```

---

### Applying Wrappers to Tools

**Option 1: Manual Wrapping (Selective)**
```typescript
// Wrap specific high-risk tools
server.registerTool(
  "ssh-execute",
  { description: "...", inputSchema: { ... } },
  wrapWithPolicy(
    "ssh-execute",
    "executeSudoCommand",
    async ({ host, command, requiresSudo }) => {
      // Original handler logic
    },
    ["ssh-linux", "remote-exec", "local-sudo"]  // Required capabilities
  )
);
```

**Option 2: Automatic Wrapping (Global)**

Modify `registerTools()` to apply wrapper to all tools:
```typescript
export const registerTools = (server: McpServer, deps: ToolDependencies): void => {
  // Helper to register with automatic wrapping
  const registerProtectedTool = (
    name: string,
    config: { description: string; inputSchema: any },
    handler: (args: any) => Promise<any>,
    requiredCapabilities: readonly string[] = []
  ) => {
    server.registerTool(
      name,
      config,
      wrapWithPolicy(name, name, handler, requiredCapabilities)
    );
  };

  // Use helper for all tools
  registerProtectedTool(
    "system-overview",
    {
      description: "Collects system health snapshot",
      inputSchema: { topProcesses: z.number().int().min(1).max(50).default(10) }
    },
    async ({ topProcesses }) => {
      const overview = await deps.systemInfo.getSystemOverview(topProcesses);
      return { content: [...], structuredContent: { ... } };
    },
    ["local-shell"]  // Required capabilities from policy config
  );

  // Repeat for all 39+ tools...
};
```

---

### Capability Mapping (Keycloak Integration)

**Keycloak Realm Configuration**:
1. Create realm: `mcp-agents`
2. Create client: `it-mcp-server`
3. Define roles (map 1:1 to capabilities):
   - `local-shell`
   - `local-sudo`
   - `ssh-linux`
   - `ssh-mac`
   - `winrm`
   - `macos-wireless`
   - `system-modify`
   - `firewall-admin`
   - `service-control`
   - `remote-exec`

**JWT Claims Mapping**:
```json
{
  "sub": "73f7c4a3-2676-48e0-9238-2473ceda7c6b",
  "realm_access": {
    "roles": ["local-shell", "ssh-linux", "system-modify"]
  }
}
```

**Extract Capabilities in Wrapper**:
```typescript
// TODO: Replace hardcoded userCapabilities with JWT extraction
import { jwtVerify } from "jose";

async function extractCapabilitiesFromJWT(token: string): Promise<string[]> {
  const jwks = createRemoteJWKSet(
    new URL('https://auth.acdev.host/realms/mcp-agents/protocol/openid-connect/certs')
  );

  const { payload } = await jwtVerify(token, jwks);
  return payload.realm_access?.roles || [];
}

// Use in wrapWithPolicy:
const userCapabilities = await extractCapabilitiesFromJWT(bearerToken);
```

---

## Approval Workflow

### Submitting for Approval

When PolicyEnforcer determines an operation requires approval:

```typescript
const decision = await policyEnforcer.evaluateToolInvocation(context);
// decision.action === "require_approval"

const { jobId } = await policyEnforcer.requestApproval(context, decision);
// Returns: { jobId: "uuid-v4" }
```

### Viewing Pending Approvals

**CLI Query** (example):
```typescript
const commandQueue = new CommandQueueService();
const pending = await commandQueue.query({
  status: "queued",
  priority: "urgent"  // CRITICAL risk operations
});

console.log("Pending Approvals:");
for (const cmd of pending) {
  console.log(`- ${cmd.jobId}: ${cmd.toolName} (${cmd.priority})`);
}
```

### Granting Approval

```typescript
await policyEnforcer.grantApproval(jobId, "admin@example.com");
// Audit log automatically updated
```

### Denying Approval

```typescript
await policyEnforcer.denyApproval(
  jobId,
  "Insufficient justification for sudo operation",
  "admin@example.com"
);
// Command marked as failed, audit log updated
```

---

## Audit Trail

### Query Examples

**All decisions for a specific tool**:
```typescript
const entries = auditLogger.query({
  tool: "ssh-execute",
  limit: 100
});
```

**All CRITICAL risk operations**:
```typescript
const entries = auditLogger.query({
  riskLevel: "CRITICAL",
  startDate: "2025-11-01T00:00:00Z"
});
```

**Operations requiring approval**:
```typescript
const entries = auditLogger.query({
  requiresApproval: true
});
```

### Audit Statistics

```typescript
const stats = auditLogger.getStats();
console.log(stats);
// {
//   totalDecisions: 1523,
//   totalAllowed: 1420,
//   totalDenied: 15,
//   totalApprovalRequired: 88,
//   totalExecutions: 1420,
//   totalSuccesses: 1395,
//   totalFailures: 25,
//   byRiskLevel: { LOW: 1200, MEDIUM: 250, HIGH: 60, CRITICAL: 13 },
//   byTool: { "system-overview": 450, "ssh-execute": 88, ... }
// }
```

---

## Security Best Practices

### 1. Principle of Least Privilege
- Assign minimal capabilities per user/agent
- Use role-based mapping in Keycloak
- Regularly audit capability assignments

### 2. Defense in Depth
- Never disable any of the 4 security layers
- Always use HTTPS in production
- Verify JWT signatures with JWKS (never skip)

### 3. Approval Workflows
- Require approval for all CRITICAL operations
- Implement time-limited approval windows
- Log all approval/rejection decisions

### 4. Audit Compliance
- Retain audit logs for compliance period (e.g., 90 days)
- Export to SIEM for correlation
- Review high-risk operation trends weekly

### 5. Dangerous Pattern Detection
- Extend `hasDangerousParams()` with organization-specific patterns
- Block commands like `rm -rf /`, `dd if=/dev/zero`, `curl | sh`
- Validate all user inputs before execution

---

## Testing

### Unit Tests

```typescript
import { PolicyEnforcer } from "./services/policyEnforcer.js";
import { CommandQueueService } from "./services/commandQueue.js";
import { AuditLogger } from "./utils/auditLogger.js";

describe("PolicyEnforcer", () => {
  let enforcer: PolicyEnforcer;
  let commandQueue: CommandQueueService;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    commandQueue = new CommandQueueService(":memory:");
    auditLogger = new AuditLogger(":memory:");
    enforcer = new PolicyEnforcer(commandQueue, (entry) => {
      auditLogger.logDecision(entry.context, entry.decision);
    });
  });

  test("should allow LOW risk operations", async () => {
    const context = {
      callerId: "test-user",
      tool: "system-overview",
      operation: "getSystemInfo",
      args: {},
      userCapabilities: ["local-shell"],
      timestamp: new Date().toISOString()
    };

    const decision = await enforcer.evaluateToolInvocation(context);
    expect(decision.action).toBe("allow");
    expect(decision.riskLevel).toBe("LOW");
  });

  test("should deny when missing capabilities", async () => {
    const context = {
      callerId: "test-user",
      tool: "ssh-execute",
      operation: "executeCommand",
      args: {},
      userCapabilities: ["local-shell"],  // Missing ssh-linux
      timestamp: new Date().toISOString()
    };

    const decision = await enforcer.evaluateToolInvocation(context);
    expect(decision.action).toBe("deny");
    expect(decision.missingCapabilities).toContain("ssh-linux");
  });

  test("should require approval for CRITICAL operations", async () => {
    const context = {
      callerId: "test-user",
      tool: "ssh-execute",
      operation: "executeSudoCommand",
      args: { command: "systemctl restart postgresql" },
      userCapabilities: ["ssh-linux", "remote-exec", "local-sudo"],
      timestamp: new Date().toISOString()
    };

    const decision = await enforcer.evaluateToolInvocation(context);
    expect(decision.action).toBe("require_approval");
    expect(decision.riskLevel).toBe("CRITICAL");
  });
});
```

### Integration Tests

```bash
# Test policy enforcement end-to-end
npm test -- --grep "Policy Enforcement"
```

---

## Deployment to acdev.host

### Prerequisites
- ✅ PostgreSQL database operational
- ✅ IT-MCP API service running (port 3001)
- ⏳ Keycloak realm `mcp-agents` created
- ⏳ NGINX reverse proxy configured

### Deployment Steps

1. **Update Environment Variables**:
```bash
# On acdev.host
cd /opt/it-mcp-api
nano .env

# Add:
ENABLE_POLICY_ENFORCEMENT=true
KEYCLOAK_REALM=mcp-agents
KEYCLOAK_SERVER_URL=https://acdev.host:8080
KEYCLOAK_CLIENT_ID=it-mcp-server
KEYCLOAK_CLIENT_SECRET=<from Keycloak admin console>
```

2. **Initialize Policy Services** (in server.ts):
```typescript
import { CommandQueueService } from "./services/commandQueue.js";
import { initializePolicyEnforcer } from "./services/policyEnforcer.js";
import { initializeAuditLogger, createAuditLogCallback } from "./utils/auditLogger.js";
import { configurePolicyEnforcement } from "./tools/registerTools.js";

const commandQueue = new CommandQueueService("/opt/it-mcp-api/mcp_command_queue.db");
const auditLogger = initializeAuditLogger("/opt/it-mcp-api/mcp_audit.db");
const policyEnforcer = initializePolicyEnforcer(
  commandQueue,
  createAuditLogCallback(auditLogger)
);

configurePolicyEnforcement(policyEnforcer, auditLogger, true);
```

3. **Restart Service**:
```bash
pm2 restart it-mcp-api
pm2 logs it-mcp-api --lines 100
```

4. **Verify**:
```bash
# Check audit logs
sqlite3 /opt/it-mcp-api/mcp_audit.db "SELECT COUNT(*) FROM audit_logs;"

# Test with curl
curl -X POST http://acdev.host:3001/api/v1/servers/register \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"serverId": "test", ...}'
```

---

## Pending Tasks

| Phase | Task | Status | Blocker |
|-------|------|--------|---------|
| Phase 1 | Create Keycloak realm | ⏳ Pending | Manual Keycloak configuration |
| Phase 1 | Implement KeycloakAuthService HTTP calls | ⏳ Pending | Keycloak client credentials |
| Phase 2 | PolicyEnforcer | ✅ Complete | - |
| Phase 3 | AuditLogger | ✅ Complete | - |
| Phase 4 | Tool handler wrapping | 🔄 In Progress | Apply to all 39+ tools |
| Phase 5 | Production deployment | ⏳ Pending | Keycloak + NGINX config |

---

## Files Summary

**New Files Created**:
1. `src/types/policy.ts` (90 lines)
2. `src/config/policies.ts` (350 lines)
3. `src/services/policyEnforcer.ts` (400 lines)
4. `src/utils/auditLogger.ts` (500 lines)
5. `POLICY_ENFORCEMENT_GUIDE.md` (this file)

**Modified Files**:
1. `src/tools/registerTools.ts` (+170 lines for wrapper)
2. `src/services/commandQueue.ts` (+40 lines for async helpers)
3. `package.json` (+1 dependency: jose)

**Total New Code**: ~1,550 lines

---

## Next Steps

### Short Term (Week 1)
1. Create Keycloak `mcp-agents` realm and client
2. Implement actual HTTP calls in `KeycloakAuthService`
3. Apply `wrapWithPolicy` to all 39+ tools in `registerTools.ts`
4. Write comprehensive unit tests for PolicyEnforcer

### Medium Term (Week 2-3)
5. Deploy to acdev.host with Keycloak integration
6. Configure NGINX reverse proxy with JWT validation
7. Set up SIEM integration for audit logs
8. Create approval dashboard (web UI or CLI)

### Long Term (Month 2+)
9. Implement approval time windows (operations expire after N hours)
10. Add side effect tracking (files modified, services touched)
11. Implement capability delegation (temporary elevation)
12. Build compliance reporting (PCI-DSS, SOC 2, etc.)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-02
**Author**: IT-MCP Development Team
