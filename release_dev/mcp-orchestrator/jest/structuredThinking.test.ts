import { SQLitePlannerService } from "../src/services/sqlitePlanner.js";
import { StructuredThinkingService } from "../src/services/structuredThinking.js";

describe("StructuredThinkingService", () => {
  let planner: SQLitePlannerService;
  let service: StructuredThinkingService;

  beforeEach(() => {
    planner = new SQLitePlannerService(":memory:");
    service = new StructuredThinkingService(planner);
  });

  it("tracks thoughts and produces a summary", () => {
    const result = service.trackThoughts(
      [
        {
          stage: "problem_definition",
          thought: "Identify upgrade scope",
          metadata: {
            importance: "high",
            tags: ["scope"],
          },
        },
        {
          stage: "analysis",
          thought: "Assess risk mitigations",
          metadata: {
            importance: "medium",
            tags: ["risk"],
          },
        },
      ],
      true,
    );

    expect(result.timeline).toHaveLength(2);
    expect(result.stageTally.analysis).toBe(1);
    expect(result.summary).toContain("Total thoughts: 2");
  });
});
