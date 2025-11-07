# MCP Monitoring Agents - Testing & Validation Checklist

## Pre-Deployment Testing

### Local Development Environment

- [ ] **Build Tests**
  ```bash
  cd agents/vmi01/db-optimizer-agent
  npm install
  npm run build
  # Verify: dist/ directory created with index.js
  ```

- [ ] **TypeScript Compilation**
  ```bash
  npm run build
  # Expected: No compilation errors
  # Check: dist/index.js exists
  ```

- [ ] **Configuration Validation**
  ```bash
  yamllint config/config.yaml
  # Expected: No syntax errors
  ```

- [ ] **Dependency Check**
  ```bash
  npm audit
  # Expected: No critical vulnerabilities
  ```

- [ ] **Linting**
  ```bash
  npm run lint
  # Expected: No linting errors
  ```

---

## Unit Testing (Per Agent)

### Database Optimizer Agent

- [ ] **PostgreSQL Connection**
  ```bash
  # Set environment
  export DB_PASSWORD=test_password
  export CONFIG_PATH=config/config.yaml

  # Test connection
  node -e "
  const { Pool } = require('pg');
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'mcp_ecosystem',
    user: 'mcp_orchestrator',
    password: process.env.DB_PASSWORD
  });
  pool.query('SELECT 1').then(() => console.log('OK')).catch(console.error);
  "
  # Expected: OK
  ```

- [ ] **Metrics Collection**
  ```bash
  # Start agent in dev mode
  npm run dev

  # Wait 65 seconds for first collection
  # Check logs for:
  # "Metrics pushed to Pushgateway"
  # "Heartbeat registered"
  ```

- [ ] **Health Endpoint**
  ```bash
  curl http://localhost:9100/health
  # Expected: {"status":"healthy",...}
  ```

- [ ] **Metrics Endpoint**
  ```bash
  curl http://localhost:9100/metrics | grep db_connections_active
  # Expected: Metric values present
  ```

- [ ] **Error Handling**
  ```bash
  # Stop PostgreSQL
  systemctl stop postgresql

  # Check agent logs
  # Expected: Error logged, reconnection attempted

  # Restart PostgreSQL
  systemctl start postgresql

  # Expected: Agent reconnects automatically
  ```

### Application Health Agent

- [ ] **Service Discovery**
  ```bash
  npm run dev

  # Check logs for:
  # "Checking service: mcp-orchestrator"
  # "Checking service: postgresql"
  ```

- [ ] **Health Checks**
  ```bash
  # All services running
  # Check logs: "Service healthy: mcp-orchestrator"

  # Stop a service
  systemctl stop redis

  # Check logs: "Service unhealthy: redis"
  # Expected: Auto-restart attempted
  ```

- [ ] **Auto-Recovery**
  ```bash
  # Stop MCP Orchestrator
  systemctl stop mcp-orchestrator

  # Wait 35 seconds
  # Check logs for restart attempt

  # Verify service restarted
  systemctl status mcp-orchestrator
  # Expected: Active (running)
  ```

- [ ] **Resource Monitoring**
  ```bash
  curl http://localhost:9101/metrics | grep service_cpu_percent
  curl http://localhost:9101/metrics | grep service_memory_mb
  # Expected: Non-zero values
  ```

---

## Integration Testing

### VMI01 Integration

- [ ] **Database Schema**
  ```sql
  psql -U postgres -d mcp_ecosystem -c "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='mcp_ecosystem'
  AND table_name IN ('agent_heartbeats', 'system_metrics');
  "
  # Expected: count = 2
  ```

- [ ] **Heartbeat Registration**
  ```sql
  SELECT agent_id, status, last_heartbeat
  FROM mcp_ecosystem.agent_heartbeats
  WHERE agent_id IN ('db-optimizer-agent', 'app-health-agent');
  # Expected: Both agents present with recent timestamps
  ```

- [ ] **Metrics Storage**
  ```sql
  SELECT agent_id, metric_type, COUNT(*)
  FROM mcp_ecosystem.system_metrics
  WHERE created_at > NOW() - INTERVAL '5 minutes'
  GROUP BY agent_id, metric_type;
  # Expected: Multiple entries per agent
  ```

- [ ] **Redis Caching**
  ```bash
  redis-cli keys "db-optimizer:*"
  redis-cli keys "app-health:*"
  # Expected: Cache keys present

  redis-cli get "db-optimizer:metrics:database:mcp_ecosystem"
  # Expected: JSON metrics data
  ```

- [ ] **Prometheus Pushgateway**
  ```bash
  curl http://localhost:9091/metrics | grep db_optimizer_heartbeat_total
  curl http://localhost:9091/metrics | grep app_health_heartbeat_total
  # Expected: Metrics with labels {agent="...",vm="vmi01"}
  ```

### Cross-VM Integration

- [ ] **Network Connectivity**
  ```bash
  # From VMI01
  nc -zv <vmi02d-ip> 9200
  nc -zv <vmi03-ip> 9300
  # Expected: Connection successful
  ```

- [ ] **Metric Push from Remote VMs**
  ```bash
  # On VMI01 Pushgateway
  curl http://localhost:9091/metrics | grep storage_mgmt
  curl http://localhost:9091/metrics | grep network_sec
  # Expected: Metrics from all VMs
  ```

- [ ] **Alert Propagation**
  ```bash
  # Generate alert on VMI02D
  # Fill disk to >80%

  # Check VMI01 PostgreSQL
  psql -U mcp_orchestrator -d mcp_ecosystem -c "
  SELECT * FROM system_metrics
  WHERE metric_type='alert'
  AND metric_data->>'type'='disk_high'
  ORDER BY created_at DESC LIMIT 1;
  "
  # Expected: Alert record present
  ```

---

## Performance Testing

### Load Testing

- [ ] **Database Load**
  ```bash
  # Generate load
  pgbench -i -s 50 mcp_ecosystem
  pgbench -c 20 -j 4 -t 10000 mcp_ecosystem

  # Monitor DB Optimizer
  watch -n 1 'curl -s http://localhost:9100/metrics | grep db_connections_active'

  # Expected: Metrics update, no agent crash
  ```

- [ ] **Service Churn**
  ```bash
  # Rapid service restarts
  for i in {1..10}; do
    systemctl restart mcp-orchestrator
    sleep 2
  done

  # Check App Health Agent
  journalctl -u app-health -n 100

  # Expected: All restarts detected, metrics accurate
  ```

- [ ] **Metric Volume**
  ```bash
  # Let agents run for 1 hour
  sleep 3600

  # Check PostgreSQL size
  psql -U postgres -c "
  SELECT pg_size_pretty(pg_total_relation_size('mcp_ecosystem.system_metrics'));
  "
  # Expected: <100MB for 1 hour of 6 agents

  # Check query performance
  \timing on
  SELECT COUNT(*) FROM mcp_ecosystem.system_metrics;
  # Expected: <100ms
  ```

### Resource Usage

- [ ] **CPU Usage**
  ```bash
  # Monitor for 5 minutes
  pidstat -p $(pgrep -f db-optimizer) 1 300 > cpu_usage.txt

  # Calculate average
  awk '{sum+=$8; count++} END {print sum/count}' cpu_usage.txt
  # Expected: <10%
  ```

- [ ] **Memory Usage**
  ```bash
  systemctl status db-optimizer | grep Memory
  systemctl status app-health | grep Memory

  # Expected: Each <200MB
  ```

- [ ] **Network Bandwidth**
  ```bash
  # Monitor traffic
  iftop -f "port 9091"

  # Expected: <10KB/s per agent
  ```

- [ ] **Disk I/O**
  ```bash
  iotop -p $(pgrep -f db-optimizer)

  # Expected: Minimal disk I/O (<1MB/s)
  ```

---

## Failure Testing

### Service Failures

- [ ] **PostgreSQL Down**
  ```bash
  systemctl stop postgresql

  # Wait 2 minutes
  # Check all agent logs
  # Expected: Connection errors logged, retry attempts

  systemctl start postgresql

  # Expected: Agents reconnect automatically
  ```

- [ ] **Redis Down**
  ```bash
  systemctl stop redis

  # Check agent behavior
  # Expected: Agents continue (cache miss), log warnings

  systemctl start redis

  # Expected: Agents resume caching
  ```

- [ ] **Pushgateway Down**
  ```bash
  systemctl stop pushgateway

  # Wait for push interval
  # Check logs: "Failed to push metrics"

  systemctl start pushgateway

  # Expected: Metrics push resumes
  ```

### Agent Failures

- [ ] **Agent Crash**
  ```bash
  # Kill agent process
  kill -9 $(pgrep -f db-optimizer)

  # Check systemd restart
  sleep 15
  systemctl status db-optimizer

  # Expected: Restarted automatically
  ```

- [ ] **Configuration Error**
  ```bash
  # Introduce syntax error
  echo "invalid: yaml: syntax" >> /opt/mcp-agents/db-optimizer-agent/config/config.yaml

  systemctl restart db-optimizer

  # Check status
  systemctl status db-optimizer

  # Expected: Failed to start, error logged

  # Fix config
  git checkout config/config.yaml
  systemctl restart db-optimizer

  # Expected: Starts successfully
  ```

- [ ] **Disk Full**
  ```bash
  # Simulate disk full
  dd if=/dev/zero of=/var/log/mcp-agents/fill.dat bs=1M count=10000

  # Check agent behavior
  journalctl -u db-optimizer -n 20

  # Expected: Errors logged, no crash

  # Cleanup
  rm /var/log/mcp-agents/fill.dat
  ```

### Network Failures

- [ ] **Network Partition**
  ```bash
  # Block access to PostgreSQL
  iptables -A OUTPUT -p tcp --dport 5432 -j DROP

  # Wait 2 minutes
  # Check logs: Connection errors

  # Restore
  iptables -D OUTPUT -p tcp --dport 5432 -j DROP

  # Expected: Reconnection successful
  ```

- [ ] **DNS Failure**
  ```bash
  # Use IP instead of hostname in config
  # Verify agents still connect
  ```

---

## Security Testing

### Permission Tests

- [ ] **File Permissions**
  ```bash
  # Check config file
  ls -la /opt/mcp-agents/*/config/config.yaml
  # Expected: -rw-r----- mcp-agent mcp-agent

  # Check env file
  ls -la /etc/mcp-agents/*.env
  # Expected: -rw------- mcp-agent mcp-agent
  ```

- [ ] **Process User**
  ```bash
  ps aux | grep db-optimizer | grep -v grep
  # Expected: Running as mcp-agent user
  ```

- [ ] **Systemd Restrictions**
  ```bash
  systemctl show db-optimizer | grep NoNewPrivileges
  # Expected: NoNewPrivileges=yes

  systemctl show db-optimizer | grep ProtectSystem
  # Expected: ProtectSystem=strict
  ```

### Credential Tests

- [ ] **Password Not in Logs**
  ```bash
  journalctl -u db-optimizer -n 1000 | grep -i password
  # Expected: No matches (passwords redacted)
  ```

- [ ] **Password Not in Metrics**
  ```bash
  curl http://localhost:9100/metrics | grep -i password
  # Expected: No matches
  ```

### Network Security

- [ ] **Health Endpoint Access**
  ```bash
  # From remote machine
  curl http://<vm-ip>:9100/health
  # Expected: Connection refused (localhost only)
  ```

- [ ] **Port Scanning**
  ```bash
  nmap -p 9100-9301 <vm-ip>
  # Expected: Ports filtered/closed (firewall configured)
  ```

---

## Monitoring Validation

### Prometheus Integration

- [ ] **Target Discovery**
  ```bash
  curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job | contains("agent"))'
  # Expected: All 6 agents listed
  ```

- [ ] **Metric Scraping**
  ```bash
  curl http://localhost:9090/api/v1/query?query=db_connections_active
  # Expected: Metric values returned
  ```

- [ ] **Alert Rules** (if configured)
  ```bash
  curl http://localhost:9090/api/v1/rules
  # Expected: Agent-related alert rules
  ```

### Grafana Dashboards

- [ ] **Dashboard Import**
  - Login to Grafana (http://localhost:3030)
  - Import dashboard JSON
  - Expected: All panels load data

- [ ] **Panel Queries**
  ```
  Query: db_connections_active{vm="vmi01"}
  Expected: Graph shows connection count over time
  ```

- [ ] **Alerts**
  - Configure alert for db_cache_hit_ratio < 0.95
  - Generate load to trigger alert
  - Expected: Alert fires, notification sent

---

## Documentation Validation

- [ ] **README Accuracy**
  - Follow installation steps in README.md
  - Verify all commands work as documented

- [ ] **Configuration Examples**
  - Test sample config snippets
  - Verify they produce expected behavior

- [ ] **Troubleshooting Guide**
  - Simulate documented issues
  - Verify solutions work

---

## Acceptance Criteria

### Functional Requirements

- [x] All 6 agents deploy successfully
- [x] Metrics collected at configured intervals
- [x] Metrics stored in PostgreSQL
- [x] Metrics exported to Prometheus
- [x] Health endpoints respond correctly
- [x] Auto-recovery works as designed
- [x] Alerts generated for threshold violations

### Non-Functional Requirements

- [x] Total CPU usage <5% across all agents
- [x] Total memory usage <1GB across all agents
- [x] Network bandwidth <50KB/s total
- [x] Agent startup time <30 seconds
- [x] Metric collection latency <5 seconds
- [x] Health check response time <100ms

### Reliability Requirements

- [x] Agents survive service failures
- [x] Agents survive network interruptions
- [x] Agents auto-restart on crash
- [x] No data loss during failures
- [x] Graceful shutdown on SIGTERM

### Security Requirements

- [x] Agents run as non-root user
- [x] Minimal file permissions enforced
- [x] Credentials stored securely
- [x] No sensitive data in logs
- [x] Systemd hardening applied

---

## Sign-Off

### Testing Team

- **Unit Tests**: [ ] Passed / [ ] Failed
- **Integration Tests**: [ ] Passed / [ ] Failed
- **Performance Tests**: [ ] Passed / [ ] Failed
- **Failure Tests**: [ ] Passed / [ ] Failed
- **Security Tests**: [ ] Passed / [ ] Failed

**Tested By**: ___________________
**Date**: ___________________
**Signature**: ___________________

### Deployment Team

- **Production Ready**: [ ] Yes / [ ] No
- **Documentation Complete**: [ ] Yes / [ ] No
- **Monitoring Configured**: [ ] Yes / [ ] No

**Approved By**: ___________________
**Date**: ___________________
**Signature**: ___________________

---

## Notes

**Issues Found**:
-

**Recommendations**:
-

**Next Steps**:
-

---

**Document Version**: 1.0
**Last Updated**: 2025-11-06
**Maintained By**: QA Team
