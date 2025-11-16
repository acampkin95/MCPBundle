# MCP Ecosystem Database - Quick Reference

## Connection

```bash
# Local (on VMI01)
psql -h localhost -U mcp_admin -d mcp_ecosystem

# Remote (after pg_hba.conf configuration)
psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem
```

**Password:** ``

**Connection String:**

```
postgresql://mcp_admin:@localhost:5432/mcp_ecosystem
```

---

## Common Operations

### Register an Agent

```sql
INSERT INTO mcp_agents (agent_id, agent_name, agent_type, capabilities, hostname, status)
VALUES ('my-agent-01', 'My Agent', 'server', ARRAY['postgres-admin'], 'host.local', 'online');
```

### Send Heartbeat

```sql
INSERT INTO agent_heartbeats (agent_id, cpu_percent, memory_percent, disk_percent)
VALUES ('my-agent-01', 45.5, 60.2, 70.8);
```

### Queue a Command

```sql
INSERT INTO command_queue (tool_name, operation, parameters, target_agent_id, priority)
VALUES ('postgres-manage', 'vacuum', '{"database": "mydb"}'::jsonb, 'my-agent-01', 5);
```

### Find Best Agent

```sql
SELECT get_least_loaded_agent(ARRAY['postgres-admin', 'redis-admin']);
```

### View Active Agents

```sql
SELECT * FROM active_agents;
```

### View Command Queue

```sql
SELECT * FROM queue_summary;
```

---

## Monitoring Queries

### Agent Health

```sql
SELECT agent_id, agent_name, status, health_score,
       current_load || '/' || max_concurrent_commands AS load
FROM mcp_agents
ORDER BY status, health_score DESC;
```

### Command Backlog

```sql
SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest
FROM command_queue
WHERE status IN ('pending', 'assigned', 'running')
GROUP BY status;
```

### Active Alerts

```sql
SELECT a.alert_id, ar.rule_name, ar.severity, a.status, a.fired_at
FROM alerts a
JOIN alert_rules ar ON a.rule_id = ar.rule_id
WHERE a.status = 'firing'
ORDER BY a.fired_at DESC;
```

---

## Maintenance

### Refresh Service Directory

```sql
REFRESH MATERIALIZED VIEW service_directory;
```

### Cleanup Old Data

```sql
SELECT * FROM cleanup_old_data(90);  -- 90 days retention
```

### Create New Partition (January 2026)

```sql
CREATE TABLE agent_heartbeats_2026_01 PARTITION OF agent_heartbeats
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_log_2026_01 PARTITION OF audit_log
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE system_metrics_2026_01 PARTITION OF system_metrics
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

### Backup Database

```bash
pg_dump -U mcp_admin -d mcp_ecosystem -Fc -f mcp_ecosystem_$(date +%Y%m%d).backup
```

### Restore Database

```bash
pg_restore -U mcp_admin -d mcp_ecosystem -c mcp_ecosystem_backup.backup
```

---

## Schema Summary

- **16 Core Tables** - Agent management, commands, thoughts, policies, monitoring
- **3 Partitioned Tables** - Heartbeats, audit log, metrics
- **4 Views + 1 Materialized View** - Active agents, queue summary, service directory
- **2 Main Functions** - get_least_loaded_agent(), cleanup_old_data()
- **5 Triggers** - Auto-update for heartbeats and thoughts
- **3 Security Roles** - agent, orchestrator, readonly
- **97 Indexes** - Performance optimization

---

## Files on VMI01

- Schema: `/opt/mcp-schema.sql`
- Deployment script: `/tmp/deploy_mcp_schema.sh`
- Deployment log: `/tmp/schema_deployment.log`

---

## Next Steps

1. Configure SERVER-MCP to use the database
2. Remove test agents: `DELETE FROM mcp_agents WHERE agent_id LIKE 'test-agent-%';`
3. Set up automated backups (cron or pg_cron)
4. Configure remote access (if needed)
5. Set up monitoring dashboards

---

## Support

- Deployment Summary: See `MCP_DEPLOYMENT_SUMMARY.md`
- Credentials: See `MCP_CREDENTIALS.txt` (keep secure!)
- Full Schema: See `/opt/mcp-schema.sql` on VMI01
