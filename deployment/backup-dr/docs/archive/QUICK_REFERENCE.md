# Wasabi S3 Backup System - Quick Reference Card

## Installation (5 Minutes)

```bash
# 1. Configure Wasabi (2 min)
sudo ./configure-wasabi-s3.sh

# 2. Deploy SSH key to all VMs
ssh root@46.250.243.123 "cat >> /root/.ssh/authorized_keys" < /root/.ssh/wasabi-backup-key.pub
ssh root@46.250.241.70 "cat >> /root/.ssh/authorized_keys" < /root/.ssh/wasabi-backup-key.pub
ssh root@154.26.158.31 "cat >> /root/.ssh/authorized_keys" < /root/.ssh/wasabi-backup-key.pub
ssh root@154.26.158.68 "cat >> /root/.ssh/authorized_keys" < /root/.ssh/wasabi-backup-key.pub

# 3. Configure snapshots (2 min)
sudo ./configure-snapshots.sh

# 4. Install validation (1 min)
sudo cp backup-validation.sh /usr/local/bin/
sudo cp systemd/wasabi-validation.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wasabi-validation.timer
```

## Essential Commands

### Status Checks

```bash
# Timer status
systemctl status wasabi-snapshot.timer

# Next scheduled run
systemctl list-timers | grep wasabi

# Service logs
journalctl -u wasabi-snapshot.service -f

# Recent backups
ls -lth /etc/wasabi-backup/manifests/ | head
```

### Manual Operations

```bash
# Run backup now
sudo /etc/wasabi-backup/scripts/wasabi-snapshot.sh

# Run validation
sudo /usr/local/bin/backup-validation.sh

# GFS rotation
sudo /etc/wasabi-backup/gfs-rotate.sh

# Inspect 3-day cache on VMI02D
sudo find /var/backup/cache -maxdepth 2 -mindepth 2 -type d -printf '%TY-%Tm-%Td %TH:%TM %p\n'
```

### Wasabi S3 Operations

```bash
# List backups
rclone lsd wasabi-crypt:

# View storage usage
rclone size wasabi-crypt: --json | jq .

# List specific backup type
rclone lsf wasabi-crypt:daily/ --dirs-only
rclone lsf wasabi-crypt:weekly/ --dirs-only
```

### Restore Backup

```bash
# 1. Find backup
cat /etc/wasabi-backup/manifests/backup_*.json | jq -r '.backup_id'

# 2. Download
BACKUP_ID="backup_20250108_120000_abc123"
rclone copy "wasabi-crypt:daily/VMI01/${BACKUP_ID}" /var/restore/ --progress

# 3. Verify
cd /var/restore && sha256sum -c checksums.sha256

# 4. Restore files as needed
```

## Configuration Files

```
/etc/wasabi-backup/gfs-policy.conf          # Retention settings
/etc/wasabi-backup/sources-VMI01.conf       # VMI01 sources
/etc/wasabi-backup/notification-templates.conf # Notifications
/etc/wasabi-backup/sources-JUMPBOX.conf     # Jump Box (AdGuard/WireGuard)
/root/.config/rclone/rclone.conf            # Wasabi credentials
```

## Backup Schedule

| Time  | Type   | Kept |
| ----- | ------ | ---- |
| 00:00 | Daily  | 7    |
| 06:00 | Hourly | 4    |
| 12:00 | Hourly | 4    |
| 18:00 | Hourly | 4    |

**Special**: Weekly (Sun 00:00, keep 4), Monthly (1st 00:00, keep 12), Yearly (Jan 1 00:00, keep 7)

## Troubleshooting

### Backup fails

```bash
# Check logs
journalctl -u wasabi-snapshot.service -n 100

# Test Wasabi
rclone lsd wasabi-crypt:

# Test SSH
ssh -F /root/.ssh/wasabi-backup-config VMI01 "echo OK"
```

### Timer not running

```bash
systemctl enable wasabi-snapshot.timer
systemctl start wasabi-snapshot.timer
systemctl list-timers wasabi-snapshot.timer
```

### Storage full

```bash
# Check usage
rclone size wasabi-crypt: --json | jq .

# Run rotation
sudo /etc/wasabi-backup/gfs-rotate.sh
```

## Important Paths

```
Scripts:          /etc/wasabi-backup/scripts/wasabi-snapshot.sh
Logs:             /var/log/wasabi-backup/
Manifests:        /etc/wasabi-backup/manifests/
Reports:          /var/log/wasabi-backup/reports/
Temp:             /var/backup/temp/
Cache:            /var/backup/cache/ (3-day staging on VMI02D)
```

## Quick Health Check

```bash
#!/bin/bash
echo "=== Health Check ==="
echo "1. Wasabi connectivity:"
rclone lsd wasabi-crypt: && echo "✓" || echo "✗"

echo "2. Timer status:"
systemctl is-active wasabi-snapshot.timer && echo "✓" || echo "✗"

echo "3. Latest backup:"
ls -t /etc/wasabi-backup/manifests/*.json | head -n1 | xargs jq -r '.timestamp'

echo "4. Disk space:"
df -h /var/backup/temp | tail -n1
```

## Support

- Full docs: `/opt/mcp-deployment/backup-dr/README.md`
- Deployment: `/opt/mcp-deployment/backup-dr/DEPLOYMENT.md`
- Logs: `/var/log/wasabi-backup/`
