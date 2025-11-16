import { CircuitBreaker, createTimeoutWrapper } from '@mcp-bundle/resilience';
import { logger } from '../utils/logger.js';
import {
  cloudflareApiRetryConfig,
  cloudflareApiCircuitBreakerConfig,
  timeoutConfig,
} from '../config/resilience.js';

export interface CloudflareDnsServiceOptions {
  readonly apiToken: string;
  readonly accountId: string;
  readonly zoneId: string;
  readonly baseHostname: string;
  readonly defaultTtl: number;
  readonly proxied: boolean;
}

export interface DnsUpsertRequest {
  readonly macAddress: string;
  readonly agentName: string;
  readonly dnsLabel?: string;
  readonly ipAddress: string;
  readonly metadata?: Record<string, unknown>;
  readonly ttl?: number;
  readonly comment?: string;
}

export interface DnsUpdateResult {
  readonly hostname: string;
  readonly recordId: string;
  readonly type: 'A' | 'AAAA';
  readonly changed: boolean;
}

export interface CloudflareDnsRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly content: string;
  readonly ttl: number;
  readonly proxied: boolean;
  readonly comment?: string;
}

interface CloudflareApiResponse<T> {
  readonly success: boolean;
  readonly errors: Array<{ code: number; message: string }>;
  readonly messages: Array<{ code: number; message: string }>;
  readonly result: T;
}

export class CloudflareDnsService {
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';
  private readonly circuitBreaker: CircuitBreaker;

  public constructor(private readonly options: CloudflareDnsServiceOptions) {
    // Initialize circuit breaker with logging callbacks
    this.circuitBreaker = new CircuitBreaker({
      ...cloudflareApiCircuitBreakerConfig,
      onStateChange: (from, to) => {
        logger.warn('Cloudflare API circuit breaker state change', {
          from,
          to,
          timestamp: new Date().toISOString(),
        });
      },
      onOpen: (failureCount) => {
        logger.error('Cloudflare API circuit breaker opened', {
          failureCount,
          message: 'Too many failures, circuit breaker is now open',
        });
      },
      onClose: () => {
        logger.info('Cloudflare API circuit breaker closed', {
          message: 'Circuit breaker recovered and is now closed',
        });
      },
      onHalfOpen: () => {
        logger.info('Cloudflare API circuit breaker half-open', {
          message: 'Circuit breaker attempting to recover',
        });
      },
    });
  }

  /**
   * Get circuit breaker statistics for monitoring
   */
  public getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  public async ensureRecord(request: DnsUpsertRequest): Promise<DnsUpdateResult> {
    const hostname = this.buildHostname(request.dnsLabel ?? request.agentName);
    const recordType: 'A' | 'AAAA' = request.ipAddress.includes(':') ? 'AAAA' : 'A';
    const normalizedComment = request.comment ?? this.buildDefaultComment(request.macAddress);
    const ttl = request.ttl ?? this.clampTtl(this.options.defaultTtl);

    const existing = await this.findRecord(hostname, recordType);

    if (
      existing &&
      existing.content === request.ipAddress &&
      existing.proxied === this.options.proxied &&
      existing.ttl === ttl
    ) {
      logger.debug('DNS record already up-to-date', {
        hostname,
        recordType,
        ip: request.ipAddress,
      });
      return { hostname, recordId: existing.id, type: recordType, changed: false };
    }

    if (existing) {
      const updated = await this.updateRecord(existing.id, {
        type: recordType,
        name: hostname,
        content: request.ipAddress,
        ttl,
        proxied: this.options.proxied,
        comment: normalizedComment,
      });
      logger.info('Updated Cloudflare DNS record', {
        hostname,
        recordId: existing.id,
        ip: request.ipAddress,
        recordType,
      });
      return { hostname, recordId: updated.id, type: recordType, changed: true };
    }

    const created = await this.createRecord({
      type: recordType,
      name: hostname,
      content: request.ipAddress,
      ttl,
      proxied: this.options.proxied,
      comment: normalizedComment,
    });
    logger.info('Created Cloudflare DNS record', {
      hostname,
      recordId: created.id,
      ip: request.ipAddress,
      recordType,
    });
    return { hostname, recordId: created.id, type: recordType, changed: true };
  }

  public async markOffline(hostname: string): Promise<void> {
    const record =
      (await this.findRecord(hostname, 'A')) ?? (await this.findRecord(hostname, 'AAAA'));
    if (!record) {
      return;
    }

    await this.updateRecord(record.id, {
      type: record.type,
      name: hostname,
      content: record.type === 'AAAA' ? '::' : '0.0.0.0',
      ttl: this.clampTtl(this.options.defaultTtl),
      proxied: false,
      comment: `cloudflare-mcp: record paused ${new Date().toISOString()}`,
    });
    logger.warn('Quarantined DNS record', { hostname });
  }

  public async listRecords(filters?: {
    readonly name?: string;
    readonly type?: string;
  }): Promise<CloudflareDnsRecord[]> {
    const searchParams = new URLSearchParams();
    if (filters?.name) {
      searchParams.append('name', filters.name);
    }
    if (filters?.type) {
      searchParams.append('type', filters.type);
    }

    const query = searchParams.toString();
    const path = `/zones/${this.options.zoneId}/dns_records${query ? `?${query}` : ''}`;
    return this.request<CloudflareDnsRecord[]>(path, { method: 'GET' });
  }

  public async deleteRecord(recordId: string): Promise<void> {
    await this.request(`/zones/${this.options.zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
    logger.info('Deleted Cloudflare DNS record', { recordId });
  }

  public resolveHostname(label: string): string {
    return this.buildHostname(label);
  }

  private buildHostname(label: string): string {
    const sanitizedLabel = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    const collapsed = sanitizedLabel.replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');

    if (!collapsed) {
      return this.options.baseHostname;
    }
    return `${collapsed}.${this.options.baseHostname}`;
  }

  private buildDefaultComment(macAddress: string): string {
    return `Managed by cloudflare-mcp (MAC ${macAddress})`;
  }

  private clampTtl(ttl: number): number {
    return Math.min(86_400, Math.max(60, ttl));
  }

  private async findRecord(
    name: string,
    type: 'A' | 'AAAA'
  ): Promise<CloudflareDnsRecord | undefined> {
    const records = await this.listRecords({ name, type });
    return records[0];
  }

  private async createRecord(body: Record<string, unknown>): Promise<CloudflareDnsRecord> {
    const response = await this.request<CloudflareDnsRecord>(
      `/zones/${this.options.zoneId}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    return response;
  }

  private async updateRecord(
    recordId: string,
    body: Record<string, unknown>
  ): Promise<CloudflareDnsRecord> {
    const response = await this.request<CloudflareDnsRecord>(
      `/zones/${this.options.zoneId}/dns_records/${recordId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
    return response;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    // Create a timeout wrapper for Cloudflare API requests
    const withApiTimeout = createTimeoutWrapper(
      timeoutConfig.cloudflareApi,
      `Cloudflare API request to ${path} timed out after ${timeoutConfig.cloudflareApi}ms`
    );

    // Execute request with circuit breaker protection and timeout
    return this.circuitBreaker.execute(async () => {
      return withApiTimeout(async () => {
        const res = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiToken}`,
            'CF-Account-ID': this.options.accountId,
            ...init.headers,
          },
        });

        const data = (await res.json()) as CloudflareApiResponse<T>;
        if (!res.ok || !data.success) {
          const errorMessage =
            data.errors?.map((error) => `${error.code}: ${error.message}`).join(', ') ||
            res.statusText;

          // Enhanced error logging with more context
          logger.error('Cloudflare API request failed', {
            path,
            method: init.method || 'GET',
            status: res.status,
            errorMessage,
            errors: data.errors,
            circuitBreakerState: this.circuitBreaker.getState(),
          });

          // Create error with status code for retry logic
          const error = new Error(`Cloudflare API error: ${errorMessage}`) as Error & {
            statusCode?: number;
          };
          error.statusCode = res.status;
          throw error;
        }
        return data.result;
      });
    });
  }
}
