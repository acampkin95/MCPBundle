# Backup Restore Guide

## Overview

This guide covers restoring data from Wasabi S3 backups. Read carefully before performing any restore operations.

## Important Warnings

⚠️ **BEFORE YOU RESTORE:**
1. Restoring can overwrite current data - this is **IRREVERSIBLE**
2. Always test restores on non-production systems first
3. Create a snapshot/backup of current state before restoring
4. Verify backup integrity before restoring
5. Ensure you have sufficient disk space

## Quick Reference

| Restore Type | Command | Use Case |
|--------------|---------|----------|
| Interactive Wizard | `restore-from-s3.sh` | Guided restore process |
| Specific Path | `restore-from-s3.sh --path /etc` | Restore single directory |
| Database Only | `restore-from-s3.sh --databases` | Restore PostgreSQL/Redis |
| Dry Run | `restore-from-s3.sh --dry-run` | Test without making changes |

## Interactive Restore Wizard

The easiest way to restore is using the interactive wizard:

```bash
sudo /opt/backup-scripts/restore-from-s3.sh
```

### Wizard Steps:

1. **Select Backup Date**
   - Shows list of available backups
   - Choose specific date or 'latest'

2. **Choose Restore Type**
   - Full system restore (dangerous)
   - Selective restore (specific paths)
   - Database restore only
   - Configuration files only

3. **Confirm Action**
   - Review what will be restored
   - Confirm before proceeding

4. **Restore Progress**
   - Download from S3
   - Verify integrity
   - Extract files
   - Report completion

## Selective Restore Examples

### Restore Configuration Files (/etc)

```bash
# Interactive selection
sudo /opt/backup-scripts/restore-from-s3.sh

# Then select option 4 "Configuration files only"
```

**What happens:**
1. Downloads /etc archive from S3
2. Creates backup: `/etc.backup-YYYYMMDD-HHMMSS`
3. Offers to restore to original location or temp directory
4. Extracts files preserving permissions

### Restore MCP Applications

```bash
sudo /opt/backup-scripts/restore-from-s3.sh

# Select option 2 "Selective restore"
# Choose path 2: /opt/mcp
```

**Recommendation:** Restore to temporary location first, verify, then move:

```bash
# Restore to temp
# (wizard will ask for restore location)
# Choose: /var/restore/extracted

# Verify
ls -la /var/restore/extracted/opt/mcp/

# Copy specific files
cp -a /var/restore/extracted/opt/mcp/config.json /opt/mcp/

# Or replace entire directory (after stopping services)
systemctl stop mcp-*
mv /opt/mcp /opt/mcp.old
mv /var/restore/extracted/opt/mcp /opt/mcp
systemctl start mcp-*
```

### Restore User Home Directories

```bash
# Restore specific user
sudo /opt/backup-scripts/restore-from-s3.sh

# Select: Selective restore
# Choose: /home

# Extract to temp location
# Then copy specific user:
cp -a /var/restore/extracted/home/username /home/
chown -R username:username /home/username
```

## Database Restore

### PostgreSQL Restore

#### Full Database Restore

```bash
# Run restore wizard
sudo /opt/backup-scripts/restore-from-s3.sh

# Select option 3: "Database restore only"
```

**Process:**
1. Downloads database dumps from S3
2. Lists available databases
3. Asks confirmation for each database
4. Drops existing database (if confirmed)
5. Creates new database
6. Restores from dump
7. Restores global settings (roles, permissions)

#### Manual PostgreSQL Restore

```bash
# 1. Download backup
mkdir -p /tmp/db-restore
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/YYYY-MM-DD/databases/postgresql/ \
  /tmp/db-restore/ --config /root/.config/rclone/rclone.conf

# 2. Decompress
cd /tmp/db-restore
zstd -d *.zst

# 3. List contents
sudo -u postgres pg_restore --list mcp_ecosystem_*.dump

# 4. Drop existing database (CAREFUL!)
sudo -u postgres psql -c "DROP DATABASE mcp_ecosystem;"

# 5. Create new database
sudo -u postgres psql -c "CREATE DATABASE mcp_ecosystem;"

# 6. Restore
sudo -u postgres pg_restore -d mcp_ecosystem mcp_ecosystem_*.dump

# 7. Verify
sudo -u postgres psql mcp_ecosystem -c "\dt"
```

#### Selective Table Restore

```bash
# Restore specific tables only
sudo -u postgres pg_restore -d mcp_ecosystem \
  --table=users \
  --table=sessions \
  mcp_ecosystem_*.dump
```

#### Point-in-Time Recovery

```bash
# Restore database to specific state
# Note: Requires WAL archiving (not enabled by default)

# 1. Stop PostgreSQL
systemctl stop postgresql

# 2. Restore base backup
# 3. Create recovery.conf with target time
# 4. Start PostgreSQL
# 5. Verify recovery
```

### Redis Restore

```bash
# 1. Download Redis dump
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/YYYY-MM-DD/databases/redis/ \
  /tmp/redis-restore/ --config /root/.config/rclone/rclone.conf

# 2. Decompress
cd /tmp/redis-restore
zstd -d dump_*.rdb.zst

# 3. Stop Redis
systemctl stop redis-server

# 4. Backup current dump
cp /var/lib/redis/dump.rdb /var/lib/redis/dump.rdb.backup-$(date +%Y%m%d)

# 5. Replace dump
cp dump_*.rdb /var/lib/redis/dump.rdb
chown redis:redis /var/lib/redis/dump.rdb
chmod 640 /var/lib/redis/dump.rdb

# 6. Start Redis
systemctl start redis-server

# 7. Verify
redis-cli PING
redis-cli DBSIZE
```

## Configuration Restore

### Restore /etc from Git History

```bash
# View configuration history
cd /etc
git log --oneline -20

# Restore specific file from history
git show COMMIT_HASH:/etc/nginx/nginx.conf > /etc/nginx/nginx.conf.restored

# Restore entire /etc from git bundle
sudo /opt/backup-scripts/etc-git-tracker.sh --restore
```

### Restore System Configuration

```bash
# Restore systemd services
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/YYYY-MM-DD/files/etc_*.tar.zst \
  /tmp/ --config /root/.config/rclone/rclone.conf

# Extract to temp
zstd -dc /tmp/etc_*.tar.zst | tar -xf - -C /tmp/restore/

# Copy specific configs
cp /tmp/restore/etc/systemd/system/myservice.service /etc/systemd/system/
systemctl daemon-reload
```

## Full System Restore

⚠️ **DANGER ZONE** - Only use for disaster recovery

### Prerequisites

1. Fresh OS installation (same version)
2. Network configured
3. SSH access
4. rclone installed and configured

### Procedure

```bash
# 1. Install dependencies
apt update
apt install -y rclone zstd postgresql redis-server tar jq

# 2. Configure rclone
mkdir -p /root/.config/rclone
cat > /root/.config/rclone/rclone.conf << 'EOF'
[wasabi-vmi]
type = s3
provider = Wasabi
access_key_id = YOUR_ACCESS_KEY
secret_access_key = YOUR_SECRET_KEY
region = ap-southeast-2
endpoint = s3.ap-southeast-2.wasabisys.com
EOF

# 3. Download restore scripts
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/scripts/ \
  /opt/backup-scripts/ --config /root/.config/rclone/rclone.conf

chmod +x /opt/backup-scripts/*.sh

# 4. Run full restore
/opt/backup-scripts/restore-from-s3.sh --full --backup-date YYYY-MM-DD

# 5. Follow prompts and confirm each step

# 6. Restore databases
/opt/backup-scripts/restore-from-s3.sh --databases --backup-date YYYY-MM-DD

# 7. Verify services
systemctl status postgresql
systemctl status redis-server
systemctl status mcp-*

# 8. Check applications
curl http://localhost:8080/health

# 9. Restore SSL certificates if needed
# 10. Update DNS if IP changed
# 11. Test all functionality
```

## Verification After Restore

### Check File Integrity

```bash
# Compare checksums
cd /var/restore/extracted
sha256sum -c SHA256SUMS

# Compare with S3
rclone check /var/restore/extracted \
  wasabi-vmi:vmibackups/$(hostname -s)/YYYY-MM-DD/ \
  --config /root/.config/rclone/rclone.conf
```

### Verify Databases

```bash
# PostgreSQL
sudo -u postgres psql mcp_ecosystem -c "\dt"
sudo -u postgres psql mcp_ecosystem -c "SELECT COUNT(*) FROM users;"

# Redis
redis-cli INFO
redis-cli DBSIZE
redis-cli GET some-known-key
```

### Verify Services

```bash
# Check all services are running
systemctl status postgresql
systemctl status redis-server
systemctl status nginx
systemctl status mcp-*

# Check logs for errors
journalctl -xe --no-pager | grep -i error
```

### Verify Applications

```bash
# Test MCP services
curl http://localhost:3000/health

# Test API endpoints
curl http://localhost:8080/api/status

# Check database connections
# (depends on your applications)
```

## Troubleshooting

### Restore Fails to Download

```bash
# Check S3 connectivity
rclone lsd wasabi-vmi:vmibackups --config /root/.config/rclone/rclone.conf

# Check credentials
cat /root/.config/rclone/rclone.conf

# Test with different backup date
rclone ls wasabi-vmi:vmibackups/$(hostname -s)/ \
  --config /root/.config/rclone/rclone.conf
```

### Extraction Fails

```bash
# Check disk space
df -h

# Test decompression manually
zstd -t backup-file.tar.zst

# Extract to temp directory first
mkdir -p /tmp/test-restore
zstd -dc backup-file.tar.zst | tar -xf - -C /tmp/test-restore
```

### Database Restore Fails

```bash
# Check PostgreSQL is running
systemctl status postgresql

# Check database exists
sudo -u postgres psql -l

# Check dump file integrity
sudo -u postgres pg_restore --list dump-file.dump

# Try verbose restore
sudo -u postgres pg_restore -v -d dbname dump-file.dump
```

### Permission Issues

```bash
# Restore with correct permissions
tar --same-permissions --same-owner -xzf backup.tar.gz

# Fix ownership after restore
chown -R user:group /restored/path

# Fix SELinux contexts (if applicable)
restorecon -R /restored/path
```

## Best Practices

1. **Test Before Production**
   - Always restore to test environment first
   - Verify data integrity
   - Test all functionality

2. **Document Custom Steps**
   - Note any manual configurations
   - Document service dependencies
   - Keep restore procedures updated

3. **Practice Regular Restore Drills**
   - Monthly restore tests
   - Different scenarios (partial, full)
   - Time the restore process

4. **Maintain Multiple Backup Copies**
   - Keep backups in multiple locations
   - Test restores from different dates
   - Verify backup rotation

5. **Verify Before Proceeding**
   - Check backup integrity
   - Verify sufficient disk space
   - Ensure compatible OS version

## Recovery Time Objectives

| Restore Type | Estimated Time | Downtime |
|--------------|----------------|----------|
| Single file | 5-10 minutes | None |
| Database | 15-30 minutes | Service downtime |
| Configuration | 10-20 minutes | Service restart |
| Full application | 1-2 hours | Full downtime |
| Full system | 4-8 hours | Complete rebuild |

## Emergency Contacts

**For restore assistance:**
- Primary: acampkinpersonnal@gmail.com
- Documentation: /opt/backup-scripts/docs/
- Logs: /var/log/backups/

**Escalation:**
1. Check restore logs
2. Review DISASTER_RECOVERY.md
3. Contact system administrator
4. If data loss critical, contact Wasabi support
