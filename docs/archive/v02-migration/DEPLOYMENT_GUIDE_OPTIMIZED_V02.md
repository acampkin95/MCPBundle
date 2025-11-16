# Deployment Guide - MCP Bundle v0.2.1 Optimized Schema

**Version:** 0.2.1 (Optimized)
**Target:** VMI01 (46.250.243.123)
**Date:** 2025-11-08
**Status:** Production-ready for fresh installation

---

## Prerequisites

### 1. System Requirements

- PostgreSQL 16+ installed and running
- 8GB RAM minimum (VMI01 has 8GB)
- 100GB+ storage for database (SSD recommended)
- Network access to VMI01 from deployment machine

### 2. Required Extensions

Verify PostgreSQL has these extensions available:

```bash
# On VMI01
sudo -u postgres psql -c "SELECT * FROM pg_available_extensions WHERE name IN ('uuid-ossp', 'pg_trgm', 'btree_gin', 'pg_stat_statements', 'pgcrypto');"
```

Expected output: All 5 extensions should be listed

### 3. Credentials

From `/Users/alex/Projects/MCP Bundle/MCP_CREDENTIALS.txt`:

- Database: `mcp_ecosystem`
- User: `mcp_admin`
- Password: ``
- Host: 46.250.243.123
- Port: 5432

---

## Pre-Deployment Steps

### 1. Stop MCP Services

```bash
# On VMI01
sudo systemctl stop mcp-orchestrator
sudo systemctl stop perplexity-mcp
sudo systemctl stop it-mcp
```

### 2. Backup Existing Database (if applicable)

```bash
# On VMI01
sudo -u postgres pg_dump -Fc mcp_ecosystem > /tmp/mcp_ecosystem_backup_$(date +%Y%m%d_%H%M%S).dump
```

### 3. Drop Existing Database (fresh install)

```bash
# On VMI01
sudo -u postgres psql -c "DROP DATABASE IF EXISTS mcp_ecosystem;"
sudo -u postgres psql -c "CREATE DATABASE mcp_ecosystem OWNER postgres;"
```

### 4. Configure PostgreSQL

Edit `/etc/postgresql/16/main/postgresql.conf`:

```ini
# Memory Configuration
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 32MB

# Query Planner
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 100

# Write-Ahead Log
wal_buffers = 16MB
min_wal_size = 2GB
max_wal_size = 8GB
checkpoint_completion_target = 0.9

# Parallelism
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_worker_processes = 8

# Partitioning
enable_partition_pruning = on
constraint_exclusion = partition

# Autovacuum
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.02

# Logging
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
```

Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
```

---

## Deployment

### Option 1: Direct Deployment (Recommended)

```bash
# On VMI01
sudo -u postgres psql mcp_ecosystem < /opt/mcp/deployment/SCHEMA_OPTIMIZED_V02_COMPLETE.sql
```

### Option 2: Remote Deployment

```bash
# From local machine
psql "postgresql://mcp_admin:@46.250.243.123:5432/mcp_ecosystem" < /Users/alex/Projects/MCP\ Bundle/deployment/SCHEMA_OPTIMIZED_V02_COMPLETE.sql
```

### Option 3: Interactive Deployment (with validation)

```bash
# On VMI01
sudo -u postgres psql mcp_ecosystem

-- Then run the SQL file
\i /opt/mcp/deployment/SCHEMA_OPTIMIZED_V02_COMPLETE.sql

-- Validate
SELECT * FROM v_project_summary;
```

---

## Post-Deployment Validation

### 1. Verify Table Count

```sql
SELECT
  schemaname,
  COUNT(*) FILTER (WHERE tablename NOT LIKE '%_2025%' AND tablename NOT LIKE 'audit_log%') as base_tables,
  COUNT(*) FILTER (WHERE tablename LIKE '%_2025%') as partition_tables,
  COUNT(*) as total_tables
FROM pg_tables
WHERE schemaname = 'public'
GROUP BY schemaname;
```

**Expected:**

- base_tables: 16
- partition_tables: 12+ (structured_thoughts partitions)
- total_tables: 28+

### 2. Verify Indexes

```sql
SELECT
  schemaname,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY schemaname;
```

**Expected:** 80+ indexes

### 3. Verify Functions

```sql
SELECT
  proname as function_name,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname NOT LIKE 'pg_%'
ORDER BY proname;
```

**Expected functions:**

- archive_old_projects
- get_session_tree
- get_thought_branch
- hard_delete_project
- log_thought_changes
- pick_next_command
- search_thoughts
- soft_delete_project
- update_branch_analytics
- update_branch_staleness
- update_session_metrics
- update_thought_tsvector
- update_updated_at

### 4. Verify Views

```sql
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;
```

**Expected views:**

- v_active_sessions
- v_agent_health
- v_pending_commands
- v_project_summary
- v_thought_timeline

### 5. Verify Materialized Views

```sql
SELECT
  matviewname,
  ispopulated
FROM pg_matviews
WHERE schemaname = 'public';
```

**Expected:**

- mv_project_dashboard (ispopulated: true)

### 6. Verify RLS Policies

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected policies:**

- feedback_access_policy on feedback_signals
- project_access_policy on projects
- session_access_policy on thought_sessions
- thought_access_policy on structured_thoughts

### 7. Test Basic Operations

```sql
-- Test project creation
INSERT INTO projects (project_name, description, tags)
VALUES ('test-project', 'Test project for validation', ARRAY['test', 'validation'])
RETURNING project_id;

-- Test session creation
INSERT INTO thought_sessions (
  project_id,
  agent_id,
  title,
  status
)
VALUES (
  (SELECT project_id FROM projects WHERE project_name = 'test-project'),
  '00000000-0000-0000-0000-000000000001',
  'Test session',
  'active'
)
RETURNING session_id;

-- Test thought creation
INSERT INTO structured_thoughts (
  project_id,
  session_id,
  agent_id,
  stage,
  content,
  order_index,
  quality_score
)
VALUES (
  (SELECT project_id FROM projects WHERE project_name = 'test-project'),
  (SELECT session_id FROM thought_sessions WHERE title = 'Test session'),
  '00000000-0000-0000-0000-000000000001',
  'analysis',
  'This is a test thought to validate the schema deployment',
  1,
  0.85
)
RETURNING thought_id;

-- Test search
SELECT * FROM search_thoughts(
  (SELECT project_id FROM projects WHERE project_name = 'test-project'),
  'test thought',
  0.0,
  10
);

-- Test project summary
SELECT * FROM v_project_summary WHERE project_name = 'test-project';

-- Cleanup test data
DELETE FROM projects WHERE project_name = 'test-project';
```

---

## Configuration

### 1. Create Application User

```sql
-- Connect as postgres superuser
CREATE USER mcp_admin WITH PASSWORD '';
GRANT mcp_app_role TO mcp_admin;

-- Grant superuser-like access (needed for RLS bypass)
ALTER USER mcp_admin WITH BYPASSRLS;

-- Or configure RLS context per agent
-- Application should run: SET app.current_agent_id = '<agent-uuid>';
```

### 2. Configure PgBouncer (Connection Pooling)

Edit `/etc/pgbouncer/pgbouncer.ini`:

```ini
[databases]
mcp_ecosystem = host=localhost port=5432 dbname=mcp_ecosystem

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
```

Add user to `/etc/pgbouncer/userlist.txt`:

```
"mcp_admin" "md5<md5_hash_of_password>"
```

Restart PgBouncer:

```bash
sudo systemctl restart pgbouncer
```

### 3. Setup Scheduled Jobs

#### A. Materialized View Refresh (Hourly)

Create `/etc/cron.d/mcp-mv-refresh`:

```cron
0 * * * * postgres psql -d mcp_ecosystem -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_dashboard;" >> /var/log/mcp/mv-refresh.log 2>&1
```

#### B. Archive Old Projects (Daily)

Create `/etc/cron.d/mcp-archive-projects`:

```cron
0 2 * * * postgres psql -d mcp_ecosystem -c "SELECT archive_old_projects(90);" >> /var/log/mcp/archive.log 2>&1
```

#### C. Update Branch Staleness (Every 15 minutes)

Create `/etc/cron.d/mcp-branch-staleness`:

```cron
*/15 * * * * postgres psql -d mcp_ecosystem -c "SELECT update_branch_staleness();" >> /var/log/mcp/staleness.log 2>&1
```

#### D. Create Future Partitions (Monthly)

Create `/opt/mcp/scripts/create-partitions.sh`:

```bash
#!/bin/bash
# Create partitions for next 3 months

YEAR=$(date -d "+1 month" +%Y)
MONTH=$(date -d "+1 month" +%m)

for i in 1 2 3; do
  START_DATE=$(date -d "$YEAR-$MONTH-01 +$((i-1)) month" +%Y-%m-01)
  END_DATE=$(date -d "$YEAR-$MONTH-01 +$i month" +%Y-%m-01)
  PARTITION_NAME="structured_thoughts_${YEAR}_$(printf %02d $MONTH)"

  psql -d mcp_ecosystem -c "
    CREATE TABLE IF NOT EXISTS $PARTITION_NAME
    PARTITION OF structured_thoughts
    FOR VALUES FROM ('$START_DATE') TO ('$END_DATE');
  "

  YEAR=$(date -d "$END_DATE" +%Y)
  MONTH=$(date -d "$END_DATE" +%m)
done
```

Add to cron:

```cron
0 0 1 * * /opt/mcp/scripts/create-partitions.sh >> /var/log/mcp/partitions.log 2>&1
```

---

## MCP Service Configuration

### 1. Update MCP Orchestrator

Edit `/opt/mcp/mcp-orchestrator/config/database.json`:

```json
{
  "database": {
    "host": "localhost",
    "port": 6432,
    "database": "mcp_ecosystem",
    "user": "mcp_admin",
    "password": "",
    "pool": {
      "min": 2,
      "max": 10
    }
  },
  "features": {
    "row_level_security": true,
    "project_segregation": true,
    "partitioning": true
  }
}
```

### 2. Set Agent Context

In MCP service startup, set the agent context:

```javascript
// Node.js example
await pool.query('SET app.current_agent_id = $1', [agentId]);
```

Or use connection-level setting:

```javascript
const pool = new Pool({
  host: 'localhost',
  port: 6432,
  database: 'mcp_ecosystem',
  user: 'mcp_admin',
  password: '',
  options: `-c app.current_agent_id=${agentId}`,
});
```

---

## Performance Tuning

### 1. Analyze Tables After Initial Load

```sql
ANALYZE projects;
ANALYZE thought_sessions;
ANALYZE structured_thoughts;
ANALYZE branch_analytics;
ANALYZE feedback_signals;
ANALYZE audit_log;
```

### 2. Monitor Query Performance

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slow queries
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries averaging > 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### 3. Monitor Index Usage

```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0  -- Unused indexes
AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 4. Monitor Partition Pruning

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM structured_thoughts
WHERE project_id = '<some-uuid>'
AND created_at >= '2025-01-01'::DATE;
```

Check output for "Partition Pruning" - should only scan relevant partitions.

---

## Monitoring Dashboard

### 1. Schema Health View

```sql
-- Create monitoring view
CREATE OR REPLACE VIEW v_schema_health AS
SELECT
  'Total Projects' as metric,
  COUNT(*)::TEXT as value,
  CASE WHEN COUNT(*) > 1000 THEN 'warning' ELSE 'ok' END as status
FROM projects
UNION ALL
SELECT
  'Active Projects',
  COUNT(*)::TEXT,
  'ok'
FROM projects WHERE status = 'active'
UNION ALL
SELECT
  'Total Thoughts',
  COUNT(*)::TEXT,
  CASE WHEN COUNT(*) > 10000000 THEN 'warning' ELSE 'ok' END
FROM structured_thoughts
UNION ALL
SELECT
  'Total Sessions',
  COUNT(*)::TEXT,
  'ok'
FROM thought_sessions
UNION ALL
SELECT
  'Database Size',
  pg_size_pretty(pg_database_size('mcp_ecosystem')),
  CASE
    WHEN pg_database_size('mcp_ecosystem') > 100*1024*1024*1024 THEN 'warning'  -- 100GB
    ELSE 'ok'
  END
UNION ALL
SELECT
  'Audit Log Size',
  pg_size_pretty(pg_total_relation_size('audit_log')),
  CASE
    WHEN pg_total_relation_size('audit_log') > 10*1024*1024*1024 THEN 'warning'  -- 10GB
    ELSE 'ok'
  END;
```

### 2. Grafana Dashboard (Optional)

Configure Prometheus PostgreSQL Exporter:

```yaml
# /etc/prometheus/postgres_exporter.yml
datasource:
  host: localhost
  port: 5432
  user: mcp_admin
  password:
  database: mcp_ecosystem

queries:
  - name: mcp_project_count
    query: SELECT COUNT(*) as count FROM projects WHERE status = 'active'
    metrics:
      - count: 'Number of active projects'

  - name: mcp_thought_count
    query: SELECT COUNT(*) as count FROM structured_thoughts
    metrics:
      - count: 'Total thoughts'

  - name: mcp_avg_quality
    query: SELECT AVG(quality_score) as avg_quality FROM structured_thoughts WHERE quality_score IS NOT NULL
    metrics:
      - avg_quality: 'Average thought quality'
```

---

## Troubleshooting

### Issue 1: RLS Denying Access

**Symptom:** Queries return empty results or permission denied

**Solution:**

```sql
-- Check current agent context
SHOW app.current_agent_id;

-- Set agent context
SET app.current_agent_id = '<agent-uuid>';

-- Or bypass RLS (superuser only)
ALTER USER mcp_admin WITH BYPASSRLS;
```

### Issue 2: Partition Pruning Not Working

**Symptom:** EXPLAIN shows all partitions scanned

**Solution:**

```sql
-- Ensure constraint_exclusion is enabled
SET constraint_exclusion = partition;

-- Ensure enable_partition_pruning is on
SET enable_partition_pruning = on;

-- Rewrite query with explicit date filter
SELECT * FROM structured_thoughts
WHERE project_id = '<uuid>'
AND created_at >= '2025-01-01'::TIMESTAMPTZ  -- Use TIMESTAMPTZ
AND created_at < '2025-02-01'::TIMESTAMPTZ;
```

### Issue 3: Slow Full-Text Search

**Symptom:** search_thoughts() takes > 1 second

**Solution:**

```sql
-- Verify GIN index exists
SELECT * FROM pg_indexes WHERE indexname LIKE '%tsvector%';

-- Rebuild index if needed
REINDEX INDEX CONCURRENTLY idx_thoughts_fts;

-- Or use project-scoped search (faster)
SELECT * FROM search_thoughts('<project-id>', 'query', 0.7, 50);
```

### Issue 4: Materialized View Not Updating

**Symptom:** mv_project_dashboard shows stale data

**Solution:**

```bash
# Check cron logs
tail -f /var/log/mcp/mv-refresh.log

# Manual refresh
psql -d mcp_ecosystem -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_dashboard;"
```

---

## Rollback Procedure

If deployment fails:

### 1. Restore from Backup

```bash
# On VMI01
sudo -u postgres pg_restore -d mcp_ecosystem /tmp/mcp_ecosystem_backup_<timestamp>.dump
```

### 2. Or Drop and Recreate

```bash
sudo -u postgres psql -c "DROP DATABASE mcp_ecosystem;"
sudo -u postgres psql -c "CREATE DATABASE mcp_ecosystem;"

# Re-run old schema
sudo -u postgres psql mcp_ecosystem < /opt/mcp/deployment/schema/structured-thought-schema.sql
```

---

## Success Criteria

Deployment is successful when:

- [ ] All 16+ base tables created
- [ ] All 80+ indexes created
- [ ] All 13+ functions created
- [ ] All 5+ views created
- [ ] All 4 RLS policies enabled
- [ ] Test project/session/thought created successfully
- [ ] Full-text search returns results
- [ ] v_project_summary view returns data
- [ ] No errors in PostgreSQL logs
- [ ] MCP services connect successfully
- [ ] Queries use partition pruning (verified with EXPLAIN)

---

## Next Steps

1. **Test with real workload:** Create multiple projects, sessions, thoughts
2. **Monitor performance:** Watch pg_stat_statements for slow queries
3. **Setup monitoring:** Configure Grafana dashboards
4. **Document usage:** Add examples for MCP developers
5. **Plan maintenance:** Schedule vacuum, partition cleanup
6. **Backup strategy:** Implement daily backups with rotation

---

## Support

For issues or questions:

- Check PostgreSQL logs: `/var/log/postgresql/postgresql-16-main.log`
- Check MCP service logs: `/var/log/mcp/`
- Review deployment output for errors
- Consult schema documentation: `SCHEMA_OPTIMIZATION_ANALYSIS_V02.md`

**Estimated Deployment Time:** 5-10 minutes

**Estimated Downtime:** 15 minutes (including service restart)

**Risk Level:** LOW (fresh installation, fully reversible)
