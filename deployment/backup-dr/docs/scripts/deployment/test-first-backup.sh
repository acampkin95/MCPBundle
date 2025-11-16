#!/bin/bash

# Test First Backup on All Nodes
# Runs initial backup to verify everything works

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

# Node configuration
declare -A NODES
NODES["ACDEV-VMI01"]="10.0.0.1"
NODES["ACDEV-VMI02D"]="10.0.0.2"
NODES["ACDEV-VMI03"]="10.0.0.3"
NODES["ACDEV-WG_GATEWAY"]="10.0.0.4"

SSH_PASSWORD="C0nnaught"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

log_info "=========================================="
log_info "Test First Backup - All Nodes"
log_info "=========================================="
echo ""
log_warning "This will run the first full backup on all 4 nodes"
log_warning "Estimated time: 15-30 minutes per node"
echo ""

# Function to test backup on a node
test_backup() {
    local HOSTNAME=$1
    local IP=$2

    log_info "Starting backup on ${HOSTNAME}..."
    echo "  Time: $(date)"

    # Run backup
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        /opt/backup/scripts/backup.sh
    else
        # Remote execution via SSH
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} '/opt/backup/scripts/backup.sh'
    fi

    if [[ $? -eq 0 ]]; then
        log_success "  Backup completed: ${HOSTNAME}"
        return 0
    else
        log_error "  Backup failed: ${HOSTNAME}"
        return 1
    fi
}

# Test backups sequentially (to avoid overloading WAN connection)
FAILED_NODES=()
for HOSTNAME in "${!NODES[@]}"; do
    echo "=========================================="
    echo "Node: ${HOSTNAME} (${NODES[$HOSTNAME]})"
    echo "=========================================="

    if test_backup "${HOSTNAME}" "${NODES[$HOSTNAME]}"; then
        echo "✅ ${HOSTNAME}: Backup successful"
    else
        echo "❌ ${HOSTNAME}: Backup failed"
        FAILED_NODES+=("${HOSTNAME}")
    fi
    echo ""
done

log_success "=========================================="
log_success "Backup Testing Complete!"
log_success "=========================================="
echo ""

if [[ ${#FAILED_NODES[@]} -eq 0 ]]; then
    log_success "ALL 4 BACKUPS SUCCESSFUL:"
    for HOSTNAME in "${!NODES[@]}"; do
        echo "  ✅ ${HOSTNAME}"
    done
    echo ""
    log_info "Backup logs available at: /opt/backup/logs/"
    echo ""
    log_success "Automated backups will run daily at 5AM Perth time (21:00 UTC)"
    echo ""
    log_info "Cron schedule:"
    echo "  - ACDEV-VMI01: 5:00 AM Perth (21:00 UTC)"
    echo "  - ACDEV-VMI02D: 5:05 AM Perth (21:05 UTC)"
    echo "  - ACDEV-VMI03: 5:10 AM Perth (21:10 UTC)"
    echo "  - ACDEV-WG_GATEWAY: 5:15 AM Perth (21:15 UTC)"
else
    log_warning "SOME BACKUPS FAILED:"
    for NODE in "${FAILED_NODES[@]}"; do
        echo "  ❌ ${NODE}"
    done
    echo ""
    log_info "Check backup logs on failed nodes:"
    for NODE in "${FAILED_NODES[@]}"; do
        IP="${NODES[$NODE]}"
        echo "  ssh root@${IP} 'tail -100 /opt/backup/logs/backup-*.log | tail'"
    done
fi

echo ""
log_info "Verify backups in Wasabi S3:"
echo "  aws s3 ls s3://vmibackups/ --recursive \\"
echo "    --endpoint-url https://s3.ap-southeast-2.wasabisys.com \\"
echo "    --profile wasabi"
