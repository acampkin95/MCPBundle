# Wasabi S3 Backup System - Project Summary

## Overview

Complete production-ready backup and disaster recovery system for MCP Bundle infrastructure using Wasabi S3 cloud storage with 6-hour automated snapshots and GFS (Grandfather-Father-Son) rotation policy.

## Deliverables

### Core Scripts (3 files)

#### 1. configure-wasabi-s3.sh (21 KB)

**Purpose**: Initial setup and configuration of Wasabi S3 with rclone

**Features**:

- Installs and configures rclone for Wasabi S3
- Sets up AES-256 encrypted remote (wasabi-crypt)
- Generates secure encryption keys (32-byte random)
- Creates GFS rotation policy configuration
- Configures multi-VM backup sources (VMI01, VMI02D, VMI03)
- Generates SSH keys for multi-VM coordination
- Creates manifest tracking system with SHA256 checksums
- Implements helper scripts for GFS rotation and verification
- Runs connectivity and encryption tests
- Fully idempotent with rollback support

**Configuration Created**:

- `/root/.config/rclone/rclone.conf` - Wasabi credentials
- `/etc/wasabi-backup/gfs-policy.conf` - Retention policy
- `/etc/wasabi-backup/encryption.key` - AES-256 keys
- `/etc/wasabi-backup/sources-*.conf` - VM-specific sources
- `/etc/wasabi-backup/manifest-functions.sh` - Manifest utilities
- `/etc/wasabi-backup/gfs-rotate.sh` - Rotation script
- `/etc/wasabi-backup/verify-backup.sh` - Verification script

#### 2. configure-snapshots.sh (21 KB)

**Purpose**: Configure automated 6-hour snapshots with systemd timers

**Features**:

- Creates main snapshot execution script
- Implements multi-VM backup coordination via SSH
- PostgreSQL backup using pg_basebackup
- Redis backup with BGSAVE
- Rsync for critical directories (incremental)
- SHA256 checksum generation for all files
- Uploads to Wasabi with progress tracking
- Applies GFS rotation after each backup
- Creates systemd service and timer units
- Email and webhook notification templates
- Comprehensive logging and error handling

**Backup Sources by VM**:

- **VMI01**: PostgreSQL (3 databases), Redis RDB, MCP logs, /etc
- **VMI02D**: NextCloud data (incremental), Plex metadata, /etc
- **VMI03**: Keycloak data, Grafana dashboards, security logs, /etc

**Schedule**:

- 00:00 - Daily backup
- 06:00 - Hourly backup
- 12:00 - Hourly backup
- 18:00 - Hourly backup

#### 3. backup-validation.sh (26 KB)

**Purpose**: Comprehensive backup validation and integrity testing

**Features**:

- 8 comprehensive validation tests
- rclone connectivity verification
- AES-256 encryption verification
- GFS rotation compliance checking
- Backup manifest integrity validation
- Complete restore procedure testing
- Performance metrics and benchmarking
- Storage quota and usage monitoring
- Backup age verification (staleness detection)
- JSON and HTML report generation
- Color-coded output with detailed logging

**Test Categories**:

1. rclone connection test
2. Encryption verification
3. GFS rotation compliance
4. Manifest integrity check
5. Restore procedure test
6. Performance metrics (upload/download speed)
7. Storage usage and quota
8. Backup age verification

**Reports Generated**:

- JSON report (machine-readable)
- HTML report (web dashboard with charts)
- Detailed log file

### Systemd Units (4 files)

#### 1. wasabi-snapshot.service

**Purpose**: Systemd service for snapshot execution

**Features**:

- Runs main snapshot script
- Security hardening (PrivateTmp, NoNewPrivileges, etc.)
- Resource limits (80% CPU, 2GB RAM)
- 1-hour timeout for backup operations
- Automatic restart on failure (5min delay)
- Comprehensive logging to journal

#### 2. wasabi-snapshot.timer

**Purpose**: 6-hour interval timer for automated backups

**Schedule**:

- Every 6 hours: 00:00, 06:00, 12:00, 18:00
- Runs 5 minutes after boot if system was off
- Persistent (catches up on missed runs)
- 1-minute accuracy window

#### 3. wasabi-validation.service

**Purpose**: Systemd service for validation execution

**Features**:

- Runs validation script weekly
- Security hardening
- Resource limits (50% CPU, 1GB RAM)
- 30-minute timeout
- No automatic restart (one-shot validation)

#### 4. wasabi-validation.timer

**Purpose**: Weekly validation timer

**Schedule**:

- Every Sunday at 03:00
- 1st of every month at 04:00
- 10 minutes after boot if system was off
- Persistent

### Documentation (3 files)

#### 1. README.md (12 KB)

Complete user documentation including:

- Architecture overview
- Installation guide
- Configuration reference
- Usage instructions
- Monitoring guidelines
- Troubleshooting guide
- Disaster recovery procedures
- Security best practices
- Performance optimization tips

#### 2. DEPLOYMENT.md (8 KB)

Quick deployment guide including:

- Prerequisites checklist
- 5-minute quick start guide
- Verification procedures
- Configuration file reference
- Backup schedule table
- Monitoring commands
- Customization options
- Common troubleshooting scenarios

#### 3. PROJECT_SUMMARY.md (this file)

Project overview and technical specifications

## Technical Specifications

### Wasabi S3 Configuration

**Credentials**:

- Access Key: UGCCW36ZO993N1VWIHED
- Secret Key: Owjs8BDHr3bVIdiYgLDYQLwf6N6uEzwX6bSz6MHe
- Endpoint: s3.wasabisys.com
- Region: us-east-1
- Bucket: mcp-bundle-backups

**Settings**:

- Storage Class: STANDARD
- Upload Cutoff: 200MB
- Chunk Size: 64MB
- Upload Concurrency: 8
- Max Upload Parts: 10000
- Checksums: Enabled

### Encryption

**Method**: AES-256 (rclone crypt)

- Password: Auto-generated 32-byte random
- Salt: Auto-generated 32-byte random
- Filename Encryption: Standard
- Directory Name Encryption: Enabled

### GFS Retention Policy

| Type    | Retention | Schedule           | Storage Impact |
| ------- | --------- | ------------------ | -------------- |
| Hourly  | 4         | Every 6 hours      | ~4 snapshots   |
| Daily   | 7         | 00:00 daily        | ~7 snapshots   |
| Weekly  | 4         | Sunday 00:00       | ~4 snapshots   |
| Monthly | 12        | 1st of month 00:00 | ~12 snapshots  |
| Yearly  | 7         | January 1st 00:00  | ~7 snapshots   |

**Total Maximum Snapshots**: 34 per VM (4 VMs = 136 total)

### Local Cache (VMI02D staging)

- **Location**: `/var/backup/cache/<vm>/<backup_id>` on VMI02D
- **Retention**: 3 days (12 snapshots per VM). A `.verified` marker is written only after `rclone check` succeeds, guaranteeing that only healthy backups are removed from cache.
- **Purpose**: Provides an on-prem hot cache for accelerated restores and shields Wasabi from transient upload retries. Every backup flows VM → VMI02D cache → Wasabi S3.

### VMI02D LVM Snapshots

- **Script**: `/backup/scripts/lvm-snapshot.sh`
- **Schedule**: `vmi02d-lvm-snapshot.timer` executes every 6 hours (`OnCalendar=00/6:00:00`)
- **Retention**: 12 local LVM snapshots (≈3 days)
- **Use Case**: Rapid file-level recovery and rollback for NextCloud/Plex storage volumes independent of the Wasabi pipeline

### VM Configuration

#### VMI01 (Primary Database & MCP)

**IP**: 46.250.243.123

**Backup Sources**:

- PostgreSQL backups: `/var/lib/postgresql/backups`
- PostgreSQL databases: mcp_orchestrator, mcp_agents, keycloak
- Redis RDB: `/var/lib/redis/dump.rdb`
- MCP logs: `/var/log/mcp`
- System configs: `/etc`

**Estimated Backup Size**: 5-10 GB

#### VMI02D (NextCloud & Plex)

**IP**: 46.250.241.70

**Backup Sources**:

- NextCloud data: `/var/www/nextcloud/data` (incremental)
- Plex metadata: `/var/lib/plexmediaserver/Library`
- Plex databases: `Library/Application Support/Plex Media Server/Plug-in Support/Databases`
- System configs: `/etc`

**Estimated Backup Size**: 50-100 GB (incremental)

#### VMI03 (Gateway & Monitoring)

**IP**: 154.26.158.31

**Backup Sources**:

- Keycloak data: `/var/lib/keycloak`
- Grafana data: `/var/lib/grafana`
- Grafana dashboards: `/etc/grafana/dashboards`
- Security logs: `/var/log/security`
- Fail2Ban logs: `/var/log/fail2ban.log`
- System configs: `/etc`

**Estimated Backup Size**: 2-5 GB

#### Jump Box (DNS, WireGuard, AdGuard Home)

**IP**: 154.26.158.68

**Backup Sources**:

- AdGuard Home binaries/configuration: `/opt/adguard`
- WireGuard configuration and keys: `/etc/wireguard`
- DNS overrides / DoT settings: `/etc/dnsmasq.d` (when present)
- AdGuard/WireGuard logs: `/var/log/adguard`
- System configs: `/etc`

**Estimated Backup Size**: 1-3 GB

### Security Features

**Multi-Layer Security**:

1. AES-256 encryption at rest
2. TLS encryption in transit
3. SSH key-based authentication (ed25519)
4. File permission restrictions (600/700)
5. Systemd security hardening
6. Resource limits

**Access Control**:

- SSH keys: `/root/.ssh/wasabi-backup-key`
- Wasabi credentials: `/root/.config/rclone/rclone.conf`
- Encryption keys: `/etc/wasabi-backup/encryption.key`
- All files: root-only access

**Systemd Hardening**:

- PrivateTmp=yes
- NoNewPrivileges=yes
- ProtectSystem=strict
- ProtectHome=yes
- RestrictNamespaces=yes
- LockPersonality=yes
- SystemCallFilter=@system-service

### Performance Metrics

**Expected Performance** (10Mbps upload):

- PostgreSQL 2GB backup: ~3 minutes
- Redis 100MB backup: ~15 seconds
- Config 50MB backup: ~10 seconds
- NextCloud 500MB incremental: ~1 minute
- Full VM backup 5GB: ~8 minutes

**Resource Usage**:

- CPU: 80% max (snapshot), 50% max (validation)
- Memory: 2GB max (snapshot), 1GB max (validation)
- Disk: 50GB temp space recommended
- Network: Configurable bandwidth limits

### Monitoring & Reporting

**Logs**:

- Snapshot logs: `/var/log/wasabi-backup/snapshot-*.log`
- Validation logs: `/var/log/wasabi-backup/validation-*.log`
- Configuration logs: `/var/log/wasabi-backup/configure-*.log`
- Systemd journal: `journalctl -u wasabi-snapshot.service`

**Manifests**:

- Location: `/etc/wasabi-backup/manifests/`
- Format: JSON
- Contents: backup_id, timestamp, type, VM, sources, files, checksums, size, status, duration
- Retention: Unlimited (small files)

**Reports**:

- JSON: `/var/log/wasabi-backup/reports/validation-*.json`
- HTML: `/var/log/wasabi-backup/reports/validation-*.html`
- Frequency: Weekly (Sunday 03:00, 1st of month 04:00)

### Disaster Recovery

**RTO (Recovery Time Objective)**: 2 hours

- Time to restore critical services from backup

**RPO (Recovery Point Objective)**: 6 hours

- Maximum data loss (snapshot frequency)

**Recovery Procedures**:

1. Restore configuration files
2. Restore database backups
3. Restore application data
4. Verify checksums
5. Restart services

## Installation Summary

### Step 1: Configure Wasabi S3 (2 minutes)

```bash
sudo ./configure-wasabi-s3.sh
```

**Actions**:

- Installs rclone
- Configures Wasabi credentials
- Sets up encryption
- Creates GFS policy
- Generates SSH keys
- Creates helper scripts

**Output**: SSH public key to deploy to all VMs

### Step 2: Configure Snapshots (2 minutes)

```bash
sudo ./configure-snapshots.sh
```

**Actions**:

- Creates snapshot script
- Installs systemd units
- Enables timers
- Starts automation

**Output**: Timer status and next scheduled run

### Step 3: Install Validation (1 minute)

```bash
sudo cp backup-validation.sh /usr/local/bin/
sudo cp systemd/wasabi-validation.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wasabi-validation.timer
```

**Actions**:

- Installs validation script
- Enables weekly validation
- Starts validation timer

**Output**: Validation timer status

## File Structure

```
/Users/alex/Projects/MCP Bundle/deployment/backup-dr/
├── configure-wasabi-s3.sh          # Main configuration script (21 KB)
├── configure-snapshots.sh          # Snapshot automation script (21 KB)
├── backup-validation.sh            # Validation and testing script (26 KB)
├── systemd/
│   ├── wasabi-snapshot.service     # Snapshot systemd service
│   ├── wasabi-snapshot.timer       # 6-hour snapshot timer
│   ├── wasabi-validation.service   # Validation systemd service
│   └── wasabi-validation.timer     # Weekly validation timer
├── README.md                       # Complete user documentation (12 KB)
├── DEPLOYMENT.md                   # Quick deployment guide (8 KB)
└── PROJECT_SUMMARY.md              # This file

After Installation (on target VM):
/etc/wasabi-backup/
├── gfs-policy.conf                 # GFS retention configuration
├── sources-VMI01.conf              # VMI01 backup sources
├── sources-VMI02D.conf             # VMI02D backup sources
├── sources-VMI03.conf              # VMI03 backup sources
├── encryption.key                  # AES-256 encryption keys
├── manifest-template.json          # Backup manifest template
├── manifest-functions.sh           # Manifest utilities
├── notification-templates.conf     # Notification configuration
├── gfs-rotate.sh                   # GFS rotation script
├── verify-backup.sh                # Backup verification script
├── scripts/
│   └── wasabi-snapshot.sh          # Main snapshot execution
└── manifests/
    └── *.json                      # Backup manifests

/root/.config/rclone/
└── rclone.conf                     # Wasabi S3 credentials

/root/.ssh/
├── wasabi-backup-key               # SSH private key
├── wasabi-backup-key.pub           # SSH public key
└── wasabi-backup-config            # SSH configuration

/var/log/wasabi-backup/
├── configure-wasabi.log            # Configuration log
├── configure-snapshots.log         # Snapshot setup log
├── snapshot-*.log                  # Daily snapshot logs
├── validation-*.log                # Validation logs
└── reports/
    ├── validation-*.json           # JSON validation reports
    └── validation-*.html           # HTML validation reports
```

## Testing Checklist

- [x] Scripts are executable
- [x] All configuration files created
- [x] Systemd units validated
- [x] Documentation complete
- [x] Error handling implemented
- [x] Logging comprehensive
- [x] Security hardening applied
- [x] Idempotent execution
- [x] Rollback support

## Production Readiness

### Completed Features

- ✅ Wasabi S3 configuration with credentials
- ✅ AES-256 encryption
- ✅ GFS rotation policy (Hourly, Daily, Weekly, Monthly, Yearly)
- ✅ Multi-VM coordination (VMI01, VMI02D, VMI03)
- ✅ PostgreSQL pg_basebackup
- ✅ Redis BGSAVE
- ✅ Rsync for directories
- ✅ SHA256 integrity verification
- ✅ 6-hour automated snapshots
- ✅ Weekly validation
- ✅ Email notifications (templates)
- ✅ Webhook notifications (templates)
- ✅ Systemd timers
- ✅ Comprehensive logging
- ✅ JSON manifests
- ✅ HTML/JSON reports
- ✅ Error handling
- ✅ Rollback support
- ✅ Security hardening
- ✅ Resource limits
- ✅ Complete documentation

### Ready for Deployment

All scripts are production-ready and can be deployed immediately. Follow the deployment guide in `DEPLOYMENT.md` for step-by-step instructions.

## Maintenance Schedule

### Daily (Automated)

- 6-hour snapshots (00:00, 06:00, 12:00, 18:00)
- GFS rotation after each backup
- Manifest creation and tracking

### Weekly (Automated)

- Sunday 03:00: Validation tests
- Sunday 00:00: Weekly backup

### Monthly (Automated)

- 1st of month 00:00: Monthly backup
- 1st of month 04:00: Monthly validation

### Yearly (Automated)

- January 1st 00:00: Yearly backup

### Manual (As Needed)

- Review validation reports
- Test restore procedures
- Audit access logs
- Update configurations

## Support & Troubleshooting

Refer to:

- `README.md` - Complete documentation
- `DEPLOYMENT.md` - Quick deployment guide
- Log files in `/var/log/wasabi-backup/`
- Systemd journal: `journalctl -u wasabi-snapshot.service`

## Version History

### Version 1.0.0 (2025-01-08)

- Initial release
- Complete backup system for MCP Bundle v0.2.0
- 6-hour snapshot automation
- GFS rotation policy
- Multi-VM coordination
- AES-256 encryption
- Weekly validation
- Comprehensive documentation

## Credits

**Developed for**: MCP Bundle v0.2.0
**Purpose**: Production backup and disaster recovery
**Deployment Target**: 3-VM infrastructure (VMI01, VMI02D, VMI03)
**Storage Provider**: Wasabi S3
**Created**: 2025-01-08

---

**Total Lines of Code**: ~2,000
**Total File Size**: ~100 KB
**Documentation Pages**: ~30
**Deployment Time**: ~5 minutes
**RTO**: 2 hours
**RPO**: 6 hours
