#!/bin/bash

# Deploy Restic Backup System to All Nodes
# Each node backs up directly to Wasabi S3
# Backup time: 5AM Perth, Australia (AWST = UTC+8)

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

# Load Wasabi credentials
if [[ -f /backup/preserved/WASABI_CREDENTIALS.txt ]]; then
    source /backup/preserved/WASABI_CREDENTIALS.txt
else
    log_error "Wasabi credentials not found. Run shutdown-duplicati.sh first."
    exit 1
fi

log_info "=========================================="
log_info "Restic Deployment - All Nodes"
log_info "=========================================="

# Node configuration
declare -A NODES
NODES["ACDEV-VMI01"]="10.0.0.1"
NODES["ACDEV-VMI02D"]="10.0.0.2"
NODES["ACDEV-VMI03"]="10.0.0.3"
NODES["ACDEV-WG_GATEWAY"]="10.0.0.4"

# SSH credentials
SSH_PASSWORD="C0nnaught"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

# Generate strong encryption password for Restic
RESTIC_PASSWORD=$(openssl rand -base64 32)
echo "RESTIC_PASSWORD=\"${RESTIC_PASSWORD}\"" > /backup/preserved/RESTIC_PASSWORD.txt
chmod 600 /backup/preserved/RESTIC_PASSWORD.txt
log_success "Generated Restic encryption password"

# Function to install Restic on a node
install_restic_on_node() {
    local HOSTNAME=$1
    local IP=$2

    log_info "Installing Restic on ${HOSTNAME} (${IP})..."

    # Create installation script
    cat > /tmp/install-restic-${HOSTNAME}.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

# Install Restic
RESTIC_VERSION="0.17.3"

if command -v restic >/dev/null 2>&1; then
    echo "Restic already installed: $(restic version)"
else
    echo "Installing Restic ${RESTIC_VERSION}..."

    # Ensure bzip2 is installed
    if ! command -v bunzip2 >/dev/null 2>&1; then
        echo "Installing bzip2..."
        apt-get update -qq && apt-get install -y bzip2 >/dev/null 2>&1 || \
        yum install -y bzip2 >/dev/null 2>&1 || \
        echo "Warning: Could not install bzip2, trying alternative method..."
    fi

    # Download and install Restic
    cd /tmp
    if command -v bunzip2 >/dev/null 2>&1; then
        # Use bz2 format (smaller download)
        wget -q https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_amd64.bz2
        bunzip2 -f restic_${RESTIC_VERSION}_linux_amd64.bz2
        chmod +x restic_${RESTIC_VERSION}_linux_amd64
        mv restic_${RESTIC_VERSION}_linux_amd64 /usr/local/bin/restic
    else
        # Fallback: download and extract manually
        wget -q https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_amd64.bz2 -O restic.bz2
        # Manual bunzip2 using dd/gzip alternative
        python3 -c "import bz2; open('/tmp/restic', 'wb').write(bz2.decompress(open('/tmp/restic.bz2', 'rb').read()))" 2>/dev/null || \
        perl -MCompress::Raw::Bunzip2 -e 'open(my $in, "<", "/tmp/restic.bz2"); binmode($in); my $out = ""; my ($bz, $status) = Compress::Raw::Bunzip2->new(); while(read($in, my $buf, 4096)) { $status = $bz->bzinflate($buf, $out); } open(my $o, ">", "/tmp/restic"); binmode($o); print $o $out;' 2>/dev/null || \
        echo "Error: Cannot decompress without bzip2"
        chmod +x /tmp/restic
        mv /tmp/restic /usr/local/bin/restic
    fi

    # Verify installation
    restic version
    echo "✅ Restic installed successfully"
fi

# Create backup directories
mkdir -p /opt/backup/{scripts,logs,cache}
chmod 700 /opt/backup
chmod 700 /opt/backup/cache

echo "✅ Restic installation complete"
SCRIPT

    # Copy and execute on node
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        bash /tmp/install-restic-${HOSTNAME}.sh
    else
        # Remote execution via SSH with password
        sshpass -p "${SSH_PASSWORD}" scp ${SSH_OPTS} /tmp/install-restic-${HOSTNAME}.sh root@${IP}:/tmp/
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} "bash /tmp/install-restic-${HOSTNAME}.sh"
    fi

    log_success "  Restic installed on ${HOSTNAME}"
}

# Function to configure Restic on a node
configure_restic_on_node() {
    local HOSTNAME=$1
    local IP=$2

    log_info "Configuring Restic on ${HOSTNAME} (${IP})..."

    # Determine backup paths based on hostname
    local BACKUP_PATHS=""
    case "${HOSTNAME}" in
        "ACDEV-VMI01")
            BACKUP_PATHS="/opt/mcp /var/lib/postgresql /etc /root /var/log"
            ;;
        "ACDEV-VMI02D")
            BACKUP_PATHS="/opt /etc /root /backup/preserved /var/log"
            ;;
        "ACDEV-VMI03")
            BACKUP_PATHS="/opt/mcp /opt/thehive /var/lib/docker/volumes /etc /root /var/log"
            ;;
        "ACDEV-WG_GATEWAY")
            BACKUP_PATHS="/etc/wireguard /etc /root /var/log"
            ;;
    esac

    # Create configuration script
    cat > /tmp/configure-restic-${HOSTNAME}.sh << SCRIPT
#!/bin/bash
set -euo pipefail

# Create Restic environment file
cat > /opt/backup/restic-env.sh << 'ENV'
# Restic Configuration for ${HOSTNAME}
export RESTIC_REPOSITORY="s3:${WASABI_ENDPOINT}/${WASABI_BUCKET}/${HOSTNAME}"
export RESTIC_PASSWORD="${RESTIC_PASSWORD}"
export AWS_ACCESS_KEY_ID="${WASABI_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${WASABI_SECRET_KEY}"
export AWS_DEFAULT_REGION="${WASABI_REGION}"
export RESTIC_CACHE_DIR="/opt/backup/cache"

# Compression settings
export RESTIC_COMPRESSION="auto"
ENV

chmod 600 /opt/backup/restic-env.sh

# Create backup script
cat > /opt/backup/scripts/backup.sh << 'BACKUP'
#!/bin/bash
set -euo pipefail

# Load environment
source /opt/backup/restic-env.sh

# Backup paths
BACKUP_PATHS="${BACKUP_PATHS}"

# Log file
LOG_FILE="/opt/backup/logs/backup-\$(date +%Y%m%d-%H%M%S).log"

echo "==========================================" | tee -a \${LOG_FILE}
echo "Restic Backup - ${HOSTNAME}" | tee -a \${LOG_FILE}
echo "Started: \$(date)" | tee -a \${LOG_FILE}
echo "==========================================" | tee -a \${LOG_FILE}

# Run backup
restic backup \${BACKUP_PATHS} \\
    --verbose \\
    --exclude-caches \\
    --exclude='*.tmp' \\
    --exclude='*.cache' \\
    --exclude='*/cache/*' \\
    --exclude='*/tmp/*' \\
    --tag="${HOSTNAME}" \\
    --tag="daily" \\
    --tag="\$(date +%Y-%m-%d)" \\
    2>&1 | tee -a \${LOG_FILE}

BACKUP_STATUS=\${PIPESTATUS[0]}

# Prune old backups (GFS retention)
if [[ \${BACKUP_STATUS} -eq 0 ]]; then
    echo "" | tee -a \${LOG_FILE}
    echo "Pruning old backups..." | tee -a \${LOG_FILE}

    restic forget \\
        --keep-hourly 4 \\
        --keep-daily 7 \\
        --keep-weekly 4 \\
        --keep-monthly 3 \\
        --prune \\
        --tag="${HOSTNAME}" \\
        2>&1 | tee -a \${LOG_FILE}
fi

echo "" | tee -a \${LOG_FILE}
echo "Completed: \$(date)" | tee -a \${LOG_FILE}
echo "Status: \${BACKUP_STATUS}" | tee -a \${LOG_FILE}
echo "==========================================" | tee -a \${LOG_FILE}

# Keep only last 30 log files
cd /opt/backup/logs
ls -t backup-*.log | tail -n +31 | xargs -r rm

exit \${BACKUP_STATUS}
BACKUP

chmod 700 /opt/backup/scripts/backup.sh

# Create verification script
cat > /opt/backup/scripts/verify.sh << 'VERIFY'
#!/bin/bash
set -euo pipefail

# Load environment
source /opt/backup/restic-env.sh

echo "=========================================="
echo "Restic Repository Verification"
echo "Repository: \${RESTIC_REPOSITORY}"
echo "=========================================="

# Check repository health
restic check --read-data-subset=5%

# Show latest snapshots
echo ""
echo "Latest Snapshots:"
restic snapshots --latest 5

# Show repository statistics
echo ""
echo "Repository Statistics:"
restic stats --mode raw-data
VERIFY

chmod 700 /opt/backup/scripts/verify.sh

# Create restore helper script
cat > /opt/backup/scripts/restore.sh << 'RESTORE'
#!/bin/bash
set -euo pipefail

# Load environment
source /opt/backup/restic-env.sh

if [[ \$# -lt 2 ]]; then
    echo "Usage: \$0 <snapshot-id> <restore-path>"
    echo ""
    echo "Available snapshots:"
    restic snapshots
    exit 1
fi

SNAPSHOT_ID=\$1
RESTORE_PATH=\$2

echo "=========================================="
echo "Restic Restore"
echo "Snapshot: \${SNAPSHOT_ID}"
echo "Restore to: \${RESTORE_PATH}"
echo "=========================================="

mkdir -p "\${RESTORE_PATH}"

restic restore "\${SNAPSHOT_ID}" \\
    --target "\${RESTORE_PATH}" \\
    --verbose

echo "Restore complete!"
RESTORE

chmod 700 /opt/backup/scripts/restore.sh

echo "✅ Restic configuration complete"
SCRIPT

    # Copy and execute on node
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        bash /tmp/configure-restic-${HOSTNAME}.sh
    else
        # Remote execution via SSH with password
        sshpass -p "${SSH_PASSWORD}" scp ${SSH_OPTS} /tmp/configure-restic-${HOSTNAME}.sh root@${IP}:/tmp/
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} "bash /tmp/configure-restic-${HOSTNAME}.sh"
    fi

    log_success "  Restic configured on ${HOSTNAME}"
}

# Function to initialize Restic repository
initialize_restic_repo() {
    local HOSTNAME=$1
    local IP=$2

    log_info "Initializing Restic repository for ${HOSTNAME}..."

    # Create initialization script
    cat > /tmp/init-restic-${HOSTNAME}.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

# Load environment
source /opt/backup/restic-env.sh

# Check if repository exists
if restic snapshots >/dev/null 2>&1; then
    echo "Repository already initialized"
else
    echo "Initializing new repository..."
    restic init
    echo "✅ Repository initialized"
fi

# Show repository info
echo ""
echo "Repository: ${RESTIC_REPOSITORY}"
restic snapshots || echo "No snapshots yet"
SCRIPT

    # Copy and execute on node
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        bash /tmp/init-restic-${HOSTNAME}.sh
    else
        # Remote execution via SSH with password
        sshpass -p "${SSH_PASSWORD}" scp ${SSH_OPTS} /tmp/init-restic-${HOSTNAME}.sh root@${IP}:/tmp/
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} "bash /tmp/init-restic-${HOSTNAME}.sh"
    fi

    log_success "  Repository initialized for ${HOSTNAME}"
}

# Function to configure cron job (5AM Perth = 21:00 UTC previous day)
configure_cron() {
    local HOSTNAME=$1
    local IP=$2
    local CRON_TIME=$3  # e.g., "0 21 * * *" for 5AM Perth

    log_info "Configuring cron job on ${HOSTNAME} for ${CRON_TIME} UTC (5AM Perth)..."

    cat > /tmp/setup-cron-${HOSTNAME}.sh << SCRIPT
#!/bin/bash
set -euo pipefail

# Add backup cron job
CRON_LINE="${CRON_TIME} /opt/backup/scripts/backup.sh >> /opt/backup/logs/cron.log 2>&1"

# Remove existing backup cron jobs
crontab -l 2>/dev/null | grep -v '/opt/backup/scripts/backup.sh' | crontab - || true

# Add new cron job
(crontab -l 2>/dev/null || true; echo "\${CRON_LINE}") | crontab -

echo "✅ Cron job configured: ${CRON_TIME} UTC (5AM Perth)"
crontab -l | grep backup.sh
SCRIPT

    # Copy and execute on node
    if [[ "${IP}" == "10.0.0.2" ]]; then
        # Local execution (VMI02D)
        bash /tmp/setup-cron-${HOSTNAME}.sh
    else
        # Remote execution via SSH with password
        sshpass -p "${SSH_PASSWORD}" scp ${SSH_OPTS} /tmp/setup-cron-${HOSTNAME}.sh root@${IP}:/tmp/
        sshpass -p "${SSH_PASSWORD}" ssh ${SSH_OPTS} root@${IP} "bash /tmp/setup-cron-${HOSTNAME}.sh"
    fi

    log_success "  Cron job configured on ${HOSTNAME}"
}

# Main deployment loop
log_info "Step 1: Installing Restic on all nodes..."
for HOSTNAME in "${!NODES[@]}"; do
    install_restic_on_node "${HOSTNAME}" "${NODES[$HOSTNAME]}"
done

log_info "Step 2: Configuring Restic on all nodes..."
for HOSTNAME in "${!NODES[@]}"; do
    configure_restic_on_node "${HOSTNAME}" "${NODES[$HOSTNAME]}"
done

log_info "Step 3: Initializing Restic repositories..."
for HOSTNAME in "${!NODES[@]}"; do
    initialize_restic_repo "${HOSTNAME}" "${NODES[$HOSTNAME]}"
done

log_info "Step 4: Configuring cron jobs (5AM Perth time)..."
# Stagger backups by 5 minutes to avoid simultaneous execution
configure_cron "ACDEV-VMI01" "${NODES[ACDEV-VMI01]}" "0 21 * * *"      # 21:00 UTC = 5:00 AM Perth
configure_cron "ACDEV-VMI02D" "${NODES[ACDEV-VMI02D]}" "5 21 * * *"    # 21:05 UTC = 5:05 AM Perth
configure_cron "ACDEV-VMI03" "${NODES[ACDEV-VMI03]}" "10 21 * * *"     # 21:10 UTC = 5:10 AM Perth
configure_cron "ACDEV-WG_GATEWAY" "${NODES[ACDEV-WG_GATEWAY]}" "15 21 * * *"  # 21:15 UTC = 5:15 AM Perth

# Create summary document
cat > /backup/preserved/RESTIC_DEPLOYMENT_SUMMARY.txt << EOF
========================================
Restic Deployment Summary
========================================
Date: $(date)
Status: ✅ Deployed to all 4 nodes

NODES CONFIGURED:
-----------------
$(for HOSTNAME in "${!NODES[@]}"; do
    echo "  ✅ ${HOSTNAME} (${NODES[$HOSTNAME]})"
done)

BACKUP SCHEDULE (5AM Perth Time = 21:00 UTC):
----------------------------------------------
  ACDEV-VMI01: 21:00 UTC (5:00 AM Perth)
  ACDEV-VMI02D: 21:05 UTC (5:05 AM Perth)
  ACDEV-VMI03: 21:10 UTC (5:10 AM Perth)
  ACDEV-WG_GATEWAY: 21:15 UTC (5:15 AM Perth)

RETENTION POLICY (GFS):
-----------------------
  Hourly: Keep last 4 backups
  Daily: Keep last 7 backups
  Weekly: Keep last 4 backups
  Monthly: Keep last 3 backups

STORAGE:
--------
  Provider: Wasabi S3
  Bucket: ${WASABI_BUCKET}
  Region: ${WASABI_REGION}
  Endpoint: ${WASABI_ENDPOINT}

  Repositories:
    - s3:${WASABI_ENDPOINT}/${WASABI_BUCKET}/ACDEV-VMI01
    - s3:${WASABI_ENDPOINT}/${WASABI_BUCKET}/ACDEV-VMI02D
    - s3:${WASABI_ENDPOINT}/${WASABI_BUCKET}/ACDEV-VMI03
    - s3:${WASABI_ENDPOINT}/${WASABI_BUCKET}/ACDEV-WG_GATEWAY

ENCRYPTION:
-----------
  Password stored in: /backup/preserved/RESTIC_PASSWORD.txt
  ⚠️  CRITICAL: Keep this password safe! Cannot restore without it.

RESTIC COMMANDS:
----------------
  Manual backup:     /opt/backup/scripts/backup.sh
  Verify repository: /opt/backup/scripts/verify.sh
  Restore files:     /opt/backup/scripts/restore.sh <snapshot-id> <restore-path>

  List snapshots:    restic snapshots (after sourcing /opt/backup/restic-env.sh)
  Check repository:  restic check

FEATURES:
---------
  ✅ Compression: Automatic (Restic built-in)
  ✅ Deduplication: Block-level (Restic built-in)
  ✅ Encryption: AES-256 (Restic built-in)
  ✅ Incremental: Yes (Restic built-in)
  ✅ WAN Optimized: Yes (only changed blocks transferred)

LOGS:
-----
  Backup logs: /opt/backup/logs/backup-YYYYMMDD-HHMMSS.log
  Cron logs: /opt/backup/logs/cron.log

  View latest: tail -f /opt/backup/logs/cron.log

TESTING:
--------
  Test backup on each node:
    ssh root@10.0.0.1 '/opt/backup/scripts/backup.sh'
    ssh root@10.0.0.2 '/opt/backup/scripts/backup.sh'
    ssh root@10.0.0.3 '/opt/backup/scripts/backup.sh'
    ssh root@10.0.0.4 '/opt/backup/scripts/backup.sh'

========================================
Deployment Complete!
========================================
EOF

log_success "=========================================="
log_success "Restic Deployment Complete!"
log_success "=========================================="
echo ""
log_info "DEPLOYED TO:"
for HOSTNAME in "${!NODES[@]}"; do
    echo "  ✅ ${HOSTNAME} (${NODES[$HOSTNAME]})"
done
echo ""
log_info "BACKUP SCHEDULE:"
echo "  🕐 5:00 AM Perth (21:00 UTC): ACDEV-VMI01"
echo "  🕐 5:05 AM Perth (21:05 UTC): ACDEV-VMI02D"
echo "  🕐 5:10 AM Perth (21:10 UTC): ACDEV-VMI03"
echo "  🕐 5:15 AM Perth (21:15 UTC): ACDEV-WG_GATEWAY"
echo ""
log_info "ENCRYPTION PASSWORD:"
echo "  📁 Stored in: /backup/preserved/RESTIC_PASSWORD.txt"
echo "  ⚠️  CRITICAL: Backup this file! Cannot restore without it."
echo ""
log_info "SUMMARY DOCUMENT:"
echo "  📄 /backup/preserved/RESTIC_DEPLOYMENT_SUMMARY.txt"
echo ""
log_info "NEXT STEPS:"
echo "  1. Test first backup on each node"
echo "  2. Verify repositories are created in Wasabi"
echo "  3. Check logs after first automated backup tonight"
echo "  4. Test restore procedure"
echo ""
log_success "All nodes ready for automated backup at 5AM Perth time!"
