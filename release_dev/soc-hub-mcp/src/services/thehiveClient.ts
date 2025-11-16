/**
 * TheHive Client
 * Manages incident response cases and alerts in TheHive platform
 */

import axios, { AxiosInstance } from 'axios';
import type { TheHiveCase, TheHiveAlert } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class TheHiveClient {
  private client: AxiosInstance;
  private readonly baseUrl: string;

  public constructor(config: { url: string; api_key: string }) {
    this.baseUrl = config.url;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get all cases
   */
  public async getCases(filter?: {
    status?: string[];
    severity?: number[];
    limit?: number;
  }): Promise<TheHiveCase[]> {
    try {
      const queryAnd: unknown[] = [];

      if (filter?.status && filter.status.length > 0) {
        queryAnd.push({
          _in: {
            _field: 'status',
            _values: filter.status,
          },
        });
      }

      if (filter?.severity && filter.severity.length > 0) {
        queryAnd.push({
          _in: {
            _field: 'severity',
            _values: filter.severity,
          },
        });
      }

      const query: Record<string, unknown> = queryAnd.length > 0 ? {
        query: {
          _and: queryAnd,
        },
      } : {};

      const response = await this.client.post('/api/case/_search', {
        ...query,
        range: `0-${filter?.limit || 100}`,
        sort: ['-startDate'],
      });

      return response.data || [];
    } catch (error) {
      logger.error('Failed to fetch TheHive cases', error);
      return [];
    }
  }

  /**
   * Get open cases
   */
  public async getOpenCases(limit: number = 50): Promise<TheHiveCase[]> {
    return this.getCases({
      status: ['Open'],
      limit,
    });
  }

  /**
   * Get critical cases (severity >= 3)
   */
  public async getCriticalCases(limit: number = 20): Promise<TheHiveCase[]> {
    return this.getCases({
      status: ['Open'],
      severity: [3, 4],
      limit,
    });
  }

  /**
   * Get case by ID
   */
  public async getCase(caseId: string): Promise<TheHiveCase | null> {
    try {
      const response = await this.client.get(`/api/case/${caseId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch case ${caseId}`, error);
      return null;
    }
  }

  /**
   * Create a new case
   */
  public async createCase(caseData: {
    title: string;
    description: string;
    severity: number;
    tags?: string[];
    tlp?: number;
  }): Promise<TheHiveCase | null> {
    try {
      const response = await this.client.post('/api/case', {
        title: caseData.title,
        description: caseData.description,
        severity: caseData.severity,
        tags: caseData.tags || [],
        tlp: caseData.tlp ?? 2,
        flag: false,
        startDate: Date.now(),
      });
      logger.info(`Created TheHive case: ${caseData.title}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create TheHive case', error);
      return null;
    }
  }

  /**
   * Update case
   */
  public async updateCase(caseId: string, updates: Partial<TheHiveCase>): Promise<boolean> {
    try {
      await this.client.patch(`/api/case/${caseId}`, updates);
      logger.info(`Updated TheHive case ${caseId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update case ${caseId}`, error);
      return false;
    }
  }

  /**
   * Close a case
   */
  public async closeCase(caseId: string, resolution?: string): Promise<boolean> {
    return this.updateCase(caseId, {
      status: 'Resolved',
      endDate: Date.now(),
      ...(resolution && { description: resolution }),
    } as Partial<TheHiveCase>);
  }

  /**
   * Get all alerts
   */
  public async getAlerts(filter?: {
    status?: string[];
    severity?: number[];
    limit?: number;
  }): Promise<TheHiveAlert[]> {
    try {
      const queryAnd: unknown[] = [];

      if (filter?.status && filter.status.length > 0) {
        queryAnd.push({
          _in: {
            _field: 'status',
            _values: filter.status,
          },
        });
      }

      if (filter?.severity && filter.severity.length > 0) {
        queryAnd.push({
          _in: {
            _field: 'severity',
            _values: filter.severity,
          },
        });
      }

      const query: Record<string, unknown> = queryAnd.length > 0 ? {
        query: {
          _and: queryAnd,
        },
      } : {};

      const response = await this.client.post('/api/alert/_search', {
        ...query,
        range: `0-${filter?.limit || 100}`,
        sort: ['-date'],
      });

      return response.data || [];
    } catch (error) {
      logger.error('Failed to fetch TheHive alerts', error);
      return [];
    }
  }

  /**
   * Get new/unprocessed alerts
   */
  public async getNewAlerts(limit: number = 50): Promise<TheHiveAlert[]> {
    return this.getAlerts({
      status: ['New', 'Updated'],
      limit,
    });
  }

  /**
   * Import alert as case
   */
  public async promoteAlertToCase(alertId: string): Promise<TheHiveCase | null> {
    try {
      const response = await this.client.post(`/api/alert/${alertId}/case`);
      logger.info(`Promoted alert ${alertId} to case`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to promote alert ${alertId}`, error);
      return null;
    }
  }

  /**
   * Get case statistics
   */
  public async getCaseStats(): Promise<{
    total: number;
    open: number;
    resolved: number;
    by_severity: Record<number, number>;
  }> {
    try {
      const allCases = await this.getCases({ limit: 1000 });

      const stats = {
        total: allCases.length,
        open: 0,
        resolved: 0,
        by_severity: {} as Record<number, number>,
      };

      for (const c of allCases) {
        if (c.status === 'Open') {
          stats.open++;
        } else if (c.status === 'Resolved') {
          stats.resolved++;
        }

        stats.by_severity[c.severity] = (stats.by_severity[c.severity] || 0) + 1;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get case statistics', error);
      return { total: 0, open: 0, resolved: 0, by_severity: {} };
    }
  }

  /**
   * Add task to case
   */
  public async addTask(caseId: string, task: { title: string; description?: string; status?: string }): Promise<boolean> {
    try {
      await this.client.post(`/api/case/${caseId}/task`, {
        title: task.title,
        description: task.description || '',
        status: task.status || 'Waiting',
      });
      logger.info(`Added task to case ${caseId}: ${task.title}`);
      return true;
    } catch (error) {
      logger.error(`Failed to add task to case ${caseId}`, error);
      return false;
    }
  }

  /**
   * Add observable to case
   */
  public async addObservable(
    caseId: string,
    observable: { dataType: string; data: string; tags?: string[]; tlp?: number }
  ): Promise<boolean> {
    try {
      await this.client.post(`/api/case/${caseId}/artifact`, {
        dataType: observable.dataType,
        data: observable.data,
        tags: observable.tags || [],
        tlp: observable.tlp ?? 2,
      });
      logger.info(`Added observable to case ${caseId}: ${observable.dataType}`);
      return true;
    } catch (error) {
      logger.error(`Failed to add observable to case ${caseId}`, error);
      return false;
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ healthy: boolean; response_time_ms?: number }> {
    const start = Date.now();
    try {
      await this.client.get('/api/status');
      const response_time_ms = Date.now() - start;
      return { healthy: true, response_time_ms };
    } catch (_error) {
      return { healthy: false };
    }
  }
}
