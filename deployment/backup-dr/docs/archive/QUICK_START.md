# Restic Backup System - Quick Start Guide

**Status**: ⚠️ Awaiting Wasabi S3 credential validation

---

## Current Situation

✅ **What's Done**:
- Duplicati shut down and cleaned up
- Restic 0.17.3 installed on all 4 nodes
- Backup scripts configured with GFS retention
- Scheduled for 5AM Perth time (21:00 UTC)
- Encryption enabled (AES-256)

⚠️ **What's Blocked**:
- **Wasabi S3 credentials** returning `SignatureDoesNotMatch` error
- Repository initialization pending credential validation

---

## Resolve Wasabi Credentials (URGENT)

### Test Current Credentials

On VMI02D:
```bash
aws s3 ls s3://vmibackups/ \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

**Expected**: Should list bucket contents (or empty if new)
**Actual**: `SignatureDoesNotMatch` error

### Current Credentials

```
Access Key: WCZLQETBK6VXN55WECMQ
Secret Key: fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
Bucket: vmibackups
Region: ap-southeast-2
Endpoint: s3.ap-southeast-2.wasabisys.com
```

### Actions Required

1. **Login to Wasabi Console**: https://console.wasabisys.com/
2. **Verify Bucket Exists**: Check if "vmibackups" bucket exists in ap-southeast-2
3. **Check Access Keys**: Navigate to "Access Keys" section
4. **Regenerate if Needed**: Create new access key if current is invalid
5. **Update Configuration**: If credentials change, update:
   - `/backup/preserved/WASABI_CREDENTIALS.txt`
   - `/opt/backup/restic-env.sh` on all 4 nodes

---

## Once Credentials are Valid

### Step 1: Initialize Repositories (Run on VMI02D)

```bash
# SSH to VMI02D
ssh root@46.250.241.70

# Initialize all repositories
bash << 'EOF'
declare -A NODES
NODES["ACDEV-VMI01"]="10.0.0.1"
NODES["ACDEV-VMI02D"]="10.0.0.2"
NODES["ACDEV-VMI03"]="10.0.0.3"
NODES["ACDEV-WG_GATEWAY"]="10.0.0.4"

for HOSTNAME in "${!NODES[@]}"; do
    IP="${NODES[$HOSTNAME]}"
    echo "=========================================="
    echo "Initializing repository: ${HOSTNAME}"
    echo "=========================================="

    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        source /opt/backup/restic-env.sh && restic init
    else
        # Remote execution
        ssh -o StrictHostKeyChecking=no root@${IP} \
            'source /opt/backup/restic-env.sh && restic init'
    fi
done
EOF
```

### Step 2: Test First Backup

Test on each node sequentially:

```bash
# Test VMI02D (local)
echo "Testing ACDEV-VMI02D..."
/opt/backup/scripts/backup.sh

# Test VMI01
echo "Testing ACDEV-VMI01..."
ssh root@10.0.0.1 '/opt/backup/scripts/backup.sh'

# Test VMI03
echo "Testing ACDEV-VMI03..."
ssh root@10.0.0.3 '/opt/backup/scripts/backup.sh'

# Test WG_GATEWAY
echo "Testing ACDEV-WG_GATEWAY..."
ssh root@10.0.0.4 '/opt/backup/scripts/backup.sh'
```

### Step 3: Verify Backups in Wasabi

```bash
# Check each repository
for host in ACDEV-VMI01 ACDEV-VMI02D ACDEV-VMI03 ACDEV-WG_GATEWAY; do
    echo "=== ${host} Repository ==="
    case "${host}" in
        "ACDEV-VMI02D")
            source /opt/backup/restic-env.sh
            ;;
        "ACDEV-VMI01")
            IP="10.0.0.1"
            ssh root@${IP} 'source /opt/backup/restic-env.sh; restic snapshots'
            ;;
        "ACDEV-VMI03")
            IP="10.0.0.3"
            ssh root@${IP} 'source /opt/backup/restic-env.sh; restic snapshots'
            ;;
        "ACDEV-WG_GATEWAY")
            IP="10.0.0.4"
            ssh root@${IP} 'source /opt/backup/restic-env.sh; restic snapshots'
            ;;
    esac
done
```

### Step 4: Verify Cron Jobs

```bash
# Check cron is configured on all nodes
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=== Cron on ${ip} ==="
    ssh root@${ip} 'crontab -l | grep backup.sh'
done
```

**Expected Output**:
```
=== Cron on 10.0.0.1 ===
0 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1

=== Cron on 10.0.0.2 ===
5 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1

=== Cron on 10.0.0.3 ===
10 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1

=== Cron on 10.0.0.4 ===
15 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1
```

### Step 5: Monitor Tonight's Automated Backup

Check logs after 5AM Perth time (21:00 UTC):

```bash
# Tomorrow morning, check all backup logs
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=========================================="
    echo "Backup log for ${ip}"
    echo "=========================================="
    ssh root@${ip} 'tail -100 /opt/backup/logs/cron.log'
    echo ""
done
```

---

## Backup Schedule

All times in Perth, Australia (AWST = UTC+8):

| Time (Perth) | Time (UTC) | Node | What |
|--------------|------------|------|------|
| 5:00 AM | 21:00 | ACDEV-VMI01 | Daily backup |
| 5:05 AM | 21:05 | ACDEV-VMI02D | Daily backup |
| 5:10 AM | 21:10 | ACDEV-VMI03 | Daily backup |
| 5:15 AM | 21:15 | ACDEV-WG_GATEWAY | Daily backup |

---

## Important Files and Credentials

### Restic Encryption Password

**Location**: `/backup/preserved/RESTIC_PASSWORD.txt`

```bash
cat /backup/preserved/RESTIC_PASSWORD.txt
```

⚠️ **CRITICAL**: Backup this password! Cannot restore without it.

### Wasabi Credentials

**Location**: `/backup/preserved/WASABI_CREDENTIALS.txt`

```bash
cat /backup/preserved/WASABI_CREDENTIALS.txt
```

### Backup Configuration

**On each node**: `/opt/backup/restic-env.sh`

```bash
# View configuration on any node
ssh root@10.0.0.1 'cat /opt/backup/restic-env.sh'
```

---

## Common Commands

### Manual Backup

```bash
# On any node
source /opt/backup/restic-env.sh
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

# Restore specific snapshot
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path
```

### Check Repository Health

```bash
source /opt/backup/restic-env.sh
/opt/backup/scripts/verify.sh
```

### View Logs

```bash
# Latest backup log
ls -lt /opt/backup/logs/backup-*.log | head -1 | xargs tail -100

# Ongoing cron log
tail -f /opt/backup/logs/cron.log
```

---

## Monitoring Checklist

After first automated backup (tomorrow morning):

- [ ] Check logs on all 4 nodes
- [ ] Verify snapshots exist in each repository
- [ ] Check Wasabi S3 storage usage
- [ ] Verify retention policy working (after 7 days)
- [ ] Test restore from one snapshot
- [ ] Document restore procedure for team

---

## Support

**Documentation**:
- Full status: `deployment/backup-dr/RESTIC_DEPLOYMENT_STATUS.md`
- This guide: `deployment/backup-dr/QUICK_START.md`

**Configuration**:
- Preserved info: `/backup/preserved/` (on VMI02D)
- Node configs: `/opt/backup/` (on each node)

**Restic Docs**: https://restic.readthedocs.io/

---

## Troubleshooting

### "Access Denied" Error
**Solution**: Validate Wasabi credentials

### Backup Too Slow
**Normal**: First backup is full (slow). Subsequent backups are incremental (fast).

### Repository Not Found
**Solution**: Initialize with `restic init`

### Wrong Password Error
**Solution**: Check `/opt/backup/restic-env.sh` has correct `RESTIC_PASSWORD`

---

**Status**: ⚠️ Ready to go live once Wasabi credentials are validated!
