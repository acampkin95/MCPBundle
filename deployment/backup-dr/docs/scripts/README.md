# Backup System Scripts

**System**: Restic v0.17.3
**Purpose**: Deployment and maintenance automation

---

## Script Categories

### Deployment Scripts (One-Time Setup)

Located in: `deployment/`

These scripts were used for initial system deployment. They are preserved for reference and potential future deployments.

| Script | Purpose | Status |
|--------|---------|--------|
| **shutdown-duplicati.sh** | Shut down old Duplicati system and preserve credentials | ✅ Executed |
| **deploy-restic-all-nodes.sh** | Install Restic on all 4 nodes | ✅ Executed |
| **initialize-restic-repos.sh** | Initialize encrypted repositories in Wasabi S3 | ✅ Executed |
| **configure-restic-cron.sh** | Set up automated cron scheduling | ✅ Executed |
| **test-first-backup.sh** | Execute and verify first backup on all nodes | ✅ Executed |
| **update-wasabi-credentials.sh** | Update Wasabi credentials on all nodes | ✅ Executed |
| **configure-lvm-snapshots.sh** | Configure LVM snapshots (not used) | ❌ Not executed |
| **configure-pgbackrest.sh** | Configure PostgreSQL backup (not used) | ❌ Not executed |
| **configure-wasabi-s3.sh** | Configure rclone/Wasabi (old system) | ❌ Replaced by Restic |
| **install-backup-tools.sh** | Install backup utilities | ✅ Executed |

---

## Deployment Scripts (Detailed)

### shutdown-duplicati.sh

**Purpose**: Clean shutdown of Duplicati backup system

**What it does**:
- Stops Duplicati Docker container
- Removes Duplicati container
- Preserves Wasabi credentials to `/backup/preserved/`
- Archives Duplicati configuration
- Cleans up Docker resources

**Usage**:
```bash
sshpass -p 'PASSWORD' ssh root@VMI02D 'bash /path/to/shutdown-duplicati.sh'
```

**Status**: ✅ Successfully executed (2025-11-13)

---

### deploy-restic-all-nodes.sh

**Purpose**: Install and configure Restic on all 4 nodes

**What it does**:
1. Downloads Restic v0.17.3 binary
2. Installs to `/usr/local/bin/restic`
3. Creates directory structure:
   - `/opt/backup/scripts/` - Backup scripts
   - `/opt/backup/logs/` - Log files
   - `/opt/backup/cache/` - Restic cache
4. Creates environment file (`/opt/backup/restic-env.sh`)
5. Creates backup script (`/opt/backup/scripts/backup.sh`)
6. Creates restore helper (`/opt/backup/scripts/restore.sh`)
7. Creates verification script (`/opt/backup/scripts/verify.sh`)
8. Sets permissions (chmod 600 for environment files)

**Nodes**:
- ACDEV-VMI01 (10.0.0.1)
- ACDEV-VMI02D (10.0.0.2)
- ACDEV-VMI03 (10.0.0.3)
- ACDEV-WG_GATEWAY (10.0.0.4)

**Usage**:
```bash
./deploy-restic-all-nodes.sh
```

**Status**: ✅ Successfully executed on all 4 nodes (2025-11-13)

---

### initialize-restic-repos.sh

**Purpose**: Initialize encrypted Restic repositories in Wasabi S3

**What it does**:
1. Sources Restic environment on each node
2. Runs `restic init` for each repository
3. Creates encrypted repository structure in S3
4. Verifies repository creation
5. Logs repository IDs

**Repositories Created**:
- ACDEV-VMI01: Repository 1a4ad1c136
- ACDEV-VMI02D: Repository 60dc69903f
- ACDEV-VMI03: Repository 03f5d5bcb2
- ACDEV-WG_GATEWAY: Repository 645a7ab7a5

**Usage**:
```bash
./initialize-restic-repos.sh
```

**Status**: ✅ All 4 repositories initialized (2025-11-13)

---

### configure-restic-cron.sh

**Purpose**: Set up automated daily backups via cron

**What it does**:
1. Creates cron entry on each node
2. Staggered schedule (5-minute intervals):
   - VMI01: 21:00 UTC (5:00 AM Perth)
   - VMI02D: 21:05 UTC (5:05 AM Perth)
   - VMI03: 21:10 UTC (5:10 AM Perth)
   - WG_GATEWAY: 21:15 UTC (5:15 AM Perth)
3. Configures logging to `/opt/backup/logs/cron.log`
4. Verifies cron installation

**Cron Entry Format**:
```
0 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1
```

**Usage**:
```bash
./configure-restic-cron.sh
```

**Status**: ✅ Active on all 4 nodes (2025-11-13)

---

### test-first-backup.sh

**Purpose**: Execute and verify first backup on all nodes

**What it does**:
1. Executes backup script on each node
2. Monitors backup progress
3. Captures performance metrics:
   - Data scanned
   - Data uploaded
   - Compression ratio
   - Backup duration
4. Verifies snapshot creation
5. Logs results

**Results** (2025-11-13):
- VMI01: 1.616 GiB → 224.6 MB (86.4%) in 28s
- VMI02D: 1.120 GiB → 343.0 MB (69.4%) in 17s
- VMI03: 823 MB → 116.0 MB (85.9%) in 8s
- WG_GATEWAY: 144 MB → 23.3 MB (83.8%) in 4s
- Average compression: 81%

**Usage**:
```bash
./test-first-backup.sh
```

**Status**: ✅ All backups successful (2025-11-13)

---

### update-wasabi-credentials.sh

**Purpose**: Update Wasabi S3 credentials on all nodes

**What it does**:
1. Updates `/opt/backup/restic-env.sh` on each node
2. Replaces AWS_ACCESS_KEY_ID
3. Replaces AWS_SECRET_ACCESS_KEY
4. Preserves other environment variables
5. Tests connectivity after update

**Credentials Updated** (2025-11-13):
- Access Key: NJJ5363WC727JRAARETL
- Secret Key: 5p3eecez2hwFnlwyEtOu5NQeZGWu5sfema8PbGFp

**Usage**:
```bash
./update-wasabi-credentials.sh
```

**Status**: ✅ Updated on all 4 nodes (2025-11-13)

---

### install-backup-tools.sh

**Purpose**: Install backup utilities and dependencies

**What it does**:
- Installs `bzip2` (for Restic decompression)
- Installs `awscli` (for S3 management)
- Installs `rsync` (for file synchronization)
- Installs `curl` (for API testing)
- Updates package lists

**Usage**:
```bash
./install-backup-tools.sh
```

**Status**: ✅ Executed on all nodes (2025-11-13)

---

## Maintenance Scripts

Located in: `maintenance/`

### backup-validation.sh

**Purpose**: Comprehensive backup validation and integrity testing

**What it does**:
1. Verifies repository connectivity
2. Runs `restic check` for integrity
3. Lists recent snapshots
4. Tests restore (dry-run)
5. Reports backup age
6. Checks storage usage
7. Generates validation report

**Usage**:
```bash
# On any node
/opt/backup/scripts/verify.sh

# Or remotely
ssh root@10.0.0.1 '/opt/backup/scripts/verify.sh'
```

**Recommended Schedule**: Weekly

**Status**: Available on all nodes

---

## On-Node Scripts

Located on each node in: `/opt/backup/scripts/`

### backup.sh

**Purpose**: Main backup script with GFS retention

**What it does**:
1. Sources environment variables
2. Creates timestamped log file
3. Executes Restic backup with paths
4. Tags snapshot (daily)
5. Applies GFS retention policy:
   - Keep 4 hourly
   - Keep 7 daily
   - Keep 4 weekly
   - Keep 3 monthly
6. Prunes old data
7. Logs results and exit status

**Usage**:
```bash
# Manual backup
/opt/backup/scripts/backup.sh

# Automated (cron)
0 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1
```

---

### restore.sh

**Purpose**: Restore helper script

**What it does**:
1. Accepts snapshot ID and restore path
2. Sources environment
3. Executes `restic restore`
4. Logs restore operation
5. Verifies restored files

**Usage**:
```bash
# Restore snapshot to path
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path

# Example
/opt/backup/scripts/restore.sh 4c89563e /tmp/restore/
```

---

### verify.sh

**Purpose**: Repository verification script

**What it does**:
1. Sources environment
2. Runs `restic check`
3. Verifies data integrity
4. Reports repository health
5. Logs verification results

**Usage**:
```bash
# Run verification
/opt/backup/scripts/verify.sh
```

**Recommended**: Run weekly or monthly

---

## Environment Files

### /opt/backup/restic-env.sh

**Purpose**: Restic environment configuration

**Permissions**: 600 (root only)

**Contents**:
```bash
export RESTIC_REPOSITORY="s3:s3.ap-southeast-2.wasabisys.com/vmibackups/ACDEV-VMI01"
export RESTIC_PASSWORD="csi9D4FFgmqaJYDiPIoPbuhKb3QrgKAibbvNoqS8ChA="
export AWS_ACCESS_KEY_ID="NJJ5363WC727JRAARETL"
export AWS_SECRET_ACCESS_KEY="5p3eecez2hwFnlwyEtOu5NQeZGWu5sfema8PbGFp"
export AWS_DEFAULT_REGION="ap-southeast-2"
export RESTIC_CACHE_DIR="/opt/backup/cache"
export RESTIC_COMPRESSION="auto"
```

**Security**:
- chmod 600 (read/write by root only)
- Never commit to git
- Backup stored in `/backup/preserved/` on VMI02D

---

## Not Used / Archived Scripts

These scripts were created but not executed in the final deployment:

### configure-lvm-snapshots.sh

**Purpose**: LVM snapshot configuration
**Reason Not Used**: Restic provides better point-in-time recovery
**Status**: Archived

### configure-pgbackrest.sh

**Purpose**: PostgreSQL-specific backup tool
**Reason Not Used**: Restic handles database backups adequately
**Status**: Archived

### configure-wasabi-s3.sh

**Purpose**: rclone-based backup configuration
**Reason Not Used**: Replaced by Restic direct-to-S3
**Status**: Archived (old system)

---

## Quick Command Reference

### Check Backup Status
```bash
tail -50 /opt/backup/logs/cron.log | grep -E "(Status|snapshot)"
```

### Manual Backup
```bash
/opt/backup/scripts/backup.sh
```

### List Snapshots
```bash
source /opt/backup/restic-env.sh
restic snapshots
```

### Restore Files
```bash
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path
```

### Verify Repository
```bash
/opt/backup/scripts/verify.sh
```

### Check All Nodes (from VMI02D)
```bash
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=== ${ip} ==="
    ssh root@${ip} 'tail -20 /opt/backup/logs/cron.log | tail -5'
done
```

---

## Script Locations

### Deployment Scripts
```
deployment/backup-dr/
├── shutdown-duplicati.sh
├── deploy-restic-all-nodes.sh
├── initialize-restic-repos.sh
├── configure-restic-cron.sh
├── test-first-backup.sh
├── update-wasabi-credentials.sh
├── install-backup-tools.sh
└── (archived scripts...)
```

### On-Node Scripts
```
/opt/backup/scripts/
├── backup.sh          # Main backup with GFS
├── restore.sh         # Restore helper
└── verify.sh          # Repository verification
```

---

**Documentation Version**: 1.0
**Last Updated**: 2025-11-13
**Status**: Production Reference
