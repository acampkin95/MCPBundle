# Media Server Deployment Scripts for VMI02D

Production-ready deployment scripts for NextCloud, Plex Media Server, and automated video transcoding on VMI02D (46.250.241.70).

## Overview

This directory contains three deployment scripts that work together to create a complete media pipeline:

1. **NextCloud** - Secure file storage and upload interface
2. **Plex Media Server** - Media streaming and library management
3. **Automated Transcoding** - Background video processing pipeline

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VMI02D                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  NextCloud   │───▶│  Transcoding │───▶│     Plex     │ │
│  │   (Upload)   │    │   (Process)  │    │  (Streaming) │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                    │                    │        │
│         │                    │                    │        │
│  /nextcloud/plex-ingest      │            /opt/plex/movies │
│                               │                             │
│                        Monitoring &                         │
│                     PostgreSQL Logging                      │
│                               │                             │
└───────────────────────────────┼─────────────────────────────┘
                                │
                                ▼
                         VMI01 (Database)
                     46.250.243.123:5432
```

## Deployment Order

Deploy in the following order:

### 1. Deploy NextCloud

```bash
# Transfer script to VMI02D
scp deployment/media/deploy-nextcloud.sh root@46.250.241.70:/tmp/

# SSH to VMI02D
ssh root@46.250.241.70

# Run deployment
/tmp/deploy-nextcloud.sh
```

**What it does:**
- Installs Nginx + PHP 8.3-FPM with all required extensions
- Downloads NextCloud v28.0.2
- Configures PostgreSQL connection to VMI01
- Sets up SSL with self-signed certificate (or Let's Encrypt)
- Configures Keycloak SSO (OIDC) integration
- Creates `/nextcloud/plex-ingest` folder with 777 permissions
- Sets up automatic background jobs via cron
- Enables essential apps (files_external, user_oidc, etc.)

**Duration:** ~15-20 minutes

**Verification:**
```bash
# Check service status
systemctl status nginx php8.3-fpm

# Access web interface
curl -k https://localhost/

# Check directories
ls -la /nextcloud/plex-ingest
```

### 2. Deploy Plex Media Server

```bash
# Transfer script
scp deployment/media/deploy-plex.sh root@46.250.241.70:/tmp/

# SSH to VMI02D
ssh root@46.250.241.70

# Run deployment
/tmp/deploy-plex.sh
```

**What it does:**
- Adds official Plex repository
- Installs Plex Media Server
- Creates `/opt/plex/movies` library directory
- Configures hardware transcoding (Intel Quick Sync, NVIDIA, AMD)
- Sets up network access controls
- Creates systemd service with resource limits
- Configures health monitoring
- Sets up firewall rules

**Duration:** ~10-15 minutes

**Verification:**
```bash
# Check service status
systemctl status plexmediaserver

# Access web interface
curl http://localhost:32400/web/index.html

# Check hardware acceleration
sudo -u plex vainfo

# Test video device access
ls -la /dev/dri/
```

### 3. Deploy Automated Transcoding

```bash
# Transfer script
scp deployment/media/deploy-transcoding.sh root@46.250.241.70:/tmp/

# SSH to VMI02D
ssh root@46.250.241.70

# Run deployment
/tmp/deploy-transcoding.sh
```

**What it does:**
- Installs FFmpeg with H.265 (HEVC) support
- Creates Python daemon with inotify file watching
- Monitors `/nextcloud/plex-ingest` every 30 seconds
- Transcodes videos to MP4 H.265 1080p (CRF 23)
- Moves completed files to `/opt/plex/movies`
- Updates Plex library automatically via API
- Implements resource limits (max 2 parallel, 80% CPU, 8GB RAM)
- Logs progress to PostgreSQL (VMI01) and Redis
- Creates systemd service with auto-restart

**Duration:** ~10-15 minutes

**Verification:**
```bash
# Check service status
systemctl status transcoding-daemon

# View logs
/usr/local/bin/transcoding-logs.sh -f

# Check status
/usr/local/bin/transcoding-status.sh
```

## Complete Workflow

### User Perspective

1. User uploads video to NextCloud: `https://46.250.241.70/nextcloud/plex-ingest/`
2. File appears in Plex library automatically (transcoded to H.265 1080p)
3. User streams video via Plex: `http://46.250.241.70:32400/web`

### System Perspective

```
1. User uploads "movie.avi" to /nextcloud/plex-ingest/
   ↓
2. Transcoding daemon detects file (within 30s)
   ↓
3. Creates transcoding job in PostgreSQL
   ↓
4. Transcodes to H.265 1080p with FFmpeg
   - Video: libx265, CRF 23, 1080p
   - Audio: AAC, 192kbps
   - Container: MP4 with faststart
   ↓
5. Saves to /opt/plex/transcode/work/[job_id].mp4
   ↓
6. Moves to /opt/plex/movies/movie.mp4
   ↓
7. Deletes original /nextcloud/plex-ingest/movie.avi
   ↓
8. Triggers Plex library scan
   ↓
9. Logs completion to PostgreSQL and Redis
   ↓
10. Video ready for streaming!
```

## Configuration Files

After deployment, configuration and credentials are saved to:

```bash
# NextCloud
/root/nextcloud-db-credentials.txt

# Plex
/root/plex-deployment-info.txt

# Transcoding
/root/transcoding-deployment-info.txt
```

## Management Commands

### NextCloud

```bash
# Service control
systemctl status nginx
systemctl status php8.3-fpm
systemctl restart nextcloud-cron.timer

# NextCloud CLI (occ)
sudo -u www-data php /var/www/nextcloud/occ status
sudo -u www-data php /var/www/nextcloud/occ user:list
sudo -u www-data php /var/www/nextcloud/occ files:scan --all

# Database backup
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --on
pg_dump -h 46.250.243.123 -U nextcloud_user nextcloud > backup.sql
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --off
```

### Plex

```bash
# Service control
systemctl status plexmediaserver
systemctl restart plexmediaserver

# Library management
/usr/local/bin/plex-add-movies-library.sh  # Setup instructions
/usr/local/bin/plex-health-check.sh        # Health check

# Logs
journalctl -u plexmediaserver -f
tail -f /var/log/plex-health-check.log
```

### Transcoding

```bash
# Service control
systemctl status transcoding-daemon
systemctl restart transcoding-daemon

# Monitoring
/usr/local/bin/transcoding-status.sh       # Job status
/usr/local/bin/transcoding-logs.sh         # View logs
/usr/local/bin/transcoding-logs.sh -f      # Follow logs

# Database queries
PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c \
"SELECT * FROM transcoding_jobs ORDER BY created_at DESC LIMIT 10;"
```

## Testing

### Test NextCloud Upload

```bash
# Create test file
echo "Test file" > test.txt

# Upload via command line
curl -u admin:password -T test.txt https://46.250.241.70/remote.php/dav/files/admin/test.txt

# Verify in web interface
curl -k https://46.250.241.70/ | grep nextcloud
```

### Test Transcoding Pipeline

```bash
# Create test video (requires FFmpeg)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=10 \
       /nextcloud/plex-ingest/test-video.mp4

# Monitor transcoding
/usr/local/bin/transcoding-logs.sh -f

# Wait for completion (check every 10s)
watch -n 10 ls -lh /opt/plex/movies/

# Verify in Plex
curl http://localhost:32400/library/sections/all/refresh
```

### Test Complete Workflow

```bash
# 1. Upload video via NextCloud
# (Use web interface: https://46.250.241.70)

# 2. Monitor transcoding
ssh root@46.250.241.70 '/usr/local/bin/transcoding-logs.sh -f'

# 3. Check Plex library
# (Use web interface: http://46.250.241.70:32400/web)

# 4. Verify database logging
ssh root@46.250.241.70 '/usr/local/bin/transcoding-status.sh'
```

## Performance Tuning

### Transcoding Performance

Edit `/etc/systemd/system/transcoding-daemon.service`:

```ini
# Increase parallel jobs (default: 2)
# Edit daemon script: MAX_PARALLEL_JOBS=4

# Adjust CPU limit (default: 80%)
CPUQuota=100%

# Adjust memory limit (default: 8GB)
MemoryLimit=16G
```

Then restart:
```bash
systemctl daemon-reload
systemctl restart transcoding-daemon
```

### FFmpeg Preset

Edit `/usr/local/bin/transcoding-daemon.py`:

```python
# Faster encoding (lower quality)
'-preset', 'faster',

# Slower encoding (better quality)
'-preset', 'slower',

# Better quality (lower CRF = better)
'-crf', '20',

# Lower quality (higher CRF = smaller files)
'-crf', '26',
```

### Plex Transcoding

Configure in Plex Web UI:
- Settings > Transcoder
- Set maximum simultaneous transcodes
- Enable/disable hardware acceleration
- Adjust transcoder quality

## Monitoring

### Health Checks

```bash
# NextCloud
curl -k https://46.250.241.70/status.php

# Plex
curl http://localhost:32400/web/index.html

# Transcoding
systemctl is-active transcoding-daemon
```

### Resource Usage

```bash
# CPU and Memory
htop

# Disk space
df -h /nextcloud /opt/plex

# Disk I/O
iotop

# Network
iftop
```

### Log Locations

```bash
# NextCloud
/var/log/nginx/access.log
/var/log/nginx/error.log
/var/www/nextcloud/data/nextcloud.log

# Plex
journalctl -u plexmediaserver
/var/log/plex-health-check.log

# Transcoding
/var/log/transcoding/daemon.log
/var/log/transcoding/service.log
journalctl -u transcoding-daemon
```

## Troubleshooting

### NextCloud Issues

**Problem:** Cannot connect to database
```bash
# Check PostgreSQL connectivity
psql -h 46.250.243.123 -U nextcloud_user -d nextcloud

# Check pg_hba.conf on VMI01
ssh root@46.250.243.123 'cat /etc/postgresql/16/main/pg_hba.conf'
```

**Problem:** File upload fails
```bash
# Check disk space
df -h /nextcloud

# Check permissions
ls -la /nextcloud/plex-ingest
chown -R www-data:www-data /nextcloud

# Check PHP settings
cat /etc/php/8.3/fpm/php.ini | grep upload_max_filesize
```

### Plex Issues

**Problem:** Plex not starting
```bash
# Check logs
journalctl -u plexmediaserver -n 100

# Check permissions
chown -R plex:plex /var/lib/plexmediaserver
chown -R plex:plex /opt/plex

# Check port binding
ss -tuln | grep 32400
```

**Problem:** Hardware transcoding not working
```bash
# Check device access
ls -la /dev/dri/
sudo -u plex vainfo

# Add plex to video group
usermod -aG render,video plex
systemctl restart plexmediaserver
```

### Transcoding Issues

**Problem:** Jobs not processing
```bash
# Check service status
systemctl status transcoding-daemon
journalctl -u transcoding-daemon -n 50

# Check FFmpeg
which ffmpeg
ffmpeg -version

# Test FFmpeg manually
ffmpeg -i input.mp4 -c:v libx265 -crf 23 output.mp4
```

**Problem:** High CPU usage
```bash
# Check active jobs
ps aux | grep ffmpeg

# Reduce parallel jobs or CPU limit
systemctl edit transcoding-daemon
# Add: CPUQuota=50%

systemctl daemon-reload
systemctl restart transcoding-daemon
```

## Security Considerations

### NextCloud
- SSL/TLS encryption enabled by default (self-signed)
- Database passwords stored securely in `/root/` (mode 600)
- Keycloak SSO integration for centralized authentication
- Regular security updates via `apt upgrade`

### Plex
- Network access restricted to allowed subnets
- Firewall rules configured via UFW
- Service runs as dedicated `plex` user
- Systemd hardening (NoNewPrivileges, PrivateTmp, ProtectSystem)

### Transcoding
- Service runs as root (required for system access)
- Resource limits prevent DoS
- Input validation for file formats
- Database credentials encrypted in transit
- Logs rotated automatically

## Backup & Recovery

### NextCloud Backup

```bash
# Enable maintenance mode
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --on

# Backup files
tar -czf nextcloud-files-$(date +%Y%m%d).tar.gz /var/www/nextcloud /nextcloud

# Backup database
PGPASSWORD="password" pg_dump -h 46.250.243.123 -U nextcloud_user nextcloud \
  > nextcloud-db-$(date +%Y%m%d).sql

# Disable maintenance mode
sudo -u www-data php /var/www/nextcloud/occ maintenance:mode --off
```

### Plex Backup

```bash
# Stop service
systemctl stop plexmediaserver

# Backup configuration
tar -czf plex-config-$(date +%Y%m%d).tar.gz /var/lib/plexmediaserver

# Backup media (optional - usually large)
# tar -czf plex-media-$(date +%Y%m%d).tar.gz /opt/plex/movies

# Restart service
systemctl start plexmediaserver
```

### Transcoding Database Backup

```bash
# Backup job history
PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
pg_dump -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem \
  -t transcoding_jobs > transcoding-jobs-$(date +%Y%m%d).sql
```

## Support

### Documentation
- NextCloud: https://docs.nextcloud.com/
- Plex: https://support.plex.tv/
- FFmpeg: https://ffmpeg.org/documentation.html

### Logs for Support
```bash
# Collect all logs for troubleshooting
/tmp/support-logs-$(date +%Y%m%d).tar.gz

tar -czf /tmp/support-logs-$(date +%Y%m%d).tar.gz \
  /var/log/nginx/ \
  /var/log/transcoding/ \
  /var/log/plex-health-check.log \
  /root/nextcloud-db-credentials.txt \
  /root/plex-deployment-info.txt \
  /root/transcoding-deployment-info.txt
```

## Future Enhancements

- [ ] Prometheus metrics export for monitoring
- [ ] Grafana dashboards for visualization
- [ ] Automated testing with sample videos
- [ ] Email notifications on transcoding completion
- [ ] Multi-quality transcoding (720p, 1080p, 4K)
- [ ] Subtitle extraction and embedding
- [ ] Automated thumbnail generation
- [ ] Integration with Sonarr/Radarr
- [ ] Support for additional video formats
- [ ] GPU acceleration for transcoding

## License

Part of MCP Bundle v0.2.0 - Enterprise MCP Ecosystem
