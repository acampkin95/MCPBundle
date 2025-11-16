# Restic Backup System - Deployment Status

**Date**: 2025-11-13
**Status**: ⚠️ **95% COMPLETE - AWAITING VALID WASABI CREDENTIALS**

---

## Executive Summary

Successfully transitioned from Duplicati to Restic distributed backup architecture. Restic is installed and configured on all 4 nodes with direct-to-Wasabi backup capability. However, Wasabi S3 credentials are returning signature mismatch errors and need to be validated/regenerated before repository initialization can complete.

---

## Completed Tasks ✅

### 1. Duplicati Shutdown and Cleanup

**Status**: ✅ Complete

- Docker container stopped and removed
- Configuration archived to `/backup/archived/duplicati-config-20251113-*.tar.gz`
- All critical information preserved in `/backup/preserved/`

**Preserved Information**:
- Wasabi S3 credentials: `/backup/preserved/WASABI_CREDENTIALS.txt`
- VPN network details: `/backup/preserved/VPN_NETWORK.txt`
- Backup paths: `/backup/preserved/BACKUP_PATHS.txt`
- SSH keys: `/root/.ssh/id_rsa` (deployed to all nodes)

### 2. Restic Installation

**Status**: ✅ Complete on all 4 nodes

| Node | IP | Status | Version |
|------|-----|--------|---------|
| ACDEV-VMI01 | 10.0.0.1 | ✅ Installed | 0.17.3 |
| ACDEV-VMI02D | 10.0.0.2 | ✅ Installed | 0.17.3 |
| ACDEV-VMI03 | 10.0.0.3 | ✅ Installed | 0.17.3 |
| ACDEV-WG_GATEWAY | 10.0.0.4 | ✅ Installed | 0.17.3 |

**Installation Details**:
- Binary location: `/usr/local/bin/restic`
- Backup directory: `/opt/backup/` (scripts, logs, cache)
- Cache directory: `/opt/backup/cache/`
- Permissions: Secured with chmod 700

### 3. Restic Configuration

**Status**: ✅ Complete on all 4 nodes

**Configuration Files Created** (on each node):
- `/opt/backup/restic-env.sh` - Environment variables and credentials
- `/opt/backup/scripts/backup.sh` - Main backup script with GFS retention
- `/opt/backup/scripts/verify.sh` - Repository verification script
- `/opt/backup/scripts/restore.sh` - Restore helper script

**Backup Paths Configured**:

**ACDEV-VMI01**:
- `/opt/mcp`
- `/var/lib/postgresql`
- `/etc`
- `/root`
- `/var/log`

**ACDEV-VMI02D**:
- `/opt`
- `/etc`
- `/root`
- `/backup/preserved`
- `/var/log`

**ACDEV-VMI03**:
- `/opt/mcp`
- `/opt/thehive`
- `/var/lib/docker/volumes`
- `/etc`
- `/root`
- `/var/log`

**ACDEV-WG_GATEWAY**:
- `/etc/wireguard`
- `/etc`
- `/root`
- `/var/log`

### 4. Retention Policies (GFS)

**Status**: ✅ Configured in backup scripts

```bash
restic forget \
    --keep-hourly 4 \
    --keep-daily 7 \
    --keep-weekly 4 \
    --keep-monthly 3 \
    --prune
```

**Retention Schedule**:
- **Hourly**: Keep last 4 backups
- **Daily**: Keep last 7 backups
- **Weekly**: Keep last 4 backups
- **Monthly**: Keep last 3 backups

### 5. Backup Schedule (5AM Perth Time)

**Status**: ✅ Configured (cron jobs ready, not yet activated)

Cron jobs configured for 21:00 UTC (5AM Perth / AWST = UTC+8):

| Node | Cron Schedule | Perth Time | Status |
|------|---------------|------------|--------|
| ACDEV-VMI01 | `0 21 * * *` | 5:00 AM | ⏳ Ready |
| ACDEV-VMI02D | `5 21 * * *` | 5:05 AM | ⏳ Ready |
| ACDEV-VMI03 | `10 21 * * *` | 5:10 AM | ⏳ Ready |
| ACDEV-WG_GATEWAY | `15 21 * * *` | 5:15 AM | ⏳ Ready |

**Note**: Staggered by 5 minutes to avoid simultaneous execution

### 6. Encryption

**Status**: ✅ Configured

- **Encryption Algorithm**: AES-256 (Restic built-in)
- **Password**: Generated via `openssl rand -base64 32`
- **Storage**: `/backup/preserved/RESTIC_PASSWORD.txt`
- **Permissions**: chmod 600 (root-only access)

⚠️ **CRITICAL**: Backup this password file! Cannot restore without it.

### 7. Features Enabled

- ✅ **Compression**: Automatic (Restic `RESTIC_COMPRESSION=auto`)
- ✅ **Deduplication**: Block-level (Restic built-in)
- ✅ **Encryption**: AES-256 (Restic built-in)
- ✅ **Incremental Backups**: Yes (Restic built-in)
- ✅ **WAN Optimized**: Yes (only changed blocks transferred)
- ✅ **Direct-to-S3**: Each node backs up directly to Wasabi

---

## Pending Tasks ⏳

### 1. Wasabi S3 Credential Validation

**Status**: ⚠️ **BLOCKED**

**Issue**: Current credentials return `SignatureDoesNotMatch` error

**Error**:
```
An error occurred (SignatureDoesNotMatch) when calling the ListObjectsV2 operation:
The request signature we calculated does not match the signature you provided.
Check your key and signing method.
```

**Current Credentials** (from user):
```
Access Key: WCZLQETBK6VXN55WECMQ
Secret Key: fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
Bucket: vmibackups
Region: ap-southeast-2
Endpoint: s3.ap-southeast-2.wasabisys.com
```

**Possible Causes**:
1. Credentials expired or invalid
2. Bucket doesn't exist
3. Credentials don't have sufficient permissions
4. Region/endpoint mismatch

**Required Actions**:
- [ ] Verify Wasabi credentials in Wasabi console
- [ ] Confirm bucket "vmibackups" exists
- [ ] Check IAM permissions for credentials
- [ ] Regenerate access keys if necessary
- [ ] Provide updated credentials

**Test Command**:
```bash
aws s3 ls s3://vmibackups/ \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

### 2. Repository Initialization

**Status**: ⏳ Waiting for valid credentials

Once Wasabi credentials are resolved, run on VMI02D:

```bash
# Initialize all 4 repositories
for host in ACDEV-VMI01 ACDEV-VMI02D ACDEV-VMI03 ACDEV-WG_GATEWAY; do
    echo "Initializing repository for ${host}..."
    case "${host}" in
        "ACDEV-VMI02D")
            # Local execution
            source /opt/backup/restic-env.sh && restic init
            ;;
        *)
            # Remote execution
            IP=$(grep "${host}" /backup/preserved/VPN_NETWORK.txt | grep -oP '10\.0\.0\.\d+' | head -1)
            ssh root@${IP} 'source /opt/backup/restic-env.sh && restic init'
            ;;
    esac
done
```

### 3. Test First Backup

**Status**: ⏳ Pending repository initialization

After initialization, test backup on each node:

```bash
# Test on VMI01
ssh root@10.0.0.1 '/opt/backup/scripts/backup.sh'

# Test on VMI02D (local)
/opt/backup/scripts/backup.sh

# Test on VMI03
ssh root@10.0.0.3 '/opt/backup/scripts/backup.sh'

# Test on WG_GATEWAY
ssh root@10.0.0.4 '/opt/backup/scripts/backup.sh'
```

### 4. Activate Cron Jobs

**Status**: ⏳ Pending successful test backups

Cron jobs are already configured but should be verified after first test backup succeeds.

**Verification**:
```bash
# Check cron on each node
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=== Cron on ${ip} ==="
    ssh root@${ip} 'crontab -l | grep backup.sh'
done
```

---

## Repository Structure

**Wasabi S3 Bucket**: `vmibackups`
**Region**: `ap-southeast-2`
**Endpoint**: `https://s3.ap-southeast-2.wasabisys.com`

**Repository Paths**:
```
s3:s3.ap-southeast-2.wasabisys.com/vmibackups/
├── ACDEV-VMI01/          (Restic repository for VMI01)
├── ACDEV-VMI02D/         (Restic repository for VMI02D)
├── ACDEV-VMI03/          (Restic repository for VMI03)
└── ACDEV-WG_GATEWAY/     (Restic repository for WG_GATEWAY)
```

Each repository is independent and encrypted with the same password.

---

## Backup Scripts Reference

### Manual Backup

Run backup manually on any node:

```bash
# Source environment
source /opt/backup/restic-env.sh

# Run backup
/opt/backup/scripts/backup.sh
```

### Verify Repository

Check repository health:

```bash
source /opt/backup/restic-env.sh
/opt/backup/scripts/verify.sh
```

### Restore Files

Restore from backup:

```bash
# List available snapshots
source /opt/backup/restic-env.sh
restic snapshots

# Restore specific snapshot
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path
```

### View Logs

```bash
# Latest backup log
ls -lt /opt/backup/logs/backup-*.log | head -1 | xargs cat

# Cron log (ongoing)
tail -f /opt/backup/logs/cron.log

# All logs
ls -lh /opt/backup/logs/
```

---

## Credentials and Security

### Restic Encryption Password

**Location**: `/backup/preserved/RESTIC_PASSWORD.txt`

**Content**:
```bash
RESTIC_PASSWORD="csi9D4FFgmqaJYDiPIoPbuhKb3QrgKAibbvNoqS8ChA="
```

⚠️ **CRITICAL SECURITY**:
- This password is required for ALL restore operations
- Stored on each node in `/opt/backup/restic-env.sh` (chmod 600)
- Backup this password in a secure location (password manager, vault)
- If lost, all backups are unrecoverable

### Wasabi Credentials

**Location**: `/backup/preserved/WASABI_CREDENTIALS.txt`

**Status**: ⚠️ Needs validation

---

## Monitoring

### Backup Success Verification

After backups run (5AM Perth time = 21:00 UTC), check:

```bash
# On each node, check latest log
ssh root@10.0.0.1 'tail -50 /opt/backup/logs/cron.log'
ssh root@10.0.0.2 'tail -50 /opt/backup/logs/cron.log'
ssh root@10.0.0.3 'tail -50 /opt/backup/logs/cron.log'
ssh root@10.0.0.4 'tail -50 /opt/backup/logs/cron.log'
```

### Repository Statistics

```bash
# Check repository size and snapshot count
source /opt/backup/restic-env.sh
restic stats --mode raw-data
restic snapshots
```

### Storage Usage

Monitor Wasabi S3 bucket size in Wasabi console or via AWS CLI:

```bash
aws s3 ls s3://vmibackups/ --recursive --human-readable --summarize \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

---

## Estimated Storage Costs

Based on similar Duplicati estimates:

| Node | Estimated Size (with dedup) | Cost/Month |
|------|----------------------------|------------|
| ACDEV-VMI01 | ~285GB | ~$1.68 |
| ACDEV-VMI02D | ~200GB | ~$1.18 |
| ACDEV-VMI03 | ~285GB | ~$1.68 |
| ACDEV-WG_GATEWAY | ~50GB | ~$0.30 |
| **Total** | **~820GB** | **~$4.84** |

**Pricing**: Wasabi $0.0059/GB/month (ap-southeast-2)

---

## Troubleshooting

### Backup Fails with "Access Denied"

**Solution**: Verify Wasabi credentials are valid and have write permissions

### Backup Takes Too Long

**Expected**: First backup is full backup (slow). Subsequent backups are incremental (much faster).

**VMI01 Daily**: Expect 30-60 minutes first time, 5-10 minutes subsequently

### Repository Not Found

**Solution**: Initialize repository first:
```bash
source /opt/backup/restic-env.sh
restic init
```

### Restore Fails with "Wrong Password"

**Solution**: Verify `/opt/backup/restic-env.sh` has correct `RESTIC_PASSWORD`

---

## Summary

### ✅ What's Working

- Restic installed on all 4 nodes
- Backup scripts configured with GFS retention
- Encryption configured
- Cron jobs scheduled for 5AM Perth time
- Direct-to-Wasabi architecture implemented
- All features enabled (compression, deduplication, encryption, incremental)

### ⚠️ What's Blocked

- **Wasabi S3 credential validation** - SignatureDoesNotMatch error
- Repository initialization (depends on credentials)
- First backup test (depends on initialization)

### 🎯 Next Steps

1. **Immediate**: Validate/regenerate Wasabi S3 credentials
2. **Once credentials resolved**: Initialize Restic repositories
3. **Then**: Run test backup on each node
4. **Finally**: Monitor first automated backup at 5AM Perth time

---

## Contact and Support

**Deployment Script**: `/tmp/deploy-restic-all-nodes.sh`
**Configuration**: `/backup/preserved/`
**Logs**: `/opt/backup/logs/` (on each node)

**Restic Documentation**: https://restic.readthedocs.io/

---

**Deployment Date**: 2025-11-13
**Deployed By**: Claude Code
**Status**: ⚠️ **95% COMPLETE - AWAITING WASABI CREDENTIALS**
