/**
 * Test script to verify policy enforcement is working correctly
 *
 * Usage:
 *   ENABLE_POLICY_ENFORCEMENT=true npx ts-node test-policy-enforcement.ts
 */

import { CommandQueueService } from "./src/services/commandQueue.js";
import { initializePolicyEnforcer } from "./src/services/policyEnforcer.js";
import { initializeAuditLogger, createAuditLogCallback } from "./src/utils/auditLogger.js";
import type { AuthorizationContext } from "./src/types/policy.js";

async function main() {
  console.log("🔐 Testing Policy Enforcement Layer\n");

  // Initialize services
  const commandQueue = new CommandQueueService(":memory:");
  const auditLogger = initializeAuditLogger(":memory:");
  const policyEnforcer = initializePolicyEnforcer(
    commandQueue,
    createAuditLogCallback(auditLogger)
  );

  console.log("✅ Services initialized\n");

  // Test 1: LOW risk operation (should allow)
  console.log("Test 1: LOW risk operation (system-overview)");
  const lowRiskContext: AuthorizationContext = {
    callerId: "test-user",
    tool: "system-overview",
    operation: "getSystemInfo",
    args: { topProcesses: 10 },
    userCapabilities: ["local-shell"],
    timestamp: new Date().toISOString(),
  };

  const lowRiskDecision = await policyEnforcer.evaluateToolInvocation(lowRiskContext);
  console.log(`  Action: ${lowRiskDecision.action}`);
  console.log(`  Risk Level: ${lowRiskDecision.riskLevel}`);
  console.log(`  Reason: ${lowRiskDecision.reason}`);
  console.log(lowRiskDecision.action === "allow" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Test 2: HIGH risk with missing capabilities (should deny)
  console.log("Test 2: HIGH risk with missing capabilities");
  const missingCapsContext: AuthorizationContext = {
    callerId: "test-user",
    tool: "ubuntu-admin",
    operation: "restartService",
    args: { service: "nginx", action: "restart" },
    userCapabilities: ["ssh-linux"], // Missing local-sudo, service-control
    timestamp: new Date().toISOString(),
  };

  const deniedDecision = await policyEnforcer.evaluateToolInvocation(missingCapsContext);
  console.log(`  Action: ${deniedDecision.action}`);
  console.log(`  Risk Level: ${deniedDecision.riskLevel}`);
  console.log(`  Reason: ${deniedDecision.reason}`);
  console.log(`  Missing Capabilities: ${deniedDecision.missingCapabilities?.join(", ")}`);
  console.log(deniedDecision.action === "deny" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Test 3: CRITICAL risk operation (should require approval)
  console.log("Test 3: CRITICAL risk operation (SSH sudo execution)");
  const criticalContext: AuthorizationContext = {
    callerId: "test-user",
    tool: "ssh-exec",
    operation: "executeCommand",
    args: {
      host: "prod-db-01.internal",
      command: "sudo systemctl restart postgresql",
      requiresSudo: true,
    },
    userCapabilities: ["ssh-linux", "remote-exec", "local-sudo"],
    timestamp: new Date().toISOString(),
  };

  const approvalDecision = await policyEnforcer.evaluateToolInvocation(criticalContext);
  console.log(`  Action: ${approvalDecision.action}`);
  console.log(`  Risk Level: ${approvalDecision.riskLevel}`);
  console.log(`  Reason: ${approvalDecision.approvalReason}`);
  console.log(approvalDecision.action === "require_approval" ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Test 4: Dangerous pattern detection
  console.log("Test 4: Dangerous pattern detection (rm -rf)");
  const dangerousContext: AuthorizationContext = {
    callerId: "test-user",
    tool: "ssh-exec",
    operation: "executeCommand",
    args: {
      host: "test-server",
      command: "rm -rf /tmp/old-logs",
    },
    userCapabilities: ["ssh-linux", "remote-exec"],
    timestamp: new Date().toISOString(),
  };

  const dangerousDecision = await policyEnforcer.evaluateToolInvocation(dangerousContext);
  console.log(`  Action: ${dangerousDecision.action}`);
  console.log(`  Risk Level: ${dangerousDecision.riskLevel}`);
  console.log(`  Reason: ${dangerousDecision.approvalReason || dangerousDecision.reason}`);
  console.log(dangerousDecision.requiresApproval ? "  ✅ PASS (flagged for approval)" : "  ❌ FAIL");
  console.log();

  // Test 5: Audit trail verification
  console.log("Test 5: Audit trail verification");
  const auditEntries = auditLogger.query({ limit: 10 });
  console.log(`  Total audit entries: ${auditEntries.length}`);
  console.log(auditEntries.length === 4 ? "  ✅ PASS (all decisions logged)" : "  ❌ FAIL");
  console.log();

  // Test 6: Audit statistics
  console.log("Test 6: Audit statistics");
  const stats = auditLogger.getStats();
  console.log(`  Total decisions: ${stats.totalDecisions}`);
  console.log(`  Total allowed: ${stats.totalAllowed}`);
  console.log(`  Total denied: ${stats.totalDenied}`);
  console.log(`  Total requiring approval: ${stats.totalApprovalRequired}`);
  console.log(`  By risk level:`, stats.byRiskLevel);
  console.log(stats.totalDecisions === 4 ? "  ✅ PASS" : "  ❌ FAIL");
  console.log();

  // Test 7: Command queue for approval workflow
  console.log("Test 7: Command queue for approvals");
  if (approvalDecision.action === "require_approval") {
    const { jobId } = await policyEnforcer.requestApproval(criticalContext, approvalDecision);
    console.log(`  Job ID created: ${jobId}`);

    const queueStats = await commandQueue.getQueueStats();
    console.log(`  Queued commands: ${queueStats.totalQueued}`);
    console.log(queueStats.totalQueued === 1 ? "  ✅ PASS (command queued)" : "  ❌ FAIL");
  } else {
    console.log("  ❌ FAIL (approval decision not triggered)");
  }
  console.log();

  // Cleanup
  commandQueue.close();
  auditLogger.close();

  console.log("🎉 All tests completed!");
  console.log("\nTo enable policy enforcement in production:");
  console.log("  export ENABLE_POLICY_ENFORCEMENT=true");
  console.log("  npm start");
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
