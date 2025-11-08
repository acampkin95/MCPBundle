# Media Server Quick Start Guide

## Prerequisites

- VMI02D (46.250.241.70) running Ubuntu 24.04
- VMI01 (46.250.243.123) with PostgreSQL 16
- SSH access: `root@46.250.241.70`
- Minimum 100GB free disk space
- Internet connectivity

## One-Command Deployment

```bash
# From your local machine
cd /Users/alex/Projects/MCP\ Bundle

# Deploy all three components in sequence
scp deployment/media/deploy-*.sh root@46.250.241.70:/tmp/ && \
ssh root@46.250.241.70 'bash /tmp/deploy-nextcloud.sh && \
                         bash /tmp/deploy-plex.sh && \
                         bash /tmp/deploy-transcoding.sh'
```

**Duration:** 35-50 minutes (fully automated)

## Step-by-Step Deployment

### Step 1: Deploy NextCloud (15-20 min)

```bash
# Transfer script
scp deployment/media/deploy-nextcloud.sh root@46.250.241.70:/tmp/

# Execute
ssh root@46.250.241.70 'bash /tmp/deploy-nextcloud.sh'

# Verify
ssh root@46.250.241.70 'systemctl status nginx php8.3-fpm'
```

**Result:** NextCloud accessible at `https://46.250.241.70/`

### Step 2: Deploy Plex (10-15 min)

```bash
# Transfer script
scp deployment/media/deploy-plex.sh root@46.250.241.70:/tmp/

# Execute
ssh root@46.250.241.70 'bash /tmp/deploy-plex.sh'

# Verify
ssh root@46.250.241.70 'systemctl status plexmediaserver'
```

**Result:** Plex accessible at `http://46.250.241.70:32400/web`

### Step 3: Deploy Transcoding (10-15 min)

```bash
# Transfer script
scp deployment/media/deploy-transcoding.sh root@46.250.241.70:/tmp/

# Execute
ssh root@46.250.241.70 'bash /tmp/deploy-transcoding.sh'

# Verify
ssh root@46.250.241.70 'systemctl status transcoding-daemon'
```

**Result:** Automatic transcoding active, monitoring `/nextcloud/plex-ingest`

## Post-Deployment Setup

### 1. Configure NextCloud (5 min)

```bash
# Get admin credentials
ssh root@46.250.241.70 'cat /root/nextcloud-db-credentials.txt'

# Access web interface
open https://46.250.241.70/

# Login and complete wizard
```

### 2. Configure Plex (5 min)

```bash
# Get configuration info
ssh root@46.250.241.70 'cat /root/plex-deployment-info.txt'

# Access web interface
open http://46.250.241.70:32400/web

# Sign in with Plex account
# Add Movies library: /opt/plex/movies
# Enable hardware transcoding in Settings
```

### 3. Test Workflow (5 min)

```bash
# Upload test video via NextCloud web interface
# (or use command line)

# Monitor transcoding
ssh root@46.250.241.70 '/usr/local/bin/transcoding-logs.sh -f'

# Wait for completion
# Check Plex library for new video
```

## Quick Commands

### Check Status
```bash
ssh root@46.250.241.70 '
  echo "=== NextCloud ==="
  systemctl status nginx --no-pager
  echo ""
  echo "=== Plex ==="
  systemctl status plexmediaserver --no-pager
  echo ""
  echo "=== Transcoding ==="
  systemctl status transcoding-daemon --no-pager
'
```

### View All Logs
```bash
ssh root@46.250.241.70 '
  echo "=== NextCloud Logs ==="
  tail -n 20 /var/log/nginx/error.log
  echo ""
  echo "=== Plex Logs ==="
  journalctl -u plexmediaserver -n 20 --no-pager
  echo ""
  echo "=== Transcoding Logs ==="
  tail -n 20 /var/log/transcoding/daemon.log
'
```

### Restart All Services
```bash
ssh root@46.250.241.70 '
  systemctl restart nginx php8.3-fpm
  systemctl restart plexmediaserver
  systemctl restart transcoding-daemon
  echo "All services restarted"
'
```

## Access Information

After deployment, retrieve credentials:

```bash
# All configuration files
ssh root@46.250.241.70 'cat /root/*-info.txt /root/*-credentials.txt'
```

### NextCloud
- **URL:** `https://46.250.241.70/`
- **Credentials:** See `/root/nextcloud-db-credentials.txt`
- **Upload Directory:** `/nextcloud/plex-ingest/`

### Plex
- **URL:** `http://46.250.241.70:32400/web`
- **Library:** `/opt/plex/movies/`
- **Sign in:** Use your Plex account

### Transcoding
- **Status:** `/usr/local/bin/transcoding-status.sh`
- **Logs:** `/usr/local/bin/transcoding-logs.sh -f`

## Workflow Test

```bash
# 1. Create test video (requires ffmpeg on local machine)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=10 \
       test-video.mp4

# 2. Upload to NextCloud ingest directory
scp test-video.mp4 root@46.250.241.70:/nextcloud/plex-ingest/

# 3. Monitor transcoding
ssh root@46.250.241.70 '/usr/local/bin/transcoding-logs.sh -f'

# 4. Wait for completion (usually 30s - 5min depending on video length)

# 5. Check output
ssh root@46.250.241.70 'ls -lh /opt/plex/movies/'

# 6. Open Plex and verify video appears
open http://46.250.241.70:32400/web
```

## Troubleshooting

### NextCloud not accessible
```bash
# Check services
ssh root@46.250.241.70 'systemctl status nginx php8.3-fpm'

# Check logs
ssh root@46.250.241.70 'tail -n 50 /var/log/nginx/error.log'

# Restart services
ssh root@46.250.241.70 'systemctl restart nginx php8.3-fpm'
```

### Plex not accessible
```bash
# Check service
ssh root@46.250.241.70 'systemctl status plexmediaserver'

# Check logs
ssh root@46.250.241.70 'journalctl -u plexmediaserver -n 50'

# Restart service
ssh root@46.250.241.70 'systemctl restart plexmediaserver'
```

### Transcoding not working
```bash
# Check service
ssh root@46.250.241.70 'systemctl status transcoding-daemon'

# Check logs
ssh root@46.250.241.70 '/usr/local/bin/transcoding-logs.sh'

# Check queue
ssh root@46.250.241.70 '/usr/local/bin/transcoding-status.sh'

# Restart service
ssh root@46.250.241.70 'systemctl restart transcoding-daemon'
```

### Database connection issues
```bash
# Test PostgreSQL connection from VMI02D
ssh root@46.250.241.70 '
  PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
  psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c "SELECT version();"
'

# Check pg_hba.conf on VMI01
ssh root@46.250.243.123 'cat /etc/postgresql/16/main/pg_hba.conf | grep -v "^#"'
```

## Performance Optimization

### Increase Transcoding Capacity
```bash
# Edit service configuration
ssh root@46.250.241.70 'nano /usr/local/bin/transcoding-daemon.py'

# Change: MAX_PARALLEL = 4  (default: 2)
# Change: CPU_LIMIT_PERCENT = 100  (default: 80)

# Restart service
ssh root@46.250.241.70 'systemctl restart transcoding-daemon'
```

### Adjust Video Quality
```bash
# Edit transcoding daemon
ssh root@46.250.241.70 'nano /usr/local/bin/transcoding-daemon.py'

# Better quality (larger files):
# Change: '-crf', '20'  (default: '23')

# Faster encoding (lower quality):
# Change: '-preset', 'faster'  (default: 'medium')

# Restart service
ssh root@46.250.241.70 'systemctl restart transcoding-daemon'
```

## Monitoring

### Real-time Monitoring
```bash
# Monitor all logs simultaneously
ssh root@46.250.241.70 '
  tail -f /var/log/nginx/access.log \
         /var/log/transcoding/daemon.log \
         /var/log/plex-health-check.log
'
```

### Resource Usage
```bash
# Check disk space
ssh root@46.250.241.70 'df -h | grep -E "Filesystem|/nextcloud|/opt/plex"'

# Check memory
ssh root@46.250.241.70 'free -h'

# Check CPU
ssh root@46.250.241.70 'top -bn1 | head -20'
```

### Transcoding Statistics
```bash
# View job statistics from database
ssh root@46.250.241.70 '
  PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
  psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c "
    SELECT
      status,
      COUNT(*) as jobs,
      AVG(duration_seconds) as avg_duration,
      SUM(duration_seconds) as total_duration
    FROM transcoding_jobs
    GROUP BY status;
  "
'
```

## Backup

### Quick Backup All Configurations
```bash
# Create backup archive
ssh root@46.250.241.70 '
  tar -czf /tmp/media-backup-$(date +%Y%m%d).tar.gz \
    /root/*-credentials.txt \
    /root/*-info.txt \
    /etc/nginx/sites-available/nextcloud \
    /etc/systemd/system/transcoding-daemon.service \
    /usr/local/bin/transcoding-daemon.py \
    /var/www/nextcloud/config/config.php
'

# Download backup
scp root@46.250.241.70:/tmp/media-backup-*.tar.gz ./
```

## Security Notes

- All credentials stored in `/root/` with mode 600
- SSL/TLS enabled for NextCloud (self-signed by default)
- Firewall rules configured for Plex
- Database passwords encrypted in transit
- Service isolation via systemd
- Regular security updates: `ssh root@46.250.241.70 'apt update && apt upgrade -y'`

## Next Steps

1. **Complete NextCloud Setup**
   - Configure Keycloak SSO
   - Set up user quotas
   - Enable two-factor authentication

2. **Optimize Plex**
   - Configure remote access
   - Set up hardware transcoding
   - Add metadata agents

3. **Monitor Performance**
   - Set up Prometheus metrics
   - Create Grafana dashboards
   - Configure alerts

4. **Automate Maintenance**
   - Schedule database backups
   - Configure log rotation
   - Set up health monitoring

## Support

- **Full Documentation:** `deployment/media/README.md`
- **Troubleshooting:** See README.md section
- **Project Guide:** `CLAUDE.md`

## Summary

After successful deployment, you will have:

✅ NextCloud file storage with upload interface
✅ Plex Media Server with hardware transcoding
✅ Automated video processing pipeline
✅ PostgreSQL logging and monitoring
✅ Redis event publishing
✅ Health checks and auto-restart
✅ Complete media workflow automation

**Total Time:** ~40-50 minutes
**Result:** Production-ready media server on VMI02D
