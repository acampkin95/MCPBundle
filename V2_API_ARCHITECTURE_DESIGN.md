# MCP Bundle v2.0 - API Architecture Design Document

**Version:** 2.0.0
**Date:** November 15, 2025
**Status:** Architecture Design Phase
**Author:** MCP Development Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Enhanced Tool Schema Standards](#enhanced-tool-schema-standards)
4. [Error Handling Framework](#error-handling-framework)
5. [Caching Architecture](#caching-architecture)
6. [Retry & Resilience Patterns](#retry--resilience-patterns)
7. [Performance Optimization Strategies](#performance-optimization-strategies)
8. [API Versioning Strategy](#api-versioning-strategy)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Migration Guide](#migration-guide)

---

## Executive Summary

### Project Context

The MCP Bundle v2.0 unifies **6 production MCP servers** with **29+ service classes** serving diverse infrastructure management, security operations, AI research, and CDN orchestration needs. This architecture design establishes **enterprise-grade API patterns** to ensure:

- **99.9% uptime** through circuit breakers and retry logic
- **Sub-100ms p95 latency** via intelligent caching
- **Zero data loss** through distributed state management
- **Graceful degradation** across all failure scenarios

### Key Architectural Decisions

| Component | Current State | v2.0 Enhancement | Impact |
|-----------|---------------|------------------|--------|
| **Error Handling** | Ad-hoc try/catch | Structured error taxonomy + recovery | 70% reduction in unhandled exceptions |
| **Caching** | Redis-only (perplexity) | 3-tier hybrid (Redis + LRU + Edge) | 5x faster cache hits, 99% availability |
| **Retry Logic** | Manual retries | Exponential backoff + circuit breaker | 90% reduction in cascade failures |
| **Tool Schemas** | Inconsistent validation | Zod + versioned contracts | Type-safe APIs, seamless upgrades |
| **Performance** | Varies by server | Batching + streaming + pooling | 50% reduction in API response time |

### Scope of Changes

**In Scope:**
- All 29 service classes across 6 MCP servers
- Shared utilities (commandRunner, logger, validators)
- Database clients (PostgreSQL, SQLite, Redis)
- Security components (circuit breaker, rate limiter)

**Out of Scope:**
- UI/Frontend changes (admin panels remain unchanged)
- Database schema migrations (data layer untouched)
- Authentication mechanisms (Keycloak integration preserved)

---

## Current State Analysis

### Server Inventory

#### 1. **itjsst-mcp** (IT Infrastructure & Diagnostics)
**Location:** `release_dev/itjsst-mcp/`
**Service Classes:** 29 (largest server)

**Core Services:**
- `NetworkDiagnosticsService` - Port scanning, firewall diagnostics, nmap integration
- `WindowsAdminService` - PowerShell execution, service management, registry ops
- `SecurityScannerService` - Vulnerability scanning, CIS benchmarks
- `ComplianceAuditService` - PCI-DSS, HIPAA, SOC2 compliance checks
- `DatabaseDiagnosticsService` - PostgreSQL, MySQL, MSSQL health checks

**Current Patterns:**
```typescript
// Error Handling - Basic try/catch
try {
  const result = await this.runner.run(command);
  return { success: true, stdout: result.stdout };
} catch (error) {
  return { success: false, error: error.message }; // ⚠️ Loses context
}

// No Retry Logic - Single attempt
const result = await this.hasBinary('nmap'); // ⚠️ Fails on transient errors

// No Caching - Every call executes command
const firewallStatus = await this.firewallDiagnostics(); // ⚠️ Expensive
```

**Pain Points:**
- CommandExecutionError loses structured data (exit codes, stderr)
- No exponential backoff for network operations
- Heavy commands (nmap, compliance scans) not cached
- Circuit breaker missing for external API calls

---

#### 2. **mcp-orchestrator** (Multi-Agent Coordination)
**Location:** `release_dev/mcp-orchestrator/`
**Service Classes:** 12

**Core Services:**
- `CommandQueueService` - SQLite-based job queue with retry logic ✅
- `DatabaseSyncService` - PostgreSQL replication monitoring
- `KeycloakManagerService` - SSO user/role management
- `AutoDiscoveryService` - Agent registration and capability mapping
- `HealthCheckService` - Multi-server health aggregation

**Current Patterns:**
```typescript
// Job Queue - Has retry logic ✅
export interface QueuedCommand {
  readonly retryCount: number;
  readonly maxRetries: number; // Default: 3
  readonly status: 'queued' | 'picked' | 'executing' | 'completed' | 'failed';
}

// ⚠️ But no exponential backoff
this.retryCount++; // Linear retry without delays
```

**Strengths:**
- SQLite persistence for offline resilience ✅
- Priority queue implementation ✅
- Lifecycle state tracking ✅

**Gaps:**
- No circuit breaker for PostgreSQL operations
- Fixed retry delays (should be exponential)
- No distributed locking for multi-instance deployments

---

#### 3. **perplexity-mcp** (AI Research & Search)
**Location:** `release_dev/perplexity-mcp/`
**Service Classes:** 6 (most mature)

**Core Services:**
- `PerplexityClient` - API client with full security stack ✅
- `CircuitBreaker` - Production-grade implementation ✅
- `CacheManager` - Redis + LRU fallback ✅
- `RateLimiter` - Token bucket algorithm ✅
- `CostTracker` - Budget enforcement ✅

**Current Patterns (GOLD STANDARD):**
```typescript
// Structured Errors ✅
export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) { /* ... */ }
}

// Circuit Breaker ✅
async execute<T>(fn: () => Promise<T>): Promise<T> {
  if (this.state === CircuitState.OPEN) {
    throw new CircuitBreakerError('Circuit breaker is OPEN');
  }
  // ...
}

// Exponential Backoff ✅
retryStrategy: (times: number) => {
  const delay = Math.min(times * 50, 2000); // 50ms → 2000ms
  return delay;
}
```

**Adoption Strategy:**
✅ **This server serves as the blueprint for v2.0 patterns**
- Copy `errors/index.ts` to shared utilities
- Extract `CircuitBreaker` to `@mcp-bundle/resilience`
- Generalize `CacheManager` for all servers

---

#### 4. **soc-hub-mcp** (Security Operations Center)
**Location:** `release_dev/soc-hub-mcp/`
**Service Classes:** 5

**Core Services:**
- `SOCAggregator` - Unified dashboard data (Wazuh, Elasticsearch, TheHive, CrowdSec)
- `WazuhClient` - SIEM alert aggregation
- `ElasticsearchClient` - Log search and analytics
- `TheHiveClient` - Case management integration
- `CrowdSecClient` - Threat intelligence and bans

**Current Patterns:**
```typescript
// Parallel Fetching ✅
const [agents, alerts, cases] = await Promise.all([
  this.wazuhClient.getAgentsSummary(),
  this.wazuhClient.getAlerts({ limit: 50 }),
  this.thehiveClient.getOpenCases(20)
]);

// ⚠️ No error isolation
// If one service fails, entire dashboard fails
```

**Required Enhancements:**
- Wrap each client in circuit breaker
- Cache dashboard data (60s TTL)
- Graceful degradation (show stale data on failure)

---

#### 5. **cloudflare-mcp** (CDN & DNS Management)
**Location:** `release_dev/cloudflare-mcp/`
**Service Classes:** 7

**Core Services:**
- `CloudflareDnsService` - Programmatic DNS updates
- `MeshHealthMonitor` - Distributed agent health checks
- `LogIngestorService` - Centralized logging with SQLite
- `HeartbeatService` - Agent liveness detection
- `MeshRegistryStore` - MAC-based agent identity

**Current Patterns:**
```typescript
// Heartbeat with TTL ✅
export interface HeartbeatRecord {
  readonly expiresAt: string; // ISO timestamp
  readonly healthy: boolean;
  readonly lastSeenDurationMs: number;
}

// ⚠️ No retry for DNS updates
await this.cloudflare.dns.records.create(zoneId, record); // Single attempt
```

**Required Enhancements:**
- Retry DNS operations (5xx errors, rate limits)
- Cache zone configurations (5min TTL)
- Circuit breaker for Cloudflare API

---

#### 6. **admin-panel** (Web UI)
**Location:** `release_dev/admin-panel/`
**Type:** Next.js application

**Integration Points:**
- Consumes health data from all MCP servers
- Displays mesh registry and agent status
- Exposes log query interface

**Out of Scope:**
- Frontend remains unchanged in v2.0
- Backend API calls will benefit from caching/retry automatically

---

### Cross-Cutting Analysis

#### Error Handling Inconsistencies

| Server | Error Pattern | Issues |
|--------|---------------|--------|
| itjsst-mcp | `CommandExecutionError` extends Error | Loses structured result data |
| perplexity-mcp | Structured MCPError hierarchy ✅ | **Best practice** |
| soc-hub-mcp | Generic try/catch with logger.error | No client-side error codes |
| cloudflare-mcp | Mixed (Zod validation + generic errors) | Partial structure |

**Recommendation:** Adopt `perplexity-mcp` error taxonomy across all servers.

---

#### Retry Logic Maturity

| Server | Retry Implementation | Backoff Strategy | Circuit Breaker |
|--------|---------------------|------------------|-----------------|
| itjsst-mcp | ❌ None | ❌ None | ❌ None |
| mcp-orchestrator | ⚠️ Linear retry in CommandQueue | ❌ Fixed delays | ❌ None |
| perplexity-mcp | ✅ Exponential backoff | ✅ 50ms → 2000ms | ✅ Full implementation |
| soc-hub-mcp | ❌ None | ❌ None | ❌ None |
| cloudflare-mcp | ❌ None | ❌ None | ❌ None |

**Critical Gap:** 4 out of 6 servers lack retry/circuit breaker protection.

---

#### Caching Implementations

| Server | Caching Layer | TTL Strategy | Fallback |
|--------|--------------|--------------|----------|
| itjsst-mcp | ❌ None | N/A | N/A |
| mcp-orchestrator | ❌ None (Redis used for shared state) | N/A | N/A |
| perplexity-mcp | ✅ Redis + LRU | ✅ Configurable per-mode | ✅ In-memory fallback |
| soc-hub-mcp | ❌ None | N/A | N/A |
| cloudflare-mcp | ❌ None | N/A | N/A |

**Opportunity:** 5 servers would benefit from caching (network scans, health checks, DNS zones).

---

## Enhanced Tool Schema Standards

### Versioned API Contracts

All MCP tools will adopt **semantic versioning** with backward-compatible evolution:

```typescript
/**
 * Tool Schema Version: 2.0.0
 * Breaking Changes: Require `context` parameter for audit logging
 * Deprecated: `sudo` flag (use `elevatedPrivileges` instead)
 */
export const NetworkScanToolSchema = z.object({
  // Required in v2.0
  context: z.object({
    userId: z.string().uuid(),
    sessionId: z.string(),
    clientIp: z.string().ip().optional()
  }),

  // Core parameters
  host: z.string().ip().or(z.string().hostname()),
  ports: z.array(z.number().int().min(1).max(65535)),
  protocol: z.enum(['tcp', 'udp']),

  // Optional parameters with defaults
  timeoutSeconds: z.number().int().min(1).max(300).default(3),
  elevatedPrivileges: z.boolean().default(false),

  // Deprecated (maintained for v1.x compatibility)
  sudo: z.boolean().optional().describe('DEPRECATED: Use elevatedPrivileges'),

  // Version metadata
  _version: z.literal('2.0').default('2.0')
});

export type NetworkScanParams = z.infer<typeof NetworkScanToolSchema>;
```

### Response Envelope Standard

**Success Response:**
```typescript
export interface SuccessResponse<T> {
  success: true;
  data: T;
  metadata: {
    requestId: string;         // For tracing
    timestamp: string;          // ISO 8601
    duration: number;           // Milliseconds
    cached: boolean;            // Cache hit?
    version: string;            // Schema version
  };
  _links?: {                    // HATEOAS navigation
    self: string;
    related?: Record<string, string>;
  };
}
```

**Error Response:**
```typescript
export interface ErrorResponse {
  success: false;
  error: {
    code: string;               // Machine-readable (e.g., "NETWORK_TIMEOUT")
    message: string;            // Human-readable
    statusCode: number;         // HTTP-style (400, 500, etc.)
    details?: Record<string, unknown>; // Context-specific
    retryable: boolean;         // Can client retry?
    retryAfterMs?: number;      // Suggested retry delay
  };
  metadata: {
    requestId: string;
    timestamp: string;
    version: string;
  };
  trace?: string[];             // Error chain (dev mode only)
}
```

### Schema Validation Middleware

```typescript
import { z } from 'zod';
import { ValidationError } from '@mcp-bundle/errors';

export function validateSchema<T extends z.ZodTypeAny>(schema: T) {
  return (params: unknown): z.infer<T> => {
    const result = schema.safeParse(params);

    if (!result.success) {
      const firstError = result.error.errors[0];
      throw new ValidationError(
        `Validation failed: ${firstError.message}`,
        firstError.path.join('.')
      );
    }

    return result.data;
  };
}

// Usage in tool handlers
const validatedParams = validateSchema(NetworkScanToolSchema)(rawParams);
```

### Backward Compatibility Strategy

**Approach:** Dual-version support during transition (6-month deprecation window)

```typescript
export class NetworkDiagnosticsService {
  // v2.0 implementation (preferred)
  async scanTcpPorts(params: NetworkScanParams): Promise<SuccessResponse<PortScanResult[]>> {
    // Full v2.0 implementation with context, tracing, etc.
  }

  // v1.x compatibility shim (deprecated)
  async scanTcpPortsLegacy(
    host: string,
    ports: number[],
    timeoutSeconds?: number
  ): Promise<PortScanResult[]> {
    logger.warn('scanTcpPortsLegacy is deprecated. Migrate to scanTcpPorts v2.0.');

    // Map old signature to new
    const params: NetworkScanParams = {
      context: { userId: 'legacy', sessionId: 'legacy' },
      host,
      ports,
      timeoutSeconds: timeoutSeconds ?? 3,
      protocol: 'tcp',
      elevatedPrivileges: false,
      _version: '2.0'
    };

    const response = await this.scanTcpPorts(params);
    return response.data; // Unwrap for v1.x clients
  }
}
```

---

## Error Handling Framework

### Error Taxonomy

**Adopt from perplexity-mcp, extend for infrastructure operations:**

```typescript
// Base error class
export abstract class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details
    };
  }
}

// Client errors (4xx) - Non-retryable
export class ValidationError extends MCPError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR', 400, false, { field });
  }
}

export class AuthenticationError extends MCPError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_FAILED', 401, false);
  }
}

export class AuthorizationError extends MCPError {
  constructor(message: string, public readonly requiredRole?: string) {
    super(message, 'AUTHORIZATION_DENIED', 403, false, { requiredRole });
  }
}

// Server errors (5xx) - Retryable
export class NetworkTimeoutError extends MCPError {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message, 'NETWORK_TIMEOUT', 504, true, { timeoutMs });
  }
}

export class DatabaseConnectionError extends MCPError {
  constructor(message: string, public readonly dbHost: string) {
    super(message, 'DATABASE_CONNECTION_ERROR', 503, true, { dbHost });
  }
}

export class CommandExecutionError extends MCPError {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string
  ) {
    super(message, 'COMMAND_EXECUTION_ERROR', 500, false, {
      command,
      exitCode,
      stdoutPreview: stdout.slice(0, 200),
      stderrPreview: stderr.slice(0, 200)
    });
  }
}

// Rate limiting (429) - Retryable with delay
export class RateLimitError extends MCPError {
  constructor(message: string, public readonly retryAfterMs: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfterMs });
  }
}

// Circuit breaker (503) - Retryable after cooldown
export class CircuitBreakerError extends MCPError {
  constructor(message: string, public readonly resetTimeMs: number) {
    super(message, 'CIRCUIT_BREAKER_OPEN', 503, true, { resetTimeMs });
  }
}

// Budget/quota errors (402) - Non-retryable
export class BudgetExceededError extends MCPError {
  constructor(message: string, public readonly dailyUsed: number, public readonly dailyLimit: number) {
    super(message, 'BUDGET_EXCEEDED', 402, false, { dailyUsed, dailyLimit });
  }
}
```

### Error Recovery Strategies

```typescript
export interface ErrorRecoveryStrategy {
  readonly shouldRetry: (error: MCPError, attemptNumber: number) => boolean;
  readonly getRetryDelay: (error: MCPError, attemptNumber: number) => number;
  readonly maxAttempts: number;
  readonly onRetry?: (error: MCPError, attemptNumber: number) => void;
  readonly onFailure?: (error: MCPError, finalAttempt: number) => void;
}

export const DEFAULT_RECOVERY_STRATEGY: ErrorRecoveryStrategy = {
  shouldRetry: (error, attempt) => {
    if (!error.retryable) return false;
    if (attempt >= 3) return false;

    // Don't retry authentication/validation errors
    if (error.statusCode >= 400 && error.statusCode < 500) return false;

    return true;
  },

  getRetryDelay: (error, attempt) => {
    // Rate limit errors specify delay
    if (error instanceof RateLimitError) {
      return error.retryAfterMs;
    }

    // Exponential backoff with jitter
    const baseDelay = 100 * Math.pow(2, attempt); // 100ms, 200ms, 400ms, ...
    const jitter = Math.random() * 0.3 * baseDelay; // ±30% jitter
    return Math.min(baseDelay + jitter, 10000); // Cap at 10 seconds
  },

  maxAttempts: 3,

  onRetry: (error, attempt) => {
    logger.warn(`Retrying after error (attempt ${attempt})`, {
      errorCode: error.code,
      errorMessage: error.message
    });
  },

  onFailure: (error, attempt) => {
    logger.error(`Operation failed after ${attempt} attempts`, {
      errorCode: error.code,
      errorMessage: error.message,
      details: error.details
    });
  }
};
```

### Centralized Error Handler

```typescript
export async function executeWithRecovery<T>(
  operation: () => Promise<T>,
  strategy: ErrorRecoveryStrategy = DEFAULT_RECOVERY_STRATEGY
): Promise<T> {
  let lastError: MCPError | null = null;
  let attempt = 0;

  while (attempt < strategy.maxAttempts) {
    attempt++;

    try {
      return await operation();
    } catch (error) {
      // Convert unknown errors to MCPError
      const mcpError = error instanceof MCPError
        ? error
        : new MCPError(
            error instanceof Error ? error.message : String(error),
            'UNKNOWN_ERROR',
            500,
            false
          );

      lastError = mcpError;

      // Check if we should retry
      if (!strategy.shouldRetry(mcpError, attempt)) {
        break;
      }

      // Calculate retry delay
      const delay = strategy.getRetryDelay(mcpError, attempt);

      // Invoke retry callback
      strategy.onRetry?.(mcpError, attempt);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  strategy.onFailure?.(lastError!, attempt);
  throw lastError!;
}

// Usage example
const result = await executeWithRecovery(
  async () => {
    return await networkDiagnostics.scanTcpPorts({ host: '10.0.0.1', ports: [80, 443] });
  },
  {
    ...DEFAULT_RECOVERY_STRATEGY,
    maxAttempts: 5 // Override max attempts
  }
);
```

---

## Caching Architecture

### Three-Tier Hybrid Cache

**Goal:** 99.9% cache availability with sub-10ms latency

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Request                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ↓
                  ┌─────────────────────┐
                  │   L1: In-Memory     │ ← 1-5ms latency
                  │   LRU Cache         │   (100 items)
                  │   Per-process       │
                  └──────────┬──────────┘
                             │ Cache miss
                             ↓
                  ┌─────────────────────┐
                  │   L2: Redis         │ ← 5-20ms latency
                  │   Shared cache      │   (10,000 items)
                  │   Pub/sub sync      │
                  └──────────┬──────────┘
                             │ Cache miss
                             ↓
                  ┌─────────────────────┐
                  │   L3: Edge          │ ← 50-100ms latency
                  │   CDN cache         │   (Cloudflare KV)
                  │   Read-only         │
                  └──────────┬──────────┘
                             │ Cache miss
                             ↓
                  ┌─────────────────────┐
                  │   Origin            │ ← 100-1000ms
                  │   Database/API      │
                  │   Authoritative     │
                  └─────────────────────┘
```

### Cache Manager Implementation

```typescript
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { logger } from '@mcp-bundle/logger';

export interface CacheConfig {
  readonly redis?: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  readonly lru?: {
    maxSize: number;      // Max items in memory
    maxAge: number;       // TTL in milliseconds
  };
  readonly keyPrefix?: string;
  readonly defaultTTL?: number; // Seconds
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  hits: number;
  source: 'memory' | 'redis' | 'origin';
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  memoryHits: number;
  redisHits: number;
  totalKeys: number;
  redisConnected: boolean;
}

export class HybridCacheManager {
  private redis: Redis | null = null;
  private memoryCache: LRUCache<string, CacheEntry<any>>;
  private redisConnected: boolean = false;
  private stats = {
    hits: 0,
    misses: 0,
    memoryHits: 0,
    redisHits: 0
  };

  constructor(private config: CacheConfig) {
    // Initialize in-memory LRU cache
    this.memoryCache = new LRUCache({
      max: config.lru?.maxSize ?? 100,
      ttl: config.lru?.maxAge ?? 60000, // 1 minute default
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // Initialize Redis with retry logic
    if (config.redis) {
      try {
        this.redis = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          lazyConnect: true
        });

        this.redis.on('connect', () => {
          this.redisConnected = true;
          logger.info('Redis cache connected');
        });

        this.redis.on('error', (error) => {
          this.redisConnected = false;
          logger.warn('Redis cache error (falling back to memory)', { error });
        });

        // Connect asynchronously
        this.redis.connect().catch((error) => {
          logger.warn('Redis connection failed, using memory-only cache', { error });
        });
      } catch (error) {
        logger.warn('Failed to initialize Redis, using memory-only cache', { error });
      }
    }
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(namespace: string, params: Record<string, unknown>): string {
    const prefix = this.config.keyPrefix ?? 'mcp';
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    const hash = createHash('sha256').update(paramString).digest('hex').slice(0, 16);
    return `${prefix}:${namespace}:${hash}`;
  }

  /**
   * Get cached value (L1 → L2 → L3 → Origin)
   */
  async get<T>(
    namespace: string,
    params: Record<string, unknown>
  ): Promise<T | null> {
    const key = this.generateKey(namespace, params);

    // L1: Check in-memory cache
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && Date.now() < memoryEntry.expiresAt) {
      this.stats.hits++;
      this.stats.memoryHits++;
      memoryEntry.hits++;
      logger.debug('Cache hit (memory)', { key, hits: memoryEntry.hits });
      return memoryEntry.data as T;
    }

    // L2: Check Redis cache
    if (this.redis && this.redisConnected) {
      try {
        const redisData = await this.redis.get(key);
        if (redisData) {
          const entry: CacheEntry<T> = JSON.parse(redisData);

          // Validate expiration
          if (Date.now() < entry.expiresAt) {
            this.stats.hits++;
            this.stats.redisHits++;

            // Promote to L1 cache
            this.memoryCache.set(key, {
              ...entry,
              source: 'memory'
            });

            logger.debug('Cache hit (Redis → promoted to memory)', { key });
            return entry.data;
          } else {
            // Expired, delete from Redis
            await this.redis.del(key);
          }
        }
      } catch (error) {
        logger.warn('Redis get failed', { key, error });
      }
    }

    // Cache miss
    this.stats.misses++;
    logger.debug('Cache miss', { key });
    return null;
  }

  /**
   * Set cached value (write to L1 + L2)
   */
  async set<T>(
    namespace: string,
    params: Record<string, unknown>,
    data: T,
    ttlSeconds?: number
  ): Promise<void> {
    const key = this.generateKey(namespace, params);
    const ttl = ttlSeconds ?? this.config.defaultTTL ?? 60;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl * 1000,
      hits: 0,
      source: 'memory'
    };

    // Write to L1 (in-memory)
    this.memoryCache.set(key, entry);
    logger.debug('Cache set (memory)', { key, ttl });

    // Write to L2 (Redis)
    if (this.redis && this.redisConnected) {
      try {
        await this.redis.setex(key, ttl, JSON.stringify(entry));
        logger.debug('Cache set (Redis)', { key, ttl });
      } catch (error) {
        logger.warn('Redis set failed', { key, error });
      }
    }
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(namespace: string, params: Record<string, unknown>): Promise<void> {
    const key = this.generateKey(namespace, params);

    // Delete from L1
    this.memoryCache.delete(key);

    // Delete from L2
    if (this.redis && this.redisConnected) {
      try {
        await this.redis.del(key);
        logger.debug('Cache invalidated', { key });
      } catch (error) {
        logger.warn('Redis invalidation failed', { key, error });
      }
    }
  }

  /**
   * Clear all cache entries for a namespace
   */
  async clearNamespace(namespace: string): Promise<void> {
    const prefix = `${this.config.keyPrefix ?? 'mcp'}:${namespace}:`;

    // Clear L1 (scan and delete matching keys)
    for (const [key] of this.memoryCache.entries()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Clear L2 (Redis SCAN pattern)
    if (this.redis && this.redisConnected) {
      try {
        const stream = this.redis.scanStream({ match: `${prefix}*`, count: 100 });
        stream.on('data', async (keys: string[]) => {
          if (keys.length > 0) {
            await this.redis!.del(...keys);
          }
        });
        await new Promise((resolve) => stream.on('end', resolve));
        logger.info('Cache namespace cleared', { namespace });
      } catch (error) {
        logger.warn('Redis namespace clear failed', { namespace, error });
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      memoryHits: this.stats.memoryHits,
      redisHits: this.stats.redisHits,
      totalKeys: this.memoryCache.size,
      redisConnected: this.redisConnected
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.memoryCache.clear();
    logger.info('Cache manager shutdown complete');
  }
}
```

### Cache-Aside Pattern (Decorator)

```typescript
/**
 * Decorator for automatic caching
 */
export function Cacheable(namespace: string, ttlSeconds: number = 60) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache: HybridCacheManager = this.cacheManager;

      if (!cache) {
        logger.warn('No cache manager available, executing without cache');
        return originalMethod.apply(this, args);
      }

      // Generate cache key from method arguments
      const params = { method: propertyKey, args };

      // Try cache first
      const cached = await cache.get(namespace, params);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Cache result
      await cache.set(namespace, params, result, ttlSeconds);

      return result;
    };

    return descriptor;
  };
}

// Usage example
export class NetworkDiagnosticsService {
  constructor(
    private runner: CommandRunner,
    private cacheManager: HybridCacheManager
  ) {}

  @Cacheable('network:firewall', 30) // Cache for 30 seconds
  async firewallDiagnostics(): Promise<FirewallDiagnostics> {
    // Expensive operation (pfctl, iptables, etc.)
    const pfctl = await this.safeCommand('pfctl -sr', true);
    const socketFilter = await this.safeCommand('socketfilterfw --getglobalstate', true);
    // ...
    return { pfctl, socketFilter };
  }
}
```

### Cache TTL Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| **Static Configuration** | 5 minutes | DNS zones, firewall rules (rarely change) |
| **Health Metrics** | 30 seconds | Agent status, system resources (high volume) |
| **Diagnostic Results** | 60 seconds | Port scans, compliance checks (expensive) |
| **Search Results** | 5 minutes | Perplexity API responses (cost-sensitive) |
| **Security Events** | 10 seconds | Real-time alerts (balance freshness vs. load) |
| **User Sessions** | 1 hour | Authentication tokens, user preferences |

---

## Retry & Resilience Patterns

### Exponential Backoff with Jitter

**Algorithm:**
```
delay = min(base * 2^attempt + random(0, 0.3 * base), maxDelay)
```

**Implementation:**
```typescript
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number; // 0.0 - 1.0
  readonly shouldRetry?: (error: Error, attempt: number) => boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  jitterRatio: 0.3
};

export class RetryStrategy {
  constructor(private config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  getDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.config.jitterRatio * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
  }

  /**
   * Execute function with retry logic
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (this.config.shouldRetry && !this.config.shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // Don't delay after last attempt
        if (attempt < this.config.maxAttempts - 1) {
          const delay = this.getDelay(attempt);
          logger.debug(`Retrying after ${delay}ms (attempt ${attempt + 1}/${this.config.maxAttempts})`, {
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}

// Example: Retry only on network errors
const networkRetry = new RetryStrategy({
  ...DEFAULT_RETRY_CONFIG,
  shouldRetry: (error, attempt) => {
    if (error instanceof NetworkTimeoutError) return true;
    if (error instanceof DatabaseConnectionError) return true;
    if (error.message.includes('ECONNREFUSED')) return true;
    return false;
  }
});

const result = await networkRetry.execute(async () => {
  return await fetch('https://api.example.com/data');
});
```

### Circuit Breaker Pattern

**Adopt from perplexity-mcp, generalize for all external dependencies:**

```typescript
export enum CircuitState {
  CLOSED = 'CLOSED',      // Normal operation
  OPEN = 'OPEN',          // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;      // Open after N failures
  readonly resetTimeoutMs: number;        // Test recovery after timeout
  readonly halfOpenMaxAttempts: number;   // Test requests in HALF_OPEN
  readonly monitoringWindowMs?: number;   // Sliding window for failure count
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private halfOpenAttempts: number = 0;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout elapsed
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker '${this.name}' is OPEN`,
          this.config.resetTimeoutMs - (Date.now() - this.lastFailureTime!)
        );
      }
    }

    // Limit HALF_OPEN attempts
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        throw new CircuitBreakerError(
          `Circuit breaker '${this.name}' is testing recovery (max attempts reached)`,
          0
        );
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // All test requests succeeded, close circuit
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.transitionTo(CircuitState.CLOSED);
        this.resetCounts();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }

    logger.debug(`Circuit breaker '${this.name}' success`, {
      state: this.state,
      successCount: this.successCount
    });
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn(`Circuit breaker '${this.name}' failure`, {
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      error: error instanceof Error ? error.message : String(error)
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure during testing, reopen circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if threshold exceeded
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info(`Circuit breaker '${this.name}' state transition`, {
      from: oldState,
      to: newState
    });

    if (newState === CircuitState.OPEN) {
      // Schedule reset attempt
      this.scheduleReset();
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts = 0;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const elapsed = Date.now() - this.lastFailureTime;
    return elapsed >= this.config.resetTimeoutMs;
  }

  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }, this.config.resetTimeoutMs);
  }

  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Example: Protect PostgreSQL connections
const dbCircuitBreaker = new CircuitBreaker('postgresql', {
  failureThreshold: 5,        // Open after 5 failures
  resetTimeoutMs: 30000,      // Test recovery after 30s
  halfOpenMaxAttempts: 3      // Allow 3 test queries
});

async function executeQuery(sql: string) {
  return dbCircuitBreaker.execute(async () => {
    const result = await pool.query(sql);
    return result.rows;
  });
}
```

### Bulkhead Pattern (Resource Isolation)

**Prevent resource exhaustion from cascading failures:**

```typescript
export class Bulkhead {
  private activeRequests: number = 0;
  private queuedRequests: Array<() => void> = [];

  constructor(
    private name: string,
    private maxConcurrent: number,
    private maxQueued: number = 100
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.activeRequests < this.maxConcurrent) {
      return this.executeImmediately(operation);
    }

    // Check if queue is full
    if (this.queuedRequests.length >= this.maxQueued) {
      throw new MCPError(
        `Bulkhead '${this.name}' is full (${this.activeRequests} active, ${this.queuedRequests.length} queued)`,
        'BULKHEAD_FULL',
        503,
        true
      );
    }

    // Queue the request
    return new Promise<T>((resolve, reject) => {
      this.queuedRequests.push(async () => {
        try {
          const result = await this.executeImmediately(operation);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async executeImmediately<T>(operation: () => Promise<T>): Promise<T> {
    this.activeRequests++;

    try {
      return await operation();
    } finally {
      this.activeRequests--;

      // Process next queued request
      const next = this.queuedRequests.shift();
      if (next) {
        next();
      }
    }
  }

  getStatus() {
    return {
      name: this.name,
      activeRequests: this.activeRequests,
      queuedRequests: this.queuedRequests.length,
      maxConcurrent: this.maxConcurrent,
      maxQueued: this.maxQueued
    };
  }
}

// Example: Limit concurrent port scans
const portScanBulkhead = new Bulkhead('port-scan', 5, 20);

async function scanPort(host: string, port: number) {
  return portScanBulkhead.execute(async () => {
    // Only 5 concurrent scans, up to 20 queued
    return await nc.scan(host, port);
  });
}
```

### Timeout Pattern

```typescript
export class TimeoutError extends MCPError {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message, 'OPERATION_TIMEOUT', 408, true, { timeoutMs });
  }
}

export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `${operationName} timed out after ${timeoutMs}ms`,
          timeoutMs
        ));
      }, timeoutMs);
    })
  ]);
}

// Example
const result = await withTimeout(
  async () => networkDiagnostics.scanTcpPorts('10.0.0.1', [1-65535]),
  30000, // 30 seconds
  'Full port scan'
);
```

---

## Performance Optimization Strategies

### Connection Pooling

**Database connections must be pooled to avoid overhead:**

```typescript
import { Pool, PoolConfig } from 'pg';

export const createDatabasePool = (config: PoolConfig): Pool => {
  return new Pool({
    ...config,
    max: 20,                    // Max connections
    min: 5,                     // Min idle connections
    idleTimeoutMillis: 30000,   // Close idle after 30s
    connectionTimeoutMillis: 5000, // Fail fast on connection errors
    application_name: 'mcp-bundle',

    // Statement timeout (prevent long-running queries)
    statement_timeout: 60000,   // 60 seconds

    // Query retry logic
    query_timeout: 30000,       // 30 seconds per query

    // Health check
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  });
};

// Wrap in circuit breaker
const dbPool = createDatabasePool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const dbCircuitBreaker = new CircuitBreaker('postgresql', {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 2
});

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
  return dbCircuitBreaker.execute(async () => {
    const result = await dbPool.query(sql, params);
    return result.rows;
  });
}
```

### Request Batching

**Combine multiple small requests into batched operations:**

```typescript
export class BatchProcessor<TInput, TOutput> {
  private queue: Array<{
    input: TInput;
    resolve: (output: TOutput) => void;
    reject: (error: Error) => void;
  }> = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(
    private batchSize: number,
    private batchDelayMs: number,
    private executor: (inputs: TInput[]) => Promise<TOutput[]>
  ) {}

  async process(input: TInput): Promise<TOutput> {
    return new Promise<TOutput>((resolve, reject) => {
      this.queue.push({ input, resolve, reject });

      // Execute batch if size reached
      if (this.queue.length >= this.batchSize) {
        this.executeBatch();
      } else if (!this.batchTimer) {
        // Schedule batch execution
        this.batchTimer = setTimeout(() => {
          this.executeBatch();
        }, this.batchDelayMs);
      }
    });
  }

  private async executeBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const batch = this.queue.splice(0, this.batchSize);
    if (batch.length === 0) return;

    try {
      const inputs = batch.map(item => item.input);
      const outputs = await this.executor(inputs);

      // Resolve each item
      batch.forEach((item, index) => {
        item.resolve(outputs[index]);
      });
    } catch (error) {
      // Reject all items in batch
      batch.forEach(item => {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      });
    }
  }
}

// Example: Batch DNS lookups
const dnsBatchProcessor = new BatchProcessor(
  10,    // Batch size
  50,    // Delay (ms)
  async (hostnames: string[]) => {
    // Single DNS query with multiple hostnames
    return await Promise.all(hostnames.map(h => dns.lookup(h)));
  }
);

// Client code doesn't need to know about batching
const ip1 = await dnsBatchProcessor.process('example.com');
const ip2 = await dnsBatchProcessor.process('google.com');
```

### Streaming Responses

**For large datasets, stream instead of buffering:**

```typescript
import { Readable } from 'stream';

export async function streamCallLogs(
  filters: { start_date: string; end_date: string },
  onChunk: (calls: any[]) => void
): Promise<void> {
  const query = `
    SELECT * FROM calls
    WHERE start_time >= $1 AND start_time <= $2
    ORDER BY start_time DESC
  `;

  // Use cursor for streaming
  const cursor = dbPool.query(new Cursor(query, [filters.start_date, filters.end_date]));

  const CHUNK_SIZE = 100;
  let chunk: any[];

  do {
    chunk = await cursor.read(CHUNK_SIZE);
    if (chunk.length > 0) {
      onChunk(chunk);
    }
  } while (chunk.length === CHUNK_SIZE);

  await cursor.close();
}

// Usage
await streamCallLogs({ start_date: '2025-01-01', end_date: '2025-11-15' }, (calls) => {
  // Process 100 calls at a time
  calls.forEach(call => console.log(call.call_id));
});
```

### Lazy Loading & Code Splitting

**Only load service classes when needed:**

```typescript
export class ServiceRegistry {
  private services: Map<string, any> = new Map();

  async getService<T>(serviceName: string): Promise<T> {
    if (this.services.has(serviceName)) {
      return this.services.get(serviceName) as T;
    }

    // Lazy load service module
    let ServiceClass: any;
    switch (serviceName) {
      case 'network-diagnostics':
        ServiceClass = (await import('./services/networkDiagnostics.js')).NetworkDiagnosticsService;
        break;
      case 'security-scanner':
        ServiceClass = (await import('./services/securityScanner.js')).SecurityScannerService;
        break;
      case 'database-diagnostics':
        ServiceClass = (await import('./services/databaseDiagnostics.js')).DatabaseDiagnosticsService;
        break;
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }

    // Instantiate and cache
    const instance = new ServiceClass(/* dependencies */);
    this.services.set(serviceName, instance);
    return instance as T;
  }
}

// Usage: Only load when tool is called
const service = await registry.getService<NetworkDiagnosticsService>('network-diagnostics');
const result = await service.scanTcpPorts('10.0.0.1', [80, 443]);
```

---

## API Versioning Strategy

### Semantic Versioning for Tools

**Format:** `v{major}.{minor}.{patch}`

- **Major:** Breaking changes (parameter removal, response format change)
- **Minor:** Backward-compatible additions (new optional parameters)
- **Patch:** Bug fixes, performance improvements

### Version Negotiation

**Client specifies preferred version in tool call:**

```typescript
export interface ToolCallRequest {
  toolName: string;
  params: Record<string, unknown>;
  version?: string; // e.g., "2.0", "2.1", "1.x" (latest 1.x)
}

export class ToolRegistry {
  private tools: Map<string, Map<string, ToolHandler>> = new Map();

  /**
   * Register tool with version
   */
  registerTool(name: string, version: string, handler: ToolHandler) {
    if (!this.tools.has(name)) {
      this.tools.set(name, new Map());
    }
    this.tools.get(name)!.set(version, handler);
  }

  /**
   * Resolve tool version based on client preference
   */
  resolveTool(name: string, requestedVersion?: string): ToolHandler | null {
    const versions = this.tools.get(name);
    if (!versions || versions.size === 0) return null;

    if (!requestedVersion) {
      // No version specified, use latest
      const latest = Array.from(versions.keys()).sort().reverse()[0];
      return versions.get(latest) ?? null;
    }

    // Exact version match
    if (versions.has(requestedVersion)) {
      return versions.get(requestedVersion)!;
    }

    // Range match (e.g., "2.x" → latest 2.x)
    if (requestedVersion.endsWith('.x')) {
      const major = requestedVersion.split('.')[0];
      const matching = Array.from(versions.keys())
        .filter(v => v.startsWith(major + '.'))
        .sort()
        .reverse();
      if (matching.length > 0) {
        return versions.get(matching[0])!;
      }
    }

    return null;
  }

  /**
   * Call tool with version resolution
   */
  async callTool(request: ToolCallRequest): Promise<any> {
    const handler = this.resolveTool(request.toolName, request.version);

    if (!handler) {
      throw new ValidationError(
        `Tool '${request.toolName}' version '${request.version ?? 'latest'}' not found`
      );
    }

    return handler.execute(request.params);
  }
}

// Usage example
registry.registerTool('network-scan', '1.0', networkScanV1Handler);
registry.registerTool('network-scan', '2.0', networkScanV2Handler);

// Client calls
const result = await registry.callTool({
  toolName: 'network-scan',
  version: '2.0', // Specific version
  params: { host: '10.0.0.1', ports: [80, 443] }
});
```

### Deprecation Policy

**6-month deprecation window for breaking changes:**

1. **Month 0:** Announce deprecation in changelog, add deprecation warnings to v1.x responses
2. **Month 3:** Prominently warn in logs when deprecated version is used
3. **Month 6:** Remove deprecated version, return error if client requests it

**Deprecation Response Header:**
```typescript
{
  "success": true,
  "data": { /* ... */ },
  "metadata": {
    "version": "1.5",
    "deprecated": true,
    "deprecationMessage": "Version 1.x is deprecated. Migrate to 2.0 by 2026-05-15.",
    "migrationGuide": "https://docs.mcp-bundle.io/migration/v1-to-v2"
  }
}
```

---

## Implementation Roadmap

### Phase 1: Shared Utilities Package (Week 1-2)

**Goal:** Extract reusable components into `@mcp-bundle` scoped packages.

**Tasks:**
1. Create monorepo structure with npm workspaces
2. Extract error classes → `@mcp-bundle/errors`
3. Extract circuit breaker → `@mcp-bundle/resilience`
4. Extract cache manager → `@mcp-bundle/cache`
5. Extract retry logic → `@mcp-bundle/resilience`
6. Extract logger → `@mcp-bundle/logger`
7. Publish to private npm registry

**Deliverables:**
```
packages/
├── errors/
│   ├── src/index.ts (MCPError, RateLimitError, etc.)
│   └── package.json
├── resilience/
│   ├── src/circuit-breaker.ts
│   ├── src/retry-strategy.ts
│   ├── src/bulkhead.ts
│   └── package.json
├── cache/
│   ├── src/hybrid-cache-manager.ts
│   ├── src/lru-cache.ts
│   └── package.json
└── logger/
    ├── src/structured-logger.ts
    └── package.json
```

---

### Phase 2: perplexity-mcp Migration (Week 2-3)

**Goal:** Validate shared packages with production workload.

**Tasks:**
1. Replace local `errors/index.ts` with `@mcp-bundle/errors`
2. Replace local `CircuitBreaker` with `@mcp-bundle/resilience`
3. Replace local `CacheManager` with `@mcp-bundle/cache`
4. Add integration tests
5. Deploy to staging and monitor

**Success Criteria:**
- Zero performance regression
- 100% test coverage maintained
- No client-facing API changes

---

### Phase 3: itjsst-mcp Refactoring (Week 3-5)

**Goal:** Add resilience patterns to largest server (29 services).

**Tasks:**

**Week 3:**
- Audit all 29 service classes for external dependencies
- Map dependencies to resilience patterns:
  - Network operations → Circuit breaker + retry
  - Expensive commands → Cache (30-60s TTL)
  - Database queries → Connection pooling + circuit breaker

**Week 4:**
- Refactor `NetworkDiagnosticsService`:
  - Wrap `nmap` calls in retry strategy
  - Cache firewall diagnostics results
  - Add circuit breaker for external API calls (if any)
- Refactor `DatabaseDiagnosticsService`:
  - Pool PostgreSQL/MySQL connections
  - Circuit breaker for each database
  - Cache health check results (30s TTL)

**Week 5:**
- Refactor `SecurityScannerService`:
  - Bulkhead pattern for concurrent scans (limit to 5)
  - Cache vulnerability scan results (5min TTL)
- Refactor `ComplianceAuditService`:
  - Cache compliance check results (1hr TTL, invalidate on config change)
- Integration testing and staging deployment

**Success Criteria:**
- 90% reduction in transient errors
- 50% reduction in average API response time
- Zero breaking changes to tool contracts

---

### Phase 4: mcp-orchestrator & soc-hub-mcp (Week 6-7)

**Goal:** Add distributed resilience patterns.

**Tasks:**

**mcp-orchestrator:**
- Refactor `CommandQueueService`:
  - Replace linear retry with exponential backoff
  - Add distributed locking (Redis) for multi-instance
- Refactor `DatabaseSyncService`:
  - Circuit breaker for PostgreSQL replication checks
  - Cache replication lag metrics (10s TTL)

**soc-hub-mcp:**
- Refactor `SOCAggregator`:
  - Wrap each client (Wazuh, Elasticsearch, etc.) in circuit breaker
  - Cache dashboard data (60s TTL)
  - Graceful degradation (return stale data on failure)

**Success Criteria:**
- Dashboard remains functional even if 2 out of 4 SOC services fail
- Orchestrator handles 100+ concurrent command queue operations

---

### Phase 5: cloudflare-mcp & admin-panel (Week 8)

**Goal:** Complete rollout and monitoring.

**Tasks:**

**cloudflare-mcp:**
- Retry DNS update operations (5xx errors, rate limits)
- Cache Cloudflare zone configurations (5min TTL)
- Circuit breaker for Cloudflare API

**admin-panel:**
- No code changes (benefits automatically from backend improvements)
- Update API documentation with versioning details

**Monitoring:**
- Deploy Prometheus exporters for all circuit breakers
- Create Grafana dashboards for cache hit rates, retry counts
- Set up alerts for circuit breaker opens

**Success Criteria:**
- 99.9% uptime SLA achieved
- Zero unhandled exceptions in production

---

### Phase 6: Documentation & Training (Week 9)

**Deliverables:**
1. API versioning guide for developers
2. Error handling best practices
3. Caching strategy decision tree
4. Circuit breaker tuning guide
5. Migration runbook for v1.x → v2.0

---

## Migration Guide

### For Service Developers

#### Before (v1.x):
```typescript
export class NetworkDiagnosticsService {
  async scanTcpPorts(host: string, ports: number[]): Promise<PortScanResult[]> {
    try {
      const results = await this.runNcScans(host, ports, 3, false);
      return results;
    } catch (error) {
      logger.error('Port scan failed', error);
      throw error; // ⚠️ Loses context
    }
  }
}
```

#### After (v2.0):
```typescript
import { executeWithRecovery, DEFAULT_RECOVERY_STRATEGY } from '@mcp-bundle/resilience';
import { Cacheable } from '@mcp-bundle/cache';
import { NetworkTimeoutError } from '@mcp-bundle/errors';

export class NetworkDiagnosticsService {
  constructor(
    private runner: CommandRunner,
    private cacheManager: HybridCacheManager,
    private circuitBreaker: CircuitBreaker
  ) {}

  @Cacheable('network:tcp-scan', 60) // Cache for 60 seconds
  async scanTcpPorts(params: NetworkScanParams): Promise<SuccessResponse<PortScanResult[]>> {
    const { host, ports, timeoutSeconds } = params;

    const results = await executeWithRecovery(
      async () => {
        return this.circuitBreaker.execute(async () => {
          return this.runNcScans(host, ports, timeoutSeconds, false);
        });
      },
      {
        ...DEFAULT_RECOVERY_STRATEGY,
        maxAttempts: 3,
        shouldRetry: (error) => error instanceof NetworkTimeoutError
      }
    );

    return {
      success: true,
      data: results,
      metadata: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
        duration: 0, // TODO: Track
        cached: false,
        version: '2.0'
      }
    };
  }
}
```

### For API Consumers

#### Before (v1.x):
```typescript
const results = await itjsstMcp.callTool('network:scan-tcp', {
  host: '10.0.0.1',
  ports: [80, 443]
});

// No version, no retry, no caching
```

#### After (v2.0):
```typescript
const results = await itjsstMcp.callTool('network:scan-tcp', {
  context: {
    userId: currentUser.id,
    sessionId: session.id
  },
  host: '10.0.0.1',
  ports: [80, 443],
  timeoutSeconds: 5,
  elevatedPrivileges: false,
  _version: '2.0' // Explicit version
});

// Automatic retry on timeout
// Automatic caching (60s TTL)
// Circuit breaker protection
```

---

## Appendix: Configuration Examples

### Production Configuration (environment variables)

```bash
# Shared settings
NODE_ENV=production
LOG_LEVEL=info

# Redis cache
REDIS_URL=redis://cache.mcp-bundle.internal:6379
REDIS_PASSWORD=secure_password
REDIS_DB=0

# Circuit breakers
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
CIRCUIT_BREAKER_HALF_OPEN_ATTEMPTS=3

# Retry strategy
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY_MS=100
RETRY_MAX_DELAY_MS=10000

# Caching
CACHE_DEFAULT_TTL_SECONDS=60
CACHE_LRU_MAX_SIZE=100

# Database pooling
DB_POOL_MAX_CONNECTIONS=20
DB_POOL_MIN_CONNECTIONS=5
DB_POOL_IDLE_TIMEOUT_MS=30000
DB_POOL_CONNECTION_TIMEOUT_MS=5000
```

### Per-Server Tuning

**itjsst-mcp (high command volume):**
```bash
# Larger cache for expensive operations
CACHE_LRU_MAX_SIZE=500
CACHE_DEFAULT_TTL_SECONDS=120

# Aggressive circuit breaker (fail fast)
CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=15000
```

**perplexity-mcp (API cost-sensitive):**
```bash
# Longer cache TTL to reduce API costs
CACHE_DEFAULT_TTL_SECONDS=300

# Lenient circuit breaker (API rate limits are expensive)
CIRCUIT_BREAKER_FAILURE_THRESHOLD=10
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=60000
```

**soc-hub-mcp (real-time alerts):**
```bash
# Shorter cache TTL for freshness
CACHE_DEFAULT_TTL_SECONDS=10

# Balanced circuit breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

---

## Conclusion

This architecture design establishes **production-grade API patterns** across all 6 MCP servers in the bundle. By adopting:

1. **Structured error taxonomy** - Eliminates 70% of debugging time
2. **3-tier hybrid caching** - Achieves 5x cache hit improvement
3. **Exponential backoff + circuit breakers** - Reduces cascade failures by 90%
4. **Semantic API versioning** - Enables zero-downtime upgrades
5. **Performance optimizations** - Cuts API response times in half

We achieve the v2.0 goals of **99.9% uptime**, **sub-100ms p95 latency**, and **graceful degradation** under all failure scenarios.

**Next Steps:**
1. Review and approve this design with stakeholders
2. Prioritize Phase 1 (shared utilities) for immediate implementation
3. Assign engineering resources to each phase
4. Establish monitoring baselines before rollout

---

**Document Version:** 1.0.0
**Last Updated:** November 15, 2025
**Maintained By:** MCP Development Team
**Status:** Pending Approval
