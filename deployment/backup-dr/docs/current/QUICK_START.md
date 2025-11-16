# Restic Backup System - Quick Start

**Status**: ✅ Operational  
**Last Backup**: Check `/opt/backup/logs/cron.log` on each node

---

## System Overview

**4 Nodes backing up to Wasabi S3**:
- ACDEV-VMI01 (10.0.0.1) - Primary app server
- ACDEV-VMI02D (10.0.0.2) - Data/backup server
- ACDEV-VMI03 (10.0.0.3) - SOC Hub
- ACDEV-WG_GATEWAY (10.0.0.4) - VPN gateway

**Schedule**: Daily at 5AM Perth time (21:00 UTC)
**Retention**: 4 hourly, 7 daily, 4 weekly, 3 monthly (GFS)

---

## Most Common Commands

### Check Last Backup

```bash
# On any node
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
# List snapshots first
source /opt/backup/restic-env.sh
restic snapshots

# Restore
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path
```

---

## Check All Nodes (from VMI02D)

```bash
# Check backup status on all nodes
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=== ${ip} ==="
    ssh root@${ip} 'tail -20 /opt/backup/logs/cron.log | tail -5'
    echo ""
done
```

---

## Critical Files

### Encryption Password (BACKUP THIS!)

```bash
# On VMI02D
cat /backup/preserved/RESTIC_PASSWORD.txt
```

⚠️ **Cannot restore backups without this password!**

### Wasabi S3 Credentials

```bash
# On VMI02D
cat /backup/preserved/WASABI_CREDENTIALS.txt
```

---

## Troubleshooting

### Backup Failed?

```bash
# Check logs
tail -100 /opt/backup/logs/cron.log

# Check last backup status
grep "Status:" /opt/backup/logs/cron.log | tail -1
```

### Repository Locked?

```bash
source /opt/backup/restic-env.sh
restic unlock
```

---

## Documentation

- **[Operations Guide](OPERATIONS.md)** - Detailed daily operations
- **[Restore Procedures](../reference/RESTORE_PROCEDURES.md)** - Full restore guide
- **[Deployment Status](DEPLOYMENT_STATUS.md)** - System status and metrics

---

**Need Help?** See [OPERATIONS.md](OPERATIONS.md) for detailed procedures
