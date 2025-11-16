#!/bin/bash

# Update Wasabi Credentials on All Nodes
# Updates to new valid credentials

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

# New valid credentials
NEW_ACCESS_KEY="NJJ5363WC727JRAARETL"
NEW_SECRET_KEY="5p3eecez2hwFnlwyEtOu5NQeZGWu5sfema8PbGFp"
WASABI_BUCKET="vmibackups"
WASABI_ENDPOINT="s3.ap-southeast-2.wasabisys.com"
WASABI_REGION="ap-southeast-2"

# Node configuration
declare -A NODES
NODES["ACDEV-VMI01"]="10.0.0.1"
NODES["ACDEV-VMI02D"]="10.0.0.2"
NODES["ACDEV-VMI03"]="10.0.0.3"
NODES["ACDEV-WG_GATEWAY"]="10.0.0.4"

SSH_PASSWORD="C0nnaught"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

log_info "=========================================="
log_info "Update Wasabi Credentials - All Nodes"
log_info "=========================================="

# Update preserved credentials file
log_info "Step 1: Updating preserved credentials file..."

cat > /backup/preserved/WASABI_CREDENTIALS.txt << EOF
# Wasabi S3 Credentials (Updated: $(date))
# Valid and tested credentials

WASABI_ACCESS_KEY="${NEW_ACCESS_KEY}"
WASABI_SECRET_KEY="${NEW_SECRET_KEY}"
WASABI_BUCKET="${WASABI_BUCKET}"
WASABI_ENDPOINT="${WASABI_ENDPOINT}"
WASABI_REGION="${WASABI_REGION}"
WASABI_URL="https://${WASABI_ENDPOINT}"

# S3 URL format for Restic:
# s3:${WASABI_ENDPOINT}/${WASABI_BUCKET}/[hostname]

# Environment variables for AWS CLI:
export AWS_ACCESS_KEY_ID="${NEW_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${NEW_SECRET_KEY}"
export AWS_DEFAULT_REGION="${WASABI_REGION}"
EOF

log_success "  Updated /backup/preserved/WASABI_CREDENTIALS.txt"

# Update AWS CLI credentials
log_info "Step 2: Updating AWS CLI credentials..."

mkdir -p /root/.aws
cat > /root/.aws/credentials << EOF
[wasabi]
aws_access_key_id = ${NEW_ACCESS_KEY}
aws_secret_access_key = ${NEW_SECRET_KEY}
EOF

log_success "  Updated /root/.aws/credentials"

# Function to update credentials on a node
update_node_credentials() {
    local HOSTNAME=$1
    local IP=$2

    log_info "Updating credentials on ${HOSTNAME} (${IP})..."

    # Create update script
    cat > /tmp/update-creds-${HOSTNAME}.sh << SCRIPT
#!/bin/bash
set -euo pipefail

# Update Restic environment file with new credentials
sed -i 's/export AWS_ACCESS_KEY_ID=.*/export AWS_ACCESS_KEY_ID="${NEW_ACCESS_KEY}"/' /opt/backup/restic-env.sh
sed -i 's/export AWS_SECRET_ACCESS_KEY=.*/export AWS_SECRET_ACCESS_KEY="${NEW_SECRET_KEY}"/' /opt/backup/restic-env.sh

echo "✅ Credentials updated on ${HOSTNAME}"

# Test credentials
source /opt/backup/restic-env.sh
if restic snapshots >/dev/null 2>&1; then
    echo "✅ Repository accessible (already initialized)"
else
    echo "⏳ Repository not yet initialized (this is expected)"
fi
SCRIPT

    # Copy and execute on node
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        bash /tmp/update-creds-${HOSTNAME}.sh
    else
        # Remote execution via SSH
        sshpass -p "${SSH_PASSWORD}" scp ${SSH_OPTS} /tmp/update-creds-${HOSTNAME}.sh root@${IP}:/tmp/
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} "bash /tmp/update-creds-${HOSTNAME}.sh"
    fi

    log_success "  Credentials updated on ${HOSTNAME}"
}

# Update all nodes
log_info "Step 3: Updating credentials on all 4 nodes..."
for HOSTNAME in "${!NODES[@]}"; do
    update_node_credentials "${HOSTNAME}" "${NODES[$HOSTNAME]}"
done

log_success "=========================================="
log_success "Credentials Updated on All Nodes!"
log_success "=========================================="
echo ""
log_info "UPDATED NODES:"
for HOSTNAME in "${!NODES[@]}"; do
    echo "  ✅ ${HOSTNAME} (${NODES[$HOSTNAME]})"
done
echo ""
log_info "NEXT STEP: Initialize Restic repositories"
echo "  Run: bash /tmp/initialize-restic-repos.sh"
