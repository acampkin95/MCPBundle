/**
 * HashiCorp Vault Service
 *
 * Provides secure credential retrieval from HashiCorp Vault.
 * Features:
 * - Token-based authentication
 * - Automatic token renewal
 * - Secret caching with TTL
 * - Secret watching for rotation
 */

import { logger } from '../utils/logger.js';
import {
  VAULT_SECRET_PATHS,
  type VaultSecretName,
  type VaultCredentials,
} from '../config/vaultPaths.js';

export interface VaultConfig {
  readonly addr: string;
  readonly token: string;
  readonly namespace?: string;
  readonly cacheTTL?: number; // milliseconds
}

export interface VaultSecretResponse {
  readonly data: {
    readonly data: Record<string, string>;
    readonly metadata: {
      readonly created_time: string;
      readonly version: number;
    };
  };
}

export interface VaultTokenLookupResponse {
  readonly data: {
    readonly creation_time: number;
    readonly creation_ttl: number;
    readonly display_name: string;
    readonly expire_time: string | null;
    readonly explicit_max_ttl: number;
    readonly id: string;
    readonly issue_time: string;
    readonly meta: Record<string, string> | null;
    readonly num_uses: number;
    readonly orphan: boolean;
    readonly path: string;
    readonly policies: readonly string[];
    readonly renewable: boolean;
    readonly ttl: number;
    readonly type: string;
  };
}

interface CachedSecret {
  readonly data: Record<string, string>;
  readonly expiresAt: number; // timestamp
  readonly version: number;
}

export class VaultService {
  private readonly config: VaultConfig;
  private readonly cache: Map<string, CachedSecret>;
  private readonly watchers: Map<string, NodeJS.Timeout>;

  public constructor(config: VaultConfig) {
    this.config = {
      ...config,
      cacheTTL: config.cacheTTL ?? 300000, // Default 5 minutes
    };
    this.cache = new Map();
    this.watchers = new Map();

    logger.info('VaultService initialized', {
      addr: this.config.addr,
      namespace: this.config.namespace,
      cacheTTL: this.config.cacheTTL,
    });
  }

  /**
   * Retrieve secret from Vault
   * Uses cache if available and not expired
   */
  public async getSecret(name: VaultSecretName): Promise<Record<string, string>> {
    const path = VAULT_SECRET_PATHS[name];
    const cached = this.cache.get(path);

    // Return cached value if still valid
    if (cached && Date.now() < cached.expiresAt) {
      logger.debug('Vault secret cache hit', { name, path });
      return cached.data;
    }

    // Fetch from Vault
    logger.debug('Vault secret cache miss, fetching', { name, path });
    const response = await this.fetchSecret(path);

    // Cache the result
    const expiresAt = Date.now() + (this.config.cacheTTL ?? 300000);
    this.cache.set(path, {
      data: response.data.data,
      expiresAt,
      version: response.data.metadata.version,
    });

    return response.data.data;
  }

  /**
   * Fetch secret directly from Vault API
   */
  private async fetchSecret(path: string): Promise<VaultSecretResponse> {
    const url = `${this.config.addr}/v1/${path}`;
    const headers: Record<string, string> = {
      'X-Vault-Token': this.config.token,
    };

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    logger.debug('Fetching secret from Vault', { url, path });

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Vault API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        path,
      });
      throw new Error(`Vault API error: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = (await response.json()) as VaultSecretResponse;
    logger.debug('Secret fetched successfully', {
      path,
      version: data.data.metadata.version,
    });

    return data;
  }

  /**
   * Watch a secret for changes and invalidate cache
   * Polls Vault at specified interval (default 60s)
   */
  public watchSecret(
    name: VaultSecretName,
    onChange: (newData: Record<string, string>) => void,
    intervalMs = 60000
  ): void {
    const path = VAULT_SECRET_PATHS[name];

    // Clear existing watcher if any
    this.stopWatching(name);

    logger.info('Starting secret watcher', { name, path, intervalMs });

    let lastVersion = 0;

    const checkForChanges = async (): Promise<void> => {
      try {
        const response = await this.fetchSecret(path);
        const currentVersion = response.data.metadata.version;

        if (currentVersion > lastVersion) {
          logger.info('Secret version changed', {
            name,
            path,
            oldVersion: lastVersion,
            newVersion: currentVersion,
          });

          lastVersion = currentVersion;

          // Invalidate cache
          this.cache.delete(path);

          // Notify callback
          onChange(response.data.data);
        }
      } catch (error) {
        logger.error('Error checking secret version', {
          name,
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Initial check to get current version
    void checkForChanges();

    // Set up interval
    const intervalId = setInterval(() => {
      void checkForChanges();
    }, intervalMs);

    this.watchers.set(name, intervalId);
  }

  /**
   * Stop watching a secret
   */
  public stopWatching(name: VaultSecretName): void {
    const intervalId = this.watchers.get(name);
    if (intervalId) {
      clearInterval(intervalId);
      this.watchers.delete(name);
      logger.info('Stopped secret watcher', { name });
    }
  }

  /**
   * Stop all secret watchers
   */
  public stopAllWatchers(): void {
    for (const [name, intervalId] of this.watchers.entries()) {
      clearInterval(intervalId);
      logger.info('Stopped secret watcher', { name });
    }
    this.watchers.clear();
  }

  /**
   * Validate token and check expiration
   */
  public async validateToken(): Promise<VaultTokenLookupResponse> {
    const url = `${this.config.addr}/v1/auth/token/lookup-self`;
    const headers: Record<string, string> = {
      'X-Vault-Token': this.config.token,
    };

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token validation failed', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Token validation failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as VaultTokenLookupResponse;

    logger.info('Token validated', {
      policies: data.data.policies,
      ttl: data.data.ttl,
      renewable: data.data.renewable,
      expire_time: data.data.expire_time,
    });

    return data;
  }

  /**
   * Renew token (if renewable)
   */
  public async renewToken(incrementSeconds?: number): Promise<void> {
    const url = `${this.config.addr}/v1/auth/token/renew-self`;
    const headers: Record<string, string> = {
      'X-Vault-Token': this.config.token,
      'Content-Type': 'application/json',
    };

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const body = incrementSeconds ? JSON.stringify({ increment: `${incrementSeconds}s` }) : '{}';

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token renewal failed', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Token renewal failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    logger.info('Token renewed successfully', {
      ttl: data.auth?.lease_duration,
      renewable: data.auth?.renewable,
    });
  }

  /**
   * Clear all cached secrets
   */
  public clearCache(): void {
    this.cache.clear();
    logger.info('Vault cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    readonly size: number;
    readonly entries: readonly {
      readonly path: string;
      readonly version: number;
      readonly expiresAt: number;
      readonly expiresInMs: number;
    }[];
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([path, cached]) => ({
      path,
      version: cached.version,
      expiresAt: cached.expiresAt,
      expiresInMs: cached.expiresAt - now,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Convenience method to get typed credentials
   */
  public async getCredentials<T extends VaultCredentials>(name: VaultSecretName): Promise<T> {
    const data = await this.getSecret(name);
    return data as unknown as T;
  }

  /**
   * Health check - validates token and Vault connectivity
   */
  public async healthCheck(): Promise<{
    readonly healthy: boolean;
    readonly vault: {
      readonly addr: string;
      readonly reachable: boolean;
    };
    readonly token: {
      readonly valid: boolean;
      readonly ttl: number;
      readonly renewable: boolean;
    };
  }> {
    try {
      // Check Vault reachability
      const healthUrl = `${this.config.addr}/v1/sys/health`;
      const healthResponse = await fetch(healthUrl);
      const vaultReachable = healthResponse.ok || healthResponse.status === 429; // 429 = standby

      // Validate token
      const tokenInfo = await this.validateToken();

      return {
        healthy: vaultReachable && tokenInfo.data.ttl > 0,
        vault: {
          addr: this.config.addr,
          reachable: vaultReachable,
        },
        token: {
          valid: true,
          ttl: tokenInfo.data.ttl,
          renewable: tokenInfo.data.renewable,
        },
      };
    } catch (error) {
      logger.error('Vault health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        healthy: false,
        vault: {
          addr: this.config.addr,
          reachable: false,
        },
        token: {
          valid: false,
          ttl: 0,
          renewable: false,
        },
      };
    }
  }
}

/**
 * Create VaultService from environment variables
 */
export function createVaultServiceFromEnv(): VaultService | null {
  const addr = process.env.VAULT_ADDR;
  const token = process.env.VAULT_TOKEN;

  if (!addr || !token) {
    logger.warn('Vault not configured (missing VAULT_ADDR or VAULT_TOKEN)');
    return null;
  }

  const config: VaultConfig = {
    addr,
    token,
    namespace: process.env.VAULT_NAMESPACE,
    cacheTTL: process.env.VAULT_CACHE_TTL ? parseInt(process.env.VAULT_CACHE_TTL, 10) : undefined,
  };

  return new VaultService(config);
}
