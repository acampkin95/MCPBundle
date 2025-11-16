/**
 * Tool Module System - Shared Utilities
 *
 * Common utility functions shared across all tool modules
 */

import { CommandExecutionError, type CommandResult } from '../../utils/commandRunner.js';
import type { ErrorResponse, ToolResponse } from './types.js';

/**
 * Command result summary for structured output
 */
export interface CommandSummary {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/**
 * Format a command result into a summary object
 * @param result - Raw command execution result
 * @returns Formatted summary with trimmed output
 */
export const formatCommandResult = (result: CommandResult): CommandSummary => ({
  command: result.command,
  stdout: result.stdout.trim(),
  stderr: result.stderr.trim(),
  exitCode: result.code,
});

/**
 * Convert structured data into formatted text content
 * @param title - Main title for the output
 * @param sections - Map of section titles to content
 * @returns Formatted markdown-style text
 */
export const toTextContent = (title: string, sections: Record<string, string>): string => {
  const lines = [`# ${title}`];
  for (const [key, value] of Object.entries(sections)) {
    lines.push(`\n## ${key}`);
    lines.push(value || '<no output>');
  }
  return lines.join('\n');
};

/**
 * Handle errors in a standardized way
 * @param error - Error to handle (unknown type)
 * @returns Formatted error response
 */
export const handleError = (error: unknown): ErrorResponse => {
  if (error instanceof CommandExecutionError) {
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            `Command failed: ${error.result.command}`,
            error.result.stderr || error.result.stdout || String(error),
          ].join('\n'),
        },
      ],
      structuredContent: {
        error: {
          command: error.result.command,
          stderr: error.result.stderr,
          stdout: error.result.stdout,
          exitCode: error.result.code ?? undefined,
        },
      },
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    structuredContent: {
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    },
  };
};

/**
 * Create a successful text response
 * @param title - Response title
 * @param content - Response content
 * @param structured - Optional structured data
 * @returns Formatted tool response
 */
export const createTextResponse = (
  title: string,
  content: string | Record<string, string>,
  structured?: Record<string, any>
): ToolResponse => {
  const text = typeof content === 'string' ? content : toTextContent(title, content);

  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
    ...(structured && { structuredContent: structured }),
  };
};

/**
 * Validate and sanitize tool arguments
 * @param args - Raw arguments object
 * @param required - List of required argument names
 * @returns Validated arguments
 * @throws Error if required arguments are missing
 */
export const validateArgs = <T extends Record<string, any>>(
  args: unknown,
  required: readonly string[]
): T => {
  if (typeof args !== 'object' || args === null) {
    throw new Error('Arguments must be an object');
  }

  const typedArgs = args as Record<string, any>;

  for (const key of required) {
    if (!(key in typedArgs)) {
      throw new Error(`Missing required argument: ${key}`);
    }
  }

  return typedArgs as T;
};

/**
 * Execute a tool handler with standardized error handling
 * @param handler - Async handler function
 * @returns Tool response or error response
 */
export const executeHandler = async <T>(handler: () => Promise<T>): Promise<T | ErrorResponse> => {
  try {
    return await handler();
  } catch (error) {
    return handleError(error);
  }
};
