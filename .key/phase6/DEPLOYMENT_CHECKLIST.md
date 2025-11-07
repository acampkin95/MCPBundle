# Deployment Checklist - Wasabi S3 Backup System

## Pre-Deployment

### Wasabi S3 Setup
- [ ] Create Wasabi account (if not already done)
- [ ] Create bucket: `vmibackups`
- [ ] Region: AP Southeast 2
- [ ] Generate API credentials (Access Key + Secret Key)
- [ ] Save credentials securely (password manager)
- [ ] Enable bucket versioning (optional, for extra safety)
- [ ] Configure bucket lifecycle policies (optional)

### Credentials Preparation
- [ ] Note Access Key ID
- [ ] Note Secret Access Key
- [ ] Test credentials with Wasabi console
- [ ] Store credentials in password manager
- [ ] Prepare printed backup of credentials

### Network Verification
- [ ] Verify SSH access to VMI01 (46.250.243.123)
- [ ] Verify SSH access to VMI02D (46.250.241.70)
- [ ] Verify SSH access to VMI03 (154.26.158.31)
- [ ] Verify VMs can reach internet
- [ ] Verify VMs can resolve DNS
- [ ] Test connection to s3.ap-southeast-2.wasabisys.com

### Local Preparation
- [ ] Clone/download backup scripts to local machine
- [ ] Review deployment script: `deploy-backups.sh`
- [ ] Verify SSH key exists: `~/.ssh/id_ed25519`
- [ ] Install required tools (rsync, ssh, scp)

## Deployment to VMI01

### Initial Setup
- [ ] SSH into VMI01: `ssh root@46.250.243.123`
- [ ] Check disk space: `df -h` (need ~20GB free)
- [ ] Check PostgreSQL running: `systemctl status postgresql`
- [ ] Check Redis running: `systemctl status redis-server`
- [ ] Note current disk usage for comparison

### Deploy Scripts
- [ ] Run: `./deploy-backups.sh --vm vmi01`
- [ ] Enter Wasabi credentials when prompted
- [ ] Verify deployment completes without errors
- [ ] Check scripts installed: `ls -la /opt/backup-scripts/`

### Verify Installation
- [ ] Test rclone config: `rclone lsd wasabi-vmi:vmibackups`
- [ ] Check systemd timers: `systemctl list-timers backup-*`
- [ ] Verify cron jobs: `ls -la /etc/cron.d/`
- [ ] Check dependencies: `rclone --version && zstd --version`
- [ ] Verify log directory: `ls -la /var/log/backups/`

### Test Backup
- [ ] Run dry-run: `/opt/backup-scripts/backup-to-s3.sh --dry-run`
- [ ] Review dry-run output for errors
- [ ] Run actual backup: `/opt/backup-scripts/backup-to-s3.sh`
- [ ] Monitor progress (may take 15-30 minutes)
- [ ] Check for email notification
- [ ] Verify backup in S3: `rclone ls wasabi-vmi:vmibackups/vmi01/`

### Verify Backup
- [ ] Run verification: `/opt/backup-scripts/verify-backup.sh`
- [ ] Check backup manifest exists
- [ ] Verify checksums pass
- [ ] Check backup size is reasonable
- [ ] Test database dumps can be listed

### Initialize Git Tracking
- [ ] Verify /etc git initialized: `cd /etc && git log`
- [ ] Check git bundle in S3
- [ ] Test manual commit: `/opt/backup-scripts/etc-git-tracker.sh --commit`

### VMI01 Final Checks
- [ ] Timers active: `systemctl is-active backup-daily.timer`
- [ ] Logs clean: `journalctl -u backup-daily.service -n 50`
- [ ] Email notification received
- [ ] S3 bucket contains backup
- [ ] Document any issues encountered

## Deployment to VMI02D

### Initial Setup
- [ ] SSH into VMI02D: `ssh root@46.250.241.70`
- [ ] Check disk space: `df -h` (968GB disk, need space)
- [ ] Note current disk usage
- [ ] Identify large directories to potentially exclude

### Deploy Scripts
- [ ] Run: `./deploy-backups.sh --vm vmi02d`
- [ ] Verify deployment completes
- [ ] Check scripts installed: `ls -la /opt/backup-scripts/`

### Verify Installation
- [ ] Test rclone config: `rclone lsd wasabi-vmi:vmibackups`
- [ ] Check systemd timers: `systemctl list-timers backup-*`
- [ ] Verify dependencies installed

### Test Backup
- [ ] Run dry-run: `/opt/backup-scripts/backup-to-s3.sh --dry-run`
- [ ] Review what will be backed up
- [ ] Adjust exclusions if needed (edit config/backup-exclude.txt)
- [ ] Run actual backup: `/opt/backup-scripts/backup-to-s3.sh`
- [ ] Monitor progress (may be longer due to 968GB disk)

### Verify Backup
- [ ] Run verification: `/opt/backup-scripts/verify-backup.sh --quick`
- [ ] Check backup size
- [ ] Verify backup in S3

### VMI02D Final Checks
- [ ] Timers active
- [ ] Email notification received
- [ ] Backup completed successfully
- [ ] No disk space issues

## Deployment to VMI03

### Initial Setup
- [ ] SSH into VMI03: `ssh root@154.26.158.31`
- [ ] Check disk space: `df -h`
- [ ] Check Keycloak status: `systemctl status keycloak`
- [ ] Note current disk usage

### Deploy Scripts
- [ ] Run: `./deploy-backups.sh --vm vmi03`
- [ ] Verify deployment completes
- [ ] Check scripts installed

### Verify Installation
- [ ] Test rclone config
- [ ] Check systemd timers
- [ ] Verify dependencies

### Test Backup
- [ ] Run dry-run
- [ ] Run actual backup
- [ ] Monitor progress

### Verify Backup
- [ ] Run verification
- [ ] Check Keycloak data backed up
- [ ] Verify in S3

### VMI03 Final Checks
- [ ] Timers active
- [ ] Email notification received
- [ ] Backup completed successfully

## Post-Deployment Verification

### All VMs
- [ ] Check S3 bucket structure:
  ```
  vmibackups/
  ├── vmi01/[date]/
  ├── vmi02d/[date]/
  └── vmi03/[date]/
  ```
- [ ] Verify total storage used in Wasabi console
- [ ] Check estimated monthly cost
- [ ] Confirm email notifications for all VMs

### Monitoring Setup
- [ ] Add backup metrics to Prometheus (if used)
- [ ] Configure Grafana dashboard (if used)
- [ ] Set up AlertManager rules (if used)
- [ ] Test alert notifications

### Documentation
- [ ] Review BACKUP_GUIDE.md with team
- [ ] Review RESTORE_GUIDE.md with team
- [ ] Review DISASTER_RECOVERY.md with team
- [ ] Update any custom procedures
- [ ] Document Wasabi credentials location

## Testing Schedule Setup

### Immediate (Week 1)
- [ ] Day 1: Deploy to all VMs
- [ ] Day 2: Verify daily backups ran
- [ ] Day 3: Test selective file restore
- [ ] Day 4: Review backup logs
- [ ] Day 5: Test database restore to temp location
- [ ] Day 6: Verify weekly backup ran (if Sunday)
- [ ] Day 7: Document any issues

### Week 2
- [ ] Test restore wizard on test VM
- [ ] Verify retention cleanup works
- [ ] Test monitoring alerts
- [ ] Practice restore procedures

### Monthly
- [ ] First Monday: Review backup sizes
- [ ] Mid-month: Test restore drill
- [ ] End of month: Verify retention policy

### Quarterly
- [ ] Full system restore test
- [ ] Update documentation
- [ ] Review and update exclusion patterns
- [ ] Audit backup coverage

## Troubleshooting Reference

### Common Issues

**Issue: S3 Connection Failed**
```bash
# Check credentials
cat /root/.config/rclone/rclone.conf | grep -v secret

# Test connectivity
rclone lsd wasabi-vmi:vmibackups --config /root/.config/rclone/rclone.conf -vv

# Verify endpoint
curl -I https://s3.ap-southeast-2.wasabisys.com
```

**Issue: Backup Script Fails**
```bash
# Check logs
tail -100 /var/log/backups/backup-*.log

# Check permissions
ls -la /opt/backup-scripts/

# Run with verbose mode
/opt/backup-scripts/backup-to-s3.sh --verbose
```

**Issue: Email Not Sending**
```bash
# Test mail
echo "Test" | mail -s "Test" acampkinpersonnal@gmail.com

# Check mail logs
tail -f /var/log/mail.log

# Install mail if missing
apt install mailutils
```

**Issue: Disk Space Full**
```bash
# Check space
df -h

# Clean staging
rm -rf /var/backups/s3-staging/*

# Check large files
du -sh /var/backups/*
```

## Rollback Procedure

If deployment fails and you need to rollback:

```bash
# Remove scripts
rm -rf /opt/backup-scripts

# Disable timers
systemctl disable --now backup-daily.timer
systemctl disable --now backup-weekly.timer

# Remove systemd units
rm -f /etc/systemd/system/backup-*.{service,timer}
systemctl daemon-reload

# Remove cron jobs
rm -f /etc/cron.d/backup-*

# Remove rclone config
rm -f /root/.config/rclone/rclone.conf

# Clean staging directories
rm -rf /var/backups/s3-staging*
```

## Success Criteria

Deployment is considered successful when:

✅ **All VMs:**
- [ ] Scripts installed to /opt/backup-scripts/
- [ ] Systemd timers active
- [ ] S3 connectivity working
- [ ] First backup completed
- [ ] Backup verification passed
- [ ] Email notification received

✅ **S3 Bucket:**
- [ ] Contains backups for all 3 VMs
- [ ] Manifests are valid JSON
- [ ] Checksums present
- [ ] Total size < expected (check estimates)

✅ **Monitoring:**
- [ ] Metrics available
- [ ] Alerts configured
- [ ] Logs accessible
- [ ] No critical errors

✅ **Documentation:**
- [ ] Team briefed
- [ ] Credentials stored securely
- [ ] Restore procedures reviewed
- [ ] DR plan in place

## Next Steps After Deployment

1. **Week 1-2: Monitor Closely**
   - Check daily that backups run
   - Review logs for warnings
   - Verify backup sizes are consistent
   - Ensure no disk space issues

2. **Week 3-4: Optimize**
   - Review backup sizes
   - Adjust exclusions if needed
   - Fine-tune retention policies
   - Optimize backup windows

3. **Month 2: First Restore Drill**
   - Schedule maintenance window
   - Perform full restore test
   - Document time required
   - Update procedures

4. **Ongoing:**
   - Monthly restore tests
   - Quarterly DR drills
   - Review costs monthly
   - Update documentation

## Sign-Off

Deployment completed by: ________________

Date: ________________

All checklist items completed: [ ] Yes [ ] No

Issues encountered: ____________________________________

Notes: ____________________________________________
