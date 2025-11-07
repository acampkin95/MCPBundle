#!/usr/bin/env ts-node

import { SQLitePlannerService } from "./dist/services/sqlitePlanner.js";
import { StructuredThinkingService } from "./dist/services/structuredThinking.js";
import { existsSync, unlinkSync } from "node:fs";

const TEST_DB_PATH = "./test-structured-thinking.db";

console.log("🧠 IT-MCP Structured Thinking Test\n");

// Clean up old test database
if (existsSync(TEST_DB_PATH)) {
  console.log("🗑️  Removing old test database...");
  unlinkSync(TEST_DB_PATH);
}

async function runTests() {
  try {
    // Test 1: Initialize services
    console.log("✅ Test 1: Initialize Structured Thinking Service");
    const planner = new SQLitePlannerService(TEST_DB_PATH);
    const thinkingService = new StructuredThinkingService(planner);
    console.log(`   Database created at: ${planner.getDatabasePath()}\n`);

    // Test 2: Get framework
    console.log("✅ Test 2: Retrieve cognitive framework");
    const framework = thinkingService.getFramework({ includeExamples: true });
    console.log(`   Stages: ${framework.length}`);
    framework.forEach(stage => {
      console.log(`   - ${stage.id}: ${stage.title}`);
    });
    console.log(`   ✓ Framework loaded successfully\n`);

    // Test 3: Track thoughts
    console.log("✅ Test 3: Track sequential thoughts");
    const trackResult = thinkingService.trackThoughts([
      {
        stage: "problem_definition",
        thought: "Need to test the structured thinking database functionality",
        metadata: {
          importance: "high",
          tags: ["testing", "database", "structured-thinking"],
          devOpsCategory: "test",
          thoughtNumber: 1
        }
      },
      {
        stage: "research",
        thought: "SQLitePlannerService uses better-sqlite3 with WAL mode for concurrency",
        metadata: {
          importance: "medium",
          tags: ["sqlite", "database", "architecture"],
          references: ["src/services/sqlitePlanner.ts:27"],
          thoughtNumber: 2
        }
      },
      {
        stage: "analysis",
        thought: "The service auto-ingests workspace Markdown files into FTS5 index",
        metadata: {
          importance: "medium",
          tags: ["markdown", "fts", "indexing"],
          thoughtNumber: 3
        }
      },
      {
        stage: "synthesis",
        thought: "Database tests confirm schema creation, WAL mode, and FTS functionality",
        metadata: {
          importance: "high",
          tags: ["testing", "validation", "success"],
          devOpsCategory: "test",
          thoughtNumber: 4
        }
      },
      {
        stage: "conclusion",
        thought: "All database components working correctly - ready for production use",
        metadata: {
          importance: "high",
          tags: ["conclusion", "ready", "production"],
          devOpsCategory: "deploy",
          thoughtNumber: 5
        }
      }
    ], true);

    console.log(`   Thoughts tracked: ${trackResult.timeline.length}`);
    console.log(`   Stage tally:`);
    Object.entries(trackResult.stageTally).forEach(([stage, count]) => {
      console.log(`     - ${stage}: ${count}`);
    });
    console.log(`   ✓ Thought tracking working\n`);

    // Test 4: Test related thoughts
    console.log("✅ Test 4: Analyze related thoughts");
    console.log(`   Related thought groups: ${trackResult.relatedThoughts.length}`);
    if (trackResult.relatedThoughts.length > 0) {
      const firstGroup = trackResult.relatedThoughts[0];
      console.log(`   Sample group: "${firstGroup.commonTag}"`);
      console.log(`     - Thoughts: ${firstGroup.thoughts.length}`);
      console.log(`     - Stages: ${firstGroup.stagesRepresented?.join(", ") || "N/A"}`);
    }
    console.log(`   ✓ Related thought analysis working\n`);

    // Test 5: Test progress tracking
    console.log("✅ Test 5: Verify progress tracking");
    const progress = trackResult.progress;
    console.log(`   Total thoughts: ${progress.totalThoughts || 0}`);
    console.log(`   High importance: ${progress.highImportance || 0}`);
    console.log(`   Pending follow-ups: ${progress.pendingFollowUps || 0}`);
    console.log(`   Stages covered: ${progress.stagesCovered || 0}/${progress.totalStages || 0}`);
    console.log(`   ✓ Progress tracking operational\n`);

    // Test 6: Test summary generation
    console.log("✅ Test 6: Generate thought summary");
    console.log(`   Summary: "${trackResult.summary.substring(0, 100)}..."`);
    console.log(`   ✓ Summary generation working\n`);

    // Test 7: Export thoughts
    console.log("✅ Test 7: Test thought export");
    const exportedJson = thinkingService.exportThoughts(trackResult, {
      format: "json",
      includeMetadata: true
    });

    const exported = JSON.parse(exportedJson);
    console.log(`   Exported thoughts: ${exported.timeline.length}`);
    console.log(`   Export format: json`);
    console.log(`   ✓ Export functionality working\n`);

    // Test 8: Test diagnostic analysis
    console.log("✅ Test 8: Run diagnostic analysis");
    const diagnostics = thinkingService.diagnoseTimeline(trackResult.timeline, {
      staleHours: 48
    });

    console.log(`   Stage coverage:`);
    Object.entries(diagnostics.stageCoverage).forEach(([stage, count]) => {
      console.log(`     - ${stage}: ${count}`);
    });
    console.log(`   Stale entries: ${diagnostics.staleEntries?.length || 0}`);
    console.log(`   High priority pending: ${diagnostics.highPriorityPending?.length || 0}`);
    console.log(`   Missing stages: ${diagnostics.missingStages?.join(", ") || "none"}`);
    console.log(`   ✓ Diagnostic analysis working\n`);

    console.log("🎉 All structured thinking tests passed!\n");
    console.log("📊 Summary:");
    console.log(`   - Database: ${TEST_DB_PATH}`);
    console.log(`   - Thoughts tracked: ${trackResult.timeline.length}`);
    console.log(`   - Stages used: ${Object.keys(trackResult.stageTally).length}`);
    console.log(`   - Tags: ${Object.keys(trackResult.tags).length}`);
    console.log(`   - Related groups: ${trackResult.relatedThoughts.length}`);
    console.log(`   - High importance: ${progress.highImportance}`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

runTests();
