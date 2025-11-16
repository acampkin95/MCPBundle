#!/bin/bash

# Initialize Restic Repositories on All Nodes
# Creates encrypted repositories in Wasabi S3

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
log_info "Initialize Restic Repositories"
log_info "=========================================="

# Function to initialize repository on a node
initialize_repo() {
    local HOSTNAME=$1
    local IP=$2

    log_info "Initializing repository for ${HOSTNAME}..."

    # Create initialization script
    cat > /tmp/init-repo-${HOSTNAME}.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

# Load environment
source /opt/backup/restic-env.sh

# Check if repository exists
if restic snapshots >/dev/null 2>&1; then
    echo "✅ Repository already initialized"
    echo ""
    echo "Existing snapshots:"
    restic snapshots || echo "No snapshots yet"
else
    echo "Initializing new repository..."
    if restic init; then
        echo "✅ Repository initialized successfully"
    else
        echo "❌ Failed to initialize repository"
        exit 1
    fi
fi

# Show repository info
echo ""
echo "Repository: ${RESTIC_REPOSITORY}"
echo "Status: Initialized and accessible"
SCRIPT

    # Copy and execute on node
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        bash /tmp/init-repo-${HOSTNAME}.sh
    else
        # Remote execution via SSH
        sshpass -p "${SSH_PASSWORD}" scp ${SSH_OPTS} /tmp/init-repo-${HOSTNAME}.sh root@${IP}:/tmp/
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} "bash /tmp/init-repo-${HOSTNAME}.sh"
    fi

    if [[ $? -eq 0 ]]; then
        log_success "  Repository initialized: ${HOSTNAME}"
    else
        log_error "  Failed to initialize: ${HOSTNAME}"
        return 1
    fi
}

# Initialize all repositories
log_info "Initializing repositories for all 4 nodes..."
echo ""

FAILED_NODES=()
for HOSTNAME in "${!NODES[@]}"; do
    echo "=========================================="
    if initialize_repo "${HOSTNAME}" "${NODES[$HOSTNAME]}"; then
        echo "✅ ${HOSTNAME}: Success"
    else
        echo "❌ ${HOSTNAME}: Failed"
        FAILED_NODES+=("${HOSTNAME}")
    fi
    echo ""
done

log_success "=========================================="
log_success "Repository Initialization Complete!"
log_success "=========================================="
echo ""

if [[ ${#FAILED_NODES[@]} -eq 0 ]]; then
    log_success "ALL 4 REPOSITORIES INITIALIZED:"
    for HOSTNAME in "${!NODES[@]}"; do
        echo "  ✅ ${HOSTNAME} → s3:s3.ap-southeast-2.wasabisys.com/vmibackups/${HOSTNAME}"
    done
else
    log_warning "SOME REPOSITORIES FAILED:"
    for NODE in "${FAILED_NODES[@]}"; do
        echo "  ❌ ${NODE}"
    done
    echo ""
    log_info "Check errors above and retry failed nodes manually"
fi

echo ""
log_info "NEXT STEP: Test first backup"
echo "  Run: bash /tmp/test-first-backup.sh"
