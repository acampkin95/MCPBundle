# MCP Monitoring Agents - Complete Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Agent Specifications](#agent-specifications)
5. [Installation Steps](#installation-steps)
6. [Configuration](#configuration)
7. [Testing & Validation](#testing--validation)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Security Hardening](#security-hardening)

---

## Overview

This deployment package contains 6 production-ready MCP-based monitoring agents designed to provide comprehensive infrastructure monitoring across 3 VMs:

- **VMI01 (46.250.243.123)**: Dev/MCP Server
  - Database Optimizer Agent
  - Application Health Agent

- **VMI02D**: Storage Server
  - Storage Management Agent
  - Service Health Agent

- **VMI03**: Security Gateway
  - Network Security Agent
  - Identity Management Agent

**Total System Impact**: <5% CPU, <1GB RAM across all agents

---

## Architecture

### Communication Flow

```
Agent → PostgreSQL (metrics storage)
     → Redis (cache/queue)
     → Prometheus Pushgateway (metrics export)
     → MCP Orchestrator (coordination)
```

### Data Flow

1. **Metrics Collection**: Agents collect metrics every 30-60 seconds
2. **Storage**: Metrics stored in PostgreSQL `system_metrics` table
3. **Caching**: Recent metrics cached in Redis (5min TTL)
4. **Export**: Metrics pushed to Prometheus Pushgateway
5. **Alerting**: Threshold violations trigger alerts (Redis + PostgreSQL)
6. **Visualization**: Grafana queries Prometheus for dashboards

---

## Prerequisites

### System Requirements

**All VMs**:

- Ubuntu 20.04 LTS or newer
- Node.js >= 18.0.0
- npm >= 9.0.0
- systemd
- 500MB free disk space per agent
- Root/sudo access

**VMI01 Only**:

- PostgreSQL >= 13
- Redis >= 6.0
- Prometheus Pushgateway
- pg_stat_statements extension enabled

### Network Requirements

- SSH access to all VMs (port 22)
- Outbound HTTPS for npm packages
- Inter-VM connectivity for metrics push

### Credentials Needed

- PostgreSQL password for `mcp_orchestrator` user
- Redis password (if AUTH enabled)
- SSH private key for deployment

---

## Agent Specifications

### 1. Database Optimizer Agent (VMI01)

**Purpose**: PostgreSQL performance monitoring and optimization

**Metrics**:

- `db_connections_active{database}`: Active connections
- `db_cache_hit_ratio{database}`: Cache efficiency (target >95%)
- `db_dead_tuples{schema,table}`: Dead tuples needing vacuum
- `db_bloat_ratio{schema,table}`: Table bloat percentage
- `db_slow_queries_total{database}`: Queries >1000ms
- `db_vacuum_runs_total{type}`: Vacuum operations count
- `db_index_scans{schema,table,index}`: Index usage stats

**Auto-Actions**:

- VACUUM when dead_tuples > 10,000
- ANALYZE after data changes
- Index recommendations for seq_scan heavy tables

**Alerts**:

- Critical: Connection pool exhausted, replication lag
- Warning: Cache hit <95%, bloat >30%
- Info: Vacuum needed, unused indexes

**Configuration**:

```yaml
monitoring:
  thresholds:
    cache_hit_ratio_min: 0.95
    dead_tuples_max: 10000
    bloat_ratio_max: 0.3
    slow_query_ms: 1000
```

**Port**: 9100
**Interval**: 60s
**Dependencies**: pg_stat_statements

---

### 2. Application Health Agent (VMI01)

**Purpose**: Application service monitoring and auto-recovery

**Services Monitored**:

- MCP Orchestrator (port 3000)
- Perplexity-MCP (port 3001)
- ITJSST-MCP (port 3002)
- PostgreSQL (systemd)
- Redis (systemd)
- Keycloak (port 8080)

**Metrics**:

- `service_status{service,type}`: 1=healthy, 0=unhealthy
- `service_cpu_percent{service}`: CPU usage
- `service_memory_mb{service}`: Memory usage
- `service_restarts_total{service}`: Restart count
- `service_response_time_ms{service}`: HTTP response time

**Auto-Recovery**:

- Restart failed processes (max 3 attempts)
- Exponential backoff: 5s, 10s, 20s
- Clear Redis cache on memory pressure
- Log pattern analysis for early warnings

**Alerts**:

- Critical: Service down, auto-restart failed
- Warning: High CPU/memory (>80%), slow response
- Info: Service restarted, degraded performance

**Port**: 9101
**Interval**: 30s

---

### 3. Storage Management Agent (VMI02D)

**Purpose**: Disk space and snapshot monitoring

**Metrics**:

- `disk_usage_percent{mount}`: Disk utilization
- `snapshot_age_days{snapshot}`: Snapshot freshness
- `disk_io_wait_percent`: I/O bottleneck indicator
- `smart_health_status{disk}`: Disk hardware health
- `dedup_opportunities_gb`: Potential savings

**Auto-Actions**:

- Alert at 80% disk usage
- Rotate snapshots >30 days old
- Verify snapshot integrity
- Recommend cleanup actions

**Alerts**:

- Critical: Disk >90%, SMART errors
- Warning: Disk >80%, old snapshots
- Info: Deduplication opportunities

**Configuration**:

```yaml
monitoring:
  thresholds:
    disk_percent_max: 90
    snapshot_age_days_max: 30
    io_wait_percent_max: 50
```

**Port**: 9200
**Interval**: 60s

---

### 4. Service Health Agent (VMI02D)

**Purpose**: NextCloud/Plex service monitoring

**Services Monitored**:

- NextCloud (port 8081)
- Plex Media Server (port 32400)
- Background cron jobs
- File sync status

**Metrics**:

- `service_api_status{service}`: API availability
- `service_db_connection{service}`: Database health
- `service_disk_io_mb{service}`: I/O throughput
- `media_library_scan_progress`: Plex scan status
- `nextcloud_sync_errors_total`: Sync failures

**Auto-Recovery**:

- Restart hung services
- Clear file locks
- Reset failed cron jobs
- Repair database connections

**Port**: 9201
**Interval**: 30s

---

### 5. Network Security Agent (VMI03)

**Purpose**: Network tunnel and IDS monitoring

**Metrics**:

- `wireguard_tunnel_status{tunnel}`: 1=up, 0=down
- `wireguard_peer_handshake_seconds{peer}`: Last handshake age
- `ids_alerts_total{severity}`: Suricata alerts
- `firewall_blocks_total{rule}`: UFW blocks
- `fail2ban_jail_count{jail}`: Banned IPs

**Auto-Actions**:

- Restart disconnected tunnels
- Block malicious IPs via fail2ban
- Log security events to PostgreSQL
- Alert on repeated auth failures

**Alerts**:

- Critical: Tunnel down, active intrusion
- Warning: High alert rate, unusual traffic
- Info: Tunnel reconnected, jail updates

**Configuration**:

```yaml
monitoring:
  tunnels:
    - name: 'root'
      interface: 'wg-root'
    - name: 'mcp'
      interface: 'wg-mcp'
    - name: 'red'
      interface: 'wg-red'
```

**Port**: 9300
**Interval**: 30s

---

### 6. Identity Management Agent (VMI03)

**Purpose**: Keycloak authentication monitoring

**Metrics**:

- `keycloak_active_sessions`: Current user sessions
- `keycloak_auth_attempts_total{result}`: success/failure count
- `keycloak_token_expiry_seconds`: Token TTL distribution
- `keycloak_response_time_ms`: API latency
- `keycloak_failed_auth_rate`: Brute force detection

**Auto-Actions**:

- Lock accounts after 5 failed attempts
- Clear expired sessions
- Restart Keycloak on health check failure
- Alert on brute force patterns

**Alerts**:

- Critical: Keycloak down, brute force attack
- Warning: High failure rate, slow response
- Info: Token expiry, session cleanup

**Port**: 9301
**Interval**: 60s

---

## Installation Steps

### Quick Start (Automated)

```bash
# 1. Clone/extract agent package
cd /path/to/agents

# 2. Update VM hostnames in deploy-agents.sh
nano deploy-agents.sh
# Edit: VMI01_HOST, VMI02D_HOST, VMI03_HOST

# 3. Run deployment
./deploy-agents.sh all

# 4. Follow prompts for passwords
```

### Manual Installation (Per VM)

#### Step 1: Prepare VM

```bash
# Connect to VM
ssh root@<vm-host>

# Create system user
useradd -r -s /bin/false -d /opt/mcp-agents -m mcp-agent

# Create directories
mkdir -p /opt/mcp-agents
mkdir -p /var/log/mcp-agents
mkdir -p /var/lib/mcp-agents
mkdir -p /etc/mcp-agents

# Set ownership
chown -R mcp-agent:mcp-agent /opt/mcp-agents
chown -R mcp-agent:mcp-agent /var/log/mcp-agents
chown -R mcp-agent:mcp-agent /var/lib/mcp-agents
```

#### Step 2: Build Agent (Local)

```bash
cd agents/vmi01/db-optimizer-agent

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

#### Step 3: Deploy Agent

```bash
# Create tarball
tar -czf /tmp/db-optimizer-agent.tar.gz \
    --exclude=node_modules \
    -C agents/vmi01 db-optimizer-agent

# Copy to VM
scp /tmp/db-optimizer-agent.tar.gz root@<vm-host>:/tmp/

# Extract on VM
ssh root@<vm-host>
cd /opt/mcp-agents
tar -xzf /tmp/db-optimizer-agent.tar.gz
cd db-optimizer-agent
npm install --production
chown -R mcp-agent:mcp-agent /opt/mcp-agents/db-optimizer-agent
```

#### Step 4: Configure Agent

```bash
# Create environment file
cat > /etc/mcp-agents/db-optimizer.env << EOF
NODE_ENV=production
CONFIG_PATH=/opt/mcp-agents/db-optimizer-agent/config/config.yaml
DB_PASSWORD=your_secure_postgres_password
REDIS_PASSWORD=your_secure_redis_password
EOF

chmod 600 /etc/mcp-agents/db-optimizer.env
chown mcp-agent:mcp-agent /etc/mcp-agents/db-optimizer.env

# Edit config file
nano /opt/mcp-agents/db-optimizer-agent/config/config.yaml
# Update: database.host, redis.host, prometheus.pushgateway_url
```

#### Step 5: Install Systemd Service

```bash
# Copy service file
cp db-optimizer.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable and start
systemctl enable db-optimizer
systemctl start db-optimizer

# Check status
systemctl status db-optimizer
```

#### Step 6: Verify Installation

```bash
# Check health endpoint
curl http://localhost:9100/health

# Check metrics endpoint
curl http://localhost:9100/metrics

# View logs
journalctl -u db-optimizer -f
```

---

## Configuration

### Database Setup (VMI01 Only)

```sql
-- Connect to PostgreSQL
sudo -u postgres psql

-- Create database
CREATE DATABASE mcp_ecosystem;

-- Create user
CREATE USER mcp_orchestrator WITH PASSWORD 'your_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE mcp_ecosystem TO mcp_orchestrator;

-- Connect to database
\c mcp_ecosystem

-- Create schema
CREATE SCHEMA IF NOT EXISTS mcp_ecosystem;

-- Create tables (see deploy-agents.sh for full schema)
CREATE TABLE mcp_ecosystem.agent_heartbeats (...);
CREATE TABLE mcp_ecosystem.system_metrics (...);

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Configure postgresql.conf
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.max = 10000
-- pg_stat_statements.track = all

-- Restart PostgreSQL
\q
sudo systemctl restart postgresql
```

### Prometheus Pushgateway (VMI01 Only)

```bash
# Install Pushgateway
cd /tmp
wget https://github.com/prometheus/pushgateway/releases/download/v1.7.0/pushgateway-1.7.0.linux-amd64.tar.gz
tar -xzf pushgateway-1.7.0.linux-amd64.tar.gz
sudo mv pushgateway-1.7.0.linux-amd64/pushgateway /usr/local/bin/

# Create service
sudo tee /etc/systemd/system/pushgateway.service > /dev/null << EOF
[Unit]
Description=Prometheus Pushgateway
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/usr/local/bin/pushgateway --web.listen-address=:9091
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Create user and start
sudo useradd -r -s /bin/false prometheus
sudo systemctl daemon-reload
sudo systemctl enable pushgateway
sudo systemctl start pushgateway

# Verify
curl http://localhost:9091/metrics
```

### Prometheus Server Configuration

```yaml
# /etc/prometheus/prometheus.yml

scrape_configs:
  - job_name: 'pushgateway'
    honor_labels: true
    static_configs:
      - targets: ['localhost:9091']

  - job_name: 'agents-vmi01'
    static_configs:
      - targets:
          - 'localhost:9100' # db-optimizer
          - 'localhost:9101' # app-health

  - job_name: 'agents-vmi02d'
    static_configs:
      - targets:
          - '<vmi02d-ip>:9200' # storage-mgmt
          - '<vmi02d-ip>:9201' # service-health

  - job_name: 'agents-vmi03'
    static_configs:
      - targets:
          - '<vmi03-ip>:9300' # network-sec
          - '<vmi03-ip>:9301' # identity-mgmt
```

---

## Testing & Validation

### Pre-Deployment Checklist

- [ ] Node.js >= 18 installed on all VMs
- [ ] PostgreSQL running on VMI01
- [ ] Redis running on VMI01
- [ ] pg_stat_statements extension enabled
- [ ] SSH access to all VMs configured
- [ ] Firewall rules allow health check ports
- [ ] Database credentials prepared
- [ ] VM hostnames updated in deploy script

### Post-Deployment Validation

#### 1. Service Status Check

```bash
# On each VM, check all agents
systemctl status db-optimizer
systemctl status app-health
systemctl status storage-mgmt
systemctl status service-health
systemctl status network-sec
systemctl status identity-mgmt

# All should show: Active: active (running)
```

#### 2. Health Endpoint Check

```bash
# VMI01
curl http://localhost:9100/health | jq .
curl http://localhost:9101/health | jq .

# VMI02D
curl http://localhost:9200/health | jq .
curl http://localhost:9201/health | jq .

# VMI03
curl http://localhost:9300/health | jq .
curl http://localhost:9301/health | jq .

# Expected: {"status":"healthy",...}
```

#### 3. Metrics Validation

```bash
# Check metrics are being collected
curl http://localhost:9100/metrics | grep db_connections_active

# Check Pushgateway received metrics
curl http://localhost:9091/metrics | grep db_optimizer_heartbeat_total

# Expected: Non-zero metric values
```

#### 4. Database Validation

```sql
-- Connect to PostgreSQL
psql -U mcp_orchestrator -d mcp_ecosystem

-- Check heartbeats
SELECT agent_id, status, last_heartbeat
FROM mcp_ecosystem.agent_heartbeats
ORDER BY last_heartbeat DESC;

-- Expected: All 6 agents with recent timestamps

-- Check metrics
SELECT agent_id, metric_type, COUNT(*)
FROM mcp_ecosystem.system_metrics
WHERE created_at > NOW() - INTERVAL '5 minutes'
GROUP BY agent_id, metric_type;

-- Expected: Multiple entries per agent
```

#### 5. Log Analysis

```bash
# Check for errors
journalctl -u db-optimizer -n 100 | grep -i error

# Check for successful metric collection
journalctl -u db-optimizer -n 100 | grep "Metrics pushed"

# Expected: No critical errors, regular metric pushes
```

#### 6. Load Testing

```bash
# Generate database load
pgbench -i -s 50 mcp_ecosystem
pgbench -c 10 -j 2 -t 1000 mcp_ecosystem

# Monitor agent response
watch -n 1 'curl -s http://localhost:9100/health | jq .checks.database'

# Expected: Agent remains healthy under load
```

#### 7. Failover Testing

```bash
# Test auto-restart
systemctl stop mcp-orchestrator
sleep 35  # Wait for health check

# Check app-health-agent logs
journalctl -u app-health -n 20

# Expected: Auto-restart attempt logged

# Verify service restarted
systemctl status mcp-orchestrator
# Expected: Active (running)
```

---

## Monitoring & Maintenance

### Daily Tasks

```bash
# Check all agent statuses
for agent in db-optimizer app-health storage-mgmt service-health network-sec identity-mgmt; do
    echo "=== $agent ==="
    systemctl is-active $agent
done

# Review alerts
psql -U mcp_orchestrator -d mcp_ecosystem -c \
    "SELECT * FROM system_metrics WHERE metric_type='alert' AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 20;"

# Check disk space
df -h | grep -E '(Filesystem|opt|var)'
```

### Weekly Tasks

```bash
# Analyze metric trends
# (Use Grafana dashboards)

# Review slow queries
psql -U postgres -c \
    "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check for unused indexes
psql -U mcp_orchestrator -d mcp_ecosystem -c \
    "SELECT * FROM system_metrics WHERE metric_type='index_metrics' AND metric_data->>'scans' = '0' ORDER BY created_at DESC LIMIT 10;"

# Review agent logs for patterns
for agent in db-optimizer app-health; do
    journalctl -u $agent --since "7 days ago" | grep -i warn | sort | uniq -c
done
```

### Monthly Tasks

```bash
# Clean old metrics (retain 30 days)
psql -U mcp_orchestrator -d mcp_ecosystem -c \
    "DELETE FROM system_metrics WHERE created_at < NOW() - INTERVAL '30 days';"

# Vacuum database
psql -U postgres -c "VACUUM ANALYZE mcp_ecosystem.system_metrics;"

# Review threshold configurations
# Adjust based on observed baselines

# Update agents (if new version available)
./deploy-agents.sh vmi01  # Redeploy with new code
```

---

## Troubleshooting

### Agent Won't Start

**Symptoms**: `systemctl status shows failed`

**Diagnosis**:

```bash
journalctl -u <agent-name> -n 50
```

**Common Causes**:

1. **Database connection failed**

   ```
   Solution: Verify DB_PASSWORD in /etc/mcp-agents/<agent>.env
   Test: psql -h localhost -U mcp_orchestrator -d mcp_ecosystem
   ```

2. **Redis connection failed**

   ```
   Solution: Check Redis is running: systemctl status redis
   Test: redis-cli ping
   ```

3. **Config file syntax error**

   ```
   Solution: Validate YAML: yamllint config/config.yaml
   Fix: Common issues are indentation or missing colons
   ```

4. **Permission denied**

   ```
   Solution: Check ownership: ls -la /opt/mcp-agents/<agent>
   Fix: chown -R mcp-agent:mcp-agent /opt/mcp-agents/<agent>
   ```

5. **Port already in use**
   ```
   Solution: Check port: netstat -tulpn | grep 910X
   Fix: Update health_check_port in config.yaml
   ```

### No Metrics in Prometheus

**Symptoms**: Grafana shows no data

**Diagnosis**:

```bash
# 1. Check agent metrics endpoint
curl http://localhost:910X/metrics

# 2. Check Pushgateway
curl http://localhost:9091/metrics | grep <agent-name>

# 3. Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

**Solutions**:

1. **Agent not pushing**

   ```bash
   journalctl -u <agent> | grep "push"
   # Check prometheus.pushgateway_url in config.yaml
   ```

2. **Pushgateway down**

   ```bash
   systemctl status pushgateway
   systemctl restart pushgateway
   ```

3. **Prometheus not scraping**
   ```bash
   # Edit /etc/prometheus/prometheus.yml
   # Add Pushgateway to scrape_configs
   systemctl restart prometheus
   ```

### High Memory Usage

**Symptoms**: Agent using >500MB RAM

**Diagnosis**:

```bash
systemctl status <agent> | grep Memory
ps aux | grep <agent> | awk '{print $6}'
```

**Solutions**:

1. **Reduce metrics interval**

   ```yaml
   # config.yaml
   monitoring:
     metrics_interval: 120000 # Increase from 60000
   ```

2. **Limit database connections**

   ```yaml
   database:
     max_connections: 5 # Reduce from 10
   ```

3. **Adjust systemd limit**
   ```bash
   systemctl edit <agent>
   # Add:
   [Service]
   MemoryLimit=256M
   ```

### Alert Storm

**Symptoms**: Hundreds of alerts in short time

**Diagnosis**:

```bash
redis-cli lrange alerts 0 10
```

**Solutions**:

1. **Increase thresholds temporarily**

   ```yaml
   monitoring:
     thresholds:
       cpu_percent_max: 90 # Increase from 80
   ```

2. **Disable auto-restart**

   ```yaml
   recovery:
     enabled: false # Temporarily disable
   ```

3. **Identify root cause**
   ```bash
   # Check system resources
   top
   df -h
   iostat -x 1 5
   ```

---

## Security Hardening

### 1. Principle of Least Privilege

```bash
# Agents run as non-privileged user
# No shell access
usermod -s /bin/false mcp-agent

# Minimal file permissions
chmod 640 /opt/mcp-agents/*/config/config.yaml
chmod 600 /etc/mcp-agents/*.env
```

### 2. Systemd Hardening

All service files include:

```ini
[Service]
NoNewPrivileges=true       # Prevent privilege escalation
PrivateTmp=true            # Isolated /tmp
ProtectSystem=strict       # Read-only /usr, /boot
ProtectHome=true           # No access to /home
ProtectKernelTunables=true # Read-only /proc/sys
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
```

### 3. Network Security

```bash
# Bind health endpoints to localhost only
# Never expose metrics publicly without authentication

# If remote access needed, use SSH tunnel:
ssh -L 9100:localhost:9100 root@vmi01
# Then access http://localhost:9100/health locally
```

### 4. Credential Management

```bash
# Never commit passwords to git
# Use environment variables only

# Rotate passwords regularly
# Update /etc/mcp-agents/*.env

# Use strong passwords (20+ chars)
openssl rand -base64 32
```

### 5. Log Security

```bash
# Sanitize logs - no credentials
# Agents automatically redact sensitive data

# Limit log retention
# journald config: SystemMaxUse=1G

# Restrict log access
chmod 640 /var/log/mcp-agents/*.log
```

### 6. Regular Updates

```bash
# Update Node.js dependencies
cd /opt/mcp-agents/<agent>
npm audit
npm update

# Rebuild and restart
npm run build
systemctl restart <agent>
```

---

## Support & Maintenance

### Monitoring Contacts

- **Database Issues**: DBA team
- **Application Issues**: DevOps team
- **Security Issues**: Security team
- **Infrastructure**: Platform team

### Escalation Path

1. **L1**: Check health endpoints, restart services
2. **L2**: Review logs, adjust thresholds, investigate alerts
3. **L3**: Code changes, architecture modifications

### Backup & Recovery

```bash
# Backup configurations
tar -czf mcp-agents-config-$(date +%Y%m%d).tar.gz \
    /opt/mcp-agents/*/config \
    /etc/mcp-agents

# Backup metrics database
pg_dump -U postgres mcp_ecosystem > mcp_ecosystem-$(date +%Y%m%d).sql

# Restore agent
./deploy-agents.sh vmi01  # Redeploy
# Restore configs from backup
```

### Performance Tuning

Based on observed metrics, adjust:

1. **Collection Intervals**: Balance freshness vs. overhead
2. **Thresholds**: Reduce false positives
3. **Retention**: Balance history vs. storage
4. **Connection Pools**: Match workload
5. **Cache TTL**: Balance staleness vs. hits

---

## Appendix

### A. Complete File Structure

```
/opt/mcp-agents/
├── db-optimizer-agent/
│   ├── config/
│   │   └── config.yaml
│   ├── dist/
│   │   └── index.js
│   ├── node_modules/
│   ├── package.json
│   └── tsconfig.json
├── app-health-agent/
├── storage-mgmt-agent/
├── service-health-agent/
├── network-sec-agent/
└── identity-mgmt-agent/

/var/log/mcp-agents/
├── db-optimizer.log
├── app-health.log
└── ...

/etc/mcp-agents/
├── db-optimizer.env
├── app-health.env
└── ...

/etc/systemd/system/
├── db-optimizer.service
├── app-health.service
└── ...
```

### B. Port Reference

| Agent          | Port | VM     | Purpose             |
| -------------- | ---- | ------ | ------------------- |
| db-optimizer   | 9100 | VMI01  | Health/Metrics      |
| app-health     | 9101 | VMI01  | Health/Metrics      |
| storage-mgmt   | 9200 | VMI02D | Health/Metrics      |
| service-health | 9201 | VMI02D | Health/Metrics      |
| network-sec    | 9300 | VMI03  | Health/Metrics      |
| identity-mgmt  | 9301 | VMI03  | Health/Metrics      |
| Pushgateway    | 9091 | VMI01  | Metrics aggregation |
| Prometheus     | 9090 | VMI01  | Metrics storage     |
| Grafana        | 3030 | VMI01  | Visualization       |

### C. Useful Commands

```bash
# Check all agents status
systemctl list-units '*-agent.service' --all

# Restart all agents on a VM
systemctl restart *-agent

# View combined logs
journalctl -u 'db-optimizer' -u 'app-health' -f

# Export metrics to file
curl http://localhost:9100/metrics > metrics-$(date +%Y%m%d).txt

# Query PostgreSQL metrics
psql -U mcp_orchestrator -d mcp_ecosystem \
    -c "SELECT COUNT(*), metric_type FROM system_metrics GROUP BY metric_type;"

# Monitor Redis cache
redis-cli --scan --pattern 'app-health:*' | wc -l
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-06
**Maintained By**: MCP Infrastructure Team
