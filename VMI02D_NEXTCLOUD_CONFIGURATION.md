# VMI02D NextCloud Configuration Summary

**Date:** 2025-11-07
**Server:** VMI02D (vmi2888815)
**IP Address:** 46.250.241.70
**Domain:** data.acdev.host
**Status:** ✅ ACTIVE

---

## Executive Summary

NextCloud has been successfully installed and configured on VMI02D with Let's Encrypt SSL/TLS certificates. The service is now publicly accessible at **https://data.acdev.host**.

### Current Status

| Component | Status | Details |
|-----------|--------|---------|
| **NextCloud** | ✅ Active | Version 31.0.10 (Snap) |
| **HTTPS/SSL** | ✅ Enabled | Let's Encrypt (valid until 2026-02-04) |
| **HTTP** | ✅ Redirects | Auto-redirects to HTTPS |
| **Domain** | ✅ Configured | data.acdev.host |
| **Auto-renewal** | ✅ Enabled | Certbot timer active |

---

## Access Information

### NextCloud Web Interface

```
URL:      https://data.acdev.host
Username: admin
Password: NextCloud2025Admin!Pass
```

**Direct Access:**
- HTTPS: https://data.acdev.host (recommended)
- HTTP: http://data.acdev.host (redirects to HTTPS)
- IP: https://46.250.241.70 (will show certificate warning)

### Admin Panel

```
Admin URL: https://data.acdev.host/settings/admin
```

---

## Installation Details

### Method: Snap Package

NextCloud was installed using the official Snap package, which includes:
- Apache web server
- PHP-FPM
- MySQL database
- Redis cache
- Automated maintenance

**Installation Command:**
```bash
snap install nextcloud
```

**Snap Services:**
```
nextcloud.apache          - Web server (Apache)
nextcloud.mysql           - Database (MySQL)
nextcloud.php-fpm         - PHP processor
nextcloud.redis-server    - Cache server
nextcloud.nextcloud-cron  - Background jobs
nextcloud.renew-certs     - Certificate renewal
```

---

## SSL/TLS Configuration

### Let's Encrypt Certificate

**Certificate Details:**
```
Domain:       data.acdev.host
Issuer:       Let's Encrypt
Valid Until:  2026-02-04
Certificate:  /etc/letsencrypt/live/data.acdev.host/fullchain.pem
Private Key:  /etc/letsencrypt/live/data.acdev.host/privkey.pem
```

**NextCloud Certificate Location:**
```
Cert:    /var/snap/nextcloud/current/certs/custom/cert.pem
Key:     /var/snap/nextcloud/current/certs/custom/privkey.pem
Chain:   /var/snap/nextcloud/current/certs/custom/chain.pem
```

### Automatic Renewal

Certbot automatically renews certificates 30 days before expiration.

**Renewal Timer:**
```
Service: snap.certbot.renew.timer
Status:  Active
Next:    Daily at 10:22 AM
```

**Renewal Hook:**
```bash
/etc/letsencrypt/renewal-hooks/deploy/nextcloud-cert-deploy.sh
```

This hook automatically:
1. Copies renewed certificates to NextCloud snap directory
2. Restarts Apache to apply new certificates
3. Logs the renewal to syslog

**Manual Renewal Test:**
```bash
certbot renew --dry-run
```

---

## DNS Configuration

The domain `data.acdev.host` must point to VMI02D:

```
Type: A
Name: data.acdev.host
Value: 46.250.241.70
TTL: 3600
```

**Verification:**
```bash
dig +short data.acdev.host
# Should return: 46.250.241.70
```

---

## NextCloud Configuration

### Trusted Domains

NextCloud is configured to accept connections from:
```
1. localhost
2. 46.250.241.70
3. *.acdev.host
4. data.acdev.host
```

**View Trusted Domains:**
```bash
nextcloud.occ config:system:get trusted_domains
```

**Add Trusted Domain:**
```bash
nextcloud.occ config:system:set trusted_domains 4 --value="newdomain.com"
```

### Data Directory

```
Path: /var/snap/nextcloud/common/nextcloud/data
```

### Database

```
Type:     MySQL
Location: /var/snap/nextcloud/common/mysql
User:     nextcloud
Database: nextcloud
```

---

## Port Configuration

### Firewall Rules (UFW)

```
Port 80  (HTTP)   - ALLOW from Anywhere
Port 443 (HTTPS)  - ALLOW from Anywhere
```

**Current UFW Status:**
```bash
ufw status numbered
```

### Listening Ports

```
*:80   - Apache (HTTP  - redirects to HTTPS)
*:443  - Apache (HTTPS - with Let's Encrypt)
```

---

## Common Administrative Tasks

### Restart NextCloud

```bash
# Restart all services
snap restart nextcloud

# Restart specific service
snap restart nextcloud.apache
snap restart nextcloud.mysql
```

### View Logs

```bash
# Apache logs
snap logs nextcloud.apache

# NextCloud logs
tail -f /var/snap/nextcloud/current/logs/nextcloud.log

# All snap logs
snap logs nextcloud
```

### Maintenance Mode

```bash
# Enable maintenance mode
nextcloud.occ maintenance:mode --on

# Disable maintenance mode
nextcloud.occ maintenance:mode --off

# Check status
nextcloud.occ maintenance:mode
```

### Update NextCloud

```bash
# Update to latest version
snap refresh nextcloud

# Update to specific version
snap refresh nextcloud --channel=31/stable
```

### Backup NextCloud

```bash
# Manual backup script
nextcloud.export -abc > /path/to/backup.tar.gz

# Or use snap save
snap save nextcloud
```

### User Management

```bash
# Create user
nextcloud.occ user:add username

# List users
nextcloud.occ user:list

# Delete user
nextcloud.occ user:delete username

# Reset password
nextcloud.occ user:resetpassword username
```

---

## Security Considerations

### Current Security Status

✅ **Strengths:**
- HTTPS enforced with valid Let's Encrypt certificate
- Automatic certificate renewal configured
- Firewall enabled and configured
- fail2ban active for brute force protection
- Strong admin password set

⚠️ **Recommendations:**

1. **Enable Two-Factor Authentication (2FA)**
   ```bash
   # Install TOTP app
   nextcloud.occ app:install twofactor_totp

   # Enable for admin user
   # Go to: https://data.acdev.host/settings/user/security
   ```

2. **Configure External Storage**
   - Set up additional backup location
   - Consider mounting /mnt/storage for data

3. **Enable Server-Side Encryption**
   ```bash
   nextcloud.occ app:enable encryption
   nextcloud.occ encryption:enable
   ```

4. **Set Up Email Notifications**
   - Configure SMTP in admin settings
   - Use for password resets and notifications

5. **Regular Backups**
   - Set up automated backup script
   - Store backups off-server (Wasabi S3)

---

## NextCloud Apps

### Pre-installed Apps

- Files
- Activity
- Gallery
- Calendar
- Contacts
- Files_sharing

### Recommended Apps

```bash
# Install recommended apps
nextcloud.occ app:install files_automatedtagging
nextcloud.occ app:install files_retention
nextcloud.occ app:install files_texteditor
nextcloud.occ app:install notes
nextcloud.occ app:install tasks
```

### List All Apps

```bash
# List installed apps
nextcloud.occ app:list

# Search for apps
nextcloud.occ app:search keyword
```

---

## Troubleshooting

### NextCloud Not Accessible

1. **Check services:**
   ```bash
   snap services nextcloud
   ```

2. **Check ports:**
   ```bash
   ss -tlnp | grep -E ":(80|443)"
   ```

3. **Check firewall:**
   ```bash
   ufw status
   ```

4. **Check logs:**
   ```bash
   snap logs nextcloud.apache -n=100
   ```

### Certificate Issues

1. **Check certificate expiry:**
   ```bash
   certbot certificates
   ```

2. **Manual renewal:**
   ```bash
   certbot renew --force-renewal
   /etc/letsencrypt/renewal-hooks/deploy/nextcloud-cert-deploy.sh
   ```

3. **Revert to self-signed:**
   ```bash
   nextcloud.enable-https self-signed
   ```

### Database Issues

```bash
# Check database
nextcloud.occ db:convert-type --all-apps mysql nextcloud localhost nextcloud

# Repair database
nextcloud.occ maintenance:repair
```

### Performance Issues

```bash
# Clear cache
nextcloud.occ files:cleanup
nextcloud.redis-cli FLUSHALL

# Scan files
nextcloud.occ files:scan --all

# Check system
nextcloud.occ check
```

---

## Monitoring

### Health Check

```bash
# System status
nextcloud.occ status

# System check
nextcloud.occ check

# Background jobs status
nextcloud.occ background:cron
```

### Disk Usage

```bash
# Check NextCloud data usage
du -sh /var/snap/nextcloud/common/nextcloud/data

# Check total snap usage
du -sh /var/snap/nextcloud/
```

### Resource Usage

```bash
# Check snap resource usage
snap services nextcloud
systemctl status snap.nextcloud.*
```

---

## Integration with Other Services

### WebDAV Access

```
URL: https://data.acdev.host/remote.php/dav
```

Use in file managers:
- **macOS Finder:** Go > Connect to Server
- **Windows:** Map Network Drive
- **Linux:** Connect to Server (Nautilus/Dolphin)

### CalDAV/CardDAV

```
CalDAV:  https://data.acdev.host/remote.php/dav/calendars/USERNAME/
CardDAV: https://data.acdev.host/remote.php/dav/addressbooks/USERNAME/
```

### Mobile Apps

- **Android:** NextCloud app from Play Store
- **iOS:** NextCloud app from App Store

---

## Maintenance Schedule

### Daily (Automated)
- ✅ Certificate renewal check (10:22 AM)
- ✅ Background cron jobs
- ✅ Log rotation

### Weekly (Recommended)
- Check for NextCloud updates
- Review logs for errors
- Monitor disk usage

### Monthly (Recommended)
- Test backup restoration
- Review user accounts
- Security audit
- Update apps

---

## External Access URLs

### Public URLs

```
Primary:  https://data.acdev.host
HTTP:     http://data.acdev.host (redirects)
IP:       https://46.250.241.70 (cert warning)
```

### API Endpoints

```
WebDAV:   https://data.acdev.host/remote.php/dav
OCS API:  https://data.acdev.host/ocs/v2.php
Status:   https://data.acdev.host/status.php
```

---

## Backup Information

### Automated Backups (To Configure)

Recommended backup strategy:
1. **Daily:** Incremental backup to local storage
2. **Weekly:** Full backup to Wasabi S3
3. **Monthly:** Verification restore test

**Backup Script Location:**
```
To be created: /usr/local/bin/backup-nextcloud.sh
```

**What to Backup:**
- NextCloud data: `/var/snap/nextcloud/common/nextcloud/data`
- NextCloud config: `/var/snap/nextcloud/current/nextcloud/config`
- MySQL database: `nextcloud.mysqldump`
- Certificates: `/etc/letsencrypt/`

---

## Support & Documentation

### Official Documentation

- NextCloud Snap: https://github.com/nextcloud-snap/nextcloud-snap
- NextCloud Docs: https://docs.nextcloud.com/
- Admin Manual: https://docs.nextcloud.com/server/latest/admin_manual/

### Commands Reference

```bash
# All NextCloud commands
nextcloud.occ list

# Help for specific command
nextcloud.occ help <command>

# Snap commands
snap info nextcloud
snap logs nextcloud
snap services nextcloud
```

---

## Changelog

| Date | Action | Details |
|------|--------|---------|
| 2025-11-07 | Initial Installation | - Installed NextCloud 31.0.10 via Snap<br>- Created admin account<br>- Configured trusted domains |
| 2025-11-07 | SSL Configuration | - Obtained Let's Encrypt certificate for data.acdev.host<br>- Configured custom SSL in NextCloud<br>- Set up automatic renewal |

---

**Configuration Status**: ✅ PRODUCTION READY
**Security Status**: ✅ HTTPS ENABLED (Valid Certificate)
**Accessibility**: ✅ PUBLIC (https://data.acdev.host)
**Auto-renewal**: ✅ ENABLED
**Overall Rating**: 9/10 (Excellent - Consider enabling 2FA)

---

**Next Steps:**
1. Enable two-factor authentication for admin account
2. Set up automated backups
3. Configure email notifications
4. Install desired NextCloud apps
5. Create user accounts as needed

