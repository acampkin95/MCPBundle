/**
 * CrowdSec Client
 * Retrieves threat intelligence decisions and blocked IPs
 * Note: CrowdSec uses LAPI (Local API) on each host
 */

import axios, { AxiosInstance } from 'axios';
import type { CrowdSecDecision } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class CrowdSecClient {
  private clients: Map<string, AxiosInstance> = new Map();

  public constructor(hosts: Array<{ name: string; ip: string; api_key?: string }>) {
    for (const host of hosts) {
      const client = axios.create({
        baseURL: `http://${host.ip}:8080/v1`,
        timeout: 10000,
        headers: host.api_key
          ? {
              'X-Api-Key': host.api_key,
            }
          : undefined,
      });

      this.clients.set(host.name, client);
    }
  }

  /**
   * Get decisions from a specific host
   */
  public async getDecisions(host: string): Promise<CrowdSecDecision[]> {
    const client = this.clients.get(host);
    if (!client) {
      logger.warn(`No CrowdSec client configured for host: ${host}`);
      return [];
    }

    try {
      const response = await client.get('/decisions');
      return response.data || [];
    } catch (error) {
      logger.error(`Failed to fetch CrowdSec decisions from ${host}`, error);
      return [];
    }
  }

  /**
   * Get decisions from all hosts
   */
  public async getAllDecisions(): Promise<Array<{ host: string; decisions: CrowdSecDecision[] }>> {
    const results: Array<{ host: string; decisions: CrowdSecDecision[] }> = [];

    const promises = Array.from(this.clients.keys()).map(async (host) => {
      const decisions = await this.getDecisions(host);
      return { host, decisions };
    });

    const settled = await Promise.allSettled(promises);

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    return results;
  }

  /**
   * Get active ban decisions (not expired)
   */
  public async getActiveBans(): Promise<Array<{ host: string; ip: string; scenario: string; expires_at?: string }>> {
    const allDecisions = await this.getAllDecisions();
    const activeBans: Array<{ host: string; ip: string; scenario: string; expires_at?: string }> = [];

    for (const { host, decisions } of allDecisions) {
      for (const decision of decisions) {
        if (decision.type === 'ban' && !decision.simulated) {
          const expiresAt = decision.expires_at ? new Date(decision.expires_at) : null;
          if (!expiresAt || expiresAt > new Date()) {
            activeBans.push({
              host,
              ip: decision.value,
              scenario: decision.scenario,
              expires_at: decision.expires_at,
            });
          }
        }
      }
    }

    return activeBans;
  }

  /**
   * Get top attack scenarios
   */
  public async getTopScenarios(limit: number = 10): Promise<Array<{ scenario: string; count: number }>> {
    try {
      const allDecisions = await this.getAllDecisions();
      const scenarioCount: Map<string, number> = new Map();

      for (const { decisions } of allDecisions) {
        for (const decision of decisions) {
          const count = scenarioCount.get(decision.scenario) || 0;
          scenarioCount.set(decision.scenario, count + 1);
        }
      }

      const sorted = Array.from(scenarioCount.entries())
        .map(([scenario, count]) => ({ scenario, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return sorted;
    } catch (error) {
      logger.error('Failed to get top scenarios', error);
      return [];
    }
  }

  /**
   * Get total banned IPs count
   */
  public async getTotalBannedIPs(): Promise<number> {
    const bans = await this.getActiveBans();
    const uniqueIPs = new Set(bans.map((b) => b.ip));
    return uniqueIPs.size;
  }

  /**
   * Get statistics summary
   */
  public async getStats(): Promise<{
    total_decisions: number;
    active_bans: number;
    by_type: Record<string, number>;
    by_origin: Record<string, number>;
  }> {
    try {
      const allDecisions = await this.getAllDecisions();

      let totalDecisions = 0;
      let activeBans = 0;
      const byType: Record<string, number> = {};
      const byOrigin: Record<string, number> = {};

      for (const { decisions } of allDecisions) {
        totalDecisions += decisions.length;

        for (const decision of decisions) {
          if (decision.type === 'ban' && !decision.simulated) {
            const expiresAt = decision.expires_at ? new Date(decision.expires_at) : null;
            if (!expiresAt || expiresAt > new Date()) {
              activeBans++;
            }
          }

          byType[decision.type] = (byType[decision.type] || 0) + 1;
          byOrigin[decision.origin] = (byOrigin[decision.origin] || 0) + 1;
        }
      }

      return {
        total_decisions: totalDecisions,
        active_bans: activeBans,
        by_type: byType,
        by_origin: byOrigin,
      };
    } catch (error) {
      logger.error('Failed to get CrowdSec statistics', error);
      return { total_decisions: 0, active_bans: 0, by_type: {}, by_origin: {} };
    }
  }

  /**
   * Health check all CrowdSec instances
   */
  public async healthCheck(): Promise<Array<{ host: string; healthy: boolean; response_time_ms?: number }>> {
    const results: Array<{ host: string; healthy: boolean; response_time_ms?: number }> = [];

    for (const [host, client] of this.clients.entries()) {
      const start = Date.now();
      try {
        await client.get('/decisions?limit=1');
        const response_time_ms = Date.now() - start;
        results.push({ host, healthy: true, response_time_ms });
      } catch (_error) {
        results.push({ host, healthy: false });
      }
    }

    return results;
  }
}
