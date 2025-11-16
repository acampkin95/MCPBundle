# Duplicati Web GUI - Backup Job Creation Guide

**Current Status**: You're logged in to Duplicati with one device visible
**Password**: C0nnaught
**Encryption Passphrase**: gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=

---

## Create Your First Backup Job (ACDEV-VMI01-daily)

Follow these steps exactly in the Duplicati Web GUI:

### Step 1: Start New Backup

1. Click the **"Add backup"** button (top left)
2. Select **"Configure a new backup"**
3. Click **"Next"**

---

### Step 2: General Settings

**Name**:

```text
ACDEV-VMI01-daily
```

**Description**:

```text
ACDEV-VMI01 daily backup - Primary server daily snapshot
```

**Encryption**:

- Select: **"AES-256 encryption, built in"**
- Passphrase: `gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=`
- Confirm passphrase: `gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=`

Click **"Next"**

---

### Step 3: Backup Destination

**Storage Type**: Select **"S3 Compatible"**

**Use SSL**: ✅ Check this box

**Server**: Custom server URL

```text
s3.ap-southeast-2.wasabisys.com
```

**Bucket name**:

```text
vmibackups
```

**Bucket create region**: (leave empty)

**Storage class**: Standard

**Folder path**:

```text
ACDEV-VMI01/daily
```

**AWS Access ID**:

```text
WCZLQETBK6VXN55WECMQ
```

**AWS Secret Access Key**:

```text
fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
```

Click **"Test connection"** - should say "Connection worked!"

Click **"Next"**

---

### Step 4: Source Data

Click **"Add path"** and enter these paths one by one:

**Path 1** (SSH format):

```text
ssh://root@46.250.243.123/opt/mcp/
```

**Path 2**:

```text
ssh://root@46.250.243.123/var/lib/postgresql/
```

**Path 3**:

```text
ssh://root@46.250.243.123/etc/
```

**Path 4**:

```text
ssh://root@46.250.243.123/root/
```

**Important**: Make sure each path ends with a `/`

Click **"Next"**

---

### Step 5: Schedule

**Automatically run backups**: ✅ Check this box

**Time**:

- Click **"Add schedule"**
- Select **"Daily"**
- Time: **02:00** (2:00 AM)
- Click **"OK"**

Click **"Next"**

---

### Step 6: Options

**General Options**:

- Keep: **7** backups (type "7")
- Upload verification file: ✅ Checked
- Backup test samples: **1**

**Advanced Options** (click to expand):

- Compression: **LZ4**
- Block size: **100MB**

Click **"Save"**

---

### Step 7: Test the Backup

1. Find **ACDEV-VMI01-daily** in the backup list
2. Click the backup name to expand it
3. Click **"Run now"** button
4. Wait for backup to complete (10-30 minutes)
5. Check status - should show "Success"

---

## Verify Backup in Wasabi

After backup completes, verify it uploaded:

```bash
# On VMI02D
aws s3 ls s3://vmibackups/ACDEV-VMI01/daily/ --recursive \
  --endpoint-url https://s3.ap-southeast-2.wasabisys.com \
  --profile wasabi
```

Should see backup files listed.

---

## Create Remaining 13 Backup Jobs

Once the first backup succeeds, create these jobs using the same steps:

### ACDEV-VMI01 (3 more jobs):

**ACDEV-VMI01-6hourly**:
- Sources: Same as daily but exclude `/var/lib/postgresql/`
- Schedule: Every 6 hours (00:00, 06:00, 12:00, 18:00)
- Retention: 4 backups
- Folder path: `ACDEV-VMI01/6hourly`

**ACDEV-VMI01-weekly**:
- Sources: Add `/var/log/` to the paths
- Schedule: Weekly, Sunday 03:00
- Retention: 4 backups
- Folder path: `ACDEV-VMI01/weekly`

**ACDEV-VMI01-monthly**:
- Sources: Add `/var/`, `/home/` to the paths
- Schedule: Monthly, 1st day, 04:00
- Retention: 3 backups
- Folder path: `ACDEV-VMI01/monthly`

---

### ACDEV-VMI02D (3 jobs):

**ACDEV-VMI02D-daily**:
- Sources: `/opt/`, `/etc/`, `/root/`, `/backup/config/` (local paths, no ssh://)
- Schedule: Daily 02:30
- Retention: 7 backups
- Folder path: `ACDEV-VMI02D/daily`

**ACDEV-VMI02D-weekly**:
- Sources: `/opt/`, `/etc/`, `/root/`, `/var/log/`, `/backup/`
- Schedule: Weekly, Sunday 03:30
- Retention: 4 backups
- Folder path: `ACDEV-VMI02D/weekly`

**ACDEV-VMI02D-monthly**:
- Sources: `/opt/`, `/etc/`, `/root/`, `/var/`, `/home/`, `/backup/`
- Schedule: Monthly, 1st day, 04:30
- Retention: 3 backups
- Folder path: `ACDEV-VMI02D/monthly`

---

### ACDEV-VMI03 (4 jobs):

**ACDEV-VMI03-6hourly**:
- Sources: `ssh://root@154.26.158.31/opt/mcp/`, `/opt/thehive/`, `/etc/`
- Schedule: Every 6 hours, offset by 30 minutes (00:30, 06:30, 12:30, 18:30)
- Retention: 4 backups
- Folder path: `ACDEV-VMI03/6hourly`

**ACDEV-VMI03-daily**:
- Sources: Add `/var/lib/docker/volumes/`
- Schedule: Daily 02:15
- Retention: 7 backups
- Folder path: `ACDEV-VMI03/daily`

**ACDEV-VMI03-weekly**:
- Sources: Full Docker paths + logs
- Schedule: Weekly, Sunday 03:15
- Retention: 4 backups
- Folder path: `ACDEV-VMI03/weekly`

**ACDEV-VMI03-monthly**:
- Sources: Complete system
- Schedule: Monthly, 1st day, 04:15
- Retention: 3 backups
- Folder path: `ACDEV-VMI03/monthly`

---

### ACDEV-WG_GATEWAY (3 jobs):

**ACDEV-WG_GATEWAY-daily**:
- Sources: `ssh://root@154.26.158.31/etc/wireguard/`, `/etc/`, `/root/`
- Schedule: Daily 02:45
- Retention: 7 backups
- Folder path: `ACDEV-WG_GATEWAY/daily`

**ACDEV-WG_GATEWAY-weekly**:
- Sources: `/etc/`, `/root/`, `/var/log/`
- Schedule: Weekly, Sunday 03:45
- Retention: 4 backups
- Folder path: `ACDEV-WG_GATEWAY/weekly`

**ACDEV-WG_GATEWAY-monthly**:
- Sources: `/etc/`, `/root/`, `/var/`
- Schedule: Monthly, 1st day, 04:45
- Retention: 3 backups
- Folder path: `ACDEV-WG_GATEWAY/monthly`

---

## Quick Reference

**All Jobs Use**:
- Encryption: AES-256
- Passphrase: `gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=`
- Bucket: `vmibackups`
- Server: `s3.ap-southeast-2.wasabisys.com`
- Access Key: `WCZLQETBK6VXN55WECMQ`
- Secret Key: `fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD`
- Compression: LZ4
- Block size: 100MB

**Folder Path Pattern**: `HOSTNAME/schedule-type/`

---

## Troubleshooting

**"SSH connection failed"**:
- Check SSH key is deployed: `ssh root@46.250.243.123 "hostname"`
- Should connect without password

**"S3 connection failed"**:
- Double-check Access Key and Secret Key
- Ensure "Use SSL" is checked
- Verify server URL has no `https://` prefix

**"Backup taking too long"**:
- First backup is always slow (full backup)
- Subsequent backups are incremental (much faster)
- VMI01 daily: expect 30-60 minutes first time

**"Files not found"**:
- Ensure paths end with `/`
- For SSH paths, use format: `ssh://root@IP/path/`
- For local paths (VMI02D), use format: `/path/`

---

## Job Creation Checklist

Create jobs in this recommended order:

- [ ] 1. ACDEV-VMI01-daily (TEST FIRST)
- [ ] 2. ACDEV-VMI02D-daily
- [ ] 3. ACDEV-VMI03-daily
- [ ] 4. ACDEV-WG_GATEWAY-daily
- [ ] 5. ACDEV-VMI01-weekly
- [ ] 6. ACDEV-VMI02D-weekly
- [ ] 7. ACDEV-VMI03-weekly
- [ ] 8. ACDEV-WG_GATEWAY-weekly
- [ ] 9. ACDEV-VMI01-monthly
- [ ] 10. ACDEV-VMI02D-monthly
- [ ] 11. ACDEV-VMI03-monthly
- [ ] 12. ACDEV-WG_GATEWAY-monthly
- [ ] 13. ACDEV-VMI01-6hourly
- [ ] 14. ACDEV-VMI03-6hourly

**Estimated Time**: 5-7 minutes per job = ~90 minutes total

---

Good luck! Start with **ACDEV-VMI01-daily** and test it before creating the rest.
