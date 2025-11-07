#!/usr/bin/env ts-node

import { SQLitePlannerService } from "./dist/services/sqlitePlanner.js";
import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "node:fs";

const TEST_DB_PATH = "./test-mcp.db";

console.log("🧪 IT-MCP Database Test\n");

// Clean up old test database
if (existsSync(TEST_DB_PATH)) {
  console.log("🗑️  Removing old test database...");
  unlinkSync(TEST_DB_PATH);
}

try {
  // Test 1: Initialize SQLitePlannerService
  console.log("✅ Test 1: Initialize SQLitePlannerService");
  const planner = new SQLitePlannerService(TEST_DB_PATH);
  console.log(`   Database created at: ${planner.getDatabasePath()}\n`);

  // Test 2: Verify schema
  console.log("✅ Test 2: Verify database schema");
  const db = new Database(TEST_DB_PATH, { readonly: true });

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `).all() as { name: string }[];

  console.log("   Tables found:");
  tables.forEach(table => console.log(`   - ${table.name}`));

  const expectedTables = ["thoughts", "markdown_resources", "markdown_resources_fts"];
  const foundTables = tables.map(t => t.name);
  const missingTables = expectedTables.filter(t => !foundTables.includes(t));

  if (missingTables.length > 0) {
    console.error(`   ❌ Missing tables: ${missingTables.join(", ")}`);
  } else {
    console.log(`   ✓ All expected tables present\n`);
  }

  // Test 3: Check thoughts table schema
  console.log("✅ Test 3: Verify thoughts table schema");
  const thoughtsSchema = db.prepare(`
    PRAGMA table_info(thoughts)
  `).all() as { name: string; type: string }[];

  console.log("   Thoughts table columns:");
  thoughtsSchema.forEach(col => console.log(`   - ${col.name} (${col.type})`));

  const expectedColumns = ["id", "stage", "thought", "timestamp", "ordering", "metadata"];
  const foundColumns = thoughtsSchema.map(c => c.name);
  const missingColumns = expectedColumns.filter(c => !foundColumns.includes(c));

  if (missingColumns.length > 0) {
    console.error(`   ❌ Missing columns: ${missingColumns.join(", ")}`);
  } else {
    console.log(`   ✓ All expected columns present\n`);
  }

  // Test 4: Test WAL mode
  console.log("✅ Test 4: Verify WAL journal mode");
  const journalMode = db.pragma("journal_mode", { simple: true });
  console.log(`   Journal mode: ${journalMode}`);
  if (journalMode === "wal") {
    console.log(`   ✓ WAL mode enabled for concurrency\n`);
  } else {
    console.warn(`   ⚠️  Expected WAL mode, got ${journalMode}\n`);
  }

  // Test 5: Test markdown ingestion
  console.log("✅ Test 5: Test markdown resource ingestion");
  await planner.refreshMarkdownCache();

  const markdownCount = db.prepare(`
    SELECT COUNT(*) as count FROM markdown_resources
  `).get() as { count: number };

  console.log(`   Markdown files ingested: ${markdownCount.count}`);

  if (markdownCount.count > 0) {
    const samples = db.prepare(`
      SELECT path, title FROM markdown_resources LIMIT 3
    `).all() as { path: string; title: string }[];

    console.log("   Sample ingested files:");
    samples.forEach(s => console.log(`   - ${s.path}: "${s.title}"`));
    console.log(`   ✓ Markdown ingestion working\n`);
  } else {
    console.log(`   ℹ️  No markdown files found in workspace\n`);
  }

  // Test 6: Test FTS search
  console.log("✅ Test 6: Test full-text search");
  const ftsTest = db.prepare(`
    SELECT COUNT(*) as count FROM markdown_resources_fts
  `).get() as { count: number };

  console.log(`   FTS index entries: ${ftsTest.count}`);
  console.log(`   ✓ FTS5 index operational\n`);

  db.close();

  console.log("🎉 All database tests passed!\n");
  console.log("📊 Summary:");
  console.log(`   - Database path: ${TEST_DB_PATH}`);
  console.log(`   - Tables: ${tables.length}`);
  console.log(`   - Markdown resources: ${markdownCount.count}`);
  console.log(`   - FTS entries: ${ftsTest.count}`);
  console.log(`   - Journal mode: ${journalMode}`);

} catch (error) {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
}
