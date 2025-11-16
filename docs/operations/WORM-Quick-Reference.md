# WORM Area Quick Reference - VMI02D

## Connection Details

| Property              | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| **Server**            | 46.250.243.123 (VMI02D)                                                   |
| **Username**          | AccessService                                                             |
| **Password**          | Contabo secret `worm-access-password` (export via `npm run secrets:pull`) |
| **Protocol**          | SFTP only (port 22)                                                       |
| **Upload Directory**  | `upload/` (auto-chrooted)                                                 |
| **Archive Directory** | `/mnt/secure-archive/` (admin only)                                       |

## Quick Commands

### Connect via SFTP

```bash
sftp AccessService@46.250.243.123
# Password: $WORM_ACCESS_PASSWORD (from Contabo Secrets)
```

### Upload a File

```bash
sftp AccessService@46.250.243.123 <<EOF
cd upload
put myfile.txt
bye
EOF
```

### Upload with sshpass (automated)

```bash
SSHPASS="$WORM_ACCESS_PASSWORD" \
  sshpass -e sftp AccessService@46.250.243.123 <<EOF
cd upload
put myfile.txt
bye
EOF
```

## Admin Commands (SSH as root)

### Check Service Status

```bash
systemctl status worm-archive.service
```

### View Archive Logs

```bash
tail -f /var/log/worm-archive.log
```

### List Archived Files

```bash
ls -lht /mnt/secure-archive/ | head -20
```

### View Immutable Flags

```bash
lsattr /mnt/secure-archive/ | head
```

### Delete an Immutable File

```bash
chattr -i /mnt/secure-archive/filename
rm /mnt/secure-archive/filename
```

### Check Disk Space

```bash
df -h /mnt/secure-archive/
du -sh /mnt/secure-archive/
```

### Restart Archive Service

```bash
systemctl restart worm-archive.service
```

### View Service Logs (real-time)

```bash
journalctl -u worm-archive.service -f
```

## File Lifecycle

1. **Upload** → `/home/AccessService/upload/myfile.txt`
2. **Archive** → `/mnt/secure-archive/20250107_143022_myfile.txt` (auto, ~1 second)
3. **Protect** → Immutable flag set, read-only permissions
4. **Result** → Cannot be modified or deleted without admin intervention

## Troubleshooting

### Connection Refused

```bash
# Check SSH service
ssh root@46.250.243.123 'systemctl status sshd'
```

### Files Not Archiving

```bash
# Check archive service
ssh root@46.250.243.123 'systemctl status worm-archive.service'
ssh root@46.250.243.123 'journalctl -u worm-archive.service -n 50'
```

### Can't Delete File

```bash
# Remove immutable flag first
ssh root@46.250.243.123 'chattr -i /mnt/secure-archive/filename'
ssh root@46.250.243.123 'rm /mnt/secure-archive/filename'
```

## Installation Scripts

| Script                    | Purpose            | Run As         |
| ------------------------- | ------------------ | -------------- |
| `setup-worm-vmi02d.sh`    | Initial setup      | root on VMI02D |
| `test-worm-vmi02d.sh`     | Test functionality | user on client |
| `rollback-worm-vmi02d.sh` | Remove setup       | root on VMI02D |

## Security Notes

- ✅ SFTP-only (no shell access)
- ✅ Chrooted to home directory
- ✅ Cannot access system files
- ✅ Files become immutable after archival
- ✅ Archive directory admin-only
- ⚠️ Change password after initial setup
- ⚠️ Consider SSH key authentication
- ⚠️ Implement firewall rules for IP restrictions

## Monitoring Checklist

- [ ] Daily: Check disk space
- [ ] Daily: Verify service is running
- [ ] Weekly: Review archive logs
- [ ] Monthly: Review SFTP access logs
- [ ] Monthly: Test backup restore
- [ ] Quarterly: Run full test suite

## Support

For detailed documentation, see: `docs/WORM-Setup-VMI02D.md`
