# Wasabi S3 Backup System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Wasabi S3 Backup System                         │
│                    Production Infrastructure                        │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   VMI01          │      │   VMI02D         │      │   VMI03          │
│   Dev/MCP        │      │   Storage        │      │   Security GW    │
│   46.250.243.123 │      │   46.250.241.70  │      │   154.26.158.31  │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         │ Daily: 2 AM             │ Daily: 2 AM             │ Daily: 2 AM
         │ Weekly: Sun 3 AM        │ Weekly: Sun 3 AM        │ Weekly: Sun 3 AM
         │                         │                         │
         ├─────────────────────────┼─────────────────────────┤
         │                                                   │
         │              rclone sync over HTTPS               │
         │              (AES-256 encryption)                 │
         │                                                   │
         └───────────────────┬───────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │   Wasabi S3 Bucket   │
                  │     vmibackups       │
                  │  AP Southeast 2      │
                  │   (Sydney Region)    │
                  └──────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐         ┌────▼────┐        ┌────▼────┐
    │  vmi01  │         │ vmi02d  │        │  vmi03  │
    │ backups │         │ backups │        │ backups │
    └─────────┘         └─────────┘        └─────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Each VM Instance                           │
└─────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│  Scheduling Layer                                                  │
├───────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐         ┌──────────────────┐               │
│  │ systemd timers   │         │  cron jobs       │               │
│  │ (primary)        │         │  (alternative)   │               │
│  ├──────────────────┤         ├──────────────────┤               │
│  │ backup-daily     │         │ daily-backup     │               │
│  │ backup-weekly    │         │ weekly-backup    │               │
│  └────────┬─────────┘         └────────┬─────────┘               │
└───────────┼──────────────────────────────┼────────────────────────┘
            │                              │
┌───────────▼──────────────────────────────▼────────────────────────┐
│  Backup Scripts                                                    │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  backup-to-s3.sh (Daily Incremental)                     │    │
│  │  ┌────────────┬────────────┬─────────────┬────────────┐  │    │
│  │  │ Lock Check │ Filesystem │  Databases  │  Metadata  │  │    │
│  │  │ S3 Connect │   Backup   │   Backup    │  Generate  │  │    │
│  │  └────────────┴────────────┴─────────────┴────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  full-backup-to-s3.sh (Weekly Full)                      │    │
│  │  ┌────────────┬────────────┬─────────────┬────────────┐  │    │
│  │  │ Full State │ All Paths  │  Complete   │  Extended  │  │    │
│  │  │   Capture  │   Backup   │  DB Dump    │  Metadata  │  │    │
│  │  └────────────┴────────────┴─────────────┴────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  etc-git-tracker.sh (Configuration Tracking)             │    │
│  │  ┌────────────┬────────────┬─────────────┬────────────┐  │    │
│  │  │ Git Init   │ Auto Commit│  S3 Push    │  Playbook  │  │    │
│  │  │ /etc Repo  │  Changes   │  as Bundle  │  Generate  │  │    │
│  │  └────────────┴────────────┴─────────────┴────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│  Data Processing Pipeline                                          │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │Filesystem│  │PostgreSQL│  │  Redis   │  │  System  │         │
│  │  Backup  │  │  Backup  │  │  Backup  │  │  State   │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │             │             │                │
│       ▼             ▼             ▼             ▼                │
│  ┌────────────────────────────────────────────────────┐          │
│  │         Compression Layer (zstd)                   │          │
│  │  ┌──────────┬──────────┬──────────┬──────────┐    │          │
│  │  │ Level 3  │ Level 6  │Multi-    │40-60%    │    │          │
│  │  │ (daily)  │ (weekly) │threaded  │reduction │    │          │
│  │  └──────────┴──────────┴──────────┴──────────┘    │          │
│  └────────────────────────────────────────────────────┘          │
│       │                                                           │
│       ▼                                                           │
│  ┌────────────────────────────────────────────────────┐          │
│  │         Checksum Generation (SHA-256)              │          │
│  │  ┌──────────────────────────────────────────────┐  │          │
│  │  │  SHA256SUMS file for all backup files        │  │          │
│  │  │  Enables integrity verification               │  │          │
│  │  └──────────────────────────────────────────────┘  │          │
│  └────────────────────────────────────────────────────┘          │
│       │                                                           │
│       ▼                                                           │
│  ┌────────────────────────────────────────────────────┐          │
│  │         Manifest Generation (JSON)                 │          │
│  │  ┌──────────────────────────────────────────────┐  │          │
│  │  │  Metadata: size, date, paths, checksums      │  │          │
│  │  │  Enables smart restore and verification      │  │          │
│  │  └──────────────────────────────────────────────┘  │          │
│  └────────────────────────────────────────────────────┘          │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│  Upload Layer (rclone)                                             │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Upload Features                                         │    │
│  │  ┌────────────┬────────────┬─────────────┬────────────┐  │    │
│  │  │ 4 parallel │ Retry      │ Bandwidth   │ Progress   │  │    │
│  │  │ transfers  │ logic (3x) │ limiting    │ reporting  │  │    │
│  │  └────────────┴────────────┴─────────────┴────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Verification After Upload                               │    │
│  │  ┌────────────┬────────────┬─────────────┬────────────┐  │    │
│  │  │ File count │ Size check │ Checksum    │ Manifest   │  │    │
│  │  │ validation │ validation │ validation  │ validation │  │    │
│  │  └────────────┴────────────┴─────────────┴────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│  Notification Layer                                                │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────┐       ┌──────────────────────┐         │
│  │  Email Notification  │       │  Logging             │         │
│  │  ┌────────────────┐  │       │  ┌────────────────┐  │         │
│  │  │ Success email  │  │       │  │ /var/log/      │  │         │
│  │  │ Failure email  │  │       │  │ backups/       │  │         │
│  │  │ With details   │  │       │  │ Syslog         │  │         │
│  │  └────────────────┘  │       │  │ journald       │  │         │
│  └──────────────────────┘       │  └────────────────┘  │         │
│                                  └──────────────────────┘         │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow - Backup Process

```
START
  │
  ├─> Acquire Lock (prevent concurrent runs)
  │
  ├─> Check Prerequisites
  │   ├─> rclone installed?
  │   ├─> zstd installed?
  │   ├─> S3 reachable?
  │   └─> Config valid?
  │
  ├─> Determine VM-specific paths
  │   ├─> VMI01: /opt/mcp, PostgreSQL, Redis
  │   ├─> VMI02D: Storage paths
  │   └─> VMI03: /opt/keycloak
  │
  ├─> Create local staging directory
  │   └─> /var/backups/s3-staging/YYYY-MM-DD_HH-MM-SS/
  │
  ├─> Backup Databases (if applicable)
  │   ├─> PostgreSQL
  │   │   ├─> pg_dump each database (custom format)
  │   │   ├─> Verify with pg_restore --list
  │   │   └─> Compress with zstd
  │   └─> Redis
  │       ├─> BGSAVE command
  │       ├─> Copy dump.rdb
  │       └─> Compress with zstd
  │
  ├─> Backup Filesystems
  │   ├─> For each path in BACKUP_PATHS:
  │   │   ├─> tar with exclusion patterns
  │   │   ├─> Pipe to zstd compression
  │   │   └─> Save as .tar.zst
  │   └─> Backup system logs (last 7 days)
  │
  ├─> Generate Metadata
  │   ├─> Calculate checksums (SHA-256)
  │   ├─> Create backup manifest (JSON)
  │   ├─> Capture system state
  │   └─> Record package lists
  │
  ├─> Upload to S3
  │   ├─> rclone sync with retry logic
  │   ├─> 4 parallel transfers
  │   ├─> Progress reporting
  │   └─> Bandwidth limiting (optional)
  │
  ├─> Verify Upload
  │   ├─> Check file count matches
  │   ├─> Verify sizes match
  │   └─> Spot-check checksums
  │
  ├─> Cleanup
  │   ├─> Delete old S3 backups (retention policy)
  │   ├─> Delete old local staging (2 days)
  │   └─> Release lock
  │
  ├─> Notify
  │   ├─> Send success/failure email
  │   ├─> Log to syslog
  │   └─> Update metrics
  │
END (exit code 0 = success)
```

## Data Flow - Restore Process

```
START
  │
  ├─> List Available Backups
  │   └─> Query S3: rclone lsf
  │
  ├─> User Selection
  │   ├─> Choose backup date
  │   └─> Choose restore type:
  │       ├─> Full system restore
  │       ├─> Selective restore
  │       ├─> Database only
  │       └─> Configuration only
  │
  ├─> Download Manifest
  │   ├─> Get backup-manifest.json from S3
  │   └─> Display backup contents
  │
  ├─> Verify Backup Integrity
  │   ├─> Download SHA256SUMS
  │   └─> Check checksums (sample)
  │
  ├─> User Confirmation
  │   ├─> Display what will be restored
  │   ├─> Show warnings
  │   └─> Require explicit confirmation
  │
  ├─> Download from S3
  │   ├─> Download selected archives
  │   ├─> Show progress
  │   └─> Verify download integrity
  │
  ├─> Prepare Restore
  │   ├─> Create restore staging area
  │   ├─> Backup existing files (if overwriting)
  │   └─> Check disk space
  │
  ├─> Restore Data
  │   ├─> Extract archives
  │   │   ├─> Decompress with zstd
  │   │   ├─> Extract with tar
  │   │   └─> Preserve permissions
  │   ├─> Restore Databases
  │   │   ├─> Stop services
  │   │   ├─> Drop/create databases
  │   │   ├─> pg_restore / redis restore
  │   │   └─> Verify restore
  │   └─> Restore Files
  │       ├─> To original location, or
  │       └─> To temporary location
  │
  ├─> Post-Restore Tasks
  │   ├─> Fix permissions
  │   ├─> Restart services
  │   ├─> Update configurations (if needed)
  │   └─> Verify services running
  │
  ├─> Verification
  │   ├─> Check file integrity
  │   ├─> Test database connectivity
  │   ├─> Verify service status
  │   └─> Run application health checks
  │
  ├─> Cleanup
  │   ├─> Remove staging area
  │   └─> Log restore operation
  │
  ├─> Report
  │   ├─> Show restore summary
  │   ├─> List restored items
  │   └─> Provide verification checklist
  │
END
```

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Monitoring & Alerting                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Each VM                                                      │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Backup Scripts                                        │  │
│  │  ├─> Generate logs: /var/log/backups/                 │  │
│  │  ├─> Send email notifications                         │  │
│  │  └─> Exit codes (0=success, non-zero=failure)         │  │
│  └──────────────┬─────────────────────────────────────────┘  │
│                 │                                             │
│  ┌──────────────▼─────────────────────────────────────────┐  │
│  │  backup-status-check.sh                               │  │
│  │  (Prometheus metrics exporter)                        │  │
│  │                                                        │  │
│  │  Exports:                                              │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │ backup_status (1/0)                              │ │  │
│  │  │ backup_age_hours                                 │ │  │
│  │  │ backup_size_bytes                                │ │  │
│  │  │ backup_file_count                                │ │  │
│  │  │ backup_is_stale (1/0)                            │ │  │
│  │  │ backup_s3_reachable (1/0)                        │ │  │
│  │  │ backup_total_storage_bytes                       │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └──────────────┬─────────────────────────────────────────┘  │
│                 │                                             │
│  ┌──────────────▼─────────────────────────────────────────┐  │
│  │  alert-on-failure.sh                                  │  │
│  │  (Health checks and alerting)                         │  │
│  │                                                        │  │
│  │  Checks:                                               │  │
│  │  ├─> Backup age (alert if > 36 hours)                │  │
│  │  ├─> S3 connectivity                                  │  │
│  │  ├─> Backup size anomalies                            │  │
│  │  ├─> Disk space                                       │  │
│  │  ├─> Recent failures                                  │  │
│  │  └─> Configuration validity                           │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────┬───────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│ Email        │ │ Prometheus  │ │ Syslog     │
│ Notifications│ │ (optional)  │ │ journald   │
│              │ │             │ │            │
│ Success/Fail │ │ Metrics     │ │ Audit      │
│ to:          │ │ collection  │ │ trail      │
│ acampkin...  │ │             │ │            │
└──────────────┘ └──────┬──────┘ └────────────┘
                        │
                 ┌──────▼──────┐
                 │ Grafana     │
                 │ Dashboard   │
                 │ (optional)  │
                 │             │
                 │ ┌─────────┐ │
                 │ │ Backup  │ │
                 │ │ Status  │ │
                 │ │ Trends  │ │
                 │ │ Alerts  │ │
                 │ └─────────┘ │
                 └─────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Security Layers                             │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Network Security
├─> HTTPS/TLS for all S3 transfers
├─> No public bucket access
└─> Region-specific endpoint (AP Southeast 2)

Layer 2: Authentication & Authorization
├─> Dedicated S3 credentials (not account-level)
├─> Minimal required permissions
│   ├─> s3:ListBucket
│   ├─> s3:GetObject
│   ├─> s3:PutObject
│   └─> s3:DeleteObject (limited)
└─> Credentials stored securely (chmod 600)

Layer 3: Data Protection
├─> Encryption at rest
│   └─> AES-256 server-side encryption (automatic)
├─> Encryption in transit
│   └─> TLS 1.2+ (automatic with HTTPS)
└─> Optional client-side encryption
    ├─> GPG encryption
    └─> Age encryption

Layer 4: Access Control
├─> Scripts run as root only
├─> Configuration files chmod 600
├─> Lock files prevent concurrent access
└─> Audit logging enabled

Layer 5: Integrity
├─> SHA-256 checksums for all files
├─> Manifest validation
├─> Verification after upload
└─> Verification before restore

Layer 6: Monitoring & Alerting
├─> Failed backup alerts
├─> Unauthorized access detection (S3 logs)
├─> Size anomaly detection
└─> Configuration change tracking (/etc git)
```

## Disaster Recovery Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              Disaster Recovery Scenarios                        │
└─────────────────────────────────────────────────────────────────┘

Scenario 1: Single File Loss
┌────────────┐
│ User Error │ → Selective Restore → 15 min RTO
└────────────┘

Scenario 2: Database Corruption
┌────────────┐
│ Corruption │ → Database Restore → 1 hour RTO
└────────────┘

Scenario 3: Single VM Failure
┌────────────┐
│ VM Failure │ → Full VM Restore → 4 hour RTO
└────────────┘

Scenario 4: Ransomware Attack
┌────────────┐
│Ransomware  │ → Isolate → Rebuild from oldest
└────────────┘   known good backup → 24 hour RTO

Scenario 5: Complete Data Center Loss
┌────────────┐
│DC Outage   │ → Provision new VMs → Restore from S3
└────────────┘   (off-site) → 24 hour RTO

┌─────────────────────────────────────────────────────────────────┐
│              Recovery Resources                                 │
└─────────────────────────────────────────────────────────────────┘

Primary Backup Location:
└─> Wasabi S3 (AP Southeast 2 - Sydney)
    ├─> Geographic separation from VMs
    ├─> 99.9% availability SLA
    └─> Multiple availability zones

Recovery Tools:
├─> restore-from-s3.sh (interactive wizard)
├─> Manual procedures (documented)
└─> Ansible playbook (generated weekly)

Recovery Data Required:
├─> Wasabi credentials (password manager)
├─> VM root passwords (password manager)
├─> Database passwords (password manager)
└─> Network configuration (documented)
```

## File Organization in S3

```
vmibackups/
│
├─ vmi01/                               # VMI01 backups
│  │
│  ├─ 2025-01-15/                       # Daily backup (date)
│  │  ├─ files/                         # Compressed archives
│  │  │  ├─ etc_2025-01-15_02-00-00.tar.zst
│  │  │  ├─ opt_mcp_2025-01-15_02-00-00.tar.zst
│  │  │  ├─ key_2025-01-15_02-00-00.tar.zst
│  │  │  ├─ root_2025-01-15_02-00-00.tar.zst
│  │  │  └─ home_2025-01-15_02-00-00.tar.zst
│  │  │
│  │  ├─ databases/                     # Database dumps
│  │  │  ├─ postgresql/
│  │  │  │  ├─ mcp_ecosystem_2025-01-15_02-00-00.dump.zst
│  │  │  │  ├─ keycloak_2025-01-15_02-00-00.dump.zst
│  │  │  │  └─ globals_2025-01-15_02-00-00.sql.zst
│  │  │  └─ redis/
│  │  │     └─ dump_2025-01-15_02-00-00.rdb.zst
│  │  │
│  │  ├─ logs/                          # System logs
│  │  │  └─ logs_2025-01-15_02-00-00.tar.gz
│  │  │
│  │  ├─ metadata/                      # System state
│  │  │  ├─ packages_2025-01-15_02-00-00.txt
│  │  │  ├─ manual-packages_2025-01-15_02-00-00.txt
│  │  │  └─ enabled-services_2025-01-15_02-00-00.txt
│  │  │
│  │  ├─ backup-manifest.json           # Metadata
│  │  └─ SHA256SUMS                     # Checksums
│  │
│  ├─ 2025-01-16/                       # Next day...
│  ├─ ...
│  │
│  ├─ weekly/                           # Weekly full backups
│  │  ├─ 2025-01-12/                    # Sunday backup
│  │  │  └─ [same structure as daily]
│  │  └─ 2025-01-19/
│  │
│  └─ etc-history/                      # Git history
│     ├─ etc-history_vmi01_2025-01-15.bundle
│     ├─ etc-history_vmi01_2025-01-16.bundle
│     └─ etc-history_vmi01_current.bundle
│
├─ vmi02d/                              # VMI02D backups
│  └─ [same structure]
│
└─ vmi03/                               # VMI03 backups
   └─ [same structure]
```

---

This architecture provides a robust, scalable, and maintainable backup solution with comprehensive disaster recovery capabilities.
