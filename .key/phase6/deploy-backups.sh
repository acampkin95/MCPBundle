#!/bin/bash
#
# Wasabi S3 Backup System Deployment Script
# Deploys backup system to VMI01, VMI02D, and VMI03
#
# Usage: ./deploy-backups.sh [--vm <hostname>] [--all]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# VMs configuration
declare -A VMS=(
    ["vmi01"]="46.250.243.123"
    ["vmi02d"]="46.250.241.70"
    ["vmi03"]="154.26.158.31"
)

# Deployment settings
SSH_USER="root"
SSH_KEY="${HOME}/.ssh/id_ed25519"
TARGET_DIR="/opt/backup-scripts"

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" >&2
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*"
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check SSH key exists
    if [ ! -f "${SSH_KEY}" ]; then
        error "SSH key not found: ${SSH_KEY}"
        exit 1
    fi

    # Check required commands
    for cmd in ssh scp rsync; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done

    # Check source files exist
    for dir in scripts config cron systemd monitoring docs; do
        if [ ! -d "${SCRIPT_DIR}/${dir}" ]; then
            error "Required directory not found: ${dir}"
            exit 1
        fi
    done

    log "Prerequisites check passed"
}

get_wasabi_credentials() {
    log "Wasabi S3 Credentials Required"
    echo ""
    echo "Please enter your Wasabi S3 credentials:"
    echo ""

    read -p "Access Key ID: " ACCESS_KEY
    read -sp "Secret Access Key: " SECRET_KEY
    echo ""

    if [ -z "${ACCESS_KEY}" ] || [ -z "${SECRET_KEY}" ]; then
        error "Credentials cannot be empty"
        exit 1
    fi

    # Update rclone config
    local config_file="${SCRIPT_DIR}/config/rclone.conf"
    sed -i.bak \
        -e "s/ACCESS_KEY_ID_PLACEHOLDER/${ACCESS_KEY}/" \
        -e "s/SECRET_ACCESS_KEY_PLACEHOLDER/${SECRET_KEY}/" \
        "${config_file}"

    log "Credentials configured"
}

test_ssh_connection() {
    local hostname=$1
    local ip=$2

    log "Testing SSH connection to ${hostname} (${ip})..."

    if ssh -i "${SSH_KEY}" -o ConnectTimeout=10 -o BatchMode=yes \
        "${SSH_USER}@${ip}" "echo 'Connection successful'" &> /dev/null; then
        log "SSH connection to ${hostname} successful"
        return 0
    else
        error "Cannot connect to ${hostname} (${ip})"
        return 1
    fi
}

deploy_to_vm() {
    local hostname=$1
    local ip=$2

    log "=========================================="
    log "Deploying to ${hostname} (${ip})"
    log "=========================================="

    # Test connection
    if ! test_ssh_connection "${hostname}" "${ip}"; then
        error "Skipping ${hostname} due to connection failure"
        return 1
    fi

    # Create target directory
    log "Creating target directory..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "mkdir -p ${TARGET_DIR}"

    # Deploy scripts
    log "Deploying backup scripts..."
    rsync -avz --progress -e "ssh -i ${SSH_KEY}" \
        "${SCRIPT_DIR}/scripts/" \
        "${SSH_USER}@${ip}:${TARGET_DIR}/"

    # Make scripts executable
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "chmod +x ${TARGET_DIR}/*.sh"

    # Deploy configuration files
    log "Deploying configuration files..."
    rsync -avz -e "ssh -i ${SSH_KEY}" \
        "${SCRIPT_DIR}/config/" \
        "${SSH_USER}@${ip}:${TARGET_DIR}/config/"

    # Deploy rclone configuration
    log "Deploying rclone configuration..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "mkdir -p /root/.config/rclone"
    scp -i "${SSH_KEY}" \
        "${SCRIPT_DIR}/config/rclone.conf" \
        "${SSH_USER}@${ip}:/root/.config/rclone/rclone.conf"
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "chmod 600 /root/.config/rclone/rclone.conf"

    # Deploy documentation
    log "Deploying documentation..."
    rsync -avz -e "ssh -i ${SSH_KEY}" \
        "${SCRIPT_DIR}/docs/" \
        "${SSH_USER}@${ip}:${TARGET_DIR}/docs/"

    # Install dependencies
    log "Installing dependencies..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" bash <<'EOF'
apt update
apt install -y rclone zstd jq mailutils curl wget git

# Configure mail if not already configured
if [ ! -f /etc/aliases ]; then
    echo "root: acampkinpersonnal@gmail.com" >> /etc/aliases
    newaliases 2>/dev/null || true
fi
EOF

    # Setup systemd timers
    log "Setting up systemd timers..."
    rsync -avz -e "ssh -i ${SSH_KEY}" \
        "${SCRIPT_DIR}/systemd/" \
        "${SSH_USER}@${ip}:/etc/systemd/system/"

    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" bash <<'EOF'
systemctl daemon-reload
systemctl enable backup-daily.timer
systemctl enable backup-weekly.timer
systemctl start backup-daily.timer
systemctl start backup-weekly.timer
EOF

    # Setup cron jobs (alternative to systemd)
    log "Setting up cron jobs..."
    rsync -avz -e "ssh -i ${SSH_KEY}" \
        "${SCRIPT_DIR}/cron/" \
        "${SSH_USER}@${ip}:/etc/cron.d/"

    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "chmod 644 /etc/cron.d/*"

    # Initialize /etc git tracking
    log "Initializing /etc git tracking..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "${TARGET_DIR}/etc-git-tracker.sh --init"

    # Create log directories
    log "Creating log directories..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "mkdir -p /var/log/backups"

    # Create backup staging directories
    log "Creating backup staging directories..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "mkdir -p /var/backups/s3-staging /var/backups/s3-staging-full"

    # Test rclone connection
    log "Testing S3 connection..."
    if ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" \
        "rclone lsd wasabi-vmi:vmibackups --config /root/.config/rclone/rclone.conf" &> /dev/null; then
        log "S3 connection test successful"
    else
        warn "S3 connection test failed - check credentials"
    fi

    # Run initial backup (dry-run)
    log "Running test backup (dry-run)..."
    ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" \
        "${TARGET_DIR}/backup-to-s3.sh --dry-run" || warn "Test backup encountered errors"

    log "${hostname} deployment completed successfully!"
    echo ""
}

verify_deployment() {
    local hostname=$1
    local ip=$2

    log "Verifying deployment on ${hostname}..."

    local checks_passed=0
    local checks_total=0

    # Check scripts exist
    ((checks_total++))
    if ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "[ -f ${TARGET_DIR}/backup-to-s3.sh ]"; then
        ((checks_passed++))
        log "✓ Backup scripts installed"
    else
        error "✗ Backup scripts not found"
    fi

    # Check rclone config
    ((checks_total++))
    if ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "[ -f /root/.config/rclone/rclone.conf ]"; then
        ((checks_passed++))
        log "✓ Rclone configuration exists"
    else
        error "✗ Rclone configuration missing"
    fi

    # Check systemd timers
    ((checks_total++))
    if ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "systemctl is-active backup-daily.timer" &> /dev/null; then
        ((checks_passed++))
        log "✓ Backup timers active"
    else
        warn "✗ Backup timers not active"
    fi

    # Check dependencies
    ((checks_total++))
    if ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" "command -v rclone zstd jq" &> /dev/null; then
        ((checks_passed++))
        log "✓ Dependencies installed"
    else
        error "✗ Missing dependencies"
    fi

    # Check S3 connectivity
    ((checks_total++))
    if ssh -i "${SSH_KEY}" "${SSH_USER}@${ip}" \
        "rclone lsd wasabi-vmi:vmibackups --config /root/.config/rclone/rclone.conf" &> /dev/null; then
        ((checks_passed++))
        log "✓ S3 connectivity working"
    else
        error "✗ S3 connectivity failed"
    fi

    log "Verification: ${checks_passed}/${checks_total} checks passed"

    if [ ${checks_passed} -eq ${checks_total} ]; then
        return 0
    else
        return 1
    fi
}

print_next_steps() {
    cat <<EOF

${GREEN}========================================
Deployment Complete!
========================================${NC}

Next Steps:

1. ${YELLOW}Verify Wasabi S3 Bucket${NC}
   - Login to Wasabi console
   - Navigate to 'vmibackups' bucket
   - Verify bucket exists and is accessible

2. ${YELLOW}Test Backup Manually${NC}
   For each VM, run:
   ${GREEN}ssh root@VM_IP${NC}
   ${GREEN}/opt/backup-scripts/backup-to-s3.sh --dry-run${NC}
   ${GREEN}/opt/backup-scripts/backup-to-s3.sh${NC}

3. ${YELLOW}Verify First Backup${NC}
   Wait for backup to complete, then:
   ${GREEN}/opt/backup-scripts/verify-backup.sh${NC}

4. ${YELLOW}Configure Monitoring${NC}
   Add to Prometheus:
   - Target: http://VM_IP:9100/metrics
   - Script: /opt/backup-scripts/monitoring/backup-status-check.sh

5. ${YELLOW}Test Email Notifications${NC}
   ${GREEN}echo "Test" | mail -s "Test" acampkinpersonnal@gmail.com${NC}

6. ${YELLOW}Schedule Restore Test${NC}
   - Add to calendar: Monthly restore drill
   - Use: /opt/backup-scripts/restore-from-s3.sh

7. ${YELLOW}Review Documentation${NC}
   - Backup Guide: ${TARGET_DIR}/docs/BACKUP_GUIDE.md
   - Restore Guide: ${TARGET_DIR}/docs/RESTORE_GUIDE.md
   - DR Plan: ${TARGET_DIR}/docs/DISASTER_RECOVERY.md

Backup Schedule:
- Daily: Every day at 2:00 AM
- Weekly: Sunday at 3:00 AM
- /etc tracking: Daily at 11:50 PM

Monitoring:
- Check timers: systemctl list-timers
- View logs: tail -f /var/log/backups/backup-*.log
- Check S3: rclone ls wasabi-vmi:vmibackups/

Support:
- Email: acampkinpersonnal@gmail.com
- Logs: /var/log/backups/
- Docs: ${TARGET_DIR}/docs/

${GREEN}========================================${NC}
EOF
}

main() {
    local deploy_vm=""
    local deploy_all=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --vm)
                deploy_vm="$2"
                shift 2
                ;;
            --all)
                deploy_all=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--vm <hostname>] [--all]"
                echo ""
                echo "Options:"
                echo "  --vm <hostname>  Deploy to specific VM (vmi01, vmi02d, vmi03)"
                echo "  --all            Deploy to all VMs"
                echo ""
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    log "=========================================="
    log "Wasabi S3 Backup System Deployment"
    log "=========================================="
    echo ""

    # Check prerequisites
    check_prerequisites

    # Get Wasabi credentials
    if grep -q "PLACEHOLDER" "${SCRIPT_DIR}/config/rclone.conf"; then
        get_wasabi_credentials
    else
        log "Using existing credentials from rclone.conf"
    fi

    echo ""

    # Deploy based on arguments
    if [ "${deploy_all}" = true ]; then
        # Deploy to all VMs
        for vm in "${!VMS[@]}"; do
            deploy_to_vm "${vm}" "${VMS[$vm]}" || warn "Deployment to ${vm} had issues"
            verify_deployment "${vm}" "${VMS[$vm]}" || warn "Verification failed for ${vm}"
            echo ""
        done
    elif [ -n "${deploy_vm}" ]; then
        # Deploy to specific VM
        if [ -z "${VMS[$deploy_vm]}" ]; then
            error "Unknown VM: ${deploy_vm}"
            error "Valid options: ${!VMS[@]}"
            exit 1
        fi

        deploy_to_vm "${deploy_vm}" "${VMS[$deploy_vm]}"
        verify_deployment "${deploy_vm}" "${VMS[$deploy_vm]}"
    else
        # Interactive selection
        echo "Select VMs to deploy:"
        echo "1) VMI01 (46.250.243.123) - Dev/MCP Server"
        echo "2) VMI02D (46.250.241.70) - Storage Server"
        echo "3) VMI03 (154.26.158.31) - Security Gateway"
        echo "4) All VMs"
        echo ""
        read -p "Selection [1-4]: " selection

        case ${selection} in
            1) deploy_to_vm "vmi01" "${VMS[vmi01]}" ;;
            2) deploy_to_vm "vmi02d" "${VMS[vmi02d]}" ;;
            3) deploy_to_vm "vmi03" "${VMS[vmi03]}" ;;
            4)
                for vm in "${!VMS[@]}"; do
                    deploy_to_vm "${vm}" "${VMS[$vm]}"
                    echo ""
                done
                ;;
            *)
                error "Invalid selection"
                exit 1
                ;;
        esac
    fi

    print_next_steps
}

main "$@"
