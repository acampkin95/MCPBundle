# Enterprise Backup Architecture - GFS with Wasabi S3

**Date**: 2025-11-12
**Backup Node**: VMI02D (46.250.241.70) - data.acdev.host
**Storage**: Wasabi S3 (ap-southeast-2)
**Solution**: Duplicati with Web GUI

---

## Executive Summary

Comprehensive backup solution implementing Grandfather-Father-Son (GFS) retention with incremental backups to Wasabi S3. All three nodes (VMI01, VMI02D, VMI03) backed up from central backup server (VMI02D) with web-based management and file-level restore.

---

## Backup Schedule (GFS)

### 6-Hourly Backups (Grandfather)
- **Frequency**: Every 6 hours (4 per day)
- **Times**: 00:00, 06:00, 12:00, 18:00 UTC
- **Retention**: Keep last 4 backups (24 hours coverage)
- **Purpose**: Rapid recovery from recent changes

### Daily Backups (Father)
- **Frequency**: Once per day
- **Time**: 02:00 UTC
- **Retention**: Keep last 7 backups (1 week coverage)
- **Purpose**: Recent change history

### Weekly Backups (Son)
- **Frequency**: Once per week
- **Day**: Sunday
- **Time**: 03:00 UTC
- **Retention**: Keep last 4 backups (1 month coverage)
- **Purpose**: Medium-term recovery

### Monthly Backups (Archive)
- **Frequency**: Once per month
- **Day**: 1st of month
- **Time**: 04:00 UTC
- **Retention**: Keep last 3 backups (3 months coverage)
- **Purpose**: Long-term archival

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ VMI01 (46.250.243.123)                                      │
│ - PostgreSQL databases                                      │
│ - MCP servers                                               │
│ - Application data                                          │
│ - System configs                                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ SSH/rsync
                 │
┌────────────────▼────────────────────────────────────────────┐
│ VMI02D (46.250.241.70) - BACKUP SERVER                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Duplicati Backup Engine                              │  │
│  │ - Web GUI (Port 8200)                                │  │
│  │ - Backup Scheduler                                   │  │
│  │ - Encryption (AES-256)                               │  │
│  │ - Deduplication                                      │  │
│  │ - Compression                                        │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────▼───────────────────────────────────────┐  │
│  │ Local Cache (/backup/cache)                         │  │
│  │ - 100GB transfer staging                            │  │
│  │ - Temporary file storage                            │  │
│  │ - Metadata database                                 │  │
│  └──────────────┬───────────────────────────────────────┘  │
└─────────────────┼───────────────────────────────────────────┘
                  │
                  │ HTTPS (TLS 1.3)
                  │
┌─────────────────▼───────────────────────────────────────────┐
│ Wasabi S3 Storage (ap-southeast-2)                         │
│                                                             │
│  Bucket: vmibackups                                        │
│  ├── vmi01/                                                │
│  │   ├── 6hourly/                                         │
│  │   ├── daily/                                           │
│  │   ├── weekly/                                          │
│  │   └── monthly/                                         │
│  ├── vmi02d/                                               │
│  │   ├── 6hourly/                                         │
│  │   ├── daily/                                           │
│  │   ├── weekly/                                          │
│  │   └── monthly/                                         │
│  └── vmi03/                                                │
│      ├── 6hourly/                                          │
│      ├── daily/                                            │
│      ├── weekly/                                           │
│      └── monthly/                                          │
└─────────────────────────────────────────────────────────────┘
                  ▲
                  │
┌─────────────────┴────────────────────────────────────────────┐
│ VMI03 (154.26.158.31)                                       │
│ - SOC Hub services                                          │
│ - TheHive + Elasticsearch                                   │
│ - Security data                                             │
│ - Configurations                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Backup Targets

### VMI01 (Primary Server)
**What to Backup**:
- `/opt/mcp/` - MCP servers and data
- `/var/lib/postgresql/` - Database files (offline backup)
- `/etc/` - System configuration
- `/root/` - Scripts and credentials
- `/var/log/` - Important logs (last 7 days)
- PostgreSQL dumps (via pg_dump)

**Estimated Size**: 50-100GB
**Backup Window**: 6-hourly, daily, weekly, monthly

### VMI02D (Backup Server)
**What to Backup**:
- `/opt/` - Services and applications
- `/var/lib/postgresql/` - Standby database
- `/etc/` - System configuration
- `/backup/` - Local backup metadata (not cache)
- `/root/` - Scripts and credentials

**Estimated Size**: 100-200GB
**Backup Window**: Daily, weekly, monthly (not 6-hourly to avoid recursion)

### VMI03 (SOC Hub)
**What to Backup**:
- `/opt/mcp/soc-hub-mcp/` - SOC Hub application
- `/opt/thehive/` - TheHive configuration
- Docker volumes (thehive-data, elasticsearch-data, cassandra-data)
- `/etc/` - System configuration
- `/root/` - Scripts and credentials

**Estimated Size**: 50-150GB (includes Docker volumes)
**Backup Window**: 6-hourly, daily, weekly, monthly

---

## Retention Policy Matrix

| Backup Type | Frequency | Retention | Keep Count | Total Storage |
|-------------|-----------|-----------|------------|---------------|
| **6-Hourly** | Every 6h | 24 hours | 4 | 4 × Full Size |
| **Daily** | Daily 02:00 | 7 days | 7 | 7 × Incremental |
| **Weekly** | Sun 03:00 | 4 weeks | 4 | 4 × Incremental |
| **Monthly** | 1st 04:00 | 3 months | 3 | 3 × Full |

**Total Estimated Storage** (per node):
- 6-Hourly: 4 × 10GB = 40GB (incremental)
- Daily: 7 × 5GB = 35GB (incremental)
- Weekly: 4 × 15GB = 60GB (incremental)
- Monthly: 3 × 50GB = 150GB (full)
- **Total per node**: ~285GB
- **Total for 3 nodes**: ~855GB

**Wasabi Costs** (ap-southeast-2):
- Storage: $0.0059/GB/month
- 855GB × $0.0059 = ~$5.04/month
- No egress fees for restore operations
- No API fees

---

## Technical Implementation

### Duplicati Features

**Encryption**:
- AES-256 encryption at rest
- Encrypted before upload to Wasabi
- Passphrase-protected backups

**Deduplication**:
- Block-level deduplication
- Reduces storage by 50-80% for similar files
- Cross-backup deduplication

**Compression**:
- LZ4 compression (fast)
- Reduces storage by 30-50%
- Configurable per backup job

**Incremental Backups**:
- Only changed blocks uploaded
- Smart file tracking
- Reduced backup time (5-10 min vs 2-3 hours full)

**Verification**:
- Automated backup verification
- Integrity checks
- Test restore capability

---

## Security

### Data Protection

**Encryption in Transit**:
- TLS 1.3 to Wasabi S3
- Certificate pinning
- Secure credentials storage

**Encryption at Rest**:
- AES-256-GCM
- Unique encryption key per backup set
- Master passphrase protection

**Access Control**:
- Wasabi IAM user (vmibackups-agent)
- Minimum required permissions (WasabiFullAccess)
- No public bucket access
- Firewall rules on VMI02D

### Credential Management

**Wasabi Credentials** (stored in Duplicati):
```
Access Key: WCZLQETBK6VXN55WECMQ
Secret Key: fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
Bucket: vmibackups
Region: ap-southeast-2
Endpoint: s3.ap-southeast-2.wasabisys.com
```

**Encryption Passphrase**: Strong random passphrase (generated during setup)

---

## Disaster Recovery

### Recovery Time Objectives (RTO)

| Scenario | Target RTO | Procedure |
|----------|------------|-----------|
| Single file restore | 5 minutes | Web GUI → Browse → Restore |
| Directory restore | 15 minutes | Web GUI → Select folder → Restore |
| System partial | 1 hour | Restore critical directories |
| Full system restore | 4-6 hours | OS reinstall + Full restore |
| Database restore | 30 minutes | Restore dump + Import |

### Recovery Point Objectives (RPO)

| Backup Type | RPO | Data Loss Window |
|-------------|-----|------------------|
| 6-Hourly | 6 hours | Max 6h of data |
| Daily | 24 hours | Max 1 day of data |
| Weekly | 7 days | Max 1 week of data |
| Monthly | 30 days | Max 1 month of data |

---

## Monitoring and Alerting

### Health Checks

**Automated Monitoring**:
- Backup success/failure status
- Storage usage tracking
- Backup duration monitoring
- Network connectivity checks
- Wasabi S3 availability

**Alert Conditions**:
- Backup failure (email notification)
- Storage >80% capacity warning
- Backup duration >2 hours
- 3 consecutive failures (critical)
- Wasabi connectivity loss

**Reporting**:
- Daily backup summary email
- Weekly storage usage report
- Monthly backup verification report

---

## Web GUI Access

**URL**: http://46.250.241.70:8200

**Features**:
- Backup job management
- Restore interface (file browser)
- Schedule configuration
- Storage monitoring
- Backup verification
- Log viewing

**Security**:
- Password protected
- HTTPS (optional with reverse proxy)
- IP whitelist (firewall)
- Session timeout

---

## Backup Job Configuration

### Job 1: VMI01 - 6-Hourly
```
Name: VMI01-6Hourly
Source: SSH to 46.250.243.123
Paths: /opt/mcp/, /etc/, /root/
Schedule: 00:00, 06:00, 12:00, 18:00 UTC
Retention: Keep 4 versions
Destination: s3://vmibackups/vmi01/6hourly/
```

### Job 2: VMI01 - Daily
```
Name: VMI01-Daily
Source: SSH to 46.250.243.123
Paths: /opt/mcp/, /var/lib/postgresql/, /etc/, /root/
Schedule: 02:00 UTC daily
Retention: Keep 7 versions
Destination: s3://vmibackups/vmi01/daily/
```

### Job 3: VMI01 - Weekly
```
Name: VMI01-Weekly
Source: SSH to 46.250.243.123
Paths: All critical directories + logs
Schedule: Sunday 03:00 UTC
Retention: Keep 4 versions
Destination: s3://vmibackups/vmi01/weekly/
```

### Job 4: VMI01 - Monthly
```
Name: VMI01-Monthly
Source: SSH to 46.250.243.123
Paths: Full system backup
Schedule: 1st of month 04:00 UTC
Retention: Keep 3 versions
Destination: s3://vmibackups/vmi01/monthly/
```

**Repeat pattern for VMI02D and VMI03**

---

## File-Based Restore

### Using Web GUI

1. **Navigate to Restore**:
   - Open http://46.250.241.70:8200
   - Select "Restore" tab
   - Choose backup job

2. **Browse Backup**:
   - Select date/time to restore from
   - Browse file tree
   - Check files/folders to restore

3. **Choose Restore Location**:
   - Original location (in-place restore)
   - Alternate location (safe testing)
   - Download to local machine

4. **Execute Restore**:
   - Click "Restore"
   - Monitor progress
   - Verify files restored

### Using CLI (Advanced)

```bash
# List available backups
duplicati-cli list s3://vmibackups/vmi01/daily/

# Restore specific file
duplicati-cli restore s3://vmibackups/vmi01/daily/ \
  --file=/opt/mcp/config.json \
  --restore-path=/tmp/restore/

# Restore directory
duplicati-cli restore s3://vmibackups/vmi01/daily/ \
  --file=/opt/mcp/ \
  --restore-path=/opt/mcp-restored/
```

---

## Performance Optimization

### Network Optimization

**Bandwidth Throttling**:
- Limit to 50 Mbps during business hours (08:00-18:00)
- Unlimited during off-hours
- Prevents impact on production traffic

**Parallel Uploads**:
- 4 concurrent upload threads
- Balanced for 100 Mbps connection
- Reduced backup window time

### Storage Optimization

**Deduplication Settings**:
- Block size: 100KB (optimal for mixed files)
- Enable cross-backup deduplication
- Reduces total storage by 60-70%

**Compression**:
- Algorithm: LZ4 (fast, good ratio)
- Level: 1 (balanced speed/compression)
- Skip already compressed files (.gz, .zip, .jpg)

---

## Maintenance Procedures

### Daily
- Check backup success in dashboard
- Review error logs if failures
- Monitor storage usage

### Weekly
- Verify random restore test
- Check Wasabi billing
- Review backup duration trends

### Monthly
- Full backup verification (test restore)
- Clean up old logs
- Update backup job configurations
- Review and update exclusion lists

### Quarterly
- Disaster recovery drill (full restore test)
- Review retention policies
- Update documentation
- Security audit (credentials, access)

---

## Troubleshooting

### Backup Failures

**SSH Connection Issues**:
```bash
# Test SSH connectivity
ssh root@46.250.243.123 "echo 'SSH OK'"

# Check SSH keys
cat ~/.ssh/id_rsa.pub
```

**Wasabi Connectivity**:
```bash
# Test S3 access
aws s3 ls s3://vmibackups/ \
  --endpoint-url=https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

**Disk Space Issues**:
```bash
# Check cache space
df -h /backup/cache

# Clean old cache
rm -rf /backup/cache/tmp/*
```

### Restore Issues

**File Not Found**:
- Check backup job includes the path
- Verify backup date range
- Check file wasn't excluded

**Slow Restore**:
- Network bandwidth limitation
- Large file size
- Wasabi API rate limiting (rare)

**Decryption Errors**:
- Verify passphrase correct
- Check backup integrity
- Run backup verification

---

## Compliance and Auditing

### Backup Verification

**Automated Tests**:
- Daily: Verify backup completed
- Weekly: Test restore random file
- Monthly: Full restore verification

**Audit Trail**:
- All backup operations logged
- Restore operations tracked
- Configuration changes recorded

### Compliance Requirements

**Data Retention**:
- Meets 3-month retention requirement
- Immutable backups (Wasabi Lock optional)
- Geographic redundancy (ap-southeast-2)

**Security Standards**:
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Access logging and monitoring

---

## Summary

### Backup Coverage

- ✅ 3 nodes (VMI01, VMI02D, VMI03)
- ✅ GFS retention (6h/daily/weekly/monthly)
- ✅ Incremental backups with deduplication
- ✅ Web-based GUI management
- ✅ File-level restore capability
- ✅ Encrypted and compressed

### Storage Efficiency

- **Raw Data**: ~300GB per node
- **Stored Data**: ~285GB per node (with dedup/compression)
- **Total Storage**: ~855GB
- **Monthly Cost**: ~$5.04

### Recovery Capabilities

- **RTO**: 5 min (file) to 6 hours (full system)
- **RPO**: 6 hours (recent) to 30 days (archive)
- **Restore Methods**: Web GUI, CLI, direct download

---

**Next**: Deploy Duplicati on VMI02D and configure backup jobs

**Author**: Claude Code
**Date**: 2025-11-12
**Status**: Architecture Complete
