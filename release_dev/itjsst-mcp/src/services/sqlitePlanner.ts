import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, dirname, extname, basename } from "node:path";
import type { ThoughtRecord } from "./structuredThinking.js";

interface MarkdownResource {
  readonly path: string;
  readonly title: string;
  readonly sections: string[];
  readonly tags: string[];
  readonly latestUpdate: string;
  readonly content: string;
}

export class SQLitePlannerService {
  private readonly db: Database.Database;
  private readonly workspaceRoot: string;

  private readonly dbPath: string;

  public constructor(dbPath: string = join(process.cwd(), "mcp_plan.db")) {
    this.workspaceRoot = process.cwd();
    this.ensureParentDirectory(dbPath);
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  public initialize(): void {
    const createThoughts = `
      CREATE TABLE IF NOT EXISTS thoughts (
        id TEXT PRIMARY KEY,
        stage TEXT,
        thought TEXT,
        timestamp TEXT,
        ordering INTEGER,
        metadata TEXT
      )
    `;

    const createMarkdown = `
      CREATE TABLE IF NOT EXISTS markdown_resources (
        path TEXT PRIMARY KEY,
        title TEXT,
        sections TEXT,
        tags TEXT,
        latest_update TEXT,
        content TEXT
      )
    `;

    const createFts = `
      CREATE VIRTUAL TABLE IF NOT EXISTS markdown_resources_fts
      USING fts5(path, title, content, tokenize = 'porter')
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_markdown_tags ON markdown_resources(tags);
      CREATE INDEX IF NOT EXISTS idx_markdown_updated ON markdown_resources(latest_update DESC);
      CREATE INDEX IF NOT EXISTS idx_markdown_title ON markdown_resources(title);
      CREATE INDEX IF NOT EXISTS idx_thoughts_stage ON thoughts(stage);
      CREATE INDEX IF NOT EXISTS idx_thoughts_timestamp ON thoughts(timestamp DESC)
    `;

    this.db.exec([createThoughts, createMarkdown, createFts, createIndexes].join(";"));
  }

  public refreshMarkdownCache(): Promise<void> {
    return this.ingestMarkdownFromWorkspace();
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public async ingestMarkdownFromWorkspace(): Promise<void> {
    const entries = await readdir(this.workspaceRoot);
    const markdownFiles = entries
      .filter((entry) => extname(entry).toLowerCase() === ".md")
      .map((entry) => resolve(this.workspaceRoot, entry));

    const resources: MarkdownResource[] = [];
    for (const file of markdownFiles) {
      try {
        const [content, stats] = await Promise.all([readFile(file, "utf8"), stat(file)]);
        const parsed = this.parseMarkdown(file, content, stats.mtime.toISOString());
        resources.push(parsed);
      } catch {
        // Ignore unreadable markdown files
      }
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO markdown_resources (path, title, sections, tags, latest_update, content)
      VALUES (@path, @title, @sections, @tags, @latest_update, @content)
      ON CONFLICT(path) DO UPDATE SET
        title=excluded.title,
        sections=excluded.sections,
        tags=excluded.tags,
        latest_update=excluded.latest_update,
        content=excluded.content
    `);

    const deleteFts = this.db.prepare(
      "DELETE FROM markdown_resources_fts WHERE rowid = (SELECT rowid FROM markdown_resources WHERE path=@path)",
    );
    const insertFts = this.db.prepare(`
      INSERT INTO markdown_resources_fts(rowid, path, title, content)
      SELECT rowid, @path, @title, @content FROM markdown_resources WHERE path=@path
    `);

    const transaction = this.db.transaction((batch: MarkdownResource[]) => {
      for (const resource of batch) {
        insertStmt.run({
          path: resource.path,
          title: resource.title,
          sections: JSON.stringify(resource.sections),
          tags: JSON.stringify(resource.tags),
          latest_update: resource.latestUpdate,
          content: resource.content,
        });
        deleteFts.run({ path: resource.path });
        insertFts.run({
          path: resource.path,
          title: resource.title,
          content: resource.content,
        });
      }
    });

    transaction(resources);
  }

  public getTimeline(): ThoughtRecord[] {
    const rows = this.db
      .prepare("SELECT id, stage, thought, timestamp, ordering, metadata FROM thoughts ORDER BY ordering ASC")
      .all() as Array<{ id: string; stage: string; thought: string; timestamp: string; ordering: number; metadata: string | null }>;

    return rows.map((row) => ({
      id: row.id,
      stage: row.stage,
      thought: row.thought,
      timestamp: row.timestamp,
      order: row.ordering,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  public replaceTimeline(records: ThoughtRecord[]): void {
    const deleteStmt = this.db.prepare("DELETE FROM thoughts");
    const insertStmt = this.db.prepare(`
      INSERT INTO thoughts(id, stage, thought, timestamp, ordering, metadata)
      VALUES (@id, @stage, @thought, @timestamp, @ordering, @metadata)
    `);

    const tx = this.db.transaction((items: ThoughtRecord[]) => {
      deleteStmt.run();
      for (const record of items) {
        insertStmt.run({
          id: record.id,
          stage: record.stage,
          thought: record.thought,
          timestamp: record.timestamp,
          ordering: record.order,
          metadata: record.metadata ? JSON.stringify(record.metadata) : null,
        });
      }
    });

    tx(records);
  }

  public appendThought(record: ThoughtRecord): void {
    const maxOrderRow = this.db
      .prepare("SELECT MAX(ordering) as maxOrder FROM thoughts")
      .get() as { maxOrder: number | null } | undefined;
    const nextOrder = (maxOrderRow?.maxOrder ?? 0) + 1;
    this.db
      .prepare(
        "INSERT INTO thoughts(id, stage, thought, timestamp, ordering, metadata) VALUES (@id, @stage, @thought, @timestamp, @ordering, @metadata)",
      )
      .run({
        id: record.id,
        stage: record.stage,
        thought: record.thought,
        timestamp: record.timestamp,
        ordering: record.order ?? nextOrder,
        metadata: record.metadata ? JSON.stringify(record.metadata) : null,
      });
  }

  private parseMarkdown(path: string, content: string, latestUpdate: string): MarkdownResource {
    const sections: string[] = [];
    const headingRegex = /^#{1,6}\s+(.*)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(content)) !== null) {
      sections.push(match[1]);
    }

    const title = sections.length > 0 ? sections[0] : basename(path);
    const tags = this.deriveTagsFromContent(content);

    return {
      path,
      title,
      sections,
      tags,
      latestUpdate,
      content,
    };
  }

  private deriveTagsFromContent(content: string): string[] {
    const tags = new Set<string>();
    if (content.match(/devops/i)) {
      tags.add("devops");
    }
    if (content.match(/schema/i)) {
      tags.add("schema");
    }
    if (content.match(/security|mfa|nist|cve/i)) {
      tags.add("security");
    }
    if (content.match(/planning|roadmap/i)) {
      tags.add("planning");
    }
    return Array.from(tags);
  }

  private ensureParentDirectory(path: string): void {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
