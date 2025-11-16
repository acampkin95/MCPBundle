import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type LogCategory = 'application' | 'system' | 'security' | 'audit';

export interface InvestigationSnapshot {
  readonly status: 'pending' | 'auto_repaired' | 'succeeded' | 'escalated' | 'not_applicable';
  readonly attemptedAt?: string;
  readonly actions?: readonly string[];
  readonly notes?: string;
  readonly remediationId?: string;
}

export interface SecurityEventSnapshot {
  readonly reason: string;
  readonly actor?: string;
  readonly sourceIp?: string;
  readonly severity?: 'low' | 'medium' | 'high' | 'critical';
  readonly blocked?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface StructuredLogRecord {
  readonly service: string;
  readonly nodeId: string;
  readonly level: LogLevel;
  readonly category: LogCategory;
  readonly message: string;
  readonly timestamp?: string;
  readonly stack?: string;
  readonly tags?: readonly string[];
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly metrics?: Record<string, number>;
  readonly investigation?: InvestigationSnapshot;
  readonly security?: SecurityEventSnapshot;
  readonly pm2?: {
    readonly name?: string;
    readonly instanceId?: string | number;
    readonly restartCount?: number;
  };
}

export interface AutoInvestigationOutcome {
  readonly investigation?: InvestigationSnapshot;
  readonly security?: SecurityEventSnapshot;
}

export interface AutoInvestigationOptions {
  readonly serviceName: string;
  readonly pm2ProcessName?: string;
  readonly cooldownMs?: number;
}

const SECURITY_KEYWORDS = [
  'unauthorized',
  'forbidden',
  'denied',
  'invalid credentials',
  'failed login',
  'token mismatch',
];

const PM2_KEYWORDS = ['pm2', 'crash', 'exit code', 'unstable', 'out of memory'];

export class AutoInvestigationService {
  private readonly pm2ProcessName: string | undefined;
  private readonly cooldownMs: number;
  private readonly lastFingerprint = new Map<string, number>();

  public constructor(private readonly options: AutoInvestigationOptions) {
    this.pm2ProcessName = options.pm2ProcessName;
    this.cooldownMs = options.cooldownMs ?? 60_000;
  }

  public async evaluate(
    payload: StructuredLogRecord
  ): Promise<AutoInvestigationOutcome | undefined> {
    if (!this.shouldInvestigate(payload)) {
      return undefined;
    }

    const fingerprint = this.buildFingerprint(payload);
    const now = Date.now();
    const lastRun = this.lastFingerprint.get(fingerprint);
    if (lastRun && now - lastRun < this.cooldownMs) {
      return {
        investigation: {
          status: 'not_applicable',
          attemptedAt: new Date(now).toISOString(),
          notes: 'Investigation recently executed for this signature',
        },
      };
    }
    this.lastFingerprint.set(fingerprint, now);

    if (this.isSecurityEvent(payload)) {
      return this.handleSecurityEvent(payload);
    }

    if (this.pm2ProcessName && this.looksLikePm2Failure(payload)) {
      return this.restartPm2();
    }

    return {
      investigation: {
        status: 'succeeded',
        attemptedAt: new Date(now).toISOString(),
        notes: 'Captured telemetry for follow-up',
      },
    };
  }

  private shouldInvestigate(payload: StructuredLogRecord): boolean {
    return payload.level === 'error' || payload.level === 'fatal';
  }

  private looksLikePm2Failure(payload: StructuredLogRecord): boolean {
    const haystack = `${payload.message} ${payload.stack ?? ''}`.toLowerCase();
    return PM2_KEYWORDS.some((keyword) => haystack.includes(keyword));
  }

  private isSecurityEvent(payload: StructuredLogRecord): boolean {
    const metadataDetails =
      typeof payload.metadata?.['details'] === 'string'
        ? (payload.metadata['details'] as string)
        : '';
    const haystack = `${payload.message} ${metadataDetails}`.toLowerCase();
    const hasKeyword = SECURITY_KEYWORDS.some((keyword) => haystack.includes(keyword));
    const tagHit = (payload.tags ?? []).some((tag) => tag.toLowerCase().includes('security'));
    return hasKeyword || tagHit || Boolean(payload.metadata?.['securityEvent']);
  }

  private async restartPm2(): Promise<AutoInvestigationOutcome> {
    if (!this.pm2ProcessName) {
      return {
        investigation: {
          status: 'not_applicable',
          attemptedAt: new Date().toISOString(),
          notes: 'PM2 process name not configured',
        },
      };
    }

    const attemptedAt = new Date().toISOString();
    try {
      await execFileAsync('pm2', ['restart', this.pm2ProcessName], { timeout: 15_000 });
      return {
        investigation: {
          status: 'auto_repaired',
          attemptedAt,
          actions: [`pm2 restart ${this.pm2ProcessName}`],
          notes: `Restarted ${this.pm2ProcessName} after crash signature`,
        },
      };
    } catch (error) {
      return {
        investigation: {
          status: 'escalated',
          attemptedAt,
          actions: [
            `pm2 logs ${this.pm2ProcessName} --lines 50`,
            `pm2 describe ${this.pm2ProcessName}`,
          ],
          notes: `PM2 restart failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  private handleSecurityEvent(payload: StructuredLogRecord): AutoInvestigationOutcome {
    const attemptedAt = new Date().toISOString();
    const actor = this.extractActor(payload) ?? 'unknown';
    const sourceIp = this.extractSourceIp(payload) ?? 'unknown';
    return {
      security: {
        reason: payload.message.slice(0, 512),
        actor,
        sourceIp,
        severity: 'high',
        blocked: false,
        metadata: payload.metadata,
      },
      investigation: {
        status: 'escalated',
        attemptedAt,
        actions: ['lock-actor', 'rotate-credentials', 'notify-soc'],
        notes: `Security heuristics flagged ${actor}`,
      },
    };
  }

  private extractActor(payload: StructuredLogRecord): string | undefined {
    const metadata = payload.metadata ?? {};
    if (typeof metadata['actor'] === 'string') {
      return metadata['actor'] as string;
    }
    if (typeof metadata['username'] === 'string') {
      return metadata['username'] as string;
    }
    return undefined;
  }

  private extractSourceIp(payload: StructuredLogRecord): string | undefined {
    const metadata = payload.metadata ?? {};
    if (typeof metadata['ip'] === 'string') {
      return metadata['ip'] as string;
    }
    if (typeof metadata['sourceIp'] === 'string') {
      return metadata['sourceIp'] as string;
    }
    return undefined;
  }

  private buildFingerprint(payload: StructuredLogRecord): string {
    return createHash('sha1')
      .update(this.options.serviceName)
      .update(payload.message)
      .update(payload.level)
      .digest('hex');
  }
}
