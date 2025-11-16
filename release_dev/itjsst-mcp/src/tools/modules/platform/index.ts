/**
 * Platform Tools Module Index
 *
 * Aggregates all platform-specific diagnostic tools (macOS, Windows, Docker, etc.)
 */

import type { ToolModule } from '../types.js';
import { MacDiagnosticsModule } from './macDiagnostics.js';
import { MacPermissionsAuditModule } from './macPermissionsAudit.js';
import { MacPermissionsOverviewModule } from './macPermissionsOverview.js';
import { DockerDesktopStatusModule } from './dockerDesktopStatus.js';
import { WindowsDiagnosticsModule } from './windowsDiagnostics.js';
import { PanosCliModule } from './panosCli.js';
import { ZteRouterModule } from './zteRouter.js';

/**
 * All platform tool modules
 */
export const platformModules: readonly ToolModule[] = [
  MacDiagnosticsModule,
  MacPermissionsAuditModule,
  MacPermissionsOverviewModule,
  DockerDesktopStatusModule,
  WindowsDiagnosticsModule,
  PanosCliModule,
  ZteRouterModule,
] as const;

/**
 * Platform tools category summary
 */
export const platformToolsSummary = {
  category: 'platform' as const,
  moduleCount: platformModules.length,
  tools: platformModules.flatMap((m) => m.tools),
  description: 'Platform-specific diagnostic and management tools',
} as const;
