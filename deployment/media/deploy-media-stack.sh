#!/bin/bash

# VMI02D Media Stack Deployment Script
# Deploys Nextcloud and Plex with automatic video transcoding pipeline
# Version: 1.0.0
# Date: November 8, 2025

set -euo pipefail

# Configuration
NEXTCLOUD_DOMAIN="data.acdev.host"
PLEX_DOMAIN="plex.acdev.host"
NEXTCLOUD_DATA="/mnt/nextcloud"
PLEX_DATA="/mnt/plex"
TRANSCODE_DIR="/mnt/transcode"
WATCH_DIR="$NEXTCLOUD_DATA/data/admin/files/Videos/DropFolder"
PLEX_MOVIES="/mnt/plex/movies"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
   exit 1
fi

log "Starting VMI02D Media Stack Deployment"

# Function to install Docker
install_docker() {
    log "Installing Docker..."
    if ! command -v docker &> /dev/null; then
        apt-get update
        apt-get install -y ca-certificates curl gnupg lsb-release

        # Add Docker's official GPG key
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

        # Set up the repository
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

        # Install Docker Engine
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

        systemctl enable docker
        systemctl start docker
        log "Docker installed successfully"
    else
        log "Docker already installed"
    fi
}

# Function to create directory structure
create_directories() {
    log "Creating directory structure..."
    mkdir -p $NEXTCLOUD_DATA/{data,config,apps}
    mkdir -p $PLEX_DATA/{config,transcode}
    mkdir -p $PLEX_MOVIES
    mkdir -p $TRANSCODE_DIR/{queue,processing,completed}
    mkdir -p $WATCH_DIR

    # Set permissions
    chmod -R 755 /mnt/
    log "Directory structure created"
}

# Function to install Nextcloud
install_nextcloud() {
    log "Installing Nextcloud..."

    # Create docker-compose file for Nextcloud
    cat > /opt/nextcloud-docker-compose.yml <<EOF
version: '3.8'

services:
  nextcloud_db:
    image: postgres:16-alpine
    container_name: nextcloud_db
    restart: always
    volumes:
      - $NEXTCLOUD_DATA/db:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=nextcloud
      - POSTGRES_USER=nextcloud
      - POSTGRES_PASSWORD=NextcloudPass2025!
    networks:
      - nextcloud_network

  nextcloud_redis:
    image: redis:alpine
    container_name: nextcloud_redis
    restart: always
    command: redis-server --requirepass NextcloudRedis2025!
    networks:
      - nextcloud_network

  nextcloud:
    image: nextcloud:latest
    container_name: nextcloud
    restart: always
    ports:
      - "8080:80"
    links:
      - nextcloud_db
      - nextcloud_redis
    volumes:
      - $NEXTCLOUD_DATA/data:/var/www/html/data
      - $NEXTCLOUD_DATA/config:/var/www/html/config
      - $NEXTCLOUD_DATA/apps:/var/www/html/custom_apps
    environment:
      - POSTGRES_HOST=nextcloud_db
      - POSTGRES_DB=nextcloud
      - POSTGRES_USER=nextcloud
      - POSTGRES_PASSWORD=NextcloudPass2025!
      - REDIS_HOST=nextcloud_redis
      - REDIS_HOST_PASSWORD=NextcloudRedis2025!
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=AdminPass2025!
      - NEXTCLOUD_TRUSTED_DOMAINS=$NEXTCLOUD_DOMAIN
      - OVERWRITEPROTOCOL=https
      - OVERWRITEHOST=$NEXTCLOUD_DOMAIN
    networks:
      - nextcloud_network
    depends_on:
      - nextcloud_db
      - nextcloud_redis

networks:
  nextcloud_network:
    driver: bridge
EOF

    # Start Nextcloud
    cd /opt
    docker compose -f nextcloud-docker-compose.yml up -d

    log "Waiting for Nextcloud to initialize..."
    sleep 30

    # Configure Nextcloud for faster file detection (15 second scan)
    docker exec nextcloud sh -c "
        php occ config:system:set filesystem_check_changes --value=1 --type=integer
        php occ config:system:set filelocking.enabled --value='false'
        php occ background:cron
    "

    # Set up cron job for 15-second file scanning
    cat > /etc/systemd/system/nextcloud-scan.service <<EOF
[Unit]
Description=Nextcloud File Scan
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec nextcloud php occ files:scan --all
EOF

    cat > /etc/systemd/system/nextcloud-scan.timer <<EOF
[Unit]
Description=Run Nextcloud File Scan every 15 seconds
Requires=nextcloud-scan.service

[Timer]
OnCalendar=*:*:0,15,30,45
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable nextcloud-scan.timer
    systemctl start nextcloud-scan.timer

    log "Nextcloud installed and configured"
}

# Function to install Plex
install_plex() {
    log "Installing Plex Media Server..."

    # Add Plex repository
    curl https://downloads.plex.tv/plex-keys/PlexSign.key | apt-key add -
    echo "deb https://downloads.plex.tv/repo/deb public main" | tee /etc/apt/sources.list.d/plexmediaserver.list

    # Install Plex
    apt-get update
    apt-get install -y plexmediaserver

    # Configure Plex
    systemctl enable plexmediaserver
    systemctl start plexmediaserver

    # Get Plex public port
    sleep 10
    PLEX_PORT=$(ss -tlnp | grep Plex | grep -oP ':\K[0-9]{5}' | head -1)
    if [ -z "$PLEX_PORT" ]; then
        PLEX_PORT="32400"
    fi

    log "Plex installed on port $PLEX_PORT"

    # Configure Plex directories
    usermod -a -G plex root
    chown -R plex:plex $PLEX_DATA
    chown -R plex:plex $PLEX_MOVIES
}

# Function to install FFMPEG
install_ffmpeg() {
    log "Installing FFMPEG with H265 support..."

    # Install FFMPEG with all codecs
    apt-get update
    apt-get install -y ffmpeg libx264-dev libx265-dev vainfo intel-media-va-driver-non-free

    # Verify H265 support
    if ffmpeg -encoders 2>/dev/null | grep -q "libx265"; then
        log "FFMPEG installed with H265 support"
    else
        warning "H265 encoder not found, using software encoding"
    fi
}

# Function to create video processing pipeline
create_video_pipeline() {
    log "Creating video processing pipeline..."

    # Install inotify-tools for file monitoring
    apt-get install -y inotify-tools

    # Create video transcoding script
    cat > /usr/local/bin/transcode-video.sh <<'EOF'
#!/bin/bash

INPUT_FILE="$1"
FILENAME=$(basename "$INPUT_FILE")
OUTPUT_FILE="/mnt/plex/movies/${FILENAME%.*}.mp4"
TEMP_FILE="/mnt/transcode/processing/${FILENAME%.*}_temp.mp4"

echo "[$(date)] Starting transcode: $INPUT_FILE" >> /var/log/transcode.log

# Create processing directory if not exists
mkdir -p /mnt/transcode/processing

# Transcode to H265 MP4
ffmpeg -i "$INPUT_FILE" \
    -c:v libx265 \
    -preset medium \
    -crf 28 \
    -c:a aac \
    -b:a 128k \
    -movflags +faststart \
    -y "$TEMP_FILE" 2>> /var/log/transcode.log

if [ $? -eq 0 ]; then
    # Move to Plex movies folder
    mv "$TEMP_FILE" "$OUTPUT_FILE"

    # Set permissions for Plex
    chown plex:plex "$OUTPUT_FILE"
    chmod 644 "$OUTPUT_FILE"

    # Remove original file from drop folder
    rm -f "$INPUT_FILE"

    echo "[$(date)] Transcode complete: $OUTPUT_FILE" >> /var/log/transcode.log

    # Trigger Plex library scan
    curl -X POST "http://localhost:32400/library/sections/1/refresh?X-Plex-Token=$(cat /var/lib/plexmediaserver/Library/Application\ Support/Plex\ Media\ Server/Preferences.xml | grep -oP 'PlexOnlineToken="\K[^"]+' || echo '')" 2>/dev/null || true
else
    echo "[$(date)] Transcode failed: $INPUT_FILE" >> /var/log/transcode.log
    mv "$INPUT_FILE" "/mnt/transcode/failed/"
fi
EOF

    chmod +x /usr/local/bin/transcode-video.sh

    # Create inotify watcher service
    cat > /usr/local/bin/video-watcher.sh <<'EOF'
#!/bin/bash

WATCH_DIR="/mnt/nextcloud/data/admin/files/Videos/DropFolder"

echo "[$(date)] Video watcher started" >> /var/log/video-watcher.log

# Create watch directory if it doesn't exist
mkdir -p "$WATCH_DIR"

# Monitor for new video files
inotifywait -m -r -e close_write,moved_to --format '%w%f' "$WATCH_DIR" | while read FILE
do
    # Check if it's a video file
    if [[ "$FILE" =~ \.(mp4|avi|mkv|mov|wmv|flv|webm|m4v|mpg|mpeg)$ ]]; then
        echo "[$(date)] New video detected: $FILE" >> /var/log/video-watcher.log

        # Wait for file to be completely written
        sleep 2

        # Start transcoding in background
        /usr/local/bin/transcode-video.sh "$FILE" &
    fi
done
EOF

    chmod +x /usr/local/bin/video-watcher.sh

    # Create systemd service for video watcher
    cat > /etc/systemd/system/video-watcher.service <<EOF
[Unit]
Description=Video File Watcher and Transcoder
After=network.target docker.service plexmediaserver.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/video-watcher.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable video-watcher.service
    systemctl start video-watcher.service

    log "Video processing pipeline created"
}

# Function to configure Nginx reverse proxy
configure_nginx() {
    log "Configuring Nginx reverse proxy..."

    # Install Nginx if not present
    apt-get install -y nginx certbot python3-certbot-nginx

    # Get Plex port dynamically
    PLEX_PORT=$(ss -tlnp | grep Plex | grep -oP ':\K[0-9]{5}' | head -1)
    if [ -z "$PLEX_PORT" ]; then
        PLEX_PORT="32400"
    fi

    # Nextcloud configuration
    cat > /etc/nginx/sites-available/nextcloud <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $NEXTCLOUD_DOMAIN;

    client_max_body_size 10G;
    client_body_buffer_size 400M;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebDAV support
        proxy_connect_timeout 3600;
        proxy_send_timeout 3600;
        proxy_read_timeout 3600;
        send_timeout 3600;
    }

    location /.well-known/carddav {
        return 301 \$scheme://\$host/remote.php/dav;
    }

    location /.well-known/caldav {
        return 301 \$scheme://\$host/remote.php/dav;
    }
}
EOF

    # Plex configuration
    cat > /etc/nginx/sites-available/plex <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $PLEX_DOMAIN;

    location / {
        proxy_pass http://localhost:$PLEX_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Websocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        # Disable buffering for streaming
        proxy_buffering off;
        proxy_redirect off;

        # Timeouts
        proxy_connect_timeout 3600;
        proxy_send_timeout 3600;
        proxy_read_timeout 3600;
        send_timeout 3600;
    }
}
EOF

    # Enable sites
    ln -sf /etc/nginx/sites-available/nextcloud /etc/nginx/sites-enabled/
    ln -sf /etc/nginx/sites-available/plex /etc/nginx/sites-enabled/

    # Test and reload Nginx
    nginx -t && systemctl reload nginx

    log "Nginx reverse proxy configured"
    log "Plex is accessible on port $PLEX_PORT"
}

# Function to configure SOC monitoring
configure_soc_monitoring() {
    log "Configuring SOC monitoring..."

    # Create monitoring script
    cat > /usr/local/bin/media-monitor.sh <<'EOF'
#!/bin/bash

# Send metrics to SOC
SOC_ENDPOINT="http://10.0.0.3:9090/metrics/media"

while true; do
    # Collect metrics
    NEXTCLOUD_STATUS=$(docker inspect nextcloud --format='{{.State.Status}}' 2>/dev/null || echo "down")
    PLEX_STATUS=$(systemctl is-active plexmediaserver || echo "inactive")
    TRANSCODE_QUEUE=$(ls -1 /mnt/transcode/queue 2>/dev/null | wc -l)
    DISK_USAGE=$(df -h /mnt | tail -1 | awk '{print $5}' | sed 's/%//')

    # Send to SOC
    curl -X POST "$SOC_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{
            \"timestamp\": \"$(date -Iseconds)\",
            \"services\": {
                \"nextcloud\": \"$NEXTCLOUD_STATUS\",
                \"plex\": \"$PLEX_STATUS\"
            },
            \"metrics\": {
                \"transcode_queue\": $TRANSCODE_QUEUE,
                \"disk_usage_percent\": $DISK_USAGE
            }
        }" 2>/dev/null || true

    sleep 60
done
EOF

    chmod +x /usr/local/bin/media-monitor.sh

    # Create monitoring service
    cat > /etc/systemd/system/media-monitor.service <<EOF
[Unit]
Description=Media Services Monitor
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/media-monitor.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable media-monitor.service
    systemctl start media-monitor.service

    # Configure rsyslog to forward logs
    cat >> /etc/rsyslog.conf <<EOF

# Forward media service logs to SOC
*.* @@10.0.0.3:514
EOF

    systemctl restart rsyslog

    log "SOC monitoring configured"
}

# Function to configure firewall
configure_firewall() {
    log "Configuring firewall for public access..."

    # Get Plex port
    PLEX_PORT=$(ss -tlnp | grep Plex | grep -oP ':\K[0-9]{5}' | head -1)
    if [ -z "$PLEX_PORT" ]; then
        PLEX_PORT="32400"
    fi

    # Allow public access to services
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow "$PLEX_PORT"/tcp comment 'Plex'
    ufw allow 8080/tcp comment 'Nextcloud'

    # Allow SOC monitoring from VMI03
    ufw allow from 10.0.0.3 comment 'SOC Monitoring'

    ufw --force enable

    log "Firewall configured for public access"
}

# Function to display summary
display_summary() {
    PLEX_PORT=$(ss -tlnp | grep Plex | grep -oP ':\K[0-9]{5}' | head -1)
    if [ -z "$PLEX_PORT" ]; then
        PLEX_PORT="32400"
    fi

    echo ""
    echo "========================================"
    echo "    MEDIA STACK DEPLOYMENT COMPLETE    "
    echo "========================================"
    echo ""
    echo "Nextcloud:"
    echo "  URL: https://$NEXTCLOUD_DOMAIN"
    echo "  Admin User: admin"
    echo "  Admin Pass: AdminPass2025!"
    echo "  Drop Folder: /Videos/DropFolder"
    echo ""
    echo "Plex Media Server:"
    echo "  URL: https://$PLEX_DOMAIN"
    echo "  Direct Port: $PLEX_PORT"
    echo "  Movies Folder: $PLEX_MOVIES"
    echo ""
    echo "Video Processing:"
    echo "  Watch Folder: $WATCH_DIR"
    echo "  Scan Interval: 15 seconds"
    echo "  Output Format: MP4 H265"
    echo "  Output Location: $PLEX_MOVIES"
    echo ""
    echo "Monitoring:"
    echo "  SOC Endpoint: VMI03 (10.0.0.3)"
    echo "  Logs: /var/log/transcode.log"
    echo "  Status: systemctl status video-watcher"
    echo ""
    echo "Next Steps:"
    echo "1. Configure DNS for $NEXTCLOUD_DOMAIN and $PLEX_DOMAIN"
    echo "2. Obtain SSL certificates: certbot --nginx"
    echo "3. Complete Plex setup at http://$(hostname -I | awk '{print $1}'):$PLEX_PORT/web"
    echo "4. Test video upload to Nextcloud drop folder"
    echo ""
}

# Main execution
main() {
    log "Starting deployment..."

    # Update system
    apt-get update
    apt-get upgrade -y

    # Install dependencies
    apt-get install -y curl wget gnupg lsb-release software-properties-common

    # Execute installation steps
    install_docker
    create_directories
    install_nextcloud
    install_plex
    install_ffmpeg
    create_video_pipeline
    configure_nginx
    configure_soc_monitoring
    configure_firewall

    # Display summary
    display_summary

    log "Deployment completed successfully!"
}

# Run main function
main "$@"