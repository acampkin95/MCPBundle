# MCP Monitoring Agents - Quick Reference Card

## Emergency Contacts

| Issue Type     | Contact  | Method               |
| -------------- | -------- | -------------------- |
| Database       | DBA Team | dba@example.com      |
| Application    | DevOps   | devops@example.com   |
| Security       | SecOps   | security@example.com |
| Infrastructure | Platform | platform@example.com |

---

## Quick Commands

### Check All Agents Status

```bash
# One-liner status check
for a in db-optimizer app-health storage-mgmt service-health network-sec identity-mgmt; do echo "=== $a ===" && systemctl is-active $a; done

# Detailed status
systemctl status *-agent --no-pager
```

### View Logs

```bash
# Follow logs in real-time
journalctl -u db-optimizer -f

# Last 100 lines
journalctl -u app-health -n 100

# Errors only
journalctl -u db-optimizer -p err -n 50

# All agents combined
journalctl -u '*-agent' -f
```

### Health Checks

```bash
# VMI01
curl http://localhost:9100/health | jq .status  # db-optimizer
curl http://localhost:9101/health | jq .status  # app-health

# VMI02D
curl http://localhost:9200/health | jq .status  # storage-mgmt
curl http://localhost:9201/health | jq .status  # service-health

# VMI03
curl http://localhost:9300/health | jq .status  # network-sec
curl http://localhost:9301/health | jq .status  # identity-mgmt

# All at once
for p in 9100 9101 9200 9201 9300 9301; do echo "Port $p:" && curl -s http://localhost:$p/health 2>/dev/null | jq -r .status || echo "N/A"; done
```

### Restart Agents

```bash
# Single agent
systemctl restart db-optimizer

# All agents on VM
systemctl restart *-agent

# Graceful reload (if supported)
systemctl reload db-optimizer
```

### View Metrics

```bash
# Agent metrics
curl http://localhost:9100/metrics

# Specific metric
curl -s http://localhost:9100/metrics | grep db_connections_active

# Pushgateway metrics
curl http://localhost:9091/metrics | grep db_optimizer
```

---

## Common Issues & Fixes

### Issue: Agent Won't Start

```bash
# 1. Check logs
journalctl -u db-optimizer -n 50

# 2. Verify config
yamllint /opt/mcp-agents/db-optimizer-agent/config/config.yaml

# 3. Test DB connection
psql -h localhost -U mcp_orchestrator -d mcp_ecosystem -c "SELECT 1"

# 4. Check permissions
ls -la /opt/mcp-agents/db-optimizer-agent
chown -R mcp-agent:mcp-agent /opt/mcp-agents/db-optimizer-agent

# 5. Restart
systemctl restart db-optimizer
```

### Issue: High CPU Usage

```bash
# 1. Identify process
top -p $(pgrep -f db-optimizer)

# 2. Check metrics interval
grep metrics_interval /opt/mcp-agents/*/config/config.yaml

# 3. Reduce frequency (edit config)
nano /opt/mcp-agents/db-optimizer-agent/config/config.yaml
# Change: metrics_interval: 120000

# 4. Restart
systemctl restart db-optimizer
```

### Issue: No Metrics in Prometheus

```bash
# 1. Check agent endpoint
curl http://localhost:9100/metrics

# 2. Check Pushgateway
curl http://localhost:9091/metrics | grep db_optimizer

# 3. Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq .

# 4. Restart Pushgateway
systemctl restart pushgateway

# 5. Verify Prometheus config
cat /etc/prometheus/prometheus.yml | grep -A5 pushgateway
```

### Issue: Database Connection Errors

```bash
# 1. Test PostgreSQL
systemctl status postgresql
psql -U postgres -c "SELECT 1"

# 2. Check password
cat /etc/mcp-agents/db-optimizer.env | grep DB_PASSWORD

# 3. Test connection with password
PGPASSWORD=your_password psql -h localhost -U mcp_orchestrator -d mcp_ecosystem -c "SELECT 1"

# 4. Grant permissions (if needed)
psql -U postgres -d mcp_ecosystem -c "GRANT ALL ON SCHEMA mcp_ecosystem TO mcp_orchestrator;"

# 5. Restart agent
systemctl restart db-optimizer
```

### Issue: Alert Storm

```bash
# 1. Check recent alerts
redis-cli lrange alerts 0 20

# 2. Identify alert type
psql -U mcp_orchestrator -d mcp_ecosystem -c "SELECT metric_data->>'type', COUNT(*) FROM system_metrics WHERE metric_type='alert' AND created_at > NOW() - INTERVAL '1 hour' GROUP BY 1 ORDER BY 2 DESC;"

# 3. Temporarily disable alerts
nano /opt/mcp-agents/*/config/config.yaml
# Change: alerts.enabled: false

# 4. Restart agents
systemctl restart *-agent

# 5. Fix root cause, re-enable alerts
```

---

## Configuration Files

### Locations

```
/opt/mcp-agents/            # Agent code
├── db-optimizer-agent/
│   └── config/config.yaml
├── app-health-agent/
│   └── config/config.yaml
└── ...

/etc/mcp-agents/            # Credentials
├── db-optimizer.env
├── app-health.env
└── ...

/etc/systemd/system/        # Services
├── db-optimizer.service
├── app-health.service
└── ...

/var/log/mcp-agents/        # Logs
├── db-optimizer.log
├── app-health.log
└── ...
```

### Key Configuration Parameters

```yaml
# Metrics interval
monitoring:
  metrics_interval: 60000  # ms

# Database connection
database:
  host: localhost
  port: 5432
  database: mcp_ecosystem
  user: mcp_orchestrator

# Alert thresholds
monitoring:
  thresholds:
    cpu_percent_max: 80
    memory_percent_max: 85
    cache_hit_ratio_min: 0.95
```

---

## Port Reference

| Port | Agent          | VM     | Purpose             |
| ---- | -------------- | ------ | ------------------- |
| 9100 | db-optimizer   | VMI01  | Health/Metrics      |
| 9101 | app-health     | VMI01  | Health/Metrics      |
| 9200 | storage-mgmt   | VMI02D | Health/Metrics      |
| 9201 | service-health | VMI02D | Health/Metrics      |
| 9300 | network-sec    | VMI03  | Health/Metrics      |
| 9301 | identity-mgmt  | VMI03  | Health/Metrics      |
| 9091 | pushgateway    | VMI01  | Metrics aggregation |
| 9090 | prometheus     | VMI01  | Metrics storage     |
| 3030 | grafana        | VMI01  | Visualization       |

---

## Alert Severity

| Level        | Examples                                     | Action             |
| ------------ | -------------------------------------------- | ------------------ |
| **Critical** | Service down, disk full, auto-restart failed | Immediate response |
| **Warning**  | High CPU (>80%), cache hit low               | Investigate soon   |
| **Info**     | Service restarted, vacuum needed             | Awareness only     |

---

## Metrics Glossary

### Database Optimizer

- `db_connections_active`: Active PostgreSQL connections
- `db_cache_hit_ratio`: Percentage of queries served from cache (target: >95%)
- `db_dead_tuples`: Dead rows needing vacuum
- `db_bloat_ratio`: Table fragmentation (target: <30%)
- `db_slow_queries_total`: Queries slower than 1000ms

### Application Health

- `service_status`: 1=healthy, 0=unhealthy
- `service_cpu_percent`: CPU usage percentage
- `service_memory_mb`: Memory usage in megabytes
- `service_restarts_total`: Number of restarts
- `service_response_time_ms`: HTTP response time

### Storage Management

- `disk_usage_percent`: Disk utilization (alert at 80%)
- `snapshot_age_days`: Snapshot age (alert at 30 days)
- `smart_health_status`: Disk health (1=pass, 0=fail)

### Network Security

- `wireguard_tunnel_status`: Tunnel state (1=up, 0=down)
- `ids_alerts_total`: IDS detections by severity
- `firewall_blocks_total`: Blocked connections

---

## Database Queries

### Check Agent Heartbeats

```sql
SELECT
    agent_id,
    status,
    last_heartbeat,
    AGE(NOW(), last_heartbeat) as time_since_heartbeat
FROM mcp_ecosystem.agent_heartbeats
ORDER BY last_heartbeat DESC;
```

### Recent Alerts

```sql
SELECT
    agent_id,
    metric_data->>'type' as alert_type,
    metric_data->>'severity' as severity,
    created_at
FROM mcp_ecosystem.system_metrics
WHERE metric_type = 'alert'
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

### Metric Summary

```sql
SELECT
    agent_id,
    metric_type,
    COUNT(*) as count,
    MAX(created_at) as latest
FROM mcp_ecosystem.system_metrics
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY agent_id, metric_type
ORDER BY agent_id, metric_type;
```

### Database Performance

```sql
-- Top 10 slow queries
SELECT
    query,
    mean_exec_time,
    calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Table bloat
SELECT
    schemaname,
    tablename,
    n_dead_tup,
    ROUND((n_dead_tup::float / NULLIF(n_live_tup, 0))::numeric, 4) as bloat_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

---

## Performance Baselines

### Normal Operating Ranges

| Metric             | Normal    | Warning   | Critical |
| ------------------ | --------- | --------- | -------- |
| CPU per agent      | <5%       | 5-10%     | >10%     |
| Memory per agent   | 100-200MB | 200-400MB | >400MB   |
| DB cache hit ratio | >95%      | 90-95%    | <90%     |
| Disk usage         | <70%      | 70-85%    | >85%     |
| Response time      | <100ms    | 100-500ms | >500ms   |

### Typical Rates

- Metrics collection: Every 30-60 seconds
- Heartbeat: Every 60 seconds
- Metric push: Every 30-60 seconds
- Database writes: ~10-50 per minute per agent
- Network traffic: 1-5 KB/s per agent

---

## Maintenance Schedule

### Daily

```bash
# Check agent status
systemctl status *-agent

# Review alerts
psql -U mcp_orchestrator -d mcp_ecosystem -c "SELECT * FROM system_metrics WHERE metric_type='alert' AND created_at > NOW() - INTERVAL '24 hours';"

# Check disk space
df -h
```

### Weekly

```bash
# Review slow queries
psql -U postgres -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check for unused indexes
# (See DB Optimizer recommendations)

# Review logs for warnings
journalctl -u '*-agent' --since "7 days ago" | grep -i warn
```

### Monthly

```bash
# Clean old metrics
psql -U mcp_orchestrator -d mcp_ecosystem -c "DELETE FROM system_metrics WHERE created_at < NOW() - INTERVAL '30 days';"

# Vacuum database
psql -U postgres -c "VACUUM ANALYZE mcp_ecosystem.system_metrics;"

# Review and adjust thresholds
# (Based on observed baselines)

# Update agents if new version available
./deploy-agents.sh vmi01
```

---

## Escalation Procedures

### Level 1 (Self-Service)

- Check health endpoints
- Review recent logs
- Restart agent if needed
- Check basic connectivity

**Resolution Time**: 15 minutes

### Level 2 (Team Support)

- Database connection issues
- Configuration problems
- Performance tuning
- Alert threshold adjustments

**Resolution Time**: 1 hour

### Level 3 (Engineering)

- Code bugs
- Architecture changes
- Major outages
- Security incidents

**Resolution Time**: 4+ hours

---

## Useful Scripts

### Monitor All Agents

```bash
#!/bin/bash
while true; do
    clear
    echo "=== MCP Agent Status at $(date) ==="
    for agent in db-optimizer app-health storage-mgmt service-health network-sec identity-mgmt; do
        status=$(systemctl is-active $agent 2>/dev/null || echo "N/A")
        printf "%-20s %s\n" "$agent:" "$status"
    done
    sleep 5
done
```

### Collect Diagnostics

```bash
#!/bin/bash
OUTPUT="diagnostics-$(date +%Y%m%d-%H%M%S).tar.gz"

mkdir -p /tmp/diagnostics
journalctl -u '*-agent' --since "1 hour ago" > /tmp/diagnostics/logs.txt
systemctl status *-agent > /tmp/diagnostics/status.txt
for p in 9100 9101 9200 9201 9300 9301; do
    curl -s http://localhost:$p/health > /tmp/diagnostics/health-$p.json 2>&1
done

tar -czf "$OUTPUT" -C /tmp diagnostics/
rm -rf /tmp/diagnostics
echo "Diagnostics saved to: $OUTPUT"
```

---

## Security Reminders

- ✅ Never commit credentials to version control
- ✅ Rotate passwords every 90 days
- ✅ Use strong passwords (20+ characters)
- ✅ Limit SSH access to authorized users only
- ✅ Review agent logs for security events
- ✅ Keep agents updated with security patches
- ✅ Monitor for unauthorized access attempts
- ✅ Audit permissions regularly

---

**Print this page for quick reference!**

**Version**: 1.0
**Updated**: 2025-11-06
**Owner**: MCP Infrastructure Team
