# MCP Monitoring Agents Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        MCP Multi-VM Monitoring Architecture                       │
└──────────────────────────────────────────────────────────────────────────────────┘

                                  ┌─────────────────┐
                                  │   VMI01 Host    │
                                  │  46.250.243.123 │
                                  └────────┬────────┘
                                           │
                   ┌───────────────────────┼───────────────────────┐
                   │                       │                       │
         ┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
         │   PostgreSQL      │  │      Redis        │  │    Keycloak       │
         │  mcp_ecosystem    │  │   Cache/Queue     │  │   Identity Mgmt   │
         └───────────────────┘  └───────────────────┘  └───────────────────┘
                   │                       │                       │
         ┌─────────▼───────────────────────▼───────────────────────▼─────────┐
         │                  MCP Orchestrator (Port 3000)                      │
         │         ┌──────────────────────────────────────────┐              │
         │         │   Agent Registration & Coordination      │              │
         │         │   • Heartbeat Management                 │              │
         │         │   • Metrics Aggregation                  │              │
         │         │   • Alert Routing                        │              │
         │         └──────────────────────────────────────────┘              │
         └────────────────────────────────────────────────────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │                                 │                                 │
┌────────▼────────┐              ┌────────▼────────┐              ┌────────▼────────┐
│   VMI01 Agents  │              │  VMI02D Agents  │              │  VMI03 Agents   │
│  Dev/MCP Server │              │ Storage Server  │              │ Security Gateway│
├─────────────────┤              ├─────────────────┤              ├─────────────────┤
│                 │              │                 │              │                 │
│ 1. DB Optimizer │              │ 1. Storage Mgmt │              │ 1. Network Sec  │
│    ├─ Monitor   │              │    ├─ Disk      │              │    ├─ WireGuard │
│    ├─ Optimize  │              │    ├─ Snapshots │              │    ├─ Suricata  │
│    └─ Analyze   │              │    └─ SMART     │              │    └─ Firewall  │
│                 │              │                 │              │                 │
│ 2. App Health   │              │ 2. Service Hlth │              │ 2. Identity Mgmt│
│    ├─ MCP Svcs  │              │    ├─ NextCloud │              │    ├─ Keycloak  │
│    ├─ Auto-Heal │              │    ├─ Plex      │              │    ├─ Auth Logs │
│    └─ Logs      │              │    └─ APIs      │              │    └─ Tokens    │
│                 │              │                 │              │                 │
│ Port: 9100-9101 │              │ Port: 9200-9201 │              │ Port: 9300-9301 │
└─────────────────┘              └─────────────────┘              └─────────────────┘
         │                                 │                                 │
         └─────────────────────────────────┼─────────────────────────────────┘
                                           │
                                  ┌────────▼────────┐
                                  │   Prometheus    │
                                  │   Pushgateway   │
                                  │   Port 9091     │
                                  └────────┬────────┘
                                           │
                                  ┌────────▼────────┐
                                  │   Prometheus    │
                                  │     Server      │
                                  │   Port 9090     │
                                  └────────┬────────┘
                                           │
                                  ┌────────▼────────┐
                                  │     Grafana     │
                                  │  Visualization  │
                                  │   Port 3030     │
                                  └─────────────────┘
```

## Agent Communication Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Agent Lifecycle                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

Agent Startup
    │
    ├─► 1. Load Configuration (YAML)
    │      ├─ Database credentials
    │      ├─ Redis connection
    │      ├─ Monitoring thresholds
    │      └─ Alert configuration
    │
    ├─► 2. Initialize Connections
    │      ├─ PostgreSQL Pool (max 10 connections)
    │      ├─ Redis Client (with retry)
    │      └─ MCP Client (stdio transport)
    │
    ├─► 3. Register with Orchestrator
    │      ├─ Send heartbeat to agent_heartbeats table
    │      ├─ Declare capabilities
    │      └─ Receive agent_id
    │
    ├─► 4. Start Metric Collection
    │      ├─ Schedule cron jobs (30s or 60s interval)
    │      ├─ Collect system/service metrics
    │      ├─ Store to PostgreSQL (system_metrics table)
    │      ├─ Cache in Redis (5min TTL)
    │      └─ Push to Prometheus Pushgateway
    │
    ├─► 5. Monitor & Alert
    │      ├─ Check thresholds
    │      ├─ Generate alerts (Redis + PostgreSQL)
    │      └─ Trigger auto-recovery (if enabled)
    │
    └─► 6. Health Check Endpoint
           ├─ HTTP server on designated port
           ├─ /health - Agent status
           └─ /metrics - Prometheus metrics
```

## Agent Specifications

### VMI01: Database Optimizer Agent

**Purpose**: PostgreSQL performance monitoring and optimization

**Metrics Collected**:
- Connection pool usage (active/total)
- Cache hit ratio (target: >95%)
- Dead tuples per table
- Table bloat ratio
- Index scan efficiency
- Slow queries (>1000ms)
- Vacuum/analyze timestamps

**Auto-Optimization**:
- VACUUM when dead_tuples > 10,000
- ANALYZE after significant data changes
- Index recommendations for seq_scan heavy tables

**Alerts**:
- Critical: Connection pool exhausted, replication lag
- Warning: Low cache hit ratio, high bloat
- Info: Vacuum needed, unused indexes

**Port**: 9100
**Interval**: 60 seconds
**Dependencies**: pg_stat_statements extension

---

### VMI01: Application Health Agent

**Purpose**: Application service monitoring and auto-recovery

**Services Monitored**:
- MCP Orchestrator (port 3000)
- Perplexity-MCP (port 3001)
- ITJSST-MCP (port 3002)
- PostgreSQL (systemd)
- Redis (systemd)
- Keycloak (port 8080)

**Health Checks**:
- Process existence (ps/systemctl)
- HTTP endpoint health (/health)
- Resource usage (CPU, memory)
- Response time tracking

**Auto-Recovery**:
- Restart failed processes (max 3 attempts)
- Exponential backoff (5s, 10s, 20s)
- Clear cache on memory pressure
- Log error pattern detection

**Port**: 9101
**Interval**: 30 seconds

---

### VMI02D: Storage Management Agent

**Purpose**: Disk space and snapshot monitoring

**Metrics Collected**:
- Disk usage by mount point (/, /mnt/storage)
- Snapshot age and size
- I/O wait times
- SMART disk health attributes
- Deduplication opportunities

**Auto-Actions**:
- Alert at 80% disk usage
- Rotate snapshots >30 days old
- Verify snapshot integrity
- Recommend cleanup actions

**Alerts**:
- Critical: Disk >90% full, SMART errors
- Warning: Disk >80%, old snapshots
- Info: Dedup opportunities

**Port**: 9200
**Interval**: 60 seconds

---

### VMI02D: Service Health Agent

**Purpose**: NextCloud/Plex service monitoring

**Services Monitored**:
- NextCloud (port 8081)
- Plex Media Server (port 32400)
- Background cron jobs
- Upload/download speeds

**Health Checks**:
- API endpoint availability
- Database connectivity (NextCloud)
- Media library scanning status
- Resource utilization

**Auto-Recovery**:
- Restart hung services
- Clear file locks
- Reset failed cron jobs

**Port**: 9201
**Interval**: 30 seconds

---

### VMI03: Network Security Agent

**Purpose**: Network tunnel and IDS monitoring

**Metrics Collected**:
- WireGuard tunnel status (Root, MCP, Red)
- Peer connectivity and handshakes
- Suricata IDS alerts
- UFW firewall logs
- Fail2ban jail status
- Network traffic anomalies

**Alert Detection**:
- Tunnel disconnections
- IDS signature matches
- Unusual traffic patterns
- Repeated auth failures

**Auto-Actions**:
- Restart failed tunnels
- Block malicious IPs (fail2ban)
- Log security events

**Port**: 9300
**Interval**: 30 seconds

---

### VMI03: Identity Management Agent

**Purpose**: Keycloak authentication monitoring

**Metrics Collected**:
- Active user sessions
- Authentication attempts (success/failure)
- Token expiry tracking
- Realm health status
- Response times

**Alert Detection**:
- Brute force attempts (>5 failures/min)
- Token expiry issues
- Keycloak service degradation
- Database connection problems

**Auto-Actions**:
- Lock accounts after failed attempts
- Clear expired sessions
- Restart Keycloak on failure

**Port**: 9301
**Interval**: 60 seconds

---

## Database Schema

### agent_heartbeats Table

```sql
CREATE TABLE mcp_ecosystem.agent_heartbeats (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL,
    metadata JSONB,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_heartbeats_status ON mcp_ecosystem.agent_heartbeats(status);
CREATE INDEX idx_agent_heartbeats_last ON mcp_ecosystem.agent_heartbeats(last_heartbeat);
```

### system_metrics Table

```sql
CREATE TABLE mcp_ecosystem.system_metrics (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    metric_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_metrics_agent ON mcp_ecosystem.system_metrics(agent_id);
CREATE INDEX idx_system_metrics_type ON mcp_ecosystem.system_metrics(metric_type);
CREATE INDEX idx_system_metrics_created ON mcp_ecosystem.system_metrics(created_at);
CREATE INDEX idx_system_metrics_data ON mcp_ecosystem.system_metrics USING GIN(metric_data);
```

## Prometheus Metrics

### Common Metrics (All Agents)

- `{agent}_heartbeat_total` - Total heartbeats sent
- `{agent}_errors_total{type}` - Errors by type
- `{agent}_metrics_collection_duration_seconds` - Collection time

### DB Optimizer Metrics

- `db_connections_active{database}` - Active connections
- `db_cache_hit_ratio{database}` - Cache efficiency
- `db_dead_tuples{schema,table}` - Cleanup needed
- `db_bloat_ratio{schema,table}` - Storage waste
- `db_slow_queries_total{database}` - Performance issues
- `db_vacuum_runs_total{type}` - Maintenance operations

### App Health Metrics

- `service_status{service,type}` - 1=healthy, 0=down
- `service_cpu_percent{service}` - CPU usage
- `service_memory_mb{service}` - Memory usage
- `service_restarts_total{service}` - Restart count
- `service_response_time_ms{service}` - Latency

### Storage Metrics

- `disk_usage_percent{mount}` - Disk utilization
- `snapshot_age_days{snapshot}` - Snapshot freshness
- `disk_io_wait_percent` - I/O bottleneck
- `smart_health_status{disk}` - Hardware health

### Network Security Metrics

- `wireguard_tunnel_status{tunnel}` - 1=up, 0=down
- `wireguard_peer_handshake_seconds{peer}` - Last handshake
- `ids_alerts_total{severity}` - Intrusion attempts
- `firewall_blocks_total{rule}` - Blocked connections

### Identity Metrics

- `keycloak_active_sessions` - Current sessions
- `keycloak_auth_attempts_total{result}` - Auth stats
- `keycloak_token_expiry_seconds` - Token TTL
- `keycloak_response_time_ms` - Service latency

## Alert Severity Levels

### Critical (Immediate Action Required)
- Service completely down
- Database connection pool exhausted
- Disk >90% full
- SMART disk failure
- Security breach detected
- Auto-restart failed after max attempts

### Warning (Action Needed Soon)
- High CPU/memory usage (>80%)
- Disk >80% full
- Cache hit ratio <95%
- Table bloat >30%
- Slow response times
- Failed authentication patterns

### Info (Awareness)
- Service restarted successfully
- Vacuum/analyze recommended
- Unused index detected
- Configuration drift
- Performance optimization opportunity

## Security Considerations

### Agent Security
1. Run as dedicated `mcp-agent` user (no shell, restricted home)
2. Systemd hardening (NoNewPrivileges, ProtectSystem, PrivateTmp)
3. Resource limits (MemoryLimit, CPUQuota, TasksMax)
4. File permissions (600 for configs, 640 for logs)
5. Environment variable secrets (never commit passwords)

### Network Security
1. Health endpoints bound to localhost only
2. MCP stdio transport (no network exposure)
3. PostgreSQL SSL connections (optional)
4. Redis AUTH enabled
5. Prometheus metrics authentication (if public)

### Data Security
1. Sensitive data redacted from logs
2. Metric data retention (30 days default)
3. Alert data sanitization
4. Query parameterization (prevent SQL injection)
5. Regular security audits

## Deployment Strategy

### Phase 1: VMI01 Agents (Core Infrastructure)
1. Deploy DB Optimizer Agent
2. Verify PostgreSQL monitoring
3. Deploy App Health Agent
4. Test auto-recovery

### Phase 2: VMI02D Agents (Storage)
1. Deploy Storage Management Agent
2. Configure snapshot monitoring
3. Deploy Service Health Agent
4. Test service checks

### Phase 3: VMI03 Agents (Security)
1. Deploy Network Security Agent
2. Configure IDS integration
3. Deploy Identity Management Agent
4. Test Keycloak monitoring

### Phase 4: Integration
1. Configure Prometheus scraping
2. Setup Grafana dashboards
3. Test alert routing
4. Load testing
5. Documentation

## Monitoring Best Practices

1. **Gradual Rollout**: Deploy one agent at a time, verify before next
2. **Threshold Tuning**: Start conservative, adjust based on baselines
3. **Alert Fatigue**: Limit alerts to actionable items
4. **Metric Retention**: Balance storage vs. historical data needs
5. **Regular Reviews**: Weekly metric analysis, monthly tuning
6. **Incident Response**: Document alert responses, improve automation
7. **Capacity Planning**: Trend analysis for proactive scaling

## Performance Impact

| Agent | CPU Usage | Memory | Network | Disk I/O |
|-------|-----------|--------|---------|----------|
| DB Optimizer | 5-10% | 100-200MB | 1-5KB/s | Low |
| App Health | 3-7% | 80-150MB | 1-3KB/s | Low |
| Storage Mgmt | 2-5% | 60-120MB | <1KB/s | Medium |
| Service Health | 3-6% | 70-130MB | 1-2KB/s | Low |
| Network Sec | 4-8% | 90-160MB | 2-5KB/s | Low |
| Identity Mgmt | 3-6% | 80-140MB | 1-3KB/s | Low |

**Total System Impact**: <5% CPU, <1GB RAM across all agents

## Troubleshooting Guide

### Agent Won't Start
1. Check logs: `journalctl -u {agent-name} -n 50`
2. Verify config: `yamllint config/config.yaml`
3. Test DB connection: `psql -h localhost -U mcp_orchestrator -d mcp_ecosystem`
4. Test Redis: `redis-cli ping`
5. Check permissions: `ls -la /opt/mcp-agents/{agent-name}`

### Missing Metrics
1. Verify Pushgateway: `curl http://localhost:9091/metrics`
2. Check agent metrics endpoint: `curl http://localhost:910X/metrics`
3. Review collection errors in logs
4. Verify PostgreSQL extensions (pg_stat_statements)
5. Check Redis cache: `redis-cli --scan --pattern 'agent:*'`

### High Resource Usage
1. Review metric collection interval (increase if too frequent)
2. Check for metric explosion (high cardinality labels)
3. Tune database connection pool size
4. Reduce log verbosity
5. Adjust systemd resource limits

### Alert Storm
1. Increase alert thresholds temporarily
2. Check for cascading failures
3. Review alert deduplication logic
4. Implement alert grouping/throttling
5. Investigate root cause, not symptoms

## Future Enhancements

1. **Machine Learning**: Anomaly detection for proactive alerts
2. **Auto-Scaling**: Dynamic resource allocation based on metrics
3. **Distributed Tracing**: Request flow across services
4. **Cost Optimization**: Resource usage recommendations
5. **Multi-Region**: Support for geographically distributed VMs
6. **Custom Plugins**: Extensible agent framework
7. **Real-time Dashboards**: WebSocket-based live updates
8. **Predictive Maintenance**: Forecast failures before they occur
