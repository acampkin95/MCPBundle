# MCP Ecosystem Database Migration Package v0.2

## 🎯 Mission

Execute the database migration on VMI01 (46.250.243.123) to upgrade the `mcp_ecosystem` database from v0.1 to v0.2, adding enhanced structured thought capabilities.

## 📦 Package Contents

| File                           | Purpose                    | Usage                       |
| ------------------------------ | -------------------------- | --------------------------- |
| `deploy-migration.sh`          | Automated migration script | Primary execution method    |
| `migrate_v01_to_v02.sql`       | SQL migration statements   | Core migration logic        |
| `validate-migration.sh`        | Comprehensive validation   | Post-migration verification |
| `rollback-migration.sh`        | Emergency rollback tool    | Recovery procedure          |
| `MIGRATION_INSTRUCTIONS.md`    | Step-by-step guide         | Detailed instructions       |
| `MIGRATION_REPORT_TEMPLATE.md` | Report template            | Documentation               |
| `README.md`                    | This file                  | Quick reference             |

## 🚀 Quick Start

### 1. Transfer Package to VMI01

```bash
# From your local machine
tar -czf migration-v02.tar.gz migration-v02/
scp migration-v02.tar.gz dev-admin@46.250.243.123:/tmp/

# On VMI01
cd /opt/mcp
tar -xzf /tmp/migration-v02.tar.gz
cd migration-v02
chmod +x *.sh
```

### 2. Execute Migration

```bash
# Automated approach (recommended)
sudo ./deploy-migration.sh

# The script will guide you through:
# - Pre-flight checks
# - Automatic backup
# - Service management
# - Migration execution
# - Validation
# - Report generation
```

### 3. Validate Results

```bash
# Run validation suite
./validate-migration.sh

# Expected output: All tests PASSED
```

## ⚡ Emergency Procedures

### Rollback

```bash
# If migration fails
./rollback-migration.sh /var/backups/postgresql/[backup-file]
```

### Manual Recovery

```bash
# If automated rollback fails
sudo -u postgres psql -d postgres -c "DROP DATABASE mcp_ecosystem"
sudo -u postgres psql -d postgres -c "CREATE DATABASE mcp_ecosystem OWNER mcp_admin"
sudo -u postgres pg_restore -d mcp_ecosystem /var/backups/postgresql/[backup-file]
```

## 📊 Migration Overview

### What's New in v0.2

**Enhanced Capabilities**:

- 🔍 **Full-text search** across all thoughts
- 🌳 **Branch tracking** for parallel reasoning paths
- 📊 **Feedback signals** for metacognitive monitoring
- 🔗 **Thought relationships** for semantic connections
- 🔄 **Sync queue** for distributed operations

**Technical Changes**:

- 4 new tables
- 5 new functions
- 7 enhanced columns
- 15 performance indexes
- 2 analytical views
- 3 automated triggers

### Database Schema Evolution

```
v0.1 (Current)                    v0.2 (Target)
├── structured_thoughts     →     ├── structured_thoughts (enhanced)
├── thought_sessions        →     ├── thought_sessions (enhanced)
├── mcp_agents             →     ├── mcp_agents
└── schema_version         →     ├── schema_version
                                  ├── thought_branches (NEW)
                                  ├── feedback_signals (NEW)
                                  ├── thought_relationships (NEW)
                                  └── thought_sync_queue (NEW)
```

## ⏱️ Timeline Estimates

| Phase               | Duration       | Notes                     |
| ------------------- | -------------- | ------------------------- |
| Pre-flight checks   | 2-3 min        | Validates environment     |
| Backup creation     | 5-10 min       | Depends on data size      |
| Service shutdown    | 1 min          | Graceful stop             |
| Migration execution | 10-15 min      | Schema changes + indexing |
| Validation          | 3-5 min        | Comprehensive tests       |
| Service restart     | 1-2 min        | Restore operations        |
| **Total**           | **~25-35 min** | Full process              |

## ✅ Success Criteria

The migration is successful when:

- [ ] Schema version shows `0.2.0`
- [ ] All 4 new tables exist and are accessible
- [ ] All 5 new functions are callable
- [ ] Full-text search returns results
- [ ] No data loss from original tables
- [ ] All services restart successfully
- [ ] Validation script shows all PASSED

## 🔐 Security Notes

### Credentials

- **Database**: mcp_ecosystem
- **User**: mcp_admin
- **Password**: Stored in script (production should use env vars)
- **Connection**: localhost:5432

### Best Practices

1. Run as `dev-admin` or `root`
2. Ensure backup is verified before proceeding
3. Keep backup for at least 7 days post-migration
4. Monitor logs for 24 hours after migration

## 📝 Documentation

### Pre-Migration

1. Review `MIGRATION_INSTRUCTIONS.md` completely
2. Ensure all prerequisites are met
3. Schedule maintenance window
4. Notify stakeholders

### During Migration

1. Follow prompts carefully
2. Do not interrupt the process
3. Keep terminal session active
4. Monitor progress in logs

### Post-Migration

1. Complete `MIGRATION_REPORT_TEMPLATE.md`
2. Run validation suite
3. Test application functionality
4. Monitor performance metrics

## 🆘 Troubleshooting

### Common Issues

**PostgreSQL not running**:

```bash
sudo systemctl start postgresql
sudo systemctl status postgresql
```

**Permission denied**:

```bash
sudo chown -R postgres:postgres /var/lib/postgresql
sudo chmod 700 /var/lib/postgresql/16/main
```

**Services won't restart**:

```bash
# Check logs
journalctl -u mcp-orchestrator -n 50
journalctl -u perplexity-mcp -n 50

# Verify database connectivity
PGPASSWORD="..." psql -h localhost -U mcp_admin -d mcp_ecosystem -c "SELECT 1"
```

## 📞 Support

### Log Locations

- Migration: `/var/log/mcp/migration_v02_*.log`
- PostgreSQL: `/var/log/postgresql/postgresql-16-main.log`
- Services: `journalctl -u [service-name]`

### Critical Files

- Backup: `/var/backups/postgresql/mcp_ecosystem_pre_v2_*.backup`
- Report: `/opt/mcp/migration-v02/migration_report_*.md`

## ⚠️ Important Reminders

1. **ALWAYS create and verify backup before migration**
2. **DO NOT delete backup files for at least 7 days**
3. **TEST in staging environment first if available**
4. **MONITOR services for 24 hours post-migration**
5. **DOCUMENT any deviations from expected behavior**

---

**Package Version**: 1.0
**Created**: 2025-11-07
**Target**: MCP Ecosystem v0.2.0
**Compatibility**: PostgreSQL 16+

For detailed instructions, see `MIGRATION_INSTRUCTIONS.md`
