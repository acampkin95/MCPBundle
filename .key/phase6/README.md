# Phase 6: Wasabi S3 Backup & Snapshot System

## Overview

Production-ready backup system for VMI01, VMI02D, and VMI03 using Wasabi S3 storage.

## Features

✅ **Automated Backups**
- Daily incremental backups (2 AM)
- Weekly full backups (Sunday 3 AM)
- Automatic retention management

✅ **Comprehensive Coverage**
- System configurations (`/etc`)
- Application data (`/opt`)
- Databases (PostgreSQL, Redis)
- User directories
- System logs
- SSH keys

✅ **Reliability**
- Checksums verification
- Retry logic for network failures
- Email notifications
- Prometheus monitoring
- Automated testing

✅ **Security**
- AES-256 encryption at rest
- HTTPS transfer
- Secure credential management
- Audit logging

✅ **Configuration Tracking**
- Git-based `/etc` tracking
- Daily auto-commits
- Full history preservation
- Rebuild playbook generation

## Quick Start

### 1. Prerequisites

- Wasabi S3 account with bucket `vmibackups`
- SSH access to all three VMs
- Wasabi credentials (Access Key ID and Secret Access Key)

### 2. Extract Credentials from Image

If you have credentials in an image, use an OCR tool or manually transcribe:
- Access Key ID
- Secret Access Key

### 3. Deploy

```bash
cd /Users/alex/Projects/MCP\ Bundle/.key/phase6/

# Deploy to all VMs
./deploy-backups.sh --all

# Or deploy to specific VM
./deploy-backups.sh --vm vmi01
```

The script will:
1. Ask for Wasabi credentials
2. Deploy scripts and configurations
3. Install dependencies
4. Configure systemd timers
5. Initialize /etc git tracking
6. Test S3 connectivity

### 4. Verify

After deployment, check each VM:

```bash
ssh root@46.250.243.123

# Check timer status
systemctl status backup-daily.timer

# Run test backup
/opt/backup-scripts/backup-to-s3.sh --dry-run

# Run actual backup
/opt/backup-scripts/backup-to-s3.sh

# Verify backup
/opt/backup-scripts/verify-backup.sh
```

## Directory Structure

```
phase6/
├── scripts/                    # Backup and restore scripts
│   ├── backup-to-s3.sh        # Daily incremental backup
│   ├── full-backup-to-s3.sh   # Weekly full backup
│   ├── restore-from-s3.sh     # Interactive restore wizard
│   ├── verify-backup.sh       # Integrity verification
│   ├── cleanup-old-backups.sh # Retention enforcement
│   └── etc-git-tracker.sh     # Configuration tracking
│
├── config/                    # Configuration files
│   ├── rclone.conf           # Wasabi S3 configuration
│   ├── backup-exclude.txt    # Exclusion patterns
│   ├── backup-manifest-template.json
│   └── gpg-backup-key.txt    # Encryption guide
│
├── cron/                     # Cron schedules
│   ├── daily-backup.cron
│   ├── weekly-backup.cron
│   └── etc-git-commit.cron
│
├── systemd/                  # Systemd units
│   ├── backup-daily.service
│   ├── backup-daily.timer
│   ├── backup-weekly.service
│   └── backup-weekly.timer
│
├── monitoring/               # Monitoring integration
│   ├── backup-status-check.sh
│   └── alert-on-failure.sh
│
├── docs/                     # Documentation
│   ├── BACKUP_GUIDE.md      # User guide
│   ├── RESTORE_GUIDE.md     # Restore procedures
│   └── DISASTER_RECOVERY.md # DR procedures
│
├── deploy-backups.sh         # Master deployment script
└── README.md                 # This file
```

## Backup Schedule

| Type | Schedule | Retention | Storage (Est.) |
|------|----------|-----------|----------------|
| Daily Incremental | 2:00 AM daily | 7 days | ~10 GB/VM |
| Weekly Full | 3:00 AM Sunday | 4 weeks | ~40 GB/VM |
| /etc Git History | 11:50 PM daily | 30 days | < 100 MB/VM |

## S3 Bucket Structure

```
vmibackups/
├── vmi01/
│   ├── 2025-01-15/          # Daily backup
│   │   ├── files/
│   │   ├── databases/
│   │   ├── logs/
│   │   ├── metadata/
│   │   ├── backup-manifest.json
│   │   └── SHA256SUMS
│   ├── weekly/
│   │   └── 2025-01-12/      # Weekly full backup
│   └── etc-history/         # Git bundles
│
├── vmi02d/ (same structure)
└── vmi03/ (same structure)
```

## What Gets Backed Up

### VMI01 (Dev/MCP Server)
- `/etc/` - System configuration
- `/opt/mcp/` - MCP applications
- `/key/` - SSH keys and credentials
- `/root/`, `/home/` - User directories
- PostgreSQL databases (mcp_ecosystem, keycloak, nextcloud)
- Redis dump
- System logs (7 days)

### VMI02D (Storage Server - 968GB)
- `/etc/` - System configuration
- `/key/` - SSH keys
- `/root/`, `/home/` - User directories
- NextCloud config (when deployed)
- System logs

### VMI03 (Security Gateway)
- `/etc/` - System configuration
- `/opt/keycloak/` - Keycloak installation
- `/key/` - SSH keys
- `/root/`, `/home/` - User directories
- Keycloak data and configuration
- System logs

## Common Operations

### Manual Backup

```bash
# Daily incremental
sudo /opt/backup-scripts/backup-to-s3.sh

# Weekly full
sudo /opt/backup-scripts/full-backup-to-s3.sh

# Dry run (test mode)
sudo /opt/backup-scripts/backup-to-s3.sh --dry-run
```

### Restore Data

```bash
# Interactive wizard
sudo /opt/backup-scripts/restore-from-s3.sh

# List available backups
rclone lsf wasabi-vmi:vmibackups/$(hostname -s)/ --dirs-only

# Restore specific date
sudo /opt/backup-scripts/restore-from-s3.sh --backup-date 2025-01-15
```

### Verify Backups

```bash
# Quick check
sudo /opt/backup-scripts/verify-backup.sh --quick

# Full verification
sudo /opt/backup-scripts/verify-backup.sh

# Verify specific backup
sudo /opt/backup-scripts/verify-backup.sh --backup-date 2025-01-15
```

### Monitor Status

```bash
# Check timer status
systemctl list-timers backup-*

# View recent logs
journalctl -u backup-daily.service -n 50

# View log file
tail -f /var/log/backups/backup-$(date +%Y-%m-%d).log

# Get Prometheus metrics
/opt/backup-scripts/monitoring/backup-status-check.sh
```

### Configuration Tracking

```bash
# View /etc changes
cd /etc
git log --oneline -20

# View specific file history
git show HEAD:/etc/nginx/nginx.conf

# Restore from git
sudo /opt/backup-scripts/etc-git-tracker.sh --restore
```

## Monitoring & Alerts

### Email Notifications

All backups send email to: `acampkinpersonnal@gmail.com`

- ✅ Success: Summary with size, duration, contents
- ❌ Failure: Error details and recent logs

### Prometheus Metrics

Available at: `/opt/backup-scripts/monitoring/backup-status-check.sh`

Key metrics:
- `backup_status` - Success/failure (1/0)
- `backup_age_hours` - Age of latest backup
- `backup_size_bytes` - Backup size
- `backup_is_stale` - Whether backup is too old
- `backup_s3_reachable` - S3 connectivity

### Health Checks

Run periodically or manually:

```bash
/opt/backup-scripts/monitoring/alert-on-failure.sh
```

Checks:
- Backup age (alerts if > 36 hours)
- S3 connectivity
- Backup size anomalies
- Disk space
- Recent failures

## Cost Estimation

### Wasabi Pricing
- Storage: $6.99/TB/month
- No egress fees
- No API requests fees
- Minimum: 90-day retention

### Estimated Usage

| VM | Daily | Weekly | Total/Month | Cost/Month |
|----|-------|--------|-------------|------------|
| VMI01 | 3 GB | 15 GB | ~80 GB | $0.56 |
| VMI02D | 5 GB | 25 GB | ~150 GB | $1.05 |
| VMI03 | 2 GB | 10 GB | ~60 GB | $0.42 |
| **Total** | | | **~290 GB** | **~$2.03** |

With 7 daily + 4 weekly backups: **~500 GB total**

**Estimated Monthly Cost: $3.50**

## Testing Checklist

### Initial Deployment
- [ ] Deploy to VMI01
- [ ] Deploy to VMI02D
- [ ] Deploy to VMI03
- [ ] Test S3 connectivity on all VMs
- [ ] Run test backup (dry-run) on each VM
- [ ] Run actual backup on each VM
- [ ] Verify backup integrity
- [ ] Check email notifications received
- [ ] Verify backup appears in S3

### Monthly Testing
- [ ] Verify backups ran successfully
- [ ] Check backup sizes are reasonable
- [ ] Test restore of single file
- [ ] Verify monitoring metrics
- [ ] Check email notifications
- [ ] Review logs for errors

### Quarterly Testing
- [ ] Full restore test on test VM
- [ ] Database restore test
- [ ] Document restore time
- [ ] Update procedures if needed

## Troubleshooting

### Backup Not Running

```bash
# Check timer
systemctl status backup-daily.timer

# Enable timer
systemctl enable --now backup-daily.timer

# Check for errors
journalctl -u backup-daily.service -p err
```

### S3 Connection Failed

```bash
# Test connectivity
rclone lsd wasabi-vmi:vmibackups

# Check credentials
cat /root/.config/rclone/rclone.conf

# Verify no placeholders
grep PLACEHOLDER /root/.config/rclone/rclone.conf
```

### Disk Space Issues

```bash
# Check space
df -h /var/backups

# Clean old staging
find /var/backups/s3-staging* -mtime +2 -delete

# Reduce retention (temporarily)
# Edit cleanup-old-backups.sh
```

## Security Considerations

1. **Credentials Protection**
   - rclone.conf is chmod 600 (root only)
   - Never commit credentials to git
   - Store backup in password manager

2. **Encryption**
   - S3 server-side encryption (AES-256)
   - HTTPS for all transfers
   - Optional: GPG client-side encryption

3. **Access Control**
   - Minimal S3 permissions
   - Dedicated S3 user for backups
   - Regular credential rotation

4. **Audit Logging**
   - All backup operations logged
   - S3 access logs enabled
   - Regular log review

## Documentation

Comprehensive guides available in `docs/`:

1. **BACKUP_GUIDE.md** - Complete user guide
   - Backup contents and schedule
   - Manual operations
   - Monitoring and alerts
   - Best practices

2. **RESTORE_GUIDE.md** - Restore procedures
   - Interactive wizard
   - Selective restore
   - Database restore
   - Full system restore

3. **DISASTER_RECOVERY.md** - DR procedures
   - Disaster scenarios
   - Step-by-step recovery
   - Testing procedures
   - Contact information

## Support

- **Email**: acampkinpersonnal@gmail.com
- **Logs**: `/var/log/backups/`
- **Documentation**: `/opt/backup-scripts/docs/`
- **Scripts**: `/opt/backup-scripts/`

## License

Internal use only. Do not distribute.

## Changelog

### Version 1.0.0 (2025-01-15)
- Initial release
- Daily and weekly backup support
- PostgreSQL and Redis backup
- Configuration tracking with git
- Prometheus monitoring
- Email notifications
- Interactive restore wizard
- Comprehensive documentation
