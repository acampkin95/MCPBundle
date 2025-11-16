/**
 * capture_thought Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const Capture_thoughtModule: ToolModule = {
  name: 'capture_thought',
  description: 'capture_thought tool',
  category: 'cognitive',
  tools: [
    {
      name: 'capture_thought',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'capture_thought',
    {
      description:
        'Captures a single thought entry with sequencing metadata, persisting it to the workspace thought history file.',
      inputSchema: {
        thought: z.string().min(1),
        thought_number: z.number().int().min(1),
        total_thoughts: z.number().int().min(1),
        next_thought_needed: z.boolean(),
        stage: z.string().min(1),
        is_revision: z.boolean().optional(),
        revises_thought: z.number().int().min(1).optional(),
        branch_from_thought: z.number().int().min(1).optional(),
        branch_id: z.string().optional(),
        needs_more_thoughts: z.boolean().optional(),
        score: z.number().min(0).max(1).optional(),
        tags: z.array(z.string().min(1)).default([]),
        storagePath: z.string().optional(),
      },
    },
    async ({
      thought,
      thought_number,
      total_thoughts,
      next_thought_needed,
      stage,
      is_revision,
      revises_thought,
      branch_from_thought,
      branch_id,
      needs_more_thoughts,
      score,
      tags,
      storagePath,
    }) => {
      const targetPath = await deps.structuredThinking.ensureStorageFile(storagePath);
      let existingTimeline = await deps.structuredThinking.loadStoredTimeline(targetPath);
      if (existingTimeline.length === 0) {
        const bootstrapped = await deps.structuredThinking.bootstrapFromWorkspace(targetPath);
        if (bootstrapped.length) {
          existingTimeline = bootstrapped;
        }
      }
      const qualityScore = typeof score === 'number' ? Number(score.toFixed(3)) : undefined;
      let importance: ThoughtMetadata['importance'] | undefined;
      if (typeof qualityScore === 'number') {
        if (qualityScore >= 0.75) {
          importance = 'high';
        } else if (qualityScore >= 0.4) {
          importance = 'medium';
        } else {
          importance = 'low';
        }
      }

      const metadata = {
        tags,
        importance,
        thoughtNumber: thought_number,
        totalThoughts: total_thoughts,
        nextThoughtNeeded: next_thought_needed,
        needsMoreThoughts: needs_more_thoughts,
        isRevision: is_revision,
        revisesThought: revises_thought,
        branchFromThought: branch_from_thought,
        branchId: branch_id,
        qualityScore,
        stageLabel: stage,
      } satisfies ThoughtMetadata;

      const record: ThoughtRecord = {
        id: `T${String(thought_number).padStart(3, '0')}`,
        stage,
        order: thought_number,
        thought: thought.trim(),
        timestamp: new Date().toISOString(),
        metadata,
      };

      const updatedTimeline = await deps.structuredThinking.appendThoughtRecord(record, targetPath);
      const normalisedTimeline = deps.structuredThinking.normaliseTimeline(updatedTimeline);
      await deps.structuredThinking.saveStoredTimeline(normalisedTimeline, targetPath);
      const tracking = deps.structuredThinking.summarizeTimeline(normalisedTimeline);

      // Auto-assess thought quality using metacognitive feedback
      const thoughtIndex = normalisedTimeline.findIndex((t) => t.id === record.id);
      const priorThoughts = normalisedTimeline.slice(0, thoughtIndex);
      const assessment = deps.metacognitive.assessThought(record, priorThoughts);

      const sections: Record<string, string> = {
        'Thought captured': thought.trim(),
        Stage: stage,
        Sequence: `${thought_number} of ${total_thoughts}`,
        'Next thought needed': next_thought_needed ? 'Yes' : 'No',
        'Stored at': targetPath,
      };

      // Display automated quality assessment
      const dims = assessment.qualityDimensions;
      sections['Quality Assessment'] = [
        `Overall: ${(assessment.overallScore * 100).toFixed(1)}% (confidence: ${(assessment.confidence * 100).toFixed(1)}%)`,
        `Completeness: ${(dims.completeness * 100).toFixed(0)}% | Specificity: ${(dims.specificity * 100).toFixed(0)}% | Coherence: ${(dims.coherence * 100).toFixed(0)}%`,
        `Novelty: ${(dims.novelty * 100).toFixed(0)}% | Actionability: ${(dims.actionability * 100).toFixed(0)}% | Evidence: ${(dims.evidenceBased * 100).toFixed(0)}%`,
      ].join('\n');

      if (assessment.flags.length > 0) {
        const flagsText = assessment.flags
          .map((f) => `[${f.type.toUpperCase()}] ${f.message}`)
          .join('\n');
        sections['Quality Flags'] = flagsText;
      }

      if (assessment.suggestions.length > 0) {
        const suggestionsText = assessment.suggestions
          .slice(0, 3) // Top 3 suggestions
          .map((s) => `- ${s}`)
          .join('\n');
        sections['Suggestions'] = suggestionsText;
      }

      // Keep legacy score display for backward compatibility
      if (typeof qualityScore === 'number') {
        sections['Legacy Score'] = qualityScore.toString();
      }

      if (branch_id) {
        sections['Branch'] = branch_id;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Thought Capture', sections),
          },
        ],
        structuredContent: {
          record,
          tracking,
          qualityAssessment: assessment,
        },
      };
    }
  );
  },
};
