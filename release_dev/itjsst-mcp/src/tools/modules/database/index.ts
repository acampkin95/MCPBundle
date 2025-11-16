/**
 * Database Tools Module Index
 *
 * Aggregates all database diagnostic and management tools
 */

import type { ToolModule } from '../types.js';
import { DatabaseDiagnosticsModule } from './databaseDiagnostics.js';

/**
 * All database tool modules
 */
export const databaseModules: readonly ToolModule[] = [DatabaseDiagnosticsModule] as const;

/**
 * Database tools category summary
 */
export const databaseToolsSummary = {
  category: 'database' as const,
  moduleCount: databaseModules.length,
  tools: databaseModules.flatMap((m) => m.tools),
  description: 'Database health, performance, and diagnostic tools',
} as const;
