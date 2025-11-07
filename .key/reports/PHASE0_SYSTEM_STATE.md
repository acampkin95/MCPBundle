# Phase 0: Pre-Flight Check - System State Report
**Date:** 2025-11-06
**Your Public IP (IPv6):** `2405:dc00:ed5b:61b4:2068:1ff7:63be:74e9`

---

## VM Inventory & Current State

### VMI01 - Dev/MCP Server (46.250.243.123)
- **Hostname:** vmi2870958
- **OS:** Ubuntu 24.04.3 LTS (Noble Numbat)
- **Kernel:** 6.8.0-86-generic (x86_64)
- **Disk:** 193GB total, 2.2GB used, **191GB available**
- **Memory:** 12GB total, 502MB used, **11GB available**
- **Swap:** None configured (⚠️ will add 4GB in Phase 1)
- **Network:**
  - eth0: 46.250.243.123/21 (public)
  - eth1: 10.0.0.1/22 (private LAN)
- **SSH:** ✅ Accessible with root password
- **Services:** Minimal Ubuntu installation, SSH active

### VMI02D - Storage Server (46.250.241.70)
- **Hostname:** vmi2888815
- **OS:** Ubuntu 24.04.3 LTS (Noble Numbat)
- **Kernel:** 6.8.0-86-generic (x86_64)
- **Disk:** 968GB total, 2.2GB used, **966GB available** (🎯 Excellent for storage!)
- **Memory:** 18GB total, 570MB used, **17GB available**
- **Swap:** None configured (⚠️ will add 4GB in Phase 1)
- **Network:** Private LAN configured
- **SSH:** ✅ Accessible with root password
- **Services:** Minimal Ubuntu installation, SSH active

### VMI03 - Security Gateway (154.26.158.31)
- **Hostname:** vmi2889604
- **OS:** Ubuntu 24.04.3 LTS (Noble Numbat)
- **Kernel:** 6.8.0-86-generic (x86_64)
- **Disk:** 96GB total, 2.2GB used, **94GB available**
- **Memory:** 12GB total, 503MB used, **11GB available**
- **Swap:** None configured (⚠️ will add 4GB in Phase 1)
- **Network:** Private LAN configured
- **SSH:** ✅ Accessible with root password
- **Services:** Minimal Ubuntu installation, SSH active

---

## Credentials & Keys Generated

### Root Access
- **Username:** root
- **Password:** caxr84di@f1GLlCv
- **Status:** ✅ All three VMs accessible

### Admin SSH Keys Generated
1. **dev-admin** (VMI01)
   - Private key: `.key/ssh/dev-admin_id_ed25519`
   - Public key: `.key/ssh/dev-admin_id_ed25519.pub`
   - Fingerprint: SHA256:fByse2ONDnpJfsdcAolOd+ZDmBq7YkhRmwrLYM5JNuo

2. **data-admin** (VMI02D)
   - Private key: `.key/ssh/data-admin_id_ed25519`
   - Public key: `.key/ssh/data-admin_id_ed25519.pub`
   - Fingerprint: SHA256:cRf/HKHNwkJlBejpFbDpik/8akJrqQiuceSaj4va5GY

3. **sec-admin** (VMI03)
   - Private key: `.key/ssh/sec-admin_id_ed25519`
   - Public key: `.key/ssh/sec-admin_id_ed25519.pub`
   - Fingerprint: SHA256:b3c6jql+op1MTgkJnbdfuTKQtNz+A6RYLUOmCz0xjXY

### API Keys
- **Perplexity API:** `[REDACTED]`
- **Cloudflare DNS:** `[REDACTED]`

### Backup Configuration
- **Provider:** Wasabi S3 (AP Southeast 2)
- **Bucket:** vmibackups
- **Endpoint:** s3.ap-southeast-2.wasabisys.com
- **Credentials:** (will extract from provided image in Phase 6)

---

## Network Topology

```
Internet
   │
   ├─ VMI01 (46.250.243.123) - Dev/MCP Server
   │   └─ Private: 10.0.0.1/22
   │
   ├─ VMI02D (46.250.241.70) - Storage Server
   │   └─ Private LAN: 10.0.x.x/22
   │
   └─ VMI03 (154.26.158.31) - Security Gateway
       └─ WireGuard Tunnels (to be configured):
           ├─ Root Tunnel (51820): 10.100.0.0/24
           ├─ MCP Tunnel (51821): 10.101.0.0/24
           └─ Red Tunnel (51822): 10.102.0.0/24
```

---

## Whitelist Configuration
- **Your Public IP:** `2405:dc00:ed5b:61b4:2068:1ff7:63be:74e9`
- **Whitelisted Device:** FOTW_XVP7W61TJM (MAC: 6e:d9:d3:17:f6:48)
- **Whitelisted User:** alex.campkin

---

## Security Baseline Assessment

### Current State: ⚠️ **Minimal Security**
- ✅ SSH enabled (good for remote access)
- ❌ Password authentication enabled for root (HIGH RISK)
- ❌ No firewall configured
- ❌ No fail2ban or intrusion detection
- ❌ No automatic security updates
- ❌ No swap space (memory management risk)
- ❌ No audit logging
- ❌ Default Ubuntu services exposed

### Target State: ✅ **8/10 Security Standard** (Phase 1)
- SSH key-only authentication
- UFW firewall with strict rules
- Fail2Ban with IP whitelisting
- Automatic security updates
- Kernel hardening (sysctl)
- Audit logging (auditd)
- Swap space configured
- Minimal service exposure
- Regular CVE scanning

---

## Next Steps: Phase 1

Phase 1 will transform these fresh Ubuntu installations into hardened production servers:

1. **System Updates:** Full package updates + unattended-upgrades
2. **Firewall:** UFW with service-specific rules
3. **Authentication:** SSH key-only, disable root password
4. **Monitoring:** fail2ban, auditd, logwatch
5. **Hardening:** Kernel parameters, file descriptor limits
6. **Users:** Create admin accounts, configure AccessService
7. **Audit:** Lynis security audit (target: 80+)

Estimated time: ~2.5 hours for all three VMs.

---

**Phase 0 Status:** ✅ COMPLETE
