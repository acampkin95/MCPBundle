/**
 * Cognitive Tools Module Index
 *
 * Aggregates all structured thinking, metacognition, and planning tools
 */

import type { ToolModule } from '../types.js';
import { StructuredThinkingFrameworkModule } from './structuredThinkingFramework.js';
import { Capture_thoughtModule } from './capture_thought.js';
import { ThoughtTrackerModule } from './thoughtTracker.js';
import { ThoughtSummaryModule } from './thoughtSummary.js';
import { ThoughtExportModule } from './thoughtExport.js';
import { ThoughtImportModule } from './thoughtImport.js';
import { AssessThoughtQualityModule } from './assessThoughtQuality.js';
import { QualityTrendsModule } from './qualityTrends.js';
import { MetacognitiveReportModule } from './metacognitiveReport.js';
import { StructuredDiagnosticsModule } from './structuredDiagnostics.js';
import { StructuredReportModule } from './structuredReport.js';
import { ComplianceAuditModule } from './complianceAudit.js';
import { DevopsTaskPlanModule } from './devopsTaskPlan.js';
import { PlaybookPreviewModule } from './playbookPreview.js';

/**
 * All cognitive tool modules
 */
export const cognitiveModules: readonly ToolModule[] = [
  StructuredThinkingFrameworkModule,
  Capture_thoughtModule,
  ThoughtTrackerModule,
  ThoughtSummaryModule,
  ThoughtExportModule,
  ThoughtImportModule,
  AssessThoughtQualityModule,
  QualityTrendsModule,
  MetacognitiveReportModule,
  StructuredDiagnosticsModule,
  StructuredReportModule,
  ComplianceAuditModule,
  DevopsTaskPlanModule,
  PlaybookPreviewModule,
] as const;

/**
 * Cognitive tools category summary
 */
export const cognitiveToolsSummary = {
  category: 'cognitive' as const,
  moduleCount: cognitiveModules.length,
  tools: cognitiveModules.flatMap((m) => m.tools),
  description: 'Structured thinking, metacognition, and planning tools',
} as const;
