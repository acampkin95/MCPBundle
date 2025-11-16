/**
 * Elasticsearch Client
 * Queries Elasticsearch for Suricata IPS alerts, Falco events, and other security logs
 */

import axios, { AxiosInstance } from 'axios';
import type { ElasticsearchAlert, SuricataAlert, FalcoAlert } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class ElasticsearchClient {
  private client: AxiosInstance;
  private readonly baseUrl: string;

  public constructor(config: { url: string; user: string; password: string }) {
    this.baseUrl = config.url;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      auth: {
        username: config.user,
        password: config.password,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Search Elasticsearch with query
   */
  private async search<T>(index: string, query: Record<string, unknown>): Promise<T[]> {
    try {
      const response = await this.client.post(`/${index}/_search`, query);
      const hits = response.data.hits?.hits || [];
      return hits.map((hit: { _source: T }) => hit._source);
    } catch (error) {
      logger.error(`Elasticsearch search failed for index ${index}`, error);
      return [];
    }
  }

  /**
   * Get Suricata IPS alerts
   */
  public async getSuricataAlerts(options?: {
    from?: string;
    to?: string;
    severity?: number[];
    limit?: number;
  }): Promise<SuricataAlert[]> {
    const must: Array<Record<string, unknown>> = [
      { term: { 'event_type': 'alert' } },
    ];

    if (options?.from || options?.to) {
      must.push({
        range: {
          '@timestamp': {
            ...(options.from && { gte: options.from }),
            ...(options.to && { lte: options.to }),
          },
        },
      });
    }

    if (options?.severity && options.severity.length > 0) {
      must.push({
        terms: { 'alert.severity': options.severity },
      });
    }

    const query = {
      size: options?.limit || 100,
      sort: [{ '@timestamp': 'desc' }],
      query: {
        bool: { must },
      },
    };

    return this.search<SuricataAlert>('suricata-*', query);
  }

  /**
   * Get Falco runtime security alerts
   */
  public async getFalcoAlerts(options?: {
    from?: string;
    to?: string;
    priority?: string[];
    limit?: number;
  }): Promise<FalcoAlert[]> {
    const must: Array<Record<string, unknown>> = [];

    if (options?.from || options?.to) {
      must.push({
        range: {
          time: {
            ...(options.from && { gte: options.from }),
            ...(options.to && { lte: options.to }),
          },
        },
      });
    }

    if (options?.priority && options.priority.length > 0) {
      must.push({
        terms: { priority: options.priority },
      });
    }

    const query = {
      size: options?.limit || 100,
      sort: [{ time: 'desc' }],
      query: {
        bool: { must: must.length > 0 ? must : undefined },
      },
    };

    return this.search<FalcoAlert>('falco-*', query);
  }

  /**
   * Get all recent security events across all indices
   */
  public async getRecentSecurityEvents(limit: number = 100): Promise<ElasticsearchAlert[]> {
    const query = {
      size: limit,
      sort: [{ '@timestamp': 'desc' }],
      query: {
        bool: {
          should: [
            { term: { 'event_type': 'alert' } },
            { exists: { field: 'alert' } },
            { exists: { field: 'priority' } },
          ],
          minimum_should_match: 1,
        },
      },
    };

    return this.search<ElasticsearchAlert>('*', query);
  }

  /**
   * Get aggregated alert statistics
   */
  public async getAlertStats(timeRange?: { from: string; to: string }): Promise<{
    total: number;
    by_severity: Record<number, number>;
    by_category: Record<string, number>;
  }> {
    try {
      const must: Array<Record<string, unknown>> = [];

      if (timeRange) {
        must.push({
          range: {
            '@timestamp': {
              gte: timeRange.from,
              lte: timeRange.to,
            },
          },
        });
      }

      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              ...must,
              { term: { 'event_type': 'alert' } },
            ],
          },
        },
        aggs: {
          by_severity: {
            terms: {
              field: 'alert.severity',
              size: 10,
            },
          },
          by_category: {
            terms: {
              field: 'alert.category.keyword',
              size: 20,
            },
          },
        },
      };

      const response = await this.client.post('/suricata-*/_search', query);
      const aggs = response.data.aggregations || {};

      const by_severity: Record<number, number> = {};
      const by_category: Record<string, number> = {};

      if (aggs.by_severity?.buckets) {
        for (const bucket of aggs.by_severity.buckets) {
          by_severity[bucket.key] = bucket.doc_count;
        }
      }

      if (aggs.by_category?.buckets) {
        for (const bucket of aggs.by_category.buckets) {
          by_category[bucket.key] = bucket.doc_count;
        }
      }

      return {
        total: response.data.hits?.total?.value || 0,
        by_severity,
        by_category,
      };
    } catch (error) {
      logger.error('Failed to get alert statistics', error);
      return { total: 0, by_severity: {}, by_category: {} };
    }
  }

  /**
   * Search for specific IP address
   */
  public async searchByIP(ip: string, limit: number = 50): Promise<ElasticsearchAlert[]> {
    const query = {
      size: limit,
      sort: [{ '@timestamp': 'desc' }],
      query: {
        bool: {
          should: [
            { term: { 'src_ip': ip } },
            { term: { 'dest_ip': ip } },
            { term: { 'source.ip': ip } },
            { term: { 'destination.ip': ip } },
          ],
          minimum_should_match: 1,
        },
      },
    };

    return this.search<ElasticsearchAlert>('*', query);
  }

  /**
   * Get top attacked IPs/ports
   */
  public async getTopTargets(limit: number = 10): Promise<{
    ips: Array<{ ip: string; count: number }>;
    ports: Array<{ port: number; count: number }>;
  }> {
    try {
      const query = {
        size: 0,
        query: {
          bool: {
            must: [
              { term: { 'event_type': 'alert' } },
              {
                range: {
                  '@timestamp': {
                    gte: 'now-24h',
                  },
                },
              },
            ],
          },
        },
        aggs: {
          top_dest_ips: {
            terms: {
              field: 'dest_ip',
              size: limit,
            },
          },
          top_dest_ports: {
            terms: {
              field: 'dest_port',
              size: limit,
            },
          },
        },
      };

      const response = await this.client.post('/suricata-*/_search', query);
      const aggs = response.data.aggregations || {};

      const ips = aggs.top_dest_ips?.buckets?.map((b: { key: string; doc_count: number }) => ({
        ip: b.key,
        count: b.doc_count,
      })) || [];

      const ports = aggs.top_dest_ports?.buckets?.map((b: { key: number; doc_count: number }) => ({
        port: b.key,
        count: b.doc_count,
      })) || [];

      return { ips, ports };
    } catch (error) {
      logger.error('Failed to get top targets', error);
      return { ips: [], ports: [] };
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ healthy: boolean; response_time_ms?: number; cluster_status?: string }> {
    const start = Date.now();
    try {
      const response = await this.client.get('/_cluster/health');
      const response_time_ms = Date.now() - start;
      return {
        healthy: response.data.status !== 'red',
        response_time_ms,
        cluster_status: response.data.status,
      };
    } catch (_error) {
      return { healthy: false };
    }
  }
}
