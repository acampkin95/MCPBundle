# Backup System Documentation

**Current System**: Restic (distributed backup to Wasabi S3)
**Status**: ✅ Operational
**Last Updated**: 2025-11-13

---

## Quick Navigation

### 🟢 Current System (Restic)

**Start Here**:
- **[Quick Start Guide](current/QUICK_START.md)** - Get started immediately
- **[Deployment Status](current/DEPLOYMENT_STATUS.md)** - Current system status

**Operations**:
- **[Daily Operations](current/OPERATIONS.md)** - Common tasks and commands
- **[Restore Procedures](current/RESTORE.md)** - How to restore files/systems

**Reference**:
- **[Architecture](reference/ARCHITECTURE.md)** - System design and structure
- **[Credentials](security/CREDENTIALS.md)** - Access credentials ⚠️ Secure

### 📦 Archive (Duplicati - Replaced)

- **[Duplicati Archive](archive/)** - Previous system documentation (reference only)

### 🔧 Scripts

- **[Deployment Scripts](scripts/)** - Automated deployment tools
- **[Maintenance Scripts](scripts/)** - Ongoing maintenance automation

---

## Document Categories

### Current (Restic - Active System)

| Document | Purpose | Audience |
|----------|---------|----------|
| **QUICK_START.md** | Get started immediately | Operators |
| **DEPLOYMENT_STATUS.md** | System status and metrics | Administrators |
| **OPERATIONS.md** | Daily operations guide | Operators |
| **RESTORE.md** | Restore procedures | Administrators |

### Archive (Historical Systems)

| Directory | Purpose | Status |
|-----------|---------|--------|
| **archive/duplicati/** | Duplicati system documentation | ⚠️ Replaced by Restic |
| **archive/old-systems/** | Outdated architecture docs (rclone, Duplicati) | ⚠️ Historical reference only |
| **archive/*.md** | Outdated setup and status docs | ⚠️ Superseded by current docs |

### Reference

| Document | Purpose |
|----------|---------|
| **ARCHITECTURE.md** | Complete Restic system architecture and design |

### Security

| Document | Purpose | Security |
|----------|---------|----------|
| **CREDENTIALS.md** | Access credentials | 🔒 **Sensitive** |
| **ENCRYPTION.md** | Encryption details | 🔒 **Sensitive** |

### Scripts

| Document | Purpose |
|----------|---------|
| **scripts/README.md** | Complete script documentation |
| **scripts/deployment/** | One-time deployment scripts (executed) |
| **scripts/maintenance/** | Ongoing operations scripts |

---

## System Overview

### Current Architecture (Restic)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ ACDEV-VMI01 │     │ACDEV-VMI02D │     │ ACDEV-VMI03 │     │  WG_GATEWAY │
│  10.0.0.1   │     │  10.0.0.2   │     │  10.0.0.3   │     │  10.0.0.4   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │    Direct Backup to Wasabi S3 (Encrypted, Compressed)    │
       └───────────────────┴───────────────────┴───────────────────┘
                                   │
                            ┌──────▼──────┐
                            │  Wasabi S3  │
                            │ vmibackups  │
                            └─────────────┘
```

**Key Features**:
- ✅ Distributed (each node independent)
- ✅ Encrypted (AES-256)
- ✅ Compressed (81% reduction)
- ✅ Deduplicated (block-level)
- ✅ Incremental backups
- ✅ GFS retention (4H/7D/4W/3M)

---

## Quick Commands

### Check Backup Status

```bash
# On any node
source /opt/backup/restic-env.sh
restic snapshots
```

### Manual Backup

```bash
/opt/backup/scripts/backup.sh
```

### Restore Files

```bash
/opt/backup/scripts/restore.sh <snapshot-id> /restore/path
```

---

## Support

**Primary Documentation**: See [Current System](current/) docs
**Architecture Details**: See [Reference](reference/) docs
**Credentials**: See [Security](security/) docs 🔒

---

**System Status**: ✅ Operational
**Next Backup**: Daily at 5AM Perth time (21:00 UTC)
