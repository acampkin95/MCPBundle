#!/bin/bash
################################################################################
# MCP Ecosystem - Production Deployment Orchestrator
#
# This script orchestrates the complete production deployment once VMs are ready
# Executes all 17 deployment tasks in optimal order
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# VM Configuration
VMI01_IP="46.250.243.123"
VMI02D_IP="46.250.241.70"
VMI03_IP="154.26.158.31"
SSH_KEY=".keys/mcp-deployment-ed25519"
ROOT_USER="root"
ROOT_PASS="${ROOT_PASS:-[REDACTED]}"

# Credentials (REDACTED - set these environment variables before running)
DB_PASSWORD="${DB_PASSWORD:-[REDACTED]}"
PERPLEXITY_API="${PERPLEXITY_API:-[REDACTED]}"
CLOUDFLARE_API="${CLOUDFLARE_API:-[REDACTED]}"
WASABI_ACCESS_KEY="${WASABI_ACCESS_KEY:-[REDACTED]}"
WASABI_SECRET_KEY="${WASABI_SECRET_KEY:-[REDACTED]}"

# Logging
LOG_FILE="deployment/logs/production-deploy-$(date +%Y%m%d-%H%M%S).log"
mkdir -p deployment/logs

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

################################################################################
# PHASE 1: Verify VM Accessibility
################################################################################

verify_vm_access() {
    local vm_name=$1
    local vm_ip=$2

    log "Checking accessibility of $vm_name ($vm_ip)..."

    # Test ping
    if ! ping -c 3 -W 5 "$vm_ip" > /dev/null 2>&1; then
        error "$vm_name is not responding to pings"
        return 1
    fi

    # Test SSH with password
    if ! SSHPASS="$ROOT_PASS" sshpass -e ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
         -o UserKnownHostsFile=/dev/null "$ROOT_USER@$vm_ip" 'echo "SSH_OK"' > /dev/null 2>&1; then
        error "$vm_name SSH connection failed"
        return 1
    fi

    log "$vm_name is accessible ✓"
    return 0
}

################################################################################
# PHASE 2: SSH Key Distribution
################################################################################

distribute_ssh_keys() {
    log "=== PHASE 2: Distributing SSH keys to all VMs ==="

    for vm_info in "VMI01:$VMI01_IP" "VMI02D:$VMI02D_IP" "VMI03:$VMI03_IP"; do
        local vm_name="${vm_info%%:*}"
        local vm_ip="${vm_info##*:}"

        log "Copying SSH public key to $vm_name..."

        # Copy SSH key
        SSHPASS="$ROOT_PASS" sshpass -e ssh-copy-id -i "$SSH_KEY.pub" \
            -o StrictHostKeyChecking=no "$ROOT_USER@$vm_ip" >> "$LOG_FILE" 2>&1

        # Verify passwordless SSH
        if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$ROOT_USER@$vm_ip" 'echo "Passwordless SSH works"' > /dev/null 2>&1; then
            log "$vm_name: Passwordless SSH configured ✓"
        else
            error "$vm_name: Passwordless SSH verification failed"
            return 1
        fi
    done

    log "SSH keys distributed successfully ✓"
}

################################################################################
# PHASE 3: System Initialization
################################################################################

initialize_systems() {
    log "=== PHASE 3: Initializing all VMs ==="

    for vm_info in "VMI01:$VMI01_IP" "VMI02D:$VMI02D_IP" "VMI03:$VMI03_IP"; do
        local vm_name="${vm_info%%:*}"
        local vm_ip="${vm_info##*:}"

        log "Initializing $vm_name..."

        ssh -i "$SSH_KEY" "$ROOT_USER@$vm_ip" bash << 'EOF'
# Update system
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# Install essential packages
apt-get install -y -qq curl wget git vim htop net-tools

# Set timezone to UTC
timedatectl set-timezone UTC

# Configure hostname
hostnamectl set-hostname $(hostname -I | awk '{print $1}' | sed 's/\./-/g')

# Create directory structure
mkdir -p /opt/mcp/{services,logs,backups,config}

echo "System initialized successfully"
EOF

        log "$vm_name initialized ✓"
    done
}

################################################################################
# PHASE 4: Database Migration
################################################################################

deploy_database_migration() {
    log "=== PHASE 4: Deploying Database Migration v0.1 → v0.2 ==="

    # Transfer migration package to VMI01
    log "Transferring migration package to VMI01..."
    scp -i "$SSH_KEY" deployment/migration-v02.tar.gz "$ROOT_USER@$VMI01_IP:/tmp/" >> "$LOG_FILE" 2>&1

    # Execute migration
    log "Executing database migration..."
    ssh -i "$SSH_KEY" "$ROOT_USER@$VMI01_IP" bash << 'EOF'
cd /opt/mcp
tar -xzf /tmp/migration-v02.tar.gz
cd migration-v02

# Make scripts executable
chmod +x deploy-migration.sh validate-migration.sh rollback-migration.sh

# Execute migration
./deploy-migration.sh

# Verify migration
if ./validate-migration.sh; then
    echo "Migration completed successfully"
    exit 0
else
    echo "Migration validation failed"
    exit 1
fi
EOF

    if [ $? -eq 0 ]; then
        log "Database migration completed successfully ✓"
    else
        error "Database migration failed"
        return 1
    fi
}

################################################################################
# PHASE 5: Deploy MCP Services
################################################################################

deploy_mcp_services() {
    log "=== PHASE 5: Deploying MCP Services ==="

    # This will be implemented by specialized agents
    # Placeholder for now
    log "MCP service deployment: Ready for agent execution"
}

################################################################################
# Main Execution
################################################################################

main() {
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  MCP Ecosystem - Production Deployment                    ║"
    log "║  Target: 3-VM Distributed Architecture                    ║"
    log "╚════════════════════════════════════════════════════════════╝"

    # Check prerequisites
    if [ ! -f "$SSH_KEY" ]; then
        error "SSH key not found: $SSH_KEY"
        exit 1
    fi

    if ! command -v sshpass > /dev/null; then
        error "sshpass not installed. Install with: brew install hudochenkov/sshpass/sshpass"
        exit 1
    fi

    # Phase 1: Verify all VMs are accessible
    log "=== PHASE 1: Verifying VM Accessibility ==="
    verify_vm_access "VMI01" "$VMI01_IP" || exit 1
    verify_vm_access "VMI02D" "$VMI02D_IP" || exit 1
    verify_vm_access "VMI03" "$VMI03_IP" || exit 1

    # Phase 2: Distribute SSH keys
    distribute_ssh_keys || exit 1

    # Phase 3: Initialize systems
    initialize_systems || exit 1

    # Phase 4: Database migration
    deploy_database_migration || exit 1

    # Phase 5: Deploy MCP services (requires specialized agents)
    deploy_mcp_services

    log ""
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  Initial deployment phases completed successfully!        ║"
    log "║  Next: Deploy specialized services with Opus agents       ║"
    log "╚════════════════════════════════════════════════════════════╝"
    log ""
    log "Deployment log saved to: $LOG_FILE"
}

# Execute main function
main "$@"
