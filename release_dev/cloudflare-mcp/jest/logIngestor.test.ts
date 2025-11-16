import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LogIngestorService } from '../src/services/logIngestor';

describe('LogIngestorService', () => {
  const tempDirs: string[] = [];
  const createIngestor = () => {
    const workdir = mkdtempSync(path.join(tmpdir(), 'mcp-logs-'));
    tempDirs.push(workdir);
    const ingestor = new LogIngestorService({
      dbPath: path.join(workdir, 'logs.db'),
      retentionDays: 1,
      maxEntries: 1000,
    });

    return { ingestor, workdir };
  };

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists entries and exposes them via queries', () => {
    const { ingestor } = createIngestor();

    const ingestResult = ingestor.ingest({
      service: 'perplexity-mcp',
      nodeId: 'node-a',
      level: 'error',
      category: 'application',
      message: 'primary pipeline failure',
      metadata: { shard: 'alpha' },
      tags: ['pipeline'],
    });

    expect(ingestResult.deduplicated).toBe(false);
    const query = ingestor.query({ service: 'perplexity-mcp', includePayload: true });
    expect(query.entries).toHaveLength(1);
    expect(query.entries[0]).toEqual(
      expect.objectContaining({
        service: 'perplexity-mcp',
        nodeId: 'node-a',
        level: 'error',
        message: 'primary pipeline failure',
        tags: ['pipeline'],
      })
    );
    expect(query.entries[0].investigationStatus).toBe('pending');
  });

  it('deduplicates repeated payloads and increments repeat counters', () => {
    const { ingestor } = createIngestor();
    const payload = {
      service: 'itjsst-mcp',
      nodeId: 'node-b',
      level: 'error' as const,
      category: 'system' as const,
      message: 'PM2 detected crash',
      tags: ['pm2', 'crash'],
      investigation: {
        status: 'auto_repaired' as const,
        notes: 'Process restarted via supervisor',
      },
    };

    const first = ingestor.ingest(payload);
    expect(first.deduplicated).toBe(false);

    const second = ingestor.ingest(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.repeatCount).toBeGreaterThan(1);

    const query = ingestor.query({ service: 'itjsst-mcp' });
    expect(query.entries[0].repeatCount).toBeGreaterThanOrEqual(2);
    expect(query.entries[0].investigationStatus).toBe('auto_repaired');
  });
});
