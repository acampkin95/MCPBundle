# WORM Area Setup for VMI02D

## Overview

This documentation covers the setup of a **Write-Once-Read-Many (WORM)** secure file drop zone on VMI02D using the AccessService user account. The system provides:

- **SFTP-only access** with chroot jail isolation
- **Automated file archival** from upload directory to secure storage
- **Immutable file storage** preventing modification after archival
- **Defense-in-depth security** with multiple protective layers

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VMI02D Server                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SFTP Client                                                 │
│       │                                                      │
│       │ (SFTP only, chrooted)                               │
│       ▼                                                      │
│  ┌──────────────────────────────┐                          │
│  │  /home/AccessService/        │                          │
│  │  ├── upload/  (writable)     │  ◄── User lands here    │
│  │  └── (no other access)       │                          │
│  └──────────────────────────────┘                          │
│       │                                                      │
│       │ (File uploaded)                                     │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────────────┐                          │
│  │  inotify watches upload/     │                          │
│  │  Triggers on file close      │  ◄── worm-archive.service │
│  └──────────────────────────────┘                          │
│       │                                                      │
│       │ (Move + timestamp)                                  │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────────────┐                          │
│  │  /mnt/secure-archive/        │                          │
│  │  ├── 20250107_143022_file.txt│  ◄── Immutable (chattr +i)│
│  │  ├── 20250107_143055_doc.pdf │                          │
│  │  └── ...                     │  ◄── Admin access only   │
│  └──────────────────────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Security Features

### 1. SFTP-Only Access
- User cannot get shell access (nologin shell)
- ForceCommand internal-sftp in SSH config
- Only file transfer operations allowed

### 2. Chroot Jail
- User confined to `/home/AccessService/`
- Cannot traverse to parent directories
- Cannot access system files or other user directories

### 3. Write-Once Mechanism
- Files automatically moved from `upload/` to `/mnt/secure-archive/`
- Timestamp prefix prevents filename collisions
- Immutable flag (`chattr +i`) prevents modification/deletion
- Archive directory readable only by root/admins

### 4. Automated Monitoring
- Systemd service ensures 24/7 operation
- inotify provides real-time file detection
- No polling overhead
- Automatic restart on failure

## Installation

### Prerequisites

- Root access to VMI02D
- Ubuntu/Debian or RHEL/CentOS Linux
- OpenSSH server installed
- Internet connection (for installing dependencies)

### Step 1: Upload Setup Script

Copy the setup script to VMI02D:

```bash
scp setup-worm-vmi02d.sh root@46.250.243.123:/root/
```

Or manually create the file on the server.

### Step 2: Make Script Executable

```bash
chmod +x /root/setup-worm-vmi02d.sh
```

### Step 3: Run Setup

```bash
./setup-worm-vmi02d.sh
```

The script will:
1. Create the AccessService user
2. Set up directory structure
3. Configure SSH/SFTP with chroot jail
4. Install inotify-tools
5. Create and start the WORM archive service
6. Set up log rotation
7. Run verification checks

### Step 4: Verify Installation

Check that the service is running:

```bash
systemctl status worm-archive.service
```

View initial logs:

```bash
tail -f /var/log/worm-archive.log
```

## Configuration Details

### User Account
- **Username**: `AccessService`
- **Password**: `Jeremylikestosuckbigdicks8==>`
- **Shell**: `/usr/sbin/nologin` (no shell access)
- **Home**: `/home/AccessService/`

### Directory Structure
```
/home/AccessService/
├── upload/          # User-writable directory (770, AccessService:AccessService)
└── [no other dirs]  # Chroot prevents seeing anything else

/mnt/secure-archive/ # Admin-only directory (750, root:root)
└── [archived files] # Timestamped, immutable files
```

### SSH Configuration
Added to `/etc/ssh/sshd_config`:

```
Match User AccessService
    ChrootDirectory /home/AccessService
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
```

### Systemd Service
- **Service**: `worm-archive.service`
- **Script**: `/usr/local/bin/worm-archive.sh`
- **Auto-start**: Enabled
- **Restart**: Always (5 second delay)

## Usage

### Uploading Files

From a client machine with SFTP:

```bash
sftp AccessService@46.250.243.123
# Enter password: Jeremylikestosuckbigdicks8==>

sftp> cd upload
sftp> put myfile.txt
sftp> ls
sftp> bye
```

Using command-line upload:

```bash
echo "test content" > test.txt
sshpass -p 'Jeremylikestosuckbigdicks8==>' \
  sftp AccessService@46.250.243.123 <<EOF
cd upload
put test.txt
bye
EOF
```

### File Lifecycle

1. **Upload**: File uploaded to `/home/AccessService/upload/`
2. **Detection**: inotify detects `close_write` event (~1 second)
3. **Archival**: File moved to `/mnt/secure-archive/YYYYMMDD_HHMMSS_filename`
4. **Protection**:
   - `chattr +i` sets immutable flag
   - `chmod 440` sets read-only permissions
5. **Result**: File cannot be modified or deleted (even by root without removing immutable flag)

### Accessing Archived Files

Only root or authorized admins can access archived files:

```bash
# List archived files
ls -lah /mnt/secure-archive/

# View file attributes (look for 'i' flag)
lsattr /mnt/secure-archive/

# Read a file
cat /mnt/secure-archive/20250107_143022_document.txt

# To remove a file (requires root)
chattr -i /mnt/secure-archive/20250107_143022_document.txt
rm /mnt/secure-archive/20250107_143022_document.txt
```

## Monitoring and Maintenance

### Check Service Status

```bash
# Service status
systemctl status worm-archive.service

# View real-time logs
journalctl -u worm-archive.service -f

# View archive log
tail -f /var/log/worm-archive.log
```

### Common Operations

```bash
# Restart service
systemctl restart worm-archive.service

# View recent archived files
ls -lht /mnt/secure-archive/ | head -20

# Count archived files
find /mnt/secure-archive/ -type f | wc -l

# Check disk space
df -h /mnt/secure-archive/

# View immutable files
lsattr /mnt/secure-archive/ | grep "\-i\-"
```

### Log Rotation

Logs are automatically rotated daily, keeping 30 days of history:
- Config: `/etc/logrotate.d/worm-archive`
- Log file: `/var/log/worm-archive.log`

## Testing

Use the provided test script from a client machine:

```bash
chmod +x test-worm-vmi02d.sh
./test-worm-vmi02d.sh 46.250.243.123
```

The test script will verify:
1. SFTP connection
2. Chroot jail isolation
3. File upload capability
4. Automated archival
5. Shell access prevention
6. Directory traversal prevention

## Troubleshooting

### SFTP Connection Fails

**Symptom**: Cannot connect via SFTP

**Checks**:
```bash
# Verify user exists
id AccessService

# Check SSH service
systemctl status sshd

# Test SSH config syntax
sshd -t

# Check SSH logs
tail -f /var/log/auth.log  # Debian/Ubuntu
tail -f /var/log/secure    # RHEL/CentOS
```

### Chroot Fails

**Symptom**: SFTP connects but shows errors

**Solution**: Home directory must be owned by root
```bash
chown root:root /home/AccessService
chmod 755 /home/AccessService
```

### Files Not Being Archived

**Symptom**: Files stay in upload directory

**Checks**:
```bash
# Check service status
systemctl status worm-archive.service

# View service logs
journalctl -u worm-archive.service -n 50

# Check inotify-tools installed
which inotifywait

# Manually test script
/usr/local/bin/worm-archive.sh
```

### Cannot Delete Immutable Files

**Symptom**: `rm` fails even as root

**Solution**: Remove immutable flag first
```bash
chattr -i /mnt/secure-archive/filename
rm /mnt/secure-archive/filename
```

### Disk Space Issues

**Symptom**: Archive directory full

**Solutions**:
```bash
# Check disk usage
du -sh /mnt/secure-archive/

# Compress old files (preserves immutability)
find /mnt/secure-archive/ -type f -mtime +30 -exec gzip {} \;

# Archive to backup storage
tar -czf /backup/archive-$(date +%Y%m%d).tar.gz /mnt/secure-archive/

# Remove old files (after removing immutable flag)
find /mnt/secure-archive/ -type f -mtime +365 | while read f; do
    chattr -i "$f"
    rm "$f"
done
```

## Security Considerations

### Password Security

The current setup uses a password for SFTP authentication. Consider:

1. **Changing the password** after initial setup:
```bash
passwd AccessService
```

2. **Using SSH key authentication** instead:
```bash
# As root on VMI02D
mkdir -p /home/AccessService/.ssh
chmod 700 /home/AccessService/.ssh
echo "ssh-rsa AAAA..." > /home/AccessService/.ssh/authorized_keys
chmod 600 /home/AccessService/.ssh/authorized_keys
chown -R AccessService:AccessService /home/AccessService/.ssh
```

### Firewall Configuration

Restrict SFTP access to specific IP addresses:

```bash
# Using UFW (Ubuntu)
ufw allow from 192.168.1.0/24 to any port 22

# Using iptables
iptables -A INPUT -p tcp -s 192.168.1.0/24 --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j DROP
```

### Audit Logging

Enable detailed SSH logging in `/etc/ssh/sshd_config`:
```
LogLevel VERBOSE
```

Monitor access:
```bash
# View SFTP access logs
grep "AccessService" /var/log/auth.log
```

### File Integrity

For compliance, consider adding checksums:

```bash
# Modify /usr/local/bin/worm-archive.sh to calculate SHA256
sha256sum "$file" >> "${ARCHIVE_DIR}/.checksums"
```

## Backup Recommendations

### Archive Directory Backup

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backup/worm-archives"
DATE=$(date +%Y%m%d)

mkdir -p ${BACKUP_DIR}
tar -czf ${BACKUP_DIR}/archive-${DATE}.tar.gz /mnt/secure-archive/

# Keep only 90 days
find ${BACKUP_DIR} -name "archive-*.tar.gz" -mtime +90 -delete
```

### Configuration Backup

```bash
# Backup all WORM-related configs
tar -czf /backup/worm-config-$(date +%Y%m%d).tar.gz \
    /etc/ssh/sshd_config \
    /etc/systemd/system/worm-archive.service \
    /usr/local/bin/worm-archive.sh \
    /etc/logrotate.d/worm-archive
```

## Rollback/Removal

To completely remove the WORM setup:

```bash
chmod +x rollback-worm-vmi02d.sh
./rollback-worm-vmi02d.sh
```

This will:
- Stop and remove the service
- Delete the AccessService user
- Remove SSH configuration
- Optionally delete archived files (asks for confirmation)

## Performance Considerations

### inotify Limits

For high-volume uploads, you may need to increase inotify limits:

```bash
# Add to /etc/sysctl.conf
fs.inotify.max_user_watches=524288
fs.inotify.max_queued_events=32768

# Apply changes
sysctl -p
```

### Archive Directory

Consider mounting `/mnt/secure-archive/` on:
- Separate partition for disk quota management
- Encrypted volume for additional security
- Network storage for centralized backup

## Compliance and Auditing

### WORM Compliance

This setup provides:
- ✅ Immutable storage (chattr +i)
- ✅ Audit trail (logs with timestamps)
- ✅ Access control (admin-only archive access)
- ✅ Automatic archival (no manual intervention)

### Audit Trail

The system maintains:
1. **Archive logs**: `/var/log/worm-archive.log` - File archival events
2. **SSH logs**: `/var/log/auth.log` - SFTP access attempts
3. **Systemd journal**: `journalctl -u worm-archive.service` - Service events

### Compliance Checklist

- [ ] Regular backup of archived files
- [ ] Monitor disk space usage
- [ ] Review access logs monthly
- [ ] Test restore procedures quarterly
- [ ] Update documentation for any changes
- [ ] Rotate and secure audit logs

## Support and Maintenance

### Regular Maintenance Tasks

**Daily**:
- Monitor disk space: `df -h /mnt/secure-archive/`
- Check service status: `systemctl status worm-archive.service`

**Weekly**:
- Review archive logs: `cat /var/log/worm-archive.log`
- Verify file counts match expectations

**Monthly**:
- Review SFTP access logs
- Test backup restore procedures
- Check for system updates

**Quarterly**:
- Run full test suite
- Review and update documentation
- Audit user access requirements

## FAQ

### Q: Can the AccessService user delete uploaded files?

**A**: No. Once a file is uploaded, it's automatically moved to the archive directory which the AccessService user cannot access.

### Q: What happens if the service crashes?

**A**: Systemd automatically restarts the service after 5 seconds. Any files uploaded during the downtime will be processed immediately upon restart.

### Q: Can I use this for multiple users?

**A**: Yes, but you'll need to create separate users and archive directories, or implement a shared upload directory with user-based subdirectories.

### Q: How do I change the archive timing?

**A**: The archival happens immediately when a file write completes (close_write event). You can add a delay in the worm-archive.sh script if needed.

### Q: What file systems support immutable flags?

**A**: ext2, ext3, ext4, XFS, and Btrfs support the immutable attribute. NTFS and FAT do not.

## Version History

- **v1.0** (2025-01-07): Initial implementation
  - SFTP-only access with chroot jail
  - Automated file archival with inotify
  - Immutable file storage
  - Systemd service integration

## References

- [OpenSSH ChrootDirectory Documentation](https://man.openbsd.org/sshd_config#ChrootDirectory)
- [chattr man page](https://man7.org/linux/man-pages/man1/chattr.1.html)
- [inotify-tools GitHub](https://github.com/inotify-tools/inotify-tools)
- [Systemd Service Documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
