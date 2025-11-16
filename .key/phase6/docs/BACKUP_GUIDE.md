# Wasabi S3 Backup System - User Guide

## Overview

This backup system provides automated, reliable backups for all three VMs (VMI01, VMI02D, VMI03) to Wasabi S3 storage.

**Key Features:**

- Daily incremental backups at 2 AM
- Weekly full backups on Sunday at 3 AM
- Automatic retention management (7 days daily, 4 weeks weekly)
- Email notifications on success/failure
- Integrity verification
- Prometheus monitoring integration
- Configuration change tracking with git

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   VMI01     │     │   VMI02D    │     │   VMI03     │
│  Dev/MCP    │     │  Storage    │     │  Security   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                    │
       └───────────────────┼────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Wasabi S3  │
                    │  vmibackups │
                    │  Bucket     │
                    └─────────────┘
```

## Backup Contents by VM

### VMI01 (Dev/MCP Server)

- `/etc/` - System configuration
- `/opt/mcp/` - MCP applications
- `/key/` - SSH keys and credentials
- `/root/` and `/home/` - User directories
- PostgreSQL databases (mcp_ecosystem, keycloak, nextcloud)
- Redis dumps
- System logs (last 7 days)

### VMI02D (Storage Server)

- `/etc/` - System configuration
- `/key/` - SSH keys
- `/root/` and `/home/` - User directories
- System logs
- NextCloud config (when deployed)

### VMI03 (Security Gateway)

- `/etc/` - System configuration
- `/opt/keycloak/` - Keycloak installation
- `/key/` - SSH keys
- `/root/` and `/home/` - User directories
- Keycloak configuration and data
- System logs

## S3 Bucket Structure

```
vmibackups/
├── vmi01/
│   ├── 2025-01-15/          # Daily backup
│   ├── 2025-01-16/
│   ├── weekly/
│   │   ├── 2025-01-12/      # Weekly full backup
│   │   └── 2025-01-19/
│   └── etc-history/          # Git history of /etc
├── vmi02d/
│   └── ...
└── vmi03/
    └── ...
```

## Backup Schedule

| Backup Type       | Schedule          | Retention | Size (Est.) | Duration  |
| ----------------- | ----------------- | --------- | ----------- | --------- |
| Daily Incremental | Every day 2:00 AM | 7 days    | 1-5 GB      | 10-30 min |
| Weekly Full       | Sunday 3:00 AM    | 4 weeks   | 10-50 GB    | 1-3 hours |
| /etc Git Tracking | Daily 11:50 PM    | 30 days   | < 100 MB    | < 1 min   |

## Manual Backup Operations

### Run Immediate Backup

```bash
# Daily incremental backup
sudo /opt/backup-scripts/backup-to-s3.sh

# Full backup
sudo /opt/backup-scripts/full-backup-to-s3.sh

# Dry run (test without uploading)
sudo /opt/backup-scripts/backup-to-s3.sh --dry-run
```

### Verify Latest Backup

```bash
# Quick verification
sudo /opt/backup-scripts/verify-backup.sh --quick

# Full verification (slower)
sudo /opt/backup-scripts/verify-backup.sh

# Verify specific date
sudo /opt/backup-scripts/verify-backup.sh --backup-date 2025-01-15
```

### List Available Backups

```bash
# List all backups for this host
rclone lsf wasabi-vmi:vmibackups/$(hostname -s)/ \
  --config /root/.config/rclone/rclone.conf --dirs-only

# Show backup sizes
rclone size wasabi-vmi:vmibackups/$(hostname -s)/ \
  --config /root/.config/rclone/rclone.conf
```

### Check Backup Status

```bash
# View systemd timer status
systemctl status backup-daily.timer
systemctl status backup-weekly.timer

# View recent backup logs
journalctl -u backup-daily.service -n 100

# View log files
tail -f /var/log/backups/backup-$(date +%Y-%m-%d).log
```

## Monitoring

### Prometheus Metrics

Metrics are exposed via `/opt/backup-scripts/backup-status-check.sh`:

```bash
# Get current metrics
sudo /opt/backup-scripts/backup-status-check.sh
```

**Available Metrics:**

- `backup_status` - Backup success/failure (1/0)
- `backup_age_hours` - Age of latest backup in hours
- `backup_size_bytes` - Size of latest backup
- `backup_file_count` - Number of files in backup
- `backup_is_stale` - Whether backup is older than expected
- `backup_s3_reachable` - S3 connectivity status
- `backup_total_storage_bytes` - Total S3 storage used

### Alerts

Automatic alerts are sent for:

- Backup failure
- No backup in 36 hours
- S3 connectivity issues
- Backup size anomalies
- Disk space issues

Configure alerts in Prometheus AlertManager:

```yaml
groups:
  - name: backup_alerts
    rules:
      - alert: BackupStale
        expr: backup_age_hours > 36
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: 'Backup is stale on {{ $labels.hostname }}'
          description: 'Latest backup is {{ $value }} hours old'

      - alert: BackupFailed
        expr: backup_status == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'Backup failed on {{ $labels.hostname }}'
```

## Email Notifications

All backups send email notifications to: `acampkinpersonnal@gmail.com`

**Success Email Includes:**

- Backup date and time
- Duration
- Total size
- Backed up paths
- S3 location

**Failure Email Includes:**

- Error message
- Recent log entries
- System information

## Configuration Change Tracking

The `/etc` directory is automatically tracked with git:

### View Configuration History

```bash
# View recent commits
cd /etc
git log --oneline -10

# View what changed
git show HEAD

# Compare with previous version
git diff HEAD~1 HEAD
```

### Restore Previous Configuration

```bash
# View file at specific commit
git show COMMIT_HASH:/etc/nginx/nginx.conf

# Restore entire /etc from backup
sudo /opt/backup-scripts/etc-git-tracker.sh --restore
```

## Retention Policy

Backups are automatically cleaned up according to:

| Type    | Retention | Cleanup Schedule      |
| ------- | --------- | --------------------- |
| Daily   | 7 days    | Monday 4:00 AM        |
| Weekly  | 4 weeks   | Monday 4:00 AM        |
| Monthly | 12 months | First Monday of month |

### Manual Cleanup

```bash
# Preview what would be deleted
sudo /opt/backup-scripts/cleanup-old-backups.sh --dry-run

# Force cleanup without confirmation
sudo /opt/backup-scripts/cleanup-old-backups.sh --force
```

## Troubleshooting

### Backup Not Running

```bash
# Check timer is enabled
systemctl list-timers backup-*

# Enable if disabled
sudo systemctl enable --now backup-daily.timer
sudo systemctl enable --now backup-weekly.timer

# Check for errors
journalctl -u backup-daily.service -p err
```

### S3 Connection Issues

```bash
# Test S3 connectivity
rclone lsd wasabi-vmi:vmibackups \
  --config /root/.config/rclone/rclone.conf

# Check credentials
sudo cat /root/.config/rclone/rclone.conf

# Verify no placeholders
grep PLACEHOLDER /root/.config/rclone/rclone.conf
```

### Disk Space Issues

```bash
# Check backup staging space
df -h /var/backups

# Clean old local backups
sudo find /var/backups/s3-staging* -type d -mtime +2 -exec rm -rf {} \;

# Check for failed uploads
ls -lh /var/backups/s3-staging*/
```

### Email Not Sending

```bash
# Test mail command
echo "Test" | mail -s "Test" acampkinpersonnal@gmail.com

# Check mail logs
tail -f /var/log/mail.log

# Install/configure mail if missing
sudo apt install mailutils
```

## Best Practices

1. **Test Restores Monthly** - Verify you can actually restore from backups
2. **Monitor Backup Size** - Unexpected size changes may indicate issues
3. **Keep Multiple Copies** - Consider copying critical backups to second location
4. **Document Recovery Procedures** - Ensure team knows how to restore
5. **Review Logs Periodically** - Check for warnings or errors
6. **Update Scripts** - Keep backup scripts up to date
7. **Secure Credentials** - Protect S3 access keys
8. **Test Disaster Recovery** - Practice full system rebuild

## Cost Estimation

**Wasabi Pricing (as of 2025):**

- Storage: $6.99/TB/month
- No egress fees
- No API fees
- Minimum storage duration: 90 days

**Estimated Monthly Costs:**

| VM        | Daily Backup | Weekly Backup | Total/Month | Cost/Month |
| --------- | ------------ | ------------- | ----------- | ---------- |
| VMI01     | 3 GB         | 15 GB         | ~80 GB      | $0.56      |
| VMI02D    | 5 GB         | 25 GB         | ~150 GB     | $1.05      |
| VMI03     | 2 GB         | 10 GB         | ~60 GB      | $0.42      |
| **Total** |              |               | **~290 GB** | **$2.03**  |

With retention policy (7 daily + 4 weekly), expected total storage: **~500 GB**

**Monthly cost: ~$3.50**

## Security Considerations

1. **Encryption**: All data encrypted at rest with AES-256 (S3 SSE)
2. **Access Control**: Use dedicated S3 user with minimal permissions
3. **Credentials**: Store in secure location, never in git
4. **Network**: Backups sent over HTTPS
5. **Audit**: All S3 access logged by Wasabi
6. **Retention**: Automatic cleanup prevents data accumulation

## Support

For issues or questions:

1. Check logs: `/var/log/backups/`
2. Review documentation: `/opt/backup-scripts/docs/`
3. Contact: acampkinpersonnal@gmail.com
4. Emergency restore: See DISASTER_RECOVERY.md
