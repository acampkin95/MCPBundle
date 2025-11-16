/**
 * Policy configuration for IT-MCP tools
 * Defines risk levels and capability requirements for each operation
 */

import type { PolicyRule, OperationPolicy } from '../policy/types.js';

/**
 * Policy rules for all IT-MCP tools
 */
export const TOOL_POLICIES: Record<string, PolicyRule> = {
  // ========== LOW RISK: Read-only operations ==========

  'system-overview': {
    tool: 'system-overview',
    operations: {
      getSystemInfo: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  'network-diagnostics': {
    tool: 'network-diagnostics',
    operations: {
      traceroute: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
      dnsLookup: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  'ssh-diagnostics': {
    tool: 'ssh-diagnostics',
    operations: {
      checkConnectivity: {
        danger: 'LOW',
        requires: ['ssh-linux'],
        interactiveOnly: false,
      },
    },
  },

  'log-analysis': {
    tool: 'log-analysis',
    operations: {
      analyzeLogs: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  'performance-profiler': {
    tool: 'performance-profiler',
    operations: {
      profileSystem: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  // ========== MEDIUM RISK: Diagnostic operations ==========

  'mac-diagnostics': {
    tool: 'mac-diagnostics',
    operations: {
      runDiagnostics: {
        danger: 'MEDIUM',
        requires: ['local-shell', 'macos-wireless'],
        interactiveOnly: false,
      },
    },
  },

  'mac-permissions-overview': {
    tool: 'mac-permissions-overview',
    operations: {
      collect: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  'mac-permissions-audit': {
    tool: 'mac-permissions-audit',
    operations: {
      evaluate: {
        danger: 'MEDIUM',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  'tool-metadata': {
    tool: 'tool-metadata',
    operations: {
      describe: {
        danger: 'LOW',
        requires: [],
        interactiveOnly: false,
      },
    },
  },

  'playbook-preview': {
    tool: 'playbook-preview',
    operations: {
      plan: {
        danger: 'LOW',
        requires: [],
        interactiveOnly: false,
      },
    },
  },

  'docker-desktop-status': {
    tool: 'docker-desktop-status',
    operations: {
      collect: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
    },
  },

  'windows-diagnostics': {
    tool: 'windows-diagnostics',
    operations: {
      runDiagnostics: {
        danger: 'MEDIUM',
        requires: ['winrm'],
        interactiveOnly: false,
      },
    },
  },

  'ubuntu-diagnostics': {
    tool: 'ubuntu-diagnostics',
    operations: {
      runDiagnostics: {
        danger: 'MEDIUM',
        requires: ['ssh-linux'],
        interactiveOnly: false,
      },
    },
  },

  'mac-wireless-diagnostics': {
    tool: 'mac-wireless-diagnostics',
    operations: {
      diagnoseWireless: {
        danger: 'MEDIUM',
        requires: ['macos-wireless'],
        interactiveOnly: false,
      },
    },
  },

  // ========== HIGH RISK: Operations with requiresSudo ==========

  'cleanup-runbook': {
    tool: 'cleanup-runbook',
    operations: {
      dryRunCleanup: {
        danger: 'MEDIUM',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
      cleanupLogs: {
        danger: 'HIGH',
        requires: ['local-sudo', 'system-modify'],
        interactiveOnly: true, // Always require approval for actual cleanup
        maxRetries: 0,
      },
    },
  },

  'ubuntu-admin': {
    tool: 'ubuntu-admin',
    operations: {
      readOnlyCheck: {
        danger: 'MEDIUM',
        requires: ['ssh-linux'],
        interactiveOnly: false,
      },
      updateSystem: {
        danger: 'HIGH',
        requires: ['ssh-linux', 'local-sudo', 'system-modify'],
        interactiveOnly: true,
      },
      installPackage: {
        danger: 'HIGH',
        requires: ['ssh-linux', 'local-sudo', 'system-modify'],
        interactiveOnly: true,
      },
      restartService: {
        danger: 'HIGH',
        requires: ['ssh-linux', 'local-sudo', 'service-control'],
        interactiveOnly: true,
      },
    },
  },

  'windows-admin': {
    tool: 'windows-admin',
    operations: {
      readOnlyCheck: {
        danger: 'MEDIUM',
        requires: ['winrm'],
        interactiveOnly: false,
      },
      updateSystem: {
        danger: 'HIGH',
        requires: ['winrm', 'system-modify'],
        interactiveOnly: true,
      },
      installSoftware: {
        danger: 'HIGH',
        requires: ['winrm', 'system-modify'],
        interactiveOnly: true,
      },
      restartService: {
        danger: 'HIGH',
        requires: ['winrm', 'service-control'],
        interactiveOnly: true,
      },
    },
  },

  'mac-admin': {
    tool: 'mac-admin',
    operations: {
      readOnlyCheck: {
        danger: 'MEDIUM',
        requires: ['ssh-mac'],
        interactiveOnly: false,
      },
      updateSystem: {
        danger: 'HIGH',
        requires: ['ssh-mac', 'local-sudo', 'system-modify'],
        interactiveOnly: true,
      },
      installPackage: {
        danger: 'HIGH',
        requires: ['ssh-mac', 'local-sudo', 'system-modify'],
        interactiveOnly: true,
      },
    },
  },

  // ========== CRITICAL RISK: Destructive operations ==========

  'ssh-execute': {
    tool: 'ssh-execute',
    operations: {
      executeCommand: {
        danger: 'HIGH',
        requires: ['ssh-linux', 'remote-exec'],
        interactiveOnly: false,
      },
      executeSudoCommand: {
        danger: 'CRITICAL',
        requires: ['ssh-linux', 'remote-exec', 'local-sudo'],
        interactiveOnly: true, // Always require approval for sudo commands
      },
    },
  },

  'firewall-management': {
    tool: 'firewall-management',
    operations: {
      listRules: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
      addRule: {
        danger: 'CRITICAL',
        requires: ['local-sudo', 'firewall-admin'],
        interactiveOnly: true,
      },
      deleteRule: {
        danger: 'CRITICAL',
        requires: ['local-sudo', 'firewall-admin'],
        interactiveOnly: true,
      },
    },
  },

  'service-management': {
    tool: 'service-management',
    operations: {
      status: {
        danger: 'LOW',
        requires: ['local-shell'],
        interactiveOnly: false,
      },
      restart: {
        danger: 'CRITICAL',
        requires: ['local-sudo', 'service-control'],
        interactiveOnly: true,
      },
      stop: {
        danger: 'CRITICAL',
        requires: ['local-sudo', 'service-control'],
        interactiveOnly: true,
      },
      start: {
        danger: 'HIGH',
        requires: ['local-sudo', 'service-control'],
        interactiveOnly: true,
      },
    },
  },

  // Default policy for unknown tools
  unknown: {
    tool: 'unknown',
    operations: {
      default: {
        danger: 'CRITICAL',
        requires: ['local-sudo', 'system-modify'],
        interactiveOnly: true,
      },
    },
  },
};

/**
 * Get policy for a specific tool operation
 */
export function getPolicyForTool(toolName: string, operation: string): OperationPolicy | null {
  const toolPolicy = TOOL_POLICIES[toolName];

  if (!toolPolicy) {
    // Unknown tool - use strictest policy
    return TOOL_POLICIES['unknown'].operations['default'];
  }

  const operationPolicy = toolPolicy.operations[operation];

  if (!operationPolicy) {
    // Unknown operation - deny by default
    return null;
  }

  return operationPolicy;
}

/**
 * Get all policies for a tool
 */
export function getAllPoliciesForTool(toolName: string): PolicyRule | null {
  return TOOL_POLICIES[toolName] || null;
}

/**
 * Check if a tool/operation combination exists
 */
export function isPolicyDefined(toolName: string, operation: string): boolean {
  return getPolicyForTool(toolName, operation) !== null;
}
