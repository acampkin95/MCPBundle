# Restic Backup System - Architecture Documentation

**System**: Restic v0.17.3
**Deployment Date**: 2025-11-13
**Status**: Production Operational

---

## Executive Summary

Distributed backup architecture using Restic for direct-to-cloud backups to Wasabi S3. Each of the 4 ACDEV nodes backs up independently to dedicated S3 repositories with client-side encryption, block-level deduplication, and automated GFS retention policy enforcement.

**Key Metrics**:
- **Nodes**: 4 (VMI01, VMI02D, VMI03, WG_GATEWAY)
- **Storage**: Wasabi S3 (ap-southeast-2)
- **Compression**: 81% average reduction
- **Encryption**: AES-256
- **Schedule**: Daily 5AM Perth time (21:00 UTC)
- **Retention**: GFS (4H/7D/4W/3M)

---

## Architecture Overview

### Distributed Model

```
┌─────────────────────┐
│   ACDEV-VMI01       │
│   10.0.0.1          │
│                     │
│  ┌──────────────┐   │
│  │ Restic Agent │   │──┐
│  │ /opt/backup/ │   │  │
│  └──────────────┘   │  │
└─────────────────────┘  │
                         │
┌─────────────────────┐  │
│   ACDEV-VMI02D      │  │
│   10.0.0.2          │  │
│                     │  │
│  ┌──────────────┐   │  │
│  │ Restic Agent │   │──┤  Direct Encrypted Upload
│  │ /opt/backup/ │   │  │  (TLS + AES-256)
│  └──────────────┘   │  │
└─────────────────────┘  │
                         ├──────────────────┐
┌─────────────────────┐  │                  │
│   ACDEV-VMI03       │  │                  ▼
│   10.0.0.3          │  │         ┌────────────────┐
│                     │  │         │   Wasabi S3    │
│  ┌──────────────┐   │  │         │ ap-southeast-2 │
│  │ Restic Agent │   │──┤         │                │
│  │ /opt/backup/ │   │  │         │  vmibackups/   │
│  └──────────────┘   │  │         │  ├─ VMI01/     │
└─────────────────────┘  │         │  ├─ VMI02D/    │
                         │         │  ├─ VMI03/     │
┌─────────────────────┐  │         │  └─ WG_GATEWAY/│
│ ACDEV-WG_GATEWAY    │  │         └────────────────┘
│   10.0.0.4          │  │
│                     │  │
│  ┌──────────────┐   │  │
│  │ Restic Agent │   │──┘
│  │ /opt/backup/ │   │
│  └──────────────┘   │
└─────────────────────┘
```

**Architecture Type**: Distributed (not centralized)
- Each node runs independent Restic agent
- Direct backup to Wasabi S3 (no intermediate server)
- No single point of failure
- Parallel backup execution

---

## Node Configuration

### ACDEV-VMI01 (Primary App Server)

**IP**: 10.0.0.1 (VPN) / 46.250.243.123 (Public)

**Repository**: `s3:s3.ap-southeast-2.wasabisys.com/vmibackups/ACDEV-VMI01`
**Repository ID**: 1a4ad1c136

**Backup Paths**:
```
/etc/              # System configuration
/opt/mcp/          # MCP servers and data
/root/             # Root user home and scripts
/var/lib/postgresql/  # PostgreSQL data directories
/var/lib/redis/    # Redis persistence files
/var/log/mcp/      # MCP application logs
```

**First Backup Performance**:
- Data Scanned: 1.616 GiB
- Stored in S3: 224.6 MB
- Compression Ratio: 86.4%
- Time: 28 seconds

**Cron Schedule**: `0 21 * * *` (5:00 AM Perth / 21:00 UTC)

---

### ACDEV-VMI02D (Data/Backup Server)

**IP**: 10.0.0.2 (VPN) / 46.250.241.70 (Public)

**Repository**: `s3:s3.ap-southeast-2.wasabisys.com/vmibackups/ACDEV-VMI02D`
**Repository ID**: 60dc69903f

**Backup Paths**:
```
/etc/              # System configuration
/opt/              # Applications and services
/root/             # Root user home and scripts
/backup/preserved/ # Critical backup credentials (IMPORTANT!)
/var/lib/postgresql/  # Standby database
/var/log/          # System logs (selective)
```

**First Backup Performance**:
- Data Scanned: 1.120 GiB
- Stored in S3: 343.0 MB
- Compression Ratio: 69.4%
- Time: 17 seconds

**Cron Schedule**: `5 21 * * *` (5:05 AM Perth / 21:05 UTC)

**Special Notes**:
- Stores master encryption password in `/backup/preserved/RESTIC_PASSWORD.txt`
- Stores Wasabi credentials in `/backup/preserved/WASABI_CREDENTIALS.txt`
- Critical for disaster recovery credential access

---

### ACDEV-VMI03 (SOC Hub)

**IP**: 10.0.0.3 (VPN) / 154.26.158.31 (Public)

**Repository**: `s3:s3.ap-southeast-2.wasabisys.com/vmibackups/ACDEV-VMI03`
**Repository ID**: 03f5d5bcb2

**Backup Paths**:
```
/etc/              # System configuration
/opt/              # SOC Hub applications
/root/             # Root user home and scripts
/var/lib/grafana/  # Grafana dashboards and data
/var/lib/keycloak/ # Keycloak identity data
/var/log/security/ # Security event logs
```

**First Backup Performance**:
- Data Scanned: 823 MB
- Stored in S3: 116.0 MB
- Compression Ratio: 85.9%
- Time: 8 seconds

**Cron Schedule**: `10 21 * * *` (5:10 AM Perth / 21:10 UTC)

---

### ACDEV-WG_GATEWAY (VPN Gateway)

**IP**: 10.0.0.4 (VPN)

**Repository**: `s3:s3.ap-southeast-2.wasabisys.com/vmibackups/ACDEV-WG_GATEWAY`
**Repository ID**: 645a7ab7a5

**Backup Paths**:
```
/etc/              # System configuration
/etc/wireguard/    # WireGuard VPN configurations (critical)
/root/             # Root user home and scripts
/opt/              # Applications
```

**First Backup Performance**:
- Data Scanned: 144 MB
- Stored in S3: 23.3 MB
- Compression Ratio: 83.8%
- Time: 4 seconds

**Cron Schedule**: `15 21 * * *` (5:15 AM Perth / 21:15 UTC)

---

## Storage Architecture

### Wasabi S3 Configuration

**Provider**: Wasabi Technologies
**Region**: ap-southeast-2 (Sydney, Australia)
**Endpoint**: `s3.ap-southeast-2.wasabisys.com`
**Bucket**: `vmibackups`

**Credentials**:
```
Access Key: NJJ5363WC727JRAARETL
Secret Key: 5p3eecez2hwFnlwyEtOu5NQeZGWu5sfema8PbGFp
Region: ap-southeast-2
```

**Bucket Structure**:
```
vmibackups/
├── ACDEV-VMI01/        # Repository 1a4ad1c136
│   ├── config          # Repository configuration
│   ├── data/           # Encrypted data packs
│   ├── index/          # Pack indices
│   ├── keys/           # Encryption keys
│   ├── locks/          # Repository locks
│   └── snapshots/      # Snapshot metadata
├── ACDEV-VMI02D/       # Repository 60dc69903f
│   └── (same structure)
├── ACDEV-VMI03/        # Repository 03f5d5bcb2
│   └── (same structure)
└── ACDEV-WG_GATEWAY/   # Repository 645a7ab7a5
    └── (same structure)
```

**Cost Estimation**:
- Current Storage: ~707 MB (all nodes, first backup)
- Estimated Monthly Growth: ~50-100 GB (with retention)
- Storage Cost: $0.0059/GB/month
- Estimated Monthly Cost: $4-8/month
- **No egress fees** for restore operations
- **No API fees**

---

## Data Protection

### Encryption

**Algorithm**: AES-256
**Mode**: Encrypt-then-MAC
**Key Derivation**: scrypt

**Master Encryption Password**:
```
csi9D4FFgmqaJYDiPIoPbuhKb3QrgKAibbvNoqS8ChA=
```

**Storage**:
- Master: `/backup/preserved/RESTIC_PASSWORD.txt` (VMI02D)
- Each node: `/opt/backup/restic-env.sh` (chmod 600)

**Security Properties**:
- Client-side encryption (data encrypted before upload)
- Same password across all repositories
- Password never transmitted to Wasabi
- Repository metadata encrypted
- Filenames encrypted

### Compression

**Algorithm**: Auto (Restic built-in)
**Performance**: 81% average reduction across all nodes

**Compression by Node**:
| Node | Original Size | Compressed Size | Ratio |
|------|---------------|-----------------|-------|
| VMI01 | 1.616 GiB | 224.6 MB | 86.4% |
| VMI02D | 1.120 GiB | 343.0 MB | 69.4% |
| VMI03 | 823 MB | 116.0 MB | 85.9% |
| WG_GATEWAY | 144 MB | 23.3 MB | 83.8% |
| **Average** | - | - | **81.0%** |

### Deduplication

**Type**: Block-level (content-defined chunking)
**Method**: Rolling hash (Rabin fingerprinting)
**Chunk Size**: Variable (512KB - 8MB)

**Benefits**:
- Eliminates duplicate blocks across files
- Efficient incremental backups (only changed blocks)
- Cross-file deduplication
- Reduced storage and bandwidth

---

## Retention Policy

### GFS (Grandfather-Father-Son) Strategy

Implemented via `restic forget` with retention flags:

```bash
restic forget \
    --keep-hourly 4 \
    --keep-daily 7 \
    --keep-weekly 4 \
    --keep-monthly 3 \
    --prune
```

**Retention Schedule**:

| Type | Keep | Frequency | Purpose |
|------|------|-----------|---------|
| **Hourly** | 4 | Every backup | Recent recovery (implied by daily) |
| **Daily** | 7 | Daily at 5AM | Last week recovery |
| **Weekly** | 4 | Sundays | Last month recovery |
| **Monthly** | 3 | 1st of month | Quarterly archive |

**Total Snapshots per Node**: ~14-15 snapshots
**Storage Multiplier**: ~2-3x first backup size (due to retention + incrementals)

**Expected Storage Growth**:
- VMI01: 224 MB × 2.5 = ~560 MB
- VMI02D: 343 MB × 2.5 = ~857 MB
- VMI03: 116 MB × 2.5 = ~290 MB
- WG_GATEWAY: 23 MB × 2.5 = ~58 MB
- **Total**: ~1.8 GB (steady state with retention)

---

## Backup Process

### Automated Execution Flow

1. **Cron Trigger** (staggered 5-minute intervals)
   - VMI01: 21:00 UTC
   - VMI02D: 21:05 UTC
   - VMI03: 21:10 UTC
   - WG_GATEWAY: 21:15 UTC

2. **Pre-Backup Checks**
   - Verify Restic binary available
   - Source environment variables
   - Check repository connectivity
   - Verify disk space for cache

3. **Backup Execution** (`/opt/backup/scripts/backup.sh`)
   ```bash
   restic backup \
       /etc /opt /root /var/lib/postgresql /var/lib/redis /var/log/mcp \
       --tag daily \
       --compression auto \
       --exclude-caches \
       --exclude '*.tmp' \
       --exclude '/var/log/*.gz'
   ```

4. **Retention Enforcement**
   ```bash
   restic forget \
       --keep-hourly 4 \
       --keep-daily 7 \
       --keep-weekly 4 \
       --keep-monthly 3 \
       --prune
   ```

5. **Post-Backup Actions**
   - Log results to `/opt/backup/logs/backup-YYYYMMDD-HHMMSS.log`
   - Append status to `/opt/backup/logs/cron.log`
   - Update cache metadata
   - Exit with status code (0 = success)

### Incremental Backup Mechanism

**First Backup**:
- Scans all files
- Chunks data into variable-sized blocks
- Uploads all unique blocks to S3
- Creates snapshot with metadata

**Subsequent Backups** (incremental):
- Scans files for changes (mtime, size, inode)
- Re-chunks only changed files
- Deduplicates against existing blocks
- Uploads only new/changed blocks
- Creates new snapshot referencing existing + new blocks

**Performance**:
- First backup: 4-28 seconds (full)
- Incremental backups: 1-5 seconds (estimated)
- Bandwidth: Only changed blocks transferred

---

## Disaster Recovery

### Recovery Time Objective (RTO)

| Scenario | Target RTO | Procedure |
|----------|------------|-----------|
| Single file | 5 minutes | Browse snapshot → restore file |
| Directory | 15 minutes | Restore directory tree |
| Service data | 30 minutes | Restore app data → restart service |
| Full system | 4-6 hours | OS reinstall → full restore |

### Recovery Point Objective (RPO)

**RPO: 24 hours** (daily backups)

Worst case data loss: Changes made between last backup (5AM) and failure time

---

## Monitoring

### Health Indicators

**Success Indicators**:
```bash
# Check last backup status
tail -20 /opt/backup/logs/cron.log | grep "Status: 0"

# Verify snapshot created
source /opt/backup/restic-env.sh
restic snapshots --latest 1
```

**Failure Detection**:
```bash
# Check for errors in cron log
grep "Status: [^0]" /opt/backup/logs/cron.log

# Check repository health
restic check
```

### Monitoring from VMI02D

**Check All Nodes**:
```bash
for ip in 10.0.0.1 10.0.0.2 10.0.0.3 10.0.0.4; do
    echo "=== ${ip} ==="
    ssh root@${ip} 'tail -20 /opt/backup/logs/cron.log | grep -E "(Status|snapshot)"'
done
```

---

## File Structure

### On Each Node

```
/opt/backup/
├── restic-env.sh           # Environment configuration (chmod 600)
├── cache/                  # Restic local cache
│   └── [repository-id]/    # Cached metadata and indices
├── logs/
│   ├── backup-YYYYMMDD-HHMMSS.log  # Individual backup logs
│   └── cron.log            # Continuous cron execution log
└── scripts/
    ├── backup.sh           # Main backup script with GFS
    ├── restore.sh          # Restore helper script
    └── verify.sh           # Repository verification script
```

### Cron Configuration

```
# On each node: crontab -l
0 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1  # VMI01
5 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1  # VMI02D
10 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1  # VMI03
15 21 * * * /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1  # WG_GATEWAY
```

---

## Technical Specifications

### Software Versions

- **Restic**: v0.17.3
- **OS**: Debian/Ubuntu Linux
- **Transport**: HTTPS (TLS 1.2+)
- **S3 API**: AWS S3 compatible

### Network Requirements

**Bandwidth**:
- First backup: ~3.7 GB upload (all nodes)
- Incremental backups: <100 MB/day (estimated)
- Network: 100 Mbps connection recommended

**Ports**:
- Outbound HTTPS: 443 (to Wasabi S3)
- No inbound ports required

### Resource Usage

**CPU**: Minimal (compression/deduplication during backup)
**Memory**: ~100-200 MB per backup process
**Disk (Cache)**: ~1-2 GB per repository
**Network**: Bandwidth depends on data change rate

---

## Security Architecture

### Multi-Layer Security

1. **Transport Security**
   - TLS 1.2+ encryption to Wasabi
   - Certificate validation
   - Encrypted credentials in environment

2. **Data Security**
   - AES-256 client-side encryption
   - Encrypted before leaving source node
   - Encrypted at rest in S3
   - Encrypted filenames and metadata

3. **Access Control**
   - Wasabi IAM credentials (least privilege)
   - File permissions: 600 (restic-env.sh)
   - SSH key-based access between nodes
   - No public S3 bucket access

4. **Credential Management**
   - Master password on VMI02D (secure location)
   - Per-node environment files (chmod 600)
   - No credentials in logs or scripts
   - Backup of credentials in `/backup/preserved/`

---

## Advantages of Current Architecture

**vs. Centralized Backup**:
- ✅ No single point of failure
- ✅ Parallel backup execution (faster)
- ✅ Independent node recovery
- ✅ Reduced network traffic (direct to cloud)
- ✅ Simpler architecture (no backup server)

**vs. Duplicati**:
- ✅ Better deduplication (block-level vs file-level)
- ✅ Faster incremental backups
- ✅ More reliable (fewer database corruptions)
- ✅ Better compression (81% vs ~60%)
- ✅ Active development and support

**vs. LVM Snapshots**:
- ✅ Off-site storage (geographic redundancy)
- ✅ Long-term retention (3 months vs days)
- ✅ Point-in-time recovery
- ✅ Lower storage cost

---

## Future Enhancements

### Potential Improvements

1. **Monitoring Integration**
   - Prometheus metrics export
   - Grafana dashboards
   - Alert manager integration

2. **Extended Retention**
   - Add yearly retention
   - Configurable per-node policies

3. **Backup Verification**
   - Automated monthly restore tests
   - Integrity checking

4. **Performance Optimization**
   - Bandwidth throttling during business hours
   - Backup window optimization

---

## References

- **Restic Documentation**: https://restic.readthedocs.io/
- **Wasabi Documentation**: https://wasabi.com/help/
- **Deployment Guide**: [../current/DEPLOYMENT_STATUS.md](../current/DEPLOYMENT_STATUS.md)
- **Operations Guide**: [../current/OPERATIONS.md](../current/OPERATIONS.md)
- **Restore Procedures**: [../current/RESTORE.md](../current/RESTORE.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-13
**Status**: Production Architecture
