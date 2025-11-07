# MCP Ecosystem - Complete Deployment Guide v0.2.0

## 🎯 Overview

This guide provides a complete deployment walkthrough for the MCP Ecosystem infrastructure, including:
- **3-VM distributed architecture** (VMI01, VMI02D, VMI03)
- **Structured thinking database** with full-text search and branch analytics
- **High-availability PostgreSQL** with streaming replication and automatic failover
- **Self-healing MCP services** with health monitoring and auto-recovery
- **Security hardening** with IP whitelisting and multi-layer defense
- **Automated maintenance** with scheduled optimization and cleanup

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Deployment Steps](#detailed-deployment-steps)
5. [Security Configuration](#security-configuration)
6. [High Availability Setup](#high-availability-setup)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Testing & Validation](#testing--validation)
9. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP ECOSYSTEM v0.2.0                     │
│                  Distributed Architecture                    │
└─────────────────────────────────────────────────────────────┘

┌───────────────────┐      ┌───────────────────┐      ┌──────────────────┐
│   VMI01 (Primary) │      │ VMI02D (Standby)  │      │  VMI03 (Gateway) │
│  46.250.243.123   │      │  46.250.241.70    │      │  154.26.158.31   │
├───────────────────┤      ├───────────────────┤      ├──────────────────┤
│ • PostgreSQL 16   │◄────►│ • PostgreSQL 16   │      │ • HAProxy LB     │
│   (Primary R/W)   │      │   (Standby R/O)   │      │ • Failover Mon   │
│ • MCP Orchestrator│      │ • Streaming Rep   │      │ • Keycloak SSO   │
│ • Perplexity MCP  │      │ • Hot Standby     │      │ • Pi-Hole DNS    │
│ • IT-MCP Server   │      │ • Storage Layer   │      │ • Security Gtwy  │
│ • Redis Cache     │      │ • Backup Storage  │      │ • Prometheus     │
│ • PgBouncer Pool  │      │                   │      │ • Grafana        │
└───────────────────┘      └───────────────────┘      └──────────────────┘
         │                          │                          │
         └──────────────────────────┴──────────────────────────┘
                        WireGuard VPN Mesh
                   (3 tunnels: root, MCP, red)
              10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24
```

### Database Schema v0.2.0

**Core Tables:**
- `thoughts` - Structured thinking records with 8 cognitive stages
- `thought_branches` - Parallel reasoning paths with hypothesis tracking
- `thought_relationships` - Graph connections between thoughts
- `feedback_signals` - Metacognitive monitoring and confidence tracking
- `thought_sync_queue` - Distributed synchronization queue
- `mcp_servers` - Service registry and health tracking
- `server_metrics` - Performance monitoring data

**Advanced Features:**
- Full-text search with `tsvector` and GIN indexes
- Branch health analytics with confidence scoring
- Timeline views with recursive CTE queries
- Automatic timestamp triggers
- Optimized indexes for common query patterns

---

## 🔧 Prerequisites

### Required Access
- SSH access to all three VMs (VMI01, VMI02D, VMI03)
- `dev-admin` user with sudo privileges
- Database credentials (stored in `.env` files)

### Local Requirements
```bash
# Required tools
- bash 4.0+
- ssh client
- git
- curl
- jq (for JSON processing)

# Optional but recommended
- k6 (for load testing)
- postgresql-client (for database access)
```

### VM Requirements
- **OS**: Ubuntu 22.04 LTS (all VMs)
- **Node.js**: v20.x or higher
- **PostgreSQL**: 16.x
- **Disk Space**: Minimum 20GB free per VM
- **Memory**: Minimum 4GB per VM
- **Network**: VPN tunnels established between all VMs

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "MCP Bundle"
```

### 2. Configure Environment

```bash
# Set your admin IP for whitelisting
export ADMIN_IP="YOUR.PUBLIC.IP.HERE"

# Set VM hosts (if different from defaults)
export VMI01_HOST="46.250.243.123"
export VMI02D_HOST="46.250.241.70"
export VMI03_HOST="154.26.158.31"
```

### 3. One-Command Full Deployment

```bash
# Deploy everything (database + services + config)
./deployment/scripts/deploy-production.sh
```

This will:
1. ✅ Upload schema files
2. ✅ Run database migration (v0.1 → v0.2)
3. ✅ Deploy MCP services (orchestrator, perplexity, IT-MCP)
4. ✅ Configure log rotation and directories
5. ✅ Validate deployment

**Duration**: ~20-30 minutes

---

## 📖 Detailed Deployment Steps

### Phase 1: Database Migration (v0.1 → v0.2)

```bash
# Option 1: Migrate as part of full deployment
./deployment/scripts/deploy-production.sh

# Option 2: Migrate database only
./deployment/scripts/deploy-production.sh --database-only
```

**What it does:**
- Creates automatic backup
- Stops MCP services
- Runs migration SQL script
- Adds new tables: `thought_branches`, `feedback_signals`, etc.
- Creates full-text search indexes
- Installs new functions: `search_thoughts()`, `get_branch_health()`
- Validates migration
- Restarts services

**Rollback if needed:**
```bash
# Automatic rollback prompt on failure
# Or manual restore:
ssh dev-admin@46.250.243.123
cd /var/backups/postgresql
pg_restore -U mcp_admin -d mcp_ecosystem <backup-file>
```

### Phase 2: MCP Services Deployment

```bash
# Option 1: Deploy as part of full deployment
./deployment/scripts/deploy-production.sh

# Option 2: Deploy services only
./deployment/scripts/deploy-production.sh --services-only
```

**What it does:**
- Builds services locally (TypeScript compilation)
- Syncs files to remote VMs via rsync
- Installs production dependencies
- Creates `.env` configuration files
- Creates systemd service units
- Enables and starts services

**Service Endpoints:**
- MCP Orchestrator: `http://46.250.243.123:3000`
- Perplexity MCP: `http://46.250.243.123:3001`
- IT-MCP Server: `http://46.250.243.123:3002`

### Phase 3: Security Configuration

```bash
# Configure IP whitelisting across all VMs
./deployment/security/configure-ip-whitelist.sh
```

**What it does:**
- Auto-detects your public IP (or prompts for it)
- Configures UFW firewall on all VMs
- Sets up Fail2Ban intrusion prevention
- Updates PostgreSQL `pg_hba.conf`
- Configures Nginx whitelist (if applicable)
- Restricts Pi-Hole admin interface
- Locks down Keycloak admin console

**Security Layers:**
- ✅ UFW firewall rules
- ✅ Fail2Ban active monitoring
- ✅ PostgreSQL access control
- ✅ Service-level IP filtering
- ✅ VPN-only internal communication

### Phase 4: High Availability Setup

```bash
# Configure HA with database replication and failover
./deployment/ha/configure-high-availability.sh
```

**What it does:**
- Configures PostgreSQL streaming replication
- Sets up hot standby on VMI02D
- Installs HAProxy load balancer on VMI03
- Creates automatic failover monitoring
- Configures PgBouncer connection pooling
- Enables read scaling via standby

**HA Features:**
- ✅ Automatic failover (max 3 failures, 5min cooldown)
- ✅ Load balancing for MCP services
- ✅ Database read scaling
- ✅ Connection pooling (1000 client connections)
- ✅ Health monitoring every 10 seconds

**Testing Failover:**
```bash
# Simulate primary failure
ssh dev-admin@46.250.243.123 'sudo systemctl stop postgresql'

# Monitor failover
ssh dev-admin@154.26.158.31 'tail -f /var/log/mcp/failover.log'

# Verify standby promotion
ssh dev-admin@46.250.241.70 "sudo -u postgres psql -c \"SELECT pg_is_in_recovery();\""
# Should return 'f' (false) = now primary
```

### Phase 5: Monitoring & Self-Healing

```bash
# Install health monitoring with auto-healing
./deployment/monitoring/mcp-health-monitor.sh --install-systemd
```

**What it does:**
- Monitors all MCP services (every 30s)
- Checks database health
- Monitors system resources (CPU, memory, disk)
- Validates VPN connectivity
- Checks sync queue status
- Auto-restarts failed services
- Records failure counts and cooldowns

**Auto-Healing Features:**
- ✅ Service restart (max 3 attempts, 5min cooldown)
- ✅ Database restart
- ✅ VPN tunnel recovery
- ✅ Stuck sync queue cleanup
- ✅ Memory pressure relief

**Monitoring Commands:**
```bash
# View health monitor status
sudo systemctl status mcp-health-monitor

# View live logs
journalctl -u mcp-health-monitor -f

# Manual health check
./deployment/monitoring/mcp-health-monitor.sh
```

### Phase 6: Automated Maintenance

```bash
# Install automated maintenance cron jobs
./deployment/automation/auto-management.sh --install-cron
```

**What it does:**
- **Daily (3 AM)**: Log cleanup, disk space check, metrics collection
- **Weekly (Sun 4 AM)**: Database VACUUM, security updates check
- **Monthly (1st 5 AM)**: Full optimization, backup verification

**Maintenance Tasks:**
- ✅ Database VACUUM ANALYZE
- ✅ Bloat detection and cleanup
- ✅ Unused index identification
- ✅ Log rotation and compression
- ✅ Disk space management
- ✅ Performance optimization
- ✅ Security update notifications
- ✅ Backup integrity verification

**Manual Maintenance:**
```bash
# Run all maintenance tasks now
./deployment/automation/auto-management.sh

# Run specific schedule
./deployment/automation/auto-management.sh --daily
./deployment/automation/auto-management.sh --weekly
./deployment/automation/auto-management.sh --monthly
```

---

## 🔒 Security Configuration

### Multi-Layer Security Architecture

```
Layer 1: Network Firewall (UFW)
  ├── Allow admin IP: YOUR.IP
  ├── Allow VPN networks: 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24
  ├── Allow inter-VM: All VMs can communicate
  └── Deny all other traffic

Layer 2: Intrusion Prevention (Fail2Ban)
  ├── SSH protection: 3 attempts, 2hr ban
  ├── PostgreSQL protection: 5 attempts, 1hr ban
  ├── HTTP auth protection
  └── Whitelisted: Admin IP, VPN networks, internal VMs

Layer 3: Application Access Control
  ├── PostgreSQL pg_hba.conf: IP-based authentication
  ├── Nginx whitelist: Reverse proxy filtering
  ├── Keycloak admin: Restricted to admin IP + VPN
  └── Pi-Hole admin: VPN and admin IP only

Layer 4: Service-Level Authentication
  ├── Keycloak SSO: JWT tokens, OIDC
  ├── Database: SCRAM-SHA-256 passwords
  └── API endpoints: Service-to-service authentication
```

### Updating Whitelisted IPs

```bash
# Add new admin IP
ADMIN_IP="NEW.IP.ADDRESS" ./deployment/security/configure-ip-whitelist.sh

# Edit whitelist script for permanent changes
nano deployment/security/configure-ip-whitelist.sh
# Update ALLOWED_NETWORKS array
```

---

## 🔄 High Availability Details

### Database Replication Status

```bash
# Check replication on primary
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT * FROM pg_stat_replication;"'

# Check replication on standby
ssh dev-admin@46.250.241.70 \
  'sudo -u postgres psql -c "SELECT * FROM pg_stat_wal_receiver;"'

# Check replication lag
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT application_name, state, sync_state, replay_lag FROM pg_stat_replication;"'
```

### HAProxy Statistics

```bash
# View HAProxy stats page
open http://154.26.158.31:8404/stats
# Username: admin
# Password: mcp-ha-stats-2024
```

### Load Balancer Endpoints

```bash
# Access MCP services via load balancer
curl http://154.26.158.31:3000/health  # MCP Orchestrator
curl http://154.26.158.31:3001/health  # Perplexity MCP
curl http://154.26.158.31:3002/health  # IT-MCP

# Database connections
psql -h 154.26.158.31 -p 5432 -U mcp_admin -d mcp_ecosystem  # Primary (R/W)
psql -h 154.26.158.31 -p 5433 -U mcp_admin -d mcp_ecosystem  # Standby (R/O)
```

---

## 📊 Monitoring & Maintenance

### Health Monitoring Dashboard

```bash
# Real-time health status
./deployment/monitoring/mcp-health-monitor.sh

# View collected metrics
cat /var/lib/mcp/monitor/metrics/*.json | jq .
```

### Service Status

```bash
# Check all MCP services
for service in mcp-orchestrator perplexity-mcp it-mcp; do
  ssh dev-admin@46.250.243.123 "systemctl status $service"
done

# Check service logs
ssh dev-admin@46.250.243.123 'journalctl -u mcp-orchestrator -n 100'
```

### Database Health

```bash
# Connection count
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='"'mcp_ecosystem'"';"'

# Database size
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('"'mcp_ecosystem'"'));"'

# Long-running queries
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT pid, now() - query_start as duration, query FROM pg_stat_activity WHERE state = '"'active'"' AND now() - query_start > interval '"'5 minutes'"' ORDER BY query_start;"'
```

### Disk Space

```bash
# Check disk usage on all VMs
for host in 46.250.243.123 46.250.241.70 154.26.158.31; do
  echo "=== $host ==="
  ssh dev-admin@$host 'df -h /'
done
```

### Metrics Collection

Metrics are automatically collected every 30 seconds and stored in:
```
/var/lib/mcp/monitor/metrics/
```

View metrics:
```bash
# Latest metrics
cat /var/lib/mcp/monitor/metrics/*.json | tail -1 | jq .

# Average CPU usage over last hour
find /var/lib/mcp/monitor/metrics -name "*.json" -mmin -60 -exec cat {} \; | \
  jq -r '.vms["46.250.243.123"].cpu_usage_pct' | \
  awk '{sum+=$1; count++} END {print sum/count}'
```

---

## ✅ Testing & Validation

### Integration Tests

```bash
# Run full integration test suite
./deployment/tests/mcp-integration-tests.sh
```

**Test Coverage:**
- ✅ SSH connectivity to all VMs
- ✅ PostgreSQL accessibility
- ✅ MCP service health endpoints
- ✅ Database schema version
- ✅ Critical table existence
- ✅ Orchestrator → worker communication
- ✅ Thought synchronization
- ✅ Load balancing
- ✅ Failure recovery mechanisms
- ✅ Performance metrics

### Load Testing

```bash
# Install k6
curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
sudo cp k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

# Baseline load test (10 users)
k6 run deployment/tests/mcp-load-test.js

# Peak load test (100 users)
k6 run -e TEST_TYPE=peak deployment/tests/mcp-load-test.js

# Stress test (300 users)
k6 run -e TEST_TYPE=stress deployment/tests/mcp-load-test.js
```

**Test Scenarios:**
- Health checks across all services
- Thought creation with persistence validation
- Full-text search queries
- Branch operations
- Command dispatch to workers
- Read-heavy operations (thought retrieval)

**Performance Targets:**
- **Baseline**: P95 < 500ms, <1% error rate
- **Peak**: P95 < 1000ms, <5% error rate
- **Stress**: P95 < 2000ms, <10% error rate

---

## 🐛 Troubleshooting

### Service Won't Start

```bash
# Check service status
ssh dev-admin@46.250.243.123 'sudo systemctl status mcp-orchestrator'

# View recent logs
ssh dev-admin@46.250.243.123 'journalctl -u mcp-orchestrator -n 50'

# Check configuration
ssh dev-admin@46.250.243.123 'cat /opt/mcp/services/mcp-orchestrator/.env'

# Manually start and watch logs
ssh dev-admin@46.250.243.123 'cd /opt/mcp/services/mcp-orchestrator && node dist/index.js'
```

### Database Connection Issues

```bash
# Test direct connection
ssh dev-admin@46.250.243.123
psql -h localhost -U mcp_admin -d mcp_ecosystem

# Check PostgreSQL is running
sudo systemctl status postgresql

# Check pg_hba.conf
sudo cat /etc/postgresql/16/main/pg_hba.conf | grep mcp

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE datname='mcp_ecosystem';"
```

### Replication Lag

```bash
# Check lag on primary
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT application_name, replay_lag FROM pg_stat_replication;"'

# If lag is high (>1s), check:
# 1. Network connectivity between primary and standby
ping 10.0.50.2  # Standby VPN IP

# 2. Standby performance
ssh dev-admin@46.250.241.70 'top -bn1 | head -20'

# 3. WAL sender queue
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT * FROM pg_stat_replication;"'
```

### High CPU/Memory Usage

```bash
# Identify resource-heavy processes
ssh dev-admin@46.250.243.123 'top -bn1 | head -20'

# Check for runaway queries
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT pid, now() - query_start as duration, query FROM pg_stat_activity WHERE state = '"'active'"' ORDER BY query_start;"'

# Kill problematic query (if needed)
ssh dev-admin@46.250.243.123 \
  'sudo -u postgres psql -c "SELECT pg_terminate_backend(<PID>);"'

# Clear page cache (if safe)
ssh dev-admin@46.250.243.123 'sync && sudo sh -c "echo 3 > /proc/sys/vm/drop_caches"'
```

### Disk Space Full

```bash
# Check disk usage
ssh dev-admin@46.250.243.123 'df -h'

# Find large directories
ssh dev-admin@46.250.243.123 'sudo du -h --max-depth=2 / 2>/dev/null | sort -h | tail -20'

# Clean up old logs
ssh dev-admin@46.250.243.123 'sudo find /var/log -name "*.log" -mtime +7 -delete'
ssh dev-admin@46.250.243.123 'sudo journalctl --vacuum-time=7d'

# Clean package cache
ssh dev-admin@46.250.243.123 'sudo apt-get clean && sudo apt-get autoremove -y'
```

### Failed Failover

```bash
# Check failover monitor status
ssh dev-admin@154.26.158.31 'sudo systemctl status mcp-failover-monitor'

# View failover logs
ssh dev-admin@154.26.158.31 'tail -f /var/log/mcp/failover.log'

# Manually promote standby to primary
ssh dev-admin@46.250.241.70 'sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main'

# Verify promotion
ssh dev-admin@46.250.241.70 "sudo -u postgres psql -c \"SELECT pg_is_in_recovery();\""
# Should return 'f' (false)
```

---

## 📞 Support & Contact

### Log Files
- **Deployment**: `/var/log/mcp/production_deploy_*.log`
- **Health Monitor**: `/var/log/mcp/health-monitor.log`
- **Failover**: `/var/log/mcp/failover.log`
- **Maintenance**: `/var/log/mcp/auto-management-cron.log`
- **Service Logs**: `journalctl -u <service-name>`

### Quick Reference Commands

```bash
# Service management
systemctl status mcp-orchestrator
systemctl restart perplexity-mcp
journalctl -u it-mcp -f

# Database
psql -h localhost -U mcp_admin -d mcp_ecosystem
sudo -u postgres psql -c "SELECT * FROM pg_stat_replication;"

# Monitoring
./deployment/monitoring/mcp-health-monitor.sh
./deployment/tests/mcp-integration-tests.sh

# Maintenance
./deployment/automation/auto-management.sh --daily
```

---

## 📝 Version History

### v0.2.0 (Current)
- ✅ Structured thinking database with full-text search
- ✅ Branch analytics and relationship graphs
- ✅ PostgreSQL streaming replication
- ✅ HAProxy load balancing
- ✅ Automatic failover monitoring
- ✅ Self-healing health checks
- ✅ IP whitelisting and security hardening
- ✅ Automated maintenance scheduling

### v0.1.0 (Previous)
- Basic MCP infrastructure
- Single-node PostgreSQL
- Manual deployment
- No high availability

---

## 🎓 Next Steps

1. **Configure Perplexity API Key**:
   ```bash
   ssh dev-admin@46.250.243.123
   sudo nano /opt/mcp/services/perplexity-mcp/.env
   # Add: PERPLEXITY_API_KEY=[REDACTED]
   sudo systemctl restart perplexity-mcp
   ```

2. **Test Inter-MCP Communication**:
   ```bash
   curl -X POST http://46.250.243.123:3000/api/v1/thoughts \
     -H "Content-Type: application/json" \
     -d '{"content":"Test thought","thought_type":"problem_definition","confidence":0.9}'
   ```

3. **Monitor Initial Performance**:
   ```bash
   # Watch metrics for first 24 hours
   watch -n 30 './deployment/monitoring/mcp-health-monitor.sh'
   ```

4. **Schedule Maintenance Window for Failover Test**:
   ```bash
   # Test failover in low-traffic period
   # Simulate failure and verify automatic recovery
   ```

5. **Configure Additional Monitoring** (Phase 5):
   - Deploy Prometheus metrics collection
   - Set up Grafana dashboards
   - Configure ELK stack for log aggregation
   - Set up alerting (Email, Slack, PagerDuty)

---

**🎉 Your MCP Ecosystem is now production-ready with full automation, high availability, and self-healing capabilities!**
