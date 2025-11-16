# MCP Ecosystem Database Migration v0.1 → v0.2

# Execution Instructions for VMI01

## Overview

This package contains all necessary files to upgrade the MCP Ecosystem database from v0.1 to v0.2, adding enhanced structured thought capabilities.

## Target Environment

- **Server**: VMI01 (46.250.243.123)
- **Database**: PostgreSQL 16
- **Database Name**: mcp_ecosystem
- **User**: mcp_admin

## Package Contents

```
migration-v02/
├── deploy-migration.sh           # Automated migration script
├── migrate_v01_to_v02.sql       # SQL migration file
├── validate-migration.sh         # Validation script
├── rollback-migration.sh         # Rollback script
└── MIGRATION_INSTRUCTIONS.md     # This file
```

## Pre-Migration Checklist

- [ ] SSH access to VMI01 as dev-admin or root
- [ ] PostgreSQL 16 is running
- [ ] At least 1GB free disk space in /var/backups/postgresql
- [ ] Database password available
- [ ] No critical operations running on MCP services

## Step-by-Step Execution

### 1. Transfer Files to VMI01

```bash
# From your local machine
scp -r migration-v02/ dev-admin@46.250.243.123:/tmp/

# On VMI01
sudo mv /tmp/migration-v02 /opt/mcp/
sudo chown -R dev-admin:dev-admin /opt/mcp/migration-v02
cd /opt/mcp/migration-v02
chmod +x *.sh
```

### 2. Run Pre-Flight Checks

```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Check database exists
sudo -u postgres psql -lqt | grep mcp_ecosystem

# Check current schema version
PGPASSWORD="" \
  psql -h localhost -U mcp_admin -d mcp_ecosystem \
  -c "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1"
```

### 3. Execute Automated Migration

```bash
# Run the migration script
sudo ./deploy-migration.sh

# The script will:
# 1. Create automatic backup
# 2. Stop MCP services
# 3. Run migration
# 4. Validate results
# 5. Restart services
```

### 4. Manual Migration (if automated fails)

```bash
# Step 1: Create backup
sudo -u postgres pg_dump -Fc mcp_ecosystem > /var/backups/postgresql/mcp_pre_v2_$(date +%Y%m%d).backup

# Step 2: Stop services
sudo systemctl stop mcp-orchestrator perplexity-mcp it-mcp

# Step 3: Run migration
PGPASSWORD="" \
  psql -h localhost -U mcp_admin -d mcp_ecosystem \
  -f migrate_v01_to_v02.sql

# Step 4: Validate (see validation section)

# Step 5: Restart services
sudo systemctl start mcp-orchestrator perplexity-mcp it-mcp
```

## Validation Tests

### Run Validation Script

```bash
./validate-migration.sh
```

### Manual Validation

```bash
# Connect to database
PGPASSWORD="" \
  psql -h localhost -U mcp_admin -d mcp_ecosystem

-- Check new tables
\dt thought_branches
\dt feedback_signals
\dt thought_relationships
\dt thought_sync_queue

-- Check new functions
\df search_thoughts
\df get_thought_branch
\df get_branch_health

-- Test full-text search
SELECT * FROM search_thoughts('test', 10);

-- Check schema version
SELECT * FROM schema_version ORDER BY applied_at DESC LIMIT 1;

-- Exit psql
\q
```

## Expected Results

### New Tables (4)

- `thought_branches` - Branch analytics
- `feedback_signals` - Metacognitive feedback
- `thought_relationships` - Thought connections
- `thought_sync_queue` - Sync management

### New Functions (5)

- `search_thoughts()` - Full-text search
- `get_thought_branch()` - Branch retrieval
- `get_branch_health()` - Health monitoring
- `update_thought_tsvector()` - Search indexing
- `update_branch_analytics()` - Metrics updates

### Enhanced Features

- Full-text search with tsvector
- Branch tracking and analytics
- Feedback signal system
- Thought relationship graph
- Enhanced session metrics

## Rollback Procedure

### Automated Rollback

```bash
./rollback-migration.sh /var/backups/postgresql/<backup-file>
```

### Manual Rollback

```bash
# Stop services
sudo systemctl stop mcp-orchestrator perplexity-mcp it-mcp

# Restore database
sudo -u postgres psql -d mcp_ecosystem -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
sudo -u postgres pg_restore -d mcp_ecosystem /var/backups/postgresql/<backup-file>

# Restart services
sudo systemctl start mcp-orchestrator perplexity-mcp it-mcp
```

## Troubleshooting

### Common Issues

#### 1. Permission Denied

```bash
# Fix ownership
sudo chown -R postgres:postgres /var/lib/postgresql
sudo chmod 700 /var/lib/postgresql/16/main
```

#### 2. Connection Refused

```bash
# Check PostgreSQL is listening
sudo netstat -tlnp | grep 5432
sudo systemctl restart postgresql
```

#### 3. Migration Fails Mid-Way

```bash
# Check transaction status
PGPASSWORD="..." psql -U mcp_admin -d mcp_ecosystem -c "\l"

# If stuck, terminate connections
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='mcp_ecosystem'"
```

#### 4. Services Won't Start After Migration

```bash
# Check service logs
journalctl -u mcp-orchestrator -n 50
journalctl -u perplexity-mcp -n 50
journalctl -u it-mcp -n 50

# Verify database connectivity
PGPASSWORD="..." psql -h localhost -U mcp_admin -d mcp_ecosystem -c "SELECT 1"
```

## Post-Migration Tasks

### 1. Test New Features

```sql
-- Test full-text search
SELECT * FROM search_thoughts('analysis', 20);

-- Check branch health
SELECT * FROM get_branch_health();

-- View thought timeline
SELECT * FROM v_thought_timeline_v2 LIMIT 10;

-- Check branch summary
SELECT * FROM v_branch_summary;
```

### 2. Monitor Performance

```bash
# Watch PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Check index usage
PGPASSWORD="..." psql -U mcp_admin -d mcp_ecosystem \
  -c "SELECT schemaname, tablename, indexname, idx_scan
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC"
```

### 3. Update Service Configurations

If services need the new features, update their configuration files:

```bash
# Update environment variables if needed
sudo nano /etc/mcp-orchestrator/config.env
sudo nano /etc/perplexity-mcp/config.env
sudo nano /etc/it-mcp/config.env

# Reload services
sudo systemctl daemon-reload
sudo systemctl restart mcp-orchestrator perplexity-mcp it-mcp
```

## Support Information

### Log Locations

- Migration log: `/var/log/mcp/migration_v02_*.log`
- PostgreSQL log: `/var/log/postgresql/postgresql-16-main.log`
- Service logs: `journalctl -u <service-name>`

### Backup Locations

- Database backups: `/var/backups/postgresql/`
- Migration report: `/opt/mcp/migration-v02/migration_report_*.md`

### Contact

For issues during migration:

1. Check the troubleshooting section
2. Review logs for specific errors
3. Ensure rollback procedure is available
4. Document any errors for support

## Success Criteria

The migration is successful when:

- [x] All 4 new tables exist
- [x] All 5 new functions are callable
- [x] Schema version shows 0.2.0
- [x] No data loss from original tables
- [x] Services restart successfully
- [x] Full-text search returns results

---

**Important**: Keep the backup file safe until the system has been running stable for at least 24 hours post-migration.
