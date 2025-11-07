import type { ThoughtRecord } from "./structuredThinking.js";

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked" | "on_hold";

export interface TaskNode {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly parallelGroup?: string;
  readonly dependencies?: readonly string[];
  readonly notes?: readonly string[];
  readonly tags?: readonly string[];
  readonly owners?: readonly string[];
  readonly estimateHours?: number;
  readonly externalRefs?: readonly { system: "linear" | "notion" | string; id: string }[];
}

export interface DevOpsTask extends TaskNode {
  readonly category: "build" | "test" | "deploy" | "debug" | "schema" | "report" | "ops";
  readonly checklist?: readonly string[];
  readonly artifacts?: readonly string[];
  readonly ciStage?: string;
}

export interface DebugTrack {
  readonly id: string;
  readonly title: string;
  readonly hypothesis?: string;
  readonly tasks: DevOpsTask[];
  readonly status: TaskStatus;
}

export interface CiStage {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly tasks: DevOpsTask[];
}

export interface TaskDecompositionResult {
  readonly rootTask: string;
  readonly tasks: DevOpsTask[];
  readonly parallelTracks: Record<string, DevOpsTask[]>;
  readonly criticalPath: string[];
  readonly ciPipeline: CiStage[];
  readonly debugTracks: DebugTrack[];
  readonly summary: string;
}

export interface TaskDecompositionInput {
  readonly goal: string;
  readonly context?: string;
  readonly assumptions?: readonly string[];
  readonly constraints?: readonly string[];
  readonly stages?: readonly string[];
  readonly thoughts?: ThoughtRecord[];
  readonly maxDepth?: number;
}

export class TaskDecompositionService {
  public constructor(private readonly defaultOwner: string | undefined = undefined) {}

  public buildDecomposition(input: TaskDecompositionInput): TaskDecompositionResult {
    const stages = input.stages && input.stages.length > 0
      ? input.stages
      : [
          "Understand requirements",
          "Design solution",
          "Implement",
          "Validate",
        ];

    const tasks: DevOpsTask[] = [];
    const parallelTracks: Record<string, DevOpsTask[]> = {};
    const criticalPath: string[] = [];
    const debugTracks: DebugTrack[] = [];

    stages.forEach((stage, index) => {
      const id = `S${index + 1}`;
      const groupId = `phase-${index + 1}`;
      const stageTask: DevOpsTask = {
        id,
        title: stage,
        description: this.describeStage(stage, input),
        parallelGroup: groupId,
        dependencies: index === 0 ? [] : [`S${index}`],
        category: this.inferCategoryFromStage(stage),
      };

      tasks.push(stageTask);
      criticalPath.push(id);

      if (!parallelTracks[groupId]) {
        parallelTracks[groupId] = [];
      }

      const parallelSubtasks = this.parallelActivitiesForStage(stage, input);
      parallelSubtasks.forEach((task, subIndex) => {
        const childId = `${id}.${subIndex + 1}`;
        const childTask: DevOpsTask = {
          id: childId,
          title: task.title,
          description: task.description,
          parallelGroup: stageTask.parallelGroup,
          dependencies: [id, ...(task.dependencies ?? [])],
          notes: task.notes,
          checklist: task.checklist,
          artifacts: task.artifacts,
          category: task.category ?? stageTask.category,
          ciStage: task.ciStage ?? stageTask.parallelGroup,
        };
        tasks.push(childTask);
        parallelTracks[groupId].push(childTask);
      });
    });

    if (input.thoughts?.length) {
      const enriched = this.enrichTasksFromThoughts(tasks, input.thoughts);
      enriched.debugTracks.forEach((track) => debugTracks.push(track));
    }

    const ciPipeline = this.buildCiPipeline(tasks);

    const summaryLines = [
      `Goal: ${input.goal}`,
      stages.map((stage, index) => `Phase ${index + 1}: ${stage}`).join(" -> "),
    ];

    if (input.assumptions?.length) {
      summaryLines.push(`Assumptions: ${input.assumptions.join(", ")}`);
    }
    if (input.constraints?.length) {
      summaryLines.push(`Constraints: ${input.constraints.join(", ")}`);
    }

    return {
      rootTask: input.goal,
      tasks,
      parallelTracks,
      criticalPath,
      ciPipeline,
      debugTracks,
      summary: summaryLines.join("\n"),
    };
  }

  private describeStage(stage: string, input: TaskDecompositionInput): string {
    const base = `Stage: ${stage}`;
    if (input.context) {
      return `${base}\nContext: ${input.context}`;
    }
    return base;
  }

  private parallelActivitiesForStage(
    stage: string,
    input: TaskDecompositionInput,
  ): Array<{
    title: string;
    description?: string;
    dependencies?: string[];
    notes?: string[];
    checklist?: string[];
    artifacts?: string[];
    category?: DevOpsTask["category"];
    ciStage?: string;
  }> {
    const activities: Array<{
      title: string;
      description?: string;
      dependencies?: string[];
      notes?: string[];
      checklist?: string[];
      artifacts?: string[];
      category?: DevOpsTask["category"];
      ciStage?: string;
    }> = [];

    const lower = stage.toLowerCase();
    if (lower.includes("understand")) {
      activities.push(
        {
          title: "Clarify success criteria",
          description: "Interview stakeholders or review project brief to nail down success metrics.",
          category: "report",
          checklist: ["Collect success metrics", "Document owner expectations"],
        },
        {
          title: "Identify risks",
          description: "List potential blockers and unknowns to track during execution.",
          category: "debug",
          checklist: ["Threat model critical flows", "Add mitigation plan"],
        },
      );
    } else if (lower.includes("design")) {
      activities.push(
        {
          title: "Draft architecture options",
          description: "Sketch at least two viable approaches and compare trade-offs.",
          category: "build",
          artifacts: ["architecture-options.md"],
        },
        {
          title: "Review with peers",
          description: "Run an asynchronous review or live walkthrough to validate the approach.",
          category: "report",
          checklist: ["Collect feedback", "Document decisions"],
        },
      );
    } else if (lower.includes("implement")) {
      activities.push(
        {
          title: "Parallel workstreams",
          description: "Assign separate owners to independent subcomponents to maximise throughput.",
          category: "build",
          ciStage: "build",
        },
        {
          title: "Set up observability",
          description: "Ensure logging/metrics are in place to support debugging during this phase.",
          category: "ops",
          checklist: ["Provision dashboards", "Define alert thresholds"],
        },
      );
    } else if (lower.includes("validate")) {
      activities.push(
        {
          title: "Regression testing",
          description: "Run automated suites plus targeted exploratory testing.",
          category: "test",
          ciStage: "test",
        },
        {
          title: "Rollback plan",
          description: "Document contingency steps in case issues surface post-deploy.",
          category: "deploy",
          checklist: ["Write rollback runbook", "Test recovery scripts"],
        },
      );
    }

    if (input.assumptions?.length) {
      activities.push({
        title: "Validate assumptions",
        description: `Confirm assumptions hold: ${input.assumptions.join(", ")}`,
        category: "report",
        checklist: ["Check assumption status"],
      });
    }

    return activities;
  }

  private inferCategoryFromStage(stage: string): DevOpsTask["category"] {
    const lower = stage.toLowerCase();
    if (lower.includes("design")) {
      return "build";
    }
    if (lower.includes("implement")) {
      return "build";
    }
    if (lower.includes("validate")) {
      return "test";
    }
    if (lower.includes("deploy")) {
      return "deploy";
    }
    if (lower.includes("debug")) {
      return "debug";
    }
    return "ops";
  }

  private enrichTasksFromThoughts(
    tasks: DevOpsTask[],
    thoughts: ThoughtRecord[],
  ): { debugTracks: DebugTrack[] } {
    const debugTracks: DebugTrack[] = [];
    const taskMap = new Map<string, DevOpsTask>(tasks.map((task) => [task.id, task]));

    const stageBuckets = new Map<string, DevOpsTask[]>();
    tasks.forEach((task) => {
      if (!stageBuckets.has(task.parallelGroup ?? "root")) {
        stageBuckets.set(task.parallelGroup ?? "root", []);
      }
      stageBuckets.get(task.parallelGroup ?? "root")?.push(task);
    });

    const branchGroups = new Map<string, ThoughtRecord[]>();
    for (const thought of thoughts) {
      if (thought.metadata?.branchId) {
        const branch = thought.metadata.branchId;
        if (!branchGroups.has(branch)) {
          branchGroups.set(branch, []);
        }
        branchGroups.get(branch)?.push(thought);
      }
    }

    for (const [branchId, branchThoughts] of branchGroups.entries()) {
      const trackTasks: DevOpsTask[] = branchThoughts.map((thought, index) => ({
        id: `${branchId}-${index + 1}`,
        title: thought.thought,
        description: thought.metadata?.references?.join("\n"),
        category: this.mapTagsToCategory(thought.metadata?.tags ?? []) ?? "debug",
        checklist: thought.metadata?.tags,
        notes: thought.metadata?.references,
        parallelGroup: thought.stage,
        status: thought.metadata?.nextThoughtNeeded ? "in_progress" : "completed",
        ciStage: this.mapTagsToCiStage(thought.metadata?.tags ?? []) ?? "debug",
      }));

      debugTracks.push({
        id: branchId,
        title: branchThoughts[0].stage,
        hypothesis: branchThoughts[0].metadata?.references?.join(", "),
        tasks: trackTasks,
        status: trackTasks.every((task) => task.status === "completed") ? "completed" : "in_progress",
      });
    }

    thoughts.forEach((thought) => {
      const category = this.mapTagsToCategory(thought.metadata?.tags ?? []);
      const ciStage = this.mapTagsToCiStage(thought.metadata?.tags ?? []);
      const stageBucket = stageBuckets.get(`phase-${thought.metadata?.thoughtNumber ?? 0}`);
      const fallbackTask = stageBucket?.[0];
      const targetTask = fallbackTask ? taskMap.get(fallbackTask.id) : undefined;

      if (targetTask) {
        const notes = [...(targetTask.notes ?? []), thought.thought];
        const tags = [...(targetTask.tags ?? []), ...(thought.metadata?.tags ?? [])];
        const checklist = [...(targetTask.checklist ?? []), ...(thought.metadata?.references ?? [])];
        Object.assign(targetTask, {
          notes,
          tags,
          checklist,
          category: category ?? targetTask.category ?? "ops",
          ciStage: ciStage ?? targetTask.ciStage,
        });
      } else {
        const fallbackStage = thought.stage;
        const syntheticTask: DevOpsTask = {
          id: `T-${taskMap.size + 1}`,
          title: thought.thought,
          description: thought.metadata?.references?.join("\n"),
          category: category ?? "ops",
          checklist: thought.metadata?.references,
          notes: thought.metadata?.tags,
          parallelGroup: fallbackStage,
          status: thought.metadata?.nextThoughtNeeded ? "in_progress" : "completed",
          ciStage: ciStage ?? fallbackStage,
        };
        tasks.push(syntheticTask);
        taskMap.set(syntheticTask.id, syntheticTask);
      }
    });

    return { debugTracks };
  }

  private mapTagsToCategory(tags: readonly string[]): DevOpsTask["category"] | undefined {
    const lowerTags = tags.map((tag) => tag.toLowerCase());
    if (lowerTags.some((tag) => tag.includes("deploy") || tag.includes("pipeline"))) {
      return "deploy";
    }
    if (lowerTags.some((tag) => tag.includes("test") || tag.includes("qa"))) {
      return "test";
    }
    if (lowerTags.some((tag) => tag.includes("schema") || tag.includes("database"))) {
      return "schema";
    }
    if (lowerTags.some((tag) => tag.includes("debug") || tag.includes("incident"))) {
      return "debug";
    }
    if (lowerTags.some((tag) => tag.includes("report") || tag.includes("status"))) {
      return "report";
    }
    if (lowerTags.some((tag) => tag.includes("build") || tag.includes("compile"))) {
      return "build";
    }
    if (lowerTags.some((tag) => tag.includes("ops") || tag.includes("infra"))) {
      return "ops";
    }
    return undefined;
  }

  private mapTagsToCiStage(tags: readonly string[]): string | undefined {
    const lowerTags = tags.map((tag) => tag.toLowerCase());
    if (lowerTags.some((tag) => tag.includes("build"))) {
      return "build";
    }
    if (lowerTags.some((tag) => tag.includes("test"))) {
      return "test";
    }
    if (lowerTags.some((tag) => tag.includes("deploy"))) {
      return "deploy";
    }
    return undefined;
  }

  private buildCiPipeline(tasks: DevOpsTask[]): CiStage[] {
    const stages = new Map<string, CiStage>();
    const stageOrder = ["build", "test", "deploy", "ops", "report"];

    tasks.forEach((task) => {
      const stageName = task.ciStage ?? task.parallelGroup ?? task.category;
      if (!stageName) {
        return;
      }
      if (!stages.has(stageName)) {
        stages.set(stageName, {
          id: stageName,
          name: stageName,
          tasks: [],
        });
      }
      stages.get(stageName)?.tasks.push(task);
    });

    const sorted = Array.from(stages.values()).sort((a, b) => {
      const aIndex = stageOrder.indexOf(a.id);
      const bIndex = stageOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) {
        return a.id.localeCompare(b.id);
      }
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }
      return aIndex - bIndex;
    });

    return sorted.map((stage) => ({
      ...stage,
      description: `Tasks for ${stage.name}`,
    }));
  }

  public prepareLinearPayload(tasks: DevOpsTask[]): unknown {
    return {
      nodes: tasks.map((task) => ({
        title: task.title,
        description: task.description,
        status: task.status ?? "pending",
        labels: task.tags ?? [],
        estimate: task.estimateHours,
        owner: task.owners?.[0] ?? this.defaultOwner,
      })),
    };
  }

  public prepareNotionPayload(tasks: DevOpsTask[]): unknown {
    return tasks.map((task) => ({
      Name: task.title,
      Status: task.status ?? "pending",
      Tags: task.tags ?? [],
      Notes: task.notes ?? [],
    }));
  }
}
