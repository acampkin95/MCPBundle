# VMI02D Media Stack Deployment V2

Enhanced Nextcloud and Plex deployment with automatic H265 video transcoding pipeline for VMI02D.

## Overview

This is an enhanced version of the media deployment that provides:

- **Nextcloud**: Cloud storage with 15-second video detection
- **Plex Media Server**: Streaming with automatic port detection
- **FFMPEG Pipeline**: H265/HEVC transcoding for optimal quality/size
- **CloudFlare Integration**: Public access via data.acdev.host and plex.acdev.host
- **SOC Monitoring**: Real-time monitoring and alerting

## Key Features

### Fast Detection

- 15-second file detection interval
- Automatic video format recognition
- Queue-based processing for multiple files

### H265 Transcoding

- Automatic conversion to H265/HEVC
- Optimal quality settings (CRF 28)
- Hardware acceleration support when available
- Original files cleaned up after processing

### Public Access

- data.acdev.host → Nextcloud
- plex.acdev.host → Plex Media Server
- CloudFlare DDoS protection
- SSL/TLS encryption

## Quick Deployment

### Prerequisites

```bash
# Ensure you have CloudFlare API credentials
export CF_EMAIL="your-email@example.com"
export CF_API_KEY="your-cloudflare-api-key"
export CF_ZONE_ID="your-zone-id"
```

### One-Command Deployment

```bash
# From your local machine
cd deployment/media/

# Make scripts executable
chmod +x deploy-media-stack.sh configure-cloudflare-dns.sh test-media-stack.sh

# Copy to VMI02D (when SSH access is available)
scp -i ssh-keys/vmi02-acdev-vmi02-id_ed25519 *.sh root@46.250.241.70:/tmp/

# SSH to VMI02D
ssh -i ssh-keys/vmi02-acdev-vmi02-id_ed25519 root@46.250.241.70

# Run deployment
cd /tmp
./deploy-media-stack.sh
```

## File Descriptions

### deploy-media-stack.sh

Main deployment script that:

- Installs Docker and dependencies
- Deploys Nextcloud with PostgreSQL and Redis
- Installs Plex Media Server
- Configures FFMPEG with H265 support
- Sets up inotify-based video watcher
- Configures Nginx reverse proxy
- Enables SOC monitoring

### configure-cloudflare-dns.sh

CloudFlare configuration that:

- Creates DNS A records for data.acdev.host and plex.acdev.host
- Configures SSL/TLS settings (Full strict)
- Enables HSTS and Always Use HTTPS
- Sets up rate limiting and DDoS protection
- Creates firewall rules for security

### test-media-stack.sh

Comprehensive testing script that:

- Validates all services are running
- Tests video processing pipeline
- Checks DNS resolution
- Verifies external access
- Monitors system performance
- Provides detailed troubleshooting

## Video Processing Workflow

```
1. Upload video to Nextcloud
   └── /Videos/DropFolder/

2. inotify detects file (within 15 seconds)
   └── Video watcher service triggers

3. FFMPEG transcodes to H265
   └── Processing in /mnt/transcode/processing/

4. Move to Plex library
   └── /mnt/plex/movies/

5. Plex auto-refreshes library
   └── Video available for streaming
```

## Service Management

### Check Status

```bash
# Nextcloud
docker ps | grep nextcloud
docker logs nextcloud

# Plex
systemctl status plexmediaserver

# Video Watcher
systemctl status video-watcher
journalctl -u video-watcher -f

# Monitoring
systemctl status media-monitor
```

### Restart Services

```bash
# Nextcloud
docker restart nextcloud

# Plex
systemctl restart plexmediaserver

# Video Watcher
systemctl restart video-watcher
```

## Monitoring & Logs

### Log Files

- `/var/log/transcode.log` - Transcoding operations
- `/var/log/video-watcher.log` - File detection events
- `/var/log/media-stack-test.log` - Test results
- `/var/log/nginx/access.log` - Web access logs

### SOC Integration

- Metrics sent to VMI03 (10.0.0.3:9090)
- Syslog forwarding to VMI03:514
- 60-second update interval
- Automatic alerting on failures

## Troubleshooting

### SSH Access Issues

If you cannot SSH to VMI02D:

1. **Check IP Whitelist**

   ```bash
   # Your IP may be blocked by Fail2Ban
   # Contact admin to whitelist your IP
   ```

2. **Use Alternative Access**

   ```bash
   # Try via VMI01 as jump host
   ssh -i ssh-keys/vmi01-acdev-vmi01-id_ed25519 root@46.250.243.123
   ssh root@10.0.0.2  # Internal network
   ```

3. **Check Service Status**
   ```bash
   # Verify servers are online
   ping 46.250.241.70
   nc -zv 46.250.241.70 22
   ```

### Video Not Processing

```bash
# Check watch directory
ls -la /mnt/nextcloud/data/admin/files/Videos/DropFolder/

# Check watcher service
systemctl status video-watcher
journalctl -u video-watcher -n 50

# Test manual transcode
/usr/local/bin/transcode-video.sh /path/to/video.mp4

# Check transcode log
tail -f /var/log/transcode.log
```

### Nextcloud Issues

```bash
# Check containers
docker ps -a
docker logs nextcloud
docker logs nextcloud_db

# Force file scan
docker exec nextcloud php occ files:scan --all

# Reset admin password
docker exec nextcloud php occ user:resetpassword admin
```

### Plex Issues

```bash
# Check service
systemctl status plexmediaserver

# Find Plex port
ss -tlnp | grep Plex

# Check library permissions
ls -la /mnt/plex/movies/
chown -R plex:plex /mnt/plex/movies/

# Force library scan
curl -X POST "http://localhost:32400/library/sections/all/refresh"
```

## Security Considerations

### Default Credentials (CHANGE THESE!)

- **Nextcloud Admin**: admin / AdminPass2025!
- **PostgreSQL**: nextcloud / NextcloudPass2025!
- **Redis**: NextcloudRedis2025!

### Firewall Rules

```bash
# Current rules
ufw status verbose

# Required ports
80/tcp   - HTTP (redirects to HTTPS)
443/tcp  - HTTPS
8080/tcp - Nextcloud internal
32400/tcp - Plex (auto-detected)
```

### CloudFlare Security

- DDoS protection enabled
- Rate limiting on login pages
- Challenge suspicious activity
- SSL/TLS Full (strict) mode
- HSTS with 1-year max-age

## Performance Tuning

### Transcoding Settings

Edit `/usr/local/bin/transcode-video.sh`:

```bash
# Quality (lower = better quality, larger file)
-crf 28  # Range: 0-51

# Preset (faster = lower quality)
-preset medium  # Options: ultrafast to veryslow

# Hardware acceleration (if available)
-c:v hevc_nvenc  # NVIDIA GPU
-c:v hevc_qsv    # Intel QuickSync
```

### Nextcloud Optimization

```bash
# Increase PHP memory
docker exec nextcloud sed -i 's/memory_limit = .*/memory_limit = 512M/' /usr/local/etc/php/php.ini

# Enable caching
docker exec nextcloud php occ config:system:set memcache.local --value='\OC\Memcache\Redis'
```

## Backup & Recovery

### Backup Script

```bash
#!/bin/bash
# Create daily backup
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/media-$BACKUP_DATE"

mkdir -p $BACKUP_DIR

# Backup Nextcloud
docker exec nextcloud_db pg_dump -U nextcloud nextcloud > $BACKUP_DIR/nextcloud.sql
tar -czf $BACKUP_DIR/nextcloud-data.tar.gz /mnt/nextcloud/data

# Backup Plex
systemctl stop plexmediaserver
tar -czf $BACKUP_DIR/plex-config.tar.gz "/var/lib/plexmediaserver"
systemctl start plexmediaserver

# Backup configurations
tar -czf $BACKUP_DIR/configs.tar.gz \
    /usr/local/bin/*.sh \
    /etc/nginx/sites-available/ \
    /etc/systemd/system/video-watcher.service

echo "Backup completed: $BACKUP_DIR"
```

## Advanced Configuration

### Multiple Watch Folders

```bash
# Edit /usr/local/bin/video-watcher.sh
WATCH_DIRS=(
    "/mnt/nextcloud/data/admin/files/Videos/DropFolder"
    "/mnt/nextcloud/data/admin/files/Movies"
    "/mnt/nextcloud/data/admin/files/TVShows"
)
```

### Custom Transcoding Profiles

```bash
# Add to transcode-video.sh
case "$VIDEO_TYPE" in
    movie)
        CRF=22
        PRESET=slow
        ;;
    tvshow)
        CRF=24
        PRESET=medium
        ;;
    *)
        CRF=28
        PRESET=fast
        ;;
esac
```

## Support & Resources

- **Documentation**: This file and README.md
- **Logs**: Check `/var/log/` for detailed logs
- **Testing**: Run `./test-media-stack.sh` for diagnostics
- **Monitoring**: Check SOC dashboard on VMI03

## Version History

- **v2.0.0** (2025-11-08): Complete rewrite with enhanced features
  - 15-second detection interval
  - H265/HEVC transcoding
  - CloudFlare integration
  - SOC monitoring
  - Comprehensive testing

- **v1.0.0**: Original deployment scripts

---

**Created**: November 8, 2025
**Author**: MCP Bundle Team
**License**: Part of MCP Bundle v0.2.0
