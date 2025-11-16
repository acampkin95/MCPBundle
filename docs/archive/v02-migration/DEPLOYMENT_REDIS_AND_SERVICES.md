# Redis and MCP Services Deployment Guide

Complete deployment guide for Redis and MCP services on VMI01 (46.250.243.123).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Redis Deployment](#redis-deployment)
4. [MCP Services Deployment](#mcp-services-deployment)
5. [Verification](#verification)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

## Overview

This deployment consists of two main components:

1. **Redis Server**: Pub/sub messaging and caching layer
2. **MCP Services**: Three Node.js services (orchestrator, perplexity, itjsst)

### Architecture

```
VMI01 (46.250.243.123)
├── PostgreSQL 16 (port 5432)
├── Redis 7.x (port 6379)
│   ├── Pub/Sub messaging
│   ├── Caching layer
│   └── Redis exporter (port 9121)
├── MCP Orchestrator (port 3000)
│   ├── Agent coordination
│   └── Command queue
├── Perplexity MCP (port 3001)
│   └── AI search integration
└── IT-MCP Server (port 3002)
    └── System administration tools
```

## Prerequisites

### Local Machine

- Node.js >= 20.0.0
- SSH access to VMI01 as root
- SSH config for 46.250.243.123 (in `~/.ssh/config`)

### VMI01 Server

- Ubuntu 24.04 LTS
- PostgreSQL 16 installed and running
- User: root with sudo access
- Network: VPN interface 10.0.50.1 configured

### Credentials Required

- Perplexity API Key (for perplexity-mcp service)
- PostgreSQL credentials (already configured): `mcp_admin/`

## Redis Deployment

### Step 1: Deploy Redis Configuration Script

```bash
# From project root
cd /Users/alex/Projects/MCP\ Bundle

# Copy script to VMI01
scp deployment/redis/configure-redis.sh root@46.250.243.123:/tmp/

# Execute on VMI01
ssh root@46.250.243.123 '/tmp/configure-redis.sh'
```

### Step 2: Verify Redis Installation

```bash
# Check service status
ssh root@46.250.243.123 'systemctl status redis-server'

# Run health check
ssh root@46.250.243.123 '/usr/local/bin/redis-health-check.sh'

# Test PING
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) ping'
# Expected output: PONG
```

### Step 3: Retrieve Redis Credentials

```bash
# View credentials
ssh root@46.250.243.123 'cat /opt/redis/credentials.txt'

# Sample output:
# REDIS_PASSWORD=abc123xyz789...
# REDIS_URL=redis://:abc123xyz789...@localhost:6379
# REDIS_VPN_URL=redis://:abc123xyz789...@10.0.50.1:6379
```

### Redis Configuration Summary

- **Port**: 6379
- **Bind**: 127.0.0.1, 10.0.50.1
- **Max Memory**: 2GB (allkeys-lru eviction)
- **Persistence**: AOF (everysec) + RDB snapshots
- **Security**: Password authentication, command renaming
- **Monitoring**: Redis exporter on port 9121
- **Credentials**: `/opt/redis/credentials.txt`

## MCP Services Deployment

### Step 1: Prepare Local Environment

```bash
# Navigate to project root
cd /Users/alex/Projects/MCP\ Bundle

# Verify release_dev directory structure
ls -la release_dev/
# Should contain: mcp-orchestrator, perplexity-mcp, itjsst-mcp

# Set Perplexity API key (if available)
export PERPLEXITY_API_KEY="your-api-key-here"
```

### Step 2: Run Enhanced Deployment Script

```bash
# Make script executable (if not already)
chmod +x deployment/scripts/deploy-mcp-services-enhanced.sh

# Run deployment
./deployment/scripts/deploy-mcp-services-enhanced.sh
```

The script will:

1. Check prerequisites (Node.js version, SSH connectivity, service directories)
2. Prompt for credentials (Perplexity API key, fetches Redis password from VMI01)
3. Build all services locally (npm install, TypeScript compilation)
4. Package services for deployment
5. Sync to VMI01 via rsync
6. Create environment configuration files
7. Create systemd services with auto-restart
8. Configure log rotation (daily, 7 days retention)
9. Set up health monitoring (every 5 minutes)
10. Start all services
11. Verify health endpoints

### Step 3: Monitor Deployment

Watch the deployment progress:

```bash
# The script outputs detailed logs with colors:
# - BLUE: Info messages
# - GREEN: Success messages
# - YELLOW: Warnings
# - RED: Errors
# - MAGENTA: Step headers
```

### Deployment Process Details

**Building Services**:

- Runs `npm ci` for clean dependency install
- Executes linting (if configured)
- Runs tests (if configured)
- Compiles TypeScript to JavaScript
- Verifies build output (dist/ or build/ directory)

**Deploying to Server**:

- Creates `mcp` user and group
- Creates directories: `/opt/mcp/{orchestrator,perplexity,itjsst}`
- Syncs build artifacts and dependencies via rsync
- Creates `.env` files with credentials
- Sets proper file permissions (mode 600 for .env)

**Systemd Services**:

- Creates service files in `/etc/systemd/system/`
- Configures auto-restart (RestartSec=10s)
- Sets resource limits (MemoryMax=1G, LimitNOFILE=65535)
- Applies security hardening (NoNewPrivileges, ProtectSystem)
- Enables systemd watchdog (WatchdogSec=60s)

**Health Monitoring**:

- Creates `/usr/local/bin/mcp-services-health-check.sh`
- Systemd timer runs every 5 minutes
- Checks service status and health endpoints
- Auto-restarts unhealthy services with cooldown (5 minutes)

## Verification

### 1. Service Status

```bash
# Check all MCP services
ssh root@46.250.243.123 'systemctl status mcp-*.service'

# Individual service status
ssh root@46.250.243.123 'systemctl status mcp-orchestrator'
ssh root@46.250.243.123 'systemctl status perplexity-mcp'
ssh root@46.250.243.123 'systemctl status itjsst-mcp'

# Expected output: "Active: active (running)"
```

### 2. Health Endpoints

```bash
# Test health endpoints
curl http://46.250.243.123:3000/health  # Orchestrator
curl http://46.250.243.123:3001/health  # Perplexity
curl http://46.250.243.123:3002/health  # IT-MCP

# Expected response (example):
# {"status":"healthy","uptime":123,"version":"0.2.0"}
```

### 3. Service Logs

```bash
# View real-time logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/*.log'

# View specific service logs
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -f'

# View last 50 lines
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 50'
```

### 4. Database Connectivity

```bash
# Check PostgreSQL connection from orchestrator
ssh root@46.250.243.123 'cd /opt/mcp/orchestrator && node -e "const {Pool}=require(\"pg\");const pool=new Pool({connectionString:process.env.DATABASE_URL});pool.query(\"SELECT NOW()\").then(r=>console.log(\"DB OK:\",r.rows[0])).catch(e=>console.error(\"DB Error:\",e.message)).finally(()=>pool.end())"'
```

### 5. Redis Connectivity

```bash
# Check Redis connection
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) ping'

# Check Redis info
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) INFO SERVER | grep redis_version'
```

### 6. Network Ports

```bash
# Check listening ports
ssh root@46.250.243.123 'ss -tuln | grep -E ":(3000|3001|3002|6379|9121)"'

# Expected output:
# tcp LISTEN 0.0.0.0:3000
# tcp LISTEN 0.0.0.0:3001
# tcp LISTEN 0.0.0.0:3002
# tcp LISTEN 127.0.0.1:6379
# tcp LISTEN 127.0.0.1:9121
```

## Monitoring

### Health Check Monitor

The auto-healing health monitor runs every 5 minutes:

```bash
# View health monitor logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/health-monitor.log'

# Manually run health check
ssh root@46.250.243.123 '/usr/local/bin/mcp-services-health-check.sh'

# Check timer status
ssh root@46.250.243.123 'systemctl status mcp-health-monitor.timer'

# View timer schedule
ssh root@46.250.243.123 'systemctl list-timers mcp-health-monitor.timer'
```

### Redis Metrics

```bash
# Prometheus metrics from Redis exporter
curl http://46.250.243.123:9121/metrics

# Sample metrics:
# redis_up 1
# redis_connected_clients 5
# redis_used_memory_bytes 1048576
# redis_commands_total{cmd="get"} 1234
```

### Service Metrics (Future)

Each MCP service will expose Prometheus-compatible metrics:

```bash
# Orchestrator metrics (planned)
curl http://46.250.243.123:3000/metrics

# Perplexity metrics (planned)
curl http://46.250.243.123:3001/metrics

# IT-MCP metrics (planned)
curl http://46.250.243.123:3002/metrics
```

### Grafana Dashboards (Future)

Integration with Grafana on VMI03 for visualization:

- Service uptime and availability
- Request rates and latency
- Redis metrics (memory, commands, connections)
- Database connection pool stats
- Error rates and logging

## Troubleshooting

### Service Won't Start

```bash
# Check service logs
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 50 --no-pager'

# Check for port conflicts
ssh root@46.250.243.123 'ss -tuln | grep 3000'

# Check environment variables
ssh root@46.250.243.123 'cat /opt/mcp/orchestrator/.env'

# Test Node.js execution
ssh root@46.250.243.123 'cd /opt/mcp/orchestrator && node dist/index.js'
```

### Database Connection Errors

```bash
# Check PostgreSQL status
ssh root@46.250.243.123 'systemctl status postgresql'

# Test database connection
ssh root@46.250.243.123 'psql -U mcp_admin -d mcp_ecosystem -c "SELECT version();"'

# Check pg_hba.conf
ssh root@46.250.243.123 'cat /etc/postgresql/16/main/pg_hba.conf | grep mcp_admin'
```

### Redis Connection Errors

```bash
# Check Redis status
ssh root@46.250.243.123 'systemctl status redis-server'

# Test Redis connection
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) ping'

# Check Redis logs
ssh root@46.250.243.123 'tail -f /var/log/redis/redis-server.log'

# Check Redis configuration
ssh root@46.250.243.123 'grep -E "^(bind|port|requirepass)" /etc/redis/redis.conf'
```

### Health Endpoint Not Responding

```bash
# Check if service is running
ssh root@46.250.243.123 'systemctl is-active mcp-orchestrator'

# Check if port is listening
ssh root@46.250.243.123 'ss -tuln | grep 3000'

# Test with verbose curl
curl -v http://46.250.243.123:3000/health

# Check firewall rules
ssh root@46.250.243.123 'ufw status | grep 3000'
```

### High Memory Usage

```bash
# Check memory usage per service
ssh root@46.250.243.123 'systemctl status mcp-orchestrator | grep Memory'

# Check Redis memory
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) INFO MEMORY | grep used_memory_human'

# Check total system memory
ssh root@46.250.243.123 'free -h'
```

### Log Rotation Issues

```bash
# Check logrotate configuration
ssh root@46.250.243.123 'cat /etc/logrotate.d/mcp-services'

# Test logrotate
ssh root@46.250.243.123 'logrotate -f /etc/logrotate.d/mcp-services'

# Check log file sizes
ssh root@46.250.243.123 'du -sh /var/log/mcp/*'
```

## Post-Deployment Tasks

### 1. Configure Perplexity API Key

If not set during deployment:

```bash
ssh root@46.250.243.123
nano /opt/mcp/perplexity/.env
# Add: PERPLEXITY_API_KEY=your-actual-api-key
systemctl restart perplexity-mcp
```

### 2. Verify Inter-Service Communication

Test that services can communicate via Redis pub/sub:

```bash
# Terminal 1: Subscribe to events
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) SUBSCRIBE mcp:events'

# Terminal 2: Publish test event
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) PUBLISH mcp:events "{\"type\":\"test\",\"source\":\"manual\"}"'
```

### 3. Configure Firewall Rules

If UFW is enabled, allow necessary ports:

```bash
ssh root@46.250.243.123 'ufw allow 3000/tcp comment "MCP Orchestrator"'
ssh root@46.250.243.123 'ufw allow 3001/tcp comment "Perplexity MCP"'
ssh root@46.250.243.123 'ufw allow 3002/tcp comment "IT-MCP"'
```

### 4. Set Up Monitoring Dashboards

Configure Grafana on VMI03 to scrape metrics:

- Redis exporter: `http://46.250.243.123:9121/metrics`
- Service metrics: `http://46.250.243.123:300x/metrics` (future)

### 5. Enable Backup Automation

Create automated backups for:

- PostgreSQL database (via pg_dump)
- Redis snapshots (RDB files)
- Service configuration files

## Rollback Procedure

If deployment fails or services are unstable:

### 1. Stop Services

```bash
ssh root@46.250.243.123 'systemctl stop mcp-*.service'
```

### 2. Restore Previous Version

```bash
# If previous version backed up
ssh root@46.250.243.123 'cp -r /opt/mcp.backup/* /opt/mcp/'
ssh root@46.250.243.123 'systemctl restart mcp-*.service'
```

### 3. Review Logs

```bash
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 100 > /tmp/rollback-logs.txt'
scp root@46.250.243.123:/tmp/rollback-logs.txt ./
```

## Maintenance

### Regular Tasks

**Daily**:

- Check service health: `systemctl status mcp-*.service`
- Review health monitor logs: `tail /var/log/mcp/health-monitor.log`

**Weekly**:

- Review service logs for errors
- Check Redis memory usage
- Verify database connection pool stats

**Monthly**:

- Update dependencies: `npm update` in each service
- Review and optimize configurations
- Test backup/restore procedures

### Service Restart

```bash
# Restart individual service
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator'

# Restart all MCP services
ssh root@46.250.243.123 'systemctl restart mcp-*.service'

# Graceful reload (if supported)
ssh root@46.250.243.123 'systemctl reload mcp-orchestrator'
```

## Security Considerations

1. **Credentials Storage**: All credentials in mode 600 files owned by root or mcp user
2. **Network Isolation**: Services bind to specific interfaces, Redis not exposed externally
3. **Systemd Hardening**: NoNewPrivileges, ProtectSystem, PrivateTmp enabled
4. **Password Complexity**: Auto-generated 32-character passwords
5. **Command Protection**: Dangerous Redis commands disabled
6. **Log Sanitization**: Ensure sensitive data not logged

## Performance Optimization

### Node.js Services

- **Memory**: Each service limited to 1GB (adjust via systemd MemoryMax)
- **CPU**: No CPU limits set (can add CPUQuota if needed)
- **Connections**: Monitor open file descriptors (LimitNOFILE=65535)

### Redis

- **Memory**: 2GB max with LRU eviction (increase if needed)
- **Persistence**: AOF everysec balances durability and performance
- **Network**: Unix socket faster than TCP for local connections (future optimization)

### PostgreSQL

- **Connection Pooling**: Configure in each service (e.g., max 20 connections)
- **Query Optimization**: Monitor slow queries in PostgreSQL logs
- **Indexes**: Ensure proper indexes on frequently queried columns

## Next Steps

1. **Test End-to-End Workflows**: Execute complete MCP operations through orchestrator
2. **Load Testing**: Use `deployment/tests/mcp-integration-tests.sh` to stress test
3. **Monitoring Integration**: Connect to Prometheus/Grafana on VMI03
4. **Documentation**: Update service-specific docs with actual deployment details
5. **Automation**: Add deployment to CI/CD pipeline
6. **High Availability**: Plan for multi-VM failover and load balancing

## File Locations Reference

```
VMI01 (46.250.243.123)
├── /opt/mcp/
│   ├── orchestrator/         # MCP Orchestrator service
│   │   ├── dist/             # Compiled JavaScript
│   │   ├── node_modules/     # Dependencies
│   │   └── .env              # Environment variables
│   ├── perplexity/           # Perplexity MCP service
│   ├── itjsst/               # IT-MCP service
│   ├── logs/                 # Service-specific logs (deprecated, use /var/log/mcp)
│   └── config/               # Shared configuration
├── /opt/redis/
│   └── credentials.txt       # Redis password and URLs
├── /var/log/mcp/
│   ├── orchestrator.log      # Orchestrator stdout
│   ├── orchestrator-error.log
│   ├── perplexity.log
│   ├── perplexity-error.log
│   ├── itjsst.log
│   ├── itjsst-error.log
│   └── health-monitor.log    # Health check logs
├── /var/lib/mcp/
│   └── itjsst.db             # IT-MCP SQLite cache
├── /var/lib/redis/
│   ├── appendonly.aof        # Redis AOF file
│   └── dump.rdb              # Redis RDB snapshot
├── /etc/systemd/system/
│   ├── mcp-orchestrator.service
│   ├── perplexity-mcp.service
│   ├── itjsst-mcp.service
│   ├── mcp-health-monitor.service
│   └── mcp-health-monitor.timer
└── /usr/local/bin/
    ├── redis-health-check.sh
    └── mcp-services-health-check.sh
```

## Support & Resources

- **Project Documentation**: `/Users/alex/Projects/MCP Bundle/CLAUDE.md`
- **Redis README**: `/Users/alex/Projects/MCP Bundle/deployment/redis/README.md`
- **Deployment Scripts**: `/Users/alex/Projects/MCP Bundle/deployment/scripts/`
- **Testing Guide**: `/Users/alex/Projects/MCP Bundle/release_dev/shared/docs/TESTING.md`
- **Diagnostic System**: `/Users/alex/Projects/MCP Bundle/release_dev/shared/docs/DIAGNOSTIC_SYSTEM.md`

## Changelog

### v0.2.0 (2025-11-08)

- Initial Redis deployment script
- Enhanced MCP services deployment script
- Health monitoring with auto-healing
- Systemd integration with security hardening
- Log rotation configuration
- Comprehensive documentation
