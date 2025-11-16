/**
 * Admin Tools Module Index
 *
 * Aggregates all system administration tools
 */

import type { ToolModule } from '../types.js';
import { WindowsAdminModule } from './windowsAdmin.js';
import { WindowsAdModule } from './windowsAd.js';
import { WindowsIisModule } from './windowsIis.js';
import { WindowsSecurityModule } from './windowsSecurity.js';
import { UbuntuHealthReportModule } from './ubuntuHealthReport.js';
import { DebianHealthReportModule } from './debianHealthReport.js';

/**
 * All admin tool modules
 */
export const adminModules: readonly ToolModule[] = [
  WindowsAdminModule,
  WindowsAdModule,
  WindowsIisModule,
  WindowsSecurityModule,
  UbuntuHealthReportModule,
  DebianHealthReportModule,
] as const;

/**
 * Admin tools category summary
 */
export const adminToolsSummary = {
  category: 'admin' as const,
  moduleCount: adminModules.length,
  tools: adminModules.flatMap((m) => m.tools),
  description: 'System administration tools for Windows, Linux, and Active Directory',
} as const;
