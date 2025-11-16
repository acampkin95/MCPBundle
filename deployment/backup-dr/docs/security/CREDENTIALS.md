# Duplicati Backup System - Credentials & Access

**Date**: 2025-11-13
**Server**: VMI02D (46.250.241.70) - data.acdev.host
**Status**: ✅ Operational

---

## Web GUI Access

**URL**: <http://46.250.241.70:8200>

**Initial Login**:

- **No password required on first access**
- On first visit, you'll be prompted to configure security
- Options:
  1. "No, my machine has only a single account" (no password)
  2. "Yes, I want a password and encryption" (recommended for production)

**Recommended Action**:

- Set a strong admin password when prompted
- Store the password securely (password manager)

---

## Encryption Passphrase (CRITICAL)

**Location**: `/backup/config/encryption-passphrase.txt` on VMI02D

**Passphrase**:

```text
gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=
```

⚠️ **CRITICAL IMPORTANCE**:

- Required for ALL backup restore operations
- Without this passphrase, backups CANNOT be decrypted
- Store in multiple secure locations:
  1. Password manager (encrypted vault)
  2. Offline secure storage (printed, in safe)
  3. Secondary encrypted backup location

**Usage**:

- Enter this passphrase when creating each backup job
- Required when restoring any files from backup
- Used for AES-256 encryption/decryption

---

## Wasabi S3 Credentials

**Access Method**: S3 Compatible Storage

**Configuration**:

```text
Endpoint: s3.ap-southeast-2.wasabisys.com
Bucket: vmibackups
Region: ap-southeast-2
```

**Credentials**:

```text
Access Key: WCZLQETBK6VXN55WECMQ
Secret Key: fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
```

**IAM User**: vmibackups-agent

**Usage in Duplicati**:

1. When creating backup job, select "S3 Compatible" as destination
2. Enter endpoint: `s3.ap-southeast-2.wasabisys.com`
3. Enter bucket: `vmibackups`
4. Enter path: `vmi01/daily` (example)
5. Enter Access Key and Secret Key
6. Enable SSL: Yes
7. Storage Class: Standard

---

## SSH Access (Remote Backups)

**VMI02D to Remote Nodes**:

**SSH Key Type**: RSA 4096-bit
**Key Location**: `/root/.ssh/id_rsa` (private), `/root/.ssh/id_rsa.pub` (public)
**Fingerprint**: SHA256:XrfpaFwVyS0xEVDQM1/Qe/VKjTofYSJwsSkQi8LV7Pc

**Public Key** (already deployed to VMI01 and VMI03):

```text
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDK... duplicati-backup@vmi02d
```

**Access Verified**:

- ✅ VMI01 (46.250.243.123) - SSH passwordless OK
- ✅ VMI03 (154.26.158.31) - SSH passwordless OK

**Usage in Duplicati**:

- Source paths use SSH format: `ssh://root@46.250.243.123/opt/mcp/`
- Key-based authentication (no password needed)

---

## Server Access (SSH)

**VMI02D Root Access**:

```text
Host: 46.250.241.70
Username: root
Password: C0nnaught
```

**SSH Command**:

```bash
ssh root@46.250.241.70
```

---

## Docker Container

**Container Name**: duplicati
**Image**: duplicati/duplicati:latest
**Status**: Running
**Container ID**: ad4f87bdbbb0

**Container Management**:

```bash
# View status
docker ps | grep duplicati

# View logs
docker logs -f duplicati

# Restart container
docker restart duplicati

# Stop container
docker stop duplicati

# Start container
docker start duplicati
```

---

## File Locations

**On VMI02D**:

```text
/backup/
├── cache/              # Temporary upload cache (100GB)
├── config/             # Duplicati configuration
│   ├── encryption-passphrase.txt  # ⚠️ CRITICAL FILE
│   └── BACKUP_SCHEDULE.txt
└── logs/               # Backup operation logs

/root/.ssh/
├── id_rsa              # Private SSH key for remote backups
└── id_rsa.pub          # Public SSH key

/root/.aws/
├── credentials         # Wasabi S3 credentials
└── config              # AWS CLI configuration
```

---

## Quick Access Commands

**View Encryption Passphrase**:

```bash
ssh root@46.250.241.70 "cat /backup/config/encryption-passphrase.txt"
```

**Test Wasabi Connection**:

```bash
ssh root@46.250.241.70 "aws s3 ls s3://vmibackups/ --endpoint-url https://s3.ap-southeast-2.wasabisys.com --profile wasabi"
```

**Check Container Status**:

```bash
ssh root@46.250.241.70 "docker ps | grep duplicati"
```

**Access Web GUI**:

Open in browser: <http://46.250.241.70:8200>

---

## Security Notes

1. **Change default root password** after initial setup (currently: C0nnaught)
2. **Set Duplicati admin password** on first Web GUI access
3. **Store encryption passphrase** in multiple secure locations
4. **Restrict Web GUI access** via firewall to trusted IPs only
5. **Regular password rotation** recommended every 90 days
6. **Enable HTTPS** for Web GUI (optional, via reverse proxy)

---

## Next Steps

1. ✅ Access Web GUI: <http://46.250.241.70:8200>
2. ✅ Set admin password when prompted
3. Create first backup job (vmi01-daily)
4. Test backup execution
5. Verify backup appears in Wasabi S3
6. Create remaining 10 backup jobs

---

**Document Created**: 2025-11-13
**Last Updated**: 2025-11-13
**Status**: ✅ All credentials verified and operational
