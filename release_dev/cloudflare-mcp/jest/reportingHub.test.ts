import { ReportingHubService } from '../src/services/reportingHub.js';
import { StructuredThinkingService } from '../src/services/structuredThinking.js';
import { SQLitePlannerService } from '../src/services/sqlitePlanner.js';

describe('ReportingHubService', () => {
  let planner: SQLitePlannerService;
  let structured: StructuredThinkingService;
  let reporting: ReportingHubService;

  beforeEach(() => {
    planner = new SQLitePlannerService(':memory:');
    structured = new StructuredThinkingService(planner);
    reporting = new ReportingHubService(structured);
  });

  it('captures reports into the structured thinking timeline', () => {
    const result = reporting.capture({
      tool: 'test-tool',
      summary: 'Simulated diagnostics completed',
      sections: {
        detail: 'All systems nominal',
      },
      stage: 'analysis',
      tags: ['test', 'diagnostics'],
      importance: 'medium',
    });

    expect(result.stage).toBe('analysis');
    expect(result.summary).toBe('Simulated diagnostics completed');

    const timeline = structured.getTimeline();
    expect(timeline).toHaveLength(1);
    const entry = timeline[0];
    expect(entry.metadata?.source).toBe('test-tool');
    expect(entry.metadata?.tags).toContain('diagnostics');
  });
});
