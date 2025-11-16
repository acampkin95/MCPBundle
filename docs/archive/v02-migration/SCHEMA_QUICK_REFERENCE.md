# MCP Bundle v0.2.1 Schema Quick Reference

**Quick access guide for developers and operators**

---

## Database Connection

```bash
# Direct connection
psql "postgresql://mcp_admin:@46.250.243.123:5432/mcp_ecosystem"

# Via PgBouncer (pooled)
psql "postgresql://mcp_admin:@localhost:6432/mcp_ecosystem"

# SSH tunnel (from local machine)
ssh -L 5433:localhost:5432 root@46.250.243.123
psql "postgresql://mcp_admin:@localhost:5433/mcp_ecosystem"
```

---

## Core Tables (16)

| Table                   | Purpose                   | Key Columns                                                                          |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `projects`              | Project management        | project_id, project_name, status, owner_agent_id                                     |
| `project_access`        | Multi-agent collaboration | project_id, agent_id, role, can_write, can_delete                                    |
| `mcp_agents`            | Agent registry            | agent_id, agent_type, hostname, capabilities, status                                 |
| `thought_sessions`      | Reasoning sessions        | session_id, project_id, agent_id, status, total_thoughts                             |
| `structured_thoughts`   | Core thought storage      | thought_id, project_id, session_id, stage, content, quality_score                    |
| `branch_analytics`      | Branch metrics            | branch_id, project_id, health, staleness_minutes, average_quality                    |
| `feedback_signals`      | Metacognitive feedback    | signal_id, project_id, signal_type, severity, acknowledged                           |
| `thought_relationships` | Thought graph             | relationship_id, project_id, source_thought_id, target_thought_id, relationship_type |
| `sync_queue`            | Distributed sync          | sync_id, project_id, entity_type, status, payload                                    |
| `command_queue`         | Inter-MCP commands        | job_id, project_id, tool_name, status, priority                                      |
| `audit_log`             | Audit trail (partitioned) | audit_id, project_id, event_type, event_category, details                            |
| `cleanup_jobs`          | Maintenance jobs          | job_id, job_type, status, scheduled_at, items_deleted                                |

---

## Common Operations

### 1. Create Project

```sql
INSERT INTO projects (project_name, description, owner_agent_id, tags)
VALUES (
  'kubernetes-migration',
  'Research and planning for Kubernetes migration',
  (SELECT agent_id FROM mcp_agents WHERE hostname = 'VMI01' AND agent_type = 'mcp-orchestrator'),
  ARRAY['infrastructure', 'kubernetes', 'migration']
)
RETURNING project_id;
```

### 2. Create Session

```sql
INSERT INTO thought_sessions (project_id, agent_id, title, status)
VALUES (
  '<project-uuid>',
  '<agent-uuid>',
  'Architecture design for k8s cluster',
  'active'
)
RETURNING session_id;
```

### 3. Create Thought

```sql
INSERT INTO structured_thoughts (
  project_id,
  session_id,
  agent_id,
  stage,
  content,
  order_index,
  quality_score,
  importance,
  tags
)
VALUES (
  '<project-uuid>',
  '<session-uuid>',
  '<agent-uuid>',
  'analysis',
  'We need to consider three deployment strategies: blue-green, canary, and rolling updates...',
  1,
  0.85,
  'high',
  ARRAY['architecture', 'deployment']
)
RETURNING thought_id;
```

### 4. Search Thoughts (Project-Scoped)

```sql
SELECT * FROM search_thoughts(
  '<project-uuid>',
  'kubernetes deployment',
  0.7,  -- Minimum quality score
  50    -- Limit
);
```

### 5. Get Session Tree (Recursive)

```sql
SELECT * FROM get_session_tree('<root-session-uuid>');
```

### 6. Get Project Summary

```sql
SELECT * FROM v_project_summary WHERE project_id = '<project-uuid>';
```

### 7. Soft Delete Project

```sql
SELECT soft_delete_project(
  '<project-uuid>',
  'Research completed, archiving for 90 days before permanent deletion'
);
```

### 8. Hard Delete Project (Permanent)

```sql
SELECT hard_delete_project('<project-uuid>');
```

### 9. Archive Old Projects

```sql
-- Archive projects inactive for 90+ days
SELECT archive_old_projects(90);
```

### 10. Grant Project Access

```sql
INSERT INTO project_access (project_id, agent_id, role, can_write, can_delete)
VALUES (
  '<project-uuid>',
  '<agent-uuid>',
  'contributor',
  true,
  false
);
```

---

## Key Functions

### Search & Query

```sql
-- Full-text search (project-scoped)
search_thoughts(project_id UUID, query TEXT, min_quality NUMERIC, limit INTEGER)

-- Get all thoughts in branch
get_thought_branch(branch_id VARCHAR)

-- Recursive session tree
get_session_tree(root_session_id UUID)
```

### Cleanup & Maintenance

```sql
-- Soft delete (recoverable)
soft_delete_project(project_id UUID, reason TEXT)

-- Hard delete (permanent)
hard_delete_project(project_id UUID)

-- Auto-archive inactive projects
archive_old_projects(older_than_days INTEGER)

-- Update branch staleness metrics
update_branch_staleness()
```

### Queue Management

```sql
-- Pick next command from queue
pick_next_command(agent_id UUID, capabilities agent_capability[])
```

---

## Key Views

### `v_project_summary`

```sql
SELECT * FROM v_project_summary
WHERE status = 'active'
ORDER BY days_since_activity DESC;
```

**Columns:** project_id, project_name, status, session_count, thought_count, branch_count, avg_quality, last_activity, days_since_activity

### `v_active_sessions`

```sql
SELECT * FROM v_active_sessions
WHERE project_id = '<project-uuid>'
ORDER BY last_activity_at DESC;
```

**Columns:** session_id, project_id, project_name, agent_id, agent_type, title, status, total_thoughts, total_branches, average_quality, inactive_minutes

### `v_thought_timeline`

```sql
SELECT * FROM v_thought_timeline
WHERE project_id = '<project-uuid>'
AND session_id = '<session-uuid>'
ORDER BY order_index;
```

**Columns:** thought_id, project_id, project_name, session_id, session_title, stage, content, order_index, quality_score, importance, branch_health, branch_avg_quality

### `v_agent_health`

```sql
SELECT * FROM v_agent_health
WHERE status = 'active'
ORDER BY heartbeat_age_minutes ASC;
```

**Columns:** agent_id, agent_type, hostname, status, capabilities, last_heartbeat_at, heartbeat_age_minutes, active_sessions, total_thoughts, executing_commands, pending_syncs

### `mv_project_dashboard` (Materialized)

```sql
-- Fast dashboard queries (pre-computed)
SELECT * FROM mv_project_dashboard
WHERE status = 'active'
ORDER BY critical_signals DESC, days_since_activity DESC;

-- Refresh (run hourly via cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_dashboard;
```

**Columns:** project_id, project_name, status, session_count, thought_count, branch_count, avg_quality, last_activity, days_since_activity, critical_signals

---

## Row-Level Security (RLS)

### Set Agent Context

```sql
-- Set current agent (required for RLS)
SET app.current_agent_id = '<agent-uuid>';

-- Verify context
SHOW app.current_agent_id;

-- Clear context (no rows returned)
RESET app.current_agent_id;
```

### Bypass RLS (Superuser Only)

```sql
-- Grant bypass to user
ALTER USER mcp_admin WITH BYPASSRLS;

-- Revoke bypass
ALTER USER mcp_admin WITH NOBYPASSRLS;
```

---

## Partitioning

### Structured Thoughts (Monthly Partitions)

```sql
-- Partition pruning example
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM structured_thoughts
WHERE project_id = '<project-uuid>'
AND created_at >= '2025-01-01'
AND created_at < '2025-02-01';

-- Expected: Only scans structured_thoughts_2025_01 partition
```

### Audit Log (Weekly Partitions)

```sql
-- Create new partition manually
CREATE TABLE audit_log_2025_w53 PARTITION OF audit_log
  FOR VALUES FROM ('2025-12-29') TO ('2026-01-05');

-- Drop old partition (data older than 90 days)
DROP TABLE audit_log_2024_w01;
```

---

## Performance Monitoring

### Slow Query Detection

```sql
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time / 1000 / 60 as total_minutes
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries > 100ms average
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Index Usage

```sql
-- Unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Table Sizes

```sql
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename) - pg_relation_size(schemaname || '.' || tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT LIKE '%_2025%'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

### Schema Health

```sql
SELECT * FROM v_schema_health;
```

---

## Maintenance Tasks

### Daily (Automated via Cron)

```cron
# Archive old projects (2 AM daily)
0 2 * * * postgres psql -d mcp_ecosystem -c "SELECT archive_old_projects(90);"

# Update branch staleness (every 15 min)
*/15 * * * * postgres psql -d mcp_ecosystem -c "SELECT update_branch_staleness();"
```

### Hourly (Automated)

```cron
# Refresh materialized views
0 * * * * postgres psql -d mcp_ecosystem -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_dashboard;"
```

### Monthly (Automated)

```bash
# Create future partitions (1st of each month)
0 0 1 * * /opt/mcp/scripts/create-partitions.sh
```

### Manual (As Needed)

```sql
-- Analyze tables after bulk operations
ANALYZE projects;
ANALYZE thought_sessions;
ANALYZE structured_thoughts;

-- Vacuum to reclaim space
VACUUM ANALYZE structured_thoughts;

-- Reindex if needed
REINDEX TABLE CONCURRENTLY structured_thoughts;
```

---

## Backup & Recovery

### Backup Database

```bash
# Full backup
sudo -u postgres pg_dump -Fc mcp_ecosystem > /backups/mcp_ecosystem_$(date +%Y%m%d_%H%M%S).dump

# Schema only
sudo -u postgres pg_dump -s mcp_ecosystem > /backups/mcp_ecosystem_schema_$(date +%Y%m%d).sql

# Data only
sudo -u postgres pg_dump -a mcp_ecosystem > /backups/mcp_ecosystem_data_$(date +%Y%m%d).sql

# Specific project
sudo -u postgres pg_dump -Fc mcp_ecosystem \
  --table=projects \
  --table=thought_sessions \
  --table=structured_thoughts \
  --where="project_id='<project-uuid>'" \
  > /backups/project_<name>_$(date +%Y%m%d).dump
```

### Restore Database

```bash
# Full restore
sudo -u postgres pg_restore -d mcp_ecosystem /backups/mcp_ecosystem_20251108_140000.dump

# Schema only
sudo -u postgres psql mcp_ecosystem < /backups/mcp_ecosystem_schema_20251108.sql

# Specific table
sudo -u postgres pg_restore -d mcp_ecosystem -t projects /backups/mcp_ecosystem_20251108.dump
```

---

## Troubleshooting

### Issue: Empty Results Despite Data

**Cause:** RLS enabled, no agent context set

**Solution:**

```sql
SET app.current_agent_id = '<agent-uuid>';
-- Or bypass RLS
ALTER USER mcp_admin WITH BYPASSRLS;
```

### Issue: Slow Search Queries

**Cause:** Missing tsvector or outdated statistics

**Solution:**

```sql
-- Rebuild tsvector
UPDATE structured_thoughts SET content_tsvector = to_tsvector('english', content);

-- Update statistics
ANALYZE structured_thoughts;

-- Rebuild GIN index
REINDEX INDEX CONCURRENTLY idx_thoughts_fts;
```

### Issue: Partition Pruning Not Working

**Cause:** Query doesn't include partition key in WHERE clause

**Solution:**

```sql
-- Bad (no partition key)
SELECT * FROM structured_thoughts WHERE project_id = '<uuid>';

-- Good (includes created_at)
SELECT * FROM structured_thoughts
WHERE project_id = '<uuid>'
AND created_at >= '2025-01-01'::TIMESTAMPTZ
AND created_at < '2025-02-01'::TIMESTAMPTZ;
```

### Issue: Materialized View Outdated

**Cause:** Cron job not running or failed

**Solution:**

```bash
# Check cron logs
tail -f /var/log/mcp/mv-refresh.log

# Manual refresh
sudo -u postgres psql -d mcp_ecosystem -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_dashboard;"
```

---

## Useful Queries

### Find Projects by Tag

```sql
SELECT * FROM projects
WHERE tags @> ARRAY['kubernetes'];
```

### Find High-Quality Thoughts

```sql
SELECT
  t.thought_id,
  t.content,
  t.quality_score,
  t.stage,
  s.title as session_title,
  p.project_name
FROM structured_thoughts t
JOIN thought_sessions s ON t.session_id = s.session_id
JOIN projects p ON t.project_id = p.project_id
WHERE t.quality_score >= 0.9
ORDER BY t.quality_score DESC, t.created_at DESC
LIMIT 50;
```

### Find Stale Branches

```sql
SELECT
  ba.branch_id,
  ba.health,
  ba.staleness_minutes,
  ba.thought_count,
  ba.average_quality,
  p.project_name,
  s.title as session_title
FROM branch_analytics ba
JOIN thought_sessions s ON ba.session_id = s.session_id
JOIN projects p ON ba.project_id = p.project_id
WHERE ba.staleness_minutes > 1440  -- 24 hours
AND ba.health IN ('stagnant', 'at_risk')
ORDER BY ba.staleness_minutes DESC;
```

### Find Unacknowledged Critical Signals

```sql
SELECT
  fs.signal_id,
  fs.signal_type,
  fs.severity,
  fs.message,
  p.project_name,
  s.title as session_title,
  fs.created_at
FROM feedback_signals fs
JOIN thought_sessions s ON fs.session_id = s.session_id
JOIN projects p ON fs.project_id = p.project_id
WHERE NOT fs.acknowledged
AND fs.severity IN ('warning', 'critical')
ORDER BY fs.severity DESC, fs.created_at DESC;
```

### Agent Activity Report

```sql
SELECT
  a.agent_id,
  a.hostname,
  a.agent_type,
  COUNT(DISTINCT p.project_id) as owned_projects,
  COUNT(DISTINCT ts.session_id) as active_sessions,
  COUNT(DISTINCT st.thought_id) as thoughts_created,
  MAX(st.created_at) as last_thought_at
FROM mcp_agents a
LEFT JOIN projects p ON a.agent_id = p.owner_agent_id
LEFT JOIN thought_sessions ts ON a.agent_id = ts.agent_id AND ts.status = 'active'
LEFT JOIN structured_thoughts st ON a.agent_id = st.agent_id
GROUP BY a.agent_id, a.hostname, a.agent_type
ORDER BY thoughts_created DESC;
```

---

## Configuration Files

### PostgreSQL Config

```bash
/etc/postgresql/16/main/postgresql.conf
```

Key settings:

- `shared_buffers = 2GB`
- `effective_cache_size = 6GB`
- `work_mem = 32MB`
- `enable_partition_pruning = on`

### PgBouncer Config

```bash
/etc/pgbouncer/pgbouncer.ini
```

Key settings:

- `listen_port = 6432`
- `pool_mode = transaction`
- `max_client_conn = 1000`
- `default_pool_size = 25`

### Cron Jobs

```bash
/etc/cron.d/mcp-*
```

---

## Support Resources

- **Schema Documentation:** `/opt/mcp/deployment/SCHEMA_OPTIMIZATION_ANALYSIS_V02.md`
- **Deployment Guide:** `/opt/mcp/deployment/DEPLOYMENT_GUIDE_OPTIMIZED_V02.md`
- **Comparison:** `/opt/mcp/deployment/SCHEMA_COMPARISON_SUMMARY.md`
- **PostgreSQL Logs:** `/var/log/postgresql/postgresql-16-main.log`
- **MCP Logs:** `/var/log/mcp/`

---

## Quick Tips

1. **Always set agent context** when using RLS: `SET app.current_agent_id = '<uuid>';`
2. **Include created_at in queries** to leverage partition pruning
3. **Use project-scoped search** instead of global search for performance
4. **Refresh materialized views** after bulk data changes
5. **Monitor pg_stat_statements** to identify slow queries
6. **Use soft_delete** before hard_delete for recoverability
7. **Check partition count** monthly and create future partitions
8. **Archive old projects** before deletion to save storage
9. **Grant project access** instead of sharing credentials
10. **Monitor branch staleness** to identify abandoned work

---

**Last Updated:** 2025-11-08
**Schema Version:** v0.2.1 Optimized
