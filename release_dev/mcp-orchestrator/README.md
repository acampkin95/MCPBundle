# SERVER-MCP

**On-Server Model Context Protocol Agent** for PostgreSQL, Redis, Keycloak, and NGINX management on Ubuntu infrastructure.

## Overview

SERVER-MCP is a specialized MCP server that runs **directly on Ubuntu infrastructure servers** (unlike IT-MCP which runs on desktop/laptop and SSH's to remote servers). It provides real-time database monitoring, service health management, and automated maintenance for production environments.

### Architecture

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

| Aspect | IT-MCP | SERVER-MCP |
|--------|---------|------------|
| **Deployment** | Desktop/laptop (macOS/Windows/Linux) | Ubuntu server (server.acdev.host) |
| **Execution** | SSH/WinRM to remote servers | Local commands via sudo |
| **Database** | SQLite primary + PostgreSQL sync (optional) | PostgreSQL primary + SQLite cache |
| **Focus** | Cross-platform diagnostics, remote admin | Database management, service health, backups |
| **MCP Client** | Claude Desktop, CLI tools | Headless (API-driven by IT-MCP or cron) |
| **Capabilities** | `local-shell`, `ssh-linux`, `ssh-macos`, `winrm` | `postgres-admin`, `redis-admin`, `keycloak-admin`, `ubuntu-server` |

## Features

### Database Management
- **PostgreSQL**: Real-time connection stats, replication monitoring, table bloat detection, slow query analysis, automated VACUUM, reindexing, backup/restore
- **Redis**: Memory stats, keyspace analysis, slow log, client list, BGSAVE automation

### Service Management
- **Keycloak**: Realm stats, session monitoring, user management, event logs, client secret rotation
- **NGINX**: Access log analysis, error log parsing, config testing, upstream health checks
- **System**: Service restarts, package updates, Docker container management, PM2 process monitoring

### Automated Maintenance
- Nightly database backups (PostgreSQL + Redis)
- Weekly Docker image pruning
- Monthly Keycloak secret rotation
- Security updates (with approval workflow)
- Auto-restart failed services

### Integration
- **Agent Registration**: Auto-registers with IT-MCP central registry on startup
- **Command Queue**: Polls PostgreSQL command queue for remote jobs
- **Heartbeat**: Sends heartbeat to Redis every 30 seconds
- **JWT Authentication**: Keycloak client credentials flow

## Installation

### Prerequisites

- **Ubuntu Server 24.04 LTS** (or compatible)
- **Node.js 18.18+** installed
- **PostgreSQL 16+** running locally
- **Redis 7+** running locally
- **Keycloak** running (Docker or standalone)
- **NGINX** installed
- **Sudo access** for the service user

### Setup

1. **Clone and install dependencies**:
   ```bash
   cd /opt
   sudo git clone <repository-url> server-mcp
   cd server-mcp
   sudo npm install
   ```

2. **Configure environment**:
   ```bash
   sudo cp .env.example .env
   sudo nano .env
   # Fill in PostgreSQL, Redis, Keycloak credentials
   ```

3. **Build TypeScript**:
   ```bash
   sudo npm run build
   ```

4. **Create service user**:
   ```bash
   sudo useradd -r -s /bin/false mcp-agent
   sudo chown -R mcp-agent:mcp-agent /opt/server-mcp
   ```

5. **Configure sudo access** (edit `/etc/sudoers.d/server-mcp`):
   ```
   mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl
   mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker
   mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dump
   mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dumpall
   mcp-agent ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
   ```

6. **Install systemd service**:
   ```bash
   sudo cp systemd/server-mcp.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable server-mcp
   sudo systemctl start server-mcp
   ```

7. **Verify installation**:
   ```bash
   sudo systemctl status server-mcp
   sudo journalctl -u server-mcp -f
   ```

## Configuration

### Environment Variables

See [.env.example](./.env.example) for full configuration options. Key variables:

- **PostgreSQL**: `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`
- **PostgreSQL Sync**: `POSTGRES_CONNECTION_STRING` (optional - for structured thought sync)
- **Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- **Keycloak Admin**: `KEYCLOAK_BASE_URL`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_REALM`
- **Local Storage**: `SERVER_MCP_SQLITE_PATH`, `SERVER_MCP_QUEUE_PATH`
- **Structured Thinking**: `SERVER_MCP_STAGE_CONFIG` (optional path to JSON stage framework definition), `SERVER_MCP_SQLITE_PATH`
- **Agent Integration**: `IT_MCP_REGISTRY_URL` (optional), `IT_MCP_SERVER_ID` (optional)
- **Security**: `SERVER_MCP_ALLOW_SUDO` (default: true)
- **Logging**: `SERVER_MCP_LOG_LEVEL` (default: debug)

### Backup Configuration

Automated backups are enabled by default:

```bash
ENABLE_AUTO_BACKUP=true
BACKUP_SCHEDULE=0 2 * * *          # Daily at 2 AM
BACKUP_RETENTION_DAYS=30           # Keep 30 days
SERVER_MCP_BACKUP_DIR=/var/backups/server-mcp
```

## MCP Tools

SERVER-MCP exposes 7 MCP tools (all execute locally, no SSH):

| Tool | Description | Operations |
|------|-------------|------------|
| `database-diagnostics` | Database health checks | PostgreSQL/Redis/Keycloak/NGINX/firewall/system diagnostics (6 suites) |
| `postgres-manage` | PostgreSQL operations | Connections, replication, bloat, slow queries, vacuum, reindex, backup |
| `redis-manage` | Redis operations | Memory stats, keyspace, slow log, client list, BGSAVE |
| `keycloak-manage` | Keycloak admin | Realm stats, sessions, users, events, secret rotation |
| `nginx-monitor` | NGINX monitoring | Access log analysis, error log parsing, config testing, reload |
| `system-metrics` | System health | Overview, processes, disk I/O, network, journal errors, service status |
| `structured-thinking` | Structured reasoning management | Capture/revise/retrieve thoughts, generate summaries, inspect framework, trigger sync |

## Usage

### As Distributed Agent

SERVER-MCP automatically registers with the IT-MCP agent registry on startup. IT-MCP can then dispatch commands:

```typescript
// From IT-MCP desktop client
const result = await dispatchCommand({
  tool: "postgres-manage",
  operation: "vacuum",
  database: "production",
  targetAgent: "server.acdev.host"
});
```

### Direct Invocation (Development)

For testing, you can invoke tools directly via stdio:

```bash
echo '{"tool":"database-diagnostics","params":{"suites":["postgres","redis"]}}' | npm run dev
```

### Monitoring

View logs in real-time:

```bash
# Journald logs (structured JSON)
sudo journalctl -u server-mcp -f

# Filter errors only
sudo journalctl -u server-mcp -p err -f
```

### Structured Thinking Interface

The `structured-thinking` tool turns SERVER-MCP into the source of truth for guided reasoning:

- Capture or revise thoughts with rich metadata (stage, quality score, tags, branches).
- Retrieve filtered timelines (by stage, branch, importance, tags, or full-text fragment) and generate branch-aware summaries.
- Inspect or override the reasoning framework by supplying a JSON config via `SERVER_MCP_STAGE_CONFIG`.
- Run diagnostics to detect stale or missing stages, and trigger PostgreSQL syncs when `POSTGRES_CONNECTION_STRING` is configured.
- Feedback heuristics surface stage dwell time, rolling quality drops, repetitive content, and unhealthy branches to nudge the agent when progress stalls.

## Development

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
```

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
      "SELECT state, count(*) FROM pg_stat_activity GROUP BY state"
    );
    return this.parseConnections(result.rows);
  }
}

// Tool registration
server.registerTool(
  "postgres-manage",
  schema,
  async (params) => {
    try {
      const result = await deps.postgresManager.execute(params);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        structuredContent: result
      };
    } catch (error) {
      return handleError(error);
    }
  }
);
```

### Error Handling

All services use `CommandRunner` for safe command execution:

```typescript
const result = await this.runner.run("systemctl status postgresql", {
  requiresSudo: false,
  timeoutMs: 10000
});

// Throws CommandExecutionError with full context on failure
```

## Security

### Sudo Configuration

SERVER-MCP requires sudo access for specific operations:

- Service management: `systemctl`
- Container operations: `docker`
- Database backups: `pg_dump`, `pg_dumpall`
- NGINX config testing: `nginx -t`

**NEVER** grant `NOPASSWD: ALL` - only specific commands listed in `/etc/sudoers.d/server-mcp`.

### Secret Management

**Production**: Use systemd credentials (not .env):

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

### JWT Authentication

SERVER-MCP authenticates to the agent registry using Keycloak client credentials:

1. Service starts → authenticates to Keycloak
2. Receives JWT access token
3. Includes `Authorization: Bearer <token>` in all registry API calls
4. Auto-refreshes token before expiration

## Monitoring & Operations

### Health Checks

SERVER-MCP exposes a health check (future enhancement):

```bash
curl http://localhost:9090/health
# {"status":"healthy","uptime":86400,"lastHeartbeat":"2025-11-01T10:30:00Z"}
```

### Backup Verification

Check backup status:

```bash
sudo ls -lh /var/backups/server-mcp/
# postgres_20251101_020000.sql.gz
# redis_20251101_020000.rdb
```

### Service Restart

If SERVER-MCP crashes, systemd automatically restarts it:

```ini
[Service]
Restart=always
RestartSec=10
```

## Troubleshooting

### Common Issues

**Issue**: "Permission denied" when running commands

**Solution**: Check sudo configuration in `/etc/sudoers.d/server-mcp`

---

**Issue**: "Cannot connect to PostgreSQL"

**Solution**: Verify PostgreSQL is running and credentials in `.env` are correct:
```bash
sudo systemctl status postgresql
psql -h localhost -U postgres -c "SELECT version();"
```

---

**Issue**: "Keycloak authentication failed"

**Solution**: Verify Keycloak client exists and credentials are correct:
```bash
curl -k -X POST https://acdev.host:8080/realms/mcp-agents/protocol/openid-connect/token \
  -d "client_id=server-mcp-agent" \
  -d "client_secret=<secret>" \
  -d "grant_type=client_credentials"
```

---

**Issue**: "Backup directory not writable"

**Solution**: Check ownership and permissions:
```bash
sudo mkdir -p /var/backups/server-mcp
sudo chown mcp-agent:mcp-agent /var/backups/server-mcp
sudo chmod 750 /var/backups/server-mcp
```

## Roadmap

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
- [x] Tool registration with Zod schemas (6 tools)
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
- [x] Security hardening guide (docs/SECURITY.md)
- [x] Deployment guide (docs/DEPLOYMENT.md)
- [x] Automated setup script (scripts/setup.sh)
- [x] Automated deployment script (scripts/deploy.sh)
- [x] Environment configuration (.env.example)
- [ ] Production deployment on server.acdev.host (ready to deploy)

### Phase 6: Advanced Features
- [ ] Automated maintenance scheduler
- [ ] Backup automation
- [ ] Health check endpoint
- [ ] Metrics export (Prometheus)

## Contributing

SERVER-MCP follows IT-MCP's coding standards:

- **TypeScript Strict Mode**: All code must pass `tsc --strict`
- **Service Layer**: All operations in service classes, not tool handlers
- **Error Handling**: Use `CommandExecutionError` with full context
- **No Floating Promises**: Resolve or explicitly `void` all promises
- **Readonly by Default**: All interface properties `readonly` unless mutation required

## License

MIT

## Related Projects

- **[IT-MCP](https://github.com/yourusername/IT-MCP)**: Parent project - cross-platform diagnostic tool with distributed coordination
- **Agent Registry**: Central coordination service (private repository)

---

**Questions?** Open an issue or contact the maintainers.
