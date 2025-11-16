# MCP Bundle Deployment - Quick Reference

Fast reference for common deployment and testing commands.

## 🚀 Quick Start

```bash
# Full deployment (database + services + security + HA)
./deployment/scripts/deploy-production.sh

# Deploy automated maintenance to all VMs
./deployment/automation/deploy-maintenance.sh

# Run security validation
./deployment/tests/security-validation.sh

# Validate backups
./deployment/tests/backup-validation-tests.sh

# Performance testing
./deployment/tests/load-testing.sh
```

---

## 📋 Testing & Validation

### Security Scan

```bash
# Full security audit (all VMs)
./deployment/tests/security-validation.sh

# Quick scan (skip lengthy tests)
./deployment/tests/security-validation.sh --quick

# Single VM
./deployment/tests/security-validation.sh --vm vmi01
```

### Backup Validation

```bash
# Latest backups
./deployment/tests/backup-validation-tests.sh

# All backups + restore test
./deployment/tests/backup-validation-tests.sh --full --restore-test

# Specific type
./deployment/tests/backup-validation-tests.sh --type daily
```

### Load Testing

```bash
# Baseline (default)
./deployment/tests/load-testing.sh

# All scenarios, 50 VUs
./deployment/tests/load-testing.sh --scenario all --vus 50

# Stress test, 5 minutes
./deployment/tests/load-testing.sh --scenario stress --duration 5m --vus 100
```

---

## 🔧 Automated Maintenance

### Deploy Maintenance

```bash
# All VMs
./deployment/automation/deploy-maintenance.sh

# Single VM
./deployment/automation/deploy-maintenance.sh --vm vmi01

# Preview (dry-run)
./deployment/automation/deploy-maintenance.sh --dry-run
```

### Monitor Maintenance

```bash
# List active timers
systemctl list-timers 'mcp-*'

# Service monitor logs
journalctl -u mcp-service-monitor -f

# Maintenance logs
tail -f /var/log/mcp/daily-maintenance.log
tail -f /var/log/mcp/weekly-maintenance.log

# Check metrics
cat /var/lib/node_exporter/textfile_collector/mcp_services.prom
```

---

## 🏗️ Production Deployment

### Full Stack

```bash
# One-command deployment
./deployment/scripts/deploy-production.sh

# Components deployed:
# - PostgreSQL migration (v0.1 → v0.2)
# - MCP services (orchestrator, perplexity, itjsst)
# - Security hardening (IP whitelist, Fail2Ban, UFW)
# - High availability (replication, HAProxy, failover)
# - Health monitoring (auto-restart, metrics)
# - Automated maintenance (daily/weekly/monthly)
```

### Individual Components

```bash
# Database only
./deployment/scripts/database/migrate-v0.1-to-v0.2.sh

# Security hardening
./deployment/security/configure-ip-whitelist.sh

# High availability
./deployment/ha/configure-high-availability.sh

# Health monitoring
./deployment/monitoring/mcp-health-monitor.sh

# Automated maintenance
./deployment/automation/deploy-maintenance.sh
```

---

## 🔍 Health Checks

### Service Status

```bash
# All MCP services (VMI01)
ssh root@46.250.243.123 'systemctl status mcp-* postgresql redis-server pgbouncer'

# Monitoring stack (VMI03)
ssh root@154.26.158.31 'systemctl status haproxy prometheus grafana nginx'

# Database replication (VMI02D)
ssh root@46.250.241.70 'systemctl status postgresql'
```

### Health Endpoints

```bash
# Primary server
curl http://46.250.243.123:9090/health

# Gateway/LB
curl http://154.26.158.31:8080/health

# Prometheus metrics
curl http://154.26.158.31:9090/metrics
```

### Database Health

```bash
# Primary (VMI01)
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT version();"'

# Replication status (VMI02D)
ssh root@46.250.241.70 'sudo -u postgres psql -c "SELECT status FROM pg_stat_wal_receiver;"'
```

---

## 📊 Monitoring

### Dashboards

- **Grafana**: http://154.26.158.31:3000
- **Prometheus**: http://154.26.158.31:9090
- **HAProxy Stats**: http://154.26.158.31:8080/stats

### Logs

```bash
# MCP service logs
journalctl -u mcp-orchestrator -f
journalctl -u perplexity-mcp -f
journalctl -u itjsst-mcp -f

# Database logs
tail -f /var/log/postgresql/postgresql-16-main.log

# Nginx access
tail -f /var/log/nginx/access.log

# System messages
tail -f /var/log/syslog
```

### Metrics

```bash
# Prometheus queries
# CPU usage: rate(node_cpu_seconds_total{mode="user"}[5m])
# Memory: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
# Disk: node_filesystem_avail_bytes{mountpoint="/"}

# Direct metrics
curl http://46.250.243.123:9100/metrics | grep node_
curl http://154.26.158.31:9100/metrics | grep mcp_
```

---

## 🗄️ Backup Operations

### Manual Backup

```bash
# Database backup (VMI01)
ssh root@46.250.243.123 '/opt/mcp/scripts/backup-database.sh'

# File backup
ssh root@46.250.243.123 '/opt/mcp/scripts/backup-files.sh'

# Full backup
ssh root@46.250.243.123 '/opt/mcp/scripts/backup-all.sh'
```

### Verify Backups

```bash
# Latest backup status
ssh root@46.250.241.70 'ls -lh /mnt/storage/backups/daily/ | tail -5'

# Run validation
./deployment/tests/backup-validation-tests.sh --latest

# Full validation with restore
./deployment/tests/backup-validation-tests.sh --full --restore-test
```

### Restore

```bash
# Restore database (DESTRUCTIVE!)
ssh root@46.250.243.123 '/opt/mcp/scripts/restore-database.sh /mnt/storage/backups/daily/backup-20250108.sql.gz'

# Restore files
ssh root@46.250.243.123 '/opt/mcp/scripts/restore-files.sh /mnt/storage/backups/daily/files-20250108.tar.gz'
```

---

## 🔐 Security

### Firewall

```bash
# Check status
ssh root@46.250.243.123 'ufw status verbose'

# Allow IP
ssh root@46.250.243.123 'ufw allow from 1.2.3.4'

# Deny IP
ssh root@46.250.243.123 'ufw deny from 1.2.3.4'
```

### Fail2Ban

```bash
# Check status
ssh root@46.250.243.123 'fail2ban-client status'

# Jail status
ssh root@46.250.243.123 'fail2ban-client status sshd'

# Unban IP
ssh root@46.250.243.123 'fail2ban-client set sshd unbanip 1.2.3.4'
```

### SSL Certificates

```bash
# Check expiration
ssh root@154.26.158.31 'certbot certificates'

# Renew
ssh root@154.26.158.31 'certbot renew'

# Test renewal
ssh root@154.26.158.31 'certbot renew --dry-run'
```

---

## 🛠️ Troubleshooting

### Service Not Starting

```bash
# Check logs
journalctl -u service-name -n 50

# Check status
systemctl status service-name

# Restart
systemctl restart service-name

# Verify dependencies
systemctl list-dependencies service-name
```

### Database Issues

```bash
# Check connections
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"'

# Kill long-running queries
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = '\''active'\'' AND query_start < NOW() - INTERVAL '\''5 minutes'\'';"'

# VACUUM
ssh root@46.250.243.123 'sudo -u postgres psql -c "VACUUM ANALYZE;"'
```

### Disk Space

```bash
# Check usage
ssh root@46.250.243.123 'df -h'

# Find large files
ssh root@46.250.243.123 'du -h /var/log | sort -rh | head -20'

# Clean old logs
ssh root@46.250.243.123 'find /var/log -name "*.log" -mtime +30 -delete'
ssh root@46.250.243.123 'journalctl --vacuum-time=30d'
```

### Network Issues

```bash
# Test connectivity
ping 46.250.243.123
ssh root@46.250.243.123 'echo "Connection OK"'

# Check listening ports
ssh root@46.250.243.123 'ss -tlnp | grep LISTEN'

# Test WireGuard VPN
ssh root@46.250.243.123 'ping 10.0.50.1'
ssh root@46.250.243.123 'wg show'
```

---

## 📈 Performance

### Database Performance

```bash
# Active queries
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT pid, state, query_start, query FROM pg_stat_activity WHERE state = '\''active'\'';"'

# Slow queries (if pg_stat_statements enabled)
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"'

# Cache hit ratio
ssh root@46.250.243.123 'sudo -u postgres psql -c "SELECT sum(blks_hit)::float / sum(blks_hit + blks_read) as cache_hit_ratio FROM pg_stat_database;"'
```

### System Performance

```bash
# CPU usage
ssh root@46.250.243.123 'top -bn1 | head -20'

# Memory usage
ssh root@46.250.243.123 'free -h'

# I/O stats
ssh root@46.250.243.123 'iostat -x 1 5'

# Network stats
ssh root@46.250.243.123 'netstat -s'
```

### Load Testing

```bash
# Baseline
./deployment/tests/load-testing.sh

# Peak load
./deployment/tests/load-testing.sh --scenario peak --vus 50 --duration 5m

# Stress test
./deployment/tests/load-testing.sh --scenario stress --vus 100 --duration 10m
```

---

## 🔄 Updates

### System Updates

```bash
# Check for updates
ssh root@46.250.243.123 'apt update && apt list --upgradable'

# Security updates only
ssh root@46.250.243.123 'apt upgrade -s | grep -i security'

# Apply updates
ssh root@46.250.243.123 'apt update && apt upgrade -y'
```

### MCP Updates

```bash
# Build new release
./deploy.sh  # Option 1: Build test package

# Test deployment
cd devtestready/<version>/
./deploy-to-server.sh 46.250.243.123 root

# Promote to production
./deploy.sh  # Option 2: Promote to production

# Deploy to production
./deploy.sh  # Option 3: Deploy to VMI01
```

---

## 📞 Quick Reference - VMs

### VMI01 - Primary (46.250.243.123)

- PostgreSQL 16 (R/W)
- MCP Orchestrator
- Perplexity MCP
- IT-MCP Server
- Redis Cache
- PgBouncer

### VMI02D - Standby (46.250.241.70)

- PostgreSQL 16 (R/O, streaming replication)
- Backup Storage (/mnt/storage/backups)
- Hot Standby

### VMI03 - Gateway (154.26.158.31)

- HAProxy Load Balancer
- Prometheus Monitoring
- Grafana Dashboards
- Keycloak SSO
- Pi-Hole DNS
- Nginx Reverse Proxy

---

## 📚 Full Documentation

- **Complete Guide**: `deployment/TESTING_AND_AUTOMATION_GUIDE.md`
- **Deployment**: `DEPLOYMENT_GUIDE_COMPLETE.md`
- **Workflow**: `release_dev/shared/docs/WORKFLOW_QUICKSTART.md`
- **Credentials**: `MCP_CREDENTIALS.txt`

---

**Version**: 0.2.0
**Last Updated**: November 2025
