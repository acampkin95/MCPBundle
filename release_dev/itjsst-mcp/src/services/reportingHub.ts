import { randomUUID } from "node:crypto";
import type { StructuredThinkingService, ThoughtMetadata } from "./structuredThinking.js";

export type ReportImportance = ThoughtMetadata["importance"];

export interface ToolReport {
  readonly tool: string;
  readonly summary: string;
  readonly sections?: Record<string, string>;
  readonly stage?: string;
  readonly tags?: readonly string[];
  readonly references?: readonly string[];
  readonly importance?: ReportImportance;
  readonly devOpsCategory?: string;
  readonly debugLayer?: string;
  readonly runtimeStack?: readonly string[];
  readonly executionContext?: string;
}

export interface ReportCaptureResult {
  readonly thoughtId: string;
  readonly stage: string;
  readonly summary: string;
}

export class ReportingHubService {
  public constructor(private readonly structuredThinking: StructuredThinkingService) {}

  public capture(report: ToolReport): ReportCaptureResult {
    const stage = report.stage ?? "analysis";
    const narrative = this.composeNarrative(report);
    const metadata: ThoughtMetadata = {
      source: report.tool,
      tags: report.tags,
      references: report.references,
      importance: report.importance ?? "medium",
      devOpsCategory: report.devOpsCategory,
      debugLayer: report.debugLayer,
      runtimeStack: report.runtimeStack,
      stageLabel: stage,
      nextThoughtNeeded: false,
    };

    const timeline = this.structuredThinking.trackThoughts(
      [
        {
          stage,
          thought: narrative,
          metadata,
        },
      ],
      true,
    );

    const lastRecord = timeline.timeline.at(-1);
    return {
      thoughtId: lastRecord?.id ?? randomUUID(),
      stage,
      summary: report.summary,
    };
  }

  private composeNarrative(report: ToolReport): string {
    const lines: string[] = [];
    lines.push(`[${report.tool}] ${report.summary}`);
    if (report.executionContext) {
      lines.push(`Context: ${report.executionContext}`);
    }

    if (report.sections && Object.keys(report.sections).length) {
      for (const [key, value] of Object.entries(report.sections)) {
        if (!value) {
          continue;
        }
        lines.push(`${key}: ${value}`);
      }
    }

    return lines.join("\n");
  }
}
