# Wasabi S3 Backup - Quick Reference Card

## Daily Operations

### Check Backup Status
```bash
systemctl status backup-daily.timer
journalctl -u backup-daily.service -n 20
tail -f /var/log/backups/backup-$(date +%Y-%m-%d).log
```

### Manual Backup
```bash
# Test run
sudo /opt/backup-scripts/backup-to-s3.sh --dry-run

# Actual backup
sudo /opt/backup-scripts/backup-to-s3.sh

# Full backup
sudo /opt/backup-scripts/full-backup-to-s3.sh
```

### List Backups
```bash
rclone lsf wasabi-vmi:vmibackups/$(hostname -s)/ \
  --config /root/.config/rclone/rclone.conf --dirs-only
```

### Verify Backup
```bash
# Quick check
sudo /opt/backup-scripts/verify-backup.sh --quick

# Full verification
sudo /opt/backup-scripts/verify-backup.sh
```

## Restore Operations

### Interactive Restore
```bash
sudo /opt/backup-scripts/restore-from-s3.sh
```

### Restore Specific File
```bash
# 1. List backup contents
rclone ls wasabi-vmi:vmibackups/$(hostname -s)/2025-01-15/

# 2. Download archive
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/2025-01-15/files/etc_*.tar.zst /tmp/

# 3. Extract specific file
zstd -dc /tmp/etc_*.tar.zst | tar -xf - ./etc/nginx/nginx.conf
```

### Restore Database
```bash
# Interactive
sudo /opt/backup-scripts/restore-from-s3.sh

# Select: "Database restore only"
# Follow prompts
```

## Monitoring

### Check Metrics
```bash
/opt/backup-scripts/monitoring/backup-status-check.sh
```

### Run Health Check
```bash
/opt/backup-scripts/monitoring/alert-on-failure.sh
```

### View Logs
```bash
# Today's backup log
tail -f /var/log/backups/backup-$(date +%Y-%m-%d).log

# All backup logs
ls -lh /var/log/backups/

# Systemd logs
journalctl -u backup-daily.service -f
```

## Configuration Tracking

### View /etc Changes
```bash
cd /etc
git log --oneline -10
git show HEAD
git diff HEAD~1 HEAD
```

### Restore /etc from Git
```bash
sudo /opt/backup-scripts/etc-git-tracker.sh --restore
```

## Troubleshooting

### S3 Connection Test
```bash
rclone lsd wasabi-vmi:vmibackups \
  --config /root/.config/rclone/rclone.conf
```

### Check Disk Space
```bash
df -h /var/backups
du -sh /var/backups/*
```

### Test Email
```bash
echo "Test" | mail -s "Backup Test" acampkinpersonnal@gmail.com
```

### Fix Stale Lock
```bash
rm -f /var/run/backup-to-s3.lock
rm -f /var/run/full-backup-to-s3.lock
```

## Important Paths

| Path | Description |
|------|-------------|
| `/opt/backup-scripts/` | All backup scripts |
| `/var/log/backups/` | Backup logs |
| `/var/backups/s3-staging/` | Daily backup staging |
| `/var/backups/s3-staging-full/` | Weekly backup staging |
| `/root/.config/rclone/rclone.conf` | S3 credentials |
| `/etc/systemd/system/backup-*.timer` | Systemd timers |
| `/etc/cron.d/backup-*` | Cron schedules |

## Important Commands

| Command | Purpose |
|---------|---------|
| `systemctl list-timers` | Show all timers |
| `rclone ls` | List S3 files |
| `rclone size` | Show S3 usage |
| `rclone sync` | Upload to S3 |
| `zstd -dc file.zst` | Decompress file |
| `tar -tzf file.tar.gz` | List archive contents |
| `pg_restore --list` | List database dump contents |

## Backup Schedule

| Type | Schedule | Command |
|------|----------|---------|
| Daily Incremental | 2:00 AM | `backup-to-s3.sh` |
| Weekly Full | Sun 3:00 AM | `full-backup-to-s3.sh` |
| /etc Git Tracking | 11:50 PM | `etc-git-tracker.sh --push-to-s3` |
| Cleanup Old Backups | Mon 4:00 AM | `cleanup-old-backups.sh` |

## Retention Policy

| Type | Retention |
|------|-----------|
| Daily | 7 days |
| Weekly | 4 weeks |
| Monthly | 12 months |

## VM-Specific Backups

### VMI01 (46.250.243.123)
- PostgreSQL (mcp_ecosystem, keycloak, nextcloud)
- Redis
- /opt/mcp/

### VMI02D (46.250.241.70)
- Large storage (968GB)
- NextCloud (when deployed)

### VMI03 (154.26.158.31)
- Keycloak
- /opt/keycloak/

## Emergency Contacts

| Contact | Details |
|---------|---------|
| Email | acampkinpersonnal@gmail.com |
| Wasabi Support | support@wasabi.com |
| Wasabi Phone | +1-844-WASABI-1 |

## Emergency Procedures

### Backup Failed
1. Check logs: `/var/log/backups/`
2. Test S3 connection
3. Check disk space
4. Review email notification
5. Run manual backup with `--verbose`

### Need Immediate Restore
1. Run: `sudo /opt/backup-scripts/restore-from-s3.sh`
2. Select backup date
3. Choose what to restore
4. Verify after restore

### Complete System Failure
1. See: `/opt/backup-scripts/docs/DISASTER_RECOVERY.md`
2. Provision new VM
3. Install OS
4. Run restore procedure
5. Verify all services

## Cost Monitoring

```bash
# Check total backup size
rclone size wasabi-vmi:vmibackups/$(hostname -s)/ \
  --config /root/.config/rclone/rclone.conf --json

# Estimate monthly cost (Wasabi: $6.99/TB/month)
# Total GB × 0.00699 = Monthly cost
```

## Security

- Credentials: `/root/.config/rclone/rclone.conf` (chmod 600)
- Encryption: AES-256 server-side (automatic)
- Transfer: HTTPS (automatic)
- Access: Root only

## Documentation

| Document | Location |
|----------|----------|
| User Guide | `/opt/backup-scripts/docs/BACKUP_GUIDE.md` |
| Restore Guide | `/opt/backup-scripts/docs/RESTORE_GUIDE.md` |
| DR Plan | `/opt/backup-scripts/docs/DISASTER_RECOVERY.md` |
| This Reference | `/opt/backup-scripts/QUICK_REFERENCE.md` |

## Testing Schedule

- **Daily**: Check backup ran
- **Weekly**: Verify backup size
- **Monthly**: Test single file restore
- **Quarterly**: Full restore drill

---

**Print this card and keep in a safe place for quick reference during incidents.**
