# Backup System - Daily Operations

**System**: Restic v0.17.3
**Status**: ✅ Operational
**Last Updated**: 2025-11-13

---

## Quick Reference

### System Status

| Node | IP | Repository | Status |
|------|-----|------------|--------|
| ACDEV-VMI01 | 10.0.0.1 | 1a4ad1c136 | 🟢 Active |
| ACDEV-VMI02D | 10.0.0.2 | 60dc69903f | 🟢 Active |
| ACDEV-VMI03 | 10.0.0.3 | 03f5d5bcb2 | 🟢 Active |
| ACDEV-WG_GATEWAY | 10.0.0.4 | 645a7ab7a5 | 🟢 Active |

### Backup Schedule

**5AM Perth Time (21:00 UTC) Daily**

| Node | Perth | UTC | Cron |
|------|-------|-----|------|
| VMI01 | 5:00 AM | 21:00 | `0 21 * * *` |
| VMI02D | 5:05 AM | 21:05 | `5 21 * * *` |
| VMI03 | 5:10 AM | 21:10 | `10 21 * * *` |
| WG_GATEWAY | 5:15 AM | 21:15 | `15 21 * * *` |

---

## Common Operations

### 1. Manual Backup

```bash
# On any node
/opt/backup/scripts/backup.sh

# Or remotely
ssh root@10.0.0.1 '/opt/backup/scripts/backup.sh'
```

### 2. List Snapshots

```bash
# On the node
source /opt/backup/restic-env.sh
restic snapshots

# Show latest 5
restic snapshots --latest 5

# Show specific host
restic snapshots --host acdev-vmi01
```

### 3. Check Backup Status

```bash
# Check if last backup succeeded
tail -50 /opt/backup/logs/cron.log

# Check all nodes from VMI02D
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=== ${ip} ==="
    ssh root@${ip} 'tail -20 /opt/backup/logs/cron.log | grep -E "(Status|snapshot)"'
done
```

### 4. View Repository Statistics

```bash
source /opt/backup/restic-env.sh

# Storage usage
restic stats --mode raw-data

# Repository info
restic stats

# Snapshot count and size
restic snapshots
```

### 5. Verify Repository Health

```bash
# Quick check
/opt/backup/scripts/verify.sh

# Or manually
source /opt/backup/restic-env.sh
restic check

# Deep check (slower)
restic check --read-data-subset=10%
```

### 6. View Logs

```bash
# Latest backup log
ls -lt /opt/backup/logs/backup-*.log | head -1 | xargs cat

# Cron log (ongoing)
tail -f /opt/backup/logs/cron.log

# Last 100 lines of cron log
tail -100 /opt/backup/logs/cron.log

# All backup logs
ls -lh /opt/backup/logs/
```

---

## Restore Operations

See [RESTORE.md](RESTORE.md) for detailed restore procedures.

**Quick restore**:
```bash
# List snapshots
source /opt/backup/restic-env.sh
restic snapshots

# Restore using helper script
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path

# Or manually
restic restore <snapshot-id> --target /restore/path
```

---

## Monitoring

### Daily Checks (Morning After Backup)

```bash
# Check all backup logs for success
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "========== Node ${ip} =========="
    ssh root@${ip} 'grep -E "Status: 0|snapshot.*saved" /opt/backup/logs/cron.log | tail -2'
done
```

### Weekly Checks

```bash
# Verify retention policy working
source /opt/backup/restic-env.sh
restic snapshots

# Check snapshot counts match retention (4H/7D/4W/3M)
# Should see ~14-15 snapshots after 2 weeks
```

### Monthly Checks

- [ ] Verify monthly snapshots created
- [ ] Check Wasabi S3 storage costs
- [ ] Test restore procedure
- [ ] Review backup logs for any warnings

---

## Wasabi S3 Operations

### Check S3 Storage

```bash
# On VMI02D
aws s3 ls s3://vmibackups/ --recursive --human-readable --summarize \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

### List Repositories

```bash
aws s3 ls s3://vmibackups/ \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

---

## Troubleshooting

### Backup Failed

**Check logs**:
```bash
tail -100 /opt/backup/logs/cron.log
```

**Common issues**:
- Network connectivity: `ping s3.ap-southeast-2.wasabisys.com`
- S3 credentials: Check `/opt/backup/restic-env.sh`
- Disk space: `df -h /opt/backup/cache`

### Repository Locked

```bash
source /opt/backup/restic-env.sh
restic unlock
```

### Slow Backup

**Normal**: First backup is slow (full). Subsequent backups are fast (incremental).

**Expected times**:
- VMI01: First ~28s, subsequent ~5-10s
- VMI02D: First ~17s, subsequent ~3-5s
- VMI03: First ~8s, subsequent ~2-3s
- WG_GATEWAY: First ~4s, subsequent ~1-2s

### Wrong Password

**Check password**:
```bash
cat /opt/backup/restic-env.sh | grep RESTIC_PASSWORD
```

**If different from master**, update from VMI02D:
```bash
scp /backup/preserved/RESTIC_PASSWORD.txt root@<node-ip>:/tmp/
# Then update /opt/backup/restic-env.sh on that node
```

---

## Configuration Files

### On Each Node

**Environment**: `/opt/backup/restic-env.sh` (chmod 600)
- Repository URL
- Encryption password
- AWS credentials
- Cache directory

**Scripts**:
- `/opt/backup/scripts/backup.sh` - Main backup with GFS retention
- `/opt/backup/scripts/verify.sh` - Repository verification
- `/opt/backup/scripts/restore.sh` - Restore helper

**Logs**:
- `/opt/backup/logs/backup-YYYYMMDD-HHMMSS.log` - Individual backups
- `/opt/backup/logs/cron.log` - Cron execution log

**Cache**:
- `/opt/backup/cache/` - Restic cache (speeds up operations)

### On VMI02D (Central Config)

**Preserved Info**: `/backup/preserved/`
- `WASABI_CREDENTIALS.txt` - S3 credentials
- `RESTIC_PASSWORD.txt` - Encryption password (CRITICAL)
- `VPN_NETWORK.txt` - Network information
- `BACKUP_PATHS.txt` - Path configuration

---

## Emergency Procedures

### System Down - Restore Needed

1. See [RESTORE.md](RESTORE.md) for full procedures
2. Have encryption password ready: `/backup/preserved/RESTIC_PASSWORD.txt`
3. Have Wasabi credentials ready
4. Follow disaster recovery checklist

### Credentials Compromised

1. **Immediately** rotate Wasabi S3 credentials
2. Update on all nodes: `/opt/backup/restic-env.sh`
3. Update preserved config: `/backup/preserved/WASABI_CREDENTIALS.txt`
4. Test backup on one node before continuing

### Encryption Password Lost

⚠️ **CRITICAL**: If encryption password is lost, **all backups are unrecoverable**

**Prevention**:
- Backup password to secure location (password manager, vault)
- Store offline copy in safe location
- Document location in disaster recovery plan

---

## Performance Metrics

### First Backup Results

| Node | Data Scanned | Stored in S3 | Ratio | Time |
|------|--------------|--------------|-------|------|
| VMI01 | 1.616 GiB | 224.6 MB | 86.4% | 28s |
| VMI02D | 1.120 GiB | 343.0 MB | 69.4% | 17s |
| VMI03 | 823 MB | 116.0 MB | 85.9% | 8s |
| WG_GATEWAY | 144 MB | 23.3 MB | 83.8% | 4s |

**Average**: 81% compression ratio

### Expected Incremental Performance

- Daily changes: Typically 1-5% of data
- Backup time: 1-5 seconds per node
- Bandwidth: Minimal (only changed blocks)

---

## Support

**Documentation**: See [../README.md](../README.md) for all docs
**Security**: See [../security/CREDENTIALS.md](../security/CREDENTIALS.md)
**Architecture**: See [../reference/ARCHITECTURE.md](../reference/ARCHITECTURE.md)

**Restic Documentation**: https://restic.readthedocs.io/
