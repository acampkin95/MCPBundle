# MCP Bundle Infrastructure Datasheet

**Version:** 0.2.0
**Status:** Production Ready
**Last Updated:** November 14, 2025
**Document Owner:** Infrastructure Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Infrastructure Overview](#2-infrastructure-overview)
3. [Access Credentials](#3-access-credentials)
4. [MCP Bundle Administration](#4-mcp-bundle-administration)
5. [Operational Procedures](#5-operational-procedures)
6. [Troubleshooting Quick Reference](#6-troubleshooting-quick-reference)
7. [Technical Specifications](#7-technical-specifications)
8. [Emergency Contacts](#8-emergency-contacts)

---

## 1. Executive Summary

### System Overview

The MCP Bundle is an enterprise-ready distributed Model Context Protocol (MCP) ecosystem providing production-grade IT administration, database management, and AI-powered research capabilities. The system is deployed across three Ubuntu servers in a high-availability configuration with automated failover, streaming replication, and comprehensive monitoring.

### Purpose and Capabilities

- **IT Administration:** 118+ diagnostic and administration tools for macOS/Linux/Windows systems
- **Database Management:** PostgreSQL 16.10 with streaming replication (0ms lag)
- **AI Research:** Integration with Perplexity API for business intelligence and deep research
- **Distributed Coordination:** Central orchestration with agent registry and command queue
- **Structured Thinking:** Cognitive framework with quality scoring and hierarchical thought management

### Production Status

**Status:** ✅ 100% OPERATIONAL
**Deployment Date:** November 14, 2025
**Uptime Target:** 99.9%
**Test Coverage:** 52/52 tests passed (100%)

**Key Metrics:**
- PostgreSQL Replication Lag: 0ms (perfect synchronization)
- Disk Usage: 3% (5.2GB/193GB)
- Memory Usage: 7% (809MB/11GB)
- Active Services: 3 MCP servers + infrastructure

---

## 2. Infrastructure Overview

### Network Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Production Network                           │
│                      (3-VM High Availability)                        │
└─────────────────────────────────────────────────────────────────────┘

WAN Access Layer:
VMI01: 46.250.243.123     VMI02D: 46.250.241.70     VMI03: 154.26.158.31
   │                          │                           │
   │                          │                           │
VPN Mesh (WireGuard):
   │                          │                           │
10.0.0.1 ───────────────── 10.0.0.2 ────────────────── 10.0.0.3
   │                          │                           │
   │                          │                           │
   ▼                          ▼                           ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  VMI01 PRIMARY   │   │  VMI02D STANDBY  │   │  VMI03 GATEWAY   │
│                  │   │                  │   │                  │
│ PostgreSQL 16    │──▶│ PostgreSQL 16    │   │ HAProxy LB       │
│ (Read/Write)     │   │ (Read-Only)      │   │ Failover Monitor │
│                  │   │ Streaming Rep.   │   │ Keycloak SSO     │
│ Redis 8.2.3      │   │ Hot Standby      │   │ Pi-Hole DNS      │
│ Pub/Sub Broker   │   │ Backup Storage   │   │ Prometheus       │
│                  │   │                  │   │ Grafana          │
│ MCP Services:    │   │                  │   │                  │
│ - Orchestrator   │   │                  │   │                  │
│ - ITJSST-MCP     │   │                  │   │                  │
│ - Perplexity-MCP │   │                  │   │                  │
│                  │   │                  │   │                  │
│ PgBouncer Pool   │   │                  │   │                  │
│ (1000 conns)     │   │                  │   │                  │
└──────────────────┘   └──────────────────┘   └──────────────────┘
```

### Server Specifications

| Component | VMI01 (Primary) | VMI02D (Standby) | VMI03 (Gateway) |
|-----------|----------------|------------------|-----------------|
| **Hostname** | acdev-vmi01.lan | acdev-vmi02d.lan | acdev-vmi03.lan |
| **WAN IP** | 46.250.243.123 | 46.250.241.70 | 154.26.158.31 |
| **VPN IP** | 10.0.0.1 | 10.0.0.2 | 10.0.0.3 |
| **OS** | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| **CPU** | Multi-core | Multi-core | Multi-core |
| **Memory** | 11GB | 11GB | 8GB |
| **Disk** | 193GB | 193GB | 160GB |
| **Role** | Primary DB + MCP | Standby + Storage | Gateway + Monitoring |

### Service Architecture

```
Application Layer:
┌─────────────────────────────────────────────────────────────────┐
│  MCP Servers (stdio transport)                                  │
│  ├─ mcp-orchestrator (47+ tools, agent registry)                │
│  ├─ itjsst-mcp (118+ tools, IT administration)                  │
│  └─ perplexity-mcp (7 tools, AI research)                       │
└─────────────────────────────────────────────────────────────────┘

Data Layer:
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL 16.10 (Primary on VMI01, Standby on VMI02D)         │
│  ├─ Database: mcp_ecosystem                                     │
│  ├─ Tables: 24 (structured_thoughts, mcp_agents, command_queue) │
│  ├─ Replication: Streaming WAL (0ms lag)                        │
│  └─ Connection Pool: PgBouncer (1000 max connections)           │
└─────────────────────────────────────────────────────────────────┘

Cache Layer:
┌─────────────────────────────────────────────────────────────────┐
│  Redis 8.2.3 (VMI01)                                             │
│  ├─ Pub/Sub: Agent heartbeats, real-time events                 │
│  ├─ Cache: Query results, session data                          │
│  └─ Memory Policy: allkeys-lru                                  │
└─────────────────────────────────────────────────────────────────┘

Network Layer:
┌─────────────────────────────────────────────────────────────────┐
│  WireGuard VPN Mesh (10.0.0.0/24 + subnets)                     │
│  ├─ Internal traffic only                                       │
│  ├─ Encrypted tunnels                                           │
│  └─ Automatic peer discovery                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Access Credentials

### SSH Access

**All Servers:**
```
Username: root
Password: C0nnaught
```

**Connection Examples:**
```bash
# VMI01 (Primary)
ssh root@46.250.243.123

# VMI02D (Standby)
ssh root@46.250.241.70

# VMI03 (Gateway)
ssh root@154.26.158.31
```

**VPN Access (Internal):**
```bash
ssh root@10.0.0.1  # VMI01
ssh root@10.0.0.2  # VMI02D
ssh root@10.0.0.3  # VMI03
```

### PostgreSQL Database

**Primary Database (Read/Write):**
```
Host: 10.0.0.1 (VMI01 internal) or 46.250.243.123 (WAN)
Port: 5432
Database: mcp_ecosystem
Username: mcp_admin
Password: mcp_pass
```

**Connection String:**
```
postgresql://mcp_admin:mcp_pass@10.0.0.1:5432/mcp_ecosystem
```

**Standby Database (Read-Only):**
```
postgresql://mcp_admin:mcp_pass@10.0.0.2:5432/mcp_ecosystem
```

**Direct Connection:**
```bash
# From VMI01
psql -h localhost -U mcp_admin -d mcp_ecosystem

# Remote connection (requires password: mcp_pass)
psql -h 10.0.0.1 -U mcp_admin -d mcp_ecosystem
```

**Database Roles:**

| Role | Permissions | Usage |
|------|-------------|-------|
| `mcp_admin` | Full database owner | Administration, migrations |
| `mcp_agent_role` | Read/write operational tables | Agent operations |
| `mcp_orchestrator_role` | Full table + function access | Orchestrator service |
| `mcp_readonly_role` | Read-only access | Monitoring, reporting |

### Redis Cache

**Location:** VMI01 (localhost only)
```
Host: 127.0.0.1 (localhost on VMI01)
Port: 6379
Password: See /opt/redis/credentials.txt on VMI01
Database: 0
```

**Connection String:**
```
redis://localhost:6379
```

**Test Connection:**
```bash
ssh root@46.250.243.123 'redis-cli ping'
# Expected output: PONG
```

**Retrieve Credentials:**
```bash
ssh root@46.250.243.123 'cat /opt/redis/credentials.txt'
```

### Keycloak SSO (Planned - VMI03)

**URL:** `https://acdev.host:8080`
**Realm:** `mcp-agents`
**Admin Console:** `https://acdev.host:8080/admin`

**Client Credentials:**
```
Client ID: server-mcp-agent
Client Secret: (stored in /etc/server-mcp/.env)
```

### API Keys

**Perplexity API:**
- Location: `/opt/mcp/services/perplexity-mcp/.env`
- Variable: `PERPLEXITY_API_KEY`
- Access: Root only on VMI01

---

## 4. MCP Bundle Administration

### Understanding MCP Protocol

MCP services use **stdio transport** (standard input/output), not HTTP. Services are launched on-demand by MCP clients and communicate via JSON-RPC over stdin/stdout pipes.

**Key Concepts:**
- Services do NOT run as HTTP servers
- Services are invoked per-request
- Communication is JSON-RPC 2.0 over stdio
- Clients launch service processes as needed

### MCP Service Locations

**On VMI01:**
```
/opt/mcp/services/
├── mcp-orchestrator/
│   ├── dist/index.js        # Entry point
│   ├── package.json
│   └── .env                 # Database/Redis config
├── itjsst-mcp/
│   ├── dist/index.js        # Entry point
│   ├── package.json
│   └── node_modules/        # Native modules (better-sqlite3)
└── perplexity-mcp/
    ├── dist/index.js        # Entry point
    ├── package.json
    └── .env                 # API key + Database/Redis
```

### Claude Desktop Integration

**Configuration File:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

**Add to Claude Desktop config:**
```json
{
  "mcpServers": {
    "mcp-orchestrator": {
      "command": "ssh",
      "args": [
        "root@46.250.243.123",
        "node",
        "/opt/mcp/services/mcp-orchestrator/dist/index.js"
      ]
    },
    "itjsst-mcp": {
      "command": "ssh",
      "args": [
        "root@46.250.243.123",
        "node",
        "/opt/mcp/services/itjsst-mcp/dist/index.js"
      ]
    },
    "perplexity-mcp": {
      "command": "ssh",
      "args": [
        "root@46.250.243.123",
        "node",
        "/opt/mcp/services/perplexity-mcp/dist/index.js"
      ]
    }
  }
}
```

**Restart Claude Desktop** after updating configuration.

### Command-Line Testing

**Test MCP Protocol (stdio):**
```bash
# Test itjsst-mcp
ssh root@46.250.243.123 'node /opt/mcp/services/itjsst-mcp/dist/index.js' << 'EOF'
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","id":2}
EOF

# Test perplexity-mcp
ssh root@46.250.243.123 'cd /opt/mcp/services/perplexity-mcp && node dist/index.js' << 'EOF'
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","id":2}
EOF
```

### Tool Categories and Capabilities

#### mcp-orchestrator (47+ tools)

**Categories:**
- Agent Registry Management
- Command Queue Orchestration
- Database Diagnostics
- Health Monitoring
- Structured Thinking Framework
- Automated Maintenance
- Reporting Hub

**Key Tools:**
- `database-diagnostics` - Multi-suite health checks
- `structured-thinking` - Cognitive framework management
- `system-metrics` - Linux system monitoring
- `postgres-manage` - PostgreSQL operations
- `redis-manage` - Redis cache operations

#### itjsst-mcp (118+ tools)

**Categories:**
- System Administration (macOS/Linux/Windows)
- Network Diagnostics
- Remote Execution (SSH/PowerShell)
- Security Scanning
- Package Management
- Service Management
- Docker Administration
- Database Diagnostics

**Key Tools:**
- `system-overview` - Comprehensive system information
- `mac-diagnostics` - macOS hardware/performance/security
- `network-diagnostics` - Port scanning, firewall analysis
- `ubuntu-admin` - Ubuntu server administration via SSH
- `windows-admin` - Windows PowerShell remoting
- `structured-thinking` - Local SQLite-backed cognitive framework

#### perplexity-mcp (7 tools)

**Categories:**
- AI-Powered Research
- Business Intelligence
- Deep Research
- Context Management

**Key Tools:**
- `research` - Quick research queries
- `deep_research` - Comprehensive analysis
- `bi_research` - Business intelligence sessions
- `get_context` - Context retrieval
- `clear_context` - Context management

---

## 5. Operational Procedures

### Starting and Stopping Services

#### PostgreSQL

**Check Status:**
```bash
ssh root@46.250.243.123 'systemctl status postgresql'
```

**Start/Stop/Restart:**
```bash
# Start
ssh root@46.250.243.123 'systemctl start postgresql'

# Stop
ssh root@46.250.243.123 'systemctl stop postgresql'

# Restart
ssh root@46.250.243.123 'systemctl restart postgresql'
```

**Enable/Disable Auto-Start:**
```bash
ssh root@46.250.243.123 'systemctl enable postgresql'   # Enable
ssh root@46.250.243.123 'systemctl disable postgresql'  # Disable
```

#### Redis

**Check Status:**
```bash
ssh root@46.250.243.123 'systemctl status redis-server'
```

**Start/Stop/Restart:**
```bash
ssh root@46.250.243.123 'systemctl start redis-server'
ssh root@46.250.243.123 'systemctl stop redis-server'
ssh root@46.250.243.123 'systemctl restart redis-server'
```

**Test Connection:**
```bash
ssh root@46.250.243.123 'redis-cli ping'  # Should return: PONG
```

#### mcp-orchestrator

**Check Status:**
```bash
ssh root@46.250.243.123 'systemctl status mcp-orchestrator'
```

**View Logs:**
```bash
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 50 -f'
```

**Restart:**
```bash
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator'
```

### System Health Checks

#### Quick Health Check

**Single Command:**
```bash
ssh root@46.250.243.123 'systemctl status postgresql redis-server mcp-orchestrator'
```

#### Comprehensive Health Report

**Run Full Diagnostic Suite:**
```bash
ssh root@46.250.243.123 '/opt/mcp/diagnostic-runbook.sh'
```

**View Results:**
```bash
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq "."'
```

#### Resource Monitoring

**Disk Space:**
```bash
ssh root@46.250.243.123 'df -h /'
```

**Memory Usage:**
```bash
ssh root@46.250.243.123 'free -h'
```

**System Load:**
```bash
ssh root@46.250.243.123 'uptime'
```

**Process List:**
```bash
ssh root@46.250.243.123 'ps aux | head -20'
```

### Monitoring PostgreSQL Replication

#### Check Replication Status (Primary)

```bash
ssh root@46.250.243.123 "sudo -u postgres psql -c \"SELECT application_name, state, sync_state, pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes FROM pg_stat_replication;\""
```

**Expected Output:**
```
 application_name |   state   | sync_state | lag_bytes
------------------+-----------+------------+-----------
 vmi02d           | streaming | async      |         0
```

#### Check Replication Lag (Seconds)

```bash
ssh root@46.250.243.123 'sudo -u postgres psql -t -c "SELECT COALESCE(extract(epoch from (now() - pg_last_xact_replay_timestamp())), 0)::int FROM pg_stat_replication LIMIT 1;"'
```

**Expected Output:** `0` (zero seconds lag)

#### Check Standby Status (VMI02D)

```bash
ssh root@46.250.241.70 "sudo -u postgres psql -c \"SELECT pg_is_in_recovery();\""
```

**Expected Output:** `t` (true - in recovery mode)

#### View Active Connections

```bash
ssh root@46.250.243.123 "sudo -u postgres psql -d mcp_ecosystem -c \"SELECT count(*), state FROM pg_stat_activity WHERE datname = 'mcp_ecosystem' GROUP BY state;\""
```

### Backup Verification

#### PostgreSQL Backup

**Manual Backup:**
```bash
ssh root@46.250.243.123 'sudo -u postgres pg_dump mcp_ecosystem | gzip > /var/backups/mcp_ecosystem_$(date +%Y%m%d_%H%M%S).sql.gz'
```

**Verify Backup:**
```bash
ssh root@46.250.243.123 'ls -lh /var/backups/mcp_ecosystem*.sql.gz'
```

**Restore from Backup:**
```bash
# Stop applications first
ssh root@46.250.243.123 'systemctl stop mcp-orchestrator'

# Drop and recreate database
ssh root@46.250.243.123 "sudo -u postgres psql -c 'DROP DATABASE IF EXISTS mcp_ecosystem;'"
ssh root@46.250.243.123 "sudo -u postgres psql -c 'CREATE DATABASE mcp_ecosystem OWNER mcp_admin;'"

# Restore backup
ssh root@46.250.243.123 'gunzip < /var/backups/mcp_ecosystem_YYYYMMDD_HHMMSS.sql.gz | sudo -u postgres psql mcp_ecosystem'

# Restart applications
ssh root@46.250.243.123 'systemctl start mcp-orchestrator'
```

#### Redis Backup

**Trigger Background Save:**
```bash
ssh root@46.250.243.123 'redis-cli BGSAVE'
```

**Check Last Save Time:**
```bash
ssh root@46.250.243.123 'redis-cli LASTSAVE'
```

**Backup RDB File:**
```bash
ssh root@46.250.243.123 'cp /var/lib/redis/dump.rdb /var/backups/redis_$(date +%Y%m%d_%H%M%S).rdb'
```

---

## 6. Troubleshooting Quick Reference

### Common Issues

#### Issue: MCP Service Not Responding

**Symptoms:** Claude Desktop shows "Server not responding" or timeout errors

**Diagnosis:**
```bash
# Check if service is running
ssh root@46.250.243.123 'systemctl status mcp-orchestrator'

# Test stdio manually
ssh root@46.250.243.123 'echo "{\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"params\":{},\"id\":1}" | node /opt/mcp/services/mcp-orchestrator/dist/index.js'
```

**Solution:**
```bash
# Restart service
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator'

# Check logs for errors
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 100'
```

#### Issue: PostgreSQL Connection Refused

**Symptoms:** "Connection refused" or "could not connect to server" errors

**Diagnosis:**
```bash
# Check if PostgreSQL is running
ssh root@46.250.243.123 'systemctl status postgresql'

# Check if listening on port 5432
ssh root@46.250.243.123 'ss -tuln | grep 5432'

# Test connection
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT version();"'
```

**Solution:**
```bash
# Start PostgreSQL
ssh root@46.250.243.123 'systemctl start postgresql'

# Check pg_hba.conf for access rules
ssh root@46.250.243.123 'cat /etc/postgresql/16/main/pg_hba.conf | grep mcp_admin'
```

#### Issue: Replication Lag Increasing

**Symptoms:** Replication lag > 10ms or increasing over time

**Diagnosis:**
```bash
# Check replication status
ssh root@46.250.243.123 "sudo -u postgres psql -c \"SELECT application_name, state, pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes FROM pg_stat_replication;\""

# Check standby apply rate
ssh root@46.250.241.70 "sudo -u postgres psql -c \"SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;\""
```

**Solution:**
```bash
# Check network connectivity between servers
ssh root@46.250.243.123 'ping -c 5 10.0.0.2'

# Check disk I/O on standby
ssh root@46.250.241.70 'iostat -x 1 5'

# Restart PostgreSQL on standby if needed
ssh root@46.250.241.70 'systemctl restart postgresql'
```

#### Issue: Redis Memory Issues

**Symptoms:** High memory usage or eviction warnings

**Diagnosis:**
```bash
# Check memory stats
ssh root@46.250.243.123 'redis-cli INFO memory'

# Check eviction stats
ssh root@46.250.243.123 'redis-cli INFO stats | grep evicted'
```

**Solution:**
```bash
# Clear database (WARNING: destroys data)
ssh root@46.250.243.123 'redis-cli FLUSHDB'

# Or increase max memory in redis.conf
ssh root@46.250.243.123 'vi /etc/redis/redis.conf'  # Set maxmemory
ssh root@46.250.243.123 'systemctl restart redis-server'
```

#### Issue: Disk Space Low

**Symptoms:** < 10% disk space available

**Diagnosis:**
```bash
# Check disk usage
ssh root@46.250.243.123 'df -h'

# Find large files
ssh root@46.250.243.123 'du -sh /var/* | sort -hr | head -10'
```

**Solution:**
```bash
# Clean PostgreSQL logs
ssh root@46.250.243.123 'find /var/log/postgresql -name "*.log" -mtime +30 -delete'

# Clean apt cache
ssh root@46.250.243.123 'apt-get clean'

# Remove old backups
ssh root@46.250.243.123 'find /var/backups -name "*.sql.gz" -mtime +30 -delete'
```

### Log Locations

**System Logs:**
```
/var/log/syslog                    # System messages
/var/log/auth.log                  # Authentication logs
```

**Service Logs (journald):**
```bash
# PostgreSQL
journalctl -u postgresql -n 100

# Redis
journalctl -u redis-server -n 100

# mcp-orchestrator
journalctl -u mcp-orchestrator -n 100 -f  # Follow mode
```

**Application Logs:**
```
/var/log/postgresql/postgresql-16-main.log  # PostgreSQL query logs
/var/log/redis/redis-server.log             # Redis logs
/opt/mcp/services/*/logs/                   # MCP service logs
```

**Quick Log Analysis:**
```bash
# Last 50 errors from all services
ssh root@46.250.243.123 'journalctl -p err -n 50'

# PostgreSQL errors in last hour
ssh root@46.250.243.123 'journalctl -u postgresql --since "1 hour ago" -p err'

# Search for specific error
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator | grep "connection refused"'
```

### Emergency Procedures

#### Full System Restart

```bash
# Stop all MCP services
ssh root@46.250.243.123 'systemctl stop mcp-orchestrator'

# Stop databases
ssh root@46.250.243.123 'systemctl stop postgresql redis-server'

# Reboot server (if necessary)
ssh root@46.250.243.123 'reboot'

# Wait 2-3 minutes, then verify services
ssh root@46.250.243.123 'systemctl status postgresql redis-server mcp-orchestrator'
```

#### PostgreSQL Failover to Standby

```bash
# Promote standby to primary (VMI02D)
ssh root@46.250.241.70 'sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main'

# Update application connection strings to point to VMI02D
# (This requires application configuration changes)
```

#### Database Connection Pool Exhaustion

```bash
# Kill idle connections
ssh root@46.250.243.123 "sudo -u postgres psql -d mcp_ecosystem -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < current_timestamp - interval '10 minutes';\""

# Restart PgBouncer (if installed)
ssh root@46.250.243.123 'systemctl restart pgbouncer'
```

---

## 7. Technical Specifications

### Software Versions

| Component | Version | Notes |
|-----------|---------|-------|
| **Operating System** | Ubuntu 24.04 LTS | All servers |
| **Node.js** | >= 20.0.0 | Runtime for MCP services |
| **TypeScript** | 5.9+ | Build toolchain |
| **PostgreSQL** | 16.10 | Primary database |
| **Redis** | 8.2.3 | Cache and pub/sub |
| **MCP SDK** | 1.20.2 | @modelcontextprotocol/sdk |
| **better-sqlite3** | 9.4.3 | Local SQLite (itjsst-mcp) |
| **Winston** | 3.13.0 | Logging framework |
| **Zod** | 3.22.4 | Schema validation |

### Database Schema Overview

**Database:** `mcp_ecosystem`
**Tables:** 24 core tables
**Schema Version:** v0.2.0

**Key Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `structured_thoughts` | Cognitive framework storage | thought_id, session_id, stage, content, quality_score |
| `structured_thought_dependencies` | Thought relationships | thought_id, depends_on_thought_id, relationship_type |
| `mcp_agents` | Agent registry | agent_id, agent_type, hostname, capabilities, last_heartbeat_at |
| `command_queue` | Distributed commands | job_id, agent_id, payload, status, priority |
| `mcp_tools` | Tool registry | tool_id, agent_id, tool_name, schema |
| `execution_history` | Command execution audit | execution_id, job_id, started_at, completed_at, result |
| `research_queries` | AI research cache | query_id, query_text, response, created_at |
| `bi_research_sessions` | Business intelligence | session_id, topic, insights, created_at |

**Structured Thinking Framework:**
- **Quality Scoring:** 0-100 scale with CHECK constraint
- **Hierarchical Thoughts:** parent_thought_id foreign key
- **Stage Management:** 5 cognitive stages (problem_definition → conclusion)
- **Full-Text Search:** Index on content for fast retrieval

**Agent Coordination:**
- **Agent Registry:** Auto-registration with capabilities
- **Heartbeat Monitoring:** last_heartbeat_at timestamp
- **Command Queue:** Priority-based job scheduling
- **Tool Registry:** Dynamic tool discovery

### Network Configuration

**WireGuard VPN Subnets:**
```
10.0.50.0/24  # VMI01 subnet
10.0.51.0/24  # VMI02D subnet
10.0.52.0/24  # VMI03 subnet
10.0.0.0/24   # Shared management subnet
```

**Firewall Rules (UFW):**
```
VMI01:
- 22/tcp    # SSH
- 5432/tcp  # PostgreSQL (internal VPN only)
- 6379/tcp  # Redis (localhost only)

VMI02D:
- 22/tcp    # SSH
- 5432/tcp  # PostgreSQL (internal VPN only)

VMI03:
- 22/tcp    # SSH
- 80/tcp    # HTTP (HAProxy)
- 443/tcp   # HTTPS (HAProxy)
- 8080/tcp  # Keycloak
- 9090/tcp  # Prometheus
- 3000/tcp  # Grafana
```

**Port Mapping:**

| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | WAN (root@password) |
| 5432 | PostgreSQL | VPN only |
| 6379 | Redis | Localhost only |
| 8080 | Keycloak | VPN + Gateway |
| 9090 | Prometheus | VPN + Gateway |
| 3000 | Grafana | VPN + Gateway |

### Performance Metrics

**Measured During Deployment:**

| Operation | Time | Target | Status |
|-----------|------|--------|--------|
| PostgreSQL Query | <50ms | <100ms | ✅ Excellent |
| Redis GET | <5ms | <10ms | ✅ Excellent |
| MCP Service Start | ~1-2s | <5s | ✅ Good |
| Tool Registration | <500ms | <1s | ✅ Excellent |
| Database Replication | 0ms lag | <10ms | ✅ Perfect |

**Resource Limits:**

| Resource | Current | Capacity | Threshold |
|----------|---------|----------|-----------|
| Disk (VMI01) | 5.2GB | 193GB | 80% (154GB) |
| Memory (VMI01) | 809MB | 11GB | 90% (9.9GB) |
| CPU Usage | <10% | 100% | 80% |
| PostgreSQL Connections | 3 | 100 | 80 (80 connections) |

### Backup Strategy

**PostgreSQL:**
- **Method:** pg_dump with gzip compression
- **Frequency:** Manual (automated backups planned)
- **Retention:** 30 days recommended
- **Location:** `/var/backups/`

**Redis:**
- **Method:** RDB snapshots (BGSAVE)
- **Frequency:** On-demand
- **Location:** `/var/lib/redis/dump.rdb`

**Configuration Files:**
- **Method:** Git version control
- **Frequency:** On change
- **Location:** Project repository

---

## 8. Emergency Contacts

### Technical Support

**Infrastructure Team:**
- Email: infrastructure@acdev.host
- On-Call: TBD

**Database Administration:**
- Email: dba@acdev.host
- Escalation: Infrastructure Team

**Security Team:**
- Email: security@acdev.host
- Emergency: Escalate immediately for security incidents

### Escalation Path

1. **Level 1:** Check logs and troubleshooting guide
2. **Level 2:** Restart affected service
3. **Level 3:** Contact Infrastructure Team
4. **Level 4:** Emergency reboot or failover
5. **Level 5:** Executive escalation (data loss risk)

### Service Level Objectives

**Uptime Target:** 99.9% (8.76 hours downtime/year)
**Response Time:**
- Critical (P0): 15 minutes
- High (P1): 1 hour
- Medium (P2): 4 hours
- Low (P3): 24 hours

**Recovery Time Objective (RTO):** 1 hour
**Recovery Point Objective (RPO):** 24 hours

---

## Appendix A: Quick Reference Commands

### Health Check

```bash
# Full system status
ssh root@46.250.243.123 'systemctl status postgresql redis-server mcp-orchestrator'

# Replication lag
ssh root@46.250.243.123 'sudo -u postgres psql -t -c "SELECT COALESCE(extract(epoch from (now() - pg_last_xact_replay_timestamp())), 0)::int FROM pg_stat_replication LIMIT 1;"'

# Disk and memory
ssh root@46.250.243.123 'df -h / && free -h'
```

### MCP Service Restart

```bash
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator && journalctl -u mcp-orchestrator -n 20'
```

### Database Backup

```bash
ssh root@46.250.243.123 'sudo -u postgres pg_dump mcp_ecosystem | gzip > /var/backups/mcp_ecosystem_$(date +%Y%m%d_%H%M%S).sql.gz'
```

### View Recent Errors

```bash
ssh root@46.250.243.123 'journalctl -p err -n 50 --no-pager'
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-14 | Infrastructure Team | Initial production release |

---

**END OF DOCUMENT**

*This datasheet is classified as Internal Use Only. Do not distribute outside the organization.*
