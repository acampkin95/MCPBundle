# ACDEV Duplicati Backup System - Host Configuration Complete

**Date**: 2025-11-13
**Backup Server**: ACDEV-VMI02D (46.250.241.70)
**Status**: ✅ **CONFIGURED - READY FOR CLOUD REGISTRATION**

---

## Executive Summary

Duplicati backup system has been successfully configured with proper ACDEV host naming and 14 backup job templates ready for deployment. The system is prepared for either local management or Duplicati Cloud integration.

---

## Configured Hosts

### 1. ACDEV-VMI01 (Primary Application Server)

**Network**:

- Public IP: 46.250.243.123
- VPN IP: 10.0.0.1
- VMI ID: vmi2870958
- Type: Cloud VPS 20 SSD

**Role**: Primary MCP servers, PostgreSQL master

**Backup Jobs**: 4 jobs configured

| Job Name | Schedule | Retention | Cron | Status |
|----------|----------|-----------|------|--------|
| ACDEV-VMI01-6hourly | Every 6 hours | Keep 4 | `0 */6 * * *` | ⏳ Ready |
| ACDEV-VMI01-daily | Daily 02:00 UTC | Keep 7 | `0 2 * * *` | ⏳ Ready |
| ACDEV-VMI01-weekly | Sunday 03:00 UTC | Keep 4 | `0 3 * * 0` | ⏳ Ready |
| ACDEV-VMI01-monthly | 1st 04:00 UTC | Keep 3 | `0 4 1 * *` | ⏳ Ready |

**Backup Paths**:

- 6-hourly: `/opt/mcp/`, `/etc/`, `/root/`
- Daily: `/opt/mcp/`, `/var/lib/postgresql/`, `/etc/`, `/root/`
- Weekly: `/opt/`, `/etc/`, `/root/`, `/var/log/`
- Monthly: `/opt/`, `/etc/`, `/root/`, `/var/`

---

### 2. ACDEV-VMI02D (Backup Server)

**Network**:

- Public IP: 46.250.241.70
- VPN IP: 10.0.0.2
- VMI ID: vmi2888815
- Type: Storage VPS 30

**Role**: Duplicati backup server, PostgreSQL standby, storage layer

**Backup Jobs**: 3 jobs configured

| Job Name | Schedule | Retention | Cron | Status |
|----------|----------|-----------|------|--------|
| ACDEV-VMI02D-daily | Daily 02:30 UTC | Keep 7 | `30 2 * * *` | ⏳ Ready |
| ACDEV-VMI02D-weekly | Sunday 03:30 UTC | Keep 4 | `30 3 * * 0` | ⏳ Ready |
| ACDEV-VMI02D-monthly | 1st 04:30 UTC | Keep 3 | `30 4 1 * *` | ⏳ Ready |

**Backup Paths**:

- Daily: `/opt/`, `/etc/`, `/root/`, `/backup/config/`
- Weekly: `/opt/`, `/etc/`, `/root/`, `/var/log/`, `/backup/`
- Monthly: `/opt/`, `/etc/`, `/root/`, `/var/`, `/backup/`

**Note**: No 6-hourly backup to avoid recursive backup issues

---

### 3. ACDEV-VMI03 (SOC Hub)

**Network**:

- Public IP: 154.26.158.31
- VPN IP: 10.0.0.3
- VMI ID: vmi2889604
- Type: Cloud VPS 20 NVMe

**Role**: TheHive, SOC operations, Docker services

**Backup Jobs**: 4 jobs configured

| Job Name | Schedule | Retention | Cron | Status |
|----------|----------|-----------|------|--------|
| ACDEV-VMI03-6hourly | Every 6 hours | Keep 4 | `30 */6 * * *` | ⏳ Ready |
| ACDEV-VMI03-daily | Daily 02:15 UTC | Keep 7 | `15 2 * * *` | ⏳ Ready |
| ACDEV-VMI03-weekly | Sunday 03:15 UTC | Keep 4 | `15 3 * * 0` | ⏳ Ready |
| ACDEV-VMI03-monthly | 1st 04:15 UTC | Keep 3 | `15 4 1 * *` | ⏳ Ready |

**Backup Paths**:

- 6-hourly: `/opt/mcp/`, `/opt/thehive/`, `/etc/`
- Daily: `/opt/`, `/var/lib/docker/volumes/`, `/etc/`
- Weekly: `/opt/`, `/var/lib/docker/`, `/etc/`, `/var/log/`
- Monthly: `/opt/`, `/var/lib/docker/`, `/etc/`, `/var/`

---

### 4. ACDEV-WG_GATEWAY (WireGuard Gateway)

**Network**:

- Public IP: 154.26.158.31 (shared with VMI03)
- VPN IP: 10.0.0.4
- VMI ID: vmi2897882
- Type: Cloud VPS 10 NVMe

**Role**: VPN gateway, network routing

**Backup Jobs**: 3 jobs configured

| Job Name | Schedule | Retention | Cron | Status |
|----------|----------|-----------|------|--------|
| ACDEV-WG_GATEWAY-daily | Daily 02:45 UTC | Keep 7 | `45 2 * * *` | ⏳ Ready |
| ACDEV-WG_GATEWAY-weekly | Sunday 03:45 UTC | Keep 4 | `45 3 * * 0` | ⏳ Ready |
| ACDEV-WG_GATEWAY-monthly | 1st 04:45 UTC | Keep 3 | `45 4 1 * *` | ⏳ Ready |

**Backup Paths**:

- Daily: `/etc/wireguard/`, `/etc/`, `/root/`
- Weekly: `/etc/`, `/root/`, `/var/log/`
- Monthly: `/etc/`, `/root/`, `/var/`

---

## Wasabi S3 Storage Structure

**Bucket**: vmibackups
**Region**: ap-southeast-2
**Endpoint**: s3.ap-southeast-2.wasabisys.com

**Directory Structure**:

```text
vmibackups/
├── ACDEV-VMI01/
│   ├── 6hourly/
│   ├── daily/
│   ├── weekly/
│   └── monthly/
├── ACDEV-VMI02D/
│   ├── daily/
│   ├── weekly/
│   └── monthly/
├── ACDEV-VMI03/
│   ├── 6hourly/
│   ├── daily/
│   ├── weekly/
│   └── monthly/
└── ACDEV-WG_GATEWAY/
    ├── daily/
    ├── weekly/
    └── monthly/
```

---

## Access Information

### Web GUI

**Local Access**: <http://46.250.241.70:8200>

**Quick Signin Token** (valid 5 minutes):

```text
http://46.250.241.70:8200/signin.html?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJTaWduaW5Ub2tlbiIsInNpZCI6InNlcnZlci1jbGkiLCJuYmYiOjE3NjMwMTEzNjYsImV4cCI6MTc2MzAxMTY2NiwiaXNzIjoiaHR0cHM6Ly9kdXBsaWNhdGkiLCJhdWQiOiJodHRwczovL2R1cGxpY2F0aSJ9.XJlxr10qErPI8twjmoXlNzdWRimflgneZU4Gpvax7-k
```

### Duplicati Cloud Connection

**Organization ID**: 259e22be-61c1-418d-a8a9-fb4760829c18

**Registration URL**:

```text
https://api.duplicati.com/remotecontrol/add-machine?organizationId=259e22be-61c1-418d-a8a9-fb4760829c18&token=mrt_QRIdZmvoE_KvHdno_TcsjAFxWt5O3Y-yNicdPVvxABUzx7NoIijP0bWRoTP0q6yr2Ej6lkIo7bSidcZQEkwXjA
```

**Cloud Dashboard**: <https://duplicati.com/dashboard>

---

## Configuration Files

**Location**: `/backup/config/` on ACDEV-VMI02D

**Job Templates** (14 files):

```bash
/backup/config/ACDEV-VMI01-6hourly.json
/backup/config/ACDEV-VMI01-daily.json
/backup/config/ACDEV-VMI01-weekly.json
/backup/config/ACDEV-VMI01-monthly.json
/backup/config/ACDEV-VMI02D-daily.json
/backup/config/ACDEV-VMI02D-weekly.json
/backup/config/ACDEV-VMI02D-monthly.json
/backup/config/ACDEV-VMI03-6hourly.json
/backup/config/ACDEV-VMI03-daily.json
/backup/config/ACDEV-VMI03-weekly.json
/backup/config/ACDEV-VMI03-monthly.json
/backup/config/ACDEV-WG_GATEWAY-daily.json
/backup/config/ACDEV-WG_GATEWAY-weekly.json
/backup/config/ACDEV-WG_GATEWAY-monthly.json
```

**Documentation**:

- `/backup/config/host-inventory.txt` - Complete host inventory
- `/backup/config/CLOUD_DEPLOYMENT_SUMMARY.txt` - Deployment summary
- `/backup/config/encryption-passphrase.txt` - ⚠️ CRITICAL - Encryption key

---

## Credentials

**Encryption Passphrase** (Required for all restores):

```text
gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=
```

**Wasabi S3**:

```text
Access Key: WCZLQETBK6VXN55WECMQ
Secret Key: fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
```

---

## Next Steps

### Option 1: Local Management (Web GUI)

1. **Access Web GUI**: Open <http://46.250.241.70:8200>
2. **Set Admin Password**: Configure on first access
3. **Import Job Configurations**:
   - Click "Add Backup" → "Import from configuration"
   - Select job files from `/backup/config/ACDEV-*.json`
   - Import all 14 jobs
4. **Run Test Backup**: Test ACDEV-VMI01-daily first
5. **Verify in Wasabi**: Check backup appears in S3
6. **Enable All Jobs**: Activate automated scheduling

### Option 2: Cloud Management (Recommended)

1. **Access Duplicati Cloud Portal**: <https://duplicati.com/dashboard>
2. **Sign In**: Use your Duplicati account
3. **Register ACDEV-VMI02D**:
   - Navigate to "Add Machine"
   - Use registration URL provided above
   - Or manually register with Organization ID
4. **Verify Connection**: ACDEV-VMI02D should appear in dashboard
5. **Import Jobs**: Upload JSON configurations from Web GUI
6. **Monitor**: Track all 14 backup jobs from cloud portal

### Immediate Actions (Today)

1. ✅ **Set Web GUI password** - Secure the interface
2. ✅ **Test first backup** - Run ACDEV-VMI01-daily manually
3. ✅ **Verify Wasabi upload** - Check S3 bucket for backup data
4. ✅ **Register cloud account** - Connect to Duplicati Cloud (optional)

### Short-Term (This Week)

1. Import all 14 backup job configurations
2. Run test backup for each host
3. Verify all automated schedules are working
4. Monitor first 7 days of daily backups
5. Test file-level restore operation

### Long-Term (This Month)

1. Test full system restore procedure
2. Validate weekly and monthly backups execute
3. Review storage costs on Wasabi
4. Set up email notifications for failures
5. Document restore procedures for team

---

## Storage Estimates

**Per Host**:

- ACDEV-VMI01: ~285GB (with dedup/compression)
- ACDEV-VMI02D: ~200GB (with dedup/compression)
- ACDEV-VMI03: ~285GB (with dedup/compression)
- ACDEV-WG_GATEWAY: ~50GB (with dedup/compression)

**Total**: ~820GB across all hosts

**Monthly Cost**: ~$4.85 on Wasabi ($0.0059/GB/month)

---

## Backup Schedule Matrix

| Time (UTC) | ACDEV-VMI01 | ACDEV-VMI02D | ACDEV-VMI03 | ACDEV-WG_GATEWAY |
|------------|-------------|--------------|-------------|------------------|
| 00:00 | 6-hourly | - | - | - |
| 00:30 | - | - | 6-hourly | - |
| 02:00 | Daily | - | - | - |
| 02:15 | - | - | Daily | - |
| 02:30 | - | Daily | - | - |
| 02:45 | - | - | - | Daily |
| 03:00 Sun | Weekly | - | - | - |
| 03:15 Sun | - | - | Weekly | - |
| 03:30 Sun | - | Weekly | - | - |
| 03:45 Sun | - | - | - | Weekly |
| 04:00 1st | Monthly | - | - | - |
| 04:15 1st | - | - | Monthly | - |
| 04:30 1st | - | Monthly | - | - |
| 04:45 1st | - | - | - | Monthly |
| 06:00 | 6-hourly | - | - | - |
| 06:30 | - | - | 6-hourly | - |
| 12:00 | 6-hourly | - | - | - |
| 12:30 | - | - | 6-hourly | - |
| 18:00 | 6-hourly | - | - | - |
| 18:30 | - | - | 6-hourly | - |

---

## Support Commands

**View Host Inventory**:

```bash
ssh root@46.250.241.70 "cat /backup/config/host-inventory.txt"
```

**List All Job Configs**:

```bash
ssh root@46.250.241.70 "ls -lh /backup/config/ACDEV-*.json"
```

**Check Container Status**:

```bash
ssh root@46.250.241.70 "docker ps | grep duplicati"
```

**View Deployment Summary**:

```bash
ssh root@46.250.241.70 "cat /backup/config/CLOUD_DEPLOYMENT_SUMMARY.txt"
```

**Test Wasabi Connection**:

```bash
ssh root@46.250.241.70 "aws s3 ls s3://vmibackups/ --endpoint-url https://s3.ap-southeast-2.wasabisys.com --profile wasabi"
```

---

## Summary

### Completed ✅

- Duplicati container reconfigured with ACDEV host names
- 14 backup job templates created with proper naming
- All 4 ACDEV hosts registered in configuration
- Wasabi S3 bucket structure prepared
- SSH keys deployed to all remote hosts
- Encryption configured (AES-256)
- Cloud connection parameters configured

### Ready For ⏳

- Cloud portal registration (manual step required)
- Backup job import via Web GUI
- First test backup execution
- Automated backup scheduling
- Email notification setup

### System Status

| Component | Status |
|-----------|--------|
| Backup Server | ✅ Running (ACDEV-VMI02D) |
| Web GUI | ✅ Accessible (port 8200) |
| Container | ✅ Running (duplicati) |
| Job Templates | ✅ Created (14 files) |
| SSH Access | ✅ Configured (all hosts) |
| Wasabi S3 | ✅ Connected |
| Encryption | ✅ Configured (AES-256) |
| Cloud Registration | ⏳ Manual step required |
| Job Import | ⏳ Awaiting user action |
| Test Backup | ⏳ Awaiting user action |

---

**Deployment Date**: 2025-11-13
**Configured By**: Claude Code
**Status**: ✅ **READY FOR ACTIVATION**
**Web GUI**: <http://46.250.241.70:8200>
**Cloud Portal**: <https://duplicati.com/dashboard>
