import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Writable } from 'node:stream';
import type { TransformableInfo } from 'logform';
import {
  AutoInvestigationService,
  type AutoInvestigationOutcome,
  type InvestigationSnapshot,
  type SecurityEventSnapshot,
  type StructuredLogRecord,
} from './autoInvestigationService.js';
import { logger } from './logger.js';

type LogLevel = StructuredLogRecord['level'];
type LogCategory = StructuredLogRecord['category'];

type PendingPayload = StructuredLogRecord & {
  readonly investigation?: InvestigationSnapshot;
  readonly security?: SecurityEventSnapshot;
  readonly payloadSize?: { readonly raw: number; readonly compressed: number };
};

export interface LogForwarderOptions {
  readonly serviceName: string;
  readonly endpoint?: string;
  readonly token?: string;
  readonly nodeId?: string;
  readonly defaultCategory?: LogCategory;
  readonly autoInvestigator?: AutoInvestigationService;
  readonly maxQueue?: number;
}

export class LogForwarderStream extends Writable {
  private readonly endpoint: string | undefined;
  private readonly token: string | undefined;
  private readonly serviceName: string;
  private readonly nodeId: string;
  private readonly defaultCategory: LogCategory;
  private readonly autoInvestigator?: AutoInvestigationService;
  private readonly queue: PendingPayload[] = [];
  private flushing = false;
  private readonly maxQueue: number;

  public constructor(options: LogForwarderOptions) {
    super({ objectMode: true });
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.serviceName = options.serviceName;
    this.nodeId = options.nodeId ?? process.env['MCP_NODE_ID'] ?? os.hostname();
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
        logger.warn('Failed to prepare log payload', {
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
    const rawMetadata = (info.metadata as Record<string, unknown> | undefined) ?? {};
    const tags = this.normalizeTags(rawMetadata);
    const timestamp =
      typeof info.timestamp === 'string' ? info.timestamp : new Date().toISOString();
    const stack = typeof info.stack === 'string' ? info.stack : undefined;
    const category =
      typeof rawMetadata['category'] === 'string'
        ? (rawMetadata['category'] as LogCategory)
        : this.defaultCategory;

    const payload: PendingPayload = {
      service: this.serviceName,
      nodeId: this.nodeId,
      level: (info.level as LogLevel) ?? 'info',
      category,
      message,
      timestamp,
      stack,
      tags,
      metadata: this.cleanMetadata(rawMetadata),
      correlationId:
        typeof rawMetadata['correlationId'] === 'string'
          ? (rawMetadata['correlationId'] as string)
          : undefined,
    };

    if (this.autoInvestigator) {
      try {
        const outcome = await this.autoInvestigator.evaluate(payload);
        if (outcome) {
          return this.decorateWithOutcome(payload, outcome);
        }
      } catch (error) {
        logger.warn('Auto investigation failed', {
          service: this.serviceName,
          error,
        });
      }
    }

    return payload;
  }

  private decorateWithOutcome(
    payload: PendingPayload,
    outcome: AutoInvestigationOutcome
  ): PendingPayload {
    let decoratedPayload: PendingPayload = payload;

    if (outcome.investigation) {
      decoratedPayload = {
        ...decoratedPayload,
        investigation: outcome.investigation,
      };
    }

    if (outcome.security) {
      decoratedPayload = {
        ...decoratedPayload,
        security: outcome.security,
        category: 'security',
        tags: this.ensureSecurityTag(decoratedPayload.tags),
      };
    }

    return decoratedPayload;
  }

  private ensureSecurityTag(tags: readonly string[] | undefined): readonly string[] {
    if (!tags || !tags.length) {
      return ['security'] as const;
    }
    if (tags.includes('security')) {
      return tags;
    }
    return [...tags, 'security'] as readonly string[];
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
      logger.warn('Failed forwarding log', {
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

  private cleanMetadata(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
    const clone: Record<string, unknown> = { ...metadata };
    delete clone['tags'];
    delete clone['category'];
    delete clone['correlationId'];
    delete clone['scope'];
    return Object.keys(clone).length ? clone : undefined;
  }

  private normalizeTags(metadata: Record<string, unknown>): string[] {
    const raw = metadata['tags'];
    if (Array.isArray(raw)) {
      return raw
        .map((tag) => String(tag))
        .filter(Boolean)
        .slice(0, 16);
    }
    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 16);
    }
    return [];
  }
}
