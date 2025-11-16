/**
 * System Tools Module Index
 *
 * Aggregates all system diagnostic and management tools
 */

import type { ToolModule } from '../types.js';
import { SystemOverviewModule } from './systemOverview.js';
import { ListLaunchDaemonsModule } from './listLaunchDaemons.js';
import { LogReviewModule } from './logReview.js';
import { CleanupRunbookModule } from './cleanupRunbook.js';
import { SoftwareMaintenanceModule } from './softwareMaintenance.js';

/**
 * All system tool modules
 */
export const systemModules: readonly ToolModule[] = [
  SystemOverviewModule,
  ListLaunchDaemonsModule,
  LogReviewModule,
  CleanupRunbookModule,
  SoftwareMaintenanceModule,
] as const;

/**
 * System tools category summary
 */
export const systemToolsSummary = {
  category: 'system' as const,
  moduleCount: systemModules.length,
  tools: systemModules.flatMap((m) => m.tools),
  description: 'System diagnostic, monitoring, and maintenance tools',
} as const;
