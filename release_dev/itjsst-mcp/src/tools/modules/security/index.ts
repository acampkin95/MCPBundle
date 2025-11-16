/**
 * Security Tools Module Index
 *
 * Aggregates all security scanning and analysis tools
 */

import type { ToolModule } from '../types.js';
import { FirewallDiagnosticsModule } from './firewallDiagnostics.js';
import { FirewallToolkitModule } from './firewallToolkit.js';
import { Scan_security_vulnerabilitiesModule } from './scan_security_vulnerabilities.js';

/**
 * All security tool modules
 */
export const securityModules: readonly ToolModule[] = [
  FirewallDiagnosticsModule,
  FirewallToolkitModule,
  Scan_security_vulnerabilitiesModule,
] as const;

/**
 * Security tools category summary
 */
export const securityToolsSummary = {
  category: 'security' as const,
  moduleCount: securityModules.length,
  tools: securityModules.flatMap((m) => m.tools),
  description: 'Security scanning, firewall management, and vulnerability assessment tools',
} as const;
