/**
 * Utility Tools Module Index
 *
 * Aggregates all utility and helper tools
 */

import type { ToolModule } from '../types.js';
import { ToolMetadataModule } from './toolMetadata.js';

/**
 * All utility tool modules
 */
export const utilityModules: readonly ToolModule[] = [ToolMetadataModule] as const;

/**
 * Utility tools category summary
 */
export const utilityToolsSummary = {
  category: 'utility' as const,
  moduleCount: utilityModules.length,
  tools: utilityModules.flatMap((m) => m.tools),
  description: 'Utility and helper tools',
} as const;
