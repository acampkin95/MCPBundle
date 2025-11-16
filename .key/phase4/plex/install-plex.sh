#!/bin/bash
#
# Install Plex Media Server
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Installing Plex Media Server${NC}"
echo "=============================="
echo ""

# Check if already installed
if dpkg -l | grep -q plexmediaserver; then
    echo -e "${YELLOW}Plex Media Server already installed${NC}"
    echo "Current version: $(dpkg -l | grep plexmediaserver | awk '{print $3}')"
    read -p "Reinstall? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# Add Plex repository
echo "Adding Plex repository..."
curl https://downloads.plex.tv/plex-keys/PlexSign.key | gpg --dearmor | tee /usr/share/keyrings/plex.gpg > /dev/null

echo "deb [signed-by=/usr/share/keyrings/plex.gpg] https://downloads.plex.tv/repo/deb public main" | \
    tee /etc/apt/sources.list.d/plexmediaserver.list

# Update and install
echo "Installing Plex Media Server..."
apt-get update
apt-get install -y plexmediaserver

# Create media directories
echo "Creating media directories..."
mkdir -p /mnt/plex/media/{Movies,TV_Shows,Music,Photos,Other}
mkdir -p /var/lib/plexmediaserver

# Set ownership
chown -R plex:plex /mnt/plex
chown -R plex:plex /var/lib/plexmediaserver

# Stop and disable service (will be enabled manually)
echo "Stopping and disabling Plex service..."
systemctl stop plexmediaserver
systemctl disable plexmediaserver

# Create systemd override for optimization
mkdir -p /etc/systemd/system/plexmediaserver.service.d
cat > /etc/systemd/system/plexmediaserver.service.d/override.conf <<'EOF'
[Service]
# Increase file descriptor limit
LimitNOFILE=65536

# Nice level for better performance
Nice=-10

# IO scheduling
IOSchedulingClass=best-effort
IOSchedulingPriority=2

# CPU scheduling
CPUSchedulingPolicy=other

# Memory limits (optional, adjust as needed)
# MemoryLimit=4G

# Restart on failure
Restart=on-failure
RestartSec=10s
EOF

systemctl daemon-reload

echo ""
echo -e "${GREEN}Plex Media Server installed successfully!${NC}"
echo ""
echo "Installation details:"
echo "  Version: $(dpkg -l | grep plexmediaserver | awk '{print $3}')"
echo "  Media directory: /mnt/plex/media"
echo "  Metadata directory: /var/lib/plexmediaserver"
echo "  Service status: Disabled (use enable-plex.sh to start)"
echo ""
echo "Media library structure:"
echo "  /mnt/plex/media/Movies"
echo "  /mnt/plex/media/TV_Shows"
echo "  /mnt/plex/media/Music"
echo "  /mnt/plex/media/Photos"
echo "  /mnt/plex/media/Other"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Add media files to /mnt/plex/media/"
echo "  2. Enable Plex: bash enable-plex.sh"
echo "  3. Access Plex at: http://46.250.241.70:32400/web"
echo "  4. Complete initial setup and claim server"
