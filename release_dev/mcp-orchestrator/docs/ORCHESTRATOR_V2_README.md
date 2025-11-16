# MCP Orchestrator v2.0

**Advanced Agent Coordination and Command Management System**

Version: 2.0.0
Status: Production Ready
Last Updated: November 15, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Quick Start](#quick-start)
5. [Components](#components)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)
8. [Metrics & Monitoring](#metrics--monitoring)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)

---

## Overview

MCP Orchestrator v2.0 is a production-grade command orchestration and agent management system designed for distributed MCP (Model Context Protocol) server environments. It provides:

- **Agent Registry**: Full lifecycle management of MCP agents with health monitoring
- **Priority Queue**: SLA-aware command queuing with priority levels
- **Retry & DLQ**: Automatic retry with exponential backoff and dead letter queue
- **Event System**: Comprehensive event tracking and history
- **Metrics**: Prometheus-compatible metrics for observability
- **High Availability**: Designed for 24/7 operation with graceful degradation

---

## Features

### Agent Registry v2.0

- **Lifecycle Management**: Register, unregister, and track agent status
- **Health Monitoring**: Automatic heartbeat detection (configurable intervals)
- **Status Tracking**: Online, offline, degraded states with automatic transitions
- **Capability Discovery**: Find agents by capabilities, type, or load
- **Performance Metrics**: Request counts, error rates, response times (avg, p95, p99)
- **Auto-Recovery**: Agents auto-recover to online on heartbeat reception

**Key Features:**
- Heartbeat monitoring every 30s (configurable)
- Auto-mark offline after 2 minutes without heartbeat
- Mark degraded when approaching timeout (80% threshold)
- Per-agent request/error tracking
- Load-based agent selection

### Priority Queue v2.0

- **Priority Levels**: CRITICAL, HIGH, MEDIUM, LOW
- **SLA Tracking**: Per-priority SLA with breach detection
- **FIFO within Priority**: Fair ordering within same priority level
- **Size Limits**: Configurable max queue size (default 10,000)
- **Metrics**: Wait times, SLA compliance, queue depth by priority

**Priority SLAs (Default):**
- CRITICAL: 1 second
- HIGH: 5 seconds
- MEDIUM: 30 seconds
- LOW: 60 seconds

**SLA Events:**
- `queue:sla_warning`: Approaching SLA breach (80% threshold)
- `queue:sla_breach`: SLA exceeded

### Command Executor with Retry

- **Automatic Retry**: Uses shared resilience library
- **Exponential Backoff**: Configurable base delay and multiplier
- **Max Attempts**: Default 3 retries (configurable)
- **Jitter**: Optional randomization to prevent thundering herd
- **Retry Predicates**: Smart retry logic (skip validation errors)

**Default Retry Config:**
- Max Attempts: 3
- Base Delay: 1 second
- Max Delay: 10 seconds
- Backoff Multiplier: 2x
- Jitter: Enabled

### Dead Letter Queue

- **Failed Command Storage**: Commands that fail after max retries
- **Failure Tracking**: Capture failure reason and error details
- **Manual Replay**: Replay individual or all failed commands
- **Auto-Replay**: Optional automatic replay (disabled by default)
- **Retention Policy**: Auto-purge after 7 days (configurable)

### Event System

- **18 Event Types**: Comprehensive lifecycle tracking
- **Event History**: Last 1000 events (configurable)
- **Event Filtering**: Filter by type, date range, search terms
- **Event Export**: JSON export for auditing
- **Type-Safe**: TypeScript event definitions

**Event Categories:**
- Agent events (6): registered, unregistered, status_changed, heartbeat_failed, degraded, recovered
- Command events (6): queued, executing, completed, failed, retry, dead_letter
- Queue events (3): sla_breach, sla_warning, size_limit
- System events (3): started, stopped, error

### Metrics Collection

- **Prometheus Integration**: Standard Prometheus metrics endpoint
- **Default Metrics**: Node.js process metrics (CPU, memory, GC)
- **Custom Metrics**: 20+ orchestrator-specific metrics
- **Metric Types**: Counters, Gauges, Histograms

**Metrics Endpoint:** `http://localhost:9090/metrics`

**Key Metrics:**
- `orchestrator_commands_total` - Total commands (by status)
- `orchestrator_command_duration_seconds` - Execution time histogram
- `orchestrator_queue_depth` - Current queue size
- `orchestrator_queue_sla_breaches_total` - SLA breaches by priority
- `orchestrator_agents_online` - Online agent count
- `orchestrator_dlq_size` - Dead letter queue size

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator v2.0                         │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Agent     │  │   Priority   │  │   Command    │      │
│  │   Registry   │  │    Queue     │  │  Executor    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
│         └──────────────────┴──────────────────┘               │
│                            │                                  │
│         ┌──────────────────┴──────────────────┐              │
│         │                                      │               │
│  ┌──────▼───────┐  ┌──────────────┐  ┌───────▼──────┐      │
│  │    Event     │  │     Dead     │  │   Metrics    │      │
│  │   System     │  │    Letter    │  │  Collector   │      │
│  │              │  │    Queue     │  │              │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
│                                               │               │
└───────────────────────────────────────────────┼──────────────┘
                                                 │
                                                 ▼
                                        ┌────────────────┐
                                        │   Prometheus   │
                                        │     Server     │
                                        └────────────────┘
```

**Component Interaction:**
1. Agents register with Registry
2. Commands enqueue to Priority Queue
3. Executor dequeues and executes with retry
4. Failed commands go to DLQ
5. All actions emit events
6. Metrics collected continuously

---

## Quick Start

### Installation

```bash
cd /path/to/mcp-orchestrator
npm install
```

### Basic Usage

```typescript
import { Orchestrator } from './src/services/orchestrator.js';

// Create orchestrator with default config
const orchestrator = new Orchestrator();

// Start the orchestrator
await orchestrator.start();

// Register an agent
orchestrator.registerAgent({
  id: 'agent-1',
  name: 'PostgreSQL Agent',
  type: 'mcp-server',
  version: '1.0.0',
  capabilities: ['postgres', 'database'],
  healthEndpoint: 'http://localhost:8080/health',
});

// Enqueue a command
orchestrator.enqueue('cmd-1', {
  action: 'query',
  sql: 'SELECT * FROM users',
}, 'HIGH');

// Execute command
const result = await orchestrator.executeCommand(
  { commandId: 'cmd-1', data: { action: 'query' } },
  async (data) => {
    // Your execution logic
    return { rows: [] };
  }
);

// Get health status
const health = orchestrator.getHealth();
console.log(health);

// Stop gracefully
await orchestrator.stop();
```

### With Configuration

```typescript
import { Orchestrator } from './src/services/orchestrator.js';

const orchestrator = new Orchestrator({
  queue: {
    maxSize: 5000,
    enableSLATracking: true,
    slaWarningThreshold: 0.75,
  },
  agents: {
    heartbeatInterval: 15000, // 15s
    heartbeatTimeout: 60000,  // 1min
  },
  retry: {
    maxAttempts: 5,
    baseDelay: 500,
    maxDelay: 5000,
  },
  metrics: {
    enabled: true,
    prometheusPort: 9091,
  },
});

await orchestrator.start();
```

---

## Components

### 1. Agent Registry

**File:** `src/services/agentRegistry.ts`

**Purpose:** Manage lifecycle of MCP agents.

**Methods:**

```typescript
// Register agent
registerAgent(request: AgentRegistrationRequest): AgentMetadata

// Unregister agent
unregisterAgent(agentId: string, reason?: string): boolean

// Update status
updateAgentStatus(agentId: string, status: AgentStatus): boolean

// Record heartbeat
recordHeartbeat(agentId: string): boolean

// Record request metrics
recordRequest(agentId: string, responseTime: number, isError: boolean): void

// Query agents
getAgent(agentId: string): AgentMetadata | undefined
getAllAgents(): AgentMetadata[]
getAgentsByType(type: AgentType): AgentMetadata[]
getHealthyAgents(): AgentMetadata[]
getAgentsByCapability(capability: string): AgentMetadata[]
findBestAgent(capability: string): AgentMetadata | null

// Get stats
getStats(): AgentRegistryStats
getAgentHealth(agentId: string): AgentHealthResponse | null
```

**Events:**
- `agent:registered` - New agent registered
- `agent:unregistered` - Agent removed
- `agent:status_changed` - Status transition
- `agent:heartbeat_failed` - Missed heartbeat
- `agent:degraded` - Agent degraded
- `agent:recovered` - Agent recovered to online

### 2. Priority Queue

**File:** `src/services/priorityQueue.ts`

**Purpose:** Manage prioritized command queue with SLA tracking.

**Methods:**

```typescript
// Queue operations
enqueue<T>(id: string, data: T, priority: Priority): QueueItem<T>
dequeue<T>(): QueueItem<T> | null
peek<T>(): QueueItem<T> | null
size(): number
clear(): void

// Query
getByPriority(priority: Priority): QueueItem[]
getItemsApproachingSLA(): QueueItem[]

// Metrics
getMetrics(): QueueMetrics
resetMetrics(): void
```

**Events:**
- `item:enqueued` - Item added to queue
- `item:dequeued` - Item removed from queue
- `queue:sla_breach` - SLA exceeded
- `queue:sla_warning` - Approaching SLA breach
- `queue:size_limit` - Max size reached

### 3. Command Executor

**File:** `src/services/commandExecutor.ts`

**Purpose:** Execute commands with retry logic and DLQ integration.

**Methods:**

```typescript
// Execution
execute<T, R>(
  context: CommandContext<T>,
  executor: (data: T) => Promise<R>
): Promise<ExecutionResult<R>>

// Batch execution
executeBatch<T, R>(
  contexts: CommandContext<T>[],
  executor: (data: T) => Promise<R>
): Promise<ExecutionResult<R>[]>

// Parallel execution
executeParallel<T, R>(
  contexts: CommandContext<T>[],
  executor: (data: T) => Promise<R>,
  concurrency: number
): Promise<ExecutionResult<R>[]>

// DLQ replay
replayFromDLQ<T, R>(
  commandId: string,
  executor: (data: T) => Promise<R>
): Promise<ExecutionResult<R> | null>

replayAllFromDLQ<T, R>(
  executor: (data: T) => Promise<R>
): Promise<ExecutionResult<R>[]>
```

**Events:**
- `command:executing` - Command started
- `command:completed` - Command succeeded
- `command:failed` - Command failed
- `command:retry` - Retry attempt
- `command:dead_letter` - Added to DLQ

### 4. Dead Letter Queue

**File:** `src/services/deadLetterQueue.ts`

**Purpose:** Store and manage failed commands.

**Methods:**

```typescript
// Add to DLQ
add<T>(
  id: string,
  data: T,
  failureReason: string,
  retryCount: number,
  lastError?: string
): DeadLetterItem<T>

// Query DLQ
get(id: string): DeadLetterItem | undefined
getAll(): DeadLetterItem[]

// Replay
replay(id: string): T | null
replayAll(): T[]

// Management
remove(id: string): boolean
purgeOld(): number
clear(): void

// Metrics
getMetrics(): DLQMetrics
```

**Events:**
- `item:added` - Item added to DLQ
- `item:replayed` - Item replayed
- `item:purged` - Old items removed

### 5. Event System

**File:** `src/services/eventSystem.ts`

**Purpose:** Centralized event tracking and history.

**Methods:**

```typescript
// Emit event
emitEvent(type: OrchestratorEventType, data: unknown): void

// Query events
getHistory(filter?: EventFilter): OrchestratorEvent[]
getEventsByType(type: OrchestratorEventType): OrchestratorEvent[]
getRecentEvents(count: number): OrchestratorEvent[]
searchEvents(searchTerm: string): OrchestratorEvent[]

// Stats
getStats(): EventStats
getEventCount(type?: OrchestratorEventType): number

// Management
clearHistory(): void
purgeOldEvents(): number
exportEvents(filter?: EventFilter): string
```

### 6. Metrics Collector

**File:** `src/services/metricsCollector.ts`

**Purpose:** Collect and expose Prometheus metrics.

**Methods:**

```typescript
// Get metrics
getMetrics(): Promise<string>
getRegistry(): Registry

// Record metrics
recordCommandExecution(status: 'success' | 'error', duration: number): void
recordCommandError(errorType: string): void
recordCommandRetry(): void
updateQueueDepth(total: number, byPriority: Record<string, number>): void
recordSLABreach(priority: string): void
updateAgentCounts(total, online, offline, degraded, byType): void
recordAgentRequest(agentId, responseTime, isError): void
updateDLQSize(size: number): void

// Management
reset(): void
```

---

## Configuration

See [ORCHESTRATOR_CONFIGURATION.md](./ORCHESTRATOR_CONFIGURATION.md) for detailed configuration guide.

**Configuration File:** `src/config/orchestrator.config.ts`

**Environment Variables:**

```bash
# Queue Configuration
QUEUE_MAX_SIZE=10000
ENABLE_SLA_TRACKING=true
SLA_WARNING_THRESHOLD=0.8

# Agent Configuration
AGENT_HEARTBEAT_INTERVAL=30000
AGENT_HEARTBEAT_TIMEOUT=120000
AGENT_MAX_RETRIES=3
AGENT_STALE_TIMEOUT=300000

# Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY=1000
RETRY_MAX_DELAY=10000
RETRY_BACKOFF_MULTIPLIER=2
RETRY_JITTER=true

# Dead Letter Queue
DLQ_ENABLED=true
DLQ_MAX_SIZE=1000
DLQ_RETENTION_DAYS=7
DLQ_AUTO_REPLAY=false
DLQ_AUTO_REPLAY_INTERVAL=3600000

# Metrics
METRICS_ENABLED=true
PROMETHEUS_PORT=9090
PROMETHEUS_PATH=/metrics
COLLECT_DEFAULT_METRICS=true

# Events
EVENTS_ENABLED=true
EVENT_HISTORY_SIZE=1000
EVENT_RETENTION_DAYS=7

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_TIMESTAMP=true
LOG_CORRELATION_ID=true
```

---

## API Reference

See [ORCHESTRATOR_API.md](./ORCHESTRATOR_API.md) for complete API documentation.

---

## Metrics & Monitoring

### Prometheus Integration

**Metrics Endpoint:** `http://localhost:9090/metrics`

**Example Prometheus Configuration:**

```yaml
scrape_configs:
  - job_name: 'mcp-orchestrator'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
    scrape_timeout: 10s
```

### Key Metrics

**Command Metrics:**
- `orchestrator_commands_total{status}` - Total commands by status
- `orchestrator_command_errors_total{error_type}` - Errors by type
- `orchestrator_command_retries_total` - Total retries
- `orchestrator_command_duration_seconds{status}` - Execution duration histogram

**Queue Metrics:**
- `orchestrator_queue_depth` - Current queue size
- `orchestrator_queue_depth_by_priority{priority}` - Queue depth by priority
- `orchestrator_queue_sla_breaches_total{priority}` - SLA breaches
- `orchestrator_queue_wait_time_seconds{priority}` - Wait time histogram

**Agent Metrics:**
- `orchestrator_agents_total{type}` - Total agents by type
- `orchestrator_agents_online` - Online agents
- `orchestrator_agents_offline` - Offline agents
- `orchestrator_agents_degraded` - Degraded agents
- `orchestrator_agent_requests_total{agent_id}` - Requests per agent
- `orchestrator_agent_response_time_seconds{agent_id}` - Response time histogram

**DLQ Metrics:**
- `orchestrator_dlq_size` - Current DLQ size
- `orchestrator_dlq_added_total` - Items added to DLQ
- `orchestrator_dlq_replayed_total` - Items replayed from DLQ

**System Metrics:**
- `orchestrator_uptime_seconds` - Uptime
- `orchestrator_events_total{event_type}` - Events by type

### Grafana Dashboards

Import the provided Grafana dashboard: `deployment/grafana-dashboard.json`

**Panels:**
- System Overview (uptime, health, version)
- Command Throughput (commands/sec by status)
- Queue Depth (by priority, with SLA breaches)
- Agent Health (online/offline/degraded counts)
- SLA Compliance (percentage by priority)
- Response Time Percentiles (p50, p95, p99)
- DLQ Size Trend
- Event Rate by Type

---

## Testing

### Unit Tests

```bash
npm run test
```

**Test Files:**
- `tests/unit/agentRegistry.test.ts` - Agent registry (300+ lines, 30+ tests)
- `tests/unit/priorityQueue.test.ts` - Priority queue (250+ lines, 25+ tests)
- `tests/unit/deadLetterQueue.test.ts` - DLQ (200+ lines, 20+ tests)
- `tests/unit/commandExecutor.test.ts` - Command executor (200+ lines, 15+ tests)
- `tests/unit/eventSystem.test.ts` - Event system (150+ lines, 15+ tests)
- `tests/unit/metricsCollector.test.ts` - Metrics (150+ lines, 10+ tests)

**Target Coverage:** 90%+ (achieved 87.5% in Phase 1)

### Integration Tests

```bash
npm run test:integration
```

### Load Tests

```bash
npm run test:load
```

**Load Test Scenarios:**
- 1000 commands/sec sustained
- 100+ concurrent SSE connections
- 1000+ agents registered
- 10,000 items in queue

---

## Deployment

### Production Deployment

```bash
# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Or with systemd
sudo systemctl start mcp-orchestrator
```

### Docker Deployment

```bash
docker build -t mcp-orchestrator:2.0.0 .
docker run -d \
  -p 9090:9090 \
  -e METRICS_ENABLED=true \
  -e PROMETHEUS_PORT=9090 \
  mcp-orchestrator:2.0.0
```

### Health Checks

```bash
# Basic health
curl http://localhost:9090/health

# Detailed health (via orchestrator API)
curl http://localhost:8080/api/health
```

---

## Troubleshooting

### Common Issues

**Issue:** Agents marked offline despite sending heartbeats

**Solution:** Check heartbeat interval and timeout configuration. Default timeout is 2 minutes.

```typescript
{
  agents: {
    heartbeatInterval: 30000,  // 30s
    heartbeatTimeout: 120000,  // 2min
  }
}
```

**Issue:** SLA breaches for LOW priority commands

**Solution:** Adjust SLA thresholds or increase worker capacity:

```typescript
{
  queue: {
    priorities: [
      { level: 'LOW', sla: 120000, order: 3 }, // Increase to 2min
    ],
  }
}
```

**Issue:** DLQ filling up

**Solution:** Investigate recurring failures and adjust retry logic:

```bash
# Get DLQ contents
const items = dlq.getAll();
console.log(items);

# Check common failure reasons
const reasons = items.reduce((acc, item) => {
  acc[item.failureReason] = (acc[item.failureReason] || 0) + 1;
  return acc;
}, {});
```

**Issue:** High memory usage

**Solution:** Reduce event history size or queue max size:

```typescript
{
  events: {
    maxHistorySize: 500,  // Reduce from 1000
  },
  queue: {
    maxSize: 5000,  // Reduce from 10000
  }
}
```

### Debugging

**Enable debug logging:**

```bash
LOG_LEVEL=debug npm start
```

**Monitor events in real-time:**

```typescript
orchestrator.eventSystem.on('event', (event) => {
  console.log(`[${event.type}]`, event.data);
});
```

**Check Prometheus metrics:**

```bash
curl http://localhost:9090/metrics | grep orchestrator
```

---

## Support

For issues, questions, or contributions:

- **GitHub Issues:** https://github.com/mcp-bundle/orchestrator/issues
- **Documentation:** https://docs.mcp-bundle.dev/orchestrator
- **Slack:** #mcp-orchestrator

---

**Version:** 2.0.0
**License:** MIT
**Maintainers:** MCP Bundle Team
