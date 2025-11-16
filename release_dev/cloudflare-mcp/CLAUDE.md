# SERVER-MCP – Technical Implementation Guide

## Overview

SERVER-MCP is an on-server Model Context Protocol agent for PostgreSQL, Redis, Keycloak, and NGINX management on Ubuntu infrastructure. Unlike IT-MCP (which runs on desktops and uses SSH for remote administration), SERVER-MCP runs **directly on Ubuntu servers** and executes all operations locally.

This technical specification documents the architecture, services, MCP tools, deployment, and integration with the distributed IT-MCP agent registry.

---

## 1. Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    IT-MCP (Desktop/Laptop)                   │
│  - Cross-platform diagnostics                                │
│  - Remote administration via SSH/WinRM                        │
│  - Central command dispatch                                   │
└───────────────────┬──────────────────────────────────────────┘
                    │
                    │ HTTPS + JWT Auth
                    │ (Keycloak)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│          Agent Registry (server.acdev.host)                  │
│  - PostgreSQL: Command queue, agent registry                 │
│  - Redis: Pub/sub, real-time heartbeat                       │
│  - Keycloak: JWT authentication, RBAC                        │
└───────────────────┬──────────────────────────────────────────┘
                    │
                    │ Local execution
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVER-MCP (Ubuntu Server)                      │
│  ✓ PostgreSQL management (direct pg client)                 │
│  ✓ Redis operations (direct ioredis client)                 │
│  ✓ Keycloak admin (Admin API)                               │
│  ✓ NGINX monitoring (log analysis, config testing)          │
│  ✓ System metrics (disk, memory, CPU, network)              │
│  ✓ Automated backups (nightly PostgreSQL + Redis)           │
│  ✓ Service health checks & auto-restart                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Differences from IT-MCP

| Aspect           | IT-MCP                                           | SERVER-MCP                                                         |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| **Deployment**   | Desktop/laptop (macOS/Windows/Linux)             | Ubuntu server (e.g., server.acdev.host)                            |
| **Execution**    | SSH/WinRM to remote servers                      | Local commands via sudo                                            |
| **Database**     | SQLite primary + PostgreSQL sync (optional)      | PostgreSQL primary + SQLite cache                                  |
| **Focus**        | Cross-platform diagnostics, remote admin         | Database management, service health, backups                       |
| **MCP Client**   | Claude Desktop, CLI tools                        | Headless (API-driven by IT-MCP or cron)                            |
| **Capabilities** | `local-shell`, `ssh-linux`, `ssh-macos`, `winrm` | `postgres-admin`, `redis-admin`, `keycloak-admin`, `ubuntu-server` |

---

## 2. Project Structure

```
/opt/server-mcp/
├── bin/                     # Compiled JavaScript (npm start)
├── config/                  # Configuration modules
│   ├── capabilities.ts      # Agent capability definitions
│   ├── stageFramework.ts    # Structured thinking framework
│   └── vaultPaths.ts        # Vault integration paths
├── src/                     # TypeScript source
│   ├── index.ts             # Main MCP server entry point
│   ├── utils/               # Core utilities
│   │   ├── commandRunner.ts # Safe command execution
│   │   ├── logger.ts        # Winston logger
│   │   └── validators.ts    # Input validation
│   ├── services/            # Business logic services
│   │   ├── postgresManager.ts
│   │   ├── redisManager.ts
│   │   ├── keycloakManager.ts
│   │   ├── nginxMonitoring.ts
│   │   ├── systemMetrics.ts
│   │   ├── databaseDiagnostics.ts
│   │   ├── serverAdmin.ts
│   │   ├── structuredThinking.ts
│   │   ├── autoDiscovery.ts
│   │   ├── keycloakAuth.ts
│   │   ├── commandQueue.ts
│   │   ├── databaseSync.ts
│   │   ├── healthCheck.ts
│   │   ├── automatedMaintenance.ts
│   │   └── reportingHub.ts
│   └── tools/               # MCP tool registration
│       └── registerTools.ts
├── systemd/                 # System service files
│   └── server-mcp.service
├── deployment/              # Deployment scripts
├── docs/                    # Documentation
├── .env.example             # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Core Services

### 3.1 PostgresManagerService

**File:** `src/services/postgresManager.ts`

**Purpose:** Direct PostgreSQL management using native `pg` client (not shell commands)

**Features:**

- `getActiveConnections()`: Real-time connection stats by state (idle/active/waiting)
- `getReplicationLag()`: Monitor streaming replication (lag bytes/seconds, WAL positions)
- `getTableBloat()`: Identify tables with high dead tuple counts
- `getSlowQueries()`: Query `pg_stat_statements` for slow queries (requires extension)
- `getIndexUsage()`: Analyze index usage, identify unused indexes
- `runVacuum(database)`: Execute VACUUM ANALYZE with timing
- `reindexDatabase(database)`: Rebuild all indexes
- `createBackup(database, destination)`: pg_dump with gzip compression
- `close()`: Gracefully close connection pool

**Configuration:**

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<secret>
POSTGRES_DB=postgres
POSTGRES_MAX_CONNECTIONS=20
```

**Libraries:** `pg` (PostgreSQL client with connection pooling)

---

### 3.2 RedisManagerService

**File:** `src/services/redisManager.ts`

**Purpose:** Direct Redis management using native `ioredis` client

**Features:**

- `ping()`: Health check
- `getInfo()`: Server version, uptime, clients, memory, ops/sec, role (master/slave)
- `getMemoryStats()`: Memory usage, fragmentation ratio, allocator, eviction policy
- `getKeyspaceStats()`: Keys/expires/avg TTL per database
- `getSlowLog()`: Recent slow commands with duration and client info
- `getClientList()`: Connected clients with age, idle time, current command
- `bgsave()`: Trigger background RDB save
- `flushDatabase(db)`: Clear database (with safety logging)

**Configuration:**

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secret>
REDIS_DB=0
```

**Libraries:** `ioredis` (Redis client with auto-reconnect)

---

### 3.3 KeycloakManagerService

**File:** `src/services/keycloakManager.ts`

**Purpose:** Keycloak Admin REST API client

**Features:**

- `authenticate()`: OAuth2 client credentials flow (JWT token)
- `getRealmStats(realm)`: User/client/role/group counts, realm enabled status
- `getActiveSessions(realm)`: Active login sessions with client mapping
- `getClientStats(realm)`: Client configurations (public/confidential, redirect URIs)
- `getEventStats(realm)`: Admin events by type, recent event log
- `createUser(realm, userData)`: Automated user provisioning with password set
- `rotateClientSecret(realm, clientId)`: Generate new client secret
- `getUserCount(realm)`: Total users in realm
- `listUsers(realm)`: User list with metadata

**Configuration:**

```bash
KEYCLOAK_BASE_URL=https://acdev.host:8080
KEYCLOAK_REALM=mcp-agents
KEYCLOAK_CLIENT_ID=server-mcp-agent
KEYCLOAK_CLIENT_SECRET=<secret>
```

**Libraries:** `@keycloak/keycloak-admin-client`

**Authentication:** Auto-refresh JWT token every 55 seconds

---

### 3.4 NginxMonitoringService

**File:** `src/services/nginxMonitoring.ts`

**Purpose:** NGINX log analysis and configuration management

**Features:**

- `getAccessLogStats(minutes)`: Parse NGINX access logs (combined format)
  - Total requests, by status code, by HTTP method
  - Top 10 paths, top 10 IPs
  - Average response size
  - Time-based filtering (last N minutes)
- `getErrorLogRecent(lines)`: Parse NGINX error logs with timestamp, level, message, client IP
- `testConfiguration()`: Run `nginx -t` to validate config
- `getUpstreamHealth()`: Extract upstream definitions from config
- `reloadConfig()`: Graceful NGINX config reload

**Configuration:**

```bash
NGINX_ACCESS_LOG=/var/log/nginx/access.log
NGINX_ERROR_LOG=/var/log/nginx/error.log
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf
```

**Log Parsing:** Regex-based parsing of standard NGINX combined log format

---

### 3.5 SystemMetricsService

**File:** `src/services/systemMetrics.ts`

**Purpose:** Linux system health metrics

**Features:**

- `getSystemOverview()`: Uptime, load average (1/5/15min), memory (total/used/free/%), disk usage (all mounts), CPU cores/model
- `getProcessList(limit)`: Top N processes by CPU usage
- `getDiskIO()`: iostat metrics (TPS, read/write per second)
- `getNetworkStats()`: Network interface stats from `/proc/net/dev` (RX/TX bytes/packets)
- `getJournalErrors(minutes)`: Parse journalctl JSON output for errors in last N minutes
- `getServiceStatus(serviceName)`: Check if systemd service is active/enabled

**Dependencies:** Optional `iostat` command (from `sysstat` package)

**Linux-Specific:** Uses Linux-specific commands and `/proc` filesystem

---

### 3.6 DatabaseDiagnosticsService

**File:** `src/services/databaseDiagnostics.ts`

**Purpose:** Local-only health checks for all infrastructure components

**Features:**

- `runLocal(suites)`: Run specified diagnostic suites
  - `postgres`: PostgreSQL connection, version, replication, slow queries
  - `redis`: Redis connection, memory, keyspace, slow log
  - `nginx`: NGINX status, config test, error log
  - `keycloak`: Keycloak realm stats, sessions, events
  - `firewall`: UFW status, active rules
  - `system`: Uptime, load, memory, disk, failed services

**Simplified from IT-MCP:** No remote mode (removed SSH layer)

---

### 3.7 ServerAdminService

**File:** `src/services/serverAdmin.ts`

**Purpose:** Ubuntu server administration (839 lines, copied from IT-MCP's UbuntuAdminService)

**Features:**

- Package management: APT update/upgrade/autoremove
- Service management: systemctl operations
- NGINX operations: config test, reload
- PM2 operations: status, logs
- Docker operations: ps, images, compose, logs, stats
- PostgreSQL operations: status, connections, vacuum, backup, restore
- Network diagnostics: interface inspection, MTR tracing, packet capture
- Virtualmin: domain/user management
- Filesystem operations: Samba, NFS, ACLs, ownership
- Security operations: SSH hardening, UFW, fail2ban, CIS audits

**No SSH Layer:** Service executes all commands locally via `CommandRunner`

---

### 3.8 StructuredThinkingService

**File:** `src/services/structuredThinking.ts`

**Purpose:** Structured reasoning management (cognitive framework)

**Features:**

- `capture(thought)`: Capture or revise thoughts with rich metadata (stage, quality score, tags, branches)
- `retrieve(filters)`: Retrieve filtered timelines (by stage, branch, importance, tags, full-text)
- `generateSummary(branch)`: Generate branch-aware summaries
- `inspectFramework()`: View reasoning framework stages
- `runDiagnostics()`: Detect stale or missing stages, unhealthy branches
- `syncStatus()`: Check PostgreSQL sync status
- `syncNow()`: Trigger PostgreSQL sync when `POSTGRES_CONNECTION_STRING` is configured

**Storage:** SQLite local cache (`mcp_cache.db`) with optional PostgreSQL sync

**Feedback Heuristics:** Detects stage dwell time, quality drops, repetitive content

---

### 3.9 Integration Services

#### AutoDiscoveryService

**File:** `src/services/autoDiscovery.ts`

**Purpose:** Agent registration with IT-MCP central registry

**Features:**

- Auto-registers on startup
- Advertises capabilities: `postgres-admin`, `redis-admin`, `keycloak-admin`, `ubuntu-server`
- Sends heartbeat to Redis every 30 seconds

---

#### KeycloakAuthService

**File:** `src/services/keycloakAuth.ts`

**Purpose:** JWT authentication for agent registry communication

**Features:**

- OAuth2 client credentials flow
- Auto-refresh token before expiration
- Includes `Authorization: Bearer <token>` in all registry API calls

---

#### CommandQueueService

**File:** `src/services/commandQueue.ts`

**Purpose:** Poll PostgreSQL command queue for remote jobs

**Features:**

- Processes jobs targeted to this agent
- Executes MCP tool operations
- Reports results back to registry

---

#### DatabaseSyncService

**File:** `src/services/databaseSync.ts`

**Purpose:** Sync structured thoughts from SQLite → PostgreSQL

**Configuration:**

```bash
POSTGRES_CONNECTION_STRING=postgresql://user:pass@host/db
```

---

## 4. MCP Tools

SERVER-MCP exposes **7 MCP tools** via the Model Context Protocol (all execute locally, no SSH):

| Tool                   | Description                     | Operations                                                                               |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `database-diagnostics` | Database health checks          | PostgreSQL/Redis/Keycloak/NGINX/firewall/system diagnostics (6 suites)                   |
| `postgres-manage`      | PostgreSQL operations           | connections, replication, bloat, slow-queries, index-usage, vacuum, reindex, backup      |
| `redis-manage`         | Redis operations                | info, memory, keyspace, slow-log, clients, bgsave, ping                                  |
| `keycloak-manage`      | Keycloak admin                  | realm-stats, sessions, clients, events, users, create-user, rotate-secret                |
| `nginx-monitor`        | NGINX monitoring                | access-stats, error-log, test-config, reload                                             |
| `system-metrics`       | System health                   | overview, processes, disk-io, network, journal-errors, service-status                    |
| `structured-thinking`  | Structured reasoning management | capture, revise, retrieve, summary, clear, framework, diagnostics, sync-status, sync-now |

**Tool Registration:** `src/tools/registerTools.ts` (778 lines)

**Features:**

- Zod schema validation for all parameters
- Dual content format (text + structuredContent) responses
- Standardized error handling with `handleError()` helper

---

## 5. Deployment

### 5.1 Installation

**Prerequisites:**

- Ubuntu Server 24.04 LTS (or compatible)
- Node.js 18.18+
- PostgreSQL 16+ running locally
- Redis 7+ running locally
- Keycloak running (Docker or standalone)
- NGINX installed
- Sudo access for the service user

**Setup Steps:**

```bash
# 1. Clone and install dependencies
cd /opt
sudo git clone <repository-url> server-mcp
cd server-mcp
sudo npm install

# 2. Configure environment
sudo cp .env.example .env
sudo nano .env
# Fill in PostgreSQL, Redis, Keycloak credentials

# 3. Build TypeScript
sudo npm run build

# 4. Create service user
sudo useradd -r -s /bin/false mcp-agent
sudo chown -R mcp-agent:mcp-agent /opt/server-mcp

# 5. Configure sudo access (edit /etc/sudoers.d/server-mcp)
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dump
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dumpall
mcp-agent ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t

# 6. Install systemd service
sudo cp systemd/server-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable server-mcp
sudo systemctl start server-mcp

# 7. Verify installation
sudo systemctl status server-mcp
sudo journalctl -u server-mcp -f
```

---

### 5.2 Systemd Service

**File:** `systemd/server-mcp.service`

**Features:**

- Runs as `mcp-agent` user
- Security hardening: `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`
- Auto-restart on failure
- Environment file: `/etc/server-mcp/server-mcp.env`
- Logs to journald

**Example:**

```ini
[Unit]
Description=SERVER-MCP - On-server MCP agent
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=mcp-agent
WorkingDirectory=/opt/server-mcp
ExecStart=/usr/bin/node /opt/server-mcp/dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/etc/server-mcp/server-mcp.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=/opt/server-mcp /var/backups/server-mcp

[Install]
WantedBy=multi-user.target
```

---

## 6. Security

### 6.1 Sudo Configuration

SERVER-MCP requires sudo access for specific operations:

- Service management: `systemctl`
- Container operations: `docker`
- Database backups: `pg_dump`, `pg_dumpall`
- NGINX config testing: `nginx -t`

**NEVER** grant `NOPASSWD: ALL` - only specific commands listed in `/etc/sudoers.d/server-mcp`.

---

### 6.2 Secret Management

**Production:** Use systemd credentials (not .env):

```bash
# Store secrets in systemd credentials directory
echo -n "mypassword" | sudo systemd-creds encrypt - /etc/credstore/postgres_password

# Reference in systemd service
LoadCredential=postgres_password:/etc/credstore/postgres_password

# Access in code
const password = process.env.CREDENTIALS_DIRECTORY
  ? fs.readFileSync(`${process.env.CREDENTIALS_DIRECTORY}/postgres_password`, 'utf8')
  : process.env.POSTGRES_PASSWORD;
```

---

### 6.3 JWT Authentication

SERVER-MCP authenticates to the agent registry using Keycloak client credentials:

1. Service starts → authenticates to Keycloak
2. Receives JWT access token
3. Includes `Authorization: Bearer <token>` in all registry API calls
4. Auto-refreshes token before expiration

---

## 7. Environment Variables

### Required

```bash
# PostgreSQL (local connection)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<secret>
POSTGRES_DB=postgres

# PostgreSQL Sync (optional - for structured thought sync)
POSTGRES_CONNECTION_STRING=postgresql://user:pass@server.acdev.host/db
```

### Optional (Recommended)

```bash
# Redis (local connection)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secret>
REDIS_DB=0

# Keycloak Admin API
KEYCLOAK_BASE_URL=https://acdev.host:8080
KEYCLOAK_REALM=mcp-agents
KEYCLOAK_CLIENT_ID=server-mcp-agent
KEYCLOAK_CLIENT_SECRET=<secret>

# NGINX paths
NGINX_ACCESS_LOG=/var/log/nginx/access.log
NGINX_ERROR_LOG=/var/log/nginx/error.log
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf

# Server-MCP settings
SERVER_MCP_ALLOW_SUDO=true
SERVER_MCP_LOG_LEVEL=debug
SERVER_MCP_SQLITE_PATH=/opt/server-mcp/mcp_cache.db
SERVER_MCP_QUEUE_PATH=/opt/server-mcp/queue.db
SERVER_MCP_BACKUP_DIR=/var/backups/server-mcp

# Structured Thinking
SERVER_MCP_STAGE_CONFIG=/opt/server-mcp/config/stages.json

# Agent Integration (optional)
IT_MCP_REGISTRY_URL=https://server.acdev.host/registry
IT_MCP_SERVER_ID=server.acdev.host

# Backup Configuration
ENABLE_AUTO_BACKUP=true
BACKUP_SCHEDULE=0 2 * * *          # Daily at 2 AM
BACKUP_RETENTION_DAYS=30           # Keep 30 days
```

---

## 8. Usage

### 8.1 As Distributed Agent

SERVER-MCP automatically registers with the IT-MCP agent registry on startup. IT-MCP can then dispatch commands:

```typescript
// From IT-MCP desktop client
const result = await dispatchCommand({
  tool: 'postgres-manage',
  operation: 'vacuum',
  database: 'production',
  targetAgent: 'server.acdev.host',
});
```

---

### 8.2 Direct Invocation (Development)

For testing, invoke tools directly via stdio:

```bash
echo '{"tool":"database-diagnostics","params":{"suites":["postgres","redis"]}}' | npm run dev
```

---

### 8.3 Monitoring

View logs in real-time:

```bash
# Journald logs (structured JSON)
sudo journalctl -u server-mcp -f

# Filter errors only
sudo journalctl -u server-mcp -p err -f
```

---

## 9. Development

### Build Commands

```bash
# Install dependencies
npm install

# Development mode (ts-node)
npm run dev

# Compile TypeScript
npm run build

# Watch mode
npm run build:watch

# Run compiled server
npm start

# Lint code
npm run lint

# Run tests
npm test
```

---

### Service Architecture

SERVER-MCP follows IT-MCP's service layer pattern:

```typescript
// Service with dependency injection
export class PostgresManagerService {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly pool: pg.Pool
  ) {}

  public async getActiveConnections(): Promise<ConnectionStats> {
    // Direct PostgreSQL client query (not shell command)
    const result = await this.pool.query(
      'SELECT state, count(*) FROM pg_stat_activity GROUP BY state'
    );
    return this.parseConnections(result.rows);
  }
}

// Tool registration
server.registerTool('postgres-manage', schema, async (params) => {
  try {
    const result = await deps.postgresManager.execute(params);
    return {
      content: [{ type: 'text', text: formatResult(result) }],
      structuredContent: result,
    };
  } catch (error) {
    return handleError(error);
  }
});
```

---

## 10. Key Implementation Notes

- **Direct Database Clients:** PostgreSQL and Redis use native clients (`pg`, `ioredis`) not shell commands for better performance and connection pooling
- **Local Execution Only:** All operations execute locally via `CommandRunner` - no SSH layer
- **Service Layer Pattern:** All business logic in service classes, not tool handlers
- **Dual Content Format:** All tools return both text (for display) and structuredContent (for programmatic access)
- **Error Handling:** Standardized error handling with `CommandExecutionError` including full context
- **Security Hardening:** Systemd service includes NoNewPrivileges, ProtectSystem, PrivateTmp
- **Graceful Degradation:** Optional services (PostgreSQL, Redis, Keycloak) log warnings but don't crash if unavailable
- **Integration Ready:** Designed to work with IT-MCP's distributed agent architecture

---

## 11. Roadmap

### Phase 1: Foundation ✅

- [x] Project structure
- [x] Core utilities (CommandRunner, logger)
- [x] Package dependencies
- [x] SQLite cache service (SQLitePlannerService)
- [x] Structured thinking service

### Phase 2: Core Services ✅

- [x] ServerAdminService (from UbuntuAdminService)
- [x] DatabaseDiagnosticsService (simplified, no SSH)
- [x] PostgresManagerService (pg client)
- [x] RedisManagerService (ioredis client)
- [x] KeycloakManagerService (Admin API)
- [x] NginxMonitoringService
- [x] SystemMetricsService

### Phase 3: MCP Tools ✅

- [x] Tool registration with Zod schemas (7 tools)
- [x] Error handling middleware
- [x] Dual content format (text + structuredContent)

### Phase 4: Integration ✅

- [x] AutoDiscoveryService integration (agent registration)
- [x] KeycloakAuthService (JWT authentication)
- [x] CommandQueueService (SQLite job queue)
- [x] DatabaseSyncService (PostgreSQL ↔ SQLite sync)
- [x] Graceful startup/shutdown with cleanup

### Phase 5: Deployment ✅

- [x] Systemd service file with security hardening
- [x] PM2 ecosystem configuration
- [x] Security hardening guide
- [x] Deployment guide
- [x] Automated setup script
- [x] Automated deployment script
- [x] Environment configuration (.env.example)
- [ ] Production deployment on server.acdev.host (ready to deploy)

### Phase 6: Advanced Features

- [ ] Automated maintenance scheduler
- [ ] Backup automation
- [ ] Health check endpoint
- [ ] Metrics export (Prometheus)

---

## 12. Contributing

SERVER-MCP follows IT-MCP's coding standards:

- **TypeScript Strict Mode:** All code must pass `tsc --strict`
- **Service Layer:** All operations in service classes, not tool handlers
- **Error Handling:** Use `CommandExecutionError` with full context
- **No Floating Promises:** Resolve or explicitly `void` all promises
- **Readonly by Default:** All interface properties `readonly` unless mutation required

---

## 13. License

MIT

---

## 14. Related Projects

- **[IT-MCP](https://github.com/yourusername/IT-MCP):** Parent project - cross-platform diagnostic tool with distributed coordination
- **Agent Registry:** Central coordination service (private repository)

---

**Questions?** Open an issue or contact the maintainers.
