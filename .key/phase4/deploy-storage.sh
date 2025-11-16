#!/bin/bash
#
# VMI02D Storage Server Deployment Script
# Server: 46.250.241.70
# Purpose: NextCloud, Plex, and Secure Archive Storage
#
# Usage: ./deploy-storage.sh [--skip-lvm] [--skip-firewall]
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/vmi02d-deployment.log"
SKIP_LVM=false
SKIP_FIREWALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-lvm)
            SKIP_LVM=true
            shift
            ;;
        --skip-firewall)
            SKIP_FIREWALL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-lvm] [--skip-firewall]"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() {
    log "INFO" "${BLUE}$@${NC}"
}

success() {
    log "SUCCESS" "${GREEN}$@${NC}"
}

warning() {
    log "WARNING" "${YELLOW}$@${NC}"
}

error() {
    log "ERROR" "${RED}$@${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
   exit 1
fi

# Check server IP
SERVER_IP=$(hostname -I | awk '{print $1}')
if [[ "$SERVER_IP" != "46.250.241.70" ]]; then
    warning "Server IP ($SERVER_IP) doesn't match expected VMI02D IP (46.250.241.70)"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

info "Starting VMI02D Storage Server Deployment"
info "Deployment log: $LOG_FILE"

# System update
info "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install essential packages
info "Installing essential packages..."
apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    iotop \
    iftop \
    ncdu \
    rsync \
    screen \
    tmux \
    unzip \
    zip \
    ca-certificates \
    gnupg \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    ufw \
    fail2ban \
    smartmontools \
    lvm2 \
    inotify-tools \
    mailutils \
    postfix

# Install Docker
if ! command -v docker &> /dev/null; then
    info "Installing Docker..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    success "Docker installed successfully"
else
    success "Docker already installed"
fi

# Install Docker Compose standalone
if ! command -v docker-compose &> /dev/null; then
    info "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    success "Docker Compose installed successfully"
fi

# Setup LVM
if [[ "$SKIP_LVM" == false ]]; then
    info "Setting up LVM storage..."
    if [[ -f "$SCRIPT_DIR/storage/setup-lvm.sh" ]]; then
        bash "$SCRIPT_DIR/storage/setup-lvm.sh"
    else
        warning "LVM setup script not found, skipping"
    fi
else
    warning "Skipping LVM setup (--skip-lvm flag used)"
fi

# Create storage directories
info "Creating storage directories..."
mkdir -p /mnt/nextcloud/data
mkdir -p /mnt/plex/media
mkdir -p /mnt/secure-archive
chmod 755 /mnt/nextcloud
chmod 755 /mnt/plex
chmod 700 /mnt/secure-archive

# Setup SMART monitoring
info "Setting up SMART monitoring..."
bash "$SCRIPT_DIR/storage/setup-smart-monitoring.sh" || warning "SMART monitoring setup failed"

# Setup disk space alerts
info "Setting up disk space alerts..."
bash "$SCRIPT_DIR/storage/disk-space-alert.sh" --install || warning "Disk space alert setup failed"

# Optimize I/O
info "Optimizing I/O settings..."
bash "$SCRIPT_DIR/storage/optimize-io.sh" || warning "I/O optimization failed"

# Setup AccessService
info "Setting up AccessService user..."
bash "$SCRIPT_DIR/accessservice/setup-accessservice.sh"

# Setup write-once watcher
info "Installing write-once watcher service..."
cp "$SCRIPT_DIR/accessservice/write-once-watcher.sh" /usr/local/bin/write-once-watcher.sh
chmod +x /usr/local/bin/write-once-watcher.sh
cp "$SCRIPT_DIR/accessservice/write-once-watcher.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable write-once-watcher.service
systemctl start write-once-watcher.service
success "Write-once watcher installed and started"

# Setup firewall
if [[ "$SKIP_FIREWALL" == false ]]; then
    info "Configuring firewall..."
    bash "$SCRIPT_DIR/firewall/vmi02d-firewall.sh"
else
    warning "Skipping firewall setup (--skip-firewall flag used)"
fi

# Setup fail2ban
info "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Install Plex (but don't enable)
info "Installing Plex Media Server..."
bash "$SCRIPT_DIR/plex/install-plex.sh"

# Setup NextCloud (but don't enable)
info "Setting up NextCloud..."
cd "$SCRIPT_DIR/nextcloud"
if [[ ! -f .env ]]; then
    warning "NextCloud .env file not found. Creating from template..."
    cp .env.template .env
    warning "Please edit $SCRIPT_DIR/nextcloud/.env before enabling NextCloud"
fi

# Pull NextCloud images (don't start)
info "Pulling NextCloud Docker images..."
docker-compose pull || warning "Failed to pull NextCloud images"

# Setup snapshots
info "Setting up LVM snapshots..."
bash "$SCRIPT_DIR/storage/setup-snapshots.sh" || warning "Snapshot setup failed"

# Display summary
echo ""
echo "=========================================="
success "VMI02D STORAGE SERVER DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
info "Server Information:"
echo "  IP Address: $SERVER_IP"
echo "  Hostname: $(hostname)"
echo "  Disk Space: $(df -h / | awk 'NR==2 {print $4}') available"
echo "  Memory: $(free -h | awk 'NR==2 {print $2}')"
echo ""
info "Installed Services (DISABLED by default):"
echo "  - NextCloud (Docker Compose)"
echo "  - Plex Media Server"
echo ""
info "Active Services:"
echo "  - AccessService (SFTP user with write-once archive)"
echo "  - Write-once watcher (systemd service)"
echo "  - SMART monitoring"
echo "  - Disk space alerts"
echo ""
warning "NEXT STEPS:"
echo "  1. Edit NextCloud configuration: $SCRIPT_DIR/nextcloud/.env"
echo "  2. Run on VMI01: bash $SCRIPT_DIR/nextcloud/create-nextcloud-db.sh"
echo "  3. Enable NextCloud: bash $SCRIPT_DIR/nextcloud/enable-nextcloud.sh"
echo "  4. Enable Plex: bash $SCRIPT_DIR/plex/enable-plex.sh"
echo "  5. Test AccessService: bash $SCRIPT_DIR/accessservice/test-accessservice.sh"
echo ""
info "Documentation:"
echo "  - Deployment Guide: $SCRIPT_DIR/docs/DEPLOYMENT_GUIDE.md"
echo "  - NextCloud Admin: $SCRIPT_DIR/docs/NEXTCLOUD_ADMIN_GUIDE.md"
echo "  - Plex Admin: $SCRIPT_DIR/docs/PLEX_ADMIN_GUIDE.md"
echo "  - AccessService: $SCRIPT_DIR/docs/ACCESSSERVICE_GUIDE.md"
echo "  - Storage Management: $SCRIPT_DIR/docs/STORAGE_MANAGEMENT.md"
echo ""
success "Deployment log saved to: $LOG_FILE"
echo ""
