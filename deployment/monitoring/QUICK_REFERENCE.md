# Monitoring Stack Quick Reference

## Deployment

### One-Command Deploy

```bash
ssh root@154.26.158.31
cd /opt/mcp/deployment/monitoring
./deploy-monitoring-stack.sh
```

### Individual Components

```bash
./deploy-prometheus.sh   # Metrics collection
./deploy-grafana.sh      # Visualization
../dns/deploy-adguard.sh # DNS filtering
```

## Access URLs

| Service      | URL                       | Port |
| ------------ | ------------------------- | ---- |
| Prometheus   | http://154.26.158.31:9090 | 9090 |
| Grafana      | http://154.26.158.31:3030 | 3030 |
| AdGuard Home | http://154.26.158.31:3030 | 3030 |

## Credentials

```bash
# View all credentials
cat /opt/mcp-monitoring-credentials.txt

# Individual services
cat /opt/grafana/credentials.txt
cat /opt/adguard/credentials.txt
```

## Service Management

```bash
# Status
systemctl status prometheus grafana-server adguard-home

# Start
systemctl start prometheus grafana-server adguard-home

# Stop
systemctl stop prometheus grafana-server adguard-home

# Restart
systemctl restart prometheus grafana-server adguard-home

# Logs
journalctl -u prometheus -f
journalctl -u grafana-server -f
journalctl -u adguard-home -f
```

## Health Checks

```bash
# Prometheus
/opt/prometheus/health-check.sh
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3030/api/health | jq

# AdGuard
/opt/adguard/health-check.sh
dig @localhost google.com
```

## Configuration Files

| Component          | Config File                      |
| ------------------ | -------------------------------- |
| Prometheus         | /opt/prometheus/prometheus.yml   |
| Prometheus Rules   | /opt/prometheus/rules/alerts.yml |
| Grafana            | /etc/grafana/grafana.ini         |
| Grafana Dashboards | /opt/grafana/dashboards/         |
| AdGuard            | /opt/adguard/AdGuardHome.yaml    |

## Common Tasks

### Reload Prometheus Config

```bash
# Validate config first
promtool check config /opt/prometheus/prometheus.yml

# Reload (no restart needed)
curl -X POST http://localhost:9090/-/reload
```

### Restart Grafana After Config Change

```bash
systemctl restart grafana-server
```

### Update AdGuard Blocklists

```bash
# Via web UI: Settings → Filters → Update
# Or restart service
systemctl restart adguard-home
```

### Test DNS Filtering

```bash
# Normal domain (should resolve)
dig @10.10.10.1 google.com

# Ad domain (should return 0.0.0.0)
dig @10.10.10.1 ads.google.com
```

## Prometheus Queries

```promql
# CPU usage
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Disk usage
(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100

# PostgreSQL connections
pg_stat_activity_count

# Replication lag
pg_replication_lag

# Redis memory
(redis_memory_used_bytes / redis_memory_max_bytes) * 100

# Service uptime
up{job=~"mcp-.*"}
```

## Troubleshooting

### Prometheus targets down

```bash
# Check exporter on target
ssh root@<target-ip> "systemctl status node_exporter"

# Test connectivity
curl http://<target-ip>:9100/metrics

# Check firewall
ufw status
```

### Grafana can't connect to DB

```bash
# Test PostgreSQL connection
psql -h 46.250.243.123 -U grafana -d grafana

# Check credentials
grep -A 5 "\[database\]" /etc/grafana/grafana.ini

# Check PostgreSQL logs
ssh root@46.250.243.123 "tail -f /var/log/postgresql/*.log"
```

### DNS not working

```bash
# Check port 53
netstat -tulpn | grep :53

# Verify systemd-resolved disabled
systemctl status systemd-resolved

# Test locally
dig @localhost google.com

# Check logs
journalctl -u adguard-home -n 50
```

## File Locations

### Prometheus

- Binary: `/usr/local/bin/prometheus`
- Config: `/opt/prometheus/prometheus.yml`
- Data: `/opt/prometheus/data`
- Rules: `/opt/prometheus/rules/`
- Logs: `/var/log/prometheus/`
- Health: `/opt/prometheus/health-check.sh`

### Grafana

- Config: `/etc/grafana/grafana.ini`
- Data: `/opt/grafana/data`
- Dashboards: `/opt/grafana/dashboards/`
- Provisioning: `/opt/grafana/provisioning/`
- Logs: `/var/log/grafana/`
- Credentials: `/opt/grafana/credentials.txt`
- Keycloak Setup: `/opt/grafana/KEYCLOAK_SETUP.md`

### AdGuard Home

- Binary: `/usr/local/bin/AdGuardHome`
- Config: `/opt/adguard/AdGuardHome.yaml`
- Data: `/opt/adguard/data/`
- Work: `/opt/adguard/work/`
- Credentials: `/opt/adguard/credentials.txt`
- Health: `/opt/adguard/health-check.sh`
- WireGuard Guide: `/opt/adguard/wireguard-dns-update.txt`

## Ports Reference

| Service             | Port | Protocol | Purpose      |
| ------------------- | ---- | -------- | ------------ |
| Prometheus          | 9090 | HTTP     | Web UI & API |
| Grafana             | 3030 | HTTP     | Web UI       |
| AdGuard Web         | 3030 | HTTP     | Web UI       |
| AdGuard DNS         | 53   | UDP/TCP  | DNS Server   |
| Node Exporter       | 9100 | HTTP     | Metrics      |
| PostgreSQL Exporter | 9187 | HTTP     | Metrics      |
| Redis Exporter      | 9121 | HTTP     | Metrics      |
| HAProxy Exporter    | 9101 | HTTP     | Metrics      |

## Exporters to Deploy

### VMI01 (Primary)

- Node Exporter (9100)
- PostgreSQL Exporter (9187)
- Redis Exporter (9121)

### VMI02D (Standby)

- Node Exporter (9100)
- PostgreSQL Exporter (9187)

### VMI03 (Gateway)

- Node Exporter (9100)
- HAProxy Exporter (9101)

## Alert Rules

Alerts configured in `/opt/prometheus/rules/alerts.yml`:

**System Alerts:**

- High CPU (>80% warn, >95% critical)
- High Memory (>80% warn, >90% critical)
- High Disk (>80% warn, >90% critical)
- Instance Down

**PostgreSQL Alerts:**

- PostgreSQL Down
- Replication Lag (>10s warn, >60s critical)
- Too Many Connections (>800)
- High Database Growth

**Redis Alerts:**

- Redis Down
- High Memory (>80%)
- Too Many Clients (>800)

**MCP Alerts:**

- Service Down
- High Latency (>1s)
- High Error Rate

**HAProxy Alerts:**

- Backend Down
- High Response Time (>1s)
- Server Down

## Backup Commands

```bash
# Prometheus data
tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /opt/prometheus/data

# Grafana database
pg_dump -h 46.250.243.123 -U grafana grafana > /backup/grafana-$(date +%Y%m%d).sql

# AdGuard config
cp /opt/adguard/AdGuardHome.yaml /backup/adguard-$(date +%Y%m%d).yaml
```

## Emergency Contacts

- Deployment Logs: `/var/log/mcp-deployment/`
- Combined Credentials: `/opt/mcp-monitoring-credentials.txt`
- Full Documentation: `/opt/mcp/deployment/monitoring/README.md`
- Deployment Guide: `/opt/mcp/deployment/monitoring/DEPLOYMENT_GUIDE.md`

## Quick Diagnostics

```bash
# All services status
systemctl status prometheus grafana-server adguard-home --no-pager

# All health checks
/opt/prometheus/health-check.sh && \
/opt/adguard/health-check.sh && \
curl -s http://localhost:3030/api/health | jq

# Check all listening ports
netstat -tulpn | grep -E '(9090|3030|53|9100|9187|9121|9101)'

# Recent errors in all services
journalctl -u prometheus -u grafana-server -u adguard-home --since "1 hour ago" --no-pager | grep -i error
```
