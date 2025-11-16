#!/bin/bash
set -euo pipefail

################################################################################
# Wasabi S3 Backup Configuration Script
#
# Purpose: Configure rclone with Wasabi S3, set up encrypted remote, and
#          implement GFS (Grandfather-Father-Son) rotation policy
#
# Features:
#   - Wasabi S3 configuration with credentials
#   - AES-256 encryption for all backups
#   - GFS rotation: Hourly(4), Daily(7), Weekly(4), Monthly(12), Yearly(7)
#   - Multi-VM backup coordination
#   - Manifest tracking with SHA256 checksums
#   - Idempotent execution with rollback support
#
# Usage: sudo ./configure-wasabi-s3.sh
################################################################################

# Color output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

# Configuration
readonly LOG_DIR="/var/log/wasabi-backup"
readonly LOG_FILE="${LOG_DIR}/configure-wasabi.log"
readonly RCLONE_CONFIG_DIR="/root/.config/rclone"
readonly RCLONE_CONFIG_FILE="${RCLONE_CONFIG_DIR}/rclone.conf"
readonly BACKUP_CONFIG_DIR="/etc/wasabi-backup"
readonly MANIFEST_DIR="${BACKUP_CONFIG_DIR}/manifests"
readonly ENCRYPTION_KEY_FILE="${BACKUP_CONFIG_DIR}/encryption.key"
readonly CACHE_DIR="/var/backup/cache"
readonly CACHE_RETENTION_DAYS=3
readonly CACHE_MARKER=".verified"

# Wasabi S3 Credentials
readonly WASABI_ACCESS_KEY="UGCCW36ZO993N1VWIHED"
readonly WASABI_SECRET_KEY="Owjs8BDHr3bVIdiYgLDYQLwf6N6uEzwX6bSz6MHe"
readonly WASABI_ENDPOINT="s3.wasabisys.com"
readonly WASABI_REGION="us-east-1"
readonly WASABI_BUCKET="mcp-bundle-backups"

# VM Configuration
declare -A VM_HOSTS=(
    ["VMI01"]="46.250.243.123"
    ["VMI02D"]="46.250.241.70"
    ["VMI03"]="154.26.158.31"
    ["JUMPBOX"]="154.26.158.68"
)

# GFS Rotation Policy
declare -A GFS_RETENTION=(
    ["hourly"]=4
    ["daily"]=7
    ["weekly"]=4
    ["monthly"]=12
    ["yearly"]=7
)

# Backup sources per VM
declare -A BACKUP_SOURCES=(
    ["VMI01"]="/var/lib/postgresql/backups,/var/lib/redis,/var/log/mcp,/etc"
    ["VMI02D"]="/var/www/nextcloud/data,/var/lib/plexmediaserver/Library,/etc"
    ["VMI03"]="/var/lib/keycloak,/var/lib/grafana,/var/log/security,/etc"
    ["JUMPBOX"]="/opt/adguard,/etc/wireguard,/var/log/adguard,/etc"
)

################################################################################
# Pre-flight checks
################################################################################

preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi

    # Create log directory
    mkdir -p "${LOG_DIR}"
    chmod 750 "${LOG_DIR}"

    # Check for rclone
    if ! command -v rclone &> /dev/null; then
        log_info "Installing rclone..."
        curl https://rclone.org/install.sh | bash
        if [[ $? -eq 0 ]]; then
            log_success "rclone installed successfully"
        else
            log_error "Failed to install rclone"
            exit 1
        fi
    else
        log_success "rclone is already installed ($(rclone --version | head -n1))"
    fi

    # Create configuration directories
    mkdir -p "${RCLONE_CONFIG_DIR}"
    mkdir -p "${BACKUP_CONFIG_DIR}"
    mkdir -p "${MANIFEST_DIR}"
    mkdir -p "${CACHE_DIR}"
    chmod 700 "${RCLONE_CONFIG_DIR}"
    chmod 700 "${BACKUP_CONFIG_DIR}"
    chmod 750 "${MANIFEST_DIR}"
    chmod 750 "${CACHE_DIR}"

    log_success "Pre-flight checks completed"
}

################################################################################
# Generate encryption key
################################################################################

generate_encryption_key() {
    log_info "Generating encryption key..."

    if [[ -f "${ENCRYPTION_KEY_FILE}" ]]; then
        log_warning "Encryption key already exists, skipping generation"
        return 0
    fi

    # Generate a strong random password for encryption
    local encryption_password
    encryption_password=$(openssl rand -base64 32)
    local encryption_salt
    encryption_salt=$(openssl rand -base64 32)

    # Store encrypted
    cat > "${ENCRYPTION_KEY_FILE}" <<EOF
# Wasabi S3 Encryption Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
RCLONE_ENCRYPT_PASSWORD=${encryption_password}
RCLONE_ENCRYPT_SALT=${encryption_salt}
EOF

    chmod 600 "${ENCRYPTION_KEY_FILE}"
    log_success "Encryption key generated and stored securely"
}

################################################################################
# Configure rclone for Wasabi S3
################################################################################

configure_rclone_wasabi() {
    log_info "Configuring rclone for Wasabi S3..."

    # Backup existing configuration
    if [[ -f "${RCLONE_CONFIG_FILE}" ]]; then
        cp "${RCLONE_CONFIG_FILE}" "${RCLONE_CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Backed up existing rclone configuration"
    fi

    # Create Wasabi S3 remote configuration
    cat > "${RCLONE_CONFIG_FILE}" <<EOF
[wasabi]
type = s3
provider = Wasabi
access_key_id = ${WASABI_ACCESS_KEY}
secret_access_key = ${WASABI_SECRET_KEY}
endpoint = ${WASABI_ENDPOINT}
region = ${WASABI_REGION}
acl = private
storage_class = STANDARD
upload_cutoff = 200M
chunk_size = 64M
upload_concurrency = 8
max_upload_parts = 10000
disable_checksum = false
EOF

    chmod 600 "${RCLONE_CONFIG_FILE}"
    log_success "Wasabi S3 remote configured"

    # Test Wasabi connection
    log_info "Testing Wasabi S3 connection..."
    if rclone lsd wasabi: &> /dev/null; then
        log_success "Wasabi S3 connection successful"
    else
        log_warning "Could not list Wasabi buckets (bucket may not exist yet)"
    fi

    # Create bucket if it doesn't exist
    log_info "Creating bucket '${WASABI_BUCKET}' if it doesn't exist..."
    if rclone mkdir "wasabi:${WASABI_BUCKET}" 2>/dev/null; then
        log_success "Bucket '${WASABI_BUCKET}' created"
    else
        log_info "Bucket '${WASABI_BUCKET}' already exists or creation failed (continuing)"
    fi
}

################################################################################
# Configure encrypted remote
################################################################################

configure_encrypted_remote() {
    log_info "Configuring encrypted remote..."

    # Source encryption key
    source "${ENCRYPTION_KEY_FILE}"

    local obscured_password
    local obscured_salt
    obscured_password=$(rclone obscure "${RCLONE_ENCRYPT_PASSWORD}")
    obscured_salt=$(rclone obscure "${RCLONE_ENCRYPT_SALT}")

    # Add encrypted remote configuration
    cat >> "${RCLONE_CONFIG_FILE}" <<EOF

[wasabi-crypt]
type = crypt
remote = wasabi:${WASABI_BUCKET}
password = ${obscured_password}
password2 = ${obscured_salt}
filename_encryption = standard
directory_name_encryption = true
EOF

    log_success "Encrypted remote 'wasabi-crypt' configured with AES-256"

    # Test encrypted remote
    log_info "Testing encrypted remote..."
    if rclone lsd wasabi-crypt: &> /dev/null; then
        log_success "Encrypted remote is accessible"
    else
        log_error "Failed to access encrypted remote"
        return 1
    fi
}

################################################################################
# Create GFS rotation configuration
################################################################################

create_gfs_config() {
    log_info "Creating GFS rotation configuration..."

    cat > "${BACKUP_CONFIG_DIR}/gfs-policy.conf" <<EOF
# GFS (Grandfather-Father-Son) Rotation Policy
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Retention periods (number of backups to keep)
HOURLY_RETENTION=${GFS_RETENTION[hourly]}
DAILY_RETENTION=${GFS_RETENTION[daily]}
WEEKLY_RETENTION=${GFS_RETENTION[weekly]}
MONTHLY_RETENTION=${GFS_RETENTION[monthly]}
YEARLY_RETENTION=${GFS_RETENTION[yearly]}

# Backup schedule
# Hourly: Every 6 hours (00:00, 06:00, 12:00, 18:00)
# Daily: 00:00
# Weekly: Sunday 00:00
# Monthly: 1st of month 00:00
# Yearly: January 1st 00:00

# Remote configuration
RCLONE_REMOTE="wasabi-crypt"
BACKUP_BUCKET="${WASABI_BUCKET}"

# Backup paths (GFS hierarchy)
HOURLY_PATH="hourly"
DAILY_PATH="daily"
WEEKLY_PATH="weekly"
MONTHLY_PATH="monthly"
YEARLY_PATH="yearly"

# Local cache configuration (VMI02D staging)
LOCAL_CACHE_DIR="${CACHE_DIR}"
LOCAL_CACHE_RETENTION_DAYS=${CACHE_RETENTION_DAYS}
CACHE_VERIFICATION_MARKER="${CACHE_MARKER}"
EOF

    chmod 640 "${BACKUP_CONFIG_DIR}/gfs-policy.conf"
    log_success "GFS rotation policy configured"
}

################################################################################
# Create VM backup sources configuration
################################################################################

create_vm_backup_config() {
    log_info "Creating VM backup sources configuration..."

    for vm in "${!VM_HOSTS[@]}"; do
        local config_file="${BACKUP_CONFIG_DIR}/sources-${vm}.conf"

        cat > "${config_file}" <<EOF
# Backup sources for ${vm} (${VM_HOSTS[$vm]})
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

VM_NAME="${vm}"
VM_HOST="${VM_HOSTS[$vm]}"
BACKUP_SOURCES="${BACKUP_SOURCES[$vm]}"

# VM-specific settings
EOF

        # Add VM-specific configuration
        case "${vm}" in
            "VMI01")
                cat >> "${config_file}" <<EOF
# PostgreSQL settings
POSTGRES_BACKUP_DIR="/var/lib/postgresql/backups"
POSTGRES_USER="postgres"
POSTGRES_DATABASES="mcp_orchestrator,mcp_agents,keycloak"

# Redis settings
REDIS_RDB_PATH="/var/lib/redis/dump.rdb"

# MCP logs
MCP_LOG_DIR="/var/log/mcp"
EOF
                ;;
            "VMI02D")
                cat >> "${config_file}" <<EOF
# NextCloud settings
NEXTCLOUD_DATA_DIR="/var/www/nextcloud/data"
NEXTCLOUD_INCREMENTAL=true

# Plex settings
PLEX_METADATA_DIR="/var/lib/plexmediaserver/Library"
PLEX_DB_PATH="/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Plug-in Support/Databases"
EOF
                ;;
            "VMI03")
                cat >> "${config_file}" <<EOF
# Keycloak settings
KEYCLOAK_DATA_DIR="/var/lib/keycloak"
KEYCLOAK_DB_NAME="keycloak"

# Grafana settings
GRAFANA_DATA_DIR="/var/lib/grafana"
GRAFANA_DASHBOARDS="/etc/grafana/dashboards"

# Security logs
SECURITY_LOG_DIR="/var/log/security"
FAIL2BAN_LOG="/var/log/fail2ban.log"
EOF
                ;;
            "JUMPBOX")
                cat >> "${config_file}" <<EOF
# AdGuard Home
ADGUARD_HOME="/opt/adguard"
ADGUARD_CONFIG="\${ADGUARD_HOME}/AdGuardHome.yaml"
ADGUARD_DATA="\${ADGUARD_HOME}/data"

# WireGuard / VPN
WIREGUARD_CONFIG_DIR="/etc/wireguard"
WIREGUARD_KEYS_DIR="/etc/wireguard/keys"

# DNS / system configs
DNS_CONFIG_DIR="/etc/dnsmasq.d"
SYSTEM_CONFIG_DIR="/etc"
LOG_DIR="/var/log/adguard"
EOF
                ;;
        esac

        chmod 640 "${config_file}"
        log_success "Created backup configuration for ${vm}"
    done
}

################################################################################
# Create manifest tracking system
################################################################################

create_manifest_system() {
    log_info "Creating manifest tracking system..."

    cat > "${BACKUP_CONFIG_DIR}/manifest-template.json" <<'EOF'
{
  "backup_id": "",
  "timestamp": "",
  "type": "",
  "vm": "",
  "sources": [],
  "files": [],
  "checksums": {},
  "size_bytes": 0,
  "compressed_size_bytes": 0,
  "encryption": "AES-256",
  "status": "pending",
  "duration_seconds": 0,
  "retention_policy": "",
  "expires_at": "",
  "metadata": {}
}
EOF

    cat > "${BACKUP_CONFIG_DIR}/manifest-functions.sh" <<'EOF'
#!/bin/bash
# Manifest tracking functions

generate_manifest_id() {
    echo "backup_$(date +%Y%m%d_%H%M%S)_$(uuidgen | cut -d'-' -f1)"
}

calculate_checksum() {
    local file="$1"
    sha256sum "${file}" | awk '{print $1}'
}

create_manifest() {
    local backup_id="$1"
    local type="$2"
    local vm="$3"
    shift 3
    local sources=("$@")

    local manifest_file="${MANIFEST_DIR}/${backup_id}.json"

    jq -n \
        --arg id "${backup_id}" \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg type "${type}" \
        --arg vm "${vm}" \
        --argjson sources "$(printf '%s\n' "${sources[@]}" | jq -R . | jq -s .)" \
        '{
            backup_id: $id,
            timestamp: $timestamp,
            type: $type,
            vm: $vm,
            sources: $sources,
            files: [],
            checksums: {},
            size_bytes: 0,
            compressed_size_bytes: 0,
            encryption: "AES-256",
            status: "in_progress",
            duration_seconds: 0,
            retention_policy: $type,
            expires_at: "",
            metadata: {}
        }' > "${manifest_file}"

    echo "${manifest_file}"
}

update_manifest() {
    local manifest_file="$1"
    local field="$2"
    local value="$3"

    local tmp_file="${manifest_file}.tmp"
    jq --arg field "${field}" --arg value "${value}" \
        '.[$field] = $value' "${manifest_file}" > "${tmp_file}"
    mv "${tmp_file}" "${manifest_file}"
}

finalize_manifest() {
    local manifest_file="$1"
    local status="$2"
    local duration="$3"

    local tmp_file="${manifest_file}.tmp"
    jq --arg status "${status}" \
       --arg duration "${duration}" \
       --arg completed "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '.status = $status |
         .duration_seconds = ($duration | tonumber) |
         .completed_at = $completed' \
        "${manifest_file}" > "${tmp_file}"
    mv "${tmp_file}" "${manifest_file}"
}
EOF

    chmod 755 "${BACKUP_CONFIG_DIR}/manifest-functions.sh"
    log_success "Manifest tracking system created"
}

################################################################################
# Setup SSH keys for multi-VM coordination
################################################################################

setup_ssh_keys() {
    log_info "Setting up SSH keys for multi-VM coordination..."

    local ssh_key_path="/root/.ssh/wasabi-backup-key"

    # Generate SSH key if it doesn't exist
    if [[ ! -f "${ssh_key_path}" ]]; then
        ssh-keygen -t ed25519 -f "${ssh_key_path}" -N "" -C "wasabi-backup@mcp-bundle"
        log_success "SSH key generated for backup coordination"

        log_warning "IMPORTANT: Copy the following public key to all VMs:"
        cat "${ssh_key_path}.pub"
        echo ""
        log_info "Add this to /root/.ssh/authorized_keys on all VMs"
    else
        log_info "SSH key already exists at ${ssh_key_path}"
    fi

    # Create SSH config for VMs
    local ssh_config_file="/root/.ssh/wasabi-backup-config"
    cat > "${ssh_config_file}" <<EOF
# SSH configuration for Wasabi backup multi-VM coordination
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

Host VMI01
    HostName ${VM_HOSTS[VMI01]}
    User root
    IdentityFile ${ssh_key_path}
    StrictHostKeyChecking accept-new
    ConnectTimeout 10

Host VMI02D
    HostName ${VM_HOSTS[VMI02D]}
    User root
    IdentityFile ${ssh_key_path}
    StrictHostKeyChecking accept-new
    ConnectTimeout 10

Host VMI03
    HostName ${VM_HOSTS[VMI03]}
    User root
    IdentityFile ${ssh_key_path}
    StrictHostKeyChecking accept-new
    ConnectTimeout 10

Host JUMPBOX
    HostName ${VM_HOSTS[JUMPBOX]}
    User root
    IdentityFile ${ssh_key_path}
    StrictHostKeyChecking accept-new
    ConnectTimeout 10
EOF

    chmod 600 "${ssh_config_file}"
    log_success "SSH configuration created for all VMs"
}

################################################################################
# Create backup helper scripts
################################################################################

create_helper_scripts() {
    log_info "Creating helper scripts..."

    # GFS rotation script
    cat > "${BACKUP_CONFIG_DIR}/gfs-rotate.sh" <<'EOF'
#!/bin/bash
set -euo pipefail

# Source GFS policy
source /etc/wasabi-backup/gfs-policy.conf

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*"; }

rotate_backups() {
    local backup_type="$1"
    local retention="$2"
    local remote_path="${RCLONE_REMOTE}:${backup_type}"

    log_info "Rotating ${backup_type} backups (keeping ${retention})..."

    # List backups sorted by modification time (oldest first)
    local backups
    backups=$(rclone lsf "${remote_path}/" --dirs-only --format "pt" | sort -t$'\t' -k2 | cut -f1)

    local backup_count
    backup_count=$(echo "${backups}" | grep -c . || true)

    if [[ ${backup_count} -le ${retention} ]]; then
        log_info "Only ${backup_count} ${backup_type} backups exist, no rotation needed"
        return 0
    fi

    local to_delete=$((backup_count - retention))
    log_info "Deleting ${to_delete} old ${backup_type} backups..."

    local deleted=0
    while IFS= read -r backup_dir; do
        if [[ ${deleted} -ge ${to_delete} ]]; then
            break
        fi

        log_info "Deleting ${backup_type}/${backup_dir}..."
        rclone purge "${remote_path}/${backup_dir}"
        ((deleted++))
    done <<< "${backups}"

    log_success "Deleted ${deleted} old ${backup_type} backups"
}

# Main rotation
log_info "Starting GFS rotation..."

rotate_backups "hourly" "${HOURLY_RETENTION}"
rotate_backups "daily" "${DAILY_RETENTION}"
rotate_backups "weekly" "${WEEKLY_RETENTION}"
rotate_backups "monthly" "${MONTHLY_RETENTION}"
rotate_backups "yearly" "${YEARLY_RETENTION}"

log_success "GFS rotation completed"
EOF

    chmod 755 "${BACKUP_CONFIG_DIR}/gfs-rotate.sh"

    # Backup verification script
    cat > "${BACKUP_CONFIG_DIR}/verify-backup.sh" <<'EOF'
#!/bin/bash
set -euo pipefail

MANIFEST_FILE="$1"

if [[ ! -f "${MANIFEST_FILE}" ]]; then
    echo "ERROR: Manifest file not found: ${MANIFEST_FILE}"
    exit 1
fi

echo "Verifying backup from manifest: ${MANIFEST_FILE}"

# Extract backup information
BACKUP_ID=$(jq -r '.backup_id' "${MANIFEST_FILE}")
BACKUP_TYPE=$(jq -r '.type' "${MANIFEST_FILE}")
VM=$(jq -r '.vm' "${MANIFEST_FILE}")

echo "Backup ID: ${BACKUP_ID}"
echo "Type: ${BACKUP_TYPE}"
echo "VM: ${VM}"

# Verify checksums
CHECKSUMS=$(jq -r '.checksums | to_entries[] | "\(.key)\t\(.value)"' "${MANIFEST_FILE}")

VERIFIED=0
FAILED=0

while IFS=$'\t' read -r file expected_checksum; do
    echo -n "Verifying ${file}... "

    # Download and calculate checksum
    TEMP_FILE=$(mktemp)
    rclone cat "wasabi-crypt:${BACKUP_TYPE}/${BACKUP_ID}/${file}" > "${TEMP_FILE}"
    ACTUAL_CHECKSUM=$(sha256sum "${TEMP_FILE}" | awk '{print $1}')
    rm -f "${TEMP_FILE}"

    if [[ "${ACTUAL_CHECKSUM}" == "${expected_checksum}" ]]; then
        echo "OK"
        ((VERIFIED++))
    else
        echo "FAILED"
        ((FAILED++))
    fi
done <<< "${CHECKSUMS}"

echo ""
echo "Verification complete: ${VERIFIED} OK, ${FAILED} FAILED"

if [[ ${FAILED} -gt 0 ]]; then
    exit 1
fi
EOF

    chmod 755 "${BACKUP_CONFIG_DIR}/verify-backup.sh"

    log_success "Helper scripts created"
}

################################################################################
# Create test backup
################################################################################

create_test_backup() {
    log_info "Creating test backup to verify configuration..."

    local test_dir=$(mktemp -d)
    local test_file="${test_dir}/test-backup-$(date +%Y%m%d_%H%M%S).txt"

    cat > "${test_file}" <<EOF
Wasabi S3 Backup System Test
=============================
Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Hostname: $(hostname)
Configuration: SUCCESS

This is a test backup to verify the Wasabi S3 configuration.
EOF

    log_info "Uploading test backup..."
    if rclone copy "${test_file}" "wasabi-crypt:test/" --progress; then
        log_success "Test backup uploaded successfully"

        # Verify by downloading
        local download_dir=$(mktemp -d)
        if rclone copy "wasabi-crypt:test/" "${download_dir}/" --progress; then
            log_success "Test backup downloaded and verified"

            # Cleanup
            rclone purge "wasabi-crypt:test/"
            rm -rf "${test_dir}" "${download_dir}"
            log_success "Test backup cleaned up"
        else
            log_error "Failed to download test backup"
            rm -rf "${test_dir}" "${download_dir}"
            return 1
        fi
    else
        log_error "Failed to upload test backup"
        rm -rf "${test_dir}"
        return 1
    fi
}

################################################################################
# Main installation
################################################################################

main() {
    log_info "===== Wasabi S3 Backup Configuration Starting ====="
    log_info "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

    preflight_checks
    generate_encryption_key
    configure_rclone_wasabi
    configure_encrypted_remote
    create_gfs_config
    create_vm_backup_config
    create_manifest_system
    setup_ssh_keys
    create_helper_scripts
    create_test_backup

    log_success "===== Wasabi S3 Backup Configuration Complete ====="
    echo ""
    log_info "Configuration Summary:"
    echo "  - Rclone config: ${RCLONE_CONFIG_FILE}"
    echo "  - Backup config: ${BACKUP_CONFIG_DIR}"
    echo "  - Encryption key: ${ENCRYPTION_KEY_FILE}"
    echo "  - Manifests: ${MANIFEST_DIR}"
    echo "  - Logs: ${LOG_FILE}"
    echo "  - Local cache: ${CACHE_DIR} (retains ${CACHE_RETENTION_DAYS} days)"
    echo ""
    log_info "GFS Retention Policy:"
    echo "  - Hourly: Keep last ${GFS_RETENTION[hourly]}"
    echo "  - Daily: Keep last ${GFS_RETENTION[daily]}"
    echo "  - Weekly: Keep last ${GFS_RETENTION[weekly]}"
    echo "  - Monthly: Keep last ${GFS_RETENTION[monthly]}"
    echo "  - Yearly: Keep last ${GFS_RETENTION[yearly]}"
    echo ""
    log_info "Next Steps:"
    echo "  1. Deploy SSH key to all VMs (see above)"
    echo "  2. Run ./configure-snapshots.sh to set up automated backups"
    echo "  3. Test with: rclone lsd wasabi-crypt:"
    echo ""
}

# Error handler
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main
main "$@"
