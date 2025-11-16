# Duplicati Restore Procedures - Complete Guide

**Backup Server**: VMI02D (46.250.241.70)
**Web GUI**: http://46.250.241.70:8200
**Storage**: Wasabi S3 (vmibackups bucket)

---

## Table of Contents

1. [Quick Restore](#quick-restore)
2. [Web GUI Restore](#web-gui-restore)
3. [CLI Restore](#cli-restore)
4. [Emergency Restore](#emergency-restore)
5. [Database Restore](#database-restore)
6. [Docker Volume Restore](#docker-volume-restore)
7. [Full System Restore](#full-system-restore)
8. [Troubleshooting](#troubleshooting)

---

## Quick Restore

### Single File Restore (5 minutes)

**Web GUI Method**:
1. Open http://46.250.241.70:8200
2. Click backup job name (e.g., "vmi01-daily")
3. Click "Restore" button
4. Select restore date/time from timeline
5. Browse file tree and check file
6. Click "Restore" and choose destination
7. Click "Restore" to execute

**CLI Method**:
```bash
# On VMI02D
source /backup/config/encryption-passphrase.txt

duplicati-cli restore \
  s3://vmibackups/vmi01/daily/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE" \
  --file="/opt/mcp/config.json" \
  --restore-path=/tmp/restored-files/
```

---

## Web GUI Restore

### Step-by-Step Web GUI Restore

#### Step 1: Access Web Interface

```bash
# Open in browser
http://46.250.241.70:8200
```

#### Step 2: Select Backup Job

1. Main dashboard shows all backup jobs
2. Click on the job containing the data you need
   - Example: "vmi01-daily" for VMI01 daily backups
   - Example: "vmi03-6hourly" for recent VMI03 backups

#### Step 3: Choose Restore Point

1. Click "Restore" button (top right)
2. View timeline of available backup versions
3. Select date/time to restore from:
   - **Most Recent**: Latest backup
   - **Specific Date**: Click date on timeline
   - **Before Event**: Choose backup before incident

#### Step 4: Browse and Select Files

1. **File Browser** displays backup contents
2. Navigate directory tree
3. **Select files/folders** to restore:
   - Check individual files
   - Check entire directories
   - Use search to find files
   - Preview file metadata (size, date)

#### Step 5: Choose Restore Location

**Option A: Original Location** (In-place restore)
- Restores files to original paths
- **Warning**: Overwrites existing files
- Use for: Disaster recovery

**Option B: Alternate Location** (Safe testing)
- Restores to different path
- Safe for testing/verification
- Example: `/tmp/restore/`
- Use for: Testing, selective recovery

**Option C: Download** (Local copy)
- Downloads files to your computer
- Use for: Inspecting files, offline analysis

#### Step 6: Configure Restore Options

**Overwrite Settings**:
- Overwrite: Replace existing files
- Skip: Keep existing, only restore missing
- Rename: Add suffix to restored files

**Permissions**:
- Restore original permissions
- Use current user permissions

**Timestamp**:
- Preserve original timestamps
- Use current timestamp

#### Step 7: Execute Restore

1. Click "Restore" button
2. Monitor progress bar
3. View restore log
4. Verify completion status

#### Step 8: Verify Restored Files

```bash
# On target system
ls -lah /path/to/restored/files
diff /restored/file /original/file
md5sum /restored/file /original/file
```

---

## CLI Restore

### Basic CLI Restore Commands

#### List Available Backups

```bash
# List all backup versions
duplicati-cli list \
  s3://vmibackups/vmi01/daily/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE"
```

#### List Files in Specific Backup

```bash
# List files at specific date
duplicati-cli list-files \
  s3://vmibackups/vmi01/daily/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE" \
  --time="2025-11-12"
```

#### Restore Specific File

```bash
# Restore single file
duplicati-cli restore \
  s3://vmibackups/vmi01/daily/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE" \
  --file="/etc/nginx/nginx.conf" \
  --restore-path=/tmp/restored/
```

#### Restore Entire Directory

```bash
# Restore directory
duplicati-cli restore \
  s3://vmibackups/vmi03/daily/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE" \
  --file="/opt/thehive/" \
  --restore-path=/opt/thehive-restored/
```

#### Restore to Specific Date

```bash
# Restore from specific backup version
duplicati-cli restore \
  s3://vmibackups/vmi01/weekly/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE" \
  --time="2025-11-05" \
  --restore-path=/opt/restored/
```

---

## Emergency Restore

### Scenario: Complete System Failure

**Requirements**:
- New/rebuilt system
- Network access to Wasabi S3
- Duplicati installed
- Encryption passphrase

#### Step 1: Install Duplicati on New System

```bash
# On new system
wget https://github.com/duplicati/duplicati/releases/download/v2.0.7.1/duplicati_2.0.7.1_all.deb
dpkg -i duplicati_2.0.7.1_all.deb
apt-get install -f -y
```

#### Step 2: Configure AWS CLI

```bash
mkdir -p /root/.aws
cat > /root/.aws/credentials << EOF
[wasabi]
aws_access_key_id = WCZLQETBK6VXN55WECMQ
aws_secret_access_key = fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
EOF

cat > /root/.aws/config << EOF
[profile wasabi]
region = ap-southeast-2
s3 =
    endpoint_url = https://s3.ap-southeast-2.wasabisys.com
EOF
```

#### Step 3: List Available Backups

```bash
# List backup sets
aws s3 ls s3://vmibackups/ --recursive --endpoint-url https://s3.ap-southeast-2.wasabisys.com --profile wasabi | grep vmi01
```

#### Step 4: Restore System

```bash
# Get encryption passphrase (from secure storage)
PASSPHRASE="<your-encryption-passphrase>"

# Restore full system from monthly backup
duplicati-cli restore \
  s3://vmibackups/vmi01/monthly/ \
  --auth-username=WCZLQETBK6VXN55WECMQ \
  --auth-password=fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD \
  --s3-server-name=s3.ap-southeast-2.wasabisys.com \
  --passphrase="$PASSPHRASE" \
  --restore-path=/
```

#### Step 5: Verify and Restart Services

```bash
# Check restored files
ls -lah /opt/mcp/
ls -lah /etc/

# Restart services
systemctl daemon-reload
systemctl restart <services>
```

---

## Database Restore

### PostgreSQL Restore from Backup

#### Method 1: Restore Database Files (Offline)

```bash
# Stop PostgreSQL
systemctl stop postgresql

# Restore database directory
duplicati-cli restore \
  s3://vmibackups/vmi01/daily/ \
  --passphrase="$PASSPHRASE" \
  --file="/var/lib/postgresql/" \
  --restore-path=/var/lib/postgresql-restored/

# Replace current data
mv /var/lib/postgresql /var/lib/postgresql.old
mv /var/lib/postgresql-restored/postgresql /var/lib/postgresql
chown -R postgres:postgres /var/lib/postgresql

# Start PostgreSQL
systemctl start postgresql
```

#### Method 2: Restore from SQL Dump (Online)

```bash
# Restore dump file
duplicati-cli restore \
  s3://vmibackups/vmi01/daily/ \
  --passphrase="$PASSPHRASE" \
  --file="/backup/postgres-dump.sql" \
  --restore-path=/tmp/

# Restore database
psql -U postgres < /tmp/postgres-dump.sql
```

---

## Docker Volume Restore

### Restore Docker Volumes (VMI03)

#### Step 1: Stop Containers

```bash
# On VMI03
cd /opt/thehive
docker-compose down
```

#### Step 2: Restore Volume Data

```bash
# Restore TheHive data volume
duplicati-cli restore \
  s3://vmibackups/vmi03/daily/ \
  --passphrase="$PASSPHRASE" \
  --file="/var/lib/docker/volumes/thehive_thehive-data/" \
  --restore-path=/var/lib/docker/volumes/thehive_thehive-data-restored/

# Restore Elasticsearch data
duplicati-cli restore \
  s3://vmibackups/vmi03/daily/ \
  --passphrase="$PASSPHRASE" \
  --file="/var/lib/docker/volumes/thehive_elasticsearch-data/" \
  --restore-path=/var/lib/docker/volumes/thehive_elasticsearch-data-restored/
```

#### Step 3: Replace Volumes

```bash
# Backup current volumes
mv /var/lib/docker/volumes/thehive_thehive-data /var/lib/docker/volumes/thehive_thehive-data.old
mv /var/lib/docker/volumes/thehive_elasticsearch-data /var/lib/docker/volumes/thehive_elasticsearch-data.old

# Move restored data
mv /var/lib/docker/volumes/thehive_thehive-data-restored/thehive_thehive-data /var/lib/docker/volumes/
mv /var/lib/docker/volumes/thehive_elasticsearch-data-restored/thehive_elasticsearch-data /var/lib/docker/volumes/
```

#### Step 4: Restart Containers

```bash
cd /opt/thehive
docker-compose up -d
```

---

## Full System Restore

### Complete Server Recovery (Bare Metal)

**Estimated Time**: 4-6 hours

#### Phase 1: OS Installation (1 hour)

1. Install Ubuntu 24.04 LTS
2. Configure network (same IP)
3. Update system: `apt-get update && apt-get upgrade`
4. Install base packages

#### Phase 2: Install Duplicati (15 minutes)

```bash
# Install Duplicati
wget https://github.com/duplicati/duplicati/releases/download/v2.0.7.1/duplicati_2.0.7.1_all.deb
dpkg -i duplicati_2.0.7.1_all.deb
apt-get install -f -y

# Configure AWS CLI for Wasabi
pip3 install awscli
mkdir -p /root/.aws
# (Add credentials as shown above)
```

#### Phase 3: Restore Critical Data (2-3 hours)

```bash
# Get encryption passphrase
PASSPHRASE="<from-secure-storage>"

# Restore system configuration
duplicati-cli restore s3://vmibackups/vmi01/monthly/ \
  --passphrase="$PASSPHRASE" \
  --file="/etc/" \
  --restore-path=/etc-restored/

# Restore applications
duplicati-cli restore s3://vmibackups/vmi01/monthly/ \
  --passphrase="$PASSPHRASE" \
  --file="/opt/" \
  --restore-path=/opt/

# Restore home directories
duplicati-cli restore s3://vmibackups/vmi01/monthly/ \
  --passphrase="$PASSPHRASE" \
  --file="/root/" \
  --restore-path=/root/

# Restore databases
duplicati-cli restore s3://vmibackups/vmi01/monthly/ \
  --passphrase="$PASSPHRASE" \
  --file="/var/lib/postgresql/" \
  --restore-path=/var/lib/postgresql/
```

#### Phase 4: Restore System Configuration (30 minutes)

```bash
# Review and selectively apply /etc configs
rsync -av /etc-restored/ /etc/

# Fix permissions
chown -R postgres:postgres /var/lib/postgresql
chmod 700 /var/lib/postgresql

# Reload systemd
systemctl daemon-reload
```

#### Phase 5: Start Services (30 minutes)

```bash
# Start databases
systemctl start postgresql

# Start applications
systemctl start <application-services>

# Verify services
systemctl status postgresql
systemctl status <other-services>
```

#### Phase 6: Verification (1 hour)

```bash
# Test database connectivity
psql -U postgres -c "SELECT version();"

# Test application endpoints
curl http://localhost:<port>/health

# Check logs
journalctl -u <service> --since "1 hour ago"

# Verify data integrity
md5sum <critical-files>
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Passphrase Incorrect

**Error**: "Wrong passphrase or corrupted data"

**Solution**:
```bash
# Verify passphrase file
cat /backup/config/encryption-passphrase.txt

# Use exact passphrase (including quotes/spaces)
source /backup/config/encryption-passphrase.txt
echo "$PASSPHRASE"
```

#### Issue: Connection to Wasabi Failed

**Error**: "Unable to connect to remote server"

**Solution**:
```bash
# Test Wasabi connectivity
aws s3 ls s3://vmibackups/ --endpoint-url https://s3.ap-southeast-2.wasabisys.com --profile wasabi

# Check credentials
cat /root/.aws/credentials

# Verify network
ping s3.ap-southeast-2.wasabisys.com
curl https://s3.ap-southeast-2.wasabisys.com
```

#### Issue: Backup Not Found

**Error**: "No backup sets found"

**Solution**:
```bash
# List all backups in bucket
aws s3 ls s3://vmibackups/ --recursive --endpoint-url https://s3.ap-southeast-2.wasabisys.com --profile wasabi

# Verify correct path
# Should be: s3://vmibackups/vmi01/daily/
# Not: s3://vmibackups/vmi01-daily/
```

#### Issue: Slow Restore

**Causes**:
- Large file size
- Network bandwidth limitation
- Wasabi rate limiting

**Solutions**:
```bash
# Restore during off-hours
# Use parallel restore (if supported)
# Download to local first, then restore:

aws s3 sync s3://vmibackups/vmi01/daily/ /tmp/backup-cache/ \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi

# Then restore from local cache (much faster)
```

#### Issue: Permission Denied

**Error**: "Access denied" when restoring

**Solution**:
```bash
# Restore to temporary location first
duplicati-cli restore ... --restore-path=/tmp/restored/

# Then copy with correct permissions
cp -a /tmp/restored/* /target/location/
chown -R <user>:<group> /target/location/
```

---

## Best Practices

### Before Restore

1. **Document current state**: Take screenshots, note configurations
2. **Test in non-production**: Restore to /tmp first
3. **Verify passphrase**: Source the passphrase file correctly
4. **Check backup date**: Ensure restoring from correct timepoint
5. **Stop services**: Prevent conflicts during restore

### During Restore

1. **Monitor progress**: Watch restore logs
2. **Check disk space**: Ensure sufficient space
3. **Note errors**: Document any errors for troubleshooting
4. **Verify checksums**: If available, verify file integrity

### After Restore

1. **Verify files**: Check critical files restored correctly
2. **Test services**: Start and test each service
3. **Check logs**: Review application logs for errors
4. **Update documentation**: Note what was restored and why
5. **Create new backup**: Backup the restored system

---

## Quick Reference Commands

```bash
# List backups
duplicati-cli list s3://vmibackups/NODE/SCHEDULE/ --passphrase="$PASSPHRASE" ...

# Restore single file
duplicati-cli restore s3://vmibackups/NODE/SCHEDULE/ --file="/path/to/file" --restore-path=/tmp/ --passphrase="$PASSPHRASE" ...

# Restore directory
duplicati-cli restore s3://vmibackups/NODE/SCHEDULE/ --file="/path/to/dir/" --restore-path=/tmp/ --passphrase="$PASSPHRASE" ...

# Restore to specific date
duplicati-cli restore s3://vmibackups/NODE/SCHEDULE/ --time="2025-11-12" --restore-path=/tmp/ --passphrase="$PASSPHRASE" ...
```

---

**Author**: Claude Code
**Date**: 2025-11-12
**Version**: 1.0
**Status**: Production Ready
