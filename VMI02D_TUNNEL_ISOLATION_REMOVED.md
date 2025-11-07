# VMI02D Tunnel Isolation Removal - Configuration Summary

**Date:** 2025-11-07
**Server:** VMI02D (vmi2888815)
**IP Address:** 46.250.241.70
**Status:** ✅ COMPLETED

---

## Executive Summary

VMI02D tunnel isolation has been removed for **rsync access only**. The firewall has been configured to allow public access to ports needed for NextCloud, Plex, and rsync, though **NextCloud and Plex are not yet installed** on the server.

### Current Status

| Service | Port | Status | Public Access |
|---------|------|--------|---------------|
| **rsync (SSH)** | 22 | ✅ Active | ✅ Allowed (with rate limiting) |
| **NextCloud HTTP** | 80 | ✅ Active (redirects to HTTPS) | ✅ Public |
| **NextCloud HTTPS** | 443 | ✅ Active (Let's Encrypt) | ✅ Public |
| **Plex** | 32400 | ⚠️ Not installed | ✅ Firewall open |

---

## rsync Access Credentials

### AccessService User (Recommended - Secure)

This is a restricted user specifically designed for rsync uploads:

```
Username:    AccessService
Password:    SDido39wj0JeroDumper
Server:      46.250.241.70
Upload Path: /srv/rsync-drop/AccessService/incoming
```

**Usage Example:**
```bash
# Upload a zip file
rsync -avz myfile.zip AccessService@46.250.241.70:
# Password: SDido39wj0JeroDumper

# Upload multiple files
rsync -avz *.zip AccessService@46.250.241.70:
# Password: SDido39wj0JeroDumper
```

### Security Restrictions

The AccessService user has the following restrictions:
- ✅ **Upload-only**: Cannot download or delete files
- ✅ **ZIP files only**: Non-zip files are automatically deleted
- ✅ **No shell access**: Interactive shell is disabled
- ✅ **No path traversal**: Cannot access directories outside incoming/
- ✅ **All actions logged**: Every rsync operation is logged
- ✅ **Forced rsync command**: Can only run rsync, nothing else

### Root User (Full Access - Less Secure)

For administrative rsync operations:

```
Username:    root
Password:    caxr84di@f1GLlCv
Server:      46.250.241.70
SSH Key:     /Users/alex/Projects/MCP Bundle/.key/ssh/data-admin_id_ed25519
```

**Usage Example:**
```bash
# With password
rsync -avz /local/path/ root@46.250.241.70:/remote/path/

# With SSH key (more secure)
rsync -avz -e "ssh -i .key/ssh/data-admin_id_ed25519" /local/path/ root@46.250.241.70:/remote/path/
```

---

## Firewall Configuration

### UFW Rules Applied

```
Status: active

 To                         Action      From
 --                         ------      ----
 22/tcp                     LIMIT IN    Anywhere                   # SSH with rate limit
 80/tcp                     ALLOW IN    Anywhere                   # NextCloud HTTP
 443/tcp                    ALLOW IN    Anywhere                   # NextCloud HTTPS
 32400/tcp                  ALLOW IN    Anywhere                   # Plex Media Server
```

### Security Features

1. **SSH Rate Limiting**: Enabled to prevent brute force attacks
   - Maximum 6 connection attempts per 30 seconds
   - Automatic blocking of excessive attempts

2. **fail2ban**: Active and monitoring SSH
   - Automatically bans IPs after failed login attempts
   - Protects against brute force attacks

3. **Logging**: All firewall and security events logged

---

## Services Installation Status

### rsync ✅ INSTALLED
- Version: 3.2.7 (protocol 31)
- Location: /usr/bin/rsync
- Configuration: Custom wrapper script for AccessService user

### NextCloud ✅ INSTALLED AND ACTIVE
- Version: 31.0.10 (Snap)
- URL: https://data.acdev.host
- Admin User: admin
- Admin Pass: NextCloud2025Admin!Pass
- SSL/TLS: Let's Encrypt (valid until 2026-02-04)
- Auto-renewal: Enabled
- Full Documentation: See VMI02D_NEXTCLOUD_CONFIGURATION.md

### Plex ⚠️ NOT INSTALLED
- Port 32400 is open and ready
- Needs installation before use
- Install with: `wget https://downloads.plex.tv/plex-media-server-new/...`

---

## Network Accessibility

### Before (VPN-Only)
```
Internet → VMI03 Gateway → WireGuard VPN → VMI02D
         (154.26.158.31)  (10.100.0.0/24)  (46.250.241.70)
```

### After (Direct Access)
```
Internet → VMI02D (Direct)
         (46.250.241.70)

         ✅ Port 22  (SSH/rsync) - Rate limited
         ✅ Port 80  (HTTP) - Open
         ✅ Port 443 (HTTPS) - Open
         ✅ Port 32400 (Plex) - Open
```

---

## Security Considerations

### ⚠️ IMPORTANT SECURITY NOTES

1. **SSH Exposure**: Port 22 is now publicly accessible
   - ✅ Mitigated by: Rate limiting + fail2ban
   - ⚠️ Recommendation: Use SSH keys instead of passwords
   - 🔴 Critical: Disable root password authentication after key setup

2. **Root Password Authentication**: Currently ENABLED
   - 🔴 **CRITICAL**: Should be disabled for production
   - Run after verifying key access:
   ```bash
   # Disable password auth
   sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
   sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
   systemctl restart sshd
   ```

3. **NextCloud/Plex Not Installed**: Ports are open but nothing is listening
   - When you install these services, ensure they use:
     - ✅ Strong authentication
     - ✅ HTTPS/TLS encryption
     - ✅ Regular security updates

4. **No Web Application Firewall**: Consider adding nginx reverse proxy with ModSecurity

5. **SSL/TLS Certificates**: Not yet configured
   - Install Let's Encrypt when NextCloud is ready:
   ```bash
   apt-get install certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com
   ```

---

## Recommended Next Steps

### Immediate (Within 24 hours)
1. ✅ Test rsync access with AccessService user
2. ⚠️ Verify SSH key authentication works for root
3. 🔴 Disable root password authentication
4. ⚠️ Set up monitoring for failed login attempts

### Short-term (Within 1 week)
1. Install NextCloud if needed
2. Configure SSL/TLS certificates
3. Install Plex Media Server if needed
4. Set up automated security updates
5. Configure log aggregation to VMI01

### Long-term (Within 1 month)
1. Implement nginx reverse proxy
2. Add Web Application Firewall (ModSecurity)
3. Set up intrusion detection
4. Regular security audits
5. Backup verification

---

## Testing Access

### Test rsync Access
```bash
# Test AccessService user
echo "test" > test.zip
rsync -avz test.zip AccessService@46.250.241.70:
# Password: SDido39wj0JeroDumper

# Verify upload
ssh root@46.250.241.70 'ls -la /srv/rsync-drop/AccessService/incoming/'
```

### Test SSH Access
```bash
# Test with password
ssh root@46.250.241.70
# Password: caxr84di@f1GLlCv

# Test with key
ssh -i .key/ssh/data-admin_id_ed25519 root@46.250.241.70
```

### Test Firewall
```bash
# Check open ports
nmap -p 22,80,443,32400 46.250.241.70

# Test HTTP (will fail until NextCloud installed)
curl -v http://46.250.241.70

# Test Plex (will fail until Plex installed)
curl -v http://46.250.241.70:32400/web
```

---

## Rollback Instructions

If you need to revert to VPN-only access:

```bash
# SSH to VMI02D
ssh root@46.250.241.70

# Remove public access (keep only SSH for now)
ufw delete allow 80/tcp
ufw delete allow 443/tcp
ufw delete allow 32400/tcp

# Optionally restrict SSH to VPN only
ufw delete limit 22/tcp
ufw allow from 10.100.0.0/24 to any port 22 comment 'SSH from Root VPN only'

# Reload firewall
ufw reload
```

---

## AccessService Script Details

The `/usr/local/bin/rsync-accessservice` wrapper provides security by:

```bash
# Blocked operations:
- Download (--sender)
- Delete files (--delete*)
- Remove files (--remove*)
- Path traversal (..)
- Absolute paths (/)
- Custom rsync paths
- Remote shell overrides

# Allowed:
- Upload to current directory only
- ZIP files only (others auto-deleted)
- Relative paths within allowed directory
```

All operations are logged to syslog with tag `rsync-accessservice`.

---

## Contact & Support

**Server Administrator**: Alex Campkin
**Email**: acampkinpersonnal@gmail.com
**Documentation Location**: `/Users/alex/Projects/MCP Bundle/`

---

## Changelog

| Date | Action | Details |
|------|--------|---------|
| 2025-11-07 | Initial Configuration | - Enabled UFW firewall<br>- Opened ports 22, 80, 443, 32400<br>- Configured SSH rate limiting<br>- Installed fail2ban<br>- Documented AccessService credentials |
| 2025-11-07 | Password Update | - Changed AccessService password to: SDido39wj0JeroDumper |
| 2025-11-07 | NextCloud Installation | - Installed NextCloud 31.0.10 via Snap<br>- Configured domain: data.acdev.host<br>- Obtained Let's Encrypt SSL certificate<br>- Configured automatic certificate renewal<br>- NextCloud accessible at: https://data.acdev.host |

---

**Configuration Status**: ✅ COMPLETE
**Security Review**: ⚠️ REQUIRED (Disable root password auth)
**Services Status**: ⚠️ NextCloud and Plex need installation
**Overall Rating**: 7.5/10 (Good, but needs hardening)
