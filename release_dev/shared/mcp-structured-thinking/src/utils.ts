/**
 * Utility functions for structured thinking
 * @packageDocumentation
 */

import type { ThoughtRecord, ThoughtMetadata } from './types.js';

/**
 * Make readonly object mutable (internal utility)
 */
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

/**
 * Mutable thought record for internal processing
 */
export type MutableThoughtRecord = Mutable<ThoughtRecord>;

/**
 * Default cognitive stages
 */
export const DEFAULT_STAGES = [
  {
    id: 'problem_definition',
    title: 'Problem Definition',
    description:
      'Clarify the goal, constraints, stakeholders, and success criteria. Capture any assumptions and unknowns.',
    guidingQuestions: [
      'What outcome am I trying to achieve?',
      'What constraints or requirements exist?',
      'Who is affected by the problem or solution?',
    ],
    exampleActivities: [
      'State problem in own words',
      'List must-haves vs nice-to-haves',
      'Capture known risks or blockers',
    ],
  },
  {
    id: 'research',
    title: 'Research',
    description:
      'Gather data, context, and precedents. Differentiate between facts, interpretations, and open questions.',
    guidingQuestions: [
      'What information do I already have?',
      'What sources should I consult?',
      'What gaps still remain?',
    ],
    exampleActivities: [
      'Review documentation or specs',
      'Check analytics or logs',
      'Consult subject matter experts',
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis',
    description:
      'Process the collected information, identify patterns, root causes, opportunities, and trade-offs.',
    guidingQuestions: [
      'What patterns or trends emerge?',
      'What frameworks or models help explain the data?',
      'What are the key risks, trade-offs, or dependencies?',
    ],
    exampleActivities: [
      'Create cause/effect chains',
      'Run what-if scenarios',
      'Compare alternative approaches',
    ],
  },
  {
    id: 'synthesis',
    title: 'Synthesis',
    description:
      'Combine insights into actionable strategies or hypotheses. Identify experiments, solutions, or next steps.',
    guidingQuestions: [
      'What solution paths appear viable?',
      'How do we validate or de-risk the approach?',
      'What is the recommended plan of action?',
    ],
    exampleActivities: [
      'Outline decision options',
      'Draft implementation plan',
      'Define success metrics',
    ],
  },
  {
    id: 'conclusion',
    title: 'Conclusion',
    description:
      'Summarise findings, decisions, and next actions. Capture outstanding questions and follow-ups.',
    guidingQuestions: [
      'What did we learn?',
      'What decisions were made?',
      'What are the immediate next steps?',
    ],
    exampleActivities: [
      'Document final recommendations',
      'Assign owners for follow-up tasks',
      'Schedule reviews or retrospectives',
    ],
  },
] as const;

/**
 * Regex for repetition normalization
 */
export const REPETITION_NORMALISATION_REGEX = /[\s\n\r]+/g;

/**
 * Normalize thought text for comparison
 */
export function normalizeThought(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(REPETITION_NORMALISATION_REGEX, ' ')
    .trim();
}

/**
 * Create preview of thought (truncated)
 */
export function previewThought(content: string, length: number = 64): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= length) {
    return trimmed;
  }
  return `${trimmed.slice(0, length - 1)}…`;
}

/**
 * Generate unique thought ID
 */
export function generateThoughtId(order: number): string {
  return `T${String(order).padStart(3, '0')}`;
}

/**
 * Validate thought record
 */
export function validateThoughtRecord(record: ThoughtRecord): boolean {
  if (!record.id || typeof record.id !== 'string') {
    return false;
  }
  if (!record.stage || typeof record.stage !== 'string') {
    return false;
  }
  if (typeof record.order !== 'number' || record.order < 0) {
    return false;
  }
  if (!record.thought || typeof record.thought !== 'string') {
    return false;
  }
  if (!record.timestamp || typeof record.timestamp !== 'string') {
    return false;
  }
  return true;
}

/**
 * Sanitize thought text (remove dangerous content)
 */
export function sanitizeThought(thought: string): string {
  // Remove potential script tags or dangerous HTML
  return thought
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim();
}

/**
 * Deep clone object (for immutability)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Check if timeline is sorted
 */
export function isTimelineSorted(timeline: readonly ThoughtRecord[]): boolean {
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const current = timeline[i];

    if (current.order < prev.order) {
      return false;
    }

    if (current.order === prev.order && current.timestamp.localeCompare(prev.timestamp) < 0) {
      return false;
    }
  }

  return true;
}

/**
 * Merge metadata objects (deep merge)
 */
export function mergeMetadata(
  base: ThoughtMetadata | undefined,
  updates: Partial<ThoughtMetadata> | undefined
): ThoughtMetadata {
  if (!base && !updates) {
    return {};
  }
  if (!base) {
    return updates as ThoughtMetadata;
  }
  if (!updates) {
    return base;
  }

  return {
    ...base,
    ...updates,
    tags: updates.tags ?? base.tags,
    external_refs: updates.external_refs ?? base.external_refs,
    schemaEntities: updates.schemaEntities ?? base.schemaEntities,
    runtimeStack: updates.runtimeStack ?? base.runtimeStack,
  };
}

/**
 * Calculate percentage (safe division)
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

/**
 * Parse ISO timestamp safely
 */
export function parseTimestamp(isoString: string): number {
  const parsed = Date.parse(isoString);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Check if thought is stale
 */
export function isStale(timestamp: string, staleHours: number): boolean {
  const now = Date.now();
  const timestampMs = parseTimestamp(timestamp);
  const staleMs = staleHours * 60 * 60 * 1000;
  return now - timestampMs > staleMs;
}

/**
 * Extract unique values from array
 */
export function unique<T>(array: readonly T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Group array by key function
 */
export function groupBy<T, K extends string | number>(
  array: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  const groups = {} as Record<K, T[]>;

  for (const item of array) {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

/**
 * Sort object keys alphabetically
 */
export function sortObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted = {} as T;
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key as keyof T] = obj[key as keyof T];
  }

  return sorted;
}
