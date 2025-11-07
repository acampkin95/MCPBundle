import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { SQLitePlannerService } from "./sqlitePlanner.js";

export type CognitiveStage =
  | "problem_definition"
  | "research"
  | "analysis"
  | "synthesis"
  | "conclusion";

export interface StageDescriptor {
  readonly id: CognitiveStage | string;
  readonly title: string;
  readonly description: string;
  readonly guidingQuestions?: readonly string[];
  readonly exampleActivities?: readonly string[];
}

export interface FrameworkOptions {
  readonly includeExamples?: boolean;
  readonly customStages?: StageDescriptor[];
}

export interface ThoughtMetadata {
  readonly source?: string;
  readonly tags?: readonly string[];
  readonly importance?: "low" | "medium" | "high";
  readonly references?: readonly string[];
  readonly thoughtNumber?: number;
  readonly totalThoughts?: number;
  readonly nextThoughtNeeded?: boolean;
  readonly needsMoreThoughts?: boolean;
  readonly isRevision?: boolean;
  readonly revisesThought?: number;
  readonly branchFromThought?: number;
  readonly branchId?: string;
  readonly qualityScore?: number;
  readonly stageLabel?: string;
  readonly devOpsCategory?: string;
  readonly debugLayer?: string;
  readonly schemaEntities?: readonly string[];
  readonly runtimeStack?: readonly string[];
}

export interface ThoughtEntry {
  readonly stage: string;
  readonly thought: string;
  readonly metadata?: ThoughtMetadata;
}

export interface ThoughtRecord {
  readonly id: string;
  readonly stage: string;
  readonly order: number;
  readonly thought: string;
  readonly timestamp: string;
  readonly metadata?: ThoughtMetadata;
}

export interface ThoughtTrackingResult {
  readonly timeline: ThoughtRecord[];
  readonly stageTally: Record<string, number>;
  readonly tags: Record<string, number>;
  readonly importanceBreakdown: Record<string, number>;
  readonly progress: ProgressSnapshot;
  readonly relatedThoughts: RelatedThoughtGroup[];
  readonly summary: string;
}

export interface SourceSummary {
  readonly source: string;
  readonly count: number;
  readonly stages: readonly string[];
  readonly tags: readonly string[];
  readonly lastRecorded: string;
}

export interface StructuredDiagnostics {
  readonly stageCoverage: Record<string, number>;
  readonly missingStages: readonly string[];
  readonly lastUpdated: string | null;
  readonly staleEntries: ThoughtRecord[];
  readonly highImportancePending: ThoughtRecord[];
  readonly sourceSummaries: readonly SourceSummary[];
  readonly tagCloud: Record<string, number>;
  readonly totalThoughts: number;
}

export interface DiagnosticsOptions {
  readonly staleHours?: number;
}

export interface StructuredReportOptions extends DiagnosticsOptions {
  readonly format: "markdown" | "json";
  readonly includeTimeline?: boolean;
  readonly maxEntries?: number;
}

export interface StructuredReport {
  readonly format: "markdown" | "json";
  readonly content: string;
  readonly diagnostics: StructuredDiagnostics;
  readonly summary: ThoughtTrackingResult;
  readonly timeline?: ThoughtRecord[];
}

export interface RelatedThoughtGroup {
  readonly tag?: string;
  readonly importance?: ThoughtMetadata["importance"];
  readonly stage?: string;
  readonly thoughts: ThoughtRecord[];
}

export interface ProgressSnapshot {
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly percentage: number;
}

export interface ExportOptions {
  readonly format: "json" | "jsonb" | "markdown" | "claude" | "agents";
  readonly includeMetadata?: boolean;
}

export interface ImportPayload {
  readonly format: ExportOptions["format"];
  readonly content: string;
}

const DEFAULT_STAGES: StageDescriptor[] = [
  {
    id: "problem_definition",
    title: "Problem Definition",
    description:
      "Clarify the goal, constraints, stakeholders, and success criteria. Capture any assumptions and unknowns.",
    guidingQuestions: [
      "What outcome am I trying to achieve?",
      "What constraints or requirements exist?",
      "Who is affected by the problem or solution?",
    ],
    exampleActivities: [
      "State problem in own words",
      "List must-haves vs nice-to-haves",
      "Capture known risks or blockers",
    ],
  },
  {
    id: "research",
    title: "Research",
    description:
      "Gather data, context, and precedents. Differentiate between facts, interpretations, and open questions.",
    guidingQuestions: [
      "What information do I already have?",
      "What sources should I consult?",
      "What gaps still remain?",
    ],
    exampleActivities: [
      "Review documentation or specs",
      "Check analytics or logs",
      "Consult subject matter experts",
    ],
  },
  {
    id: "analysis",
    title: "Analysis",
    description:
      "Process the collected information, identify patterns, root causes, opportunities, and trade-offs.",
    guidingQuestions: [
      "What patterns or trends emerge?",
      "What frameworks or models help explain the data?",
      "What are the key risks, trade-offs, or dependencies?",
    ],
    exampleActivities: [
      "Create cause/effect chains",
      "Run what-if scenarios",
      "Compare alternative approaches",
    ],
  },
  {
    id: "synthesis",
    title: "Synthesis",
    description:
      "Combine insights into actionable strategies or hypotheses. Identify experiments, solutions, or next steps.",
    guidingQuestions: [
      "What solution paths appear viable?",
      "How do we validate or de-risk the approach?",
      "What is the recommended plan of action?",
    ],
    exampleActivities: [
      "Outline decision options",
      "Draft implementation plan",
      "Define success metrics",
    ],
  },
  {
    id: "conclusion",
    title: "Conclusion",
    description:
      "Summarise findings, decisions, and next actions. Capture outstanding questions and follow-ups.",
    guidingQuestions: [
      "What did we learn?",
      "What decisions were made?",
      "What are the immediate next steps?",
    ],
    exampleActivities: [
      "Document final recommendations",
      "Assign owners for follow-up tasks",
      "Schedule reviews or retrospectives",
    ],
  },
];

export class StructuredThinkingService {
  private readonly planners = new Map<string, SQLitePlannerService>();
  private readonly defaultDbPath: string;

  public constructor(defaultPlanner: SQLitePlannerService) {
    const defaultPath = this.normaliseStoragePath(defaultPlanner.getDatabasePath());
    this.planners.set(defaultPath, defaultPlanner);
    this.defaultDbPath = defaultPath;
  }

  public getFramework(options: FrameworkOptions = {}): StageDescriptor[] {
    const stages = options.customStages?.length ? options.customStages : DEFAULT_STAGES;
    if (options.includeExamples === false) {
      return stages.map((stage) => ({
        ...stage,
        exampleActivities: undefined,
      }));
    }
    return stages;
  }

  public trackThoughts(entries: ThoughtEntry[], autoNumbering: boolean): ThoughtTrackingResult {
    const planner = this.getPlanner();
    const existing = planner.getTimeline();
    const nextOrder = existing.length;

    const timeline: ThoughtRecord[] = existing.slice();
    entries.forEach((entry, index) => {
      const order = autoNumbering ? nextOrder + index + 1 : entry.metadata?.thoughtNumber ?? nextOrder + index + 1;
      const record: ThoughtRecord = {
        id: `T${String(order).padStart(3, "0")}`,
        stage: entry.stage,
        order,
        thought: entry.thought.trim(),
        timestamp: new Date(Date.now() + index).toISOString(),
        metadata: entry.metadata
          ? {
              ...entry.metadata,
              stageLabel: entry.metadata.stageLabel ?? entry.stage,
              thoughtNumber: order,
              totalThoughts: entry.metadata.totalThoughts ?? nextOrder + entries.length,
            }
          : {
              stageLabel: entry.stage,
              thoughtNumber: order,
              totalThoughts: nextOrder + entries.length,
            },
      };

      timeline.push(record);
    });

    const normalised = this.normaliseTimeline(timeline);
    planner.replaceTimeline(normalised);
    return this.summarizeTimeline(normalised);
  }

  public async ensureStorageFile(storagePath?: string): Promise<string> {
    const planner = this.getPlanner(storagePath);
    try {
      await planner.refreshMarkdownCache();
    } catch {
      // ignore bootstrap failures; user may not have markdown yet
    }
    return planner.getDatabasePath();
  }

  public async bootstrapFromWorkspace(storagePath?: string): Promise<ThoughtRecord[]> {
    const planner = this.getPlanner(storagePath);
    await planner.refreshMarkdownCache();
    return planner.getTimeline();
  }

  public loadStoredTimeline(storagePath?: string): Promise<ThoughtRecord[]> {
    const planner = this.getPlanner(storagePath);
    return Promise.resolve(planner.getTimeline());
  }

  public saveStoredTimeline(timeline: ThoughtRecord[], storagePath?: string): Promise<void> {
    const planner = this.getPlanner(storagePath);
    planner.replaceTimeline(timeline);
    return Promise.resolve();
  }

  public appendThoughtRecord(record: ThoughtRecord, storagePath?: string): Promise<ThoughtRecord[]> {
    const planner = this.getPlanner(storagePath);
    planner.appendThought(record);
    return this.loadStoredTimeline(storagePath);
  }

  public async exportToFile(records: ThoughtTrackingResult, options: ExportOptions, destinationPath: string): Promise<string> {
    const contents = this.exportThoughts(records, options);
    const dir = dirname(destinationPath);

    // Check if directory exists using access, create if not
    try {
      await access(dir, constants.F_OK);
    } catch {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(destinationPath, contents, "utf8");
    return contents;
  }

  public exportThoughts(records: ThoughtTrackingResult, options: ExportOptions): string {
    const includeMetadata = options.includeMetadata !== false;
    switch (options.format) {
      case "json":
        return JSON.stringify(includeMetadata ? records : { timeline: records.timeline }, null, 2);
      case "jsonb":
        return JSON.stringify(
          {
            timeline: records.timeline,
            metadata: includeMetadata
              ? {
                  stageTally: records.stageTally,
                  tags: records.tags,
                  importanceBreakdown: records.importanceBreakdown,
                  progress: records.progress,
                  summary: records.summary,
                }
              : undefined,
          },
          null,
          2,
        );
      case "markdown":
        return this.toMarkdown(records, "Standard");
      case "claude":
        return this.toMarkdown(records, "Claude");
      case "agents":
        return this.toMarkdown(records, "Agents");
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  public importThoughts(payload: ImportPayload): ThoughtTrackingResult {
    switch (payload.format) {
      case "json": {
        const data = JSON.parse(payload.content);
        if (Array.isArray(data?.timeline)) {
          return this.summarizeTimeline(this.normaliseTimeline(data.timeline as ThoughtRecord[]));
        }
        return data as ThoughtTrackingResult;
      }
      case "jsonb": {
        const data = JSON.parse(payload.content) as {
          timeline: ThoughtRecord[];
        };
        return this.summarizeTimeline(this.normaliseTimeline(data.timeline));
      }
      case "markdown":
      case "claude":
      case "agents":
        return this.parseMarkdownTimeline(payload.content);
      default:
        throw new Error(`Unsupported import format: ${payload.format}`);
    }
  }

  public diagnoseTimeline(timeline: ThoughtRecord[], options: DiagnosticsOptions = {}): StructuredDiagnostics {
    const normalised = this.normaliseTimeline(timeline);
    const stageCoverage: Record<string, number> = {};
    const tagCloud: Record<string, number> = {};
    const sourceMap = new Map<
      string,
      { count: number; stages: Set<string>; tags: Set<string>; lastRecorded: string }
    >();

    const staleMs = (options.staleHours ?? 24) * 60 * 60 * 1000;
    const now = Date.now();

    const staleEntries: ThoughtRecord[] = [];
    const highImportancePending: ThoughtRecord[] = [];

    for (const record of normalised) {
      stageCoverage[record.stage] = (stageCoverage[record.stage] ?? 0) + 1;

      const timestampMs = Date.parse(record.timestamp);
      if (!Number.isNaN(timestampMs) && now - timestampMs > staleMs) {
        staleEntries.push(record);
      }

      if (record.metadata?.importance === "high" && record.metadata?.nextThoughtNeeded !== false) {
        highImportancePending.push(record);
      }

      const source = record.metadata?.source ?? "unspecified";
      if (!sourceMap.has(source)) {
        sourceMap.set(source, {
          count: 0,
          stages: new Set<string>(),
          tags: new Set<string>(),
          lastRecorded: record.timestamp,
        });
      }
      const summary = sourceMap.get(source)!;
      summary.count += 1;
      summary.stages.add(record.stage);
      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (tag) {
            summary.tags.add(tag);
            tagCloud[tag] = (tagCloud[tag] ?? 0) + 1;
          }
        }
      }
      if (summary.lastRecorded < record.timestamp) {
        summary.lastRecorded = record.timestamp;
      }
    }

    const frameworkStages = this.getFramework().map((stage) => stage.id);
    const missingStages = frameworkStages.filter((stage) => !stageCoverage[stage]);

    const sourceSummaries: SourceSummary[] = Array.from(sourceMap.entries()).map(([source, info]) => ({
      source,
      count: info.count,
      stages: Array.from(info.stages.values()),
      tags: Array.from(info.tags.values()),
      lastRecorded: info.lastRecorded,
    }));

    const lastUpdated = normalised.length ? normalised[normalised.length - 1].timestamp : null;

    return {
      stageCoverage,
      missingStages,
      lastUpdated,
      staleEntries,
      highImportancePending,
      sourceSummaries,
      tagCloud,
      totalThoughts: normalised.length,
    };
  }

  public generateReport(timeline: ThoughtRecord[], options: StructuredReportOptions): StructuredReport {
    const normalised = this.normaliseTimeline(timeline);
    const diagnostics = this.diagnoseTimeline(normalised, options);
    const summary = this.summarizeTimeline(normalised);

    const includeTimeline = options.includeTimeline ?? false;
    const maxEntries = options.maxEntries ?? normalised.length;
    const subset = includeTimeline ? normalised.slice(-maxEntries) : undefined;
    const generatedAt = new Date().toISOString();

    if (options.format === "json") {
      const jsonPayload = {
        generatedAt,
        diagnostics,
        summary: {
          stageTally: summary.stageTally,
          progress: summary.progress,
          tags: summary.tags,
          importance: summary.importanceBreakdown,
          totalThoughts: summary.timeline.length,
        },
        timeline: subset,
      };
      return {
        format: "json",
        content: JSON.stringify(jsonPayload, null, 2),
        diagnostics,
        summary,
        timeline: subset,
      };
    }

    const lines: string[] = [];
    lines.push(`# Structured Thinking Report`);
    lines.push(`Generated: ${generatedAt}`);
    lines.push("\n## Summary");
    lines.push(`- Total thoughts: ${summary.timeline.length}`);
    lines.push(`- Progress: ${summary.progress.completed}/${summary.progress.total} (${summary.progress.percentage}%)`);
    if (diagnostics.lastUpdated) {
      lines.push(`- Last updated: ${diagnostics.lastUpdated}`);
    }

    lines.push("\n## Stage coverage");
    for (const [stage, count] of Object.entries(diagnostics.stageCoverage)) {
      lines.push(`- ${stage}: ${count}`);
    }
    if (diagnostics.missingStages.length) {
      lines.push("\n## Missing stages");
      diagnostics.missingStages.forEach((stage) => lines.push(`- ${stage}`));
    }

    if (diagnostics.highImportancePending.length) {
      lines.push("\n## High-importance thoughts needing follow-up");
      diagnostics.highImportancePending.forEach((record) =>
        lines.push(`- ${record.id} [${record.stage}] ${record.thought}`),
      );
    }

    if (diagnostics.sourceSummaries.length) {
      lines.push("\n## Source summaries");
      diagnostics.sourceSummaries.forEach((summaryItem) => {
        lines.push(`- ${summaryItem.source}: ${summaryItem.count} entries (last: ${summaryItem.lastRecorded})`);
        if (summaryItem.stages.length) {
          lines.push(`  * Stages: ${summaryItem.stages.join(", ")}`);
        }
        if (summaryItem.tags.length) {
          lines.push(`  * Tags: ${summaryItem.tags.join(", ")}`);
        }
      });
    }

    if (subset) {
      lines.push("\n## Recent timeline");
      subset.forEach((record) => {
        lines.push(`- ${record.id} [${record.stage}] ${record.thought}`);
      });
    }

    return {
      format: "markdown",
      content: lines.join("\n"),
      diagnostics,
      summary,
      timeline: subset,
    };
  }

  public normaliseTimeline(timeline: ThoughtRecord[]): ThoughtRecord[] {
    return timeline
      .slice()
      .sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.timestamp.localeCompare(b.timestamp);
      })
      .map((record, index) => ({
        ...record,
        id: `T${String(index + 1).padStart(3, "0")}`,
        order: index + 1,
        metadata: record.metadata
          ? {
              ...record.metadata,
              thoughtNumber: index + 1,
              totalThoughts: timeline.length,
            }
          : {
              thoughtNumber: index + 1,
              totalThoughts: timeline.length,
            },
      }));
  }

  public summarizeTimeline(timeline: ThoughtRecord[]): ThoughtTrackingResult {
    const stageTally: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const importanceBreakdown: Record<string, number> = {};

    for (const record of timeline) {
      stageTally[record.stage] = (stageTally[record.stage] ?? 0) + 1;

      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (!tag) {
            continue;
          }
          tags[tag] = (tags[tag] ?? 0) + 1;
        }
      }

      if (record.metadata?.importance) {
        importanceBreakdown[record.metadata.importance] =
          (importanceBreakdown[record.metadata.importance] ?? 0) + 1;
      }
    }

    const progress = this.computeProgress(timeline);
    const relatedThoughts = this.findRelatedThoughts(timeline);
    const summary = this.generateSummary(timeline, stageTally, tags, importanceBreakdown);

    return {
      timeline,
      stageTally,
      tags,
      importanceBreakdown,
      progress,
      relatedThoughts,
      summary,
    };
  }

  private computeProgress(timeline: ThoughtRecord[]): ProgressSnapshot {
    const totalFromMetadata = timeline.reduce(
      (max, record) => Math.max(max, record.metadata?.totalThoughts ?? 0),
      0,
    );
    const total = totalFromMetadata > 0 ? totalFromMetadata : timeline.length;

    const completedByNumber = timeline.reduce(
      (max, record) => Math.max(max, record.metadata?.thoughtNumber ?? 0),
      0,
    );
    const completedByFlag = timeline.filter((record) => record.metadata?.nextThoughtNeeded === false).length;
    const completedByImportance = timeline.filter((record) => record.metadata?.importance === "high").length;

    const candidateCompleted = Math.max(completedByNumber, completedByFlag, completedByImportance, 0);
    const boundedCompleted = total > 0 ? Math.min(candidateCompleted, total) : candidateCompleted;
    const remaining = Math.max(total - boundedCompleted, 0);
    const percentage = total === 0 ? 0 : Math.round((boundedCompleted / total) * 100);

    return {
      total,
      completed: boundedCompleted,
      remaining,
      percentage,
    };
  }

  private findRelatedThoughts(timeline: ThoughtRecord[]): RelatedThoughtGroup[] {
    const groups: RelatedThoughtGroup[] = [];

    const byTag = new Map<string, ThoughtRecord[]>();
    const byStage = new Map<string, ThoughtRecord[]>();
    const byImportance = new Map<string, ThoughtRecord[]>();
    const byBranch = new Map<string, ThoughtRecord[]>();
    const byRevision = new Map<number, ThoughtRecord[]>();

    for (const record of timeline) {
      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          if (!tag) {
            continue;
          }
          if (!byTag.has(tag)) {
            byTag.set(tag, []);
          }
          byTag.get(tag)?.push(record);
        }
      }

      if (!byStage.has(record.stage)) {
        byStage.set(record.stage, []);
      }
      byStage.get(record.stage)?.push(record);

      if (record.metadata?.importance) {
        const level = record.metadata.importance;
        if (!byImportance.has(level)) {
          byImportance.set(level, []);
        }
        byImportance.get(level)?.push(record);
      }

      if (record.metadata?.branchId) {
        const branch = record.metadata.branchId;
        if (!byBranch.has(branch)) {
          byBranch.set(branch, []);
        }
        byBranch.get(branch)?.push(record);
      }

      if (typeof record.metadata?.revisesThought === "number") {
        const target = record.metadata.revisesThought;
        if (!byRevision.has(target)) {
          byRevision.set(target, []);
        }
        byRevision.get(target)?.push(record);
      }
    }

    for (const [tag, records] of byTag.entries()) {
      if (records.length > 1) {
        groups.push({ tag, thoughts: records });
      }
    }

    for (const [stage, records] of byStage.entries()) {
      if (records.length > 1) {
        groups.push({ stage, thoughts: records });
      }
    }

    for (const [importance, records] of byImportance.entries()) {
      if (records.length > 1) {
        groups.push({ importance: importance as ThoughtMetadata["importance"], thoughts: records });
      }
    }

    for (const [branchId, records] of byBranch.entries()) {
      if (records.length > 1) {
        groups.push({ tag: `branch:${branchId}`, thoughts: records });
      }
    }

    for (const [revised, records] of byRevision.entries()) {
      if (records.length > 1) {
        groups.push({ tag: `revises:${revised}`, thoughts: records });
      }
    }

    return groups;
  }

  private generateSummary(
    timeline: ThoughtRecord[],
    stageTally: Record<string, number>,
    tags: Record<string, number>,
    importanceBreakdown: Record<string, number>,
  ): string {
    const progress = this.computeProgress(timeline);

    const lines: string[] = [];
    lines.push(`# Structured Thinking Summary`);
    lines.push(`Total thoughts: ${timeline.length}`);
    lines.push(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`);

    if (Object.keys(stageTally).length) {
      lines.push(`\n## Stage Distribution`);
      for (const [stage, count] of Object.entries(stageTally)) {
        lines.push(`- ${stage}: ${count}`);
      }
    }

    if (Object.keys(importanceBreakdown).length) {
      lines.push(`\n## Importance Levels`);
      for (const [level, count] of Object.entries(importanceBreakdown)) {
        lines.push(`- ${level}: ${count}`);
      }
    }

    if (Object.keys(tags).length) {
      lines.push(`\n## Tags`);
      for (const [tag, count] of Object.entries(tags)) {
        lines.push(`- ${tag}: ${count}`);
      }
    }

    lines.push(`\n## Key Thoughts`);
    for (const record of timeline.slice(0, 5)) {
      lines.push(`- ${record.id} [${record.stage}] ${record.thought}`);
    }

    return lines.join("\n");
  }

  private toMarkdown(records: ThoughtTrackingResult, style: "Standard" | "Claude" | "Agents"): string {
    const lines: string[] = [];
    lines.push(`# Thought Timeline (${style})`);
    for (const record of records.timeline) {
      lines.push(
        `- **${record.id}** [${record.stage}] ${record.thought}` +
          (record.metadata?.tags?.length ? ` _(tags: ${record.metadata.tags.join(", ")})_` : ""),
      );
    }

    lines.push("\n## Summary");
    lines.push(records.summary);

    return lines.join("\n");
  }

  private parseMarkdownTimeline(content: string): ThoughtTrackingResult {
    const timeline: ThoughtRecord[] = [];
    const stageTally: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const importanceBreakdown: Record<string, number> = {};

    const timelineRegex = /^- \*\*(?<id>[^*]+)\*\* \[(?<stage>[^\]]+)\] (?<thought>[^_]+)(?: _\(tags: (?<tags>[^)]+)\)_)?$/gm;
    let index = 0;
    let match: RegExpExecArray | null;
    while ((match = timelineRegex.exec(content)) !== null) {
      index += 1;
      const stage = match.groups?.stage ?? "planning";
      const record: ThoughtRecord = {
        id: match.groups?.id?.trim() ?? `T${String(index).padStart(3, "0")}`,
        stage,
        order: index,
        thought: match.groups?.thought?.trim() ?? "",
        timestamp: new Date().toISOString(),
        metadata: match.groups?.tags
          ? {
              tags: match.groups.tags.split(/,\s*/g),
              stageLabel: stage,
              thoughtNumber: index,
            }
          : {
              stageLabel: stage,
              thoughtNumber: index,
            },
      };
      timeline.push(record);
      stageTally[stage] = (stageTally[stage] ?? 0) + 1;
      if (record.metadata?.tags) {
        for (const tag of record.metadata.tags) {
          tags[tag] = (tags[tag] ?? 0) + 1;
        }
      }
    }

    const progress = this.computeProgress(timeline);
    const relatedThoughts = this.findRelatedThoughts(timeline);
    const summary = this.generateSummary(timeline, stageTally, tags, importanceBreakdown);

    return {
      timeline,
      stageTally,
      tags,
      importanceBreakdown,
      progress,
      relatedThoughts,
      summary,
    };
  }

  private getPlanner(storagePath?: string): SQLitePlannerService {
    if (!storagePath) {
      return this.planners.get(this.defaultDbPath)!;
    }

    const resolvedPath = this.normaliseStoragePath(storagePath);
    let planner = this.planners.get(resolvedPath);
    if (!planner) {
      planner = new SQLitePlannerService(resolvedPath);
      this.planners.set(resolvedPath, planner);
    }
    return planner;
  }

  private normaliseStoragePath(storagePath: string): string {
    const trimmed = storagePath.trim();
    if (!trimmed) {
      return this.defaultDbPath;
    }

    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    const absolute = isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);

    if (absolute.endsWith("/") || absolute.endsWith("\\")) {
      return join(absolute, "mcp_plan.db");
    }

    if (!extname(absolute)) {
      return join(absolute, "mcp_plan.db");
    }

    return absolute;
  }
}
