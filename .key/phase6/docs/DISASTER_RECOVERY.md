# Disaster Recovery Plan

## Purpose

This document provides step-by-step procedures for recovering from catastrophic failures across all VMs in the MCP infrastructure.

## Disaster Scenarios

1. **Single VM Failure** - One VM becomes unrecoverable
2. **Multiple VM Failure** - Multiple VMs fail simultaneously
3. **Data Center Outage** - All VMs offline
4. **Data Corruption** - Database or filesystem corruption
5. **Ransomware/Security Breach** - Compromised systems
6. **Accidental Deletion** - Critical data deleted

## Recovery Time Objectives (RTO)

| Scenario | Target RTO | Maximum Acceptable Data Loss (RPO) |
|----------|------------|-----------------------------------|
| Single file restore | 15 minutes | 24 hours |
| Single service failure | 1 hour | 24 hours |
| Single VM failure | 4 hours | 24 hours |
| Multiple VM failure | 8 hours | 24 hours |
| Complete datacenter loss | 24 hours | 24 hours |

## Pre-Disaster Preparation

### Essential Information to Keep Offline

Store the following information in a secure, offline location (password manager, printed copy in safe):

1. **Wasabi S3 Credentials**
   ```
   Access Key ID: [WRITE DOWN]
   Secret Access Key: [WRITE DOWN]
   Bucket: vmibackups
   Region: ap-southeast-2
   Endpoint: s3.ap-southeast-2.wasabisys.com
   ```

2. **VM Credentials**
   ```
   VMI01 Root Password: [WRITE DOWN]
   VMI02D Root Password: [WRITE DOWN]
   VMI03 Root Password: [WRITE DOWN]
   SSH Key Passphrase: [WRITE DOWN]
   ```

3. **Service Credentials**
   ```
   PostgreSQL postgres user password: [WRITE DOWN]
   Redis password (if set): [WRITE DOWN]
   Keycloak admin password: [WRITE DOWN]
   ```

4. **Contact Information**
   ```
   Hosting Provider: [NAME]
   Support Phone: [NUMBER]
   Account Number: [NUMBER]
   ```

5. **Network Configuration**
   ```
   VMI01 IP: 46.250.243.123
   VMI02D IP: 46.250.241.70
   VMI03 IP: 154.26.158.31
   Gateway: [WRITE DOWN]
   DNS: [WRITE DOWN]
   ```

### Regular DR Drills

Conduct disaster recovery drills:
- **Monthly**: Single service restore test
- **Quarterly**: Full VM restore test
- **Annually**: Complete infrastructure rebuild

Document drill results and update procedures.

## Disaster Response Procedures

### Phase 1: Assessment (15-30 minutes)

#### 1.1 Identify Scope

```bash
# Check VM connectivity
ping 46.250.243.123  # VMI01
ping 46.250.241.70   # VMI02D
ping 154.26.158.31   # VMI03

# Check service status
ssh root@46.250.243.123 'systemctl status postgresql redis-server'
ssh root@154.26.158.31 'systemctl status keycloak'
```

#### 1.2 Determine Root Cause

- Hardware failure?
- Software corruption?
- Security breach?
- Human error?
- Network issue?

#### 1.3 Make Decision

| Condition | Action |
|-----------|--------|
| Service down, VM accessible | Restart service, check logs |
| VM accessible, data intact | Selective restore |
| VM accessible, data corrupted | Full restore |
| VM inaccessible | Rebuild from backup |
| Security breach | Isolate, investigate, rebuild |

### Phase 2: Containment (Immediate)

#### 2.1 For Security Incidents

```bash
# Isolate compromised systems
iptables -I INPUT -j DROP
iptables -I OUTPUT -j DROP
iptables -A INPUT -s YOUR_ADMIN_IP -j ACCEPT
iptables -A OUTPUT -d YOUR_ADMIN_IP -j ACCEPT

# Stop all services
systemctl stop '*'

# Create forensic snapshot (if possible)
dd if=/dev/vda of=/mnt/external/forensic-image.dd bs=4M status=progress
```

#### 2.2 Notify Stakeholders

**Immediate Notification:**
- Email: acampkinpersonnal@gmail.com
- Subject: `[CRITICAL] Disaster Recovery in Progress - [VM NAME]`
- Body: Include scope, estimated recovery time, current status

**Communication Template:**
```
Subject: [CRITICAL] Disaster Recovery - [VM/Service Name]

Incident: [Brief description]
Affected Systems: [List VMs/services]
Impact: [User impact]
Estimated Recovery Time: [Hours]
Current Status: [Assessment/Containment/Recovery/Verification]

Updates will be provided every [interval].
```

### Phase 3: Recovery

#### 3.1 Single VM Failure - Complete Rebuild

**Prerequisites:**
- Access to VM console or new VM
- Wasabi S3 credentials
- Network connectivity

**Procedure:**

```bash
# 1. Install fresh Ubuntu (same version as backup)
# Follow hosting provider's OS installation

# 2. Configure network
cat > /etc/netplan/01-netcfg.yaml << EOF
network:
  version: 2
  ethernets:
    eth0:
      addresses: [ORIGINAL_IP/24]
      gateway4: GATEWAY
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF
netplan apply

# 3. Install essential tools
apt update
apt install -y rclone zstd postgresql redis-server tar jq git curl wget

# 4. Configure rclone
mkdir -p /root/.config/rclone
cat > /root/.config/rclone/rclone.conf << EOF
[wasabi-vmi]
type = s3
provider = Wasabi
access_key_id = YOUR_ACCESS_KEY
secret_access_key = YOUR_SECRET_KEY
region = ap-southeast-2
endpoint = s3.ap-southeast-2.wasabisys.com
EOF
chmod 600 /root/.config/rclone/rclone.conf

# 5. Download and install restore scripts
mkdir -p /opt/backup-scripts
rclone copy wasabi-vmi:vmibackups/HOSTNAME/latest-backup/ \
  /tmp/latest-backup/ --config /root/.config/rclone/rclone.conf

# Extract restore scripts if bundled
# Or download from github/repository

# 6. Find latest backup
rclone lsf wasabi-vmi:vmibackups/HOSTNAME/ \
  --config /root/.config/rclone/rclone.conf --dirs-only | sort -r | head -1

# Record the date (e.g., 2025-01-15)
BACKUP_DATE="2025-01-15"

# 7. Restore system files
mkdir -p /var/restore/staging

# Download weekly backup (most complete)
rclone sync wasabi-vmi:vmibackups/HOSTNAME/weekly/$BACKUP_DATE/ \
  /var/restore/staging/ \
  --config /root/.config/rclone/rclone.conf \
  --progress

# 8. Verify backup integrity
cd /var/restore/staging
sha256sum -c SHA256SUMS

# 9. Restore /etc
zstd -dc files/etc_*.tar.zst | tar -xf - -C /tmp/restore-etc/
# Review and selectively copy configs
cp -a /tmp/restore-etc/etc/nginx /etc/
cp -a /tmp/restore-etc/etc/systemd/system/*.service /etc/systemd/system/
systemctl daemon-reload

# 10. Restore applications
zstd -dc files/opt_*.tar.zst | tar -xf - -C /
chown -R root:root /opt/mcp

# 11. Restore databases
cd /var/restore/staging/databases/postgresql
zstd -d *.zst

# Restore each database
for db in mcp_ecosystem keycloak; do
  sudo -u postgres createdb $db
  sudo -u postgres pg_restore -d $db ${db}_*.dump
done

# Restore globals
zstd -dc globals_*.sql.zst | sudo -u postgres psql

# 12. Restore Redis
systemctl stop redis-server
zstd -dc ../redis/dump_*.rdb.zst > /var/lib/redis/dump.rdb
chown redis:redis /var/lib/redis/dump.rdb
systemctl start redis-server

# 13. Start services
systemctl start postgresql redis-server nginx
systemctl start mcp-*

# 14. Verify
systemctl status postgresql redis-server
sudo -u postgres psql -c "\l"
redis-cli PING
curl http://localhost:8080/health
```

#### 3.2 Database Corruption Recovery

```bash
# 1. Stop affected services
systemctl stop mcp-* nginx

# 2. Stop database
systemctl stop postgresql

# 3. Backup corrupted database
mv /var/lib/postgresql /var/lib/postgresql.corrupted

# 4. Restore database from backup
mkdir -p /var/lib/postgresql
chown postgres:postgres /var/lib/postgresql

# 5. Download latest database backup
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/latest/databases/postgresql/ \
  /tmp/db-restore/ --config /root/.config/rclone/rclone.conf

# 6. Initialize new cluster
sudo -u postgres /usr/lib/postgresql/14/bin/initdb \
  -D /var/lib/postgresql/14/main

# 7. Start PostgreSQL
systemctl start postgresql

# 8. Restore databases
cd /tmp/db-restore
zstd -d *.zst
for dump in *.dump; do
  db=$(basename $dump .dump | sed 's/_[0-9].*$//')
  sudo -u postgres createdb $db
  sudo -u postgres pg_restore -d $db $dump
done

# 9. Verify
sudo -u postgres psql -c "\l"

# 10. Restart services
systemctl start mcp-* nginx
```

#### 3.3 Ransomware Recovery

**Critical Steps:**

1. **Do NOT pay ransom** - No guarantee of data recovery
2. **Isolate immediately** - Prevent spread
3. **Preserve evidence** - May need for investigation
4. **Report to authorities** - Required in many jurisdictions

```bash
# 1. Isolate all VMs
# (Use hosting provider's network isolation if possible)

# 2. Create forensic images
dd if=/dev/vda of=/mnt/external/forensic-vmi01.img bs=4M

# 3. Provision new VMs with different IPs
# (Attackers may have backdoors)

# 4. Restore from OLDEST KNOWN GOOD BACKUP
# (Ransomware may have been dormant for weeks)

# Check multiple backup dates
for date in $(rclone lsf wasabi-vmi:vmibackups/vmi01/ --dirs-only | sort -r); do
  echo "Checking $date"
  rclone ls wasabi-vmi:vmibackups/vmi01/$date/ | head -5
done

# 5. Restore to new VMs (follow Single VM Failure procedure)

# 6. Harden security BEFORE connecting to internet
# - Change all passwords
# - Update all software
# - Review and remove unauthorized access
# - Enable MFA
# - Review firewall rules
# - Enable stricter logging

# 7. Monitor closely for 30 days
# - Check for persistence mechanisms
# - Review all scheduled tasks
# - Monitor network connections
# - Check for unauthorized users/processes
```

### Phase 4: Verification (1-2 hours)

#### 4.1 System Verification Checklist

```bash
# Network connectivity
ping -c 3 8.8.8.8

# DNS resolution
nslookup google.com

# Disk space
df -h

# Memory
free -h

# Services
systemctl status postgresql redis-server nginx

# Database integrity
sudo -u postgres psql -c "SELECT version();"
redis-cli PING

# Application health
curl http://localhost:8080/health

# Logs
journalctl -xe --no-pager | grep -i error

# Cron jobs
crontab -l
ls -la /etc/cron.d/

# Backup scripts
ls -la /opt/backup-scripts/
```

#### 4.2 Data Verification

```bash
# Database record counts
sudo -u postgres psql mcp_ecosystem -c "
  SELECT schemaname, tablename, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 20;
"

# Recent data
sudo -u postgres psql mcp_ecosystem -c "
  SELECT COUNT(*), MAX(created_at)
  FROM users;
"

# Redis keys
redis-cli DBSIZE
redis-cli --scan --pattern 'session:*' | head -10

# File integrity
find /opt/mcp -type f -name "*.json" -exec jq empty {} \;
```

#### 4.3 Application Verification

Test all critical functions:
- User login
- API endpoints
- Database queries
- File uploads
- Email sending
- Background jobs

### Phase 5: Post-Recovery (24-48 hours)

#### 5.1 Root Cause Analysis

Document:
- What happened?
- When did it start?
- How was it detected?
- What was the root cause?
- How was it resolved?
- What data was lost?
- How long was the outage?

#### 5.2 Update Procedures

Based on lessons learned:
- Update runbooks
- Improve monitoring
- Add alerts
- Enhance backups
- Document gaps

#### 5.3 Stakeholder Report

Provide formal report:
```
DISASTER RECOVERY REPORT

Incident ID: [DATE-TIME]
Affected Systems: [LIST]
Duration: [HOURS]
Data Loss: [DESCRIPTION]

Timeline:
- [TIME] Issue detected
- [TIME] Team notified
- [TIME] Recovery started
- [TIME] Services restored
- [TIME] Full verification complete

Root Cause: [DESCRIPTION]

Recovery Actions Taken:
1. [ACTION]
2. [ACTION]

Lessons Learned:
1. [LESSON]
2. [LESSON]

Prevention Measures:
1. [MEASURE]
2. [MEASURE]

Next Review Date: [DATE]
```

## Special Scenarios

### Complete Data Center Loss

1. **Provision new VMs** at different provider
2. **Configure networking** with new IPs
3. **Restore from S3** (backups are off-site)
4. **Update DNS** to point to new IPs
5. **Notify users** of IP changes if needed

### Backup System Failure

If Wasabi becomes unavailable:

1. **Stop all backups** to prevent errors
2. **Enable local backups** temporarily
3. **Contact Wasabi support**
4. **Activate secondary backup** (if configured)
5. **Document outage** for SLA credits

### SSH Key Loss

If SSH keys are lost but VM is accessible:

```bash
# Via VM console:
# 1. Login with password (if enabled)
# 2. Generate new SSH key
ssh-keygen -t ed25519 -C "recovery-key"

# 3. Add to authorized_keys
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

# 4. Backup new private key IMMEDIATELY
cat ~/.ssh/id_ed25519  # Copy to secure location
```

## Testing & Maintenance

### Monthly Tests

```bash
# 1. Verify latest backup exists
rclone ls wasabi-vmi:vmibackups/$(hostname -s)/$(date +%Y-%m-%d)/

# 2. Download and verify manifest
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/latest/backup-manifest.json /tmp/
jq . /tmp/backup-manifest.json

# 3. Test restore single file
# (documented in RESTORE_GUIDE.md)

# 4. Verify monitoring alerts
# (trigger test alert)

# 5. Document results
```

### Quarterly Full Restore Test

Spin up test VM and perform complete restore. Document:
- Time taken
- Issues encountered
- Data verification results
- Lessons learned

## Emergency Contact Tree

```
Level 1: Primary Administrator
  └─> Email: acampkinpersonnal@gmail.com
       └─> Response Time: 30 minutes

Level 2: Hosting Provider Support
  └─> [Provider Name]
       └─> Phone: [Number]
       └─> Response Time: 1 hour

Level 3: Wasabi Support
  └─> support@wasabi.com
       └─> Phone: +1-844-WASABI-1
       └─> Response Time: 2 hours (business hours)
```

## Recovery Decision Matrix

| Data Loss | Downtime Acceptable | Recovery Method |
|-----------|-------------------|-----------------|
| < 1 hour | < 15 min | Service restart |
| < 24 hours | < 1 hour | Selective restore |
| < 1 week | < 4 hours | Full VM restore |
| > 1 week | Any | Rebuild from oldest backup |

## Appendices

### A. Quick Command Reference

```bash
# List backups
rclone lsf wasabi-vmi:vmibackups/$(hostname -s)/ --dirs-only

# Download latest backup manifest
rclone copy wasabi-vmi:vmibackups/$(hostname -s)/latest/backup-manifest.json /tmp/

# Start restore wizard
/opt/backup-scripts/restore-from-s3.sh

# Verify backup
/opt/backup-scripts/verify-backup.sh

# Check service status
systemctl status postgresql redis-server nginx
```

### B. Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Permission denied" | SSH key issue | Use password or VM console |
| "Connection refused" | Service down | systemctl start SERVICE |
| "No such file" | Missing backup | Check backup date |
| "Disk full" | No space | Clean /tmp, /var/backups |

### C. Recovery Time Log Template

```
VM: _______________
Backup Date: _______________
Recovery Start: _______________
Recovery End: _______________
Total Time: _______________ hours

Steps Completed:
[ ] Fresh OS install
[ ] Network configured
[ ] Tools installed
[ ] Backup downloaded
[ ] Files restored
[ ] Databases restored
[ ] Services started
[ ] Verification passed

Issues Encountered:
_______________________
_______________________

Notes:
_______________________
_______________________
```
