# Duplicati Backup Jobs - VPN Configuration (UPDATED)

**✅ Using Internal VPN IPs for Better Security and Performance**

**Password**: C0nnaught
**Encryption Passphrase**: gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=

---

## Why VPN IPs?

Using internal VPN IPs (10.0.0.x) instead of public IPs offers:
- ✅ **More Secure** - Traffic stays within VPN tunnel
- ✅ **Faster** - Direct VPN connection vs internet routing
- ✅ **More Reliable** - Independent of public internet
- ✅ **Best Practice** - Internal traffic on internal network

---

## VPN Network Map

```
ACDEV-VMI01:     10.0.0.1  (was: 46.250.243.123)
ACDEV-VMI02D:    10.0.0.2  (was: 46.250.241.70) - Backup Server
ACDEV-VMI03:     10.0.0.3  (was: 154.26.158.31)
ACDEV-WG_GATEWAY: 10.0.0.4  (was: 154.26.158.31)
```

---

## Create First Backup Job (ACDEV-VMI01-daily)

### Step 1: Click "Add backup" → "Configure a new backup"

### Step 2: General Settings

**Name**:
```text
ACDEV-VMI01-daily
```

**Description**:
```text
ACDEV-VMI01 daily backup via VPN (10.0.0.1)
```

**Encryption**:
- Select: **"AES-256 encryption, built in"**
- Passphrase: `gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=`
- Confirm: `gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=`

Click **"Next"**

---

### Step 3: Backup Destination

**Storage Type**: **"S3 Compatible"**

**Use SSL**: ✅ Checked

**Server**: Custom server URL
```text
s3.ap-southeast-2.wasabisys.com
```

**Bucket name**:
```text
vmibackups
```

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

Click **"Test connection"** → Should show "Connection worked!"

Click **"Next"**

---

### Step 4: Source Data (VPN IPs)

**🔥 IMPORTANT: Use VPN IPs (10.0.0.x) not public IPs**

Click **"Add path"** for each:

**Path 1** (via VPN):
```text
ssh://root@10.0.0.1/opt/mcp/
```

**Path 2**:
```text
ssh://root@10.0.0.1/var/lib/postgresql/
```

**Path 3**:
```text
ssh://root@10.0.0.1/etc/
```

**Path 4**:
```text
ssh://root@10.0.0.1/root/
```

Click **"Next"**

---

### Step 5: Schedule

**Automatically run backups**: ✅ Checked

**Schedule**:
- Click **"Add schedule"**
- Type: **"Daily"**
- Time: **02:00**
- Click **"OK"**

Click **"Next"**

---

### Step 6: Options

**General**:
- Keep: **7** backups
- Upload verification file: ✅ Checked
- Backup test samples: **1**

**Advanced** (expand):
- Compression: **LZ4**
- Block size: **100MB**

Click **"Save"**

---

### Step 7: Test Backup

1. Find **ACDEV-VMI01-daily** in list
2. Click to expand
3. Click **"Run now"**
4. Monitor progress (10-30 min first run)
5. Should show "Success"

---

## All 14 Backup Jobs (VPN Configuration)

### ACDEV-VMI01 (10.0.0.1) - 4 jobs

| Job Name | Sources (via VPN) | Schedule | Retention | Folder Path |
|----------|-------------------|----------|-----------|-------------|
| **ACDEV-VMI01-6hourly** | `ssh://root@10.0.0.1/opt/mcp/`<br>`ssh://root@10.0.0.1/etc/`<br>`ssh://root@10.0.0.1/root/` | Every 6h<br>(00:00, 06:00, 12:00, 18:00) | 4 | `ACDEV-VMI01/6hourly` |
| **ACDEV-VMI01-daily** | Above + `ssh://root@10.0.0.1/var/lib/postgresql/` | Daily 02:00 | 7 | `ACDEV-VMI01/daily` |
| **ACDEV-VMI01-weekly** | Daily sources + `ssh://root@10.0.0.1/var/log/` | Sun 03:00 | 4 | `ACDEV-VMI01/weekly` |
| **ACDEV-VMI01-monthly** | Weekly sources + `ssh://root@10.0.0.1/var/`<br>`ssh://root@10.0.0.1/home/` | 1st 04:00 | 3 | `ACDEV-VMI01/monthly` |

---

### ACDEV-VMI02D (10.0.0.2 - LOCAL) - 3 jobs

| Job Name | Sources (Local) | Schedule | Retention | Folder Path |
|----------|-----------------|----------|-----------|-------------|
| **ACDEV-VMI02D-daily** | `/opt/`<br>`/etc/`<br>`/root/`<br>`/backup/config/` | Daily 02:30 | 7 | `ACDEV-VMI02D/daily` |
| **ACDEV-VMI02D-weekly** | Daily sources + `/var/log/`<br>`/backup/` | Sun 03:30 | 4 | `ACDEV-VMI02D/weekly` |
| **ACDEV-VMI02D-monthly** | Weekly sources + `/var/`<br>`/home/` | 1st 04:30 | 3 | `ACDEV-VMI02D/monthly` |

**Note**: VMI02D uses local paths (no `ssh://`) since Duplicati runs here

---

### ACDEV-VMI03 (10.0.0.3) - 4 jobs

| Job Name | Sources (via VPN) | Schedule | Retention | Folder Path |
|----------|-------------------|----------|-----------|-------------|
| **ACDEV-VMI03-6hourly** | `ssh://root@10.0.0.3/opt/mcp/`<br>`ssh://root@10.0.0.3/opt/thehive/`<br>`ssh://root@10.0.0.3/etc/` | Every 6h<br>(00:30, 06:30, 12:30, 18:30) | 4 | `ACDEV-VMI03/6hourly` |
| **ACDEV-VMI03-daily** | `ssh://root@10.0.0.3/opt/`<br>`ssh://root@10.0.0.3/var/lib/docker/volumes/`<br>`ssh://root@10.0.0.3/etc/` | Daily 02:15 | 7 | `ACDEV-VMI03/daily` |
| **ACDEV-VMI03-weekly** | Daily sources + `ssh://root@10.0.0.3/var/lib/docker/`<br>`ssh://root@10.0.0.3/var/log/` | Sun 03:15 | 4 | `ACDEV-VMI03/weekly` |
| **ACDEV-VMI03-monthly** | Weekly sources + `ssh://root@10.0.0.3/var/`<br>`ssh://root@10.0.0.3/home/` | 1st 04:15 | 3 | `ACDEV-VMI03/monthly` |

---

### ACDEV-WG_GATEWAY (10.0.0.4) - 3 jobs

| Job Name | Sources (via VPN) | Schedule | Retention | Folder Path |
|----------|-------------------|----------|-----------|-------------|
| **ACDEV-WG_GATEWAY-daily** | `ssh://root@10.0.0.4/etc/wireguard/`<br>`ssh://root@10.0.0.4/etc/`<br>`ssh://root@10.0.0.4/root/` | Daily 02:45 | 7 | `ACDEV-WG_GATEWAY/daily` |
| **ACDEV-WG_GATEWAY-weekly** | `ssh://root@10.0.0.4/etc/`<br>`ssh://root@10.0.0.4/root/`<br>`ssh://root@10.0.0.4/var/log/` | Sun 03:45 | 4 | `ACDEV-WG_GATEWAY/weekly` |
| **ACDEV-WG_GATEWAY-monthly** | Weekly sources + `ssh://root@10.0.0.4/var/` | 1st 04:45 | 3 | `ACDEV-WG_GATEWAY/monthly` |

---

## Common Settings for All Jobs

**Encryption**: AES-256
**Passphrase**: `gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=`

**S3 Destination**:
- Server: `s3.ap-southeast-2.wasabisys.com`
- Bucket: `vmibackups`
- Access ID: `WCZLQETBK6VXN55WECMQ`
- Secret Key: `fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD`
- Use SSL: ✅ Yes

**Options**:
- Compression: LZ4
- Block size: 100MB
- Upload verification: Yes
- Test samples: 1

---

## Quick Copy-Paste Reference

### VMI01 Paths (via VPN 10.0.0.1):
```
ssh://root@10.0.0.1/opt/mcp/
ssh://root@10.0.0.1/var/lib/postgresql/
ssh://root@10.0.0.1/etc/
ssh://root@10.0.0.1/root/
ssh://root@10.0.0.1/var/log/
ssh://root@10.0.0.1/var/
ssh://root@10.0.0.1/home/
```

### VMI02D Paths (local):
```
/opt/
/etc/
/root/
/backup/config/
/backup/
/var/log/
/var/
/home/
```

### VMI03 Paths (via VPN 10.0.0.3):
```
ssh://root@10.0.0.3/opt/mcp/
ssh://root@10.0.0.3/opt/thehive/
ssh://root@10.0.0.3/var/lib/docker/volumes/
ssh://root@10.0.0.3/var/lib/docker/
ssh://root@10.0.0.3/etc/
ssh://root@10.0.0.3/root/
ssh://root@10.0.0.3/var/log/
ssh://root@10.0.0.3/var/
ssh://root@10.0.0.3/home/
```

### WG_GATEWAY Paths (via VPN 10.0.0.4):
```
ssh://root@10.0.0.4/etc/wireguard/
ssh://root@10.0.0.4/etc/
ssh://root@10.0.0.4/root/
ssh://root@10.0.0.4/var/log/
ssh://root@10.0.0.4/var/
```

---

## Verification

After creating jobs, verify VPN connectivity:

```bash
# On VMI02D, test VPN SSH
ssh root@10.0.0.1 "hostname"  # Should show: acdev-vmi01
ssh root@10.0.0.3 "hostname"  # Should show: acdev-vmi03
```

All connections should work without password (using SSH keys deployed earlier).

---

## Job Creation Checklist

Create in this order:

- [ ] 1. **ACDEV-VMI01-daily** (TEST FIRST - via VPN 10.0.0.1)
- [ ] 2. ACDEV-VMI02D-daily (local paths)
- [ ] 3. ACDEV-VMI03-daily (via VPN 10.0.0.3)
- [ ] 4. ACDEV-WG_GATEWAY-daily (via VPN 10.0.0.4)
- [ ] 5. All weekly jobs
- [ ] 6. All monthly jobs
- [ ] 7. All 6-hourly jobs

**Estimated Time**: ~5 min per job = ~70 minutes total

---

**✅ VPN Configuration Complete - Ready to Create Jobs!**
