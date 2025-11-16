# Wasabi S3 Backup System - Deployment Guide

Quick deployment guide for setting up the Wasabi S3 backup system on MCP Bundle infrastructure.

## Prerequisites

- Root access to all four Contabo nodes (VMI01, VMI02D, VMI03, Jump Box 154.26.158.68)
- Wasabi S3 account with credentials
- Internet connectivity on all VMs
- At least 50GB free space on `/var/backup/temp`

## Quick Start (5 Minutes)

### 1. Initial Configuration (2 minutes)

Run on the backup coordinator VM (VMI02D serves as the cache and orchestrator):

```bash
cd /opt/mcp-deployment/backup-dr
sudo ./configure-wasabi-s3.sh
```

**Action Required**: Copy the SSH public key displayed at the end to all nodes:

```bash
# The script will display a public key like:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIxxx... wasabi-backup@mcp-bundle

# Add to each VM:
ssh root@46.250.243.123
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIxxx... wasabi-backup@mcp-bundle" >> /root/.ssh/authorized_keys
exit

ssh root@46.250.241.70
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIxxx... wasabi-backup@mcp-bundle" >> /root/.ssh/authorized_keys
exit

ssh root@154.26.158.31
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIxxx... wasabi-backup@mcp-bundle" >> /root/.ssh/authorized_keys
exit

ssh root@154.26.158.68
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIxxx... wasabi-backup@mcp-bundle" >> /root/.ssh/authorized_keys
exit
```

### 2. Enable Automated Snapshots (2 minutes)

```bash
sudo ./configure-snapshots.sh
```

This will:

- Create the snapshot execution script
- Install systemd service and timer
- Enable 6-hour automated backups
- Start the timer
- Stage every backup inside `/var/backup/cache/<vm>/<backup_id>` on VMI02D for 3 days before pruning (only after Wasabi integrity verification succeeds)

### 3. Install Validation (1 minute)

```bash
# Copy validation script to system path
sudo cp backup-validation.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup-validation.sh

# Install systemd units
sudo cp systemd/wasabi-validation.service /etc/systemd/system/
sudo cp systemd/wasabi-validation.timer /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable wasabi-validation.timer
sudo systemctl start wasabi-validation.timer
```

### 4. Configure VMI02D LVM Snapshots (1 minute)

```bash
sudo ./configure-lvm-snapshots.sh
```

This installs `/backup/scripts/lvm-snapshot.sh` along with `vmi02d-lvm-snapshot.timer`, delivering local 6-hour snapshots that retain three days of restore points on VMI02D before data is aged out.

## Verification

### Test Connectivity

```bash
# Test Wasabi S3 connection
rclone lsd wasabi-crypt:

# Test SSH to all VMs
ssh -F /root/.ssh/wasabi-backup-config VMI01 "hostname"
ssh -F /root/.ssh/wasabi-backup-config VMI02D "hostname"
ssh -F /root/.ssh/wasabi-backup-config VMI03 "hostname"
```

### Check Timer Status

```bash
# View timer status
systemctl status wasabi-snapshot.timer

# View next scheduled runs
systemctl list-timers | grep wasabi
```

### Run Test Backup

```bash
# Run a manual test backup
sudo /etc/wasabi-backup/scripts/wasabi-snapshot.sh

# Monitor progress
tail -f /var/log/wasabi-backup/snapshot-$(date +%Y%m%d).log
```

### Run Validation

```bash
# Run validation tests
sudo /usr/local/bin/backup-validation.sh

# View report
firefox /var/log/wasabi-backup/reports/validation-report-*.html
```

## Configuration Files

After deployment, configuration is stored at:

```
/etc/wasabi-backup/
├── gfs-policy.conf              # GFS retention settings
├── sources-VMI01.conf           # VMI01 backup sources
├── sources-VMI02D.conf          # VMI02D backup sources
├── sources-VMI03.conf           # VMI03 backup sources
├── encryption.key               # AES-256 encryption keys
├── manifest-template.json       # Backup manifest template
├── manifest-functions.sh        # Manifest utility functions
├── notification-templates.conf  # Email/webhook templates
├── gfs-rotate.sh               # GFS rotation script
├── verify-backup.sh            # Backup verification script
├── scripts/
│   └── wasabi-snapshot.sh      # Main snapshot execution
└── manifests/
    └── *.json                  # Backup manifests

/root/.config/rclone/
└── rclone.conf                 # Wasabi S3 credentials

/root/.ssh/
├── wasabi-backup-key           # SSH private key
├── wasabi-backup-key.pub       # SSH public key
└── wasabi-backup-config        # SSH config for VMs

/var/log/wasabi-backup/
├── configure-wasabi.log        # Configuration log
├── configure-snapshots.log     # Snapshot setup log
├── snapshot-*.log              # Daily snapshot logs
├── validation-*.log            # Validation logs
└── reports/
    ├── validation-*.json       # JSON reports
    └── validation-*.html       # HTML reports
```

## Backup Schedule

| Time  | Action        | Type   | Retention |
| ----- | ------------- | ------ | --------- |
| 00:00 | Daily Backup  | Daily  | 7 days    |
| 06:00 | Hourly Backup | Hourly | 4 backups |
| 12:00 | Hourly Backup | Hourly | 4 backups |
| 18:00 | Hourly Backup | Hourly | 4 backups |

**Special Cases**:

- Sunday 00:00: Weekly backup (keep 4)
- 1st of month 00:00: Monthly backup (keep 12)
- January 1st 00:00: Yearly backup (keep 7)

## Monitoring

### View Recent Backups

```bash
# List manifests (most recent first)
ls -lth /etc/wasabi-backup/manifests/

# View specific manifest
cat /etc/wasabi-backup/manifests/backup_20250108_120000_*.json | jq .

# Check Wasabi storage
rclone size wasabi-crypt: --json | jq .
```

### Check Service Status

```bash
# Snapshot service
systemctl status wasabi-snapshot.service
journalctl -u wasabi-snapshot.service -n 50

# Validation service
systemctl status wasabi-validation.service
journalctl -u wasabi-validation.service -n 50

# View logs
tail -f /var/log/wasabi-backup/snapshot-$(date +%Y%m%d).log
```

### Performance Metrics

```bash
# View latest validation report
cat /var/log/wasabi-backup/reports/validation-*.json | jq '.test_results.performance_metrics'

# Check backup duration
jq '.duration_seconds' /etc/wasabi-backup/manifests/backup_*.json | tail -n10
```

## Customization

### Adjust Backup Schedule

Edit the timer file:

```bash
sudo nano /etc/systemd/system/wasabi-snapshot.timer

# Change OnCalendar value
# Current: OnCalendar=00/6:00:00 (every 6 hours)
# For 4 hours: OnCalendar=00/4:00:00
# For 12 hours: OnCalendar=00/12:00:00

sudo systemctl daemon-reload
sudo systemctl restart wasabi-snapshot.timer
```

### Modify GFS Retention

Edit the policy:

```bash
sudo nano /etc/wasabi-backup/gfs-policy.conf

# Change retention values
HOURLY_RETENTION=6    # Keep 6 instead of 4
DAILY_RETENTION=14    # Keep 14 instead of 7
# etc.
```

### Add Backup Sources

Edit VM-specific config:

```bash
sudo nano /etc/wasabi-backup/sources-VMI01.conf

# Add new directories to BACKUP_SOURCES
BACKUP_SOURCES="/var/lib/postgresql/backups,/var/lib/redis,/var/log/mcp,/etc,/opt/custom"
```

### Configure Notifications

Edit notification templates:

```bash
sudo nano /etc/wasabi-backup/notification-templates.conf

# Update email settings
EMAIL_FROM="backup@yourdomain.com"
EMAIL_TO="admin@yourdomain.com"
EMAIL_SMTP_SERVER="smtp.yourdomain.com"

# Update webhook
NEXTCLOUD_WEBHOOK_URL="https://your-nextcloud.com/webhook"
NEXTCLOUD_WEBHOOK_TOKEN="your-secret-token"
```

## Troubleshooting

### Backup Fails Immediately

**Symptom**: Service starts but exits immediately

**Solution**:

```bash
# Check logs for errors
journalctl -u wasabi-snapshot.service -n 100

# Common issues:
# 1. SSH connectivity
ssh -F /root/.ssh/wasabi-backup-config VMI01 "echo OK"

# 2. Wasabi connectivity
rclone lsd wasabi-crypt:

# 3. Disk space
df -h /var/backup/temp

# 4. Permissions
ls -la /etc/wasabi-backup/
```

### Timer Not Running

**Symptom**: No backups are being created

**Solution**:

```bash
# Check timer status
systemctl status wasabi-snapshot.timer

# If not active:
sudo systemctl enable wasabi-snapshot.timer
sudo systemctl start wasabi-snapshot.timer

# View next scheduled run
systemctl list-timers wasabi-snapshot.timer
```

### Validation Reports Errors

**Symptom**: Validation fails with checksum errors

**Solution**:

```bash
# Run validation with debug
sudo bash -x /usr/local/bin/backup-validation.sh

# Check specific backup
BACKUP_ID="backup_20250108_120000_abc123"
rclone ls "wasabi-crypt:daily/VMI01/${BACKUP_ID}/"

# Test restore
rclone copy "wasabi-crypt:daily/VMI01/${BACKUP_ID}/" /tmp/test-restore/
cd /tmp/test-restore && sha256sum -c checksums.sha256
```

### Storage Quota Exceeded

**Symptom**: Backups fail with "quota exceeded" errors

**Solution**:

```bash
# Check current usage
rclone size wasabi-crypt: --json | jq .

# Review retention policy
cat /etc/wasabi-backup/gfs-policy.conf

# Manually run GFS rotation
sudo /etc/wasabi-backup/gfs-rotate.sh

# If needed, purge old backups
rclone ls "wasabi-crypt:hourly/" --dirs-only
rclone purge "wasabi-crypt:hourly/old_backup_id"
```

## Maintenance

### Weekly Tasks

- [ ] Review validation reports
- [ ] Check backup manifests
- [ ] Verify storage usage
- [ ] Test restore procedure

### Monthly Tasks

- [ ] Full validation test
- [ ] Review retention policy
- [ ] Audit access logs
- [ ] Update documentation

### Quarterly Tasks

- [ ] Disaster recovery drill
- [ ] Performance review
- [ ] Security audit
- [ ] Backup encryption key rotation

## Security Notes

1. **Credentials Protection**
   - Never commit `/root/.config/rclone/rclone.conf` to git
   - Keep `/etc/wasabi-backup/encryption.key` secure (600 permissions)
   - Rotate SSH keys annually

2. **Access Control**
   - Limit SSH key permissions with `command=` restriction
   - Use IP whitelisting for Wasabi access
   - Enable MFA on Wasabi account

3. **Monitoring**
   - Set up alerts for backup failures
   - Monitor storage usage trends
   - Review validation reports weekly

## Disaster Recovery

In case of complete system failure:

1. **Prepare New VM**

   ```bash
   # Install dependencies
   apt-get update
   apt-get install -y rclone postgresql-client redis-tools rsync jq
   ```

2. **Restore Configuration**

   ```bash
   # Copy from backup or secure storage
   scp user@backup-host:/secure/rclone.conf /root/.config/rclone/
   scp user@backup-host:/secure/encryption.key /etc/wasabi-backup/
   ```

3. **List Available Backups**

   ```bash
   rclone lsf wasabi-crypt:daily/VMI01/ --dirs-only
   ```

4. **Restore Latest Backup**

   ```bash
   BACKUP_ID="backup_20250108_000000_xyz"
   rclone copy "wasabi-crypt:daily/VMI01/${BACKUP_ID}" /var/restore/
   ```

5. **Restore Services**
   - PostgreSQL: See README.md "Disaster Recovery" section
   - Redis: Copy dump.rdb and restart
   - Configs: rsync from /var/restore/etc/

## Support Contacts

- **Technical Issues**: Check logs first, then escalate
- **Wasabi Support**: https://wasabi.com/support/
- **Documentation**: `/opt/mcp-deployment/backup-dr/README.md`

## Changelog

### 2025-01-08 - Initial Deployment

- Configured Wasabi S3 with AES-256 encryption
- Implemented 6-hour snapshot schedule
- Deployed GFS rotation policy
- Enabled automated validation
- Multi-VM coordination setup

---

**Deployment Date**: 2025-01-08
**Version**: 1.0.0
**Deployed By**: System Administrator
**Next Review**: 2025-02-08
