# Monitoring Stack Deployment Guide

## Infrastructure Overview

### Deployed Components

#### 1. HAProxy Load Balancer (VMI03 - 154.26.158.31)

- **Purpose**: Load balancing and SSL termination for MCP services
- **Ports**:
  - 80 (HTTP - redirects to HTTPS)
  - 443 (HTTPS)
  - 8404 (Stats page)
- **Backend Services**:
  - MCP Orchestrator (46.250.243.123:3000)
  - Perplexity MCP (46.250.243.123:3001)
  - IT Service MCP (46.250.243.123:3002)

#### 2. Prometheus (VMI03 - 154.26.158.31)

- **Purpose**: Metrics collection and alerting
- **Port**: 9090
- **Data Retention**: 30 days
- **Scrape Targets**:
  - Node exporters on all VMs
  - PostgreSQL exporters on VMI01 and VMI02D
  - HAProxy exporter
  - MCP service metrics endpoints

#### 3. Grafana (VMI03 - 154.26.158.31)

- **Purpose**: Visualization and dashboards
- **Port**: 3000
- **Features**:
  - Pre-configured dashboards
  - Prometheus data source
  - Anonymous read-only access
  - Alert notifications

## Access Credentials

### HAProxy Stats

- **URL**: http://154.26.158.31:8404
- **Username**: admin
- **Password**: HAProxyStats2024!

### Grafana

- **URL**: http://154.26.158.31:3000
- **Admin Username**: admin
- **Admin Password**: GrafanaAdmin2024!
- **Anonymous Access**: Read-only enabled

### Prometheus

- **URL**: http://154.26.158.31:9090
- **Authentication**: None (consider adding nginx proxy with auth)

## Service Endpoints

### Load Balanced Services

- **MCP Orchestrator**: http://154.26.158.31/orchestrator
- **Perplexity MCP**: http://154.26.158.31/perplexity
- **IT Service MCP**: http://154.26.158.31/it-service

### Monitoring Endpoints

- **Prometheus Metrics**: http://154.26.158.31:9090/metrics
- **Node Exporter (VMI03)**: http://154.26.158.31:9100/metrics
- **Node Exporter (VMI01)**: http://46.250.243.123:9100/metrics
- **Node Exporter (VMI02D)**: http://185.21.217.89:9100/metrics
- **PostgreSQL Exporter (VMI01)**: http://46.250.243.123:9187/metrics
- **PostgreSQL Exporter (VMI02D)**: http://185.21.217.89:9187/metrics
- **HAProxy Exporter**: http://154.26.158.31:9101/metrics

## Alert Rules

### System Alerts

1. **HighCPUUsage**: CPU > 80% for 5 minutes
2. **HighMemoryUsage**: Memory > 85% for 5 minutes
3. **LowDiskSpace**: Disk space < 20% for 5 minutes
4. **ServiceDown**: Any monitored service down for 1 minute

### Database Alerts

1. **PostgreSQLDown**: Database not responding for 1 minute
2. **PostgreSQLReplicationLag**: Replication lag > 10 seconds for 5 minutes
3. **PostgreSQLTooManyConnections**: Active connections > 100 for 5 minutes

### MCP Service Alerts

1. **MCPServiceDown**: Any MCP service down for 1 minute
2. **MCPHighResponseTime**: 99th percentile response time > 2 seconds for 5 minutes

## Health Check Scripts

### Service Health Check

```bash
/usr/local/bin/health_check.sh
```

Checks:

- MCP Orchestrator health
- MCP Perplexity health
- MCP IT Service health
- HAProxy status
- Prometheus status
- Grafana status

### Database Health Check

```bash
/usr/local/bin/db_health_check.sh
```

Checks:

- PostgreSQL on VMI01
- PostgreSQL on VMI02D
- Replication status

## Maintenance Commands

### Restart Services

```bash
# HAProxy
systemctl restart haproxy

# Prometheus
systemctl restart prometheus

# Grafana
systemctl restart grafana-server

# Node Exporter
systemctl restart node_exporter

# PostgreSQL Exporter
systemctl restart postgres_exporter

# HAProxy Exporter
systemctl restart haproxy_exporter
```

### Check Service Status

```bash
# All services status
systemctl status haproxy prometheus grafana-server node_exporter

# Check logs
journalctl -u haproxy -f
journalctl -u prometheus -f
journalctl -u grafana-server -f
```

### Update Prometheus Configuration

```bash
# Edit configuration
nano /etc/prometheus/prometheus.yml

# Validate configuration
promtool check config /etc/prometheus/prometheus.yml

# Reload configuration
curl -X POST http://localhost:9090/-/reload
```

### Backup Grafana Dashboards

```bash
# Export all dashboards
for dashboard in $(curl -s -u admin:GrafanaAdmin2024! http://localhost:3000/api/search | jq -r '.[].uid'); do
  curl -s -u admin:GrafanaAdmin2024! http://localhost:3000/api/dashboards/uid/$dashboard > dashboard_$dashboard.json
done
```

## Monitoring Best Practices

### 1. Regular Health Checks

- Automated health checks run every 5 minutes via cron
- Database health checks run every 10 minutes
- Review logs daily: `/var/log/health_check.log`

### 2. Alert Response

- **Critical Alerts**: Respond within 15 minutes
- **Warning Alerts**: Respond within 1 hour
- **Info Alerts**: Review during daily checks

### 3. Capacity Planning

- Monitor disk usage trends
- Review CPU/Memory utilization weekly
- Plan scaling based on 3-month trends

### 4. Security

- Regularly update passwords
- Review access logs
- Enable SSL/TLS for all external endpoints
- Implement IP whitelisting for admin interfaces

## Troubleshooting

### HAProxy Issues

```bash
# Check HAProxy configuration
haproxy -c -f /etc/haproxy/haproxy.cfg

# View HAProxy logs
tail -f /var/log/haproxy.log

# Check backend health
echo "show stat" | socat /run/haproxy/admin.sock stdio
```

### Prometheus Issues

```bash
# Check targets status
curl http://localhost:9090/api/v1/targets

# Check configuration
promtool check config /etc/prometheus/prometheus.yml

# Query metrics
curl http://localhost:9090/api/v1/query?query=up
```

### Grafana Issues

```bash
# Reset admin password
grafana-cli admin reset-admin-password newpassword

# Check data source connectivity
curl -u admin:GrafanaAdmin2024! http://localhost:3000/api/datasources

# View Grafana logs
tail -f /var/log/grafana/grafana.log
```

## Disaster Recovery

### Backup Procedures

1. **Configuration Backup**:

   ```bash
   tar -czf monitoring_config_$(date +%Y%m%d).tar.gz \
     /etc/haproxy \
     /etc/prometheus \
     /etc/grafana \
     /usr/local/bin/*_check.sh
   ```

2. **Prometheus Data Backup**:

   ```bash
   tar -czf prometheus_data_$(date +%Y%m%d).tar.gz /var/lib/prometheus/
   ```

3. **Grafana Database Backup**:
   ```bash
   cp /var/lib/grafana/grafana.db grafana_db_$(date +%Y%m%d).db
   ```

### Recovery Procedures

1. Stop all services
2. Restore configuration files
3. Restore data directories
4. Start services in order: HAProxy → Prometheus → Grafana
5. Verify all endpoints are accessible
6. Check all data sources are connected

## Performance Tuning

### HAProxy Optimization

```bash
# Edit /etc/haproxy/haproxy.cfg
maxconn 4000  # Increase for high traffic
timeout client 30s  # Adjust based on needs
timeout server 30s
```

### Prometheus Optimization

```bash
# Edit /etc/prometheus/prometheus.yml
global:
  scrape_interval: 30s  # Increase if too many metrics
  evaluation_interval: 30s
```

### Grafana Optimization

```bash
# Edit /etc/grafana/grafana.ini
[database]
wal = true
cache_mode = shared

[server]
enable_gzip = true
```

## Integration with CI/CD

### Webhook Configuration

```bash
# Add to HAProxy for deployment notifications
curl -X POST http://154.26.158.31/webhook/deploy \
  -H "Content-Type: application/json" \
  -d '{"service": "mcp-orchestrator", "version": "1.0.0"}'
```

### Metrics Export

```bash
# Export metrics for analysis
curl -G http://154.26.158.31:9090/api/v1/query_range \
  --data-urlencode "query=rate(http_requests_total[5m])" \
  --data-urlencode "start=$(date -d '1 hour ago' +%s)" \
  --data-urlencode "end=$(date +%s)" \
  --data-urlencode "step=15s"
```

## Contact Information

### Support

- **Primary Admin**: Infrastructure Team
- **Email**: infra@example.com
- **On-Call**: +1-XXX-XXX-XXXX

### Escalation Path

1. L1: Service health checks and restart
2. L2: Configuration changes and debugging
3. L3: Architecture changes and scaling

---

**Last Updated**: November 2024
**Version**: 1.0.0
**Maintained by**: Infrastructure Services Team
