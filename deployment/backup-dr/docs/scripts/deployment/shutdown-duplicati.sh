#!/bin/bash

# Shutdown Duplicati and Clean Remnants
# Preserves: Wasabi credentials, VPN network info, SSH keys

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

log_info "=========================================="
log_info "Duplicati Shutdown & Cleanup"
log_info "=========================================="

# Step 1: Preserve Critical Information
log_info "Step 1: Preserving critical information..."

mkdir -p /backup/preserved/

cat > /backup/preserved/WASABI_CREDENTIALS.txt << 'EOF'
# Wasabi S3 Credentials
# Preserved from Duplicati deployment for Restic implementation

WASABI_ACCESS_KEY="WCZLQETBK6VXN55WECMQ"
WASABI_SECRET_KEY="fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD"
WASABI_BUCKET="vmibackups"
WASABI_ENDPOINT="s3.ap-southeast-2.wasabisys.com"
WASABI_REGION="ap-southeast-2"
WASABI_URL="https://s3.ap-southeast-2.wasabisys.com"

# S3 URL format for Restic:
# s3:s3.ap-southeast-2.wasabisys.com/vmibackups/[hostname]

# Environment variables for AWS CLI:
export AWS_ACCESS_KEY_ID="WCZLQETBK6VXN55WECMQ"
export AWS_SECRET_ACCESS_KEY="fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD"
export AWS_DEFAULT_REGION="ap-southeast-2"
EOF

cat > /backup/preserved/VPN_NETWORK.txt << 'EOF'
# VPN Network Information
# Preserved from Duplicati deployment for Restic implementation

ACDEV-VMI01 (Primary Application Server):
  VPN IP: 10.0.0.1
  Public IP: 46.250.243.123
  VMI ID: vmi2870958
  Role: Primary MCP servers, PostgreSQL master

ACDEV-VMI02D (Backup/Data Server):
  VPN IP: 10.0.0.2
  Public IP: 46.250.241.70
  VMI ID: vmi2888815
  Role: Storage layer, PostgreSQL standby (THIS SYSTEM)

ACDEV-VMI03 (SOC Hub):
  VPN IP: 10.0.0.3
  Public IP: 154.26.158.31
  VMI ID: vmi2889604
  Role: TheHive, SOC operations, Docker services

ACDEV-WG_GATEWAY (WireGuard Gateway):
  VPN IP: 10.0.0.4
  Public IP: 154.26.158.31
  VMI ID: vmi2897882
  Role: VPN gateway, network routing

SSH Credentials:
  Username: root
  Password: C0nnaught
  SSH Keys: Deployed to all nodes (passwordless access configured)

WireGuard VPN:
  Network: 10.0.0.0/24
  All nodes connected via encrypted mesh
EOF

cat > /backup/preserved/BACKUP_PATHS.txt << 'EOF'
# Backup Paths by Host
# Preserved from Duplicati deployment for Restic implementation

ACDEV-VMI01 (10.0.0.1):
  Critical:
    - /opt/mcp/
    - /var/lib/postgresql/
    - /etc/
    - /root/
  Additional:
    - /opt/
    - /var/log/
    - /var/
    - /home/

ACDEV-VMI02D (10.0.0.2 - LOCAL):
  Critical:
    - /opt/
    - /etc/
    - /root/
    - /backup/config/
  Additional:
    - /var/log/
    - /backup/
    - /var/
    - /home/

ACDEV-VMI03 (10.0.0.3):
  Critical:
    - /opt/mcp/
    - /opt/thehive/
    - /var/lib/docker/volumes/
    - /etc/
  Additional:
    - /opt/
    - /var/lib/docker/
    - /root/
    - /var/log/
    - /var/
    - /home/

ACDEV-WG_GATEWAY (10.0.0.4):
  Critical:
    - /etc/wireguard/
    - /etc/
    - /root/
  Additional:
    - /var/log/
    - /var/

GFS Retention Policy (to be implemented in Restic):
  - 6-hourly: Keep 4 backups
  - Daily: Keep 7 backups
  - Weekly: Keep 4 backups
  - Monthly: Keep 3 backups
EOF

# Copy encryption passphrase if it exists
if [[ -f /backup/config/encryption-passphrase.txt ]]; then
    cp /backup/config/encryption-passphrase.txt /backup/preserved/DUPLICATI_ENCRYPTION_PASSPHRASE.txt
    log_info "  Preserved Duplicati encryption passphrase (for reference)"
fi

log_success "Critical information preserved in /backup/preserved/"

# Step 2: Stop Duplicati Container
log_info "Step 2: Stopping Duplicati container..."

if docker ps | grep -q duplicati; then
    docker stop duplicati
    log_success "  Duplicati container stopped"
else
    log_warning "  Duplicati container not running"
fi

# Step 3: Remove Duplicati Container
log_info "Step 3: Removing Duplicati container..."

if docker ps -a | grep -q duplicati; then
    docker rm duplicati
    log_success "  Duplicati container removed"
else
    log_warning "  Duplicati container not found"
fi

# Step 4: Remove Duplicati Volumes (optional - commented out for safety)
log_info "Step 4: Cleaning up Duplicati volumes..."

if docker volume ls | grep -q duplicati; then
    log_warning "  Duplicati volumes found - keeping for now"
    log_info "  To remove: docker volume rm \$(docker volume ls -q | grep duplicati)"
else
    log_info "  No Duplicati volumes found"
fi

# Step 5: Archive Duplicati Configuration
log_info "Step 5: Archiving Duplicati configuration..."

if [[ -d /backup/config ]]; then
    mkdir -p /backup/archived/
    tar -czf /backup/archived/duplicati-config-$(date +%Y%m%d-%H%M%S).tar.gz /backup/config/
    log_success "  Configuration archived to /backup/archived/"

    # Keep config directory for now (contains useful templates)
    log_info "  Original config kept in /backup/config/ (can be removed later)"
else
    log_warning "  No /backup/config/ directory found"
fi

# Step 6: Summary
log_success "=========================================="
log_success "Duplicati Shutdown Complete!"
log_success "=========================================="
echo ""
log_info "PRESERVED INFORMATION:"
echo "  ✅ Wasabi S3 credentials: /backup/preserved/WASABI_CREDENTIALS.txt"
echo "  ✅ VPN network details: /backup/preserved/VPN_NETWORK.txt"
echo "  ✅ Backup paths: /backup/preserved/BACKUP_PATHS.txt"
echo "  ✅ SSH keys: /root/.ssh/id_rsa (still deployed to all nodes)"
echo ""
log_info "CLEANED UP:"
echo "  ✅ Duplicati container stopped and removed"
echo "  ✅ Configuration archived to /backup/archived/"
echo ""
log_info "NEXT STEPS:"
echo "  1. Install Restic on all 4 nodes"
echo "  2. Initialize Restic repositories in Wasabi S3"
echo "  3. Configure backup scripts for 5AM Perth time"
echo "  4. Set up GFS-style retention policies"
echo ""
log_success "Ready to proceed with Restic deployment!"
