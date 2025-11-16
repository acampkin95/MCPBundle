/**
 * Tool Modules Master Index
 *
 * Central registry for all tool modules organized by category.
 * This file provides a single entry point for registering all tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDependencies } from '../registerTools.js';
import type { ToolModule, ModuleRegistry } from './types.js';

// Import all category modules
import { systemModules, systemToolsSummary } from './system/index.js';
import { networkModules, networkToolsSummary } from './network/index.js';
import { securityModules, securityToolsSummary } from './security/index.js';
import { databaseModules, databaseToolsSummary } from './database/index.js';
import { adminModules, adminToolsSummary } from './admin/index.js';
import { platformModules, platformToolsSummary } from './platform/index.js';
import { cognitiveModules, cognitiveToolsSummary } from './cognitive/index.js';
import { utilityModules, utilityToolsSummary } from './utility/index.js';

/**
 * All tool modules grouped by category
 */
export const allModules = {
  system: systemModules,
  network: networkModules,
  security: securityModules,
  database: databaseModules,
  admin: adminModules,
  platform: platformModules,
  cognitive: cognitiveModules,
  utility: utilityModules,
} as const;

/**
 * Flattened list of all tool modules
 */
export const allModulesList: readonly ToolModule[] = [
  ...systemModules,
  ...networkModules,
  ...securityModules,
  ...databaseModules,
  ...adminModules,
  ...platformModules,
  ...cognitiveModules,
  ...utilityModules,
] as const;

/**
 * Category summaries
 */
export const categorySummaries = {
  system: systemToolsSummary,
  network: networkToolsSummary,
  security: securityToolsSummary,
  database: databaseToolsSummary,
  admin: adminToolsSummary,
  platform: platformToolsSummary,
  cognitive: cognitiveToolsSummary,
  utility: utilityToolsSummary,
} as const;

/**
 * Create a module registry with all tools
 */
export function createModuleRegistry(): ModuleRegistry {
  const modules = new Map<string, ToolModule>();
  const categories = new Map<string, ToolModule[]>();
  const tools = new Map<string, any>();

  for (const module of allModulesList) {
    modules.set(module.name, module);

    if (!categories.has(module.category)) {
      categories.set(module.category, []);
    }
    categories.get(module.category)!.push(module);

    for (const tool of module.tools) {
      tools.set(tool.name, tool);
    }
  }

  return { modules, categories, tools };
}

/**
 * Register all tool modules with the MCP server
 * This is the main entry point for tool registration.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies (service instances)
 */
export function registerAllModules(server: McpServer, deps: ToolDependencies): void {
  let registeredCount = 0;

  for (const module of allModulesList) {
    try {
      module.register(server, deps);
      registeredCount++;
    } catch (error) {
      console.error(`Failed to register module ${module.name}:`, error);
      throw error;
    }
  }

  console.log(`Successfully registered ${registeredCount} tool modules`);
}

/**
 * Get summary statistics about all tools
 */
export function getToolStatistics() {
  const registry = createModuleRegistry();

  return {
    totalModules: registry.modules.size,
    totalTools: registry.tools.size,
    categoryCounts: Object.fromEntries(
      Object.entries(categorySummaries).map(([category, summary]) => [
        category,
        summary.moduleCount,
      ])
    ),
    categories: Array.from(registry.categories.keys()),
  };
}

// Export types
export type { ToolModule, ModuleRegistry, ToolDefinition, ToolCategory } from './types.js';
