# Backup Restore Procedures

**System**: Restic v0.17.3  
**Last Updated**: 2025-11-13

---

## Prerequisites

Before starting any restore operation, ensure you have:

- ✅ Restic encryption password (from `/backup/preserved/RESTIC_PASSWORD.txt`)
- ✅ Wasabi S3 credentials
- ✅ Access to the node being restored (or VMI02D for remote restore)
- ✅ Sufficient disk space for restored data

---

## Quick Restore - Individual Files

### Step 1: List Available Snapshots

```bash
# On the source node (or any node with access to that repository)
source /opt/backup/restic-env.sh
restic snapshots

# Example output:
# ID        Time                 Host         Tags        Paths
# 4c89563e  2025-11-13 19:44:35  acdev-vmi03  daily       /etc /opt/mcp /root ...
```

### Step 2: Browse Snapshot Contents

```bash
# List files in a snapshot
restic ls <snapshot-id>

# Example:
restic ls 4c89563e

# Search for specific file
restic ls 4c89563e | grep filename
```

### Step 3: Restore Specific Files

```bash
# Using helper script
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path

# Or manually
restic restore <snapshot-id> --target /restore/path

# Restore specific path only
restic restore <snapshot-id> --target /restore/path --include /etc/nginx
```

---

## Full System Restore

### Scenario: Complete System Rebuild

**Use Case**: Server crashed, need to rebuild from backup

### Step 1: Prepare New/Rebuilt System

```bash
# 1. Install base OS (Debian/Ubuntu)
# 2. Install Restic
wget https://github.com/restic/restic/releases/download/v0.17.3/restic_0.17.3_linux_amd64.bz2
bunzip2 restic_0.17.3_linux_amd64.bz2
chmod +x restic_0.17.3_linux_amd64
mv restic_0.17.3_linux_amd64 /usr/local/bin/restic

# 3. Create restore directory
mkdir -p /opt/backup/restore
cd /opt/backup/restore
```

### Step 2: Configure Access to Repository

```bash
# Create environment file
cat > /tmp/restore-env.sh << 'ENVEOF'
export RESTIC_REPOSITORY="s3:s3.ap-southeast-2.wasabisys.com/vmibackups/<HOSTNAME>"
export RESTIC_PASSWORD="<encryption-password>"
export AWS_ACCESS_KEY_ID="<wasabi-access-key>"
export AWS_SECRET_ACCESS_KEY="<wasabi-secret-key>"
export AWS_DEFAULT_REGION="ap-southeast-2"
ENVEOF

# Replace <HOSTNAME>, <encryption-password>, <wasabi-access-key>, <wasabi-secret-key>
# with actual values from /backup/preserved/ on VMI02D

# Load environment
source /tmp/restore-env.sh
```

### Step 3: Verify Repository Access

```bash
# List snapshots
restic snapshots

# If successful, you'll see list of available backups
```

### Step 4: Identify Snapshot to Restore

```bash
# Show latest snapshot
restic snapshots --latest 1

# Show snapshots from specific date
restic snapshots --host <hostname>

# Note the snapshot ID (e.g., 4c89563e)
```

### Step 5: Restore System

```bash
# Restore to root filesystem (USE WITH CAUTION!)
cd /
restic restore <snapshot-id> --target /

# OR safer: Restore to temporary location first
mkdir -p /mnt/restore
restic restore <snapshot-id> --target /mnt/restore

# Then manually copy files:
# cp -a /mnt/restore/etc/* /etc/
# cp -a /mnt/restore/opt/* /opt/
# etc.
```

### Step 6: Post-Restore Steps

```bash
# 1. Reinstall Restic and backup scripts
cp -a /mnt/restore/opt/backup /opt/

# 2. Restore cron jobs
crontab -l  # Check current crontab
crontab /mnt/restore/var/spool/cron/crontabs/root  # If backed up

# 3. Restore service configurations
systemctl daemon-reload

# 4. Restart services
systemctl restart <services>

# 5. Verify system
df -h
systemctl status
```

---

## Disaster Recovery Scenarios

### DR1: Single File Recovery

**Scenario**: Accidentally deleted `/etc/nginx/nginx.conf`

```bash
# 1. Find snapshot
source /opt/backup/restic-env.sh
restic snapshots --latest 5

# 2. Restore specific file
restic restore <snapshot-id> \
    --target /tmp/restore \
    --include /etc/nginx/nginx.conf

# 3. Copy back
cp /tmp/restore/etc/nginx/nginx.conf /etc/nginx/
systemctl restart nginx
```

### DR2: Database Recovery

**Scenario**: PostgreSQL database corruption on VMI01

```bash
# 1. Stop PostgreSQL
systemctl stop postgresql

# 2. Backup current (corrupted) data
mv /var/lib/postgresql /var/lib/postgresql.corrupted

# 3. Restore from backup
source /opt/backup/restic-env.sh
restic restore <snapshot-id> \
    --target / \
    --include /var/lib/postgresql

# 4. Fix permissions
chown -R postgres:postgres /var/lib/postgresql

# 5. Start PostgreSQL
systemctl start postgresql

# 6. Verify
sudo -u postgres psql -c "\l"
```

### DR3: Complete Node Rebuild

**Scenario**: VMI01 hardware failure, rebuild on new server

See "Full System Restore" above, then:

```bash
# Additional steps for VMI01 specifically:

# 1. Restore MCP services
systemctl status mcp-*

# 2. Restore PostgreSQL
systemctl status postgresql

# 3. Update IP addresses if changed
# Edit /etc/network/interfaces or /etc/netplan/

# 4. Rejoin VPN network
# Copy /etc/wireguard/ from backup

# 5. Test connectivity
ping 10.0.0.2
ping 10.0.0.3
```

---

## Point-in-Time Recovery

### Restore to Specific Date/Time

```bash
# List snapshots by date
restic snapshots --compact

# Restore snapshot from specific time
restic restore <snapshot-id> --target /restore/

# Example: Restore from yesterday 5AM
restic snapshots | grep "2025-11-12 21:"
restic restore <that-snapshot-id> --target /restore/
```

---

## Remote Restore (from VMI02D)

### Restore VMI01 Files from VMI02D

```bash
# On VMI02D, set environment for VMI01 repository
export RESTIC_REPOSITORY="s3:s3.ap-southeast-2.wasabisys.com/vmibackups/ACDEV-VMI01"
export RESTIC_PASSWORD="<password-from-/backup/preserved/>"
export AWS_ACCESS_KEY_ID="<from-wasabi-creds>"
export AWS_SECRET_ACCESS_KEY="<from-wasabi-creds>"
export AWS_DEFAULT_REGION="ap-southeast-2"

# List VMI01 snapshots
restic snapshots

# Restore to local directory
mkdir -p /tmp/vmi01-restore
restic restore <snapshot-id> --target /tmp/vmi01-restore

# Copy to VMI01
scp -r /tmp/vmi01-restore/path/to/file root@10.0.0.1:/path/to/destination
```

---

## Verification

### After Restore - Verification Checklist

- [ ] Files restored to correct location
- [ ] File permissions correct (`ls -la`)
- [ ] File ownership correct
- [ ] Services restarted and running
- [ ] Application functionality verified
- [ ] Logs show no errors
- [ ] Backup system re-enabled

---

## Emergency Contacts

If restore fails or you need assistance:

1. Check [OPERATIONS.md](OPERATIONS.md) for troubleshooting
2. Review Restic docs: https://restic.readthedocs.io/en/latest/050_restore.html
3. Check backup logs: `/opt/backup/logs/`

---

## Important Notes

⚠️ **CRITICAL**:
- Test restores regularly (monthly recommended)
- Always restore to temporary location first when possible
- Verify restored data before overwriting production
- Keep encryption password secure and backed up
- Document any restore procedures specific to your applications

📝 **Best Practices**:
- Take a backup before doing a restore (if source still exists)
- Use `--dry-run` flag to test restore without actually restoring
- Verify snapshot integrity before restore: `restic check`
- Keep restore procedure documented and tested
