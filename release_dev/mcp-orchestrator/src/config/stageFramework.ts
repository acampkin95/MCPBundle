import { existsSync, readFileSync } from "node:fs";
import { logger } from "../utils/logger.js";
import type { StageDescriptor } from "../services/structuredThinking.js";

export interface StageTransition {
  readonly from: string;
  readonly to: readonly string[];
  readonly prompt?: string;
}

export interface StageFrameworkHeuristics {
  readonly dwellThresholds?: Record<string, number>;
  readonly rollingWindow?: number;
  readonly repetitionWindow?: number;
  readonly repetitionThreshold?: number;
  readonly qualityDeltaThreshold?: number;
  readonly branchStalenessMinutes?: number;
  readonly branchLowQualityThreshold?: number;
}

export interface StageFrameworkConfig {
  readonly stages: StageDescriptor[];
  readonly transitions?: readonly StageTransition[];
  readonly heuristics?: StageFrameworkHeuristics;
}

const BUILTIN_STAGE_FRAMEWORK: StageFrameworkConfig = {
  stages: [
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
  ],
  transitions: [
    {
      from: "problem_definition",
      to: ["research", "analysis"],
      prompt: "Have you validated constraints and success criteria before diving deeper?",
    },
    {
      from: "research",
      to: ["analysis", "synthesis"],
      prompt: "Is the information sufficient to start evaluating options?",
    },
    {
      from: "analysis",
      to: ["synthesis", "research"],
      prompt: "Does the analysis reveal actionable themes or gaps that need more research?",
    },
    {
      from: "synthesis",
      to: ["conclusion", "analysis"],
      prompt: "Are the proposed options ready for decision making or do they need further analysis?",
    },
    {
      from: "conclusion",
      to: ["problem_definition"],
      prompt: "Capture outcomes and outstanding questions before restarting the cycle.",
    },
  ],
  heuristics: {
    dwellThresholds: {
      problem_definition: 3,
      research: 4,
      analysis: 5,
      synthesis: 4,
      conclusion: 3,
    },
    rollingWindow: 5,
    repetitionWindow: 6,
    repetitionThreshold: 3,
    qualityDeltaThreshold: 0.15,
    branchStalenessMinutes: 60,
    branchLowQualityThreshold: 0.45,
  },
};

const parseExternalConfig = (path: string): StageFrameworkConfig | null => {
  if (!existsSync(path)) {
    logger.warn("Stage framework config path not found, falling back to built-in defaults", { path });
    return null;
  }

  try {
    const contents = readFileSync(path, "utf8");
    const parsed = JSON.parse(contents) as StageFrameworkConfig;
    if (!parsed?.stages?.length) {
      logger.warn("Stage framework config missing stages; using defaults", { path });
      return null;
    }
    return parsed;
  } catch (error) {
    logger.warn("Failed to parse stage framework config; using defaults", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const loadStageFrameworkConfig = (): StageFrameworkConfig => {
  const externalPath = process.env.SERVER_MCP_STAGE_CONFIG;
  if (externalPath) {
    const external = parseExternalConfig(externalPath);
    if (external) {
      return external;
    }
  }
  return BUILTIN_STAGE_FRAMEWORK;
};

export const getBuiltinStageFramework = (): StageFrameworkConfig => BUILTIN_STAGE_FRAMEWORK;
