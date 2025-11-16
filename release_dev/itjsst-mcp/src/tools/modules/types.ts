/**
 * Tool Module System - Type Definitions
 *
 * This file defines the base types and interfaces for the modular tool registration system.
 * Each tool module implements the ToolModule interface for consistent registration.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDependencies } from '../registerTools.js';
import type { z } from 'zod';

/**
 * Base tool definition interface
 */
export interface ToolDefinition {
  /** Unique tool identifier (kebab-case) */
  readonly name: string;

  /** Human-readable description of what the tool does */
  readonly description: string;

  /** Zod schema for input validation */
  readonly inputSchema: Record<string, z.ZodTypeAny>;

  /** Category for organization and filtering */
  readonly category: ToolCategory;

  /** Tags for searchability */
  readonly tags: readonly string[];
}

/**
 * Tool category for logical grouping
 */
export type ToolCategory =
  | 'system'
  | 'network'
  | 'storage'
  | 'database'
  | 'admin'
  | 'security'
  | 'cognitive'
  | 'platform';

/**
 * Tool module interface
 * Each module exports an object implementing this interface
 */
export interface ToolModule {
  /** Module name (used for logging and debugging) */
  readonly name: string;

  /** Module description */
  readonly description: string;

  /** Category this module belongs to */
  readonly category: ToolCategory;

  /** List of tools provided by this module */
  readonly tools: readonly ToolDefinition[];

  /**
   * Register all tools in this module with the MCP server
   * @param server - MCP server instance
   * @param deps - Tool dependencies (services)
   */
  register(server: McpServer, deps: ToolDependencies): void;
}

/**
 * Tool handler function type
 */
export type ToolHandler<T = any> = (args: T) => Promise<ToolResponse>;

/**
 * Standard tool response format
 */
export interface ToolResponse {
  readonly content: Array<{
    readonly type: 'text';
    readonly text: string;
  }>;
  readonly structuredContent?: Record<string, any>;
}

/**
 * Error response helper
 */
export interface ErrorResponse extends ToolResponse {
  readonly structuredContent: {
    readonly error: {
      readonly message?: string;
      readonly command?: string;
      readonly stderr?: string;
      readonly stdout?: string;
      readonly exitCode?: number;
    };
  };
}

/**
 * Module registry for tracking all registered modules
 */
export interface ModuleRegistry {
  readonly modules: Map<string, ToolModule>;
  readonly categories: Map<ToolCategory, ToolModule[]>;
  readonly tools: Map<string, ToolDefinition>;
}
