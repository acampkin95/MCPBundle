import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Writable } from 'node:stream';
import type { TransformableInfo } from 'logform';
import type {
  InvestigationSnapshot,
  SecurityEventSnapshot,
  StructuredLogRecord,
} from '../services/autoInvestigationService.js';
import { AutoInvestigationService } from '../services/autoInvestigationService.js';

type LogLevel = StructuredLogRecord['level'];
type LogCategory = StructuredLogRecord['category'];

export interface LogForwarderOptions {
  readonly serviceName: string;
  readonly endpoint?: string;
  readonly token?: string;
  readonly nodeId?: string;
  readonly defaultCategory?: LogCategory;
  readonly autoInvestigator?: AutoInvestigationService;
  readonly maxQueue?: number;
}

interface PendingPayload extends StructuredLogRecord {
  readonly investigation?: InvestigationSnapshot;
  readonly security?: SecurityEventSnapshot;
}

export class LogForwarderStream extends Writable {
  private readonly endpoint?: string;
  private readonly token?: string;
  private readonly serviceName: string;
  private readonly nodeId: string;
  private readonly defaultCategory: LogCategory;
  private readonly autoInvestigator?: AutoInvestigationService;
  private readonly queue: PendingPayload[] = [];
  private flushing = false;
  private readonly maxQueue: number;

  public constructor(options: LogForwarderOptions) {
    super({ objectMode: true });
    this.serviceName = options.serviceName;
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.nodeId = options.nodeId ?? process.env.MCP_NODE_ID ?? os.hostname();
    this.defaultCategory = options.defaultCategory ?? 'application';
    this.autoInvestigator = options.autoInvestigator;
    this.maxQueue = options.maxQueue ?? 200;
  }

  public override _write(
    info: TransformableInfo & { metadata?: Record<string, unknown> },
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    if (!this.endpoint || !this.token) {
      callback();
      return;
    }

    void this.buildPayload(info)
      .then((payload) => {
        if (!payload) {
          return;
        }
        if (this.queue.length >= this.maxQueue) {
          this.queue.shift();
        }
        this.queue.push(payload);
        void this.flush();
      })
      .catch((error) => {
        console.warn('Log forwarding failed to prepare payload', {
          service: this.serviceName,
          error,
        });
      })
      .finally(() => callback());
  }

  private async buildPayload(
    info: TransformableInfo & { metadata?: Record<string, unknown> }
  ): Promise<PendingPayload | null> {
    const message = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
    const metadata = (info.metadata as Record<string, unknown> | undefined) ?? {};
    const tags = this.normalizeTags(metadata.tags);
    const payload: PendingPayload = {
      service: this.serviceName,
      nodeId: this.nodeId,
      level: (info.level as LogLevel) ?? 'info',
      category: (metadata.category as LogCategory | undefined) ?? this.defaultCategory,
      message,
      timestamp: typeof info.timestamp === 'string' ? info.timestamp : new Date().toISOString(),
      stack: typeof info.stack === 'string' ? info.stack : undefined,
      tags,
      metadata: this.cleanMetadata(metadata),
      correlationId:
        typeof metadata.correlationId === 'string' ? metadata.correlationId : undefined,
    };

    if (this.autoInvestigator) {
      try {
        const outcome = await this.autoInvestigator.evaluate(payload);
        if (outcome?.investigation) {
          payload.investigation = outcome.investigation;
        }
        if (outcome?.security) {
          payload.security = outcome.security;
          payload.category = 'security';
          if (!payload.tags.includes('security')) {
            payload.tags = [...payload.tags, 'security'];
          }
        }
      } catch (error) {
        console.warn('Log forwarding auto investigation failed', {
          service: this.serviceName,
          error,
        });
      }
    }

    return payload;
  }

  private cleanMetadata(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!Object.keys(metadata).length) {
      return undefined;
    }
    const clone = { ...metadata };
    delete clone.tags;
    delete clone.category;
    delete clone.correlationId;
    return Object.keys(clone).length ? clone : undefined;
  }

  private normalizeTags(value: unknown): string[] {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value
        .map((tag) => String(tag))
        .filter(Boolean)
        .slice(0, 16);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 16);
    }
    return [];
  }

  private async flush(): Promise<void> {
    if (this.flushing || !this.queue.length) {
      return;
    }

    this.flushing = true;
    const entry = this.queue.shift()!;
    try {
      await fetch(this.endpoint!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ingest-key': this.token!,
        },
        body: JSON.stringify(entry),
        keepalive: false,
      });
    } catch (error) {
      console.warn('Log forwarding request failed', {
        service: this.serviceName,
        error,
      });
      this.queue.unshift(entry);
      await delay(1000);
    } finally {
      this.flushing = false;
      if (this.queue.length) {
        void this.flush();
      }
    }
  }
}
