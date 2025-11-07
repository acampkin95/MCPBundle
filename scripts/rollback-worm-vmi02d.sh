#!/bin/bash
#
# WORM Area Rollback Script for VMI02D
# Removes AccessService user and WORM configuration
#
# Usage: Run as root on VMI02D
#   chmod +x rollback-worm-vmi02d.sh
#   ./rollback-worm-vmi02d.sh
#
# WARNING: This will delete the AccessService user and all archived files!
#

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root"
    exit 1
fi

# Configuration
USERNAME="AccessService"
ARCHIVE_DIR="/mnt/secure-archive"

log_warn "========================================="
log_warn "WORM Area Rollback"
log_warn "========================================="
echo ""
log_warn "This will:"
echo "  - Stop and remove the WORM archive service"
echo "  - Delete the AccessService user"
echo "  - Remove SSH/SFTP configuration"
echo "  - Optionally delete archived files"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log_info "Rollback cancelled"
    exit 0
fi

echo ""

# Step 1: Stop and remove the service
log_info "Step 1: Stopping WORM archive service..."
if systemctl is-active --quiet worm-archive.service; then
    systemctl stop worm-archive.service
    log_info "Service stopped"
fi

if systemctl is-enabled --quiet worm-archive.service 2>/dev/null; then
    systemctl disable worm-archive.service
    log_info "Service disabled"
fi

if [ -f /etc/systemd/system/worm-archive.service ]; then
    rm /etc/systemd/system/worm-archive.service
    systemctl daemon-reload
    log_info "Service file removed"
fi

# Remove archive script
if [ -f /usr/local/bin/worm-archive.sh ]; then
    rm /usr/local/bin/worm-archive.sh
    log_info "Archive script removed"
fi

# Remove log rotation
if [ -f /etc/logrotate.d/worm-archive ]; then
    rm /etc/logrotate.d/worm-archive
    log_info "Log rotation config removed"
fi

# Step 2: Handle archived files
log_info "Step 2: Handling archived files..."
if [ -d "$ARCHIVE_DIR" ]; then
    FILE_COUNT=$(find ${ARCHIVE_DIR} -type f | wc -l)
    log_warn "Found ${FILE_COUNT} archived files in ${ARCHIVE_DIR}"

    if [ "$FILE_COUNT" -gt 0 ]; then
        echo ""
        read -p "Do you want to DELETE all archived files? (yes/no): " DELETE_ARCHIVE

        if [ "$DELETE_ARCHIVE" = "yes" ]; then
            # Remove immutable flag from all files
            log_info "Removing immutable flags..."
            find ${ARCHIVE_DIR} -type f -exec chattr -i {} \; 2>/dev/null || true

            # Delete files
            rm -rf ${ARCHIVE_DIR}/*
            log_warn "All archived files deleted"
        else
            log_info "Archived files preserved in ${ARCHIVE_DIR}"
            log_info "You may want to manually review and backup these files"
        fi
    fi
fi

# Step 3: Remove user
log_info "Step 3: Removing user ${USERNAME}..."
if id "$USERNAME" &>/dev/null; then
    # Kill any user processes
    pkill -u ${USERNAME} 2>/dev/null || true

    # Delete user and home directory
    userdel -r ${USERNAME} 2>/dev/null || userdel ${USERNAME}
    log_info "User ${USERNAME} removed"

    # Clean up any remaining home directory
    if [ -d "/home/${USERNAME}" ]; then
        rm -rf "/home/${USERNAME}"
        log_info "Home directory cleaned up"
    fi
else
    log_warn "User ${USERNAME} does not exist"
fi

# Step 4: Remove SSH configuration
log_info "Step 4: Cleaning SSH configuration..."

SSHD_CONFIG="/etc/ssh/sshd_config"

if grep -q "^Match User ${USERNAME}" ${SSHD_CONFIG}; then
    BACKUP_CONFIG="${SSHD_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
    cp ${SSHD_CONFIG} ${BACKUP_CONFIG}
    log_info "SSH config backed up to ${BACKUP_CONFIG}"

    # Remove Match User block and associated configurations
    # This is a simple removal - you may want to manually verify
    sed -i.tmp "/^# WORM Area Configuration for ${USERNAME}/,/^Match /d" ${SSHD_CONFIG}
    sed -i.tmp "/^Match User ${USERNAME}/,/^Match /d" ${SSHD_CONFIG}
    sed -i.tmp "/^Match User ${USERNAME}/,/^$/d" ${SSHD_CONFIG}

    # Test SSH configuration
    if sshd -t; then
        log_info "SSH configuration is valid"
        systemctl restart sshd
        log_info "SSH service restarted"
        rm -f ${SSHD_CONFIG}.tmp
    else
        log_error "SSH configuration is invalid! Restoring backup..."
        cp ${BACKUP_CONFIG} ${SSHD_CONFIG}
        log_warn "Please manually edit ${SSHD_CONFIG} to remove ${USERNAME} configuration"
    fi
else
    log_info "No SSH configuration found for ${USERNAME}"
fi

# Step 5: Clean up logs
log_info "Step 5: Cleaning up logs..."
if [ -f /var/log/worm-archive.log ]; then
    rm /var/log/worm-archive.log*
    log_info "Archive logs removed"
fi

# Summary
echo ""
log_info "========================================="
log_info "Rollback Complete"
log_info "========================================="
echo ""
log_info "Removed:"
echo "  - WORM archive service"
echo "  - AccessService user"
echo "  - SSH/SFTP configuration"
echo "  - Log files"
echo ""

if [ -d "$ARCHIVE_DIR" ]; then
    log_warn "Archive directory still exists: ${ARCHIVE_DIR}"
    log_warn "You may want to backup and remove it manually"
fi

echo ""
log_info "System returned to pre-WORM state"
